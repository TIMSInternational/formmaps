using FormMaps.Application.Auth;
using FormMaps.Application.Messaging;
using FormMaps.Infrastructure.Data;
using FormMaps.Infrastructure.Messaging;
using Npgsql;

namespace FormMaps.IntegrationTests.Messaging;

public sealed class MessagesCreateConversationTests : IClassFixture<MessagingDatabaseFixture>, IAsyncLifetime
{
    private readonly MessagingDatabaseFixture _fixture;
    private NpgsqlDataSource _dataSource = null!;
    public MessagesCreateConversationTests(MessagingDatabaseFixture fixture) => _fixture = fixture;
    public Task InitializeAsync() { _dataSource = NpgsqlDataSource.Create(_fixture.ConnectionString); return Task.CompletedTask; }
    public async Task DisposeAsync() => await _dataSource.DisposeAsync();
    private MessagesRepository Repo() => new(
        new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()), TimeProvider.System);

    [Fact]
    public async Task Student_can_message_their_assigned_counselor()
    {
        var schoolId = Guid.NewGuid().ToString();
        var student = await _fixture.SeedUserAsync(schoolId, "student");
        var counselor = await _fixture.SeedUserAsync(schoolId, "counselor");
        await _fixture.SeedAssignmentAsync(counselor, student);

        var result = await Repo().CreateConversationAsync(_fixture.Ctx(student, schoolId), student, "student", schoolId, counselor);

        Assert.Equal(CreateConversationStatus.Created, result.Status);
        Assert.Equal(counselor, result.Data!.OtherParticipantId);
    }

    [Fact]
    public async Task Student_cannot_message_an_unassigned_counselor()
    {
        var schoolId = Guid.NewGuid().ToString();
        var student = await _fixture.SeedUserAsync(schoolId, "student");
        var counselor = await _fixture.SeedUserAsync(schoolId, "counselor");

        var result = await Repo().CreateConversationAsync(_fixture.Ctx(student, schoolId), student, "student", schoolId, counselor);

        Assert.Equal(CreateConversationStatus.Forbidden, result.Status);
    }

    [Fact]
    public async Task Cross_school_privileged_target_is_hidden_as_recipient_not_found()
    {
        var schoolA = Guid.NewGuid().ToString();
        var schoolB = Guid.NewGuid().ToString();
        var admin = await _fixture.SeedUserAsync(schoolA, "school_admin");
        var otherSchoolAdmin = await _fixture.SeedUserAsync(schoolB, "school_admin");

        var result = await Repo().CreateConversationAsync(_fixture.Ctx(admin, schoolA), admin, "school_admin", schoolA, otherSchoolAdmin);

        Assert.Equal(CreateConversationStatus.RecipientNotFound, result.Status);
    }

    [Fact]
    public async Task Blocked_pair_cannot_create_a_conversation()
    {
        var schoolId = Guid.NewGuid().ToString();
        var a = await _fixture.SeedUserAsync(schoolId, "counselor");
        var b = await _fixture.SeedUserAsync(schoolId, "school_admin");
        await _fixture.SeedBlockAsync(a, b);

        var result = await Repo().CreateConversationAsync(_fixture.Ctx(a, schoolId), a, "counselor", schoolId, b);

        Assert.Equal(CreateConversationStatus.Blocked, result.Status);
    }

    [Fact]
    public async Task Second_call_returns_the_existing_conversation_not_a_duplicate()
    {
        var schoolId = Guid.NewGuid().ToString();
        var admin = await _fixture.SeedUserAsync(schoolId, "school_admin");
        var counselor = await _fixture.SeedUserAsync(schoolId, "counselor");

        var first = await Repo().CreateConversationAsync(_fixture.Ctx(counselor, schoolId), counselor, "counselor", schoolId, admin);
        var second = await Repo().CreateConversationAsync(_fixture.Ctx(counselor, schoolId), counselor, "counselor", schoolId, admin);

        Assert.Equal(CreateConversationStatus.Created, first.Status);
        Assert.Equal(CreateConversationStatus.Existing, second.Status);
        Assert.Equal(first.Data!.Id, second.Data!.Id);
    }
}
