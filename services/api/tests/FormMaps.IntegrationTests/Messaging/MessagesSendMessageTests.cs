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
