using FormMaps.Application.Messaging;
using FormMaps.Infrastructure.Data;
using FormMaps.Infrastructure.Messaging;
using Npgsql;

namespace FormMaps.IntegrationTests.Messaging;

/// <summary>
/// audit 2026-10-09 C14 (formmaps#132), under the REAL production policies (MessagingDatabaseFixture runs the
/// repository as a NOBYPASSRLS login). A coach has no schoolId, so a coach and a school student are mutually
/// invisible in "users". The rule: a coach can see and message exactly the students with a non-cancelled booking
/// with them, and those students can message that coach — never anyone else.
/// </summary>
public sealed class MessagesCoachBookingTests : IClassFixture<MessagingDatabaseFixture>, IAsyncLifetime
{
    private readonly MessagingDatabaseFixture _fixture;
    private NpgsqlDataSource _dataSource = null!;

    public MessagesCoachBookingTests(MessagingDatabaseFixture fixture) => _fixture = fixture;
    public Task InitializeAsync() { _dataSource = NpgsqlDataSource.Create(_fixture.AppConnectionString); return Task.CompletedTask; }
    public async Task DisposeAsync() => await _dataSource.DisposeAsync();

    private MessagesRepository Repo() => new(
        new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()), TimeProvider.System,
        new NoopRealtimeNotifier());

    private async Task<(string Coach, string School, string Booked, string Unbooked, string Cancelled)> SeedWorldAsync()
    {
        var school = Guid.NewGuid().ToString();
        var coach = await _fixture.SeedUserAsync(null, "coach");
        var booked = await _fixture.SeedUserAsync(school, "student");
        var unbooked = await _fixture.SeedUserAsync(school, "student");
        var cancelled = await _fixture.SeedUserAsync(school, "student");
        await _fixture.SeedBookingAsync(coach, booked, "completed");
        await _fixture.SeedBookingAsync(coach, cancelled, "cancelled");
        // Another coach's booking never leaks into this coach's reach.
        var otherCoach = await _fixture.SeedUserAsync(null, "coach");
        await _fixture.SeedBookingAsync(otherCoach, unbooked, "confirmed");
        return (coach, school, booked, unbooked, cancelled);
    }

    [Fact]
    public async Task Coach_contacts_are_exactly_their_booked_students()
    {
        var (coach, _, booked, unbooked, cancelled) = await SeedWorldAsync();

        var contacts = await Repo().GetContactsAsync(_fixture.Ctx(coach, null), coach, "coach", null, null);

        var ids = contacts.Select(c => c.Id).ToHashSet();
        Assert.Equal([booked], ids);
        Assert.DoesNotContain(unbooked, ids);
        Assert.DoesNotContain(cancelled, ids);
        Assert.Equal(booked, contacts.Single().Name); // fixture names users by id — the row was really read
    }

    [Fact]
    public async Task Soft_deleted_booking_grants_nothing()
    {
        var coach = await _fixture.SeedUserAsync(null, "coach");
        var student = await _fixture.SeedUserAsync(Guid.NewGuid().ToString(), "student");
        await _fixture.SeedBookingAsync(coach, student, "confirmed", isActive: false);

        Assert.Empty(await Repo().GetContactsAsync(_fixture.Ctx(coach, null), coach, "coach", null, null));
        var result = await Repo().CreateConversationAsync(_fixture.Ctx(coach, null), coach, "coach", null, student);
        Assert.Equal(CreateConversationStatus.RecipientNotFound, result.Status);
    }

    [Fact]
    public async Task Student_contacts_include_the_coach_they_booked_even_without_a_school()
    {
        var (coach, school, booked, unbooked, _) = await SeedWorldAsync();
        var independent = await _fixture.SeedUserAsync(null, "student");
        await _fixture.SeedBookingAsync(coach, independent, "pending");

        var schoolStudent = await Repo().GetContactsAsync(_fixture.Ctx(booked, school), booked, "student", school, null);
        Assert.Contains(schoolStudent, c => c.Id == coach);

        var noSchool = await Repo().GetContactsAsync(_fixture.Ctx(independent, null), independent, "student", null, null);
        Assert.Equal([coach], noSchool.Select(c => c.Id));

        var notBooked = await Repo().GetContactsAsync(_fixture.Ctx(unbooked, school), unbooked, "student", school, null);
        Assert.DoesNotContain(notBooked, c => c.Id == coach);

        var cancelledOnly = await _fixture.SeedUserAsync(null, "student");
        await _fixture.SeedBookingAsync(coach, cancelledOnly, "cancelled");
        Assert.Empty(await Repo().GetContactsAsync(_fixture.Ctx(cancelledOnly, null), cancelledOnly, "student", null, null));
    }

    [Fact]
    public async Task Coach_can_open_a_conversation_with_a_booked_student_only()
    {
        var (coach, _, booked, unbooked, cancelled) = await SeedWorldAsync();
        var repo = Repo();

        var ok = await repo.CreateConversationAsync(_fixture.Ctx(coach, null), coach, "coach", null, booked);
        Assert.Equal(CreateConversationStatus.Created, ok.Status);
        Assert.Equal(booked, ok.Data!.OtherParticipantId);
        Assert.Equal($"{booked}@test.dev", ok.Data.OtherParticipantEmail);

        var again = await repo.CreateConversationAsync(_fixture.Ctx(coach, null), coach, "coach", null, booked);
        Assert.Equal(CreateConversationStatus.Existing, again.Status);
        Assert.Equal(ok.Data.Id, again.Data!.Id);

        foreach (var target in new[] { unbooked, cancelled })
        {
            var denied = await repo.CreateConversationAsync(_fixture.Ctx(coach, null), coach, "coach", null, target);
            Assert.Equal(CreateConversationStatus.RecipientNotFound, denied.Status);
        }
    }

    [Fact]
    public async Task Coach_cannot_message_a_non_student_even_with_a_booking_row()
    {
        var school = Guid.NewGuid().ToString();
        var coach = await _fixture.SeedUserAsync(null, "coach");
        var counselor = await _fixture.SeedUserAsync(school, "counselor");
        await _fixture.SeedBookingAsync(coach, counselor, "confirmed");

        var result = await Repo().CreateConversationAsync(_fixture.Ctx(coach, null), coach, "coach", null, counselor);
        Assert.Equal(CreateConversationStatus.RecipientNotFound, result.Status);
    }

    [Fact]
    public async Task Booked_student_can_message_their_coach_and_an_unbooked_student_cannot()
    {
        var (coach, school, booked, unbooked, _) = await SeedWorldAsync();

        var ok = await Repo().CreateConversationAsync(_fixture.Ctx(booked, school), booked, "student", school, coach);
        Assert.Equal(CreateConversationStatus.Created, ok.Status);
        Assert.Equal($"{coach}@test.dev", ok.Data!.OtherParticipantEmail);

        var denied = await Repo().CreateConversationAsync(_fixture.Ctx(unbooked, school), unbooked, "student", school, coach);
        Assert.NotEqual(CreateConversationStatus.Created, denied.Status);
        Assert.NotEqual(CreateConversationStatus.Existing, denied.Status);
    }

    [Fact]
    public async Task Coach_student_thread_is_listed_readable_and_sendable_for_both_sides()
    {
        var (coach, school, booked, _, _) = await SeedWorldAsync();
        var repo = Repo();
        var created = await repo.CreateConversationAsync(_fixture.Ctx(coach, null), coach, "coach", null, booked);
        var conversationId = created.Data!.Id;

        var sent = await repo.SendMessageAsync(_fixture.Ctx(coach, null), coach, conversationId, "hello from coach");
        Assert.Equal(SendMessageStatus.Sent, sent.Status);
        Assert.Equal($"{booked}@test.dev", sent.RecipientEmail);
        var reply = await repo.SendMessageAsync(_fixture.Ctx(booked, school), booked, conversationId, "hi coach");
        Assert.Equal(SendMessageStatus.Sent, reply.Status);

        var coachList = await repo.ListConversationsAsync(_fixture.Ctx(coach, null), coach);
        var row = Assert.Single(coachList, c => c.Id == conversationId);
        Assert.Equal(booked, row.OtherParticipantName);
        Assert.Equal($"{booked}@test.dev", row.OtherParticipantEmail);

        var studentList = await repo.ListConversationsAsync(_fixture.Ctx(booked, school), booked);
        Assert.Contains(studentList, c => c.Id == conversationId && c.OtherParticipantName == coach);

        var page = await repo.GetConversationMessagesAsync(_fixture.Ctx(coach, null), coach, conversationId, 1, 50);
        Assert.Equal(ConversationMessagesStatus.Ok, page.Status);
        Assert.Contains(page.Page!.Data, m => m.SenderId == booked && m.SenderName == booked);
    }
}
