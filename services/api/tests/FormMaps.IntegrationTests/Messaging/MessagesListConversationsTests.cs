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
    public async Task Lists_conversations_with_both_participantA_and_B_assignment_branches()
    {
        // Deterministically test both CASE-WHEN branches by forcing userId into A slot in one conversation and B slot in another
        var userId = Guid.NewGuid().ToString();

        // Generate otherId1 where userId < otherId1 (userId will be participantA)
        var otherId1 = Guid.NewGuid().ToString();
        var userIsAWithOther1 = string.CompareOrdinal(userId, otherId1) < 0;

        // Generate otherId2 with opposite ordering (userId will be participantB if userIsAWithOther1 is true)
        string otherId2;
        do
        {
            otherId2 = Guid.NewGuid().ToString();
        } while ((string.CompareOrdinal(userId, otherId2) < 0) == userIsAWithOther1);
        // Now userId is A with one and B with the other

        // Create users and conversations via direct SQL to force A/B assignment
        await using var conn = new Npgsql.NpgsqlConnection(_fixture.ConnectionString);
        await conn.OpenAsync();

        foreach (var id in new[] { userId, otherId1, otherId2 })
        {
            await using var userCmd = new Npgsql.NpgsqlCommand(
                """INSERT INTO "users" ("id","name","email","roleId","roleName","schoolId","isActive") VALUES (@id,@id,@id || '@test.dev','r','student',null,true)""",
                conn);
            userCmd.Parameters.AddWithValue("id", id);
            await userCmd.ExecuteNonQueryAsync();
        }

        // Create first conversation (userId vs otherId1)
        var (pa1, pb1) = string.CompareOrdinal(userId, otherId1) < 0 ? (userId, otherId1) : (otherId1, userId);
        var convId1 = Guid.NewGuid().ToString();
        await using var cmd1 = new Npgsql.NpgsqlCommand(
            """INSERT INTO "conversations" ("id","participantAId","participantBId") VALUES (@id,@pa,@pb)""", conn);
        cmd1.Parameters.AddWithValue("id", convId1);
        cmd1.Parameters.AddWithValue("pa", pa1);
        cmd1.Parameters.AddWithValue("pb", pb1);
        await cmd1.ExecuteNonQueryAsync();

        // Create second conversation (userId vs otherId2)
        var (pa2, pb2) = string.CompareOrdinal(userId, otherId2) < 0 ? (userId, otherId2) : (otherId2, userId);
        var convId2 = Guid.NewGuid().ToString();
        await using var cmd2 = new Npgsql.NpgsqlCommand(
            """INSERT INTO "conversations" ("id","participantAId","participantBId") VALUES (@id,@pa,@pb)""", conn);
        cmd2.Parameters.AddWithValue("id", convId2);
        cmd2.Parameters.AddWithValue("pa", pa2);
        cmd2.Parameters.AddWithValue("pb", pb2);
        await cmd2.ExecuteNonQueryAsync();

        // Add messages so we can update preview/timestamp
        await _fixture.SeedMessageAsync(convId1, senderId: otherId1, readAt: null);
        await _fixture.SeedMessageAsync(convId2, senderId: otherId2, readAt: null);

        // Update conversations with preview and timestamp
        await UpdateConversationPreviewAsync(convId1, "hi", DateTime.UtcNow);
        await UpdateConversationPreviewAsync(convId2, "hi", DateTime.UtcNow);

        // Query both conversations
        var results = await Repo().ListConversationsAsync(_fixture.Ctx(userId), userId);

        Assert.Equal(2, results.Count);

        // Verify both conversations are returned with correct participant info
        var conv1 = results.FirstOrDefault(c => c.OtherParticipantId == otherId1);
        var conv2 = results.FirstOrDefault(c => c.OtherParticipantId == otherId2);

        Assert.NotNull(conv1);
        Assert.NotNull(conv2);

        // Key assertions: verify field resolution works correctly for BOTH branches
        Assert.Equal(otherId1, conv1.OtherParticipantId);
        Assert.NotNull(conv1.OtherParticipantName);
        Assert.NotNull(conv1.OtherParticipantEmail);
        Assert.NotNull(conv1.LastMessagePreview);
        Assert.NotNull(conv1.LastMessageAt);

        Assert.Equal(otherId2, conv2.OtherParticipantId);
        Assert.NotNull(conv2.OtherParticipantName);
        Assert.NotNull(conv2.OtherParticipantEmail);
        Assert.NotNull(conv2.LastMessagePreview);
        Assert.NotNull(conv2.LastMessageAt);
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
