using FormMaps.Application.Auth;
using FormMaps.Application.StudentParents;
using FormMaps.Infrastructure.Data;
using FormMaps.Infrastructure.StudentParents;
using FormMaps.IntegrationTests.TestSupport.Rls;
using Npgsql;

namespace FormMaps.IntegrationTests.StudentParents;

/// <summary>
/// Real-DB (Testcontainers) tests for <see cref="StudentParentRepository"/> (FM-DOTNET-076). Pins list scoping +
/// order; delete ownership. audit 2026-10-09 C8b/C8: invite mints a token for the EMAIL (returned to the endpoint
/// only), is idempotent per (studentId, parentEmail) (re-invite refreshes the row; an accepted link is a no-op), attaches
/// an onboarded parent account found through RLS (a school-less parent the student's identity cannot see), never links
/// the student to themselves; resend requires ownership, refuses accepted links, and attaches a since-onboarded parent.
/// </summary>
public sealed class StudentParentRepositoryTests : IClassFixture<StudentParentRepositoryTests.Fixture>, IAsyncLifetime
{
    private const string Student = "student-1";

    private readonly Fixture _fixture;

    /// <summary>Restricted login (NOSUPERUSER NOBYPASSRLS) — the repository under test.</summary>
    private NpgsqlDataSource _dataSource = null!;

    /// <summary>Container superuser — seeding and row-state assertions only.</summary>
    private NpgsqlDataSource _adminDataSource = null!;

    public StudentParentRepositoryTests(Fixture fixture) => _fixture = fixture;

    public async Task InitializeAsync()
    {
        _dataSource = NpgsqlDataSource.Create(_fixture.AppConnectionString);
        _adminDataSource = NpgsqlDataSource.Create(_fixture.AdminConnectionString);
        await _fixture.TruncateAsync("users", "student_parent_links");
    }

    public async Task DisposeAsync()
    {
        await _dataSource.DisposeAsync();
        await _adminDataSource.DisposeAsync();
    }

    [Fact]
    public async Task Harness_runs_as_a_restricted_login_with_the_production_policies_live()
    {
        // NOTE the data source: the APP login, not the admin one (formmaps#125).
        await using var conn = await _dataSource.OpenConnectionAsync();
        Assert.False(await ProductionRlsPolicies.BypassesRlsAsync(conn), "the app login must not bypass RLS");
        Assert.Equal<string>(["student_parent_links", "users"], _fixture.AppliedPolicyTables);
    }

    [Fact]
    public async Task List_scopes_student_active_desc()
    {
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await Link(conn, "old", Student, "a@x.com", created: new DateTime(2026, 7, 1));
        await Link(conn, "new", Student, "b@x.com", created: new DateTime(2026, 7, 10));
        await Link(conn, "inactive", Student, "c@x.com", isActive: false);
        await Link(conn, "other", "student-2", "d@x.com");

        var rows = await Repo().ListAsync(Ctx(), Student);
        Assert.Equal(["new", "old"], rows.Select(r => r.Id));
    }

    [Fact]
    public async Task List_does_not_leak_a_classmates_links_that_RLS_admits()
    {
        // Exercises the scoping where RLS cannot do it for us. The caller is a STUDENT with a schoolId, and
        // 003-fk-users.sql admits them to every link whose student shares that school — so for a classmate's
        // link the policy is wide open and the repository's own "studentId" = @sid is the entire scope. The
        // first block is the negative control on the control: the classmate's row really is visible to this
        // session, so the empty result afterwards is the WHERE clause and not an empty fixture.
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await User(conn, Student, "school-1");
        await User(conn, "classmate", "school-1");
        await Link(conn, "mine", Student, "a@x.com");
        await Link(conn, "theirs", "classmate", "b@x.com");

        await using (var identity = await OpenIdentitySessionAsync(Student, "school-1"))
        {
            Assert.Equal(2L, await CountAsync(identity, """SELECT count(*) FROM "student_parent_links" """));
        }

        Assert.Equal(["mine"], (await Repo().ListAsync(Ctx(), Student)).Select(r => r.Id));
        Assert.Equal(["theirs"], (await Repo().ListAsync(Ctx(), "classmate")).Select(r => r.Id)); // positive half
    }

    [Fact]
    public async Task List_returns_nothing_across_a_school_boundary()
    {
        // The RLS half, on the same query. Nothing in ListAsync stops a caller naming another student's id —
        // the endpoint authorizes that — so here the policy IS the control, and it is the half a superuser
        // fixture could not express at all.
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await User(conn, Student, "school-1");
        await User(conn, "outsider", "school-2");
        await Link(conn, "mine", Student, "a@x.com");

        Assert.Empty(await Repo().ListAsync(CtxFor("outsider", "school-2"), Student));
        Assert.Equal(["mine"], (await Repo().ListAsync(Ctx(), Student)).Select(r => r.Id)); // positive half
    }

    [Fact]
    public async Task Invite_mints_token_and_returns_id()
    {
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await User(conn, Student, "school-1", email: "kid@x.com");

        var result = await Repo().InviteOrAttachAsync(Ctx(), Student, "mom@example.com", "Mom", "");
        Assert.Equal(ParentInviteKind.Invited, result.Kind);
        Assert.False(string.IsNullOrEmpty(result.Id));
        Assert.False(string.IsNullOrEmpty(result.Token));
        Assert.Equal(Student, result.StudentName); // User() names the row after its id

        await using var check = new NpgsqlCommand("""SELECT "parentEmail","invitationToken","invitedBy","tokenExpiresAt","relation","isAccepted" FROM "student_parent_links" WHERE "id"=@id""", conn);
        check.Parameters.AddWithValue("id", result.Id!);
        await using var reader = await check.ExecuteReaderAsync();
        await reader.ReadAsync();
        Assert.Equal("mom@example.com", reader.GetString(0));
        Assert.Equal(result.Token, reader.GetString(1));
        Assert.Equal(Student, reader.GetString(2));    // invitedBy = caller
        Assert.False(reader.IsDBNull(3));               // tokenExpiresAt set
        Assert.Equal("parent", reader.GetString(4));    // relation not supplied → "parent"
        Assert.False(reader.GetBoolean(5));
    }

    [Fact]
    public async Task Reinvite_refreshes_the_existing_row_instead_of_a_duplicate()
    {
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await User(conn, Student, "school-1", email: "kid@x.com");
        await Link(conn, "mine", Student, "dup@example.com", isActive: false, token: "old-token");

        var result = await Repo().InviteOrAttachAsync(Ctx(), Student, "dup@example.com", "", "");
        Assert.Equal(ParentInviteKind.Invited, result.Kind);
        Assert.Equal("mine", result.Id);
        Assert.NotEqual("old-token", result.Token);
        Assert.Equal(1L, await CountAsync(conn, """SELECT count(*) FROM "student_parent_links" """));
        await using var check = new NpgsqlCommand("""SELECT "isActive","invitationToken" FROM "student_parent_links" WHERE "id"='mine'""", conn);
        await using var reader = await check.ExecuteReaderAsync();
        await reader.ReadAsync();
        Assert.True(reader.GetBoolean(0));
        Assert.Equal(result.Token, reader.GetString(1));
    }

    [Fact]
    public async Task Invite_attaches_an_onboarded_parent_the_students_identity_cannot_see()
    {
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await User(conn, Student, "school-1", email: "kid@x.com");
        await User(conn, "parent-user-1", schoolId: null, email: "mom@example.com", roleName: "parent", password: "hash");

        // Negative control: RLS hides the school-less parent row from the student's own identity.
        await using (var identity = await OpenIdentitySessionAsync(Student, "school-1"))
        {
            Assert.Equal(0L, await CountAsync(identity, """SELECT count(*) FROM "users" WHERE "id"='parent-user-1'"""));
        }

        var result = await Repo().InviteOrAttachAsync(Ctx(), Student, "mom@example.com", "", "mother");
        Assert.Equal(ParentInviteKind.Attached, result.Kind);
        Assert.Equal("parent-user-1", result.ParentUserId);
        Assert.Null(result.Token);
        Assert.Equal("parent-user-1", result.ParentName); // falls back to the account's name

        await using var check = new NpgsqlCommand("""SELECT "parentUserId","isAccepted","invitationToken","acceptedAt" FROM "student_parent_links" WHERE "id"=@id""", conn);
        check.Parameters.AddWithValue("id", result.Id!);
        await using var reader = await check.ExecuteReaderAsync();
        await reader.ReadAsync();
        Assert.Equal("parent-user-1", reader.GetString(0));
        Assert.True(reader.GetBoolean(1));
        Assert.True(reader.IsDBNull(2));
        Assert.False(reader.IsDBNull(3));
    }

    [Fact]
    public async Task Invite_does_not_attach_a_non_parent_or_passwordless_account()
    {
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await User(conn, Student, "school-1", email: "kid@x.com");
        await User(conn, "teacher", schoolId: null, email: "t@example.com", roleName: "counselor", password: "hash");
        await User(conn, "pending-parent", schoolId: null, email: "p@example.com", roleName: "parent", password: null);

        Assert.Equal(ParentInviteKind.Invited, (await Repo().InviteOrAttachAsync(Ctx(), Student, "t@example.com", "", "")).Kind);
        Assert.Equal(ParentInviteKind.Invited, (await Repo().InviteOrAttachAsync(Ctx(), Student, "p@example.com", "", "")).Kind);
    }

    [Fact]
    public async Task Invite_is_a_noop_for_an_active_accepted_link()
    {
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await User(conn, Student, "school-1", email: "kid@x.com");
        await Link(conn, "mine", Student, "mom@example.com", token: null, accepted: true);

        var result = await Repo().InviteOrAttachAsync(Ctx(), Student, "mom@example.com", "", "");
        Assert.Equal(ParentInviteKind.AlreadyLinked, result.Kind);
        Assert.Equal("mine", result.Id);
        Assert.Null(result.Token);
        await using var check = new NpgsqlCommand("""SELECT "invitationToken" FROM "student_parent_links" WHERE "id"='mine'""", conn);
        Assert.True(await check.ExecuteScalarAsync() is DBNull);
    }

    [Fact]
    public async Task Invite_never_links_a_student_to_themselves()
    {
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await User(conn, Student, "school-1", email: "kid@x.com");

        var result = await Repo().InviteOrAttachAsync(Ctx(), Student, "kid@x.com", "", "");
        Assert.Equal(ParentInviteKind.SelfLink, result.Kind);
        Assert.Equal(0L, await CountAsync(conn, """SELECT count(*) FROM "student_parent_links" """));
    }

    [Fact]
    public async Task Delete_requires_ownership()
    {
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await Link(conn, "mine", Student, "a@x.com");
        await Link(conn, "theirs", "student-2", "b@x.com");

        await Link(conn, "mine-inactive", Student, "e@x.com", isActive: false); // gate is ownership-only (no isActive)

        Assert.False(await Repo().DeleteLinkAsync(Ctx(), Student, "missing"));
        Assert.False(await Repo().DeleteLinkAsync(Ctx(), Student, "theirs"));
        Assert.True(await Repo().DeleteLinkAsync(Ctx(), Student, "mine"));
        Assert.True(await Repo().DeleteLinkAsync(Ctx(), Student, "mine-inactive")); // already inactive + owned → still true

        await using var check = new NpgsqlCommand("""SELECT "isActive" FROM "student_parent_links" WHERE "id"='mine'""", conn);
        Assert.False((bool)(await check.ExecuteScalarAsync())!);
    }

    [Fact]
    public async Task Resend_requires_ownership_and_regenerates_token()
    {
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await User(conn, Student, "school-1", email: "kid@x.com");
        await Link(conn, "mine", Student, "a@x.com", token: "old-token");
        await Link(conn, "theirs", "student-2", "b@x.com");

        Assert.Equal(ParentResendKind.NotFound, (await Repo().ResendAsync(Ctx(), Student, "missing")).Kind);
        Assert.Equal(ParentResendKind.NotFound, (await Repo().ResendAsync(Ctx(), Student, "theirs")).Kind);

        var outcome = await Repo().ResendAsync(Ctx(), Student, "mine");
        Assert.Equal(ParentResendKind.Reissued, outcome.Kind);
        Assert.Equal("a@x.com", outcome.ParentEmail);
        Assert.False(string.IsNullOrEmpty(outcome.Token));
        Assert.NotEqual("old-token", outcome.Token);

        await using var check = new NpgsqlCommand("""SELECT "invitationToken" FROM "student_parent_links" WHERE "id"='mine'""", conn);
        Assert.Equal(outcome.Token, (string)(await check.ExecuteScalarAsync())!);
    }

    [Fact]
    public async Task Resend_refuses_accepted_and_inactive_links()
    {
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await User(conn, Student, "school-1", email: "kid@x.com");
        await Link(conn, "accepted", Student, "a@x.com", accepted: true);
        await Link(conn, "inactive", Student, "b@x.com", isActive: false, token: "t");

        Assert.Equal(ParentResendKind.NotFound, (await Repo().ResendAsync(Ctx(), Student, "accepted")).Kind);
        Assert.Equal(ParentResendKind.NotFound, (await Repo().ResendAsync(Ctx(), Student, "inactive")).Kind);
        await using var check = new NpgsqlCommand("""SELECT "invitationToken" FROM "student_parent_links" WHERE "id"='accepted'""", conn);
        Assert.True(await check.ExecuteScalarAsync() is DBNull);
    }

    [Fact]
    public async Task Resend_attaches_a_parent_who_has_since_onboarded()
    {
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await User(conn, Student, "school-1", email: "kid@x.com");
        await User(conn, "parent-user-1", schoolId: null, email: "mom@example.com", roleName: "Parent", password: "hash");
        await Link(conn, "mine", Student, "mom@example.com", token: "old-token");

        var outcome = await Repo().ResendAsync(Ctx(), Student, "mine");
        Assert.Equal(ParentResendKind.Attached, outcome.Kind);
        Assert.Equal("parent-user-1", outcome.ParentUserId);
        Assert.Null(outcome.Token);
        await using var check = new NpgsqlCommand("""SELECT "parentUserId","isAccepted","invitationToken" FROM "student_parent_links" WHERE "id"='mine'""", conn);
        await using var reader = await check.ExecuteReaderAsync();
        await reader.ReadAsync();
        Assert.Equal("parent-user-1", reader.GetString(0));
        Assert.True(reader.GetBoolean(1));
        Assert.True(reader.IsDBNull(2));
    }

    // ---- helpers ----

    private StudentParentRepository Repo() =>
        new(new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()),
            new FixedTimeProvider(new DateTime(2026, 7, 23, 12, 0, 0, DateTimeKind.Utc)));

    private static RequestContext Ctx() => CtxFor(Student, "school-1");

    private static RequestContext CtxFor(string userId, string? schoolId) =>
        RequestContext.Authenticated(
            new RequestActor(userId, "student", $"{userId}@e.st", "Student"),
            schoolId, permissions: Array.Empty<string>(),
            tokenSource: TokenSource.DevelopmentHeader, isDevelopmentOverride: true);

    /// <summary>
    /// A raw connection on the restricted login carrying the GUCs the session factory sets for an Identity-mode
    /// caller — used to state what the POLICIES do, independently of the repository. Session-level rather than
    /// transaction-local because there is no transaction; safe only because Npgsql sends <c>DISCARD ALL</c> when
    /// a pooled connection is returned.
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

    private static async Task User(
        NpgsqlConnection conn, string id, string? schoolId, string? email = null, string roleName = "student",
        string? password = null)
    {
        await using var cmd = new NpgsqlCommand(
            """INSERT INTO "users"("id","name","schoolId","email","roleName","password") VALUES(@id,@id,@s,@e,@r,@p)""", conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("s", (object?)schoolId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("e", (object?)email ?? DBNull.Value);
        cmd.Parameters.AddWithValue("r", roleName);
        cmd.Parameters.AddWithValue("p", (object?)password ?? DBNull.Value);
        await cmd.ExecuteNonQueryAsync();
    }

    private sealed class FixedTimeProvider(DateTime utcNow) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => new(DateTime.SpecifyKind(utcNow, DateTimeKind.Utc));
    }

    private static async Task Link(
        NpgsqlConnection conn, string id, string studentId, string parentEmail, bool isActive = true,
        string? token = null, DateTime? created = null, bool accepted = false)
    {
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "student_parent_links"("id","studentId","parentEmail","invitationToken","isActive","isAccepted","createdDate","updatedAt")
            VALUES(@id,@s,@e,@t,@act,@acc,@cd,@ud)
            """, conn);
        cmd.Parameters.AddWithValue("acc", accepted);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("s", studentId);
        cmd.Parameters.AddWithValue("e", parentEmail);
        cmd.Parameters.AddWithValue("t", (object?)token ?? DBNull.Value);
        cmd.Parameters.AddWithValue("act", isActive);
        cmd.Parameters.AddWithValue("cd", DateTime.SpecifyKind(created ?? new DateTime(2026, 1, 1), DateTimeKind.Unspecified));
        cmd.Parameters.AddWithValue("ud", DateTime.SpecifyKind(new DateTime(2026, 1, 1), DateTimeKind.Unspecified));
        await cmd.ExecuteNonQueryAsync();
    }

    /// <summary>formmaps#125: production policies + a restricted login. Both tables here are policied in
    /// production (003-fk-users.sql + 009-parent-links.sql on the links, 005-sensitive.sql on users).</summary>
    public sealed class Fixture : RlsEnabledDatabaseFixture
    {
        protected override string SchemaResourceFileName => "student-parents-schema.sql";

        protected override IReadOnlyCollection<string> PoliciedTables => ["users", "student_parent_links"];
    }
}
