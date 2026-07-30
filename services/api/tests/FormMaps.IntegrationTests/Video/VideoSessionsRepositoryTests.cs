using System.Reflection;
using FormMaps.Application.Auth;
using FormMaps.Application.Video;
using FormMaps.Infrastructure.Data;
using FormMaps.Infrastructure.Video;
using Npgsql;
using Testcontainers.PostgreSql;

namespace FormMaps.IntegrationTests.Video;

public sealed class VideoSessionsRepositoryTests : IClassFixture<VideoSessionsRepositoryTests.Fixture>, IAsyncLifetime
{
    private readonly Fixture _fixture;
    private NpgsqlDataSource _dataSource = null!;

    public VideoSessionsRepositoryTests(Fixture fixture) => _fixture = fixture;

    public async Task InitializeAsync()
    {
        _dataSource = NpgsqlDataSource.Create(_fixture.ConnectionString);
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand("""TRUNCATE "users","counselor_sessions","schools" CASCADE""", conn);
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task DisposeAsync() => await _dataSource.DisposeAsync();

    [Fact]
    public async Task IsVideoEnabled_true_false_and_missing_school()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await School(conn, "s-on", videoEnabled: true);
        await School(conn, "s-off", videoEnabled: false);

        Assert.True(await Repo().IsVideoEnabledForSchoolAsync(Ctx(), "s-on"));
        Assert.False(await Repo().IsVideoEnabledForSchoolAsync(Ctx(), "s-off"));
        Assert.False(await Repo().IsVideoEnabledForSchoolAsync(Ctx(), "missing"));
    }

    [Fact]
    public async Task ListForUser_scopes_either_role_video_call_only_desc_take_50()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await User(conn, "s1", "Alice"); await User(conn, "c1", "Coach");
        await Session(conn, "as-counselor", "u1", "s1", start: new DateTime(2026, 7, 1));
        await Session(conn, "as-student", "c1", "u1", start: new DateTime(2026, 7, 10));
        await Session(conn, "not-video", "u1", "s1", topic: "Coaching Session");
        await Session(conn, "no-link", "u1", "s1", meetingLink: "");

        var rows = await Repo().ListForUserAsync(Ctx(), "u1");

        Assert.Equal(["as-student", "as-counselor"], rows.Select(r => r.Id)); // startTime DESC
    }

    [Fact]
    public async Task GetById_has_no_topic_filter_and_joins_both_names()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await User(conn, "c1", "Coach"); await User(conn, "s1", "Alice");
        await Session(conn, "any-topic", "c1", "s1", topic: "Coaching Session");

        var row = await Repo().GetByIdAsync(Ctx(), "any-topic");

        Assert.NotNull(row);
        Assert.Equal("Coach", row!.CounselorName);
        Assert.Equal("Alice", row.StudentName);
    }

    [Fact]
    public async Task FindByRoomName_requires_video_call_topic()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await User(conn, "c1", "Coach"); await User(conn, "s1", "Alice");
        await Session(conn, "vc", "c1", "s1", meetingLink: "room-x", topic: "Video Call");
        await Session(conn, "other", "c1", "s1", meetingLink: "room-y", topic: "Coaching Session");

        Assert.Equal("vc", (await Repo().FindByRoomNameAsync(Ctx(), "room-x"))!.Id);
        Assert.Null(await Repo().FindByRoomNameAsync(Ctx(), "room-y"));
    }

    [Fact]
    public async Task Create_stamps_video_active_1hr_window_and_random_link()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await User(conn, "c1", "Coach"); await User(conn, "s1", "Alice");

        var created = await Repo().CreateAsync(Ctx(), "c1", "s1");

        Assert.StartsWith("formmaps-", created.SessionName);
        Assert.Equal(16 + "formmaps-".Length, created.SessionName.Length); // 8 bytes → 16 hex chars

        var row = await Repo().GetByIdAsync(Ctx(), created.Id);
        Assert.Equal("video_active", row!.Status);
        Assert.Equal("Video Call", row.Topic);
    }

    [Fact]
    public async Task End_not_found_forbidden_then_ok()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await User(conn, "c1", "Coach"); await User(conn, "s1", "Alice");
        await Session(conn, "sess", "c1", "s1", status: "video_active");

        Assert.Equal(SessionMutationOutcomeKind.NotFound, await Repo().EndAsync(Ctx(), "nope", "c1"));
        Assert.Equal(SessionMutationOutcomeKind.Forbidden, await Repo().EndAsync(Ctx(), "sess", "stranger"));
        Assert.Equal(SessionMutationOutcomeKind.Ok, await Repo().EndAsync(Ctx(), "sess", "c1"));

        var row = await Repo().GetByIdAsync(Ctx(), "sess");
        Assert.Equal("completed", row!.Status);
        Assert.NotNull(row.CompletedAt);
    }

    [Fact]
    public async Task Start_not_found_forbidden_not_scheduled_then_ok()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await User(conn, "c1", "Coach"); await User(conn, "s1", "Alice");
        await Session(conn, "sess", "c1", "s1", status: "scheduled", meetingLink: "room-z");
        await Session(conn, "active", "c1", "s1", status: "video_active");

        Assert.Equal(SessionMutationOutcomeKind.NotFound, (await Repo().StartAsync(Ctx(), "nope", "c1")).Kind);
        Assert.Equal(SessionMutationOutcomeKind.Forbidden, (await Repo().StartAsync(Ctx(), "sess", "stranger")).Kind);
        Assert.Equal(SessionMutationOutcomeKind.NotScheduled, (await Repo().StartAsync(Ctx(), "active", "c1")).Kind);

        var (kind, sessionName) = await Repo().StartAsync(Ctx(), "sess", "c1");
        Assert.Equal(SessionMutationOutcomeKind.Ok, kind);
        Assert.Equal("room-z", sessionName);
        Assert.Equal("video_active", (await Repo().GetByIdAsync(Ctx(), "sess"))!.Status);
    }

    [Fact]
    public async Task FindParticipantCandidate_and_assignment_check()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await User(conn, "s1", "Alice");
        await using (var cmd = new NpgsqlCommand(
            """INSERT INTO "counselor_student_assignments" ("id","counselorId","studentId","isActive") VALUES (gen_random_uuid()::text,'c1','s1',true)""", conn))
        {
            await cmd.ExecuteNonQueryAsync();
        }

        var candidate = await Repo().FindParticipantCandidateAsync(Ctx(), "s1");
        Assert.Equal("Alice", candidate!.Name);
        Assert.Null(await Repo().FindParticipantCandidateAsync(Ctx(), "missing"));

        Assert.True(await Repo().HasActiveCounselorAssignmentAsync(Ctx(), "c1", "s1"));
        Assert.False(await Repo().HasActiveCounselorAssignmentAsync(Ctx(), "c1", "someone-else"));
    }

    // ---- helpers ----

    private VideoSessionsRepository Repo() =>
        new(new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()), TimeProvider.System);

    // Identity-GUC context — NOT System()/Bypass (see the note after Task 1 Step 3). schoolId "school-1"
    // is a placeholder; individual tests insert whatever school/user rows they need under their own ids.
    private static RequestContext Ctx() =>
        RequestContext.Authenticated(
            new RequestActor("test-caller", "counselor", "c@e.st", "Caller"),
            schoolId: "school-1", permissions: [], tokenSource: TokenSource.DevelopmentHeader, isDevelopmentOverride: true);

    private static async Task User(NpgsqlConnection conn, string id, string name)
    {
        await using var cmd = new NpgsqlCommand(
            """INSERT INTO "users" ("id","name","email","isActive") VALUES (@id,@name,@id||'@x.test',true)""", conn);
        cmd.Parameters.AddWithValue("id", id); cmd.Parameters.AddWithValue("name", name);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task School(NpgsqlConnection conn, string id, bool videoEnabled)
    {
        await using var cmd = new NpgsqlCommand(
            """INSERT INTO "schools" ("id","name","videoCallsEnabled") VALUES (@id,@id,@enabled)""", conn);
        cmd.Parameters.AddWithValue("id", id); cmd.Parameters.AddWithValue("enabled", videoEnabled);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task Session(
        NpgsqlConnection conn, string id, string counselorId, string studentId,
        DateTime? start = null, string status = "video_active", string topic = "Video Call",
        string? meetingLink = null)
    {
        await using var cmd = new NpgsqlCommand("""
            INSERT INTO "counselor_sessions"
                ("id","counselorId","studentId","startTime","endTime","status","topic","notes",
                 "counselorNotes","meetingLink","calendarEventIds","cancellationReason","isActive",
                 "createdDate","updatedAt")
            VALUES (@id,@cid,@sid,@start,@start,@status,@topic,'','',@link,'{}','',true,@start,@start)
            """, conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("cid", counselorId);
        cmd.Parameters.AddWithValue("sid", studentId);
        cmd.Parameters.AddWithValue("start", start ?? new DateTime(2026, 1, 1));
        cmd.Parameters.AddWithValue("status", status);
        cmd.Parameters.AddWithValue("topic", topic);
        cmd.Parameters.AddWithValue("link", meetingLink ?? $"link-{id}");
        await cmd.ExecuteNonQueryAsync();
    }

    public sealed class Fixture : IAsyncLifetime
    {
        private readonly PostgreSqlContainer _container =
            new PostgreSqlBuilder().WithImage("postgres:16-alpine").Build();

        public string ConnectionString => _container.GetConnectionString();

        public async Task InitializeAsync()
        {
            await _container.StartAsync();
            await using var connection = new NpgsqlConnection(ConnectionString);
            await connection.OpenAsync();
            var assembly = Assembly.GetExecutingAssembly();
            var name = assembly.GetManifestResourceNames().Single(n => n.EndsWith("video-sessions-schema.sql", StringComparison.Ordinal));
            await using var stream = assembly.GetManifestResourceStream(name)!;
            using var sr = new StreamReader(stream);
            await using var cmd = new NpgsqlCommand(await sr.ReadToEndAsync(), connection);
            await cmd.ExecuteNonQueryAsync();
        }

        public async Task DisposeAsync() => await _container.DisposeAsync();
    }
}
