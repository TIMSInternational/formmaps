using FormMaps.Application.Auth;
using FormMaps.Application.SchoolStudents;
using FormMaps.Infrastructure.Data;
using FormMaps.Infrastructure.SchoolStudents;
using FormMaps.IntegrationTests.TestSupport.Rls;
using Npgsql;

namespace FormMaps.IntegrationTests.SchoolStudents;

/// <summary>
/// Real-DB (Testcontainers, NON-UTC container tz) tests for <see cref="SchoolStudentsReader"/>. Pins the three
/// school:manage roster reads: list (roster filter both-case + isActive + school scope, search ILIKE name/email,
/// createdDate-DESC + id tie-break pagination, derived status, totalPages, empty shape), detail (cross-school →
/// null, GPA via GradeMap + JsRound half-up tie, creditsRequired default vs active-rule-set override, credits
/// fallback to school_courses, PCA/MIL/Eval360 status, school-scoped alertCount, lastActive ISO-Z), and
/// community-service (cross-school → null, hours STRING via trim_scale, date-DESC + id tie-break, isActive filter,
/// verifiedAt null passthrough, serviceHoursRequired ?? 0).
/// </summary>
public sealed class SchoolStudentsReaderTests : IClassFixture<SchoolStudentsDatabaseFixture>, IAsyncLifetime
{
    private const string School = "school-1";
    private const string OtherSchool = "school-2";

    private readonly SchoolStudentsDatabaseFixture _fixture;

    /// <summary>Restricted login (NOSUPERUSER NOBYPASSRLS) — the reader under test runs on this.</summary>
    private NpgsqlDataSource _dataSource = null!;

    /// <summary>Container superuser — seeding, TRUNCATE and assertions ONLY.</summary>
    private NpgsqlDataSource _adminDataSource = null!;

    public SchoolStudentsReaderTests(SchoolStudentsDatabaseFixture fixture) => _fixture = fixture;

    public async Task InitializeAsync()
    {
        _dataSource = NpgsqlDataSource.Create(_fixture.AppConnectionString);
        _adminDataSource = NpgsqlDataSource.Create(_fixture.AdminConnectionString);
        await _fixture.TruncateAsync(
            "users", "student_grades", "academic_years", "graduation_rule_sets", "school_courses",
            "pca_evaluations", "pca_exam_sessions", "evaluation_groups", "student_alerts",
            "community_service_entries", "schools");
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
        // conditional on this being true.
        await using var conn = await _dataSource.OpenConnectionAsync();
        Assert.False(await ProductionRlsPolicies.BypassesRlsAsync(conn), "the app login must not bypass RLS");

        Assert.Equal(
            new[]
            {
                "academic_years", "community_service_entries", "course_change_requests", "evaluation_groups",
                "graduation_rule_sets", "pca_evaluations", "pca_exam_sessions", "school_assessment_settings",
                "student_alerts", "student_grades", "student_parent_links", "users",
            },
            _fixture.AppliedPolicyTables.ToArray());

        // The three this fixture models that are unpolicied HERE. Asserted rather than assumed so a future policy
        // file that closes one shows up here instead of silently changing the meaning of the app-layer tests below.
        // NOT all three are unpolicied in production, and the distinction matters (formmaps#135):
        //   schools              — genuinely unpolicied; the tenant root, no schoolId to scope it by.
        //   school_courses       — POLICIED IN PRODUCTION by pilot.sql, which this harness does not vendor.
        //   student_course_plans — likewise policied in production by pilot.sql.
        // So the last two assertions describe the harness, not production. They are expected to flip when
        // pilot.sql is vendored; that is the point of asserting them.
        Assert.DoesNotContain("school_courses", _fixture.AppliedPolicyTables);
        Assert.DoesNotContain("student_course_plans", _fixture.AppliedPolicyTables);
        Assert.DoesNotContain("schools", _fixture.AppliedPolicyTables);
    }

    // ---- RLS is load-bearing where the reader has no predicate of its own ----

    [Fact]
    public async Task Detail_cross_school_student_row_is_invisible_not_merely_filtered()
    {
        // GetStudentDetailAsync selects the student by id with NO schoolId predicate and compares in code. The
        // FIRST half is the negative control for the second: the row really is there.
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await SeedUser(conn, "sx", OtherSchool, role: "Student");
        Assert.Equal(1L, await CountAsync(conn, """SELECT count(*) FROM "users" WHERE "id" = 'sx'"""));

        await using var identity = await OpenIdentitySessionAsync("admin-1", School);
        Assert.Equal(0L, await CountAsync(identity, """SELECT count(*) FROM "users" WHERE "id" = 'sx'"""));

        Assert.Null(await Reader().GetStudentDetailAsync(Ctx(), School, "sx"));
    }

    [Fact]
    public async Task Detail_gpa_excludes_a_cross_school_grade_row_that_ONLY_rls_hides()
    {
        // The grades query is `WHERE "studentId" = @id AND status/isActive/grade` — there is NO schoolId predicate,
        // so a student_grades row mis-tenanted to another school is filtered by the POLICY alone. Under the old
        // superuser fixture this test would compute 2.0 (the mean of A and F).
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await SeedUser(conn, "s1", School, role: "Student");
        await SeedGrade(conn, "own", "s1", "c1", grade: "A", credits: 1);
        await SeedGrade(conn, "foreign", "s1", "c1", grade: "F", credits: 1, schoolId: OtherSchool);

        // Negative control: both rows exist, and the caller's session sees exactly one of them.
        Assert.Equal(2L, await CountAsync(conn, """SELECT count(*) FROM "student_grades" """));
        await using var identity = await OpenIdentitySessionAsync("admin-1", School);
        Assert.Equal(1L, await CountAsync(identity, """SELECT count(*) FROM "student_grades" """));

        var detail = await Reader().GetStudentDetailAsync(Ctx(), School, "s1");
        Assert.Equal(4.0, detail!.Gpa);          // the A only
        Assert.Equal(1, detail.CreditProgress.Earned);
    }

    // ---- the school-scoped adversary: rows RLS ADMITS that only the app predicate denies ----

    [Fact]
    public async Task Community_service_does_not_leak_a_classmates_entries_that_RLS_admits()
    {
        // THE useful adversary here is not a school-less caller — the policy would hide the victim row from one of
        // those anyway and a reader with no studentId predicate would still look correct. It is a caller INSIDE the
        // same school, which every same-school row is admitted to. GetStudentCommunityServiceAsync has no schoolId
        // predicate at all: `WHERE "studentId" = @id AND "isActive" = true` is the whole gate.
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await SeedUser(conn, "s1", School, role: "Student");
        await SeedUser(conn, "s2", School, role: "Student");   // a classmate, same tenant
        await SeedSchool(conn, School, serviceHoursRequired: 40);
        await SeedCommunity(conn, "mine", "s1", School, hours: 1m, date: Utc("2026-01-01"));
        await SeedCommunity(conn, "theirs", "s2", School, hours: 9m, date: Utc("2026-01-02"));

        // The policy ADMITS both rows to this caller — that is the point. If it hid the classmate's row this test
        // would prove nothing about the repository.
        await using var identity = await OpenIdentitySessionAsync("admin-1", School);
        Assert.Equal(2L, await CountAsync(identity, """SELECT count(*) FROM "community_service_entries" """));

        var mine = await Reader().GetStudentCommunityServiceAsync(Ctx(), School, "s1");
        Assert.Equal(new[] { "mine" }, mine!.Entries.Select(e => e.Id).ToArray());      // legitimate read still works

        var theirs = await Reader().GetStudentCommunityServiceAsync(Ctx(), School, "s2");
        Assert.Equal(new[] { "theirs" }, theirs!.Entries.Select(e => e.Id).ToArray());  // ...and does not bleed into the other's
    }

    [Fact]
    public async Task Alert_count_excludes_a_mistenanted_alert_the_policy_admits()
    {
        // 005-sensitive.sql scopes student_alerts through the STUDENT's users row, not through the alert's own
        // schoolId column. So an alert carrying school-2 but pointing at a school-1 student is fully visible to a
        // school-1 caller, and only the reader's `"schoolId" = @school` keeps it out of the count.
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await SeedUser(conn, "s1", School, role: "Student");
        await SeedAlert(conn, "own", "s1", School, isRead: false, isDismissed: false);
        await SeedAlert(conn, "mistenanted", "s1", OtherSchool, isRead: false, isDismissed: false);

        await using var identity = await OpenIdentitySessionAsync("admin-1", School);
        Assert.Equal(2L, await CountAsync(identity, """SELECT count(*) FROM "student_alerts" """)); // RLS admits BOTH

        var detail = await Reader().GetStudentDetailAsync(Ctx(), School, "s1");
        Assert.Equal(1, detail!.AlertCount);
    }

    // ---- list ----

    [Fact]
    public async Task List_filters_roster_and_derives_status_and_pagination()
    {
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        // active students both-case in school; 1 inactive (excluded); 1 other-school; 1 non-student role.
        await SeedUser(conn, "s1", School, role: "Student", createdDate: Utc("2026-01-01"));
        await SeedUser(conn, "s2", School, role: "student", createdDate: Utc("2026-01-03"));
        await SeedUser(conn, "s3", School, role: "Student", createdDate: Utc("2026-01-02"));
        await SeedUser(conn, "s4", School, role: "Student", isActive: false);
        await SeedUser(conn, "sx", OtherSchool, role: "Student");
        await SeedUser(conn, "co", School, role: "counselor");

        var result = await Reader().ListStudentsAsync(Ctx(), School, Query(page: 1, limit: 20));

        Assert.Equal(3, result.Total);
        Assert.Equal(1, result.TotalPages);
        // createdDate DESC: s2 (01-03), s3 (01-02), s1 (01-01).
        Assert.Equal(new[] { "s2", "s3", "s1" }, result.Data.Select(d => d.Id).ToArray());
        Assert.All(result.Data, d => Assert.Equal("active", d.Status));
    }

    [Fact]
    public async Task List_paginates_with_totalPages_and_offset()
    {
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        for (var i = 0; i < 5; i++)
        {
            await SeedUser(conn, $"s{i}", School, createdDate: Utc($"2026-01-0{i + 1}"));
        }

        var page2 = await Reader().ListStudentsAsync(Ctx(), School, Query(page: 2, limit: 2));

        Assert.Equal(5, page2.Total);
        Assert.Equal(3, page2.TotalPages); // ceil(5/2)
        Assert.Equal(2, page2.Page);
        // DESC by createdDate: [s4,s3],[s2,s1],[s0] → page 2 = s2,s1.
        Assert.Equal(new[] { "s2", "s1" }, page2.Data.Select(d => d.Id).ToArray());
    }

    [Fact]
    public async Task List_search_matches_name_or_email_case_insensitively()
    {
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await SeedUser(conn, "s1", School, name: "Ada Lovelace", email: "ada@e.st");
        await SeedUser(conn, "s2", School, name: "Grace Hopper", email: "grace@e.st");
        await SeedUser(conn, "s3", School, name: "Someone", email: "ADALINE@e.st");

        var byName = await Reader().ListStudentsAsync(Ctx(), School, Query(search: "ada"));

        // "ada" ILIKE matches "Ada Lovelace" (name) and "ADALINE@e.st" (email).
        Assert.Equal(new[] { "s1", "s3" }, byName.Data.Select(d => d.Id).OrderBy(x => x).ToArray());
        Assert.Equal(2, byName.Total);
    }

    [Fact]
    public async Task List_empty_returns_zero_total_and_zero_pages()
    {
        var result = await Reader().ListStudentsAsync(Ctx(), School, Query(limit: 20));
        Assert.Empty(result.Data);
        Assert.Equal(0, result.Total);
        Assert.Equal(0, result.TotalPages);
    }

    // ---- detail ----

    [Fact]
    public async Task Detail_missing_or_cross_school_returns_null()
    {
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await SeedUser(conn, "sx", OtherSchool, role: "Student");

        Assert.Null(await Reader().GetStudentDetailAsync(Ctx(), School, "nope"));   // missing
        Assert.Null(await Reader().GetStudentDetailAsync(Ctx(), School, "sx"));     // other school
    }

    [Fact]
    public async Task Detail_gpa_uses_grade_map_and_JsRound_half_up_tie()
    {
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await SeedUser(conn, "s1", School, role: "Student", gradeLevel: 11);
        // 2×C- (1.7) + 6×F (0) → mean 3.4/8 = 0.425 → JsRound(42.5)=43 → 0.43 (banker's ToEven would give 0.42).
        await SeedGrade(conn, "g1", "s1", "c1", grade: "C-", credits: 1);
        await SeedGrade(conn, "g2", "s1", "c1", grade: "C-", credits: 1);
        for (var i = 0; i < 6; i++)
        {
            await SeedGrade(conn, $"gf{i}", "s1", "c1", grade: "F", credits: 1);
        }

        // an unmapped grade ("P") and a not-completed row are ignored by GPA.
        await SeedGrade(conn, "gp", "s1", "c1", grade: "P", credits: 1);
        await SeedGrade(conn, "gn", "s1", "c1", grade: "A", credits: 1, status: "in_progress");

        var detail = await Reader().GetStudentDetailAsync(Ctx(), School, "s1");

        Assert.NotNull(detail);
        Assert.Equal(0.43, detail!.Gpa);
    }

    [Fact]
    public async Task Detail_gpa_null_when_no_mapped_grades()
    {
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await SeedUser(conn, "s1", School, role: "Student");
        await SeedGrade(conn, "g1", "s1", "c1", grade: "P", credits: 3);   // unmapped → dropped

        var detail = await Reader().GetStudentDetailAsync(Ctx(), School, "s1");
        Assert.Null(detail!.Gpa);
    }

    [Fact]
    public async Task Detail_credits_use_own_when_positive_else_course_fallback_and_required_override()
    {
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await SeedUser(conn, "s1", School, role: "Student");
        // active current AY + active rule set → required overridden to 100.
        await SeedAcademicYear(conn, "ay1", School, isCurrent: true);
        await SeedRuleSet(conn, "rs1", School, "ay1", total: 100, isActive: true);
        // course fallback map: c1 → 3 credits (active); c2 not present (falls back to 0).
        await SeedCourse(conn, "c1", School, credits: 3);
        // g1 own credits 2.5 (>0) → uses 2.5; g2 own 0 → falls back to c1 map (3); g3 own 0, course c2 missing → 0.
        await SeedGrade(conn, "g1", "s1", "c1", grade: "A", credits: 2.5m);
        await SeedGrade(conn, "g2", "s1", "c1", grade: "B", credits: 0);
        await SeedGrade(conn, "g3", "s1", "c2", grade: "B", credits: 0);

        var detail = await Reader().GetStudentDetailAsync(Ctx(), School, "s1");

        Assert.Equal(100, detail!.CreditProgress.Required);          // rule-set override
        Assert.Equal(5.5, detail.CreditProgress.Earned);             // 2.5 + 3 + 0
        Assert.Equal(6, detail.CreditProgress.Percentage);           // JsRound(5.5/100*100)=6 (5.5→6)
    }

    [Fact]
    public async Task Detail_required_defaults_to_120_without_current_year_rule_set()
    {
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await SeedUser(conn, "s1", School, role: "Student");

        var detail = await Reader().GetStudentDetailAsync(Ctx(), School, "s1");
        Assert.Equal(120, detail!.CreditProgress.Required);
        Assert.Equal(0, detail.CreditProgress.Earned);
        Assert.Equal(0, detail.CreditProgress.Percentage);
    }

    [Fact]
    public async Task Detail_assessment_status_reflects_pca_mil_eval360()
    {
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await SeedUser(conn, "s1", School, role: "Student");
        await SeedPca(conn, "p1", "s1");                                    // PCA completed
        for (var i = 0; i < 5; i++)
        {
            await SeedSession(conn, $"e{i}", "s1", "Completed");           // 5 completed → MIL completed
        }

        // Eval360: parent + teacher + sibling_friend all completed → completed (self/other ignored).
        await SeedGroup(conn, "grp-p", "s1", "parent", completed: true);
        await SeedGroup(conn, "grp-t", "s1", "Teacher", completed: true);   // normalizeGroupType case-insensitive
        await SeedGroup(conn, "grp-s", "s1", "sibling_friend", completed: true);

        var detail = await Reader().GetStudentDetailAsync(Ctx(), School, "s1");

        Assert.Equal("completed", detail!.AssessmentStatus.Pca);
        Assert.Equal("completed", detail.AssessmentStatus.Mil);
        Assert.Equal("completed", detail.AssessmentStatus.Eval360);
    }

    [Fact]
    public async Task Detail_mil_in_progress_and_eval360_in_progress_partial()
    {
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await SeedUser(conn, "s1", School, role: "Student");
        await SeedSession(conn, "e1", "s1", "Completed");                   // 1 completed (<5) → in_progress
        await SeedGroup(conn, "grp-p", "s1", "parent", completed: true);    // only parent → not all three
        await SeedGroup(conn, "grp-t", "s1", "teacher", completed: false);

        var detail = await Reader().GetStudentDetailAsync(Ctx(), School, "s1");

        Assert.Equal("not_started", detail!.AssessmentStatus.Pca);         // no pca_evaluations row
        Assert.Equal("in_progress", detail.AssessmentStatus.Mil);
        Assert.Equal("in_progress", detail.AssessmentStatus.Eval360);      // groups exist, not all completed
    }

    [Fact]
    public async Task Detail_alert_count_is_school_scoped_and_unread_undismissed()
    {
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await SeedUser(conn, "s1", School, role: "Student", gradeLevel: 12);
        await SeedAlert(conn, "a1", "s1", School, isRead: false, isDismissed: false); // counts
        await SeedAlert(conn, "a2", "s1", School, isRead: true, isDismissed: false);  // read → excluded
        await SeedAlert(conn, "a3", "s1", School, isRead: false, isDismissed: true);  // dismissed → excluded
        await SeedAlert(conn, "a4", "s1", OtherSchool, isRead: false, isDismissed: false); // other school → excluded

        var detail = await Reader().GetStudentDetailAsync(Ctx(), School, "s1");

        Assert.Equal(1, detail!.AlertCount);
        Assert.Equal(12, detail.GradeLevel);
        Assert.Equal("active", detail.Status);
    }

    [Fact]
    public async Task Detail_last_active_is_iso_z_from_updated_at()
    {
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await SeedUser(conn, "s1", School, role: "Student",
            createdDate: Utc("2026-01-01"), updatedAt: Utc("2026-02-03"));

        var detail = await Reader().GetStudentDetailAsync(Ctx(), School, "s1");
        Assert.Equal("2026-02-03T00:00:00.000Z", detail!.LastActive);
    }

    // ---- community-service ----

    [Fact]
    public async Task Community_missing_or_cross_school_returns_null()
    {
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await SeedUser(conn, "sx", OtherSchool, role: "Student");

        Assert.Null(await Reader().GetStudentCommunityServiceAsync(Ctx(), School, "nope"));
        Assert.Null(await Reader().GetStudentCommunityServiceAsync(Ctx(), School, "sx"));
    }

    [Fact]
    public async Task Community_returns_active_entries_hours_string_and_service_hours()
    {
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await SeedUser(conn, "s1", School, role: "Student");
        await SeedSchool(conn, School, serviceHoursRequired: 40);
        // hours 5.50 → trim_scale → "5.5" STRING. date DESC + id tie-break; inactive excluded.
        await SeedCommunity(conn, "e1", "s1", School, hours: 5.50m, date: Utc("2026-01-05"), status: "verified", verifiedAt: Utc("2026-01-06"));
        await SeedCommunity(conn, "e2", "s1", School, hours: 2m, date: Utc("2026-01-10"), status: "pending");
        await SeedCommunity(conn, "e3", "s1", School, hours: 1m, date: Utc("2026-01-01"), isActive: false); // excluded

        var result = await Reader().GetStudentCommunityServiceAsync(Ctx(), School, "s1");

        Assert.NotNull(result);
        Assert.Equal(40, result!.TotalHoursRequired);
        Assert.Equal(new[] { "e2", "e1" }, result.Entries.Select(e => e.Id).ToArray()); // date DESC
        var e1 = result.Entries.Single(e => e.Id == "e1");
        Assert.Equal("5.5", e1.Hours);                       // STRING, trailing zero trimmed
        Assert.Equal("verified", e1.Status);
        Assert.Equal("2026-01-06T00:00:00.000Z", e1.VerifiedAt);
        var e2 = result.Entries.Single(e => e.Id == "e2");
        Assert.Null(e2.VerifiedAt);                          // null passthrough
    }

    [Fact]
    public async Task Community_total_hours_defaults_to_zero_when_null()
    {
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await SeedUser(conn, "s1", School, role: "Student");
        await SeedSchool(conn, School, serviceHoursRequired: null);

        var result = await Reader().GetStudentCommunityServiceAsync(Ctx(), School, "s1");
        Assert.Equal(0, result!.TotalHoursRequired);
        Assert.Empty(result.Entries);
    }

    // ---- helpers ----

    private SchoolStudentsReader Reader() =>
        new(new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()));

    private static RequestContext Ctx() =>
        RequestContext.Authenticated(
            new RequestActor("admin-1", "school-admin", "admin@e.st", "Admin"),
            schoolId: School, permissions: new[] { "school:manage" },
            tokenSource: TokenSource.DevelopmentHeader, isDevelopmentOverride: true);

    private static StudentListQuery Query(int page = 1, int limit = 20, string? search = null) =>
        new(page, limit, (long)(page - 1) * limit, search);

    private static DateTime Utc(string date) => DateTime.Parse(date + "T00:00:00Z").ToUniversalTime();

    private static DateTime Unspec(DateTime utc) => DateTime.SpecifyKind(utc, DateTimeKind.Unspecified);

    /// <summary>
    /// A raw connection on the RESTRICTED login carrying the GUCs the session factory sets for an Identity-mode
    /// caller — used to state what the POLICIES do, independently of any repository. Session-level rather than
    /// transaction-local because there is no transaction; safe only because Npgsql sends <c>DISCARD ALL</c> when a
    /// pooled connection is returned.
    /// </summary>
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

    private static async Task<long> CountAsync(NpgsqlConnection conn, string sql)
    {
        await using var cmd = new NpgsqlCommand(sql, conn);
        return (long)(await cmd.ExecuteScalarAsync())!;
    }

    private static async Task SeedUser(
        NpgsqlConnection conn, string id, string schoolId, string role = "Student", bool isActive = true,
        int? gradeLevel = null, string? name = null, string? email = null,
        DateTime? createdDate = null, DateTime? updatedAt = null)
    {
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "users" ("id","name","email","roleName","schoolId","gradeLevel","isActive","createdDate","updatedAt")
            VALUES (@id,@n,@e,@r,@s,@g,@a,@cd,@ua)
            """, conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("n", name ?? $"Name {id}");
        cmd.Parameters.AddWithValue("e", email ?? $"{id}@e.st");
        cmd.Parameters.AddWithValue("r", role);
        cmd.Parameters.AddWithValue("s", schoolId);
        cmd.Parameters.AddWithValue("g", (object?)gradeLevel ?? DBNull.Value);
        cmd.Parameters.AddWithValue("a", isActive);
        cmd.Parameters.AddWithValue("cd", Unspec(createdDate ?? DateTime.UtcNow));
        cmd.Parameters.AddWithValue("ua", Unspec(updatedAt ?? createdDate ?? DateTime.UtcNow));
        await cmd.ExecuteNonQueryAsync();
    }

    // schoolId defaults to the caller's school because 002-direct-schoolid.sql scopes student_grades on THIS column,
    // not on the student's users row: a grade row left with a null schoolId is invisible to every Identity session,
    // and the GPA/credit assertions below would then pass against an empty set. Pass one explicitly where the
    // tenancy of the row is the point.
    private static async Task SeedGrade(
        NpgsqlConnection conn, string id, string studentId, string courseId,
        string? grade, decimal credits, string status = "completed", bool isActive = true, string? schoolId = School)
    {
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "student_grades" ("id","studentId","schoolId","courseId","grade","credits","status","isActive")
            VALUES (@id,@st,@sch,@c,@g,@cr,@s,@a)
            """, conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("st", studentId);
        cmd.Parameters.AddWithValue("sch", (object?)schoolId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("c", courseId);
        cmd.Parameters.AddWithValue("g", (object?)grade ?? DBNull.Value);
        cmd.Parameters.AddWithValue("cr", credits);
        cmd.Parameters.AddWithValue("s", status);
        cmd.Parameters.AddWithValue("a", isActive);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task SeedAcademicYear(NpgsqlConnection conn, string id, string schoolId, bool isCurrent)
    {
        await using var cmd = new NpgsqlCommand(
            """INSERT INTO "academic_years" ("id","schoolId","isCurrent") VALUES (@id,@s,@c)""", conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("s", schoolId);
        cmd.Parameters.AddWithValue("c", isCurrent);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task SeedRuleSet(
        NpgsqlConnection conn, string id, string schoolId, string academicYearId, decimal total, bool isActive)
    {
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "graduation_rule_sets" ("id","schoolId","academicYearId","totalCreditsRequired","isActive")
            VALUES (@id,@s,@ay,@t,@a)
            """, conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("s", schoolId);
        cmd.Parameters.AddWithValue("ay", academicYearId);
        cmd.Parameters.AddWithValue("t", total);
        cmd.Parameters.AddWithValue("a", isActive);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task SeedCourse(NpgsqlConnection conn, string id, string schoolId, decimal credits, bool isActive = true)
    {
        await using var cmd = new NpgsqlCommand(
            """INSERT INTO "school_courses" ("id","schoolId","credits","isActive") VALUES (@id,@s,@cr,@a)""", conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("s", schoolId);
        cmd.Parameters.AddWithValue("cr", credits);
        cmd.Parameters.AddWithValue("a", isActive);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task SeedPca(NpgsqlConnection conn, string id, string userId)
    {
        await using var cmd = new NpgsqlCommand(
            """INSERT INTO "pca_evaluations" ("id","userId") VALUES (@id,@u)""", conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("u", userId);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task SeedSession(NpgsqlConnection conn, string id, string userId, string status)
    {
        await using var cmd = new NpgsqlCommand(
            """INSERT INTO "pca_exam_sessions" ("id","userId","status") VALUES (@id,@u,@st)""", conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("u", userId);
        cmd.Parameters.AddWithValue("st", status);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task SeedGroup(NpgsqlConnection conn, string id, string userId, string groupType, bool completed)
    {
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "evaluation_groups" ("id","evaluatedUserId","groupType","isEvaluationCompleted")
            VALUES (@id,@u,@gt,@c)
            """, conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("u", userId);
        cmd.Parameters.AddWithValue("gt", groupType);
        cmd.Parameters.AddWithValue("c", completed);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task SeedAlert(
        NpgsqlConnection conn, string id, string studentId, string schoolId, bool isRead, bool isDismissed)
    {
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "student_alerts" ("id","studentId","schoolId","isRead","isDismissed")
            VALUES (@id,@st,@s,@r,@d)
            """, conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("st", studentId);
        cmd.Parameters.AddWithValue("s", schoolId);
        cmd.Parameters.AddWithValue("r", isRead);
        cmd.Parameters.AddWithValue("d", isDismissed);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task SeedSchool(NpgsqlConnection conn, string id, int? serviceHoursRequired)
    {
        await using var cmd = new NpgsqlCommand(
            """INSERT INTO "schools" ("id","serviceHoursRequired") VALUES (@id,@s)""", conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("s", (object?)serviceHoursRequired ?? DBNull.Value);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task SeedCommunity(
        NpgsqlConnection conn, string id, string studentId, string schoolId, decimal hours, DateTime date,
        string status = "pending", bool isActive = true, DateTime? verifiedAt = null)
    {
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "community_service_entries"
                ("id","studentId","schoolId","organization","hours","date","status","verifiedAt","isActive","createdDate","updatedAt")
            VALUES (@id,@st,@s,@org,@h,@d,@status::"CommunityServiceStatus",@va,@a,@cd,@cd)
            """, conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("st", studentId);
        cmd.Parameters.AddWithValue("s", schoolId);
        cmd.Parameters.AddWithValue("org", "Org " + id);
        cmd.Parameters.AddWithValue("h", hours);
        cmd.Parameters.AddWithValue("d", Unspec(date));
        cmd.Parameters.AddWithValue("status", status);
        cmd.Parameters.AddWithValue("va", (object?)(verifiedAt is null ? null : Unspec(verifiedAt.Value)) ?? DBNull.Value);
        cmd.Parameters.AddWithValue("a", isActive);
        cmd.Parameters.AddWithValue("cd", Unspec(DateTime.UtcNow));
        await cmd.ExecuteNonQueryAsync();
    }
}
