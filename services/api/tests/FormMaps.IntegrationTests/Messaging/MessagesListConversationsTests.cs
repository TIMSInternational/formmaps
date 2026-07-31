using FormMaps.Application.Auth;
using FormMaps.Infrastructure.Data;
using FormMaps.Infrastructure.Messaging;
using Npgsql;

namespace FormMaps.IntegrationTests.Messaging;

public sealed class MessagesListConversationsTests : IClassFixture<MessagingDatabaseFixture>, IAsyncLifetime
{
    private readonly MessagingDatabaseFixture _fixture;
    private NpgsqlDataSource _dataSource = null!;

    public MessagesListConversationsTests(MessagingDatabaseFixture fixture) => _fixture = fixture;
    public Task InitializeAsync() { _dataSource = NpgsqlDataSource.Create(_fixture.ConnectionString); return Task.CompletedTask; }
    public async Task DisposeAsync() => await _dataSource.DisposeAsync();

    private MessagesRepository Repo() => new(
        new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()), TimeProvider.System);

    [Fact]
    public async Task Lists_my_conversations_with_correct_other_participant_and_unread_count()
    {
        var (userId, otherId, conversationId) = await _fixture.SeedConversationAsync();
        await _fixture.SeedMessageAsync(conversationId, senderId: otherId, readAt: null);
        await _fixture.SeedMessageAsync(conversationId, senderId: otherId, readAt: null);

        // Update conversation with lastMessagePreview and lastMessageAt (normally done by application)
        await UpdateConversationPreviewAsync(conversationId, "hi", DateTime.UtcNow);

        var results = await Repo().ListConversationsAsync(_fixture.Ctx(userId), userId);

        var conv = Assert.Single(results);
        Assert.Equal(otherId, conv.OtherParticipantId);
        Assert.NotNull(conv.OtherParticipantName);
        Assert.NotNull(conv.OtherParticipantEmail);
        Assert.NotNull(conv.LastMessagePreview);
        Assert.NotNull(conv.LastMessageAt);
        Assert.Equal(2, conv.UnreadCount);
    }

    [Fact]
    public async Task Lists_conversations_with_both_participantA_and_B_assignment()
    {
        // Seed two conversations to ensure both branch paths (participantA and participantB) are tested
        var (userId1, otherId1, convId1) = await _fixture.SeedConversationAsync();
        var (userId2, otherId2, convId2) = await _fixture.SeedConversationAsync();

        await _fixture.SeedMessageAsync(convId1, senderId: otherId1, readAt: null);
        await _fixture.SeedMessageAsync(convId2, senderId: otherId2, readAt: null);

        // Update conversations with preview and timestamp
        await UpdateConversationPreviewAsync(convId1, "hi", DateTime.UtcNow);
        await UpdateConversationPreviewAsync(convId2, "hi", DateTime.UtcNow);

        var results1 = await Repo().ListConversationsAsync(_fixture.Ctx(userId1), userId1);
        var results2 = await Repo().ListConversationsAsync(_fixture.Ctx(userId2), userId2);

        var conv1 = Assert.Single(results1);
        var conv2 = Assert.Single(results2);

        // Both should have correct other participant and field resolution
        Assert.Equal(otherId1, conv1.OtherParticipantId);
        Assert.NotNull(conv1.OtherParticipantName);
        Assert.NotNull(conv1.OtherParticipantEmail);

        Assert.Equal(otherId2, conv2.OtherParticipantId);
        Assert.NotNull(conv2.OtherParticipantName);
        Assert.NotNull(conv2.OtherParticipantEmail);
    }

    [Fact]
    public async Task New_conversation_with_no_messages_sorts_before_conversation_with_messages()
    {
        // Create conversation with message (lastMessageAt is set)
        var (userId, otherId1, convIdWithMsg) = await _fixture.SeedConversationAsync();
        await _fixture.SeedMessageAsync(convIdWithMsg, senderId: otherId1, readAt: null);
        await UpdateConversationPreviewAsync(convIdWithMsg, "hi", DateTime.UtcNow);

        // Create conversation with no message (lastMessageAt is NULL)
        var otherId2 = await _fixture.SeedUserAsync(null, "counselor");
        var convIdNoMsg = Guid.NewGuid().ToString();
        await using var conn = new Npgsql.NpgsqlConnection(_fixture.ConnectionString);
        await conn.OpenAsync();
        var (pa, pb) = string.CompareOrdinal(userId, otherId2) < 0 ? (userId, otherId2) : (otherId2, userId);
        await using var cmd = new Npgsql.NpgsqlCommand(
            """INSERT INTO "conversations" ("id","participantAId","participantBId") VALUES (@id,@pa,@pb)""", conn);
        cmd.Parameters.AddWithValue("id", convIdNoMsg);
        cmd.Parameters.AddWithValue("pa", pa);
        cmd.Parameters.AddWithValue("pb", pb);
        await cmd.ExecuteNonQueryAsync();

        var results = await Repo().ListConversationsAsync(_fixture.Ctx(userId), userId);

        Assert.Equal(2, results.Count);
        // New conversation (NULL lastMessageAt) should come FIRST due to NULLS FIRST ordering
        Assert.Null(results[0].LastMessageAt);
        Assert.NotNull(results[1].LastMessageAt);
    }

    private async Task UpdateConversationPreviewAsync(string conversationId, string preview, DateTime timestamp)
    {
        await using var conn = new Npgsql.NpgsqlConnection(_fixture.ConnectionString);
        await conn.OpenAsync();
        await using var cmd = new Npgsql.NpgsqlCommand(
            """UPDATE "conversations" SET "lastMessagePreview" = @preview, "lastMessageAt" = @timestamp WHERE "id" = @id""", conn);
        cmd.Parameters.AddWithValue("preview", preview);
        cmd.Parameters.AddWithValue("timestamp", timestamp);
        cmd.Parameters.AddWithValue("id", conversationId);
        await cmd.ExecuteNonQueryAsync();
    }
}
