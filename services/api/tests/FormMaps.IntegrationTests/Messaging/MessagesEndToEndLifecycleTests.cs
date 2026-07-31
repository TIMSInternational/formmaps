using FormMaps.Application.Auth;
using FormMaps.Application.Messaging;
using FormMaps.Infrastructure.Data;
using FormMaps.Infrastructure.Messaging;
using Npgsql;

namespace FormMaps.IntegrationTests.Messaging;

/// <summary>
/// COMPOSITION tests (issue #16): the real <see cref="MessagesRepository"/> driven through multi-endpoint
/// sequences against a real Postgres, rather than one method per test in isolation.
///
/// Every other Messaging test file drives exactly one repository method per test. That per-method
/// coverage — however thorough — structurally cannot catch defects that only appear when one endpoint's
/// write feeds another endpoint's read, e.g.:
///   * <see cref="MessagesRepository.SendMessageAsync"/> updating the conversation preview/unread count
///     that <see cref="MessagesRepository.ListConversationsAsync"/> later reports to the RECIPIENT;
///   * <see cref="MessagesRepository.GetConversationMessagesAsync"/>'s mark-as-read side effect actually
///     decrementing what <see cref="MessagesRepository.GetUnreadCountAsync"/> reports next;
///   * <see cref="MessagesRepository.BroadcastAsync"/>'s created/upserted conversation subsequently being
///     readable AND replyable by the recipient through the ordinary conversation endpoints.
///
/// This file also stands as the structural regression pin the final Domain 7b review called for: a
/// broadcast's notification_outbox row must point at the message row BroadcastAsync itself inserted, not
/// at a second, unrelated Guid.NewGuid() (the bug fixed in dc8c5f3c, "bind the real message id into
/// broadcast outbox payloads"). MessagesBroadcastTests already pins that in isolation; here it is pinned
/// as one link in the full create -> send -> mark-read -> broadcast chain a real user session drives.
/// </summary>
public sealed class MessagesEndToEndLifecycleTests : IClassFixture<MessagingDatabaseFixture>, IAsyncLifetime
{
    private readonly MessagingDatabaseFixture _fixture;
    private NpgsqlDataSource _dataSource = null!;

    public MessagesEndToEndLifecycleTests(MessagingDatabaseFixture fixture) => _fixture = fixture;
    public Task InitializeAsync() { _dataSource = NpgsqlDataSource.Create(_fixture.ConnectionString); return Task.CompletedTask; }
    public async Task DisposeAsync() => await _dataSource.DisposeAsync();

    private MessagesRepository Repo() => new(
        new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()), TimeProvider.System,
        new NoopRealtimeNotifier());

    // ==================================================================================================
    // Full realistic lifecycle: create conversation -> send -> list -> mark-read via read -> reply ->
    // broadcast -> recipient reads and replies to the broadcast conversation.
    // ==================================================================================================

    /// <summary>
    /// Drives the REAL repository end to end for a student messaging their assigned counselor, then a
    /// school_admin broadcasting to the school's students -- no hand-seeded conversation/message rows, no
    /// fakes. Every id used downstream (conversationId, messageId) comes from what an earlier repository
    /// call itself returned, so the whole chain is exercised exactly as production would drive it across
    /// the seven HTTP endpoints these methods back.
    /// </summary>
    [Fact]
    public async Task Full_lifecycle_create_send_markRead_reply_and_broadcast_is_coherent_end_to_end()
    {
        var repo = Repo();
        var schoolId = Guid.NewGuid().ToString();
        var student = await _fixture.SeedUserAsync(schoolId, "student");
        var counselor = await _fixture.SeedUserAsync(schoolId, "counselor");
        var admin = await _fixture.SeedUserAsync(schoolId, "school_admin");
        await _fixture.SeedAssignmentAsync(counselor, student);

        // ---- 1. CREATE: student starts a conversation with their assigned counselor. -----------------
        var created = await repo.CreateConversationAsync(
            _fixture.Ctx(student, schoolId), student, "student", schoolId, counselor);
        Assert.Equal(CreateConversationStatus.Created, created.Status);
        var conversationId = created.Data!.Id;

        // A second CreateConversationAsync call for the same pair must be idempotent (Existing, same id) --
        // the reply step below re-derives conversationId independently via ListConversationsAsync, but this
        // pins that CreateConversationAsync itself would not have fragmented the pair into two rows either.
        var recreated = await repo.CreateConversationAsync(
            _fixture.Ctx(student, schoolId), student, "student", schoolId, counselor);
        Assert.Equal(CreateConversationStatus.Existing, recreated.Status);
        Assert.Equal(conversationId, recreated.Data!.Id);

        // Nothing sent yet -- counselor's unread count is still zero.
        Assert.Equal(0, await repo.GetUnreadCountAsync(_fixture.Ctx(counselor, schoolId), counselor));

        // ---- 2. SEND: student sends the first message. ------------------------------------------------
        var sent = await repo.SendMessageAsync(_fixture.Ctx(student, schoolId), student, conversationId, "Hi, I have a question");
        Assert.Equal(SendMessageStatus.Sent, sent.Status);
        var firstMessageId = sent.Message!.Id;

        // The recipient's unread count reflects it immediately.
        Assert.Equal(1, await repo.GetUnreadCountAsync(_fixture.Ctx(counselor, schoolId), counselor));
        // The sender's own count is unaffected by their own message.
        Assert.Equal(0, await repo.GetUnreadCountAsync(_fixture.Ctx(student, schoolId), student));

        // The recipient's conversation list shows the real preview and unread count -- exactly what
        // SendMessageAsync wrote, read back through the SEPARATE ListConversationsAsync query path.
        var counselorList = await repo.ListConversationsAsync(_fixture.Ctx(counselor, schoolId), counselor);
        var counselorRow = Assert.Single(counselorList, c => c.Id == conversationId);
        Assert.Equal(student, counselorRow.OtherParticipantId);
        Assert.Equal("Hi, I have a question", counselorRow.LastMessagePreview);
        Assert.Equal(1, counselorRow.UnreadCount);

        // The DM's notification_outbox row must resolve to THIS message, not a fabricated id -- the same
        // class of bug BroadcastAsync had, checked here on the ordinary send path too.
        await AssertOutboxResolvesToRealMessageAsync(firstMessageId, "Hi, I have a question");

        // ---- 3. MARK-READ (via the read endpoint): counselor opens the conversation. -------------------
        var page = await repo.GetConversationMessagesAsync(_fixture.Ctx(counselor, schoolId), counselor, conversationId, page: 1, limit: 50);
        Assert.Equal(ConversationMessagesStatus.Ok, page.Status);
        Assert.Single(page.Page!.Data, m => m.Id == firstMessageId);

        // GetConversationMessagesAsync's mark-as-read side effect must be visible to a SEPARATE
        // GetUnreadCountAsync call afterwards -- this is the seam no per-method test structurally covers.
        Assert.Equal(0, await repo.GetUnreadCountAsync(_fixture.Ctx(counselor, schoolId), counselor));
        // And it is reflected back through ListConversationsAsync too, not just the raw count.
        var counselorListAfterRead = await repo.ListConversationsAsync(_fixture.Ctx(counselor, schoolId), counselor);
        Assert.Equal(0, Assert.Single(counselorListAfterRead, c => c.Id == conversationId).UnreadCount);

        // ---- 4. REPLY: counselor answers back. ---------------------------------------------------------
        var reply = await repo.SendMessageAsync(_fixture.Ctx(counselor, schoolId), counselor, conversationId, "Sure, go ahead");
        Assert.Equal(SendMessageStatus.Sent, reply.Status);

        // Unread now flips to the ORIGINAL sender (student), and the preview reflects the latest message --
        // proving direction is tracked correctly across the round trip, not just "someone has 1 unread".
        Assert.Equal(1, await repo.GetUnreadCountAsync(_fixture.Ctx(student, schoolId), student));
        Assert.Equal(0, await repo.GetUnreadCountAsync(_fixture.Ctx(counselor, schoolId), counselor));
        var studentList = await repo.ListConversationsAsync(_fixture.Ctx(student, schoolId), student);
        var studentRow = Assert.Single(studentList, c => c.Id == conversationId);
        Assert.Equal("Sure, go ahead", studentRow.LastMessagePreview);
        Assert.Equal(1, studentRow.UnreadCount);

        // Student reads the reply -- their own unread count drops back to zero.
        var studentPage = await repo.GetConversationMessagesAsync(_fixture.Ctx(student, schoolId), student, conversationId, page: 1, limit: 50);
        Assert.Equal(ConversationMessagesStatus.Ok, studentPage.Status);
        Assert.Equal(2, studentPage.Page!.Total); // both messages now in the thread
        Assert.Equal(0, await repo.GetUnreadCountAsync(_fixture.Ctx(student, schoolId), student));

        // ---- 5. BROADCAST: school_admin fans out to every student in the school. -----------------------
        var broadcastContent = $"school-wide notice {Guid.NewGuid()}";
        var broadcastCount = await repo.BroadcastAsync(
            _fixture.Ctx(admin, schoolId), admin, "school_admin", schoolId, "students", broadcastContent);
        Assert.Equal(1, broadcastCount); // only `student` is a student in this school

        // The broadcast's outbox row must point at the REAL message row it inserted -- the exact bug
        // (a second, unrelated Guid.NewGuid() written as the outbox messageId) this whole file exists to
        // guard against, now pinned as part of a chain a real admin session would actually drive.
        await AssertOutboxResolvesToRealMessageAsync(expectedMessageId: null, broadcastContent, expectedSenderId: admin);

        // ---- 6. The broadcast conversation is READABLE by the recipient through the ordinary path. -----
        var studentListAfterBroadcast = await repo.ListConversationsAsync(_fixture.Ctx(student, schoolId), student);
        var broadcastRow = Assert.Single(studentListAfterBroadcast, c => c.OtherParticipantId == admin);
        Assert.Equal(broadcastContent, broadcastRow.LastMessagePreview);
        Assert.Equal(1, broadcastRow.UnreadCount);
        var broadcastConversationId = broadcastRow.Id;

        var broadcastPage = await repo.GetConversationMessagesAsync(
            _fixture.Ctx(student, schoolId), student, broadcastConversationId, page: 1, limit: 50);
        Assert.Equal(ConversationMessagesStatus.Ok, broadcastPage.Status);
        Assert.Single(broadcastPage.Page!.Data, m => m.Content == broadcastContent && m.SenderId == admin);
        // Reading it marked it read, same as any other conversation.
        Assert.Equal(0, await repo.GetUnreadCountAsync(_fixture.Ctx(student, schoolId), student));

        // ---- 7. ...and REPLYABLE: the broadcast conversation is a normal conversation, not a dead end. -
        var broadcastReply = await repo.SendMessageAsync(
            _fixture.Ctx(student, schoolId), student, broadcastConversationId, "Thanks, got it");
        Assert.Equal(SendMessageStatus.Sent, broadcastReply.Status);
        Assert.Equal(admin, broadcastReply.RecipientId);

        Assert.Equal(1, await repo.GetUnreadCountAsync(_fixture.Ctx(admin, schoolId), admin));
        var adminList = await repo.ListConversationsAsync(_fixture.Ctx(admin, schoolId), admin);
        var adminRow = Assert.Single(adminList, c => c.Id == broadcastConversationId);
        Assert.Equal("Thanks, got it", adminRow.LastMessagePreview);
        Assert.Equal(1, adminRow.UnreadCount);

        // ---- 8. Sanity: the DM thread from steps 1-4 is completely unaffected by the broadcast fan-out. -
        var counselorFinal = await repo.ListConversationsAsync(_fixture.Ctx(counselor, schoolId), counselor);
        var counselorFinalRow = Assert.Single(counselorFinal, c => c.Id == conversationId);
        Assert.Equal("Sure, go ahead", counselorFinalRow.LastMessagePreview);
    }

    /// <summary>
    /// Every notification_outbox row whose payload preview/sender matches must resolve (via the
    /// payload's messageId) to a REAL "messages" row carrying that same content and sender -- and none may
    /// dangle. This is the join that a fabricated Guid.NewGuid() outbox messageId would fail: the consumer
    /// (notificationOutboxService.handleUnreadMessage) does findUnique({ id: payload.messageId }) and
    /// silently no-ops on a miss, so a dangling id costs the recipient their email with no error anywhere.
    /// </summary>
    private async Task AssertOutboxResolvesToRealMessageAsync(string? expectedMessageId, string preview, string? expectedSenderId = null)
    {
        await using var conn = new NpgsqlConnection(_fixture.ConnectionString);
        await conn.OpenAsync();

        await using var joined = new NpgsqlCommand(
            """
            SELECT o."payload"->>'messageId', m."id", m."content", m."senderId"
            FROM "notification_outbox" o
            JOIN "messages" m ON m."id" = o."payload"->>'messageId'
            WHERE o."payload"->>'preview' = @preview
            """, conn);
        joined.Parameters.AddWithValue("preview", preview);
        await using (var reader = await joined.ExecuteReaderAsync())
        {
            Assert.True(await reader.ReadAsync(), $"No notification_outbox row for preview '{preview}' resolves to a real message row.");
            var payloadMessageId = reader.GetString(0);
            Assert.Equal(payloadMessageId, reader.GetString(1)); // the join succeeded, i.e. it's a real row
            Assert.Equal(preview, reader.GetString(2));
            if (expectedMessageId is not null) Assert.Equal(expectedMessageId, payloadMessageId);
            if (expectedSenderId is not null) Assert.Equal(expectedSenderId, reader.GetString(3));
        }

        await using var dangling = new NpgsqlCommand(
            """
            SELECT count(*)::int FROM "notification_outbox" o
            LEFT JOIN "messages" m ON m."id" = o."payload"->>'messageId'
            WHERE o."payload"->>'preview' = @preview AND m."id" IS NULL
            """, conn);
        dangling.Parameters.AddWithValue("preview", preview);
        Assert.Equal(0, (int)(await dangling.ExecuteScalarAsync())!);
    }
}
