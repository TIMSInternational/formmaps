using System.Text.Json;
using FormMaps.Application.Auth;
using FormMaps.Infrastructure.Assessments;
using FormMaps.Infrastructure.Data;
using Npgsql;

namespace FormMaps.IntegrationTests.Assessments;

/// <summary>
/// Real-DB (Testcontainers) tests for <see cref="VocationalReader"/> — the persisted vocational result reads
/// (legacy getVocationalResult / getIntegratedResult). Pins: never_computed (no active instrument OR no row),
/// composite/scores as JSON numbers, jsonb passthrough with the stored camelCase inner keys, and ISO-Z
/// computedAt.
/// </summary>
public sealed class VocationalReaderTests : IClassFixture<VocationalWriteDatabaseFixture>, IAsyncLifetime
{
    private readonly VocationalWriteDatabaseFixture _fixture;
    private NpgsqlDataSource _dataSource = null!;

    public VocationalReaderTests(VocationalWriteDatabaseFixture fixture) => _fixture = fixture;

    public async Task InitializeAsync()
    {
        _dataSource = NpgsqlDataSource.Create(_fixture.ConnectionString);
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand(
            """TRUNCATE "vocational_instruments","vocational_results","vocational_integrated_results" CASCADE""", conn);
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task DisposeAsync() => await _dataSource.DisposeAsync();

    [Fact]
    public async Task GetScore_with_no_active_instrument_is_never_computed()
    {
        var reader = MakeReader();
        Assert.Null(await reader.GetScoreAsync(Ctx("u1"), "u1"));
    }

    [Fact]
    public async Task GetScore_with_no_row_is_never_computed()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedInstrumentAsync(conn, "v1");
        var reader = MakeReader();
        Assert.Null(await reader.GetScoreAsync(Ctx("u1"), "u1"));
    }

    [Fact]
    public async Task GetScore_serializes_composite_as_number_and_jsonb_camelCase_verbatim()
    {
        var userId = "u-" + Guid.NewGuid().ToString("N");
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedInstrumentAsync(conn, "v1");
        await SeedScoreRowAsync(conn, userId, "v1");

        var result = await MakeReader().GetScoreAsync(Ctx(userId), userId);

        Assert.NotNull(result);
        Assert.Equal("ready", result!.Status);
        Assert.Equal(userId, result.EvaluatedUserId);
        Assert.Equal("v1", result.InstrumentVersion);
        Assert.Equal(75d, result.Composite);                 // numeric
        Assert.Equal("moderateHigh", result.Band);
        Assert.Equal(2, result.RespondentCount);
        Assert.Equal(new[] { "self", "parent" }, result.GroupsIncluded);
        Assert.Equal("2026-06-15T12:34:56.789Z", result.ComputedAt);

        // jsonb passthrough keeps the stored camelCase inner keys.
        var d0 = result.DimensionScores[0];
        Assert.Equal("Dim1", d0.GetProperty("nameEs").GetString());
        Assert.Equal(100d, d0.GetProperty("byGroup").GetProperty("self").GetDouble());
        Assert.Equal(0.5d, result.WeightsApplied.GetProperty("self").GetDouble());
        Assert.True(result.Rankings.TryGetProperty("interests", out _));
    }

    [Fact]
    public async Task GetScore_reads_a_fractional_composite_as_a_number()
    {
        // Guards against a Decimal->int/rounding regression on real (fractional) computed scores.
        var userId = "u-" + Guid.NewGuid().ToString("N");
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedInstrumentAsync(conn, "v1");
        await SeedScoreRowAsync(conn, userId, "v1", composite: 62.5m);

        var result = await MakeReader().GetScoreAsync(Ctx(userId), userId);

        Assert.Equal(62.5d, result!.Composite);
    }

    [Fact]
    public async Task GetIntegrated_with_no_active_instrument_is_never_computed()
    {
        Assert.Null(await MakeReader().GetIntegratedAsync(Ctx("u1"), "u1"));
    }

    [Fact]
    public async Task GetIntegrated_serializes_all_four_scores_as_numbers()
    {
        var userId = "u-" + Guid.NewGuid().ToString("N");
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedInstrumentAsync(conn, "v1");
        await SeedIntegratedRowAsync(conn, userId, "v1");

        var result = await MakeReader().GetIntegratedAsync(Ctx(userId), userId);

        Assert.NotNull(result);
        Assert.Equal("ready", result!.Status);
        Assert.Equal(70d, result.IntegratedComposite);
        Assert.Equal("moderateHigh", result.Band);
        Assert.Equal(75d, result.ThreeSixtyScore);
        Assert.Equal(60d, result.PcaScore);
        Assert.Equal(80d, result.MilScore);
        Assert.Equal(1d, result.WeightsApplied.GetProperty("threeSixty").GetDouble());
        Assert.Equal("2026-06-15T12:34:56.789Z", result.ComputedAt);
    }

    [Fact]
    public async Task GetIntegrated_with_no_row_is_never_computed()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedInstrumentAsync(conn, "v1");
        Assert.Null(await MakeReader().GetIntegratedAsync(Ctx("u1"), "u1"));
    }

    // ========================================================================= helpers

    private VocationalReader MakeReader() =>
        new(new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()));

    private static RequestContext Ctx(string userId) =>
        RequestContext.Authenticated(
            new RequestActor(userId, "counselor", $"{userId}@e.st", "Test User"),
            schoolId: null, permissions: Array.Empty<string>(),
            tokenSource: TokenSource.DevelopmentHeader, isDevelopmentOverride: true);

    private static async Task SeedInstrumentAsync(NpgsqlConnection conn, string version)
    {
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "vocational_instruments" ("id","version","name","status","isActive")
            VALUES (@id, @version, 'Test', 'active', true)
            """, conn);
        cmd.Parameters.AddWithValue("id", Guid.NewGuid().ToString());
        cmd.Parameters.AddWithValue("version", version);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task SeedScoreRowAsync(NpgsqlConnection conn, string userId, string version, decimal composite = 75m)
    {
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "vocational_results"
                ("id","evaluatedUserId","instrumentVersion","composite","band","respondentCount",
                 "groupsIncluded","dimensionScores","rankings","weightsApplied","computedAt")
            VALUES (@id, @uid, @version, @composite, 'moderateHigh', 2, @groups,
                    @dims::jsonb, @rankings::jsonb, @weights::jsonb, TIMESTAMP '2026-06-15 12:34:56.789')
            """, conn);
        cmd.Parameters.AddWithValue("id", Guid.NewGuid().ToString());
        cmd.Parameters.AddWithValue("uid", userId);
        cmd.Parameters.AddWithValue("version", version);
        cmd.Parameters.AddWithValue("composite", composite);
        cmd.Parameters.AddWithValue("groups", new[] { "self", "parent" });
        cmd.Parameters.AddWithValue("dims", """[{"key":"d1","nameEs":"Dim1","score":75,"band":"moderateHigh","byGroup":{"self":100,"parent":50}}]""");
        cmd.Parameters.AddWithValue("rankings", """{"interests":[],"industries":[],"workType":null,"openInsights":[]}""");
        cmd.Parameters.AddWithValue("weights", """{"self":0.5,"parent":0.5}""");
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task SeedIntegratedRowAsync(NpgsqlConnection conn, string userId, string version)
    {
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "vocational_integrated_results"
                ("id","evaluatedUserId","instrumentVersion","integratedComposite","band",
                 "threeSixtyScore","pcaScore","milScore","weightsApplied","computedAt")
            VALUES (@id, @uid, @version, 70, 'moderateHigh', 75, 60, 80, @weights::jsonb,
                    TIMESTAMP '2026-06-15 12:34:56.789')
            """, conn);
        cmd.Parameters.AddWithValue("id", Guid.NewGuid().ToString());
        cmd.Parameters.AddWithValue("uid", userId);
        cmd.Parameters.AddWithValue("version", version);
        cmd.Parameters.AddWithValue("weights", """{"threeSixty":1,"pca":0,"mil":0}""");
        await cmd.ExecuteNonQueryAsync();
    }
}
