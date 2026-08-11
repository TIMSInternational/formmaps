using FormMaps.Application.Auth;
using FormMaps.Application.ParentPortal;
using FormMaps.Infrastructure.Data;
using FormMaps.Infrastructure.ParentPortal;
using FormMaps.IntegrationTests.TestSupport.Rls;
using Npgsql;

namespace FormMaps.IntegrationTests.ParentPortal;

/// <summary>
/// Real-DB (Testcontainers) tests for <see cref="ParentPortalRepository"/> (FM-DOTNET-078). Pins: profile
/// children join (accepted+active links, child-user inner join drops orphan links, order); notifications scoping +
/// unreadOnly + createdDate DESC + skip/take + total; mark-read ownership (missing/not-owned → false = 403) + write;
/// mark-all count + no-isActive filter; pending scoped by lowercased email + LEFT JOIN name fallback; delete-link
/// dual-party ownership (parent OR student) → soft delete, wrong party → false (IDOR corpus #28 uniform 403).
///
/// <para>formmaps#125: this fixture now runs the PRODUCTION RLS policies and hands the repository a
/// NOSUPERUSER NOBYPASSRLS login. Before that it could not tell an Identity-session read from a System-session
/// one — which is how three parent surfaces, this one among them, shipped to production broken with this file
/// green (formmaps#121). Seeding and assertions still run as the container superuser: an assertion made through
/// the policies cannot distinguish "row absent" from "row invisible", which would make the negative halves
/// below pass for the wrong reason.</para>
/// </summary>
public sealed class ParentPortalRepositoryTests : IClassFixture<ParentPortalRepositoryTests.Fixture>, IAsyncLifetime
{
    private const string Parent = "parent-1";
    private const string School = "school-1";

    private readonly Fixture _fixture;

    /// <summary>Restricted login. Everything the code under test touches goes through this.</summary>
    private NpgsqlDataSource _appDataSource = null!;

    /// <summary>Container superuser. Seeding and assertions only — see the class remarks.</summary>
    private NpgsqlDataSource _adminDataSource = null!;

    public ParentPortalRepositoryTests(Fixture fixture) => _fixture = fixture;

    public async Task InitializeAsync()
    {
        _appDataSource = NpgsqlDataSource.Create(_fixture.AppConnectionString);
        _adminDataSource = NpgsqlDataSource.Create(_fixture.AdminConnectionString);
        await _fixture.TruncateAsync("users", "student_parent_links", "notifications", "evaluation_groups");
    }

    public async Task DisposeAsync()
    {
        await _appDataSource.DisposeAsync();
        await _adminDataSource.DisposeAsync();
    }

    // ---- harness proof (formmaps#125) ----

    [Fact]
    public async Task Harness_runs_as_a_restricted_login_with_the_production_policies_live()
    {
        // Anchors every assertion in this file. If the login ever regains SUPERUSER or BYPASSRLS, or the
        // policies stop being applied, the isolation halves below go vacuously green — this test is the
        // tripwire for both. MessagesAdversarialAccessTests asserts the OPPOSITE for its own suite and
        // says so in its name; the two together are the two honest positions, and silence is neither.
        await using var conn = await _appDataSource.OpenConnectionAsync();
        Assert.False(await ProductionRlsPolicies.BypassesRlsAsync(conn), "the app login must not bypass RLS");

        Assert.Equal<string>(
            ["evaluation_groups", "notifications", "student_parent_links", "users"],
            _fixture.AppliedPolicyTables);

        await using var forced = new NpgsqlCommand(
            """
            SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relrowsecurity AND c.relforcerowsecurity
            """, conn);
        Assert.Equal(4L, (long)(await forced.ExecuteScalarAsync())!);
    }

    // ---- profile ----

    [Fact]
    public async Task Profile_returns_user_and_linked_children()
    {
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await User(conn, Parent, "Parent P", "p@e.st");
        await User(conn, "kid-a", "Kid A", "a@e.st", gradeLevel: 9, schoolId: School);
        await User(conn, "kid-b", "Kid B", "b@e.st", gradeLevel: 11, schoolId: School);
        await Link(conn, "l-a", "kid-a", Parent, relation: "father", accepted: true, created: new DateTime(2026, 1, 1));
        await Link(conn, "l-b", "kid-b", Parent, relation: "father", accepted: true, created: new DateTime(2026, 2, 1));
        await Link(conn, "l-pending", "kid-a", Parent, accepted: false);           // not accepted → excluded
        await Link(conn, "l-inactive", "kid-b", Parent, accepted: true, active: false); // inactive → excluded
        await Link(conn, "l-orphan", "ghost", Parent, accepted: true);             // child user absent → dropped by join

        var profile = await Repo().GetProfileAsync(Ctx(), Parent);
        Assert.True(profile.UserFound);
        Assert.Equal("Parent P", profile.Name);
        Assert.Equal("p@e.st", profile.Email);
        Assert.Equal(["kid-a", "kid-b"], profile.Children.Select(c => c.StudentId)); // createdDate ASC
        Assert.Equal(9, profile.Children[0].GradeLevel);
        Assert.Equal("father", profile.Children[0].Relationship);
    }

    [Fact]
    public async Task Profile_child_rows_are_unreadable_to_the_parent_under_their_own_session()
    {
        // THE #121 BUG, stated as a property of the database rather than of the repository. A parent has NO
        // schoolId, so 005-sensitive.sql's users policy admits them to exactly one row: their own. The child's
        // row and (before 009-parent-links.sql) the link row are both invisible. Any implementation of
        // GetProfileAsync that reads the children on the caller's Identity session therefore returns zero
        // children for a correctly linked parent — silently, with no error. This test fails if that stops
        // being true, i.e. if someone "fixes" the policies instead of the code and the System session in
        // GetProfileAsync becomes an unnecessary widening that nothing forces us to justify.
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await User(conn, Parent, "Parent P", "p@e.st");
        await User(conn, "kid-a", "Kid A", "a@e.st", gradeLevel: 9, schoolId: School);
        await Link(conn, "l-a", "kid-a", Parent, accepted: true);

        await using var identity = await OpenIdentitySessionAsync(Parent, schoolId: null);

        Assert.Equal(1L, await ScalarAsync(identity, """SELECT count(*) FROM "users" WHERE "id" = 'parent-1'"""));
        Assert.Equal(0L, await ScalarAsync(identity, """SELECT count(*) FROM "users" WHERE "id" = 'kid-a'"""));
        Assert.Equal(
            0L,
            await ScalarAsync(identity, """
                SELECT count(*) FROM "student_parent_links" sp JOIN "users" u ON u."id" = sp."studentId"
                WHERE sp."parentUserId" = 'parent-1'
                """));
        // ...while 009-parent-links.sql does admit the parent to the LINK row itself, which is what makes the
        // repository's WHERE clause a real authorization decision and not a widening.
        Assert.Equal(
            1L,
            await ScalarAsync(identity, """SELECT count(*) FROM "student_parent_links" WHERE "parentUserId" = 'parent-1'"""));
    }

    [Fact]
    public async Task Profile_children_do_not_leak_between_parents()
    {
        // Both halves, deliberately. GetProfileAsync reads the children on a SYSTEM session, so RLS is not
        // scoping this — the WHERE clause is. An isolation-only assertion here would pass against an empty
        // table, so the positive half is what gives the negative half its meaning.
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await User(conn, Parent, "Parent P", "p@e.st");
        await User(conn, "parent-2", "Parent Q", "q@e.st");
        await User(conn, "kid-mine", "Mine", "m@e.st", schoolId: School);
        await User(conn, "kid-theirs", "Theirs", "t@e.st", schoolId: School);
        await Link(conn, "l-mine", "kid-mine", Parent, accepted: true);
        await Link(conn, "l-theirs", "kid-theirs", "parent-2", accepted: true);

        var mine = await Repo().GetProfileAsync(Ctx(), Parent);
        Assert.Equal(["kid-mine"], mine.Children.Select(c => c.StudentId));      // CAN see own
        Assert.DoesNotContain(mine.Children, c => c.StudentId == "kid-theirs");  // CANNOT see the other parent's

        var theirs = await Repo().GetProfileAsync(Ctx("parent-2"), "parent-2");
        Assert.Equal(["kid-theirs"], theirs.Children.Select(c => c.StudentId));
    }

    [Fact]
    public async Task Profile_absent_user_reports_not_found()
    {
        var profile = await Repo().GetProfileAsync(Ctx(), "ghost");
        Assert.False(profile.UserFound);
        Assert.Empty(profile.Children);
    }

    // ---- notifications ----

    [Fact]
    public async Task Notifications_scoped_ordered_paged()
    {
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await Notif(conn, "old", Parent, created: new DateTime(2026, 1, 1));
        await Notif(conn, "new", Parent, created: new DateTime(2026, 3, 1));
        await Notif(conn, "mid", Parent, created: new DateTime(2026, 2, 1));
        await Notif(conn, "inactive", Parent, isActive: false);
        await Notif(conn, "other", "someone-else");

        var (rows, total) = await Repo().ListNotificationsAsync(Ctx(), Parent, unreadOnly: false, skip: 0, take: 20);
        Assert.Equal(3, total);
        Assert.Equal(["new", "mid", "old"], rows.Select(r => r.Id)); // createdDate DESC

        var (page2, total2) = await Repo().ListNotificationsAsync(Ctx(), Parent, unreadOnly: false, skip: 1, take: 1);
        Assert.Equal(3, total2);
        Assert.Equal(["mid"], page2.Select(r => r.Id)); // OFFSET 1 LIMIT 1
    }

    [Fact]
    public async Task Notifications_do_not_leak_a_same_school_row_that_RLS_would_admit()
    {
        // Exercises the WHERE clause where RLS cannot do its job for it. 003-fk-users.sql admits a caller to
        // any notification whose owner shares their schoolId, so for a SCHOOL-SCOPED caller the policy is
        // wide open across the school and the repository's own "userId" = @uid is the entire scope. Running
        // this as the school-less parent would have proved nothing: RLS would have hidden the row anyway.
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await User(conn, "staff", "Staff", "s@e.st", schoolId: School);
        await User(conn, "student", "Student", "st@e.st", schoolId: School);
        await Notif(conn, "mine", "staff");
        await Notif(conn, "classmates", "student");

        // Negative control on the control: the policy really does admit the other row to this caller.
        await using (var identity = await OpenIdentitySessionAsync("staff", School))
        {
            Assert.Equal(2L, await ScalarAsync(identity, """SELECT count(*) FROM "notifications" """));
        }

        var (rows, total) = await Repo().ListNotificationsAsync(
            Ctx("staff", School), "staff", unreadOnly: false, skip: 0, take: 20);
        Assert.Equal(1, total);
        Assert.Equal(["mine"], rows.Select(r => r.Id));
    }

    [Fact]
    public async Task Notifications_unreadOnly_filters_read()
    {
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await Notif(conn, "unread", Parent, isRead: false);
        await Notif(conn, "read", Parent, isRead: true);

        var (rows, total) = await Repo().ListNotificationsAsync(Ctx(), Parent, unreadOnly: true, skip: 0, take: 20);
        Assert.Equal(1, total);
        Assert.Equal(["unread"], rows.Select(r => r.Id));
    }

    [Fact]
    public async Task MarkRead_ownership_then_write()
    {
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await Notif(conn, "mine", Parent, isRead: false);
        await Notif(conn, "theirs", "other");

        Assert.False(await Repo().MarkNotificationReadAsync(Ctx(), Parent, "missing"));
        Assert.False(await Repo().MarkNotificationReadAsync(Ctx(), Parent, "theirs")); // not owned → 403
        Assert.True(await Repo().MarkNotificationReadAsync(Ctx(), Parent, "mine"));

        await using var check = new NpgsqlCommand("""SELECT "isRead", "readAt" FROM "notifications" WHERE "id"='mine'""", conn);
        await using var reader = await check.ExecuteReaderAsync();
        await reader.ReadAsync();
        Assert.True(reader.GetBoolean(0));
        Assert.False(reader.IsDBNull(1)); // readAt set
    }

    [Fact]
    public async Task MarkRead_denies_a_same_school_notification_that_RLS_admits()
    {
        // The app-layer half of MarkRead_ownership_then_write. There the victim row is invisible to the
        // caller under RLS, so a repository with NO ownership check at all would still have returned false.
        // Here the policy admits the row (same school) and only the "userId" comparison stands between a
        // school-scoped caller and marking a classmate's notification read — plus the negative control that
        // the row was genuinely not written, read back as the superuser.
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await User(conn, "staff", "Staff", "s@e.st", schoolId: School);
        await User(conn, "student", "Student", "st@e.st", schoolId: School);
        await Notif(conn, "classmates", "student", isRead: false);
        await Notif(conn, "mine", "staff", isRead: false);

        Assert.False(await Repo().MarkNotificationReadAsync(Ctx("staff", School), "staff", "classmates"));
        Assert.True(await Repo().MarkNotificationReadAsync(Ctx("staff", School), "staff", "mine")); // positive half

        Assert.Equal(0L, await ScalarAsync(conn, """SELECT count(*) FROM "notifications" WHERE "id"='classmates' AND "isRead" """));
        Assert.Equal(1L, await ScalarAsync(conn, """SELECT count(*) FROM "notifications" WHERE "id"='mine' AND "isRead" """));
    }

    [Fact]
    public async Task MarkAll_counts_only_own_unread()
    {
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await Notif(conn, "u1", Parent, isRead: false);
        await Notif(conn, "u2", Parent, isRead: false);
        await Notif(conn, "already", Parent, isRead: true);
        await Notif(conn, "other", "other", isRead: false);

        var count = await Repo().MarkAllNotificationsReadAsync(Ctx(), Parent);
        Assert.Equal(2, count);
    }

    [Fact]
    public async Task MarkAll_leaves_same_school_rows_that_RLS_admits_untouched()
    {
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await User(conn, "staff", "Staff", "s@e.st", schoolId: School);
        await User(conn, "student", "Student", "st@e.st", schoolId: School);
        await Notif(conn, "mine", "staff", isRead: false);
        await Notif(conn, "classmates", "student", isRead: false);

        Assert.Equal(1, await Repo().MarkAllNotificationsReadAsync(Ctx("staff", School), "staff"));
        Assert.Equal(0L, await ScalarAsync(conn, """SELECT count(*) FROM "notifications" WHERE "id"='classmates' AND "isRead" """));
    }

    // ---- pending evaluations ----

    [Fact]
    public async Task Pending_scoped_by_lowercased_email_with_name_fallback()
    {
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await User(conn, Parent, "Parent P", "Parent@E.st"); // mixed-case stored email
        await User(conn, "kid", "Kid Name", "k@e.st", schoolId: School);
        await EvalGroup(conn, "eg-named", "parent@e.st", "kid", isCompleted: false);
        await EvalGroup(conn, "eg-orphan", "parent@e.st", "ghost", isCompleted: false); // no user → name fallback
        await EvalGroup(conn, "eg-done", "parent@e.st", "kid", isCompleted: true);       // completed → excluded
        await EvalGroup(conn, "eg-inactive", "parent@e.st", "kid", isCompleted: false, active: false);
        await EvalGroup(conn, "eg-other", "someone@e.st", "kid", isCompleted: false);    // other evaluator → excluded

        var rows = await Repo().ListPendingEvaluationsAsync(Ctx(), Parent);
        Assert.Equal(2, rows.Count);
        Assert.Contains(rows, r => r.EvaluationId == "eg-named" && r.StudentName == "Kid Name");
        Assert.Contains(rows, r => r.EvaluationId == "eg-orphan" && r.StudentName == "your student");
    }

    [Fact]
    public async Task Pending_evaluation_rows_are_unreadable_to_the_parent_under_their_own_session()
    {
        // Same shape as the profile case: evaluation_groups is keyed on the EVALUATED user or that user's
        // school, and a parent evaluator is neither, so an Identity-session read returns nothing and the
        // pending-evaluations page renders blank. The negative control is the second assertion: the same
        // query DOES return the row once the session bypasses, so the emptiness above is the policy and
        // not an empty fixture.
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await User(conn, Parent, "Parent P", "p@e.st");
        await User(conn, "kid", "Kid", "k@e.st", schoolId: School);
        await EvalGroup(conn, "eg", "p@e.st", "kid", isCompleted: false);

        const string Query = """SELECT count(*) FROM "evaluation_groups" WHERE "evaluatorEmail" = 'p@e.st'""";

        await using (var identity = await OpenIdentitySessionAsync(Parent, schoolId: null))
        {
            Assert.Equal(0L, await ScalarAsync(identity, Query));
        }

        await using (var system = await OpenBypassSessionAsync())
        {
            Assert.Equal(1L, await ScalarAsync(system, Query));
        }

        Assert.Equal(["eg"], (await Repo().ListPendingEvaluationsAsync(Ctx(), Parent)).Select(r => r.EvaluationId));
    }

    [Fact]
    public async Task Pending_does_not_leak_another_evaluators_rows()
    {
        // ListPendingEvaluationsAsync reads on a SYSTEM session, so the email filter is the whole scope.
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await User(conn, Parent, "Parent P", "p@e.st");
        await User(conn, "parent-2", "Parent Q", "q@e.st");
        await User(conn, "kid", "Kid", "k@e.st", schoolId: School);
        await EvalGroup(conn, "eg-mine", "p@e.st", "kid", isCompleted: false);
        await EvalGroup(conn, "eg-theirs", "q@e.st", "kid", isCompleted: false);

        Assert.Equal(["eg-mine"], (await Repo().ListPendingEvaluationsAsync(Ctx(), Parent)).Select(r => r.EvaluationId));
        Assert.Equal(["eg-theirs"], (await Repo().ListPendingEvaluationsAsync(Ctx("parent-2"), "parent-2")).Select(r => r.EvaluationId));
    }

    [Fact]
    public async Task Pending_empty_when_no_email()
    {
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await User(conn, Parent, "Parent P", email: null);
        await EvalGroup(conn, "eg", "", Parent, isCompleted: false);
        Assert.Empty(await Repo().ListPendingEvaluationsAsync(Ctx(), Parent));
    }

    // ---- delete link ----

    [Fact]
    public async Task DeleteLink_parent_or_student_can_delete_others_403()
    {
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await Link(conn, "as-parent", "kid", Parent, accepted: true);
        await Link(conn, "as-student", Parent, "some-parent-user", accepted: true); // caller is the STUDENT here
        await Link(conn, "unrelated", "kid2", "other-parent", accepted: true);

        Assert.False(await Repo().DeleteLinkAsync(Ctx(), Parent, "missing"));
        Assert.False(await Repo().DeleteLinkAsync(Ctx(), Parent, "unrelated")); // neither party → 403
        Assert.True(await Repo().DeleteLinkAsync(Ctx(), Parent, "as-parent"));  // caller = parentUserId
        Assert.True(await Repo().DeleteLinkAsync(Ctx(), Parent, "as-student")); // caller = studentId

        await using var check = new NpgsqlCommand(
            """SELECT count(*) FROM "student_parent_links" WHERE "id" IN ('as-parent','as-student') AND "isActive"=false""", conn);
        Assert.Equal(2L, (long)(await check.ExecuteScalarAsync())!);
    }

    [Fact]
    public async Task DeleteLink_denies_a_same_school_link_that_RLS_admits()
    {
        // The app-layer half of the case above. For the school-less parent, "unrelated" is invisible under
        // RLS, so that assertion cannot distinguish a real ownership check from none at all. A school-scoped
        // caller IS admitted to every link whose student shares their school by 003-fk-users.sql, and only
        // the parentUserId/studentId comparison denies the unlink. The row state is read back as the
        // superuser: DeleteLinkAsync returning false while having written anyway is the failure that matters.
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await User(conn, "staff", "Staff", "s@e.st", schoolId: School);
        await User(conn, "kid", "Kid", "k@e.st", schoolId: School);
        await Link(conn, "classmates-link", "kid", "some-parent", accepted: true);
        await Link(conn, "own-link", "staff", "some-parent", accepted: true);

        await using (var identity = await OpenIdentitySessionAsync("staff", School))
        {
            Assert.Equal(2L, await ScalarAsync(identity, """SELECT count(*) FROM "student_parent_links" """));
        }

        Assert.False(await Repo().DeleteLinkAsync(Ctx("staff", School), "staff", "classmates-link"));
        Assert.True(await Repo().DeleteLinkAsync(Ctx("staff", School), "staff", "own-link")); // positive half

        Assert.Equal(1L, await ScalarAsync(conn, """SELECT count(*) FROM "student_parent_links" WHERE "id"='classmates-link' AND "isActive" """));
        Assert.Equal(0L, await ScalarAsync(conn, """SELECT count(*) FROM "student_parent_links" WHERE "id"='own-link' AND "isActive" """));
    }

    // ---- helpers ----

    private ParentPortalRepository Repo() =>
        new(new NpgsqlFormMapsDatabaseSessionFactory(_appDataSource, new RlsSessionContextApplier()),
            new FixedTimeProvider(new DateTime(2026, 7, 24, 12, 0, 0, DateTimeKind.Utc)));

    private static RequestContext Ctx(string userId = Parent, string? schoolId = null) =>
        RequestContext.Authenticated(
            new RequestActor(userId, "parent", $"{userId}@e.st", "Parent"),
            schoolId, permissions: Array.Empty<string>(),
            tokenSource: TokenSource.DevelopmentHeader, isDevelopmentOverride: true);

    /// <summary>
    /// A raw connection on the restricted login with the same GUCs the session factory would set for an
    /// Identity-mode caller. Used to state what the POLICIES do, independently of any repository.
    /// <para>These are SESSION-level (<c>is_local=false</c>) rather than the factory's transaction-local
    /// settings, because there is no transaction here. That is safe only because Npgsql issues
    /// <c>DISCARD ALL</c> when a pooled connection is returned; if the data source is ever built with
    /// <c>No Reset On Close=true</c>, these GUCs would leak into the next test and quietly widen it.</para>
    /// </summary>
    private async Task<NpgsqlConnection> OpenIdentitySessionAsync(string userId, string? schoolId)
    {
        var conn = await _appDataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand(
            "SELECT set_config('app.current_school_id', @s, false), set_config('app.current_user_id', @u, false)", conn);
        cmd.Parameters.AddWithValue("s", schoolId ?? string.Empty);
        cmd.Parameters.AddWithValue("u", userId);
        await cmd.ExecuteNonQueryAsync();
        return conn;
    }

    private async Task<NpgsqlConnection> OpenBypassSessionAsync()
    {
        var conn = await _appDataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand("SELECT set_config('app.bypass_rls', 'on', false)", conn);
        await cmd.ExecuteNonQueryAsync();
        return conn;
    }

    private static async Task<long> ScalarAsync(NpgsqlConnection conn, string sql)
    {
        await using var cmd = new NpgsqlCommand(sql, conn);
        return (long)(await cmd.ExecuteScalarAsync())!;
    }

    private sealed class FixedTimeProvider(DateTime utcNow) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => new(DateTime.SpecifyKind(utcNow, DateTimeKind.Utc));
    }

    private static async Task User(
        NpgsqlConnection conn, string id, string name, string? email, int? gradeLevel = null, string? schoolId = null)
    {
        await using var cmd = new NpgsqlCommand(
            """INSERT INTO "users"("id","name","email","gradeLevel","schoolId") VALUES(@id,@n,@e,@g,@s)""", conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("n", name);
        cmd.Parameters.AddWithValue("e", (object?)email ?? DBNull.Value);
        cmd.Parameters.AddWithValue("g", (object?)gradeLevel ?? DBNull.Value);
        cmd.Parameters.AddWithValue("s", (object?)schoolId ?? DBNull.Value);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task Link(
        NpgsqlConnection conn, string id, string studentId, string? parentUserId, string relation = "parent",
        bool accepted = false, bool active = true, DateTime? created = null)
    {
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "student_parent_links"("id","studentId","parentUserId","relation","isAccepted","isActive","createdDate","updatedAt")
            VALUES(@id,@s,@p,@r,@acc,@act,@cr,@cr)
            """, conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("s", studentId);
        cmd.Parameters.AddWithValue("p", (object?)parentUserId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("r", relation);
        cmd.Parameters.AddWithValue("acc", accepted);
        cmd.Parameters.AddWithValue("act", active);
        cmd.Parameters.AddWithValue("cr", DateTime.SpecifyKind(created ?? new DateTime(2026, 1, 1), DateTimeKind.Unspecified));
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task Notif(
        NpgsqlConnection conn, string id, string userId, bool isRead = false, bool isActive = true, DateTime? created = null)
    {
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "notifications"("id","userId","isRead","isActive","createdDate","updatedAt")
            VALUES(@id,@u,@r,@a,@cr,@cr)
            """, conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("u", userId);
        cmd.Parameters.AddWithValue("r", isRead);
        cmd.Parameters.AddWithValue("a", isActive);
        cmd.Parameters.AddWithValue("cr", DateTime.SpecifyKind(created ?? new DateTime(2026, 1, 1), DateTimeKind.Unspecified));
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task EvalGroup(
        NpgsqlConnection conn, string id, string evaluatorEmail, string evaluatedUserId, bool isCompleted,
        bool active = true, DateTime? created = null)
    {
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "evaluation_groups"("id","evaluatorEmail","evaluatedUserId","invitationToken","tokenExpiryDate","isEvaluationCompleted","isActive","createdDate")
            VALUES(@id,@e,@u,@tok,@exp,@c,@a,@cr)
            """, conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("e", evaluatorEmail);
        cmd.Parameters.AddWithValue("u", evaluatedUserId);
        cmd.Parameters.AddWithValue("tok", "token-" + id);
        cmd.Parameters.AddWithValue("exp", new DateTime(2026, 6, 1, 0, 0, 0, DateTimeKind.Unspecified));
        cmd.Parameters.AddWithValue("c", isCompleted);
        cmd.Parameters.AddWithValue("a", active);
        cmd.Parameters.AddWithValue("cr", DateTime.SpecifyKind(created ?? new DateTime(2026, 1, 1), DateTimeKind.Unspecified));
        await cmd.ExecuteNonQueryAsync();
    }

    /// <summary>
    /// formmaps#125: production policies + a restricted login. The four tables this fixture models are all
    /// policied in production (005-sensitive users; 003-fk-users notifications / evaluation_groups /
    /// student_parent_links; 009-parent-links the parent's own links), so all four are named — naming a
    /// table production does not policy, or omitting one it does, fails the fixture rather than quietly
    /// leaving a hole.
    /// </summary>
    public sealed class Fixture : RlsEnabledDatabaseFixture
    {
        protected override string SchemaResourceFileName => "parent-portal-schema.sql";

        protected override IReadOnlyCollection<string> PoliciedTables =>
            ["users", "student_parent_links", "notifications", "evaluation_groups"];
    }
}
