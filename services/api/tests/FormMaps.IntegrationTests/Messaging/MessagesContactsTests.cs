using FormMaps.Application.Auth;
using FormMaps.Infrastructure.Data;
using FormMaps.Infrastructure.Messaging;
using Npgsql;

namespace FormMaps.IntegrationTests.Messaging;

public sealed class MessagesContactsTests : IClassFixture<MessagingDatabaseFixture>, IAsyncLifetime
{
    private readonly MessagingDatabaseFixture _fixture;
    private NpgsqlDataSource _dataSource = null!;

    public MessagesContactsTests(MessagingDatabaseFixture fixture) => _fixture = fixture;
    public Task InitializeAsync() { _dataSource = NpgsqlDataSource.Create(_fixture.ConnectionString); return Task.CompletedTask; }
    public async Task DisposeAsync() => await _dataSource.DisposeAsync();

    private MessagesRepository Repo() => new(
        new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()), TimeProvider.System);

    [Fact]
    public async Task Student_only_sees_school_admins_and_their_assigned_counselors()
    {
        var schoolId = Guid.NewGuid().ToString();
        var (student, assignedCounselor, _) = await _fixture.SeedConversationAsync(schoolId, schoolId, "student", "counselor");
        var unassignedCounselor = await _fixture.SeedUserAsync(schoolId, "counselor");
        var admin = await _fixture.SeedUserAsync(schoolId, "school_admin");
        await _fixture.SeedAssignmentAsync(assignedCounselor, student);

        var contacts = await Repo().GetContactsAsync(_fixture.Ctx(student, schoolId), student, "student", schoolId, null);

        var ids = contacts.Select(c => c.Id).ToHashSet();
        Assert.Contains(assignedCounselor, ids);
        Assert.Contains(admin, ids);
        Assert.DoesNotContain(unassignedCounselor, ids);
    }

    [Fact]
    public async Task Counselor_sees_all_school_users()
    {
        var schoolId = Guid.NewGuid().ToString();
        var counselor = await _fixture.SeedUserAsync(schoolId, "counselor");
        var student = await _fixture.SeedUserAsync(schoolId, "student");

        var contacts = await Repo().GetContactsAsync(_fixture.Ctx(counselor, schoolId), counselor, "counselor", schoolId, null);

        Assert.Contains(contacts, c => c.Id == student);
    }

    [Fact]
    public async Task No_school_returns_empty_list()
    {
        var userId = Guid.NewGuid().ToString();
        var contacts = await Repo().GetContactsAsync(_fixture.Ctx(userId, null), userId, "student", null, null);
        Assert.Empty(contacts);
    }
}
