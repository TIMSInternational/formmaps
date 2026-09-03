using FormMaps.Application.Auth;
using FormMaps.Application.Messaging;
using FormMaps.Infrastructure.Data;
using FormMaps.Infrastructure.Messaging;
using Npgsql;

namespace FormMaps.IntegrationTests.Messaging;

public sealed class MessagesSendMessageTests : IClassFixture<MessagingDatabaseFixture>, IAsyncLifetime
{
    private readonly MessagingDatabaseFixture _fixture;
    private NpgsqlDataSource _dataSource = null!;

    public MessagesSendMessageTests(MessagingDatabaseFixture fixture) => _fixture = fixture;
    public Task InitializeAsync() { _dataSource = NpgsqlDataSource.Create(_fixture.ConnectionString); return Task.CompletedTask; }
    public async Task DisposeAsync() => await _dataSource.DisposeAsync();

    // Legacy's Prisma DateTime -> JSON wire format: "2026-01-01T00:00:00.000Z" (ms precision, Z marker).
    private const string IsoZPattern = @"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$";

    private MessagesRepository Repo() => new(
        new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()), TimeProvider.System,
        new NoopRealtimeNotifier());

    [Fact]
    public async Task Sends_a_message_and_updates_conversation_preview()
    {
        var (userId, otherId, conversationId) = await _fixture.SeedConversationAsync();

        var result = await Repo().SendMessageAsync(_fixture.Ctx(userId), userId, conversationId, "hello there");

        Assert.Equal(SendMessageStatus.Sent, result.Status);
        Assert.Equal("hello there", result.Message!.Content);
        Assert.Equal(otherId, result.RecipientId);
    }

    [Fact]
    public async Task Sent_message_createdDate_is_iso_z_and_round_trips_the_stored_instant()
    {
        var (userId, _, conversationId) = await _fixture.SeedConversationAsync();

        var result = await Repo().SendMessageAsync(_fixture.Ctx(userId), userId, conversationId, "hello there");

        // ISO-Z, not +00:00 and not a bare local time -- this is the value the web's optimistic echo is
        // replaced with, so a local-time string would make the sent message jump by the viewer's offset.
        var createdDate = result.Message!.CreatedDate;
        Assert.Matches(IsoZPattern, createdDate);
        Assert.DoesNotContain("+00:00", createdDate);
        Assert.Null(result.Message.ReadAt);
        var (_, _, updatedAt) = await GetMessageAsync(result.Message.Id);
        Assert.Equal(DateTime.SpecifyKind(updatedAt, DateTimeKind.Utc), DateTime.Parse(createdDate, null, System.Globalization.DateTimeStyles.AdjustToUniversal));
    }

    [Fact]
    public async Task Notifies_the_recipient_via_the_realtime_notifier_after_commit()
    {
        var (userId, otherId, conversationId) = await _fixture.SeedConversationAsync();
        var notifier = new CapturingRealtimeNotifier();
        var repo = new MessagesRepository(
            new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()), TimeProvider.System, notifier);

        var result = await repo.SendMessageAsync(_fixture.Ctx(userId), userId, conversationId, "hello there");

        Assert.Equal(1, notifier.CallCount);
        Assert.Equal(otherId, notifier.LastRecipientUserId);
        var payloadId = notifier.LastPayload!.GetType().GetProperty("id")!.GetValue(notifier.LastPayload) as string;
        Assert.Equal(result.Message!.Id, payloadId);
    }

    [Fact]
    public async Task Realtime_payload_createdDate_is_iso_z_matching_the_rest_response()
    {
        var (userId, _, conversationId) = await _fixture.SeedConversationAsync();
        var notifier = new CapturingRealtimeNotifier();
        var repo = new MessagesRepository(
            new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()), TimeProvider.System, notifier);

        var result = await repo.SendMessageAsync(_fixture.Ctx(userId), userId, conversationId, "hello there");

        // The SignalR push is serialized straight from this anonymous object, so it must already carry
        // the ISO-Z string -- a raw DateTime (Kind.Unspecified) would go out as a bare local time and the
        // recipient's browser would render it shifted by its UTC offset, unlike the poll that follows.
        var createdDate = notifier.LastPayload!.GetType().GetProperty("createdDate")!.GetValue(notifier.LastPayload);
        var createdDateString = Assert.IsType<string>(createdDate);
        Assert.Matches(IsoZPattern, createdDateString);
        Assert.DoesNotContain("+00:00", createdDateString);
        Assert.Equal(result.Message!.CreatedDate, createdDate);
    }

    [Fact]
    public async Task Blocked_pair_cannot_send()
    {
        var (userId, otherId, conversationId) = await _fixture.SeedConversationAsync();
        await _fixture.SeedBlockAsync(userId, otherId);

        var result = await Repo().SendMessageAsync(_fixture.Ctx(userId), userId, conversationId, "hi");

        Assert.Equal(SendMessageStatus.Blocked, result.Status);
    }

    [Fact]
    public async Task Non_participant_gets_not_found()
    {
        var (_, _, conversationId) = await _fixture.SeedConversationAsync();
        var stranger = Guid.NewGuid().ToString();

        var result = await Repo().SendMessageAsync(_fixture.Ctx(stranger), stranger, conversationId, "hi");

        Assert.Equal(SendMessageStatus.NotFound, result.Status);
    }

    [Fact]
    public async Task Missing_conversation_also_returns_not_found()
    {
        var userId = Guid.NewGuid().ToString();

        var result = await Repo().SendMessageAsync(_fixture.Ctx(userId), userId, Guid.NewGuid().ToString(), "hi");

        Assert.Equal(SendMessageStatus.NotFound, result.Status);
    }

    [Fact]
    public async Task Persists_the_message_row_with_updatedAt_bound()
    {
        var (userId, _, conversationId) = await _fixture.SeedConversationAsync();

        var result = await Repo().SendMessageAsync(_fixture.Ctx(userId), userId, conversationId, "hello there");

        var (content, senderId, updatedAt) = await GetMessageAsync(result.Message!.Id);
        Assert.Equal("hello there", content);
        Assert.Equal(userId, senderId);
        Assert.NotEqual(default, updatedAt); // NOT NULL, no DB default -- must be explicitly bound
    }

    [Fact]
    public async Task Updates_conversation_preview_lastMessageAt_and_updatedAt()
    {
        var (userId, _, conversationId) = await _fixture.SeedConversationAsync();
        var updatedAtBefore = await GetConversationUpdatedAtAsync(conversationId);

        await Repo().SendMessageAsync(_fixture.Ctx(userId), userId, conversationId, "hello there");

        var (preview, lastMessageAt, updatedAtAfter) = await GetConversationPreviewAsync(conversationId);
        Assert.Equal("hello there", preview);
        Assert.NotNull(lastMessageAt);
        Assert.NotEqual(default, updatedAtAfter); // NOT NULL, no DB default -- must be explicitly bound
        Assert.True(updatedAtAfter >= updatedAtBefore);
    }

    [Fact]
    public async Task Truncates_preview_over_100_characters()
    {
        var (userId, _, conversationId) = await _fixture.SeedConversationAsync();
        var content = new string('x', 150);

        var result = await Repo().SendMessageAsync(_fixture.Ctx(userId), userId, conversationId, content);

        Assert.Equal(new string('x', 97) + "...", result.Preview);
        var (preview, _, _) = await GetConversationPreviewAsync(conversationId);
        Assert.Equal(new string('x', 97) + "...", preview);
    }

    [Fact]
    public async Task Returns_recipient_email_and_sender_name_for_the_outbox()
    {
        var (userId, otherId, conversationId) = await _fixture.SeedConversationAsync();

        var result = await Repo().SendMessageAsync(_fixture.Ctx(userId), userId, conversationId, "hello there");

        Assert.Equal($"{otherId}@test.dev", result.RecipientEmail);
        Assert.Equal(userId, result.SenderName); // fixture seeds "name" == userId
    }

    [Fact]
    public async Task Queues_a_notification_outbox_row_due_five_minutes_later()
    {
        var (userId, otherId, conversationId) = await _fixture.SeedConversationAsync();

        var before = DateTime.UtcNow;
        var result = await Repo().SendMessageAsync(_fixture.Ctx(userId), userId, conversationId, "hello there");

        await using var conn = new NpgsqlConnection(_fixture.ConnectionString);
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand(
            """SELECT "type", "payload"->>'recipientEmail', "payload"->>'preview', "payload"->>'senderName', "due_at" FROM "notification_outbox" WHERE "payload"->>'messageId' = @mid""",
            conn);
        cmd.Parameters.AddWithValue("mid", result.Message!.Id);
        await using var reader = await cmd.ExecuteReaderAsync();
        Assert.True(await reader.ReadAsync());
        Assert.Equal("unread_message", reader.GetString(0));
        Assert.Equal($"{otherId}@test.dev", reader.GetString(1));
        Assert.Equal("hello there", reader.GetString(2));
        Assert.Equal(userId, reader.GetString(3));
        var dueAt = reader.GetDateTime(4);
        Assert.True(dueAt >= before.AddMinutes(5).AddSeconds(-5) && dueAt <= before.AddMinutes(5).AddSeconds(5));
    }

    private async Task<(string Content, string SenderId, DateTime UpdatedAt)> GetMessageAsync(string messageId)
    {
        await using var conn = new NpgsqlConnection(_fixture.ConnectionString);
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand(
            """SELECT "content", "senderId", "updatedAt" FROM "messages" WHERE "id" = @id""", conn);
        cmd.Parameters.AddWithValue("id", messageId);
        await using var reader = await cmd.ExecuteReaderAsync();
        await reader.ReadAsync();
        return (reader.GetString(0), reader.GetString(1), reader.GetDateTime(2));
    }

    private async Task<(string? Preview, DateTime? LastMessageAt, DateTime UpdatedAt)> GetConversationPreviewAsync(string conversationId)
    {
        await using var conn = new NpgsqlConnection(_fixture.ConnectionString);
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand(
            """SELECT "lastMessagePreview", "lastMessageAt", "updatedAt" FROM "conversations" WHERE "id" = @id""", conn);
        cmd.Parameters.AddWithValue("id", conversationId);
        await using var reader = await cmd.ExecuteReaderAsync();
        await reader.ReadAsync();
        return (
            reader.IsDBNull(0) ? null : reader.GetString(0),
            reader.IsDBNull(1) ? null : reader.GetDateTime(1),
            reader.GetDateTime(2));
    }

    private async Task<DateTime> GetConversationUpdatedAtAsync(string conversationId)
    {
        var (_, _, updatedAt) = await GetConversationPreviewAsync(conversationId);
        return updatedAt;
    }
}
