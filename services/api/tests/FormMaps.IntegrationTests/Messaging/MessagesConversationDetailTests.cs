using FormMaps.Application.Auth;
using FormMaps.Application.Messaging;
using FormMaps.Infrastructure.Data;
using FormMaps.Infrastructure.Messaging;
using Npgsql;

namespace FormMaps.IntegrationTests.Messaging;

public sealed class MessagesConversationDetailTests : IClassFixture<MessagingDatabaseFixture>, IAsyncLifetime
{
    private readonly MessagingDatabaseFixture _fixture;
    private NpgsqlDataSource _dataSource = null!;

    public MessagesConversationDetailTests(MessagingDatabaseFixture fixture) => _fixture = fixture;
    public Task InitializeAsync() { _dataSource = NpgsqlDataSource.Create(_fixture.ConnectionString); return Task.CompletedTask; }
    public async Task DisposeAsync() => await _dataSource.DisposeAsync();

    private MessagesRepository Repo() => new(
        new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()), TimeProvider.System);

    [Fact]
    public async Task Returns_paginated_messages_and_marks_unread_ones_as_read()
    {
        var (userId, otherId, conversationId) = await _fixture.SeedConversationAsync();
        await _fixture.SeedMessageAsync(conversationId, otherId, readAt: null);
        await _fixture.SeedMessageAsync(conversationId, otherId, readAt: null);

        var result = await Repo().GetConversationMessagesAsync(_fixture.Ctx(userId), userId, conversationId, page: 1, limit: 50);

        Assert.Equal(ConversationMessagesStatus.Ok, result.Status);
        Assert.Equal(2, result.Page!.Total);
        Assert.Equal(2, result.Page.Data.Count);
        Assert.Equal(1, result.Page.Page);
        Assert.Equal(50, result.Page.Limit);
        Assert.Equal(1, result.Page.TotalPages);

        // The SELECT that builds the returned page runs BEFORE the mark-as-read UPDATE, so the rows in
        // `result.Page.Data` still reflect ReadAt == null at read time -- asserting non-null on them here
        // would be asserting an implementation detail that doesn't hold, not real mark-as-read behavior.
        // Verify the actual DB state directly instead.
        foreach (var message in result.Page.Data)
        {
            var readAt = await GetReadAtAsync(conversationId, message.Id);
            Assert.NotNull(readAt);
        }
    }

    [Fact]
    public async Task Does_not_mark_my_own_messages_or_already_read_messages()
    {
        var (userId, otherId, conversationId) = await _fixture.SeedConversationAsync();
        await _fixture.SeedMessageAsync(conversationId, userId, readAt: null); // my own, must stay unread
        var alreadyReadAt = DateTime.UtcNow.AddMinutes(-5);
        await _fixture.SeedMessageAsync(conversationId, otherId, readAt: alreadyReadAt); // already read, must stay unchanged

        var result = await Repo().GetConversationMessagesAsync(_fixture.Ctx(userId), userId, conversationId, page: 1, limit: 50);

        Assert.Equal(ConversationMessagesStatus.Ok, result.Status);
        var mine = result.Page!.Data.Single(m => m.SenderId == userId);
        var theirs = result.Page.Data.Single(m => m.SenderId == otherId);

        Assert.Null(await GetReadAtAsync(conversationId, mine.Id));
        var theirsReadAt = await GetReadAtAsync(conversationId, theirs.Id);
        Assert.NotNull(theirsReadAt);
        Assert.Equal(alreadyReadAt, theirsReadAt!.Value, TimeSpan.FromSeconds(1));
    }

    [Fact]
    public async Task Non_participant_gets_not_found_not_forbidden()
    {
        var (_, _, conversationId) = await _fixture.SeedConversationAsync();
        var stranger = Guid.NewGuid().ToString();

        var result = await Repo().GetConversationMessagesAsync(_fixture.Ctx(stranger), stranger, conversationId, page: 1, limit: 50);

        Assert.Equal(ConversationMessagesStatus.NotFound, result.Status);
    }

    [Fact]
    public async Task Missing_conversation_also_returns_not_found()
    {
        var userId = Guid.NewGuid().ToString();
        var result = await Repo().GetConversationMessagesAsync(_fixture.Ctx(userId), userId, Guid.NewGuid().ToString(), page: 1, limit: 50);
        Assert.Equal(ConversationMessagesStatus.NotFound, result.Status);
    }

    private async Task<DateTime?> GetReadAtAsync(string conversationId, string messageId)
    {
        await using var conn = new NpgsqlConnection(_fixture.ConnectionString);
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand(
            """SELECT "readAt" FROM "messages" WHERE "conversationId" = @cid AND "id" = @id""", conn);
        cmd.Parameters.AddWithValue("cid", conversationId);
        cmd.Parameters.AddWithValue("id", messageId);
        var result = await cmd.ExecuteScalarAsync();
        return result is DBNull or null ? null : (DateTime?)result;
    }
}
