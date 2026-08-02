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
        new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()), TimeProvider.System,
        new NoopRealtimeNotifier());

    /// <summary>
    /// formmaps#40. Pins parity with legacy, which looks the recipient up with a bare
    /// `prisma.user.findUnique({ where: { id } })` and does NOT filter on isActive
    /// (routes/messages.ts:206-207).
    ///
    /// The port had added `AND "isActive" = true`, so this case returned 400 "Recipient not
    /// found" on .NET while succeeding on Node -- an undocumented divergence that would have
    /// surfaced the moment FORMMAPS_ROUTE_MESSAGES_TO_DOTNET flipped. Tightening this may well be
    /// correct, but it belongs in a separate change applied to BOTH backends; a flag flip must be
    /// behaviour-neutral.
    ///
    /// If someone later decides deliberately to reject inactive recipients, this test SHOULD fail
    /// and should be updated alongside legacy -- that is the point of pinning it.
    /// </summary>
    [Fact]
    public async Task Conversation_with_a_deactivated_recipient_succeeds_matching_legacy()
    {
        var schoolId = Guid.NewGuid().ToString();
        var student = await _fixture.SeedUserAsync(schoolId, "student");
        var counselor = await _fixture.SeedUserAsync(schoolId, "counselor", isActive: false);
        await _fixture.SeedAssignmentAsync(counselor, student);

        var result = await Repo().CreateConversationAsync(_fixture.Ctx(student, schoolId), student, "student", schoolId, counselor);

        Assert.Equal(CreateConversationStatus.Created, result.Status);
        Assert.Equal(counselor, result.Data!.OtherParticipantId);
    }

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
    public async Task Blocked_pair_cannot_create_a_conversation_when_target_blocked_the_caller()
    {
        // Reverse direction of the previous test: here the TARGET (b) is the blocker and the CALLER
        // (a) is blocked. The block check must be symmetric (minor-safety/harassment-prevention), so
        // a blocked caller can't route around a block simply by being the one who initiates.
        var schoolId = Guid.NewGuid().ToString();
        var a = await _fixture.SeedUserAsync(schoolId, "counselor");
        var b = await _fixture.SeedUserAsync(schoolId, "school_admin");
        await _fixture.SeedBlockAsync(b, a);

        var result = await Repo().CreateConversationAsync(_fixture.Ctx(a, schoolId), a, "counselor", schoolId, b);

        Assert.Equal(CreateConversationStatus.Blocked, result.Status);
    }

    [Fact]
    public async Task RecipientNotFound_paths_are_indistinguishable_from_each_other()
    {
        // The whole point of hiding cross-school targets behind "Recipient not found" is that a
        // caller can't tell "doesn't exist" apart from "exists, but in another school". Assert all
        // three triggering scenarios produce the exact same status AND the exact same error message.
        var schoolA = Guid.NewGuid().ToString();
        var schoolB = Guid.NewGuid().ToString();

        // Scenario 1: privileged caller (school_admin) targets a genuinely nonexistent user.
        var admin = await _fixture.SeedUserAsync(schoolA, "school_admin");
        var nonexistentTargetResult = await Repo().CreateConversationAsync(
            _fixture.Ctx(admin, schoolA), admin, "school_admin", schoolA, Guid.NewGuid().ToString());

        // Scenario 2: privileged caller (school_admin) targets a real user in a different school.
        var otherSchoolAdmin = await _fixture.SeedUserAsync(schoolB, "school_admin");
        var crossSchoolPrivilegedResult = await Repo().CreateConversationAsync(
            _fixture.Ctx(admin, schoolA), admin, "school_admin", schoolA, otherSchoolAdmin);

        // Scenario 3: student caller targets a real school_admin in a different school.
        var student = await _fixture.SeedUserAsync(schoolA, "student");
        var crossSchoolStudentResult = await Repo().CreateConversationAsync(
            _fixture.Ctx(student, schoolA), student, "student", schoolA, otherSchoolAdmin);

        Assert.Equal(CreateConversationStatus.RecipientNotFound, nonexistentTargetResult.Status);
        Assert.Equal(CreateConversationStatus.RecipientNotFound, crossSchoolPrivilegedResult.Status);
        Assert.Equal(CreateConversationStatus.RecipientNotFound, crossSchoolStudentResult.Status);

        Assert.Equal(nonexistentTargetResult.Error, crossSchoolPrivilegedResult.Error);
        Assert.Equal(nonexistentTargetResult.Error, crossSchoolStudentResult.Error);
        Assert.Equal("Recipient not found", nonexistentTargetResult.Error);

        Assert.Null(nonexistentTargetResult.Data);
        Assert.Null(crossSchoolPrivilegedResult.Data);
        Assert.Null(crossSchoolStudentResult.Data);
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
