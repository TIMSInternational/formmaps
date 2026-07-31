using FormMaps.Application.Auth;
using FormMaps.Infrastructure.Data;
using FormMaps.Infrastructure.Messaging;
using Npgsql;

namespace FormMaps.IntegrationTests.Messaging;

public sealed class MessagesUnreadCountTests : IClassFixture<MessagingDatabaseFixture>, IAsyncLifetime
{
    private readonly MessagingDatabaseFixture _fixture;
    private NpgsqlDataSource _dataSource = null!;

    public MessagesUnreadCountTests(MessagingDatabaseFixture fixture) => _fixture = fixture;

    public Task InitializeAsync()
    {
        _dataSource = NpgsqlDataSource.Create(_fixture.ConnectionString);
        return Task.CompletedTask;
    }

    public async Task DisposeAsync() => await _dataSource.DisposeAsync();

    [Fact]
    public async Task Counts_only_unread_messages_from_others_across_all_my_conversations()
    {
        var (userId, otherId, conversationId) = await _fixture.SeedConversationAsync();
        await _fixture.SeedMessageAsync(conversationId, senderId: otherId, readAt: null);
        await _fixture.SeedMessageAsync(conversationId, senderId: otherId, readAt: null);
        await _fixture.SeedMessageAsync(conversationId, senderId: userId, readAt: null); // mine, not counted
        await _fixture.SeedMessageAsync(conversationId, senderId: otherId, readAt: DateTime.UtcNow); // read, not counted

        var repository = new MessagesRepository(
            new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()),
            TimeProvider.System, new NoopRealtimeNotifier());

        var count = await repository.GetUnreadCountAsync(_fixture.Ctx(userId), userId);

        Assert.Equal(2, count);
    }
}
