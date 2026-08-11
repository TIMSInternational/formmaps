using System.Data.Common;
using FormMaps.Application.Audit;
using FormMaps.Infrastructure.Audit;
using Microsoft.Extensions.Logging.Abstractions;
using Npgsql;

namespace FormMaps.IntegrationTests.Audit;

/// <summary>
/// Task 5 of formmaps#52. Exercises <see cref="AuditEventReader" /> on the fixture's NOSUPERUSER
/// NOBYPASSRLS login (see <see cref="AuditDatabaseFixture" />).
/// </summary>
/// <remarks>
/// <para>
/// THAT LOGIN IS WHY THESE TESTS MEAN ANYTHING. <c>audit_events</c>' policy admits bypass-mode
/// sessions only, so every assertion below of the form "the reader returned N rows" is simultaneously
/// a proof that the reader opened under <c>RequestContext.System()</c>: an Identity-mode session on
/// the same factory sees zero rows (proved directly in
/// <c>AuditEventWriterTests.IdentitySession_CannotWriteOrReadAuditEvents</c>). Run these against the
/// container superuser instead and they would pass with the reader opening any session at all.
/// </para>
/// <para>
/// SEEDING IS DELIBERATELY SPLIT. Filter tests seed through the real <see cref="AuditEventWriter" />,
/// which keeps the reader honest about the shape the writer actually produces. Ordering and paging
/// tests seed admin-side with EXPLICIT <c>occurredAt</c> values instead: <c>now()</c> is transaction
/// start time, so writer-seeded rows land microseconds apart in an order that is real but not
/// controlled, and an ordering assertion built on that is one busy CI box away from flaking — or, if
/// two transactions ever do share a timestamp, from silently asserting nothing at all.
/// </para>
/// </remarks>
[Collection(nameof(AuditDatabaseCollection))]
public class AuditEventReaderTests(AuditDatabaseFixture fixture)
{
    private static readonly DateTimeOffset Base =
        new(2026, 3, 1, 12, 0, 0, TimeSpan.Zero);

    /// <summary>
    /// Harness proof, first for the same reason it is first in the writer tests: if the login under
    /// test bypassed RLS, "the reader reads under System()" would be unfalsifiable here.
    /// </summary>
    [Fact]
    public async Task Harness_AppLogin_DoesNotBypassRls()
    {
        Assert.False(await fixture.AppLoginBypassesRlsAsync());
    }

    // ---------------------------------------------------------------- plan's four

    [Fact]
    public async Task QueryAsync_NoFilters_ReturnsAllRows_NewestFirst()
    {
        await fixture.ResetAsync();
        await SeedAsync("audit.test.a", "s1");
        await SeedAsync("audit.test.b", "s2");
        var reader = MakeReader();

        var page = await reader.QueryAsync(new AuditEventQuery());

        Assert.Equal(2, page.Items.Count);
        Assert.True(page.Items[0].OccurredAt >= page.Items[1].OccurredAt);
        Assert.Equal(
            ["audit.test.a", "audit.test.b"],
            page.Items.Select(i => i.EventType).OrderBy(t => t, StringComparer.Ordinal));
    }

    [Fact]
    public async Task QueryAsync_FilterByEventType_ReturnsOnlyMatching()
    {
        await fixture.ResetAsync();
        await SeedAsync("audit.test.a", "s1");
        await SeedAsync("audit.test.b", "s2");
        var reader = MakeReader();

        var page = await reader.QueryAsync(new AuditEventQuery(EventType: "audit.test.a"));

        Assert.Single(page.Items);
        Assert.Equal("audit.test.a", page.Items[0].EventType);
    }

    [Fact]
    public async Task QueryAsync_FilterBySubjectId_ReturnsOnlyMatching()
    {
        await fixture.ResetAsync();
        await SeedAsync("audit.test.a", "s1");
        await SeedAsync("audit.test.b", "s2");
        var reader = MakeReader();

        var page = await reader.QueryAsync(new AuditEventQuery(SubjectId: "s2"));

        Assert.Single(page.Items);
        Assert.Equal("s2", page.Items[0].SubjectId);
    }

    [Fact]
    public async Task QueryAsync_LimitSmallerThanTotal_ReturnsNextCursor()
    {
        await fixture.ResetAsync();
        await SeedAtAsync("audit.test.a", "s1", Base);
        await SeedAtAsync("audit.test.b", "s2", Base.AddSeconds(1));
        await SeedAtAsync("audit.test.c", "s3", Base.AddSeconds(2));
        var reader = MakeReader();

        var firstPage = await reader.QueryAsync(new AuditEventQuery(Limit: 2));
        Assert.Equal(2, firstPage.Items.Count);
        Assert.NotNull(firstPage.NextCursor);

        var secondPage = await reader.QueryAsync(new AuditEventQuery(Limit: 2, Cursor: firstPage.NextCursor));
        Assert.Single(secondPage.Items);
        Assert.Null(secondPage.NextCursor);

        // The plan asserts only the COUNTS, which a reader that re-returns the boundary row on every
        // page satisfies exactly (2 then 1) while handing a client duplicates and never terminating
        // on a longer table. Assert the identities.
        Assert.Equal(
            ["audit.test.a", "audit.test.b", "audit.test.c"],
            firstPage.Items.Concat(secondPage.Items).Select(i => i.EventType).OrderBy(t => t, StringComparer.Ordinal));
    }

    // ---------------------------------------------------------------- beyond the plan

    /// <summary>
    /// Ten ordinal reads over a row of eight TEXT columns, six of them nullable. Every filter test
    /// above stays green if <c>actorRole</c> is mapped into <c>schoolId</c>, or <c>outcome</c> into
    /// <c>subjectType</c>. This is the only test that can see that.
    /// </summary>
    [Fact]
    public async Task QueryAsync_MapsEveryColumnIntoItsMatchingProperty()
    {
        await fixture.ResetAsync();
        var writer = MakeWriter();
        await writer.WriteAsync(new AuditEvent(
            EventType: "audit.test.mapping",
            ActorUserId: "actor_9",
            ActorRole: "counselor",
            SchoolId: "school_9",
            SubjectType: "test_score",
            SubjectId: "subject_9",
            Outcome: "denied",
            Metadata: new Dictionary<string, object?> { ["attemptCount"] = 3 }));
        var reader = MakeReader();

        var page = await reader.QueryAsync(new AuditEventQuery(EventType: "audit.test.mapping"));

        var item = Assert.Single(page.Items);
        Assert.False(string.IsNullOrWhiteSpace(item.Id));
        Assert.Equal("audit.test.mapping", item.EventType);
        Assert.Equal("actor_9", item.ActorUserId);
        Assert.Equal("counselor", item.ActorRole);
        Assert.Equal("school_9", item.SchoolId);
        Assert.Equal("test_score", item.SubjectType);
        Assert.Equal("subject_9", item.SubjectId);
        Assert.Equal("denied", item.Outcome);
        Assert.NotNull(item.MetadataJson);
        Assert.Contains("attemptCount", item.MetadataJson);
        // The row was inserted moments ago; a reader that hands back default(DateTimeOffset), or one
        // that reads a timestamptz as local time and calls it UTC, is not distinguishable by the
        // ordering assertions alone.
        Assert.True(item.OccurredAt > DateTimeOffset.UtcNow.AddMinutes(-5), $"OccurredAt was {item.OccurredAt:O}");
        Assert.True(item.OccurredAt < DateTimeOffset.UtcNow.AddMinutes(5), $"OccurredAt was {item.OccurredAt:O}");
    }

    /// <summary>
    /// <c>metadata</c> is the one nullable non-TEXT column. A reader that reads it with
    /// <c>GetString</c> without an <c>IsDBNull</c> check throws only for metadata-less events — which
    /// is nearly every real event, and none of the plan's tests.
    /// </summary>
    [Fact]
    public async Task QueryAsync_NullMetadata_MapsToNull_NotAThrow()
    {
        await fixture.ResetAsync();
        await SeedAsync("audit.test.nometa", "s1");
        var reader = MakeReader();

        var page = await reader.QueryAsync(new AuditEventQuery(EventType: "audit.test.nometa"));

        var item = Assert.Single(page.Items);
        Assert.Null(item.MetadataJson);
    }

    /// <summary>
    /// Deterministic ordering, which the plan's <c>&gt;=</c> assertion is not: two writer-seeded rows
    /// sharing an <c>occurredAt</c> make it hold for ASC output too.
    /// </summary>
    [Fact]
    public async Task QueryAsync_OrdersByOccurredAtDescending()
    {
        await fixture.ResetAsync();
        await SeedAtAsync("audit.test.oldest", "s1", Base);
        await SeedAtAsync("audit.test.middle", "s2", Base.AddHours(1));
        await SeedAtAsync("audit.test.newest", "s3", Base.AddHours(2));
        var reader = MakeReader();

        var page = await reader.QueryAsync(new AuditEventQuery());

        Assert.Equal(
            ["audit.test.newest", "audit.test.middle", "audit.test.oldest"],
            page.Items.Select(i => i.EventType));
    }

    /// <summary>
    /// The entire justification for keyset-on-<c>(occurredAt, id)</c> rather than offset paging, and
    /// the reason Task 1 shipped a COMPOSITE index. With ties present, a cursor of
    /// <c>"occurredAt" &lt; @t</c> alone SKIPS the rest of the tied group; a <c>&lt;=</c> one repeats
    /// it forever. Both are invisible when every row has a distinct timestamp, which is every other
    /// test in this file.
    /// </summary>
    [Fact]
    public async Task QueryAsync_IdenticalOccurredAt_PagesWithoutSkippingOrRepeating()
    {
        await fixture.ResetAsync();
        var tied = Base.AddMinutes(30);
        await SeedAtAsync("audit.test.tie1", "s1", tied);
        await SeedAtAsync("audit.test.tie2", "s2", tied);
        await SeedAtAsync("audit.test.tie3", "s3", tied);
        var reader = MakeReader();

        var seen = new List<string>();
        string? cursor = null;
        for (var page = 0; page < 5; page++)
        {
            var result = await reader.QueryAsync(new AuditEventQuery(Limit: 1, Cursor: cursor));
            seen.AddRange(result.Items.Select(i => i.EventType));
            cursor = result.NextCursor;
            if (cursor is null)
            {
                break;
            }
        }

        Assert.Null(cursor);
        Assert.Equal(3, seen.Count);
        Assert.Equal(3, seen.Distinct().Count());
        Assert.Equal(
            ["audit.test.tie1", "audit.test.tie2", "audit.test.tie3"],
            seen.OrderBy(t => t, StringComparer.Ordinal));
    }

    /// <summary>
    /// The classic keyset off-by-one. When the table holds exactly <c>Limit</c> rows a reader that
    /// tests <c>fetched &gt;= limit</c> instead of <c>&gt; limit</c> emits a cursor for a page that
    /// does not exist, so a client paging to exhaustion never terminates. The plan's paging test
    /// cannot see it: its last page is SHORT, not exact.
    /// </summary>
    [Fact]
    public async Task QueryAsync_RowsExactlyEqualLimit_ReturnsNullCursor()
    {
        await fixture.ResetAsync();
        await SeedAtAsync("audit.test.a", "s1", Base);
        await SeedAtAsync("audit.test.b", "s2", Base.AddSeconds(1));
        var reader = MakeReader();

        var page = await reader.QueryAsync(new AuditEventQuery(Limit: 2));

        Assert.Equal(2, page.Items.Count);
        Assert.Null(page.NextCursor);
    }

    /// <summary>
    /// <c>From</c>/<c>To</c> are in the query record and exercised by NO test in the plan: an
    /// implementation that drops both filters on the floor is green everywhere else. Boundaries are
    /// asserted on both ends because inclusive-vs-exclusive is the thing a reader of the endpoint's
    /// query string will assume without checking.
    /// </summary>
    [Fact]
    public async Task QueryAsync_FromAndTo_FilterOnOccurredAt_Inclusively()
    {
        await fixture.ResetAsync();
        await SeedAtAsync("audit.test.early", "s1", Base);
        await SeedAtAsync("audit.test.mid", "s2", Base.AddHours(1));
        await SeedAtAsync("audit.test.late", "s3", Base.AddHours(2));
        var reader = MakeReader();

        var from = await reader.QueryAsync(new AuditEventQuery(From: Base.AddHours(1)));
        Assert.Equal(["audit.test.late", "audit.test.mid"], from.Items.Select(i => i.EventType));

        var to = await reader.QueryAsync(new AuditEventQuery(To: Base.AddHours(1)));
        Assert.Equal(["audit.test.mid", "audit.test.early"], to.Items.Select(i => i.EventType));

        var window = await reader.QueryAsync(
            new AuditEventQuery(From: Base.AddMinutes(1), To: Base.AddHours(2).AddMinutes(-1)));
        Assert.Equal(["audit.test.mid"], window.Items.Select(i => i.EventType));
    }

    /// <summary>
    /// Every filter test above passes one filter at a time, so a builder that emits <c>OR</c> between
    /// clauses — or one where a later <c>AddFilter</c> overwrites an earlier parameter — is green in
    /// all of them and returns other tenants' rows in production.
    /// </summary>
    [Fact]
    public async Task QueryAsync_MultipleFilters_CombineWithAnd()
    {
        await fixture.ResetAsync();
        var writer = MakeWriter();
        await writer.WriteAsync(new AuditEvent("audit.test.multi", "actor_1", "student", "school_1", "test_score", "s1"));
        await writer.WriteAsync(new AuditEvent("audit.test.multi", "actor_2", "student", "school_2", "test_score", "s2"));
        await writer.WriteAsync(new AuditEvent("audit.test.other", "actor_1", "student", "school_1", "lia_session", "s3"));
        var reader = MakeReader();

        var page = await reader.QueryAsync(new AuditEventQuery(
            EventType: "audit.test.multi",
            ActorUserId: "actor_1",
            SchoolId: "school_1",
            SubjectType: "test_score"));

        var item = Assert.Single(page.Items);
        Assert.Equal("s1", item.SubjectId);
    }

    [Fact]
    public async Task QueryAsync_FilterByActorUserId_ReturnsOnlyMatching()
    {
        await fixture.ResetAsync();
        await SeedAsync("audit.test.a", "s1", actorUserId: "actor_a");
        await SeedAsync("audit.test.b", "s2", actorUserId: "actor_b");
        var reader = MakeReader();

        var page = await reader.QueryAsync(new AuditEventQuery(ActorUserId: "actor_b"));

        Assert.Equal("actor_b", Assert.Single(page.Items).ActorUserId);
    }

    /// <summary>
    /// A raw <c>LIMIT @limit</c> with the caller's value hands back an empty page forever for
    /// <c>limit=0</c> (an endpoint query string trivially produces one) and errors outright for a
    /// negative. Clamping up is the documented behaviour; nothing else asserts it.
    /// </summary>
    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    public async Task QueryAsync_LimitBelowOne_IsClampedUp_NotAnEmptyPage(int limit)
    {
        await fixture.ResetAsync();
        await SeedAtAsync("audit.test.a", "s1", Base);
        await SeedAtAsync("audit.test.b", "s2", Base.AddSeconds(1));
        var reader = MakeReader();

        var page = await reader.QueryAsync(new AuditEventQuery(Limit: limit));

        Assert.Single(page.Items);
        Assert.NotNull(page.NextCursor);
    }

    /// <summary>
    /// The upper clamp is the only thing standing between a public query string and
    /// <c>?limit=1000000</c> against an indefinitely-retained table. Asserted against real rows
    /// rather than by reading the constant.
    /// </summary>
    [Fact]
    public async Task QueryAsync_LimitAboveMaximum_IsClampedToMaximum()
    {
        await fixture.ResetAsync();
        await SeedBulkAsync(250);
        var reader = MakeReader();

        var page = await reader.QueryAsync(new AuditEventQuery(Limit: 100_000));

        Assert.Equal(200, page.Items.Count);
        Assert.NotNull(page.NextCursor);
    }

    /// <summary>
    /// The cursor is client-supplied and reaches the reader straight off a query string (Task 6).
    /// Base64, the <c>|</c> separator and the timestamp are three independent ways to malform it, and
    /// they throw three different exception types (<see cref="FormatException" />,
    /// <see cref="IndexOutOfRangeException" />, <see cref="FormatException" />) — an endpoint cannot
    /// map that to a 400 without catching <c>Exception</c>. One documented type instead.
    /// </summary>
    [Theory]
    [InlineData("not-base64!!")]
    [InlineData("bm8tc2VwYXJhdG9yLWhlcmU=")]      // valid base64, no '|'
    [InlineData("bm90LWEtZGF0ZXxldnRfMQ==")]      // valid base64, has '|', timestamp is garbage
    public async Task QueryAsync_MalformedCursor_ThrowsArgumentException(string cursor)
    {
        await fixture.ResetAsync();
        var reader = MakeReader();

        var ex = await Assert.ThrowsAsync<ArgumentException>(
            () => reader.QueryAsync(new AuditEventQuery(Cursor: cursor)));

        Assert.Contains("cursor", ex.Message, StringComparison.OrdinalIgnoreCase);
        // The value came from the caller; echoing it back into an error message (and from there into
        // logs) is how a reflected value ends up persisted. Only the parameter is named.
        Assert.DoesNotContain(cursor, ex.Message, StringComparison.Ordinal);
    }

    [Fact]
    public async Task QueryAsync_EmptyTable_ReturnsEmptyPage_WithNoCursor()
    {
        await fixture.ResetAsync();
        var reader = MakeReader();

        var page = await reader.QueryAsync(new AuditEventQuery());

        Assert.Empty(page.Items);
        Assert.Null(page.NextCursor);
    }

    [Fact]
    public async Task QueryAsync_FilterMatchesNothing_ReturnsEmptyPage()
    {
        await fixture.ResetAsync();
        await SeedAsync("audit.test.a", "s1");
        var reader = MakeReader();

        var page = await reader.QueryAsync(new AuditEventQuery(EventType: "audit.test.nonexistent"));

        Assert.Empty(page.Items);
        Assert.Null(page.NextCursor);
    }

    // ---------------------------------------------------------------- helpers

    private AuditEventReader MakeReader() => new(fixture.SessionFactory);

    private AuditEventWriter MakeWriter() =>
        new(fixture.SessionFactory, NullLogger<AuditEventWriter>.Instance);

    private async Task SeedAsync(string eventType, string subjectId, string? actorUserId = "user_1")
    {
        await MakeWriter().WriteAsync(
            new AuditEvent(eventType, actorUserId, "student", "school_1", "test_score", subjectId));
    }

    /// <summary>
    /// Admin-side insert with an EXPLICIT <c>occurredAt</c>. The writer cannot set one (deliberately —
    /// the column defaults to <c>now()</c> so a call site can never backdate an audit row), and
    /// ordering/paging assertions need controlled timestamps to mean anything.
    /// </summary>
    private async Task SeedAtAsync(string eventType, string subjectId, DateTimeOffset occurredAt)
    {
        await using var connection = new NpgsqlConnection(fixture.ConnectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = """
            INSERT INTO "audit_events"
                ("id", "occurredAt", "eventType", "actorUserId", "actorRole", "schoolId", "subjectType", "subjectId", "outcome")
            VALUES (@id, @occurredAt, @eventType, 'user_1', 'student', 'school_1', 'test_score', @subjectId, 'success')
            """;
        AddParam(command, "id", Guid.NewGuid().ToString());
        AddParam(command, "occurredAt", occurredAt.UtcDateTime);
        AddParam(command, "eventType", eventType);
        AddParam(command, "subjectId", subjectId);
        await command.ExecuteNonQueryAsync();
    }

    private async Task SeedBulkAsync(int count)
    {
        await using var connection = new NpgsqlConnection(fixture.ConnectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = """
            INSERT INTO "audit_events" ("id", "occurredAt", "eventType", "subjectType")
            SELECT 'bulk_' || lpad(g::text, 6, '0'),
                   TIMESTAMPTZ '2026-03-01 12:00:00+00' - (g || ' seconds')::interval,
                   'audit.test.bulk',
                   'test_score'
            FROM generate_series(1, @count) AS g
            """;
        AddParam(command, "count", count);
        await command.ExecuteNonQueryAsync();
    }

    private static void AddParam(DbCommand command, string name, object value)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = name;
        parameter.Value = value;
        command.Parameters.Add(parameter);
    }
}
