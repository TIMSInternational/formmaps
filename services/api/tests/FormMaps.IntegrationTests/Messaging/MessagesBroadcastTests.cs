using FormMaps.Application.Auth;
using FormMaps.Application.Data;
using FormMaps.Application.Messaging;
using FormMaps.Infrastructure.Data;
using FormMaps.Infrastructure.Messaging;
using Npgsql;

namespace FormMaps.IntegrationTests.Messaging;

public sealed class MessagesBroadcastTests : IClassFixture<MessagingDatabaseFixture>, IAsyncLifetime
{
    private readonly MessagingDatabaseFixture _fixture;
    private NpgsqlDataSource _dataSource = null!;

    public MessagesBroadcastTests(MessagingDatabaseFixture fixture) => _fixture = fixture;
    public Task InitializeAsync() { _dataSource = NpgsqlDataSource.Create(_fixture.ConnectionString); return Task.CompletedTask; }
    public async Task DisposeAsync() => await _dataSource.DisposeAsync();

    private MessagesRepository Repo(IFormMapsDatabaseSessionFactory? factory = null) => new(
        factory ?? new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()), TimeProvider.System,
        new NoopRealtimeNotifier());

    [Fact]
    public async Task Broadcasts_to_all_students_in_school()
    {
        var schoolId = Guid.NewGuid().ToString();
        var admin = await _fixture.SeedUserAsync(schoolId, "school_admin");
        var s1 = await _fixture.SeedUserAsync(schoolId, "student");
        var s2 = await _fixture.SeedUserAsync(schoolId, "student");
        var otherSchoolStudent = await _fixture.SeedUserAsync(Guid.NewGuid().ToString(), "student");

        var count = await Repo().BroadcastAsync(_fixture.Ctx(admin, schoolId), admin, "school_admin", schoolId, "students", "hello school");

        Assert.Equal(2, count.RecipientCount);
    }

    [Fact]
    public async Task Counselor_broadcast_to_students_only_reaches_assigned_students()
    {
        var schoolId = Guid.NewGuid().ToString();
        var counselor = await _fixture.SeedUserAsync(schoolId, "counselor");
        var assigned = await _fixture.SeedUserAsync(schoolId, "student");
        var unassigned = await _fixture.SeedUserAsync(schoolId, "student");
        await _fixture.SeedAssignmentAsync(counselor, assigned);

        var count = await Repo().BroadcastAsync(_fixture.Ctx(counselor, schoolId), counselor, "counselor", schoolId, "students", "hi");

        Assert.Equal(1, count.RecipientCount);
    }

    [Fact]
    public async Task Counselor_with_no_assignments_reaches_zero_students()
    {
        // Guards against restrictToIds ever being skipped/null for a counselor -- an empty
        // assignment list must yield zero recipients, not "unrestricted" fan-out to the whole school.
        var schoolId = Guid.NewGuid().ToString();
        var counselor = await _fixture.SeedUserAsync(schoolId, "counselor");
        await _fixture.SeedUserAsync(schoolId, "student");
        await _fixture.SeedUserAsync(schoolId, "student");

        var count = await Repo().BroadcastAsync(_fixture.Ctx(counselor, schoolId), counselor, "counselor", schoolId, "students", "hi");

        Assert.Equal(0, count.RecipientCount);
    }

    [Fact]
    public async Task Counselor_broadcast_to_staff_is_not_restricted_to_assignments()
    {
        // restrictToIds only applies to (counselor, "students"). Confirms the restriction is scoped
        // correctly and doesn't accidentally leak into (or out of) other recipient groups.
        var schoolId = Guid.NewGuid().ToString();
        var counselor = await _fixture.SeedUserAsync(schoolId, "counselor");
        var otherCounselor = await _fixture.SeedUserAsync(schoolId, "counselor");
        var admin = await _fixture.SeedUserAsync(schoolId, "school_admin");

        var count = await Repo().BroadcastAsync(_fixture.Ctx(counselor, schoolId), counselor, "counselor", schoolId, "staff", "hi");

        Assert.Equal(2, count.RecipientCount); // otherCounselor + admin; self excluded
    }

    [Fact]
    public async Task Blocked_recipients_are_excluded()
    {
        var schoolId = Guid.NewGuid().ToString();
        var admin = await _fixture.SeedUserAsync(schoolId, "school_admin");
        var blocked = await _fixture.SeedUserAsync(schoolId, "student");
        await _fixture.SeedBlockAsync(admin, blocked);

        var count = await Repo().BroadcastAsync(_fixture.Ctx(admin, schoolId), admin, "school_admin", schoolId, "students", "hi");

        Assert.Equal(0, count.RecipientCount);
    }

    [Fact]
    public async Task Creates_a_conversation_and_message_per_recipient_with_updatedAt_bound()
    {
        var schoolId = Guid.NewGuid().ToString();
        var admin = await _fixture.SeedUserAsync(schoolId, "school_admin");
        var student = await _fixture.SeedUserAsync(schoolId, "student");

        await Repo().BroadcastAsync(_fixture.Ctx(admin, schoolId), admin, "school_admin", schoolId, "students", "hello there");

        var (pa, pb) = string.CompareOrdinal(admin, student) < 0 ? (admin, student) : (student, admin);
        await using var conn = new NpgsqlConnection(_fixture.ConnectionString);
        await conn.OpenAsync();

        await using var convCmd = new NpgsqlCommand(
            """SELECT "id", "lastMessagePreview", "updatedAt" FROM "conversations" WHERE "participantAId" = @pa AND "participantBId" = @pb""",
            conn);
        convCmd.Parameters.AddWithValue("pa", pa);
        convCmd.Parameters.AddWithValue("pb", pb);
        await using var convReader = await convCmd.ExecuteReaderAsync();
        Assert.True(await convReader.ReadAsync());
        var conversationId = convReader.GetString(0);
        Assert.Equal("hello there", convReader.GetString(1));
        Assert.NotEqual(default, convReader.GetDateTime(2)); // NOT NULL, no DB default -- must be explicitly bound
        await convReader.DisposeAsync();

        await using var msgCmd = new NpgsqlCommand(
            """SELECT "content", "senderId", "updatedAt" FROM "messages" WHERE "conversationId" = @cid""", conn);
        msgCmd.Parameters.AddWithValue("cid", conversationId);
        await using var msgReader = await msgCmd.ExecuteReaderAsync();
        Assert.True(await msgReader.ReadAsync());
        Assert.Equal("hello there", msgReader.GetString(0));
        Assert.Equal(admin, msgReader.GetString(1));
        Assert.NotEqual(default, msgReader.GetDateTime(2)); // NOT NULL, no DB default -- must be explicitly bound
    }

    [Fact]
    public async Task Rebroadcast_upserts_existing_conversation_and_bumps_updatedAt()
    {
        var schoolId = Guid.NewGuid().ToString();
        var admin = await _fixture.SeedUserAsync(schoolId, "school_admin");
        var student = await _fixture.SeedUserAsync(schoolId, "student");

        await Repo().BroadcastAsync(_fixture.Ctx(admin, schoolId), admin, "school_admin", schoolId, "students", "first");

        var (pa, pb) = string.CompareOrdinal(admin, student) < 0 ? (admin, student) : (student, admin);
        await using var conn = new NpgsqlConnection(_fixture.ConnectionString);
        await conn.OpenAsync();
        DateTime firstUpdatedAt;
        string firstConversationId;
        await using (var cmd = new NpgsqlCommand(
            """SELECT "id", "updatedAt" FROM "conversations" WHERE "participantAId" = @pa AND "participantBId" = @pb""", conn))
        {
            cmd.Parameters.AddWithValue("pa", pa);
            cmd.Parameters.AddWithValue("pb", pb);
            await using var reader = await cmd.ExecuteReaderAsync();
            await reader.ReadAsync();
            firstConversationId = reader.GetString(0);
            firstUpdatedAt = reader.GetDateTime(1);
        }

        await Task.Delay(50);
        var count = await Repo().BroadcastAsync(_fixture.Ctx(admin, schoolId), admin, "school_admin", schoolId, "students", "second");

        Assert.Equal(1, count.RecipientCount);
        await using (var cmd = new NpgsqlCommand(
            """SELECT "id", "lastMessagePreview", "updatedAt" FROM "conversations" WHERE "participantAId" = @pa AND "participantBId" = @pb""", conn))
        {
            cmd.Parameters.AddWithValue("pa", pa);
            cmd.Parameters.AddWithValue("pb", pb);
            await using var reader = await cmd.ExecuteReaderAsync();
            await reader.ReadAsync();
            Assert.Equal(firstConversationId, reader.GetString(0)); // same conversation, not a duplicate
            Assert.Equal("second", reader.GetString(1));
            Assert.True(reader.GetDateTime(2) > firstUpdatedAt); // updatedAt bumped on ON CONFLICT DO UPDATE too
        }
    }

    [Fact]
    public async Task Queues_a_notification_outbox_row_per_recipient()
    {
        var schoolId = Guid.NewGuid().ToString();
        var admin = await _fixture.SeedUserAsync(schoolId, "school_admin");
        var s1 = await _fixture.SeedUserAsync(schoolId, "student");
        var s2 = await _fixture.SeedUserAsync(schoolId, "student");

        await Repo().BroadcastAsync(_fixture.Ctx(admin, schoolId), admin, "school_admin", schoolId, "students", "hi all");

        await using var conn = new NpgsqlConnection(_fixture.ConnectionString);
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand(
            """SELECT count(*)::int FROM "notification_outbox" WHERE "type" = 'unread_message' AND "payload"->>'preview' = 'hi all'""",
            conn);
        var result = await cmd.ExecuteScalarAsync();
        Assert.Equal(2, (int)result!);
    }

    [Fact]
    public async Task Outbox_payload_messageId_resolves_to_the_real_message_row_that_was_inserted()
    {
        // Regression test for the bug that made every broadcast notification email a silent no-op: the
        // outbox payload's messageId was a FRESH Guid.NewGuid(), unrelated to the id the "messages"
        // INSERT actually used. Nothing caught it because the sibling test above only COUNTS outbox rows
        // by preview -- it never checks the id inside the payload points at anything real. The consumer
        // (api/src/services/notificationOutboxService.ts handleUnreadMessage) does
        // findUnique({ id: payload.messageId }) and returns silently on a miss, so a dangling id costs
        // the recipient their email with no error and no log anywhere.
        var schoolId = Guid.NewGuid().ToString();
        var preview = $"broadcast-{Guid.NewGuid()}"; // unique: the fixture container is shared per class
        var admin = await _fixture.SeedUserAsync(schoolId, "school_admin");
        await _fixture.SeedUserAsync(schoolId, "student");
        await _fixture.SeedUserAsync(schoolId, "student");

        var count = await Repo().BroadcastAsync(
            _fixture.Ctx(admin, schoolId), admin, "school_admin", schoolId, "students", preview);
        Assert.Equal(2, count.RecipientCount);

        await using var conn = new NpgsqlConnection(_fixture.ConnectionString);
        await conn.OpenAsync();

        // Every outbox row for this broadcast must JOIN to a real "messages" row -- and that row must be
        // this broadcast's message (same content, same sender), not merely some row that happens to exist.
        await using (var joined = new NpgsqlCommand(
            """
            SELECT count(*)::int FROM "notification_outbox" o
            JOIN "messages" m ON m."id" = o."payload"->>'messageId'
            WHERE o."payload"->>'preview' = @preview AND m."content" = @preview AND m."senderId" = @sender
            """, conn))
        {
            joined.Parameters.AddWithValue("preview", preview);
            joined.Parameters.AddWithValue("sender", admin);
            Assert.Equal(2, (int)(await joined.ExecuteScalarAsync())!);
        }

        // ...and none may dangle. Asserted separately so a future regression that drops outbox rows
        // entirely fails on the count above rather than passing vacuously here.
        await using (var dangling = new NpgsqlCommand(
            """
            SELECT count(*)::int FROM "notification_outbox" o
            LEFT JOIN "messages" m ON m."id" = o."payload"->>'messageId'
            WHERE o."payload"->>'preview' = @preview AND m."id" IS NULL
            """, conn))
        {
            dangling.Parameters.AddWithValue("preview", preview);
            Assert.Equal(0, (int)(await dangling.ExecuteScalarAsync())!);
        }
    }

    [Fact]
    public async Task Partial_failure_keeps_the_other_recipients_messages_and_reports_the_failed_one()
    {
        // Legacy (routes/messages.ts:596-611) runs each recipient's Prisma calls with auto-commit, so one
        // recipient failing never rolls back the others. The .NET port ran all recipients inside ONE
        // transaction with a single COMMIT at the end: any failure meant zero messages delivered.
        // 25 recipients spans two chunks of 20, so this also pins that a failure in one chunk does not
        // stop the later chunk from being delivered.
        var schoolId = Guid.NewGuid().ToString();
        var content = $"partial-{Guid.NewGuid()}";
        var admin = await _fixture.SeedUserAsync(schoolId, "school_admin");
        var students = new List<string>();
        for (var i = 0; i < 25; i++) students.Add(await _fixture.SeedUserAsync(schoolId, "student"));
        var poisoned = students[7];

        await using var conn = new NpgsqlConnection(_fixture.ConnectionString);
        await conn.OpenAsync();
        // Make exactly one recipient's conversation upsert fail: a CHECK constraint that rejects any
        // conversation involving the poisoned user. Dropped in finally so sibling tests are unaffected
        // (the fixture is per class, so no other class shares this table).
        await using (var poison = new NpgsqlCommand(
            $"""ALTER TABLE "conversations" ADD CONSTRAINT "broadcast_poison" CHECK ("participantAId" <> '{poisoned}' AND "participantBId" <> '{poisoned}')""",
            conn))
        {
            await poison.ExecuteNonQueryAsync();
        }

        try
        {
            var result = await Repo().BroadcastAsync(_fixture.Ctx(admin, schoolId), admin, "school_admin", schoolId, "students", content);

            // The result reports exactly the one failure, by recipient, and counts only the delivered.
            Assert.Equal(24, result.RecipientCount);
            var failure = Assert.Single(result.Failures);
            Assert.Equal(poisoned, failure.RecipientId);
            Assert.Contains("broadcast_poison", failure.Error);

            // The other 24 recipients' messages must be committed and visible from a second connection...
            await using (var committed = new NpgsqlCommand("""SELECT count(*)::int FROM "messages" WHERE "content" = @content""", conn))
            {
                committed.Parameters.AddWithValue("content", content);
                Assert.Equal(24, (int)(await committed.ExecuteScalarAsync())!);
            }
            // ...and the failed recipient got neither a conversation nor an outbox row (its own transaction rolled back).
            await using (var poisonedRows = new NpgsqlCommand(
                """
                SELECT (SELECT count(*) FROM "conversations" WHERE "participantAId" = @p OR "participantBId" = @p)
                     + (SELECT count(*) FROM "notification_outbox" WHERE "payload"->>'recipientEmail' = @p || '@test.dev')
                """, conn))
            {
                poisonedRows.Parameters.AddWithValue("p", poisoned);
                Assert.Equal(0L, (long)(await poisonedRows.ExecuteScalarAsync())!);
            }
        }
        finally
        {
            await using var drop = new NpgsqlCommand("""ALTER TABLE "conversations" DROP CONSTRAINT "broadcast_poison" """, conn);
            await drop.ExecuteNonQueryAsync();
        }
    }

    [Fact]
    public async Task Each_recipient_commits_on_its_own_transaction_before_the_broadcast_completes()
    {
        // Pins "no single transaction spans recipients" two ways, both through the session factory the
        // repository already depends on (no fixture change needed):
        //   1. one writable session (= one transaction, see NpgsqlFormMapsDatabaseSessionFactory) is
        //      opened PER RECIPIENT, not one for the whole broadcast;
        //   2. while the broadcast is still opening sessions for the second chunk, the first chunk's
        //      messages are already visible from an unrelated autocommit connection -- i.e. committed.
        var schoolId = Guid.NewGuid().ToString();
        var content = $"per-tx-{Guid.NewGuid()}";
        var admin = await _fixture.SeedUserAsync(schoolId, "school_admin");
        for (var i = 0; i < 25; i++) await _fixture.SeedUserAsync(schoolId, "student");

        var observing = new ObservingSessionFactory(
            new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()), _fixture.ConnectionString, content);

        var result = await Repo(observing).BroadcastAsync(_fixture.Ctx(admin, schoolId), admin, "school_admin", schoolId, "students", content);

        Assert.Equal(25, result.RecipientCount);
        Assert.Empty(result.Failures);
        Assert.Equal(25, observing.WritableOpens); // one transaction per recipient
        // The 21st..25th sessions open only after the first chunk of 20 has fully completed, so by then
        // 20 committed messages are visible to an outside connection. A single spanning transaction
        // would show 0 here until the final COMMIT.
        Assert.True(observing.MaxVisibleAtOpen >= 20, $"expected >= 20 committed messages visible mid-broadcast, saw {observing.MaxVisibleAtOpen}");
    }

    /// <summary>
    /// Decorates the real factory: counts writable opens and, at each one, asks a separate autocommit
    /// connection how many of this broadcast's messages are already committed.
    /// </summary>
    private sealed class ObservingSessionFactory(IFormMapsDatabaseSessionFactory inner, string connectionString, string content)
        : IFormMapsDatabaseSessionFactory
    {
        private int _writableOpens;
        private int _maxVisibleAtOpen;

        public int WritableOpens => _writableOpens;
        public int MaxVisibleAtOpen => _maxVisibleAtOpen;

        public Task<FormMapsDatabaseSession> OpenReadOnlyAsync(RequestContext requestContext, CancellationToken cancellationToken = default) =>
            inner.OpenReadOnlyAsync(requestContext, cancellationToken);

        public async Task<FormMapsDatabaseSession> OpenWritableAsync(RequestContext requestContext, CancellationToken cancellationToken = default)
        {
            Interlocked.Increment(ref _writableOpens);
            await using (var conn = new NpgsqlConnection(connectionString))
            {
                await conn.OpenAsync(cancellationToken);
                await using var cmd = new NpgsqlCommand("""SELECT count(*)::int FROM "messages" WHERE "content" = @content""", conn);
                cmd.Parameters.AddWithValue("content", content);
                var visible = (int)(await cmd.ExecuteScalarAsync(cancellationToken))!;
                int seen;
                do { seen = _maxVisibleAtOpen; if (visible <= seen) break; }
                while (Interlocked.CompareExchange(ref _maxVisibleAtOpen, visible, seen) != seen);
            }
            return await inner.OpenWritableAsync(requestContext, cancellationToken);
        }
    }
}
