using FormMaps.Application.Auth;
using FormMaps.Application.Graduation;
using FormMaps.Infrastructure.Data;
using FormMaps.Infrastructure.Graduation;
using Npgsql;

namespace FormMaps.IntegrationTests.Graduation;

/// <summary>
/// Real-DB tests for <see cref="GraduationRulesReader"/> / <see cref="GraduationRulesWriter"/> (issue #55),
/// under the PRODUCTION RLS policies as a NOSUPERUSER NOBYPASSRLS login.
///
/// <para>The isolation adversary is a SAME-SCHOOL caller wherever the point is an app-layer predicate, and a
/// DIFFERENT-school caller only where the point really is the policy. graduation_rule_sets and
/// category_requirements are direct-schoolId / FK-scoped tables, so a cross-school caller is denied by the
/// policy and would keep a predicate-free reader green.</para>
/// </summary>
public sealed class GraduationRulesReaderTests(GraduationDatabaseFixture fixture)
    : IClassFixture<GraduationDatabaseFixture>, IAsyncLifetime
{
    private const string School = "school-1";
    private const string OtherSchool = "school-2";
    private const string Year = "ay-1";
    private const string Admin = "admin-1";
    private const string Student = "stu-1";

    private NpgsqlDataSource _dataSource = null!;

    public async Task InitializeAsync()
    {
        await fixture.ResetAsync();
        _dataSource = NpgsqlDataSource.Create(fixture.AppConnectionString);
    }

    public async Task DisposeAsync() => await _dataSource.DisposeAsync();

    [Fact]
    public async Task Harness_runs_without_bypassing_rls_and_policies_the_expected_tables()
    {
        await using var connection = await _dataSource.OpenConnectionAsync();
        await using var command = new NpgsqlCommand(
            "SELECT rolbypassrls, rolsuper FROM pg_roles WHERE rolname = current_user", connection);
        await using var reader = await command.ExecuteReaderAsync();
        Assert.True(await reader.ReadAsync());
        Assert.False(reader.GetBoolean(0));
        Assert.False(reader.GetBoolean(1));

        // school_courses is present because #175 vendored pilot.sql; it was absent when this lane was
        // written against a main where that file was still unvendored (#135). The two landed together.
        Assert.Equal(
            new[] { "academic_years", "category_requirements", "graduation_rule_sets", "school_courses", "special_requirements", "student_grades", "users" },
            fixture.AppliedPolicyTables.OrderBy(t => t, StringComparer.Ordinal).ToArray());
        Assert.Contains("school_courses", fixture.AppliedPolicyTables);
    }

    // ---------------------------------------------------------------- GET /graduation/rules

    [Fact]
    public async Task Rules_fall_back_to_the_current_year_and_emit_decimals_as_strings()
    {
        await fixture.SeedAcademicYearAsync(Year, School);
        await fixture.SeedRuleSetAsync("rs-1", School, Year, 24.5m);
        await fixture.SeedCategoryAsync("cat-2", "rs-1", "Mathematics", 4m, sortOrder: 1);
        await fixture.SeedCategoryAsync("cat-1", "rs-1", "English", 4.25m, sortOrder: 0, requiredCourses: ["ENG-9"]);
        await fixture.SeedCategoryAsync("cat-x", "rs-1", "Retired", 1m, sortOrder: 2, isActive: false);
        await fixture.SeedSpecialAsync("sp-1", "rs-1", "Service hours", "hours", 40m, "hours", "Community service");
        await fixture.SeedSpecialAsync("sp-x", "rs-1", "Retired", "hours", 1m, isActive: false);

        var ruleSet = await Reader().GetRulesAsync(Ctx(Admin, School), School, null);

        Assert.NotNull(ruleSet);
        Assert.Equal("rs-1", ruleSet!.Id);
        Assert.Equal(Year, ruleSet.AcademicYearId);
        // decimal.js toString(), not a JSON number: "24.5", not 24.500000000000000000000000000000.
        Assert.Equal("24.5", ruleSet.TotalCreditsRequired);
        Assert.Equal(new[] { "English", "Mathematics" }, ruleSet.CategoryRequirements.Select(c => c.Category).ToArray());
        Assert.Equal("4.25", ruleSet.CategoryRequirements[0].MinCredits);
        Assert.Equal(new[] { "ENG-9" }, ruleSet.CategoryRequirements[0].RequiredCourses.ToArray());
        Assert.Equal("4", ruleSet.CategoryRequirements[1].MinCredits);
        Assert.Single(ruleSet.SpecialRequirements);
        Assert.Equal("40", ruleSet.SpecialRequirements[0].Value);
        Assert.EndsWith("Z", ruleSet.CreatedDate, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Rules_are_null_when_there_is_no_current_year_and_when_the_rule_set_is_inactive()
    {
        // No current academic year at all -> null before any rule-set query runs.
        await fixture.SeedAcademicYearAsync(Year, School, isCurrent: false);
        await fixture.SeedRuleSetAsync("rs-1", School, Year, 24m);
        Assert.Null(await Reader().GetRulesAsync(Ctx(Admin, School), School, null));

        // An explicit year reaches the rule set, but an INACTIVE one is still null.
        Assert.NotNull(await Reader().GetRulesAsync(Ctx(Admin, School), School, Year));
        await fixture.ExecuteAsync("""UPDATE "graduation_rule_sets" SET "isActive" = false WHERE "id" = 'rs-1'""");
        Assert.Null(await Reader().GetRulesAsync(Ctx(Admin, School), School, Year));
    }

    // ---------------------------------------------------------------- GET /graduation/progress

    [Fact]
    public async Task Progress_list_is_empty_without_a_current_year_or_an_active_rule_set()
    {
        await fixture.SeedUserAsync(Student, School);

        var noYear = await Reader().GetProgressListAsync(Ctx(Admin, School), School, 1, 20, null, null);
        Assert.Empty(noYear.Data);
        Assert.Equal(0, noYear.Total);
        Assert.Equal(0, noYear.TotalPages);
        Assert.Equal(20, noYear.Limit);

        await fixture.SeedAcademicYearAsync(Year, School);
        var noRules = await Reader().GetProgressListAsync(Ctx(Admin, School), School, 1, 20, null, null);
        Assert.Empty(noRules.Data);
    }

    [Fact]
    public async Task Progress_list_prefers_the_grades_own_credits_and_falls_back_to_the_catalog()
    {
        await fixture.SeedAcademicYearAsync(Year, School);
        await fixture.SeedRuleSetAsync("rs-1", School, Year, 20m);
        await fixture.SeedUserAsync("stu-a", School, name: "Ada", gradeLevel: 12);
        await fixture.SeedUserAsync("stu-b", School, roleName: "student", name: "Bo");
        await fixture.SeedUserAsync("stu-c", School, name: "Cal");
        // roleName outside {Student, student} is not on the roster at all.
        await fixture.SeedUserAsync("counselor-1", School, roleName: "counselor", name: "Cass");
        await fixture.SeedCourseAsync("c-1", School, "ENG-9", "English 9", "English", 3m);

        // Own credits positive -> used. Zero credits -> the catalog's 3. Unknown course -> 0.
        await fixture.SeedGradeAsync("g-1", School, "stu-a", "c-1", 5m);
        await fixture.SeedGradeAsync("g-2", School, "stu-b", "c-1", 0m);
        await fixture.SeedGradeAsync("g-3", School, "stu-c", "ghost-course", 0m);
        // Non-completed and inactive grades are excluded.
        await fixture.SeedGradeAsync("g-4", School, "stu-c", "c-1", 9m, status: "in_progress");
        await fixture.SeedGradeAsync("g-5", School, "stu-c", "c-1", 9m, isActive: false);

        var page = await Reader().GetProgressListAsync(Ctx(Admin, School), School, 1, 20, null, null);

        Assert.Equal(3, page.Total);
        var byId = page.Data.ToDictionary(r => r.StudentId, StringComparer.Ordinal);
        Assert.Equal(5d, byId["stu-a"].CreditsCompleted);
        Assert.Equal(3d, byId["stu-b"].CreditsCompleted);
        Assert.Equal(0d, byId["stu-c"].CreditsCompleted);
        Assert.Equal(20d, byId["stu-a"].CreditsRequired);
        Assert.Equal(25, byId["stu-a"].ProgressPercent);
        Assert.Equal("off_track", byId["stu-a"].Status);
        Assert.Equal(12, byId["stu-a"].GradeLevel);
        // Default sort is progressPercent DESC.
        Assert.Equal("stu-a", page.Data[0].StudentId);
    }

    [Fact]
    public async Task Progress_list_filters_by_status_sorts_by_name_and_pages()
    {
        await fixture.SeedAcademicYearAsync(Year, School);
        await fixture.SeedRuleSetAsync("rs-1", School, Year, 10m);
        await fixture.SeedCourseAsync("c-1", School, "ENG-9", "English 9", "English", 1m);
        foreach (var (id, name, credits) in new[] { ("stu-a", "Zoe", 10m), ("stu-b", "Ada", 6m), ("stu-c", "Mel", 1m) })
        {
            await fixture.SeedUserAsync(id, School, name: name);
            await fixture.SeedGradeAsync($"g-{id}", School, id, "c-1", credits);
        }

        var onTrack = await Reader().GetProgressListAsync(Ctx(Admin, School), School, 1, 20, "on_track", null);
        Assert.Single(onTrack.Data);
        Assert.Equal("stu-a", onTrack.Data[0].StudentId);
        Assert.Equal(1, onTrack.Total);

        var byName = await Reader().GetProgressListAsync(Ctx(Admin, School), School, 1, 20, null, "name");
        Assert.Equal(new[] { "Ada", "Mel", "Zoe" }, byName.Data.Select(r => r.StudentName).ToArray());

        var pageTwo = await Reader().GetProgressListAsync(Ctx(Admin, School), School, 2, 2, null, "name");
        Assert.Single(pageTwo.Data);
        Assert.Equal("Zoe", pageTwo.Data[0].StudentName);
        Assert.Equal(3, pageTwo.Total);
        Assert.Equal(2, pageTwo.TotalPages);
    }

    /// <summary>
    /// The roster's ROLE predicate, with an adversary RLS genuinely admits.
    ///
    /// <para>This test replaced one that seeded a cross-school student and asserted it was absent. That version
    /// was a defect of the kind CONVERTING-A-FIXTURE.md names: <c>users</c>' policy hides a row of another school
    /// from this caller anyway, so it stayed GREEN with the query's <c>schoolId</c> filter deleted — it was
    /// measuring RLS, not the reader. Measured, not assumed.</para>
    ///
    /// <para>A same-school non-student is the useful adversary instead: the policy's school branch admits the
    /// row and ONLY <c>roleName IN ('Student','student')</c> keeps it off the roster. Sabotaging that predicate
    /// turns this red (verified). Cross-school exclusion on this route is RLS's job and is proven where RLS is
    /// proven, not here.</para>
    /// </summary>
    [Fact]
    public async Task Progress_list_excludes_same_school_non_students_that_rls_admits()
    {
        await fixture.SeedAcademicYearAsync(Year, School);
        await fixture.SeedRuleSetAsync("rs-1", School, Year, 10m);
        await fixture.SeedUserAsync("stu-a", School, name: "Ada");
        await fixture.SeedUserAsync("counselor-1", School, roleName: "counselor", name: "Cass");
        await fixture.SeedUserAsync("admin-2", School, roleName: "school_admin", name: "Sam");
        await fixture.SeedUserAsync("teacher-1", School, roleName: "teacher", name: "Tom");

        var page = await Reader().GetProgressListAsync(Ctx(Admin, School), School, 1, 20, null, null);

        Assert.Single(page.Data);
        Assert.Equal("stu-a", page.Data[0].StudentId);
        Assert.Equal(1, page.Total);
    }

    // ---------------------------------------------------------------- GET /graduation/progress/:studentId

    [Fact]
    public async Task Student_progress_distinguishes_not_found_from_the_two_message_branches()
    {
        var reader = Reader();

        Assert.Equal(GraduationProgressOutcome.NotFound,
            (await reader.GetStudentProgressAsync(Ctx(Admin, School), School, "ghost")).Outcome);

        // Same-school caller, student in ANOTHER school: the policy admits neither, but the predicate is what
        // must deny it — asserted with a caller scoped to the student's school so RLS is not doing the work.
        await fixture.SeedUserAsync("stu-other", OtherSchool);
        Assert.Equal(GraduationProgressOutcome.NotFound,
            (await reader.GetStudentProgressAsync(Ctx(Admin, OtherSchool), School, "stu-other")).Outcome);

        await fixture.SeedUserAsync(Student, School);
        var noYear = await reader.GetStudentProgressAsync(Ctx(Admin, School), School, Student);
        Assert.Equal(GraduationProgressOutcome.Message, noYear.Outcome);
        Assert.Equal("No active academic year", noYear.Message);

        await fixture.SeedAcademicYearAsync(Year, School);
        var noRules = await reader.GetStudentProgressAsync(Ctx(Admin, School), School, Student);
        Assert.Equal(GraduationProgressOutcome.Message, noRules.Outcome);
        Assert.Equal("No graduation rules", noRules.Message);
    }

    [Fact]
    public async Task Student_progress_rolls_credits_into_the_first_matching_category_then_the_elective_bucket()
    {
        await SeedRuleTreeAsync();
        await fixture.SeedUserAsync(Student, School, name: "Ada");

        // ENG-9 is on English's requiredCourses list -> matches English.
        await fixture.SeedGradeAsync("g-1", School, Student, "c-eng9", 4m);
        // ENG-ELECTIVE is in the English department but NOT on the list, so the requiredCourses arm rejects it and
        // it falls through to the elective bucket. This is the gradMatch rule that is easiest to get wrong.
        await fixture.SeedGradeAsync("g-2", School, Student, "c-engelect", 2m);
        // Department match on a category with no requiredCourses.
        await fixture.SeedGradeAsync("g-3", School, Student, "c-alg", 3m);
        // A grade whose course row does not exist is skipped ENTIRELY — no category, no total.
        await fixture.SeedGradeAsync("g-4", School, Student, "ghost", 99m);

        var result = await Reader().GetStudentProgressAsync(Ctx(Admin, School), School, Student);

        Assert.Equal(GraduationProgressOutcome.Ok, result.Outcome);
        Assert.Equal("Ada", result.StudentName);
        Assert.Equal("rs-1", result.RuleSetId);
        Assert.Equal(9d, result.TotalCreditsEarned);
        Assert.Equal(20d, result.TotalCreditsRequired);
        Assert.Equal(45d, result.OverallProgress); // Math.round(9/20*1000)/10
        Assert.False(result.OnTrack);

        var byCategory = result.CategoryProgress.ToDictionary(c => c.Category, StringComparer.Ordinal);
        Assert.Equal(4d, byCategory["English"].Earned);
        Assert.True(byCategory["English"].Met);
        Assert.Equal(3d, byCategory["Mathematics"].Earned);
        Assert.False(byCategory["Mathematics"].Met);
        Assert.Equal(2d, byCategory["General Electives"].Earned);
        Assert.Equal(75d, byCategory["Mathematics"].Progress); // 3/4 -> 75.0

        var special = Assert.Single(result.SpecialRequirementProgress);
        Assert.Equal(40d, special.Required);
        Assert.False(special.Completed);
        Assert.Equal("Manual tracking", special.Note);
    }

    // ---------------------------------------------------------------- GET /graduation/gap-analysis/:studentId

    [Fact]
    public async Task Gap_analysis_reports_unmet_categories_with_severity_and_suggests_uncompleted_courses()
    {
        await SeedRuleTreeAsync();
        await fixture.SeedUserAsync(Student, School, name: "Ada");
        await fixture.SeedGradeAsync("g-1", School, Student, "c-eng9", 4m); // English met exactly
        await fixture.SeedGradeAsync("g-2", School, Student, "c-alg", 1m);  // Mathematics 1 of 4 -> needs 3 -> high
        // A second maths course exists for the suggestion list; an inactive one must not be suggested.
        await fixture.SeedCourseAsync("c-geo", School, "GEO-1", "Geometry", "Mathematics", 3m);
        await fixture.SeedCourseAsync("c-cal", School, "CAL-1", "Calculus", "Mathematics", 3m, isActive: false);

        var result = await Reader().GetGapAnalysisAsync(Ctx(Admin, School), School, Student);

        Assert.Equal(GapAnalysisOutcome.Ok, result.Outcome);
        Assert.Equal("Ada", result.StudentName);
        Assert.Equal("Needs attention in 2 categories", result.Summary);

        var maths = result.Gaps.Single(g => g.Category == "Mathematics");
        Assert.Equal(3d, maths.Needed);
        Assert.Equal("high", maths.Severity);
        var electives = result.Gaps.Single(g => g.Category == "General Electives");
        Assert.Equal("high", electives.Severity);
        Assert.DoesNotContain(result.Gaps, g => g.Category == "English");

        // c-alg is already completed so it is excluded; c-cal is inactive; c-geo is the only suggestion.
        var recommendation = result.Recommendations.Single(r => r.Category == "Mathematics");
        Assert.Equal(new[] { "GEO-1" }, recommendation.SuggestedCourses.Select(c => c.Code).ToArray());
        Assert.Equal(3d, recommendation.SuggestedCourses[0].Credits);
        // General Electives has no matching course, so it is dropped from recommendations while staying a gap.
        Assert.DoesNotContain(result.Recommendations, r => r.Category == "General Electives");
    }

    [Fact]
    public async Task Gap_analysis_empty_branch_omits_the_name_and_summary()
    {
        await fixture.SeedUserAsync(Student, School);

        var result = await Reader().GetGapAnalysisAsync(Ctx(Admin, School), School, Student);

        Assert.Equal(GapAnalysisOutcome.Empty, result.Outcome);
        Assert.Equal(Student, result.StudentId);
        Assert.Null(result.StudentName);
        Assert.Null(result.Summary);
        Assert.Empty(result.Gaps);
    }

    // ---------------------------------------------------------------- writes

    [Fact]
    public async Task Create_uses_the_current_year_and_writes_the_children_in_body_order()
    {
        await fixture.SeedAcademicYearAsync(Year, School);

        var id = await Writer().CreateRulesAsync(Ctx(Admin, School), School, new CreateGraduationRulesInput(
            null, 24d,
            [
                new CategoryRequirementInput("English", 4d, ["ENG-9"], true),
                new CategoryRequirementInput("Mathematics", 0d, [], false),
            ],
            [new SpecialRequirementInput("Service", "hours", 40d, "hours", "Community service")]));

        Assert.Equal(Year, await fixture.ScalarAsync<string>(
            """SELECT "academicYearId" FROM "graduation_rule_sets" WHERE "id" = @id""", ("id", id)));
        Assert.Equal(24d, await fixture.ScalarAsync<double>(
            """SELECT "totalCreditsRequired"::double precision FROM "graduation_rule_sets" WHERE "id" = @id""", ("id", id)));
        // sortOrder is the body index, not anything from the payload.
        Assert.Equal(1, await fixture.ScalarAsync<int>(
            """SELECT "sortOrder" FROM "category_requirements" WHERE "ruleSetId" = @id AND "category" = 'Mathematics'""", ("id", id)));
        Assert.False(await fixture.ScalarAsync<bool>(
            """SELECT "electivesAllowed" FROM "category_requirements" WHERE "ruleSetId" = @id AND "category" = 'Mathematics'""", ("id", id)));
        Assert.Equal(1, await fixture.ScalarAsync<long>(
            """SELECT count(*) FROM "special_requirements" WHERE "ruleSetId" = @id""", ("id", id)));
        // Legacy sets no createdBy on any of the three tables.
        Assert.Null(await fixture.ScalarAsync<string>(
            """SELECT "createdBy" FROM "graduation_rule_sets" WHERE "id" = @id""", ("id", id)));
    }

    /// <summary>
    /// A rules POST really does mint a hard-coded "2025-2026" academic year when the school has none. It is a
    /// surprising side effect of a rules write, which is exactly why it is pinned rather than left implicit.
    /// </summary>
    [Fact]
    public async Task Create_mints_a_default_academic_year_when_the_school_has_none()
    {
        var id = await Writer().CreateRulesAsync(
            Ctx(Admin, School), School, new CreateGraduationRulesInput(null, 24d, [], []));

        var yearId = await fixture.ScalarAsync<string>(
            """SELECT "academicYearId" FROM "graduation_rule_sets" WHERE "id" = @id""", ("id", id));
        Assert.Equal("2025-2026", await fixture.ScalarAsync<string>(
            """SELECT "name" FROM "academic_years" WHERE "id" = @id""", ("id", yearId)));
        Assert.True(await fixture.ScalarAsync<bool>(
            """SELECT "isCurrent" FROM "academic_years" WHERE "id" = @id""", ("id", yearId)));
    }

    [Fact]
    public async Task Update_replaces_children_only_when_the_list_is_present()
    {
        await fixture.SeedAcademicYearAsync(Year, School);
        await fixture.SeedRuleSetAsync("rs-1", School, Year, 24m);
        await fixture.SeedCategoryAsync("cat-1", "rs-1", "English", 4m, 0);
        await fixture.SeedSpecialAsync("sp-1", "rs-1", "Service", "hours", 40m);

        var writer = Writer();
        var context = Ctx(Admin, School);

        // Neither list present: the existing rows must SURVIVE. This is the assertion that would go red if the
        // null/empty distinction were collapsed, and collapsing it silently wipes a rule set.
        Assert.True(await writer.UpdateRulesAsync(context, School, Admin, "rs-1", new UpdateGraduationRulesInput(30d, null, null)));
        Assert.Equal(1, await fixture.ScalarAsync<long>("""SELECT count(*) FROM "category_requirements" """));
        Assert.Equal(1, await fixture.ScalarAsync<long>("""SELECT count(*) FROM "special_requirements" """));
        Assert.Equal(30d, await fixture.ScalarAsync<double>(
            """SELECT "totalCreditsRequired"::double precision FROM "graduation_rule_sets" WHERE "id" = 'rs-1'"""));
        Assert.Equal(Admin, await fixture.ScalarAsync<string>(
            """SELECT "updatedBy" FROM "graduation_rule_sets" WHERE "id" = 'rs-1'"""));

        // An EMPTY list deletes and creates nothing; totalCreditsRequired absent keeps 30.
        Assert.True(await writer.UpdateRulesAsync(context, School, "admin-2", "rs-1", new UpdateGraduationRulesInput(null, [], null)));
        Assert.Equal(0, await fixture.ScalarAsync<long>("""SELECT count(*) FROM "category_requirements" """));
        Assert.Equal(1, await fixture.ScalarAsync<long>("""SELECT count(*) FROM "special_requirements" """));
        Assert.Equal(30d, await fixture.ScalarAsync<double>(
            """SELECT "totalCreditsRequired"::double precision FROM "graduation_rule_sets" WHERE "id" = 'rs-1'"""));

        // A populated list replaces wholesale, re-indexing sortOrder from the body order.
        Assert.True(await writer.UpdateRulesAsync(context, School, Admin, "rs-1", new UpdateGraduationRulesInput(
            null,
            [new CategoryRequirementInput("Science", 3d, [], true), new CategoryRequirementInput("Arts", 1d, [], true)],
            [])));
        Assert.Equal(0, await fixture.ScalarAsync<long>("""SELECT count(*) FROM "special_requirements" """));
        Assert.Equal(1, await fixture.ScalarAsync<int>(
            """SELECT "sortOrder" FROM "category_requirements" WHERE "category" = 'Arts'"""));
    }

    /// <summary>
    /// The ownership check is the WRITER's, not RLS's, and it runs BEFORE the first write.
    ///
    /// <para>The caller's session GUC is scoped to OtherSchool — so <c>graduation_rule_sets</c>' direct-schoolId
    /// policy ADMITS rs-other — while the schoolId the endpoint resolved is School. That is the stale-token /
    /// mismatched-scope shape, and it is the only shape in which the predicate does independent work: with a
    /// caller scoped to School the policy would hide the row and this test would pass over a writer with no
    /// ownership check at all.</para>
    ///
    /// <para>Asserting the CHILD ROWS SURVIVE is the second half: a check placed after the deleteMany would
    /// still return false, and only this count catches it.</para>
    /// </summary>
    [Fact]
    public async Task Update_of_a_rule_set_outside_the_resolved_school_is_refused_without_deleting_anything()
    {
        await fixture.SeedAcademicYearAsync(Year, OtherSchool);
        await fixture.SeedRuleSetAsync("rs-other", OtherSchool, Year, 24m);
        await fixture.SeedCategoryAsync("cat-other", "rs-other", "English", 4m, 0);

        var refused = await Writer().UpdateRulesAsync(
            Ctx(Admin, OtherSchool), School, Admin, "rs-other", new UpdateGraduationRulesInput(1d, [], []));

        Assert.False(refused);
        Assert.Equal(1, await fixture.ScalarAsync<long>("""SELECT count(*) FROM "category_requirements" """));
        Assert.Equal(24d, await fixture.ScalarAsync<double>(
            """SELECT "totalCreditsRequired"::double precision FROM "graduation_rule_sets" WHERE "id" = 'rs-other'"""));
    }

    [Fact]
    public async Task Update_of_a_missing_rule_set_is_refused()
    {
        Assert.False(await Writer().UpdateRulesAsync(
            Ctx(Admin, School), School, Admin, "ghost", new UpdateGraduationRulesInput(1d, null, null)));
    }

    // ---------------------------------------------------------------- helpers

    // English (requiredCourses ENG-9, 4cr) / Mathematics (department match, 4cr) / General Electives (the
    // elective sink, 4cr). Plus the three catalog courses those rules refer to.
    private async Task SeedRuleTreeAsync()
    {
        await fixture.SeedAcademicYearAsync(Year, School);
        await fixture.SeedRuleSetAsync("rs-1", School, Year, 20m);
        await fixture.SeedCategoryAsync("cat-1", "rs-1", "English", 4m, 0, requiredCourses: ["ENG-9"], electivesAllowed: false);
        await fixture.SeedCategoryAsync("cat-2", "rs-1", "Mathematics", 4m, 1, electivesAllowed: false);
        await fixture.SeedCategoryAsync("cat-3", "rs-1", "General Electives", 4m, 2);
        await fixture.SeedSpecialAsync("sp-1", "rs-1", "Service", "hours", 40m, "hours");
        await fixture.SeedCourseAsync("c-eng9", School, "ENG-9", "English 9", "English", 4m);
        await fixture.SeedCourseAsync("c-engelect", School, "ENG-ELECTIVE", "Creative Writing", "English", 2m);
        await fixture.SeedCourseAsync("c-alg", School, "ALG-1", "Algebra I", "Mathematics", 3m);
    }

    private GraduationRulesReader Reader() =>
        new(new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()));

    private GraduationRulesWriter Writer() =>
        new(new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()));

    private static RequestContext Ctx(string userId, string? schoolId) =>
        RequestContext.Authenticated(
            new RequestActor(userId, "school_admin", $"{userId}@e.st", "Admin"),
            schoolId: schoolId,
            permissions: Array.Empty<string>(),
            tokenSource: TokenSource.DevelopmentHeader,
            isDevelopmentOverride: true);
}
