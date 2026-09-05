using FormMaps.Application.Auth;
using FormMaps.Application.Data;
using FormMaps.Application.Messaging;
using FormMaps.Infrastructure.Data;
using FormMaps.Infrastructure.Messaging;
using Microsoft.Extensions.Options;
using Npgsql;

namespace FormMaps.IntegrationTests.Messaging;

public sealed class MessagesBroadcastTests : IClassFixture<MessagingDatabaseFixture>, IAsyncLifetime
{
    private readonly MessagingDatabaseFixture _fixture;
    private NpgsqlDataSource _dataSource = null!;

    public MessagesBroadcastTests(MessagingDatabaseFixture fixture) => _fixture = fixture;
    public Task InitializeAsync() { _dataSource = NpgsqlDataSource.Create(_fixture.AppConnectionString); return Task.CompletedTask; }
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
        await using var conn = new NpgsqlConnection(_fixture.AdminConnectionString);
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
        await using var conn = new NpgsqlConnection(_fixture.AdminConnectionString);
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

        await using var conn = new NpgsqlConnection(_fixture.AdminConnectionString);
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

        await using var conn = new NpgsqlConnection(_fixture.AdminConnectionString);
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
        // Exactly 20 recipients = one chunk, so the expected count does not depend on which chunk the
        // poisoned recipient lands in (recipient order is unordered SQL, as in legacy); the chunk
        // boundary itself is pinned by A_failing_chunk_stops_the_broadcast_before_the_next_chunk_starts.
        var schoolId = Guid.NewGuid().ToString();
        var content = $"partial-{Guid.NewGuid()}";
        var admin = await _fixture.SeedUserAsync(schoolId, "school_admin");
        var students = new List<string>();
        for (var i = 0; i < 20; i++) students.Add(await _fixture.SeedUserAsync(schoolId, "student"));
        var poisoned = students[7];

        await using var conn = new NpgsqlConnection(_fixture.ConnectionString);
        await conn.OpenAsync();
        // Make exactly one recipient's conversation upsert fail: a CHECK constraint that rejects any
        // conversation involving the poisoned user. Dropped in finally so sibling tests are unaffected
        // (the fixture is per class, so no other class shares this table).
        // ALTER TABLE needs the fixture's superuser connection string. When this fixture is converted to
        // the restricted app login (sibling item wave3/rls-fixtures-billing-messaging, see
        // TestSupport/Rls/CONVERTING-A-FIXTURE.md) this DDL must move to the fixture's admin connection.
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
            Assert.Equal(19, result.RecipientCount);
            var failure = Assert.Single(result.Failures);
            Assert.Equal(poisoned, failure.RecipientId);
            Assert.Contains("broadcast_poison", failure.Error);
            // SQLSTATE + primary message only: PostgresException.Message also carries DETAIL, which
            // quotes row values once "Include Error Detail" is on the connection string.
            Assert.StartsWith("23514: ", failure.Error);
            Assert.DoesNotContain("DETAIL", failure.Error);

            // The other 19 recipients' messages must be committed and visible from a second connection...
            await using (var committed = new NpgsqlCommand("""SELECT count(*)::int FROM "messages" WHERE "content" = @content""", conn))
            {
                committed.Parameters.AddWithValue("content", content);
                Assert.Equal(19, (int)(await committed.ExecuteScalarAsync())!);
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
    public async Task A_failing_chunk_stops_the_broadcast_before_the_next_chunk_starts()
    {
        // Legacy: `await Promise.all(chunk.map(...))` inside the for-loop (routes/messages.ts:596-611) --
        // a rejected recipient throws out of the loop into the route's catch (500), so the failing
        // chunk's siblings finish but NO later chunk is ever started. Pinned here with the failure
        // injected at the 3rd writable open (deterministically inside the first chunk of 20, whatever
        // order the recipients come back in), the way a pool-exhausted open fails in production: the
        // first chunk's other 19 are delivered, the second chunk's 5 are never opened.
        var schoolId = Guid.NewGuid().ToString();
        var content = $"stop-{Guid.NewGuid()}";
        var admin = await _fixture.SeedUserAsync(schoolId, "school_admin");
        for (var i = 0; i < 25; i++) await _fixture.SeedUserAsync(schoolId, "student");

        var intercepting = new InterceptingSessionFactory(
            new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()),
            onWritableOpen: n => { if (n == 3) throw new NpgsqlException("The connection pool has been exhausted (simulated)"); });

        var result = await Repo(intercepting).BroadcastAsync(_fixture.Ctx(admin, schoolId), admin, "school_admin", schoolId, "students", content);

        Assert.Equal(19, result.RecipientCount);
        var failure = Assert.Single(result.Failures);
        Assert.Contains("pool has been exhausted", failure.Error);
        Assert.Equal(20, intercepting.WritableOpens); // the whole first chunk, and nothing of the second

        await using var conn = new NpgsqlConnection(_fixture.ConnectionString);
        await conn.OpenAsync();
        await using var committed = new NpgsqlCommand("""SELECT count(*)::int FROM "messages" WHERE "content" = @content""", conn);
        committed.Parameters.AddWithValue("content", content);
        Assert.Equal(19, (int)(await committed.ExecuteScalarAsync())!);
    }

    [Fact]
    public async Task Request_abort_mid_fan_out_does_not_half_deliver_the_broadcast()
    {
        // Legacy's Node handler keeps running after the client socket closes, so a broadcast is never
        // left half-delivered by a disconnect or the gateway timeout. Cancelling the request token from
        // inside the 3rd writable open used to abort the remaining per-recipient sessions: the already
        // committed recipients stayed delivered, no response reached the client, and a retry
        // double-sent to them. The fan-out must not observe the request token.
        var schoolId = Guid.NewGuid().ToString();
        var content = $"abort-{Guid.NewGuid()}";
        var admin = await _fixture.SeedUserAsync(schoolId, "school_admin");
        for (var i = 0; i < 25; i++) await _fixture.SeedUserAsync(schoolId, "student");

        using var requestAborted = new CancellationTokenSource();
        var intercepting = new InterceptingSessionFactory(
            new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()),
            onWritableOpen: n => { if (n == 3) requestAborted.Cancel(); });

        var result = await Repo(intercepting).BroadcastAsync(
            _fixture.Ctx(admin, schoolId), admin, "school_admin", schoolId, "students", content, requestAborted.Token);

        Assert.True(requestAborted.IsCancellationRequested);
        Assert.Equal(25, result.RecipientCount);
        Assert.Empty(result.Failures);

        await using var conn = new NpgsqlConnection(_fixture.ConnectionString);
        await conn.OpenAsync();
        await using var committed = new NpgsqlCommand("""SELECT count(*)::int FROM "messages" WHERE "content" = @content""", conn);
        committed.Parameters.AddWithValue("content", content);
        Assert.Equal(25, (int)(await committed.ExecuteScalarAsync())!);
    }

    [Fact]
    public async Task In_flight_sessions_stay_below_the_pool_size_so_other_requests_keep_a_connection()
    {
        // The Npgsql pool is process-wide (MaxPoolSize 10 in production, see appsettings.json). A chunk
        // of 20 simultaneous per-recipient opens pinned every pooled connection for the whole broadcast
        // and queued every other request behind the pool's 20s wait. The repository must cap in-flight
        // sessions at MaxPoolSize - headroom; proven on a data source whose pool really is 4 wide, with
        // options saying so, by counting how many writable opens are in progress at once.
        var schoolId = Guid.NewGuid().ToString();
        var content = $"pool-{Guid.NewGuid()}";
        var admin = await _fixture.SeedUserAsync(schoolId, "school_admin");
        for (var i = 0; i < 25; i++) await _fixture.SeedUserAsync(schoolId, "student");

        const int maxPoolSize = 4;
        await using var smallPool = NpgsqlDataSource.Create(
            new NpgsqlConnectionStringBuilder(_fixture.ConnectionString) { MaxPoolSize = maxPoolSize }.ConnectionString);
        var intercepting = new InterceptingSessionFactory(new NpgsqlFormMapsDatabaseSessionFactory(smallPool, new RlsSessionContextApplier()));
        var repo = new MessagesRepository(intercepting, TimeProvider.System, new NoopRealtimeNotifier(),
            Options.Create(new FormMapsDatabaseOptions { MaxPoolSize = maxPoolSize }));

        var result = await repo.BroadcastAsync(_fixture.Ctx(admin, schoolId), admin, "school_admin", schoolId, "students", content);

        Assert.Empty(result.Failures.Select(f => f.Error));
        Assert.Equal(25, result.RecipientCount);
        Assert.Equal(25, intercepting.WritableOpens);
        Assert.True(intercepting.MaxInFlightOpens <= maxPoolSize - 2,
            $"expected at most {maxPoolSize - 2} writable opens in flight on a pool of {maxPoolSize}, saw {intercepting.MaxInFlightOpens}");
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

    /// <summary>
    /// Decorates the real factory so a test can act from INSIDE a writable open: the hook runs with the
    /// 1-based open number before the inner open (throw to fault that recipient, cancel a token to
    /// simulate an aborted request), and the decorator records how many inner opens are in progress
    /// at once.
    /// </summary>
    private sealed class InterceptingSessionFactory(IFormMapsDatabaseSessionFactory inner, Action<int>? onWritableOpen = null)
        : IFormMapsDatabaseSessionFactory
    {
        private int _writableOpens;
        private int _inFlight;
        private int _maxInFlight;

        public int WritableOpens => _writableOpens;
        public int MaxInFlightOpens => _maxInFlight;

        public Task<FormMapsDatabaseSession> OpenReadOnlyAsync(RequestContext requestContext, CancellationToken cancellationToken = default) =>
            inner.OpenReadOnlyAsync(requestContext, cancellationToken);

        public async Task<FormMapsDatabaseSession> OpenWritableAsync(RequestContext requestContext, CancellationToken cancellationToken = default)
        {
            var opened = Interlocked.Increment(ref _writableOpens);
            onWritableOpen?.Invoke(opened);
            var inFlight = Interlocked.Increment(ref _inFlight);
            int seen;
            do { seen = _maxInFlight; if (inFlight <= seen) break; }
            while (Interlocked.CompareExchange(ref _maxInFlight, inFlight, seen) != seen);
            try
            {
                return await inner.OpenWritableAsync(requestContext, cancellationToken);
            }
            finally
            {
                Interlocked.Decrement(ref _inFlight);
            }
        }
    }
}
