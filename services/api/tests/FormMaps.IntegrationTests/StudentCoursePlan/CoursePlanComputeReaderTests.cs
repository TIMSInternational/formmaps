using FormMaps.Application.Auth;
using FormMaps.Application.StudentCoursePlan;
using FormMaps.Infrastructure.Data;
using FormMaps.Infrastructure.StudentCoursePlan;
using FormMaps.IntegrationTests.TestSupport.Rls;
using Npgsql;

namespace FormMaps.IntegrationTests.StudentCoursePlan;

/// <summary>
/// Real-DB (Testcontainers) tests for <see cref="CoursePlanComputeReader"/> (FM-DOTNET-086). Pins the completion gate
/// (checkAssessmentCompletion: 5 distinct LIA exam types OR a completed parity session, ≥min(evalTotal,3) completed
/// evaluations, any completed PCA), the recommendations loads (active catalog take-100, enrolled set, lowercased
/// preferredFields), and eligibility (no-school → null; catalog + completed-grade wiring into the map compute).
///
/// <para>formmaps#125: the fixture now derives from <see cref="RlsEnabledDatabaseFixture"/>, so the REAL production
/// policies are live and the reader runs as a NOSUPERUSER NOBYPASSRLS login. Seeding and assertions go through the
/// container superuser (<c>_adminDataSource</c>) — a policy-filtered assertion cannot tell "row absent" from "row
/// invisible" and would pass for the wrong reason.</para>
///
/// <para>WHY THE SAME-SCHOOL ADVERSARY IS THE ONE THAT MATTERS HERE. Every policy this reader touches has a school
/// branch: any caller carrying the row owner's <c>schoolId</c> is admitted. A cross-school or school-less caller
/// therefore proves nothing about the reader — the policy would hide the row from a repository with no predicate at
/// all. The adversary in the tests below is a CLASSMATE of the victim (same schoolId, different userId), which the
/// policies admit and only the reader's own <c>WHERE "studentId" = @u</c> / <c>WHERE "userId" = @u</c> denies. Each
/// such test carries its negative control: the victim row IS visible on the adversary's own RLS session.</para>
/// </summary>
public sealed class CoursePlanComputeReaderTests : IClassFixture<CoursePlanComputeReaderTests.Fixture>, IAsyncLifetime
{
    private const string User = "user-1";
    private const string School = "school-1";

    /// <summary>Same school as <see cref="User"/> — the adversary the policies ADMIT, so only the reader denies.</summary>
    private const string Classmate = "user-classmate";

    /// <summary>A different tenant — used to prove the policies are doing their half of the job.</summary>
    private const string Outsider = "user-outsider";
    private const string OtherSchool = "school-2";

    /// <summary>Every table this fixture creates. Truncated as the superuser between tests.</summary>
    private static readonly string[] AllTables =
    [
        "users", "pca_exam_sessions", "lia_assessment_sessions", "personality_assessment_sessions",
        "evaluation_groups", "pca_evaluations", "course_enrollments", "user_preferences", "user_settings",
        "user_career_profiles", "courses", "school_courses", "student_grades",
    ];

    private readonly Fixture _fixture;

    /// <summary>The restricted login (NOSUPERUSER NOBYPASSRLS) the reader under test runs on.</summary>
    private NpgsqlDataSource _dataSource = null!;

    /// <summary>Container superuser. Seeding and assertions ONLY.</summary>
    private NpgsqlDataSource _adminDataSource = null!;

    public CoursePlanComputeReaderTests(Fixture fixture) => _fixture = fixture;

    public async Task InitializeAsync()
    {
        _dataSource = NpgsqlDataSource.Create(_fixture.AppConnectionString);
        _adminDataSource = NpgsqlDataSource.Create(_fixture.AdminConnectionString);
        await _fixture.TruncateAsync(AllTables);
    }

    public async Task DisposeAsync()
    {
        await _dataSource.DisposeAsync();
        await _adminDataSource.DisposeAsync();
    }

    // ---- harness proof (formmaps#125) ----

    [Fact]
    public async Task Harness_runs_as_a_restricted_login_with_the_production_policies_live()
    {
        // NOTE the data source: the APP login, not the admin one. Every isolation claim in this file is
        // conditional on this coming back false.
        await using var conn = await _dataSource.OpenConnectionAsync();
        Assert.False(await ProductionRlsPolicies.BypassesRlsAsync(conn), "the app login must not bypass RLS");

        Assert.Equal(
            [
                "course_enrollments", "evaluation_groups", "pca_evaluations", "pca_exam_sessions", "student_grades",
                "user_career_profiles", "user_preferences", "user_settings", "users",
            ],
            _fixture.AppliedPolicyTables);
    }

    [Fact]
    public void Four_tables_this_reader_reads_are_unpolicied_in_production_and_that_is_asserted_not_assumed()
    {
        // Recorded the way ParentChildReaderTests does for student_course_plans: the gap is pinned here so the next
        // reader cannot assume an RLS backstop that does not exist. `courses` is a DELIBERATE exclusion (005-sensitive
        // .sql lists it under "global catalog/reference"). The other three are NOT mentioned anywhere in
        // prisma/rls/*.sql — see this file's companion note in Fixture.
        foreach (var table in new[] { "courses", "school_courses", "lia_assessment_sessions", "personality_assessment_sessions" })
        {
            Assert.DoesNotContain(table, _fixture.AppliedPolicyTables);
        }
    }

    [Fact]
    public async Task Every_policied_table_this_reader_reads_is_invisible_to_another_tenant()
    {
        // The policies' own half of the job, checked table by table rather than asserted in a doc comment. The FIRST
        // loop is the negative control for the second: the same rows ARE there, seen by the superuser, so an empty
        // result below is the policy and not an empty fixture.
        await using var admin = await _adminDataSource.OpenConnectionAsync();
        await UserRow(admin, User, School, 11);
        await PcaExam(admin, User, "PatternRecognition", completed: true);
        await EvalGroup(admin, User, completed: true);
        await PcaEval(admin, User, completed: true);
        await Enrollment(admin, "c1", User);
        await Prefs(admin, User, "Science");
        await UserSettings(admin, User, language: "es");
        await CareerProfile(admin, User, """{"prog-1": "insight"}""");
        await Grade(admin, "g1", User, School, "math1", status: "completed");

        var policied = new[]
        {
            "users", "pca_exam_sessions", "evaluation_groups", "pca_evaluations", "course_enrollments",
            "user_preferences", "user_settings", "user_career_profiles", "student_grades",
        };

        foreach (var table in policied)
        {
            Assert.Equal(1L, await CountAsync(admin, table));
        }

        await using var outsider = await OpenIdentitySessionAsync(Outsider, OtherSchool);
        foreach (var table in policied)
        {
            Assert.Equal(0L, await CountAsync(outsider, table));
        }

        // ...and the same rows ARE admitted to a CLASSMATE, which is why the app-layer tests below use one.
        await using var classmate = await OpenIdentitySessionAsync(Classmate, School);
        foreach (var table in policied)
        {
            Assert.Equal(1L, await CountAsync(classmate, table));
        }
    }

    // ---- app-layer gates RLS cannot do: same-school adversary ----

    [Fact]
    public async Task Eligibility_does_not_count_a_classmates_completed_grade_that_RLS_admits()
    {
        await using var admin = await _adminDataSource.OpenConnectionAsync();
        await UserRow(admin, User, School, 11);
        await UserRow(admin, Classmate, School, 11);
        await SchoolCourse(admin, "math1", School, "MATH1");
        await SchoolCourse(admin, "math2", School, "MATH2", prereqs: new[] { "MATH1" });

        // Only the VICTIM completed MATH1. student_grades is policied by schoolId alone (002-direct-schoolid.sql), so
        // the classmate's session is admitted to this row outright — the ONLY thing that can deny it is the reader's
        // `AND "studentId" = @u`.
        await Grade(admin, "g1", User, School, "math1", status: "completed");

        // Negative control: the row really is visible to the adversary's own RLS session.
        await using (var classmateSession = await OpenIdentitySessionAsync(Classmate, School))
        {
            Assert.Equal(1L, await CountAsync(classmateSession, "student_grades"));
        }

        // Positive half: the owner sees the prerequisite satisfied.
        var owner = (await Repo().GetEligibilityAsync(Ctx(User, School), User))!;
        Assert.True(owner.Single(e => e.CourseId == "math2").Eligible);

        // Negative half: the classmate does NOT inherit it, over the exact same seeded data.
        var adversary = (await Repo().GetEligibilityAsync(Ctx(Classmate, School), Classmate))!;
        var math2 = adversary.Single(e => e.CourseId == "math2");
        Assert.False(math2.Eligible);
        Assert.Equal(["MATH1"], math2.MissingCodes);
    }

    [Fact]
    public async Task Recommendations_do_not_leak_a_classmates_enrollments_or_preferences_that_RLS_admits()
    {
        await using var admin = await _adminDataSource.OpenConnectionAsync();
        await UserRow(admin, User, School, 11);
        await UserRow(admin, Classmate, School, 11);

        // The victim's data. Both tables are policied by owner-OR-owner's-school (003-fk-users.sql), so a classmate
        // is admitted to both; only `WHERE "studentId"/"userId" = @u` denies.
        await Enrollment(admin, "victim-course", User);
        await Prefs(admin, User, "Science", "MATH");

        // The adversary is done with their assessments, so the reader actually reaches the catalog-loading branch.
        await CompleteAllAssessments(admin, Classmate);
        await Course_(admin, "c1", title: "Bio");

        // Negative control: the victim's rows really are visible to the adversary's own RLS session.
        await using (var classmateSession = await OpenIdentitySessionAsync(Classmate, School))
        {
            Assert.Equal(1L, await CountAsync(classmateSession, "course_enrollments"));
            Assert.Equal(1L, await CountAsync(classmateSession, "user_preferences"));
        }

        var adversary = await Repo().GetRecommendationsAsync(Ctx(Classmate, School), Classmate);
        Assert.True(adversary.Done);
        Assert.Empty(adversary.EnrolledCourseIds);
        Assert.Empty(adversary.PreferredFieldsLower);

        // Positive half, same seeded data: the owner does get them.
        await CompleteAllAssessments(admin, User);
        var owner = await Repo().GetRecommendationsAsync(Ctx(User, School), User);
        Assert.Contains("victim-course", owner.EnrolledCourseIds);
        Assert.Equal(["science", "math"], owner.PreferredFieldsLower);
    }

    [Fact]
    public async Task Recommendations_completion_verdict_does_not_absorb_a_classmates_assessments_that_RLS_admits()
    {
        await using var admin = await _adminDataSource.OpenConnectionAsync();
        await UserRow(admin, User, School, 11);
        await UserRow(admin, Classmate, School, 11);

        // The victim has finished everything; the classmate has finished nothing.
        await CompleteAllAssessments(admin, User);

        await using (var classmateSession = await OpenIdentitySessionAsync(Classmate, School))
        {
            Assert.Equal(5L, await CountAsync(classmateSession, "pca_exam_sessions")); // RLS admits them
        }

        var adversary = await Repo().GetRecommendationsAsync(Ctx(Classmate, School), Classmate);
        Assert.False(adversary.Done);
        Assert.Equal(0, adversary.Verdict.LiaCompleted);

        var owner = await Repo().GetRecommendationsAsync(Ctx(User, School), User);
        Assert.True(owner.Done);
    }

    // ---- app-layer gate on a table with NO policy at all ----

    [Fact]
    public async Task Eligibility_catalog_is_gated_only_by_the_readers_schoolId_predicate_because_school_courses_is_unpolicied()
    {
        await using var admin = await _adminDataSource.OpenConnectionAsync();
        await UserRow(admin, User, School, 11);
        await SchoolCourse(admin, "math1", School, "MATH1");
        await SchoolCourse(admin, "other-school-course", OtherSchool, "BIO1");

        // school_courses carries a NOT NULL schoolId and is policied NOWHERE in the vendored production files, so RLS
        // contributes nothing here: both rows are visible on the caller's own session. The `WHERE "schoolId" = @school`
        // in GetEligibilityAsync is the entire tenant boundary for this table.
        await using (var ownSession = await OpenIdentitySessionAsync(User, School))
        {
            Assert.Equal(2L, await CountAsync(ownSession, "school_courses"));
        }

        var entries = (await Repo().GetEligibilityAsync(Ctx(User, School), User))!;
        Assert.Equal(["math1"], entries.Select(e => e.CourseId));
    }

    // ---- pre-existing behaviour, now re-run with the production policies live ----

    [Fact]
    public async Task Recommendations_not_done_returns_verdict_only()
    {
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await UserRow(conn, User, School, 11);
        // No assessments → allDone false.
        var data = await Repo().GetRecommendationsAsync(Ctx(), User);
        Assert.False(data.Done);
        Assert.False(data.Verdict.AllDone);
        Assert.Empty(data.Courses);
    }

    [Fact]
    public async Task Recommendations_done_via_five_exam_types_loads_catalog_enrolled_and_prefs()
    {
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await UserRow(conn, User, School, 11);
        foreach (var t in new[] { "PatternRecognition", "VerbalReasoning", "NumericVelocity", "WorkingMemory", "VisualRotation" })
        {
            await PcaExam(conn, User, t, completed: true);
        }

        await EvalGroup(conn, User, completed: true);
        await EvalGroup(conn, User, completed: true);
        await EvalGroup(conn, User, completed: true);
        await PcaEval(conn, User, completed: true);
        await PersonalitySession(conn, User, "completed");

        await Course_(conn, "c1", title: "Bio");
        await Course_(conn, "c2", title: "Chem");
        await Course_(conn, "inactive", title: "Old", isActive: false);
        await Enrollment(conn, "c1", User);
        await Prefs(conn, User, "Science", "MATH");

        var data = await Repo().GetRecommendationsAsync(Ctx(), User);
        Assert.True(data.Done);
        Assert.Equal(["c1", "c2"], data.Courses.Select(c => c.Id));   // active + language-matched, id order
        Assert.Contains("c1", data.EnrolledCourseIds);
        Assert.Equal(["science", "math"], data.PreferredFieldsLower); // lowercased
        Assert.Empty(data.EngineCareersLower);                        // no user_career_profiles row → []
    }

    // ---- Task-6 language-parity fold (report §3) ----

    [Fact]
    public async Task Recommendations_language_filter_excludes_non_matching_language_when_pool_is_not_sparse()
    {
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await UserRow(conn, User, School, 11);
        await CompleteAllAssessments(conn, User);

        // 10 English courses (>= the sparsity floor) + 1 French course. No preferredLanguages/user_settings row →
        // resolveAllowedCourseLanguages falls to resolveUserLanguage's null-row default "en" → ["English"]. Pool
        // is non-sparse (10 >= 10) so no widen fires, and the French course must be excluded.
        for (var i = 0; i < 10; i++)
        {
            await Course_(conn, $"en{i:D2}", title: $"English {i}", language: "English");
        }

        await Course_(conn, "fr01", title: "French course", language: "French");

        var data = await Repo().GetRecommendationsAsync(Ctx(), User);
        Assert.DoesNotContain("fr01", data.Courses.Select(c => c.Id));
        Assert.Equal(10, data.Courses.Count);
    }

    [Fact]
    public async Task Recommendations_widens_to_include_English_when_language_filtered_pool_is_sparse()
    {
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await UserRow(conn, User, School, 11);
        await CompleteAllAssessments(conn, User);
        await UserSettings(conn, User, language: "es"); // platform language es → allowed = {Spanish, Español, Espanol}

        // Only 2 Spanish courses (< 10) → sparse → widen adds English; the English course must now appear too.
        await Course_(conn, "es01", title: "Curso 1", language: "Spanish");
        await Course_(conn, "es02", title: "Curso 2", language: "Spanish");
        await Course_(conn, "en01", title: "English course", language: "English");

        var data = await Repo().GetRecommendationsAsync(Ctx(), User);
        Assert.Equal(["en01", "es01", "es02"], data.Courses.Select(c => c.Id).OrderBy(id => id, StringComparer.Ordinal));
    }

    [Fact]
    public async Task Recommendations_language_match_is_case_insensitive()
    {
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await UserRow(conn, User, School, 11);
        await CompleteAllAssessments(conn, User);

        // Stored casing differs from the catalog-value casing ("English") — must still match (ILIKE-equivalent).
        await Course_(conn, "c1", title: "Weird casing", language: "ENGLISH");

        var data = await Repo().GetRecommendationsAsync(Ctx(), User);
        Assert.Contains("c1", data.Courses.Select(c => c.Id));
    }

    [Fact]
    public async Task Recommendations_preferredLanguages_takes_priority_over_platform_language()
    {
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await UserRow(conn, User, School, 11);
        await CompleteAllAssessments(conn, User);
        await UserSettings(conn, User, language: "en"); // platform says en, but preferredLanguages should win
        await PreferredLanguages(conn, User, "es");

        // < 10 Spanish courses → widen adds English too, but a French-only course must still be excluded.
        await Course_(conn, "es01", title: "Curso", language: "Spanish");
        await Course_(conn, "fr01", title: "French", language: "French");

        var data = await Repo().GetRecommendationsAsync(Ctx(), User);
        Assert.Contains("es01", data.Courses.Select(c => c.Id));
        Assert.DoesNotContain("fr01", data.Courses.Select(c => c.Id));
    }

    // ---- Task-6 engine-career-alignment fold (report §4/§5) ----

    [Fact]
    public async Task Recommendations_engine_careers_lower_extracted_from_careerMatches_object_shape()
    {
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await UserRow(conn, User, School, 11);
        await CompleteAllAssessments(conn, User);
        await CareerProfile(conn, User, """{"prog-1": "insight A", "prog-2": "insight B"}""");

        var data = await Repo().GetRecommendationsAsync(Ctx(), User);
        Assert.Equal(["prog-1", "prog-2"], data.EngineCareersLower); // lowercased (already lowercase here)
    }

    [Fact]
    public async Task Recommendations_engine_careers_lower_is_empty_when_careerMatches_is_schema_default_empty_array()
    {
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await UserRow(conn, User, School, 11);
        await CompleteAllAssessments(conn, User);
        await CareerProfile(conn, User, "[]"); // row exists, field untouched (schema default)

        var data = await Repo().GetRecommendationsAsync(Ctx(), User);
        Assert.Empty(data.EngineCareersLower);
    }

    [Fact]
    public async Task Recommendations_done_via_completed_parity_session()
    {
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await UserRow(conn, User, School, 11);
        await LiaSession(conn, User, status: "completed"); // covers all 5 subtests
        await EvalGroup(conn, User, completed: true);
        await PcaEval(conn, User, completed: true);
        await PersonalitySession(conn, User, "completed");

        var data = await Repo().GetRecommendationsAsync(Ctx(), User);
        Assert.True(data.Done); // parity session → liaCompleted 5; evalTotal 1 → required 1; pca done; personality done
        Assert.Equal(5, data.Verdict.LiaCompleted);
    }

    [Fact]
    public async Task Recommendations_lia_uses_distinct_exam_type_count_not_row_count()
    {
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await UserRow(conn, User, School, 11);
        // 5 completed rows but only 2 DISTINCT exam types → liaCompleted 2 (< 5) → not done.
        foreach (var t in new[] { "PatternRecognition", "PatternRecognition", "VerbalReasoning", "VerbalReasoning", "PatternRecognition" })
        {
            await PcaExam(conn, User, t, completed: true);
        }

        await EvalGroup(conn, User, completed: true);
        await PcaEval(conn, User, completed: true);

        var data = await Repo().GetRecommendationsAsync(Ctx(), User);
        Assert.Equal(2, data.Verdict.LiaCompleted);
        Assert.False(data.Done);
    }

    [Fact]
    public async Task Recommendations_not_done_without_personality_even_when_other_three_are_complete()
    {
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await UserRow(conn, User, School, 11);
        await LiaSession(conn, User, status: "completed");
        await EvalGroup(conn, User, completed: true);
        await PcaEval(conn, User, completed: true);
        // No personality session seeded — the 4th assessment is required since 2026-07-30.

        var data = await Repo().GetRecommendationsAsync(Ctx(), User);
        Assert.False(data.Done);
        Assert.False(data.Verdict.PersonalityCompleted);
    }

    [Fact]
    public async Task Recommendations_legacyUnlockGrandfathered_is_done_without_personality()
    {
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await Exec(conn, """INSERT INTO "users"("id","schoolId","gradeLevel","legacyUnlockGrandfathered") VALUES(@id,@s,@g,true)""",
            ("id", User), ("s", School), ("g", 11));
        await LiaSession(conn, User, status: "completed");
        await EvalGroup(conn, User, completed: true);
        await PcaEval(conn, User, completed: true);
        // No personality session seeded — grandfathered students bypass the 4th-assessment requirement.

        var data = await Repo().GetRecommendationsAsync(Ctx(), User);
        Assert.True(data.Done);
        Assert.False(data.Verdict.PersonalityCompleted);
    }

    [Fact]
    public async Task Recommendations_pca_existence_is_not_completion()
    {
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await UserRow(conn, User, School, 11);
        await LiaSession(conn, User, status: "completed");
        await EvalGroup(conn, User, completed: true);
        await PcaEval(conn, User, completed: false); // a started-but-not-completed PCA row

        var data = await Repo().GetRecommendationsAsync(Ctx(), User);
        Assert.False(data.Done); // pcaCompleted false
    }

    [Fact]
    public async Task Eligibility_no_school_returns_null()
    {
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await UserRow(conn, User, null, 11);
        // The users policy still admits the row on the owner branch (id = app.current_user_id), so a null here is
        // the reader's own `IsDBNull(0)` and not RLS hiding the row.
        Assert.Null(await Repo().GetEligibilityAsync(Ctx(), User));
    }

    [Fact]
    public async Task Eligibility_computes_over_catalog_and_completed_grades()
    {
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await UserRow(conn, User, School, 11);
        await SchoolCourse(conn, "math1", School, "MATH1");
        await SchoolCourse(conn, "math2", School, "MATH2", prereqs: new[] { "MATH1" });
        await Grade(conn, "g1", User, School, "math1", status: "completed"); // MATH1 completed

        var entries = (await Repo().GetEligibilityAsync(Ctx(), User))!;
        Assert.Equal(2, entries.Count);
        Assert.True(entries.Single(e => e.CourseId == "math2").Eligible); // prereq completed
    }

    [Fact]
    public async Task Eligibility_missing_prereq_when_not_completed()
    {
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await UserRow(conn, User, School, 11);
        await SchoolCourse(conn, "math1", School, "MATH1");
        await SchoolCourse(conn, "math2", School, "MATH2", prereqs: new[] { "MATH1" });

        var math2 = (await Repo().GetEligibilityAsync(Ctx(), User))!.Single(e => e.CourseId == "math2");
        Assert.False(math2.Eligible);
        Assert.Equal(["MATH1"], math2.MissingCodes);
    }

    // ---- helpers ----

    private CoursePlanComputeReader Repo() =>
        new(new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()));

    private static RequestContext Ctx() => Ctx(User, School);

    private static RequestContext Ctx(string userId, string? schoolId) =>
        RequestContext.Authenticated(
            new RequestActor(userId, "student", $"{userId}@e.st", "Student"),
            schoolId: schoolId, permissions: Array.Empty<string>(),
            tokenSource: TokenSource.DevelopmentHeader, isDevelopmentOverride: true);

    /// <summary>An RLS session on the APP login carrying the given caller's GUCs — used for negative controls.</summary>
    private async Task<NpgsqlConnection> OpenIdentitySessionAsync(string userId, string? schoolId)
    {
        var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand(
            "SELECT set_config('app.current_school_id', @s, false), set_config('app.current_user_id', @u, false)", conn);
        cmd.Parameters.AddWithValue("s", schoolId ?? string.Empty);
        cmd.Parameters.AddWithValue("u", userId);
        await cmd.ExecuteNonQueryAsync();
        return conn;
    }

    private static async Task<long> CountAsync(NpgsqlConnection conn, string table)
    {
        await using var cmd = new NpgsqlCommand($"""SELECT count(*) FROM "{table}" """, conn);
        return (long)(await cmd.ExecuteScalarAsync())!;
    }

    private static async Task Exec(NpgsqlConnection conn, string sql, params (string, object?)[] ps)
    {
        await using var cmd = new NpgsqlCommand(sql, conn);
        foreach (var (n, v) in ps) cmd.Parameters.AddWithValue(n, v ?? DBNull.Value);
        await cmd.ExecuteNonQueryAsync();
    }

    private static Task UserRow(NpgsqlConnection c, string id, string? school, int? grade) =>
        Exec(c, """INSERT INTO "users"("id","schoolId","gradeLevel") VALUES(@id,@s,@g)""", ("id", id), ("s", school), ("g", grade));

    private static Task PcaExam(NpgsqlConnection c, string user, string examType, bool completed) =>
        Exec(c, """INSERT INTO "pca_exam_sessions"("id","userId","examType","isCompleted","isActive") VALUES(gen_random_uuid()::text,@u,@t,@d,true)""",
            ("u", user), ("t", examType), ("d", completed));

    private static Task LiaSession(NpgsqlConnection c, string user, string status) =>
        Exec(c, """INSERT INTO "lia_assessment_sessions"("id","user_id","status","is_active") VALUES(gen_random_uuid()::text,@u,@s,true)""",
            ("u", user), ("s", status));

    private static Task PersonalitySession(NpgsqlConnection c, string user, string status) =>
        Exec(c, """INSERT INTO "personality_assessment_sessions"("id","user_id","status","is_active") VALUES(gen_random_uuid()::text,@u,@s,true)""",
            ("u", user), ("s", status));

    private static Task EvalGroup(NpgsqlConnection c, string user, bool completed) =>
        Exec(c, """INSERT INTO "evaluation_groups"("id","evaluatedUserId","isEvaluationCompleted","isActive") VALUES(gen_random_uuid()::text,@u,@d,true)""",
            ("u", user), ("d", completed));

    private static Task PcaEval(NpgsqlConnection c, string user, bool completed) =>
        Exec(c, """INSERT INTO "pca_evaluations"("id","userId","isCompleted") VALUES(gen_random_uuid()::text,@u,@d)""",
            ("u", user), ("d", completed));

    private static Task Enrollment(NpgsqlConnection c, string course, string student) =>
        Exec(c, """INSERT INTO "course_enrollments"("id","courseId","studentId","isActive") VALUES(gen_random_uuid()::text,@c,@s,true)""",
            ("c", course), ("s", student));

    private static Task Prefs(NpgsqlConnection c, string user, params string[] fields) =>
        Exec(c, """INSERT INTO "user_preferences"("id","userId","preferredFields") VALUES(gen_random_uuid()::text,@u,@f)""",
            ("u", user), ("f", fields));

    // Task-6 language-parity fold helpers.
    private static Task PreferredLanguages(NpgsqlConnection c, string user, params string[] languages) =>
        Exec(c, """
            INSERT INTO "user_preferences"("id","userId","preferredLanguages") VALUES(gen_random_uuid()::text,@u,@l)
            ON CONFLICT ("userId") DO UPDATE SET "preferredLanguages" = @l
            """, ("u", user), ("l", languages));

    private static Task UserSettings(NpgsqlConnection c, string user, string language) =>
        Exec(c, """INSERT INTO "user_settings"("id","userId","language") VALUES(gen_random_uuid()::text,@u,@l)""",
            ("u", user), ("l", language));

    // Task-6 engine-career-alignment fold helper. `careerMatchesJson` is inserted verbatim as jsonb.
    private static Task CareerProfile(NpgsqlConnection c, string user, string careerMatchesJson) =>
        Exec(c, """INSERT INTO "user_career_profiles"("id","userId","careerMatches") VALUES(gen_random_uuid()::text,@u,@cm::jsonb)""",
            ("u", user), ("cm", careerMatchesJson));

    // Runs the 4 completion loads with the minimum needed to make computeStudentCompletion.allDone true, so
    // language/engine-career tests can reach the catalog-loading branch without repeating this boilerplate.
    private static async Task CompleteAllAssessments(NpgsqlConnection c, string user)
    {
        foreach (var t in new[] { "PatternRecognition", "VerbalReasoning", "NumericVelocity", "WorkingMemory", "VisualRotation" })
        {
            await PcaExam(c, user, t, completed: true);
        }

        await EvalGroup(c, user, completed: true);
        await EvalGroup(c, user, completed: true);
        await EvalGroup(c, user, completed: true);
        await PcaEval(c, user, completed: true);
        await PersonalitySession(c, user, "completed");
    }

    private static Task Course_(NpgsqlConnection c, string id, string title, bool isActive = true, string language = "English") =>
        Exec(c, """INSERT INTO "courses"("id","title","isActive","language") VALUES(@id,@t,@a,@l)""",
            ("id", id), ("t", title), ("a", isActive), ("l", language));

    private static Task SchoolCourse(NpgsqlConnection c, string id, string school, string code, string[]? prereqs = null) =>
        Exec(c, """INSERT INTO "school_courses"("id","schoolId","code","prerequisites","status","isActive") VALUES(@id,@s,@c,@p,'active',true)""",
            ("id", id), ("s", school), ("c", code), ("p", prereqs ?? Array.Empty<string>()));

    private static Task Grade(NpgsqlConnection c, string id, string student, string school, string course, string status) =>
        Exec(c, """INSERT INTO "student_grades"("id","studentId","schoolId","courseId","status","isActive") VALUES(@id,@st,@s,@c,@stat,true)""",
            ("id", id), ("st", student), ("s", school), ("c", course), ("stat", status));

    /// <summary>
    /// formmaps#125 conversion. Nine of this fixture's thirteen tables are policied in production; the other four are
    /// named here so the gaps are recorded rather than assumed:
    ///
    /// <list type="bullet">
    /// <item><c>courses</c> — a DELIBERATE exclusion, listed under "global catalog/reference" in 005-sensitive.sql.</item>
    /// <item><c>school_courses</c> — carries a NOT NULL <c>schoolId</c> and appears in NONE of the vendored
    /// prisma/rls/*.sql files. GetEligibilityAsync's <c>WHERE "schoolId" = @school</c> is the only tenant boundary on
    /// it; pinned by
    /// <see cref="Eligibility_catalog_is_gated_only_by_the_readers_schoolId_predicate_because_school_courses_is_unpolicied"/>.</item>
    /// <item><c>lia_assessment_sessions</c>, <c>personality_assessment_sessions</c> — user-scoped assessment tables
    /// (<c>user_id</c>), also absent from every vendored policy file, unlike their siblings
    /// <c>pca_exam_sessions</c> / <c>pca_evaluations</c> / <c>evaluation_groups</c>, which 003/007 do policy.</item>
    /// </list>
    ///
    /// Do NOT add these to <see cref="PoliciedTables"/> to "fix" a failure — naming an unpolicied table throws by
    /// design, and inventing a policy here would make the suite assert something production does not do.
    /// </summary>
    public sealed class Fixture : RlsEnabledDatabaseFixture
    {
        protected override string SchemaResourceFileName => "course-plan-compute-schema.sql";

        protected override IReadOnlyCollection<string> PoliciedTables =>
        [
            "users", "pca_exam_sessions", "evaluation_groups", "pca_evaluations", "course_enrollments",
            "user_preferences", "user_settings", "user_career_profiles", "student_grades",
        ];
    }
}
