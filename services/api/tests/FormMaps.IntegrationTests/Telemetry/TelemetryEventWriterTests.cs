using FormMaps.Application.Telemetry;
using FormMaps.Infrastructure.Data;
using FormMaps.Infrastructure.Telemetry;
using FormMaps.IntegrationTests.TestSupport.Rls;
using Npgsql;

namespace FormMaps.IntegrationTests.Telemetry;

/// <summary>
/// Real-Postgres behaviour of <see cref="TelemetryEventWriter"/> (formmaps#65 — the port of the
/// <c>prisma.telemetryEvent.createMany</c> at api/src/routes/telemetry.ts:45-55). Pins the stored row
/// against the Prisma semantics it replaces: which columns the writer supplies, which it leaves to the
/// database, and which legacy leaves NULL.
///
/// <para>The tenant boundary is NOT here — it is in TelemetryCrossTenantRlsTests, which carries the
/// sabotage record.</para>
/// </summary>
[Collection(TelemetryDatabaseCollection.Name)]
public sealed class TelemetryEventWriterTests : IAsyncLifetime
{
    private readonly TelemetryDatabaseFixture _fixture;

    /// <summary>Restricted login (NOSUPERUSER NOBYPASSRLS) — the writer under test.</summary>
    private NpgsqlDataSource _dataSource = null!;

    /// <summary>Container superuser — seeding and row-state assertions only.</summary>
    private NpgsqlDataSource _adminDataSource = null!;

    public TelemetryEventWriterTests(TelemetryDatabaseFixture fixture) => _fixture = fixture;

    public async Task InitializeAsync()
    {
        _dataSource = NpgsqlDataSource.Create(_fixture.AppConnectionString);
        _adminDataSource = NpgsqlDataSource.Create(_fixture.AdminConnectionString);
        await _fixture.ResetAsync();
    }

    public async Task DisposeAsync()
    {
        await _dataSource.DisposeAsync();
        await _adminDataSource.DisposeAsync();
    }

    [Fact]
    public async Task Harness_runs_as_a_restricted_login_with_the_production_policies_live()
    {
        // NOTE the data source: the APP login, not the admin one (formmaps#125).
        await using var connection = await _dataSource.OpenConnectionAsync();
        Assert.False(await ProductionRlsPolicies.BypassesRlsAsync(connection), "the app login must not bypass RLS");

        // Both tables, unlike the moderation harness — production policies telemetry_events too.
        Assert.Equal<string>(["telemetry_events", "users"], _fixture.AppliedPolicyTables);
    }

    // =====================================================================================
    // The stored row (telemetry.ts:45-55)
    // =====================================================================================

    [Fact]
    public async Task Writes_one_row_per_event_with_the_columns_legacy_supplies()
    {
        await using var admin = await _adminDataSource.OpenConnectionAsync();
        await _fixture.SeedUserAsync(admin, "u1", "school-1");

        var timestamp = new DateTime(2026, 1, 2, 3, 4, 5, 678, DateTimeKind.Utc);
        var expiresAt = new DateTime(2026, 4, 2, 3, 4, 5, 678, DateTimeKind.Utc);

        await Writer().WriteAsync(
            TelemetryDatabaseFixture.Ctx("u1", "school-1"),
            "u1",
            [new TelemetryEventRow("web_vital", timestamp, """{"metric":"LCP","value":2419}""")],
            expiresAt);

        var row = Assert.Single(await _fixture.ReadAllAsync(admin));
        Assert.Equal("u1", row.UserId);
        Assert.Equal("web_vital", row.Type);
        Assert.Equal(timestamp, DateTime.SpecifyKind(row.Timestamp, DateTimeKind.Utc));
        Assert.Equal(expiresAt, DateTime.SpecifyKind(row.ExpiresAt, DateTimeKind.Utc));
        Assert.Contains("\"metric\": \"LCP\"", row.PropertiesJson);
    }

    /// <summary>
    /// telemetry.ts:39, and the legacy suite's own assertion (telemetry-web-vital.route.test.ts:64-69):
    /// the row carries a lowercase 64-char SHA-256 of the userId. Note it carries the BARE userId too —
    /// this is a join key, not anonymisation, and the port keeps both exactly as legacy has them.
    /// </summary>
    [Fact]
    public async Task Stores_the_sha256_of_the_user_id_alongside_the_bare_user_id()
    {
        await using var admin = await _adminDataSource.OpenConnectionAsync();
        await _fixture.SeedUserAsync(admin, "u1", "school-1");

        await Writer().WriteAsync(
            TelemetryDatabaseFixture.Ctx("u1", "school-1"), "u1",
            [Row("page_view")], Expiry);

        var row = Assert.Single(await _fixture.ReadAllAsync(admin));
        Assert.Matches("^[0-9a-f]{64}$", row.UserIdHash);
        Assert.Equal(TelemetryBatch.HashUserId("u1"), row.UserIdHash);
        Assert.Equal("u1", row.UserId);
    }

    /// <summary>
    /// The columns Prisma does NOT set on a createMany. Asserted explicitly because inventing values for
    /// them would be a silent schema divergence that only shows up in whatever reads the table months
    /// later: "isActive" and "createdDate" come from their database defaults, "createdBy"/"updatedBy"
    /// stay NULL, and "id"/"updatedAt" are supplied because those two columns have no default at all.
    /// </summary>
    [Fact]
    public async Task Leaves_the_columns_prisma_leaves_alone_and_supplies_the_two_with_no_default()
    {
        await using var admin = await _adminDataSource.OpenConnectionAsync();
        await _fixture.SeedUserAsync(admin, "u1", "school-1");

        await Writer().WriteAsync(
            TelemetryDatabaseFixture.Ctx("u1", "school-1"), "u1", [Row("click")], Expiry);

        var row = Assert.Single(await _fixture.ReadAllAsync(admin));
        Assert.True(row.IsActive);
        Assert.Null(row.CreatedBy);
        Assert.Null(row.UpdatedBy);
        Assert.NotEmpty(row.Id);
        Assert.NotEqual(default, row.CreatedDate);
        Assert.NotEqual(default, row.UpdatedAt);
    }

    [Fact]
    public async Task A_null_properties_value_lands_as_sql_null_not_the_json_null_literal()
    {
        await using var admin = await _adminDataSource.OpenConnectionAsync();
        await _fixture.SeedUserAsync(admin, "u1", "school-1");

        await Writer().WriteAsync(
            TelemetryDatabaseFixture.Ctx("u1", "school-1"), "u1",
            [new TelemetryEventRow("click", DateTime.UtcNow, null)], Expiry);

        // `properties: null` in Prisma's createMany is a SQL NULL; the jsonb value `null` is a different
        // thing and would make `WHERE properties IS NULL` analytics quietly wrong.
        Assert.Null(Assert.Single(await _fixture.ReadAllAsync(admin)).PropertiesJson);
    }

    /// <summary>
    /// createMany is ONE statement, so a batch lands whole or not at all. That is what makes the
    /// response's <c>eventsReceived</c> honest, and it is why the writer builds a single multi-row INSERT
    /// rather than looping. Pinned by making the LAST row of a batch violate the FK: nothing may survive.
    /// </summary>
    [Fact]
    public async Task A_batch_is_atomic_so_a_failing_row_leaves_none_of_it_behind()
    {
        await using var admin = await _adminDataSource.OpenConnectionAsync();
        await _fixture.SeedUserAsync(admin, "u1", "school-1");

        // "ghost" has no users row, so the FK rejects the whole statement.
        await Assert.ThrowsAnyAsync<Exception>(() => Writer().WriteAsync(
            TelemetryDatabaseFixture.Ctx("ghost", null), "ghost",
            [Row("click"), Row("page_view")], Expiry));

        Assert.Empty(await _fixture.ReadAllAsync(admin));
    }

    [Fact]
    public async Task Writes_every_row_of_a_hundred_event_batch()
    {
        await using var admin = await _adminDataSource.OpenConnectionAsync();
        await _fixture.SeedUserAsync(admin, "u1", "school-1");

        var rows = Enumerable.Range(0, TelemetryBatch.MaxEvents)
            .Select(i => new TelemetryEventRow("click", DateTime.UtcNow.AddMilliseconds(i), null))
            .ToArray();

        await Writer().WriteAsync(TelemetryDatabaseFixture.Ctx("u1", "school-1"), "u1", rows, Expiry);

        Assert.Equal(TelemetryBatch.MaxEvents, await _fixture.CountAsync(admin, "u1"));
    }

    /// <summary>
    /// telemetry.ts:44 — the createMany is inside <c>if (validEvents.length &gt; 0)</c>. The writer holds
    /// the same guard so no caller can turn an all-unknown batch into an opened transaction.
    /// </summary>
    [Fact]
    public async Task An_empty_batch_touches_the_database_not_at_all()
    {
        await using var admin = await _adminDataSource.OpenConnectionAsync();

        // No seeded user: if this opened a session and wrote anything it would fail on the FK instead of
        // returning quietly.
        await Writer().WriteAsync(TelemetryDatabaseFixture.Ctx("nobody", null), "nobody", [], Expiry);

        Assert.Empty(await _fixture.ReadAllAsync(admin));
    }

    // ---- helpers ----

    private static readonly DateTime Expiry = DateTime.UtcNow.AddDays(90);

    private static TelemetryEventRow Row(string type) => new(type, DateTime.UtcNow, null);

    private TelemetryEventWriter Writer() =>
        new(new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()));
}
