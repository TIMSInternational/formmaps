using System.Collections.Concurrent;
using FormMaps.Application.Auth;
using FormMaps.Application.Email;
using FormMaps.Infrastructure.Data;
using FormMaps.Infrastructure.SchoolAdmin;
using Npgsql;

namespace FormMaps.IntegrationTests.SchoolAdmin;

/// <summary>
/// Real-DB (Testcontainers) tests for <see cref="SchoolAdminEmailWriter"/> (FM-DOTNET-045). Pins setup360's
/// bulk evaluation_groups create (self-as-Parent + parent-links + counselor-as-Teacher), the dedup skip on the
/// existing-groups key, gradeLevel resolution, empty→null; and sendReminders' school-404→null + sent/failed
/// counting. A fake IEmailSender records calls (no real SES); EmailTemplates renders the real HTML.
/// </summary>
public sealed class SchoolAdminEmailWriterTests : IClassFixture<SchoolAdminDatabaseFixture>, IAsyncLifetime
{
    private const string School = "school-1";
    private const string Actor = "admin-1";

    private readonly SchoolAdminDatabaseFixture _fixture;
    private NpgsqlDataSource _dataSource = null!;

    public SchoolAdminEmailWriterTests(SchoolAdminDatabaseFixture fixture) => _fixture = fixture;

    public async Task InitializeAsync()
    {
        _dataSource = NpgsqlDataSource.Create(_fixture.ConnectionString);
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand(
            """TRUNCATE "evaluation_groups","users","schools","student_parent_links","counselor_student_assignments" """, conn);
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task DisposeAsync() => await _dataSource.DisposeAsync();

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
            """INSERT INTO "evaluation_groups" ("id","evaluatedUserId","evaluatorEmail","groupType","invitationToken","tokenExpiryDate") VALUES (@id,@u,@e,@g,@t,CURRENT_TIMESTAMP)""",
            ("id", Guid.NewGuid().ToString()), ("u", evaluatedUserId), ("e", evaluatorEmail), ("g", groupType), ("t", "seed-token"));
    }

    private async Task<List<GroupRow>> GroupsAsync(string evaluatedUserId)
    {
        var rows = new List<GroupRow>();
        await using var conn = await _dataSource.OpenConnectionAsync();
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
        await using var conn = await _dataSource.OpenConnectionAsync();
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
