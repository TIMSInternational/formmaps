using FormMaps.Application.Auth;
using FormMaps.Application.Graduation;
using FormMaps.Infrastructure.Data;
using FormMaps.Infrastructure.Graduation;
using Npgsql;

namespace FormMaps.IntegrationTests.Graduation;

/// <summary>
/// Real-DB tests for <see cref="CounselorGraduationRepository"/> (issue #55 remainder), under the PRODUCTION
/// RLS policies as a NOSUPERUSER NOBYPASSRLS login.
///
/// <para>Two things here are worth more than the rest of the file put together:</para>
/// <list type="number">
/// <item>the ASSIGNMENT GATE, whose adversary is a SAME-SCHOOL counselor who is assigned to somebody else —
/// the <c>counselor_student_assignments</c> policy admits every row in the school, so
/// <c>"counselorId" = @counselor</c> is the whole gate;</item>
/// <item>formmaps#122/#130: approve must carry EACH ITEM'S OWN <c>gradeLevel</c> into
/// <c>student_course_plans</c>. It is correct-by-accident today because the materialization filter keeps only
/// current-grade items, so the test is written to prove the COLUMN is written, not merely that the resulting
/// number happens to equal the student's grade.</item>
/// </list>
/// </summary>
public sealed class CounselorGraduationRepositoryTests(GraduationPlanDatabaseFixture fixture)
    : IClassFixture<GraduationPlanDatabaseFixture>, IAsyncLifetime
{
    private const string School = "school-1";
    private const string OtherSchool = "school-2";
    private const string Student = "stu-1";
    private const string Counselor = "cou-1";
    private const string OtherCounselor = "cou-2";
    private const string Year = "ay-1";

    private NpgsqlDataSource _dataSource = null!;

    public async Task InitializeAsync()
    {
        await fixture.ResetAsync();
        _dataSource = NpgsqlDataSource.Create(fixture.AppConnectionString);
    }

    public async Task DisposeAsync() => await _dataSource.DisposeAsync();

    // ---------------------------------------------------------------- the assignment gate

    [Fact]
    public async Task An_active_assignment_passes_the_gate()
    {
        await Roster();
        await fixture.SeedAssignmentAsync("a-1", Counselor, Student);

        Assert.True(await Repository().IsAssignedAsync(Ctx(Counselor, School), Counselor, Student));
    }

    [Fact]
    public async Task An_inactive_assignment_does_not_pass_the_gate()
    {
        await Roster();
        await fixture.SeedAssignmentAsync("a-1", Counselor, Student, isActive: false);

        Assert.False(await Repository().IsAssignedAsync(Ctx(Counselor, School), Counselor, Student));
    }

    /// <summary>
    /// SABOTAGE RECORD: delete <c>"counselorId" = @counselor AND</c> from IsAssignedAsync and this goes red.
    /// The student is in the caller's own school, so the counselor_student_assignments policy (003-fk-users.sql
    /// :508 — an owner-school EXISTS over users) admits a COLLEAGUE'S assignment row outright. Without the
    /// predicate any counselor at the school passes the gate for any assigned student, which is the caseload
    /// IDOR the 404 exists to prevent.
    /// </summary>
    [Fact]
    public async Task A_colleagues_assignment_does_not_pass_this_counselors_gate()
    {
        await Roster();
        await fixture.SeedUserAsync(OtherCounselor, School, "Counselor", "Other");
        await fixture.SeedAssignmentAsync("a-1", OtherCounselor, Student);

        Assert.False(await Repository().IsAssignedAsync(Ctx(Counselor, School), Counselor, Student));

        // The row genuinely exists and IS visible to this session — proving the false above is the app-layer
        // predicate doing the work, not RLS hiding the row.
        Assert.Equal(1, await fixture.ScalarAsync<long>(
            """SELECT COUNT(*) FROM "counselor_student_assignments" WHERE "studentId" = @s""", ("s", Student)));
    }

    // ---------------------------------------------------------------- GET

    [Fact]
    public async Task Get_returns_the_plan_and_an_active_target_projection()
    {
        await Roster();
        await fixture.SeedPlanAsync("p-1", Student, School, "proposed");
        await fixture.SeedTargetAsync("t-1", Student, School, "Nursing", "biology-premed", "open",
            universityName: "State U");

        var view = await Repository().GetPlanAsync(Ctx(Counselor, School), Student);

        Assert.Equal("p-1", view.Plan!.Id);
        Assert.Equal("State U", view.Target!.UniversityName);
        Assert.Equal("Nursing", view.Target.Major);
        Assert.Equal("biology-premed:open", view.Target.TemplateKey);
    }

    /// <summary>An INACTIVE target projects as null, not as an object with the stale values.</summary>
    [Fact]
    public async Task An_inactive_target_projects_as_null()
    {
        await Roster();
        await fixture.SeedTargetAsync("t-1", Student, School, isActive: false);

        var view = await Repository().GetPlanAsync(Ctx(Counselor, School), Student);

        Assert.Null(view.Plan);
        Assert.Null(view.Target);
    }

    // ---------------------------------------------------------------- review: reject

    [Fact]
    public async Task Reject_stores_the_note_and_notifies_the_student_only()
    {
        await Roster();
        await fixture.SeedPlanAsync("p-1", Student, School, "proposed");
        await fixture.SeedParentLinkAsync("pl-1", Student, "par-1");

        var result = await Repository().ReviewPlanAsync(
            Ctx(Counselor, School), Counselor, Student, "rejected", "Add more math");

        Assert.Equal(ReviewPlanOutcome.Reviewed, result.Outcome);
        Assert.Equal("rejected", result.Plan!.Status);
        Assert.Equal("Add more math", result.Plan.ReviewNote);
        Assert.Equal(Counselor, await fixture.ScalarAsync<string>(
            """SELECT "reviewedBy" FROM "graduation_plans" WHERE "id" = 'p-1'"""));

        // The reject arm notifies the STUDENT and nobody else — the parent fan-out is on approve only.
        Assert.Equal(1, await fixture.ScalarAsync<long>("""SELECT COUNT(*) FROM "notifications" """));
        Assert.Equal(Student, await fixture.ScalarAsync<string>("""SELECT "userId" FROM "notifications" """));
        Assert.Equal("""Your counselor requested changes: "Add more math" """.TrimEnd(),
            await fixture.ScalarAsync<string>("""SELECT "message" FROM "notifications" """));
    }

    [Fact]
    public async Task Review_of_a_plan_that_is_not_proposed_reports_no_proposed_plan()
    {
        await Roster();
        await fixture.SeedPlanAsync("p-1", Student, School, "draft");

        var result = await Repository().ReviewPlanAsync(
            Ctx(Counselor, School), Counselor, Student, "approved", null);

        Assert.Equal(ReviewPlanOutcome.NoProposedPlan, result.Outcome);
        Assert.Equal("draft", await fixture.ScalarAsync<string>(
            """SELECT "status" FROM "graduation_plans" WHERE "id" = 'p-1'"""));
    }

    // ---------------------------------------------------------------- review: approve

    /// <summary>
    /// formmaps#122/#130 — THE REGRESSION TEST FOR THIS LANE. Every materialized row must carry the PLAN
    /// ITEM's gradeLevel, and the assertion is on the COLUMN being non-null, not merely on it equalling the
    /// student's grade. Leaving it NULL passes a "does the number look right?" check today (the filter keeps
    /// only current-grade items and the reader falls back to the student's grade) and silently re-buckets
    /// every row the moment that filter widens to a future year.
    /// </summary>
    [Fact]
    public async Task Approve_materializes_only_current_grade_items_and_carries_their_own_gradeLevel()
    {
        await Roster(gradeLevel: 10);
        await fixture.SeedAcademicYearAsync(Year, School);
        await fixture.SeedPlanAsync("p-1", Student, School, "proposed");
        await fixture.SeedPlanItemAsync("i-now", "p-1", School, "c-now", 10, term: "Fall");
        await fixture.SeedPlanItemAsync("i-later", "p-1", School, "c-later", 11);
        await fixture.SeedPlanItemAsync("i-dead", "p-1", School, "c-dead", 10, isActive: false);

        var result = await Repository().ReviewPlanAsync(
            Ctx(Counselor, School), Counselor, Student, "approved", null);

        Assert.Equal(ReviewPlanOutcome.Reviewed, result.Outcome);
        Assert.Equal(1, result.MaterializedCount);
        Assert.Equal("approved", result.Plan!.Status);

        Assert.Equal(1, await fixture.ScalarAsync<long>("""SELECT COUNT(*) FROM "student_course_plans" """));
        Assert.Equal("c-now", await fixture.ScalarAsync<string>(
            """SELECT "courseId" FROM "student_course_plans" """));

        // #122: the column is WRITTEN, not left to the reader's fallback.
        Assert.Equal(10, await fixture.ScalarAsync<int>(
            """SELECT "gradeLevel" FROM "student_course_plans" WHERE "courseId" = 'c-now'"""));
        Assert.Equal(0, await fixture.ScalarAsync<long>(
            """SELECT COUNT(*) FROM "student_course_plans" WHERE "gradeLevel" IS NULL"""));

        Assert.Equal("Fall", await fixture.ScalarAsync<string>("""SELECT "term" FROM "student_course_plans" """));
        Assert.Equal("planned", await fixture.ScalarAsync<string>("""SELECT "status" FROM "student_course_plans" """));
        Assert.Equal(Counselor, await fixture.ScalarAsync<string>(
            """SELECT "createdBy" FROM "student_course_plans" """));
        Assert.Equal(Year, await fixture.ScalarAsync<string>(
            """SELECT "academicYearId" FROM "student_course_plans" """));
    }

    /// <summary>A student with NO gradeLevel is treated as grade 9 (`?? 9`), so only grade-9 items land.</summary>
    [Fact]
    public async Task A_student_with_no_grade_level_materializes_grade_nine_items()
    {
        await Roster(gradeLevel: null);
        await fixture.SeedAcademicYearAsync(Year, School);
        await fixture.SeedPlanAsync("p-1", Student, School, "proposed");
        await fixture.SeedPlanItemAsync("i-9", "p-1", School, "c-9", 9);
        await fixture.SeedPlanItemAsync("i-12", "p-1", School, "c-12", 12);

        var result = await Repository().ReviewPlanAsync(
            Ctx(Counselor, School), Counselor, Student, "approved", null);

        Assert.Equal(1, result.MaterializedCount);
        Assert.Equal(9, await fixture.ScalarAsync<int>("""SELECT "gradeLevel" FROM "student_course_plans" """));
    }

    /// <summary>An already-planned course is skipped — the dedupe is by courseId over ACTIVE rows.</summary>
    [Fact]
    public async Task Already_planned_courses_are_not_materialized_twice()
    {
        await Roster(gradeLevel: 10);
        await fixture.SeedAcademicYearAsync(Year, School);
        await fixture.SeedCoursePlanAsync("scp-1", Student, School, Year, "c-now", gradeLevel: 10);
        await fixture.SeedPlanAsync("p-1", Student, School, "proposed");
        await fixture.SeedPlanItemAsync("i-now", "p-1", School, "c-now", 10);

        var result = await Repository().ReviewPlanAsync(
            Ctx(Counselor, School), Counselor, Student, "approved", null);

        Assert.Equal(0, result.MaterializedCount);
        Assert.Equal(1, await fixture.ScalarAsync<long>("""SELECT COUNT(*) FROM "student_course_plans" """));
        Assert.Equal("approved", result.Plan!.Status); // the plan is still approved
    }

    /// <summary>
    /// No current academic year is PlanError("NO_CURRENT_YEAR"), thrown BEFORE the transaction — so the plan
    /// stays `proposed` and nothing is materialized. A port that wrote first and checked second would leave a
    /// half-approved plan behind on a 422.
    /// </summary>
    [Fact]
    public async Task Approve_without_a_current_year_writes_nothing_and_leaves_the_plan_proposed()
    {
        await Roster(gradeLevel: 10);
        await fixture.SeedAcademicYearAsync(Year, School, isCurrent: false);
        await fixture.SeedPlanAsync("p-1", Student, School, "proposed");
        await fixture.SeedPlanItemAsync("i-now", "p-1", School, "c-now", 10);

        var result = await Repository().ReviewPlanAsync(
            Ctx(Counselor, School), Counselor, Student, "approved", null);

        Assert.Equal(ReviewPlanOutcome.NoCurrentYear, result.Outcome);
        Assert.Equal("proposed", await fixture.ScalarAsync<string>(
            """SELECT "status" FROM "graduation_plans" WHERE "id" = 'p-1'"""));
        Assert.Equal(0, await fixture.ScalarAsync<long>("""SELECT COUNT(*) FROM "student_course_plans" """));
        Assert.Equal(0, await fixture.ScalarAsync<long>("""SELECT COUNT(*) FROM "notifications" """));
    }

    /// <summary>
    /// An approve with no note stores SQL NULL, not the empty string — `(note || "").slice(0, 1000) || null`.
    /// The reject arm cannot reach this branch because the route requires a non-blank note there.
    /// </summary>
    [Fact]
    public async Task Approve_with_a_blank_note_stores_null()
    {
        await Roster(gradeLevel: 10);
        await fixture.SeedAcademicYearAsync(Year, School);
        await fixture.SeedPlanAsync("p-1", Student, School, "proposed");

        await Repository().ReviewPlanAsync(Ctx(Counselor, School), Counselor, Student, "approved", "   ".Trim());

        Assert.Null(await fixture.ScalarAsync<string>(
            """SELECT "reviewNote" FROM "graduation_plans" WHERE "id" = 'p-1'"""));
    }

    /// <summary>
    /// The approve fan-out reaches the student AND every accepted, active, linked parent. Parents are
    /// SCHOOL-LESS, which is why notifyAll runs on a System session: under the counselor's own Identity
    /// session the notifications policy would refuse the parent row and legacy's catch would swallow it —
    /// exactly the silent no-op planWorkflowService.ts:20-27 warns about. Asserted on the ADMIN connection so
    /// "written" cannot be confused with "visible".
    /// </summary>
    [Fact]
    public async Task Approve_notifies_the_student_and_every_accepted_active_parent()
    {
        await Roster(gradeLevel: 10, studentName: "Ada Lovelace");
        await fixture.SeedAcademicYearAsync(Year, School);
        await fixture.SeedUserAsync("par-1", null, "Parent", "Parent One");
        await fixture.SeedPlanAsync("p-1", Student, School, "proposed");
        await fixture.SeedPlanItemAsync("i-now", "p-1", School, "c-now", 10);
        await fixture.SeedParentLinkAsync("pl-1", Student, "par-1");
        await fixture.SeedParentLinkAsync("pl-2", Student, "par-2", isAccepted: false);
        await fixture.SeedParentLinkAsync("pl-3", Student, "par-3", isActive: false);
        await fixture.SeedParentLinkAsync("pl-4", Student, null);

        await Repository().ReviewPlanAsync(Ctx(Counselor, School), Counselor, Student, "approved", null);

        Assert.Equal(2, await fixture.ScalarAsync<long>("""SELECT COUNT(*) FROM "notifications" """));
        Assert.Equal("Your counselor approved your plan — 1 course(s) were added to this year's schedule.",
            await fixture.ScalarAsync<string>("""SELECT "message" FROM "notifications" WHERE "userId" = 'stu-1'"""));
        Assert.Equal("Ada Lovelace's graduation plan was approved by their counselor.",
            await fixture.ScalarAsync<string>("""SELECT "message" FROM "notifications" WHERE "userId" = 'par-1'"""));
        Assert.Equal("Graduation plan approved \U0001F393",
            await fixture.ScalarAsync<string>("""SELECT "title" FROM "notifications" WHERE "userId" = 'stu-1'"""));
    }

    /// <summary>
    /// SABOTAGE RECORD: delete <c>AND "studentId" = @sid</c> from the proposed-plan lookup in ReviewPlanAsync
    /// and this goes red — the OTHER student's plan is in the same school, so RLS admits it and this counselor
    /// (assigned only to Student) would approve a stranger's plan through their own student's URL.
    /// </summary>
    [Fact]
    public async Task Review_cannot_reach_another_students_proposed_plan()
    {
        await Roster(gradeLevel: 10);
        await fixture.SeedAcademicYearAsync(Year, School);
        await fixture.SeedUserAsync("stu-9", School, gradeLevel: 10);
        await fixture.SeedPlanAsync("p-other", "stu-9", School, "proposed");

        var result = await Repository().ReviewPlanAsync(
            Ctx(Counselor, School), Counselor, Student, "approved", null);

        Assert.Equal(ReviewPlanOutcome.NoProposedPlan, result.Outcome);
        Assert.Equal("proposed", await fixture.ScalarAsync<string>(
            """SELECT "status" FROM "graduation_plans" WHERE "id" = 'p-other'"""));
    }

    /// <summary>
    /// Cross-SCHOOL is the arm where RLS itself is the defence: a counselor in another school cannot see the
    /// plan at all, so the review reports no proposed plan even with the app-layer predicate intact.
    /// </summary>
    [Fact]
    public async Task A_cross_school_counselor_sees_no_plan_at_all()
    {
        await Roster(gradeLevel: 10);
        await fixture.SeedAcademicYearAsync(Year, School);
        await fixture.SeedPlanAsync("p-1", Student, School, "proposed");

        var result = await Repository().ReviewPlanAsync(
            Ctx(Counselor, OtherSchool), Counselor, Student, "approved", null);

        Assert.Equal(ReviewPlanOutcome.NoProposedPlan, result.Outcome);
        Assert.Equal("proposed", await fixture.ScalarAsync<string>(
            """SELECT "status" FROM "graduation_plans" WHERE "id" = 'p-1'"""));
    }

    // ---------------------------------------------------------------- helpers

    /// <summary>
    /// Users only — NO assignment. The repository's GET and review paths do not consult the assignment at all
    /// (the endpoint gates before calling them), so seeding one here would be noise; the three gate tests seed
    /// exactly the assignment they are about.
    /// </summary>
    private async Task Roster(int? gradeLevel = 10, string studentName = "Student")
    {
        await fixture.SeedUserAsync(Student, School, name: studentName, gradeLevel: gradeLevel);
        await fixture.SeedUserAsync(Counselor, School, "Counselor", "Counselor One");
    }

    private CounselorGraduationRepository Repository()
    {
        var factory = new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier());
        return new CounselorGraduationRepository(
            factory,
            new GraduationNotificationWriter(factory, new GraduationPlanRepositoryTests.NullLogger()));
    }

    private static RequestContext Ctx(string userId, string? schoolId) =>
        RequestContext.Authenticated(
            new RequestActor(userId, "counselor", $"{userId}@e.st", "Counselor"),
            schoolId: schoolId,
            permissions: Array.Empty<string>(),
            tokenSource: TokenSource.DevelopmentHeader,
            isDevelopmentOverride: true);
}
