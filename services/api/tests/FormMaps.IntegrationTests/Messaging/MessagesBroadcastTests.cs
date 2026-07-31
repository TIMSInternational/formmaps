using FormMaps.Application.Auth;
using FormMaps.Application.Messaging;
using FormMaps.Infrastructure.Data;
using FormMaps.Infrastructure.Messaging;
using Npgsql;

namespace FormMaps.IntegrationTests.Messaging;

public sealed class MessagesBroadcastTests : IClassFixture<MessagingDatabaseFixture>, IAsyncLifetime
{
    private readonly MessagingDatabaseFixture _fixture;
    private NpgsqlDataSource _dataSource = null!;

    public MessagesBroadcastTests(MessagingDatabaseFixture fixture) => _fixture = fixture;
    public Task InitializeAsync() { _dataSource = NpgsqlDataSource.Create(_fixture.ConnectionString); return Task.CompletedTask; }
    public async Task DisposeAsync() => await _dataSource.DisposeAsync();

    private MessagesRepository Repo() => new(
        new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()), TimeProvider.System,
        new NoopRealtimeNotifier());

    [Fact]
    public async Task Broadcasts_to_all_students_in_school()
    {
        var schoolId = Guid.NewGuid().ToString();
        var admin = await _fixture.SeedUserAsync(schoolId, "school_admin");
        var s1 = await _fixture.SeedUserAsync(schoolId, "student");
        var s2 = await _fixture.SeedUserAsync(schoolId, "student");
        var otherSchoolStudent = await _fixture.SeedUserAsync(Guid.NewGuid().ToString(), "student");

        var count = await Repo().BroadcastAsync(_fixture.Ctx(admin, schoolId), admin, "school_admin", schoolId, "students", "hello school");

        Assert.Equal(2, count);
    }

    [Fact]
    public async Task Counselor_broadcast_to_students_only_reaches_assigned_students()
    {
        var schoolId = Guid.NewGuid().ToString();
        var counselor = await _fixture.SeedUserAsync(schoolId, "counselor");
        var assigned = await _fixture.SeedUserAsync(schoolId, "student");
        var unassigned = await _fixture.SeedUserAsync(schoolId, "student");
        await _fixture.SeedAssignmentAsync(counselor, assigned);

        var count = await Repo().BroadcastAsync(_fixture.Ctx(counselor, schoolId), counselor, "counselor", schoolId, "students", "hi");

        Assert.Equal(1, count);
    }

    [Fact]
    public async Task Counselor_with_no_assignments_reaches_zero_students()
    {
        // Guards against restrictToIds ever being skipped/null for a counselor -- an empty
        // assignment list must yield zero recipients, not "unrestricted" fan-out to the whole school.
        var schoolId = Guid.NewGuid().ToString();
        var counselor = await _fixture.SeedUserAsync(schoolId, "counselor");
        await _fixture.SeedUserAsync(schoolId, "student");
        await _fixture.SeedUserAsync(schoolId, "student");

        var count = await Repo().BroadcastAsync(_fixture.Ctx(counselor, schoolId), counselor, "counselor", schoolId, "students", "hi");

        Assert.Equal(0, count);
    }

    [Fact]
    public async Task Counselor_broadcast_to_staff_is_not_restricted_to_assignments()
    {
        // restrictToIds only applies to (counselor, "students"). Confirms the restriction is scoped
        // correctly and doesn't accidentally leak into (or out of) other recipient groups.
        var schoolId = Guid.NewGuid().ToString();
        var counselor = await _fixture.SeedUserAsync(schoolId, "counselor");
        var otherCounselor = await _fixture.SeedUserAsync(schoolId, "counselor");
        var admin = await _fixture.SeedUserAsync(schoolId, "school_admin");

        var count = await Repo().BroadcastAsync(_fixture.Ctx(counselor, schoolId), counselor, "counselor", schoolId, "staff", "hi");

        Assert.Equal(2, count); // otherCounselor + admin; self excluded
    }

    [Fact]
    public async Task Blocked_recipients_are_excluded()
    {
        var schoolId = Guid.NewGuid().ToString();
        var admin = await _fixture.SeedUserAsync(schoolId, "school_admin");
        var blocked = await _fixture.SeedUserAsync(schoolId, "student");
        await _fixture.SeedBlockAsync(admin, blocked);

        var count = await Repo().BroadcastAsync(_fixture.Ctx(admin, schoolId), admin, "school_admin", schoolId, "students", "hi");

        Assert.Equal(0, count);
    }

    [Fact]
    public async Task Creates_a_conversation_and_message_per_recipient_with_updatedAt_bound()
    {
        var schoolId = Guid.NewGuid().ToString();
        var admin = await _fixture.SeedUserAsync(schoolId, "school_admin");
        var student = await _fixture.SeedUserAsync(schoolId, "student");

        await Repo().BroadcastAsync(_fixture.Ctx(admin, schoolId), admin, "school_admin", schoolId, "students", "hello there");

        var (pa, pb) = string.CompareOrdinal(admin, student) < 0 ? (admin, student) : (student, admin);
        await using var conn = new NpgsqlConnection(_fixture.ConnectionString);
        await conn.OpenAsync();

        await using var convCmd = new NpgsqlCommand(
            """SELECT "id", "lastMessagePreview", "updatedAt" FROM "conversations" WHERE "participantAId" = @pa AND "participantBId" = @pb""",
            conn);
        convCmd.Parameters.AddWithValue("pa", pa);
        convCmd.Parameters.AddWithValue("pb", pb);
        await using var convReader = await convCmd.ExecuteReaderAsync();
        Assert.True(await convReader.ReadAsync());
        var conversationId = convReader.GetString(0);
        Assert.Equal("hello there", convReader.GetString(1));
        Assert.NotEqual(default, convReader.GetDateTime(2)); // NOT NULL, no DB default -- must be explicitly bound
        await convReader.DisposeAsync();

        await using var msgCmd = new NpgsqlCommand(
            """SELECT "content", "senderId", "updatedAt" FROM "messages" WHERE "conversationId" = @cid""", conn);
        msgCmd.Parameters.AddWithValue("cid", conversationId);
        await using var msgReader = await msgCmd.ExecuteReaderAsync();
        Assert.True(await msgReader.ReadAsync());
        Assert.Equal("hello there", msgReader.GetString(0));
        Assert.Equal(admin, msgReader.GetString(1));
        Assert.NotEqual(default, msgReader.GetDateTime(2)); // NOT NULL, no DB default -- must be explicitly bound
    }

    [Fact]
    public async Task Rebroadcast_upserts_existing_conversation_and_bumps_updatedAt()
    {
        var schoolId = Guid.NewGuid().ToString();
        var admin = await _fixture.SeedUserAsync(schoolId, "school_admin");
        var student = await _fixture.SeedUserAsync(schoolId, "student");

        await Repo().BroadcastAsync(_fixture.Ctx(admin, schoolId), admin, "school_admin", schoolId, "students", "first");

        var (pa, pb) = string.CompareOrdinal(admin, student) < 0 ? (admin, student) : (student, admin);
        await using var conn = new NpgsqlConnection(_fixture.ConnectionString);
        await conn.OpenAsync();
        DateTime firstUpdatedAt;
        string firstConversationId;
        await using (var cmd = new NpgsqlCommand(
            """SELECT "id", "updatedAt" FROM "conversations" WHERE "participantAId" = @pa AND "participantBId" = @pb""", conn))
        {
            cmd.Parameters.AddWithValue("pa", pa);
            cmd.Parameters.AddWithValue("pb", pb);
            await using var reader = await cmd.ExecuteReaderAsync();
            await reader.ReadAsync();
            firstConversationId = reader.GetString(0);
            firstUpdatedAt = reader.GetDateTime(1);
        }

        await Task.Delay(50);
        var count = await Repo().BroadcastAsync(_fixture.Ctx(admin, schoolId), admin, "school_admin", schoolId, "students", "second");

        Assert.Equal(1, count);
        await using (var cmd = new NpgsqlCommand(
            """SELECT "id", "lastMessagePreview", "updatedAt" FROM "conversations" WHERE "participantAId" = @pa AND "participantBId" = @pb""", conn))
        {
            cmd.Parameters.AddWithValue("pa", pa);
            cmd.Parameters.AddWithValue("pb", pb);
            await using var reader = await cmd.ExecuteReaderAsync();
            await reader.ReadAsync();
            Assert.Equal(firstConversationId, reader.GetString(0)); // same conversation, not a duplicate
            Assert.Equal("second", reader.GetString(1));
            Assert.True(reader.GetDateTime(2) > firstUpdatedAt); // updatedAt bumped on ON CONFLICT DO UPDATE too
        }
    }

    [Fact]
    public async Task Queues_a_notification_outbox_row_per_recipient()
    {
        var schoolId = Guid.NewGuid().ToString();
        var admin = await _fixture.SeedUserAsync(schoolId, "school_admin");
        var s1 = await _fixture.SeedUserAsync(schoolId, "student");
        var s2 = await _fixture.SeedUserAsync(schoolId, "student");

        await Repo().BroadcastAsync(_fixture.Ctx(admin, schoolId), admin, "school_admin", schoolId, "students", "hi all");

        await using var conn = new NpgsqlConnection(_fixture.ConnectionString);
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand(
            """SELECT count(*)::int FROM "notification_outbox" WHERE "type" = 'unread_message' AND "payload"->>'preview' = 'hi all'""",
            conn);
        var result = await cmd.ExecuteScalarAsync();
        Assert.Equal(2, (int)result!);
    }
}
