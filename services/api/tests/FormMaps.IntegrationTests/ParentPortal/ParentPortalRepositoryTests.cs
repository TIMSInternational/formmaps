using System.Reflection;
using FormMaps.Application.Auth;
using FormMaps.Application.ParentPortal;
using FormMaps.Infrastructure.Data;
using FormMaps.Infrastructure.ParentPortal;
using Npgsql;
using Testcontainers.PostgreSql;

namespace FormMaps.IntegrationTests.ParentPortal;

/// <summary>
/// Real-DB (Testcontainers) tests for <see cref="ParentPortalRepository"/> (FM-DOTNET-078). Pins: profile
/// children join (accepted+active links, child-user inner join drops orphan links, order); notifications scoping +
/// unreadOnly + createdDate DESC + skip/take + total; mark-read ownership (missing/not-owned → false = 403) + write;
/// mark-all count + no-isActive filter; pending scoped by lowercased email + LEFT JOIN name fallback; delete-link
/// dual-party ownership (parent OR student) → soft delete, wrong party → false (IDOR corpus #28 uniform 403).
/// </summary>
public sealed class ParentPortalRepositoryTests : IClassFixture<ParentPortalRepositoryTests.Fixture>, IAsyncLifetime
{
    private const string Parent = "parent-1";

    private readonly Fixture _fixture;
    private NpgsqlDataSource _dataSource = null!;

    public ParentPortalRepositoryTests(Fixture fixture) => _fixture = fixture;

    public async Task InitializeAsync()
    {
        _dataSource = NpgsqlDataSource.Create(_fixture.ConnectionString);
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand(
            """TRUNCATE "users", "student_parent_links", "notifications", "evaluation_groups" """, conn);
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task DisposeAsync() => await _dataSource.DisposeAsync();

    // ---- profile ----

    [Fact]
    public async Task Profile_returns_user_and_linked_children()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await User(conn, Parent, "Parent P", "p@e.st");
        await User(conn, "kid-a", "Kid A", "a@e.st", gradeLevel: 9);
        await User(conn, "kid-b", "Kid B", "b@e.st", gradeLevel: 11);
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
        await using var conn = await _dataSource.OpenConnectionAsync();
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
    public async Task Notifications_unreadOnly_filters_read()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await Notif(conn, "unread", Parent, isRead: false);
        await Notif(conn, "read", Parent, isRead: true);

        var (rows, total) = await Repo().ListNotificationsAsync(Ctx(), Parent, unreadOnly: true, skip: 0, take: 20);
        Assert.Equal(1, total);
        Assert.Equal(["unread"], rows.Select(r => r.Id));
    }

    [Fact]
    public async Task MarkRead_ownership_then_write()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
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
    public async Task MarkAll_counts_only_own_unread()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await Notif(conn, "u1", Parent, isRead: false);
        await Notif(conn, "u2", Parent, isRead: false);
        await Notif(conn, "already", Parent, isRead: true);
        await Notif(conn, "other", "other", isRead: false);

        var count = await Repo().MarkAllNotificationsReadAsync(Ctx(), Parent);
        Assert.Equal(2, count);
    }

    // ---- pending evaluations ----

    [Fact]
    public async Task Pending_scoped_by_lowercased_email_with_name_fallback()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await User(conn, Parent, "Parent P", "Parent@E.st"); // mixed-case stored email
        await User(conn, "kid", "Kid Name", "k@e.st");
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
    public async Task Pending_empty_when_no_email()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await User(conn, Parent, "Parent P", email: null);
        await EvalGroup(conn, "eg", "", Parent, isCompleted: false);
        Assert.Empty(await Repo().ListPendingEvaluationsAsync(Ctx(), Parent));
    }

    // ---- delete link ----

    [Fact]
    public async Task DeleteLink_parent_or_student_can_delete_others_403()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
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

    // ---- helpers ----

    private ParentPortalRepository Repo() =>
        new(new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()),
            new FixedTimeProvider(new DateTime(2026, 7, 24, 12, 0, 0, DateTimeKind.Utc)));

    private static RequestContext Ctx() =>
        RequestContext.Authenticated(
            new RequestActor(Parent, "parent", "p@e.st", "Parent"),
            schoolId: null, permissions: Array.Empty<string>(),
            tokenSource: TokenSource.DevelopmentHeader, isDevelopmentOverride: true);

    private sealed class FixedTimeProvider(DateTime utcNow) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => new(DateTime.SpecifyKind(utcNow, DateTimeKind.Utc));
    }

    private static async Task User(NpgsqlConnection conn, string id, string name, string? email, int? gradeLevel = null)
    {
        await using var cmd = new NpgsqlCommand(
            """INSERT INTO "users"("id","name","email","gradeLevel") VALUES(@id,@n,@e,@g)""", conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("n", name);
        cmd.Parameters.AddWithValue("e", (object?)email ?? DBNull.Value);
        cmd.Parameters.AddWithValue("g", (object?)gradeLevel ?? DBNull.Value);
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

    public sealed class Fixture : IAsyncLifetime
    {
        private readonly PostgreSqlContainer _container = new PostgreSqlBuilder().WithImage("postgres:16-alpine").Build();

        public string ConnectionString => _container.GetConnectionString();

        public async Task InitializeAsync()
        {
            await _container.StartAsync();
            await using var connection = new NpgsqlConnection(ConnectionString);
            await connection.OpenAsync();
            var assembly = Assembly.GetExecutingAssembly();
            var name = assembly.GetManifestResourceNames()
                .Single(n => n.EndsWith("parent-portal-schema.sql", StringComparison.Ordinal));
            await using var stream = assembly.GetManifestResourceStream(name)!;
            using var sr = new StreamReader(stream);
            await using var cmd = new NpgsqlCommand(await sr.ReadToEndAsync(), connection);
            await cmd.ExecuteNonQueryAsync();
        }

        public async Task DisposeAsync() => await _container.DisposeAsync();
    }
}
