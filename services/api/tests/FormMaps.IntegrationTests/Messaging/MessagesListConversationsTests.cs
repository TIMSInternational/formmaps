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

        var results = await Repo().ListConversationsAsync(_fixture.Ctx(userId), userId);

        var conv = Assert.Single(results);
        Assert.Equal(otherId, conv.OtherParticipantId);
        Assert.Equal(2, conv.UnreadCount);
    }
}
