using System.Collections.Concurrent;
using FormMaps.Application.Auth;
using FormMaps.Application.Email;
using FormMaps.Infrastructure.Data;
using FormMaps.Infrastructure.SchoolAdmin;
using FormMaps.IntegrationTests.TestSupport.Rls;
using Npgsql;

namespace FormMaps.IntegrationTests.SchoolAdmin;

/// <summary>
/// Real-DB (Testcontainers) tests for <see cref="SchoolAdminEmailWriter"/> (FM-DOTNET-045). Pins setup360's
/// bulk evaluation_groups create (self-as-Parent + parent-links + counselor-as-Teacher), the dedup skip on the
/// existing-groups key, gradeLevel resolution, empty→null; and sendReminders' school-404→null + sent/failed
/// counting. A fake IEmailSender records calls (no real SES); EmailTemplates renders the real HTML.
/// Runs the writer on the restricted login with the production policies live (formmaps#125); the counselor lookup's
/// school predicate is pinned with a super-admin (RLS-bypass) caller, for whom that predicate is the only gate.
/// </summary>
public sealed class SchoolAdminEmailWriterTests : IClassFixture<SchoolAdminDatabaseFixture>, IAsyncLifetime
{
    private const string School = "school-1";
    private const string OtherSchool = "school-2";
    private const string Actor = "admin-1";

    private readonly SchoolAdminDatabaseFixture _fixture;

    /// <summary>Restricted login (NOSUPERUSER NOBYPASSRLS) — the writer under test runs on this.</summary>
    private NpgsqlDataSource _dataSource = null!;

    /// <summary>Container superuser — seeding and assertions ONLY.</summary>
    private NpgsqlDataSource _adminDataSource = null!;

    public SchoolAdminEmailWriterTests(SchoolAdminDatabaseFixture fixture) => _fixture = fixture;

    public async Task InitializeAsync()
    {
        _dataSource = NpgsqlDataSource.Create(_fixture.AppConnectionString);
        _adminDataSource = NpgsqlDataSource.Create(_fixture.AdminConnectionString);
        await _fixture.TruncateAsync("evaluation_groups", "users", "schools", "student_parent_links", "counselor_student_assignments");
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
                "assessment_schedules", "counselor_student_assignments", "evaluation_groups", "pca_evaluations",
                "pca_exam_sessions", "school_assessment_settings", "student_parent_links", "users",
            },
            _fixture.AppliedPolicyTables.ToArray());

        // The three this fixture models that are unpolicied — here AND in production (schools is the tenant root;
        // the two session tables are recorded PENDING in scripts/check-rls-coverage.mjs). Asserted so a future policy
        // file that closes one shows up here instead of silently changing what the tests below prove.
        Assert.DoesNotContain("schools", _fixture.AppliedPolicyTables);
        Assert.DoesNotContain("lia_assessment_sessions", _fixture.AppliedPolicyTables);
        Assert.DoesNotContain("personality_assessment_sessions", _fixture.AppliedPolicyTables);
    }

    // ---- the cross-school counselor (Wave 3 #139 schooladmin-email-tenant) ----

    [Fact]
    public async Task Setup360_does_not_load_or_mail_a_cross_school_counselor_for_a_super_admin_caller()
    {
        // A super-admin resolves to a Bypass GUC plan (TenantGucPlanResolver), so 005-sensitive.sql admits EVERY
        // users row to this session — the writer's own `"schoolId" = @sid` on the counselor lookup is the only thing
        // between a school-B counselor's name/email and an invitation token in school A's outgoing mail. A
        // school-scoped caller would prove nothing here: the policy hides the row by itself (see the next test).
        await SeedSchoolAsync();
        await SeedUserAsync("stu-1", "Ana Student", "ana@school.test", "student", School, gradeLevel: 10);
        await SeedUserAsync("cou-a", "Carla Counselor", "carla@school.test", "counselor", School);
        await SeedUserAsync("cou-b", "Bea Foreign", "bea@other.test", "counselor", OtherSchool);   // different tenant
        await SeedUserAsync("super-1", "Sam Super", "sam@school.test", "Super Admin", School);
        await SeedCounselorAssignmentAsync("stu-1", "cou-b");   // the assignment points OUT of the school

        // Negative control for the negative control: the row is there, and a restricted-login session carrying the
        // bypass GUC (the policies' first OR-branch, not a role privilege) really does see it.
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await using var bypass = await OpenBypassSessionAsync();
        Assert.False(await ProductionRlsPolicies.BypassesRlsAsync(bypass));
        Assert.Equal(1L, await CountAsync(conn, """SELECT count(*) FROM "users" WHERE "id" = 'cou-b'"""));
        Assert.Equal(1L, await CountAsync(bypass, """SELECT count(*) FROM "users" WHERE "id" = 'cou-b'"""));

        var sender = new FakeSender(alwaysTrue: true);
        var result = await Writer(sender).Setup360Async(SuperCtx("super-1"), School, "super-1", ["stu-1"], null);

        Assert.NotNull(result);
        Assert.Equal(1, result!.Created);           // self only — NO Teacher group for the foreign counselor
        Assert.Equal(0, result.EmailsSent);
        Assert.Empty(sender.Sent);                  // nothing went to bea@other.test
        var groups = await GroupsAsync("stu-1");
        Assert.Single(groups);
        Assert.DoesNotContain(groups, g => g.GroupType == "Teacher");
        Assert.DoesNotContain(groups, g => g.Email == "bea@other.test");

        // Positive half over the SAME session shape: a same-school assignment for the same caller does mail the
        // counselor, so the assertions above are about the predicate and not about a lookup that never works.
        await Exec("""UPDATE "counselor_student_assignments" SET "counselorId" = @c WHERE "studentId" = 'stu-1'""", ("c", "cou-a"));
        var again = await Writer(sender).Setup360Async(SuperCtx("super-1"), School, "super-1", ["stu-1"], null);
        Assert.Equal(1, again!.Created);            // the Teacher group (self was deduped)
        Assert.Equal(1, again.EmailsSent);
        Assert.Equal("carla@school.test", Assert.Single(sender.Sent).To);
    }

    [Fact]
    public async Task Setup360_cross_school_counselor_row_is_invisible_to_a_school_admin_caller()
    {
        // The school-scoped caller: 005-sensitive.sql hides the foreign users row from an Identity session, so
        // here RLS and the predicate agree. Asserted through the restricted login so the backstop is real, not
        // assumed — and the first two counts show the row exists and the policy (not the seed) is what hides it.
        await SeedSchoolAsync();
        await SeedUserAsync("stu-1", "Ana Student", "ana@school.test", "student", School, gradeLevel: 10);
        await SeedUserAsync("cou-b", "Bea Foreign", "bea@other.test", "counselor", OtherSchool);
        await SeedCounselorAssignmentAsync("stu-1", "cou-b");

        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await using var identity = await OpenIdentitySessionAsync(Actor, School);
        Assert.False(await ProductionRlsPolicies.BypassesRlsAsync(identity));
        Assert.Equal(1L, await CountAsync(conn, """SELECT count(*) FROM "users" WHERE "id" = 'cou-b'"""));
        Assert.Equal(0L, await CountAsync(identity, """SELECT count(*) FROM "users" WHERE "id" = 'cou-b'"""));

        var sender = new FakeSender(alwaysTrue: true);
        var result = await Writer(sender).Setup360Async(Ctx(), School, Actor, ["stu-1"], null);

        Assert.NotNull(result);
        Assert.Equal(1, result!.Created);           // self only
        Assert.Equal(0, result.EmailsSent);
        Assert.Empty(sender.Sent);
        Assert.DoesNotContain(await GroupsAsync("stu-1"), g => g.GroupType == "Teacher");
    }

    [Fact]
    public async Task Setup360_creates_self_parent_counselor_groups_and_emails_non_self()
    {
        await SeedSchoolAsync();
        await SeedUserAsync("stu-1", "Ana Student", "ana@school.test", "student", School, gradeLevel: 10);
        await SeedUserAsync("cou-1", "Carla Counselor", "carla@school.test", "counselor", School);
        await SeedParentLinkAsync("stu-1", "PARENT@Example.com", "Pat Parent", "Mother");
        await SeedCounselorAssignmentAsync("stu-1", "cou-1");

        var sender = new FakeSender(alwaysTrue: true);
        var result = await Writer(sender).Setup360Async(Ctx(), School, Actor, ["stu-1"], null);

        Assert.NotNull(result);
        Assert.Equal(3, result!.Created);            // self + parent + counselor
        Assert.Equal(0, result.Skipped);
        Assert.Equal(2, result.EmailsSent);          // parent + counselor (NOT self)
        Assert.Equal(1, result.StudentsProcessed);
        Assert.Equal(2, sender.Sent.Count);          // no email for the self group

        var groups = await GroupsAsync("stu-1");
        Assert.Equal(3, groups.Count);
        Assert.Contains(groups, g => g.Relation == "Self" && g.GroupType == "Parent" && g.Email == "ana@school.test");
        Assert.Contains(groups, g => g.Relation == "Mother" && g.GroupType == "Parent" && g.Email == "parent@example.com"); // lowercased
        Assert.Contains(groups, g => g.Relation == "Counselor" && g.GroupType == "Teacher" && g.Email == "carla@school.test");
        Assert.All(groups, g => Assert.False(string.IsNullOrEmpty(g.Token)));            // token minted
        Assert.All(groups, g => Assert.Equal(Actor, g.CreatedBy));
    }

    [Fact]
    public async Task Setup360_skips_existing_group_by_dedup_key()
    {
        await SeedSchoolAsync();
        await SeedUserAsync("stu-1", "Ana", "ana@school.test", "student", School);
        // Pre-existing self group (evaluatedUserId|evaluatorEmail|groupType).
        await SeedGroupAsync("stu-1", "ana@school.test", "Parent");

        var sender = new FakeSender(alwaysTrue: true);
        var result = await Writer(sender).Setup360Async(Ctx(), School, Actor, ["stu-1"], null);

        Assert.NotNull(result);
        Assert.Equal(0, result!.Created);   // self skipped, no parent/counselor
        Assert.Equal(1, result.Skipped);
        Assert.Equal(0, result.EmailsSent);
        Assert.Empty(sender.Sent);
    }

    [Fact]
    public async Task Setup360_resolves_students_by_grade_when_ids_empty()
    {
        await SeedSchoolAsync();
        await SeedUserAsync("stu-1", "A", "a@s.test", "student", School, gradeLevel: 11);
        await SeedUserAsync("stu-2", "B", "b@s.test", "Student", School, gradeLevel: 11);
        await SeedUserAsync("stu-3", "C", "c@s.test", "student", School, gradeLevel: 9); // different grade

        var result = await Writer(new FakeSender(alwaysTrue: true)).Setup360Async(Ctx(), School, Actor, [], gradeLevel: 11);

        Assert.NotNull(result);
        Assert.Equal(2, result!.StudentsProcessed);
        Assert.Equal(2, result.Created); // one self group per grade-11 student
    }

    [Fact]
    public async Task Setup360_no_students_returns_null()
    {
        await SeedSchoolAsync();
        var result = await Writer(new FakeSender(alwaysTrue: true)).Setup360Async(Ctx(), School, Actor, [], null);
        Assert.Null(result);
    }

    [Fact]
    public async Task SendReminders_missing_school_returns_null()
    {
        var result = await Writer(new FakeSender(alwaysTrue: true))
            .SendRemindersAsync(Ctx(), "no-such-school", ["stu-1"], ["PCA"]);
        Assert.Null(result);
    }

    [Fact]
    public async Task SendReminders_counts_sent_and_failed()
    {
        await SeedSchoolAsync();
        await SeedUserAsync("stu-1", "Ana", "ana@school.test", "student", School);
        await SeedUserAsync("stu-2", "Ben", "ben@school.test", "student", School);

        var sender = new FakeSender(results: [true, false]); // first delivers, second fails
        var result = await Writer(sender).SendRemindersAsync(Ctx(), School, ["stu-1", "stu-2"], ["PCA", "MIL"]);

        Assert.NotNull(result);
        Assert.Equal(1, result!.Sent);
        Assert.Equal(1, result.Failed);
        Assert.Equal(2, result.Total);
        Assert.Equal(2, sender.Sent.Count);
        Assert.All(sender.Sent, m => Assert.StartsWith("FormMaps — Assessment Reminder from", m.Subject));
    }

    // ---- helpers ----

    private SchoolAdminEmailWriter Writer(FakeSender sender)
    {
        var options = new EmailOptions("noreply@formmaps.com", "https://app.formmaps.com",
            "https://app.formmaps.ai", "logo", "postal", "us-east-1");
        return new SchoolAdminEmailWriter(
            new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()),
            sender, new EmailTemplates(options), options);
    }

    private static RequestContext Ctx() =>
        RequestContext.Authenticated(
            new RequestActor(Actor, "school-admin", "a@e.st", "Admin"),
            schoolId: School, permissions: Array.Empty<string>(),
            tokenSource: TokenSource.DevelopmentHeader, isDevelopmentOverride: true);

    // A super-admin caller: TenantGucPlanResolver maps this to app.bypass_rls = on, so the policies admit every row.
    private static RequestContext SuperCtx(string userId) =>
        RequestContext.Authenticated(
            new RequestActor(userId, "Super Admin", $"{userId}@e.st", "Super"),
            schoolId: School, permissions: Array.Empty<string>(),
            tokenSource: TokenSource.DevelopmentHeader, isDevelopmentOverride: true);

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

    private async Task<NpgsqlConnection> OpenBypassSessionAsync()
    {
        var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand("SELECT set_config('app.bypass_rls', 'on', false)", conn);
        await cmd.ExecuteNonQueryAsync();
        return conn;
    }

    private static async Task<long> CountAsync(NpgsqlConnection conn, string sql)
    {
        await using var cmd = new NpgsqlCommand(sql, conn);
        return (long)(await cmd.ExecuteScalarAsync())!;
    }

    private async Task SeedSchoolAsync()
    {
        await Exec("""INSERT INTO "schools" ("id","name") VALUES (@id,@n)""",
            ("id", School), ("n", "Test School"));
    }

    private async Task SeedUserAsync(string id, string name, string email, string role, string schoolId, int? gradeLevel = null)
    {
        await Exec(
            """INSERT INTO "users" ("id","name","email","roleName","schoolId","gradeLevel") VALUES (@id,@n,@e,@r,@s,@g)""",
            ("id", id), ("n", name), ("e", email), ("r", role), ("s", schoolId), ("g", (object?)gradeLevel ?? DBNull.Value));
    }

    private async Task SeedParentLinkAsync(string studentId, string parentEmail, string parentName, string relation)
    {
        await Exec(
            """INSERT INTO "student_parent_links" ("id","studentId","parentEmail","parentName","relation") VALUES (@id,@s,@e,@n,@r)""",
            ("id", Guid.NewGuid().ToString()), ("s", studentId), ("e", parentEmail), ("n", parentName), ("r", relation));
    }

    private async Task SeedCounselorAssignmentAsync(string studentId, string counselorId)
    {
        await Exec(
            """INSERT INTO "counselor_student_assignments" ("id","studentId","counselorId") VALUES (@id,@s,@c)""",
            ("id", Guid.NewGuid().ToString()), ("s", studentId), ("c", counselorId));
    }

    private async Task SeedGroupAsync(string evaluatedUserId, string evaluatorEmail, string groupType)
    {
        await Exec(
            """INSERT INTO "evaluation_groups" ("id","evaluatedUserId","evaluatorEmail","groupType","invitationToken","tokenExpiryDate","updatedAt") VALUES (@id,@u,@e,@g,@t,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)""",
            ("id", Guid.NewGuid().ToString()), ("u", evaluatedUserId), ("e", evaluatorEmail), ("g", groupType), ("t", "seed-token"));
    }

    private async Task<List<GroupRow>> GroupsAsync(string evaluatedUserId)
    {
        var rows = new List<GroupRow>();
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand(
            """SELECT "evaluatorEmail","relation","groupType","invitationToken","createdBy" FROM "evaluation_groups" WHERE "evaluatedUserId"=@u""", conn);
        cmd.Parameters.AddWithValue("u", evaluatedUserId);
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            rows.Add(new GroupRow(
                reader.IsDBNull(0) ? "" : reader.GetString(0),
                reader.IsDBNull(1) ? "" : reader.GetString(1),
                reader.IsDBNull(2) ? "" : reader.GetString(2),
                reader.IsDBNull(3) ? "" : reader.GetString(3),
                reader.IsDBNull(4) ? null : reader.GetString(4)));
        }

        return rows;
    }

    private async Task Exec(string sql, params (string Name, object Value)[] parameters)
    {
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand(sql, conn);
        foreach (var (name, value) in parameters)
        {
            cmd.Parameters.AddWithValue(name, value);
        }

        await cmd.ExecuteNonQueryAsync();
    }

    private sealed record GroupRow(string Email, string Relation, string GroupType, string Token, string? CreatedBy);

    private sealed class FakeSender : IEmailSender
    {
        private readonly bool _alwaysTrue;
        private readonly IReadOnlyList<bool>? _results;
        private int _index;

        public FakeSender(bool alwaysTrue = false, IReadOnlyList<bool>? results = null)
        {
            _alwaysTrue = alwaysTrue;
            _results = results;
        }

        public ConcurrentQueue<(string To, string Subject, string Html)> Sent { get; } = new();

        public Task<bool> SendAsync(string to, string subject, string html, CancellationToken cancellationToken = default)
        {
            Sent.Enqueue((to, subject, html));
            var ok = _results is not null ? _results[Math.Min(_index++, _results.Count - 1)] : _alwaysTrue;
            return Task.FromResult(ok);
        }
    }
}
