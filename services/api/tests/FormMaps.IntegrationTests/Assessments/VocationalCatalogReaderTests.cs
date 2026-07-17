using System.Text.Json;
using FormMaps.Application.Auth;
using FormMaps.Infrastructure.Assessments;
using FormMaps.Infrastructure.Data;
using Npgsql;

namespace FormMaps.IntegrationTests.Assessments;

/// <summary>
/// Real-DB (Testcontainers) tests for the vocational catalog reads (legacy getInstrument / getQuestionnaire).
/// Pins: active instrument + ordered dimensions (weight as number, jsonb passthrough), null when none active;
/// and the questionnaire — group filtering (question.group null = all), the dimension join (key + fallback
/// scaleAnchors), the own-vs-inherited scaleAnchors precedence, and the group text variant.
/// </summary>
public sealed class VocationalCatalogReaderTests : IClassFixture<VocationalWriteDatabaseFixture>, IAsyncLifetime
{
    private readonly VocationalWriteDatabaseFixture _fixture;
    private NpgsqlDataSource _dataSource = null!;

    public VocationalCatalogReaderTests(VocationalWriteDatabaseFixture fixture) => _fixture = fixture;

    public async Task InitializeAsync()
    {
        _dataSource = NpgsqlDataSource.Create(_fixture.ConnectionString);
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand(
            """TRUNCATE "vocational_instruments","vocational_dimensions","vocational_questions","vocational_question_variants" CASCADE""",
            conn);
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task DisposeAsync() => await _dataSource.DisposeAsync();

    [Fact]
    public async Task GetInstrument_returns_null_when_none_active()
    {
        Assert.Null(await MakeReader().GetInstrumentAsync(Ctx()));
    }

    [Fact]
    public async Task GetInstrument_returns_the_active_instrument_with_ordered_dimensions()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        var instrumentId = await SeedInstrumentAsync(conn, "v1");
        await SeedDimensionAsync(conn, instrumentId, "d2", "Dim2", weight: 2, order: 1, scaleAnchors: """["b1","b2"]""");
        await SeedDimensionAsync(conn, instrumentId, "d1", "Dim1", weight: 1, order: 0, scaleAnchors: """["a1","a2"]""");

        var dto = await MakeReader().GetInstrumentAsync(Ctx());

        Assert.NotNull(dto);
        Assert.Equal("v1", dto!.Version);
        Assert.Equal("Test", dto.Name);
        Assert.Equal(1d, dto.GroupWeights.GetProperty("self").GetDouble());   // jsonb passthrough
        Assert.Equal(2, dto.Dimensions.Count);
        Assert.Equal("d1", dto.Dimensions[0].Key);                            // order asc
        Assert.Equal("d2", dto.Dimensions[1].Key);
        Assert.Equal(1d, dto.Dimensions[0].Weight);                           // Decimal -> number
        Assert.Equal("a1", dto.Dimensions[0].ScaleAnchors[0].GetString());
    }

    [Fact]
    public async Task GetQuestionnaire_filters_by_group_joins_dimension_and_variant()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        var instrumentId = await SeedInstrumentAsync(conn, "v1");
        var d1 = await SeedDimensionAsync(conn, instrumentId, "d1", "Dim1", weight: 1, order: 0, scaleAnchors: """["low","high"]""");
        // q1: dimension question, inherits d1's scaleAnchors (own null), all groups.
        var q1 = await SeedQuestionAsync(conn, instrumentId, number: 1, block: "dimension", type: "likert", order: 0, dimensionId: d1, group: null, scaleAnchors: null);
        await SeedVariantAsync(conn, q1, "self", "Pregunta 1 self");
        // q2: open question, OWN scaleAnchors, no dimension, all groups.
        var q2 = await SeedQuestionAsync(conn, instrumentId, number: 2, block: "open", type: "open", order: 1, dimensionId: null, group: null, scaleAnchors: """["own1","own2"]""", area: "interests");
        await SeedVariantAsync(conn, q2, "self", "Pregunta 2 self");
        // q3: group-specific to 'parent' — excluded for 'self'.
        var q3 = await SeedQuestionAsync(conn, instrumentId, number: 3, block: "group_specific", type: "likert", order: 2, dimensionId: d1, group: "parent", scaleAnchors: null);
        await SeedVariantAsync(conn, q3, "parent", "Pregunta 3 parent");

        var reader = MakeReader();
        var self = await reader.GetQuestionnaireAsync(Ctx(), "self");
        var parent = await reader.GetQuestionnaireAsync(Ctx(), "parent");

        // 'self': q1 + q2 (q3 is parent-only), ordered.
        Assert.Equal(new[] { 1, 2 }, self.Select(i => i.Number));
        Assert.Equal("d1", self[0].DimensionKey);
        Assert.Equal("low", self[0].ScaleAnchors[0].GetString());   // inherited from the dimension
        Assert.Equal("Pregunta 1 self", self[0].Text);
        Assert.Null(self[1].DimensionKey);
        Assert.Equal("interests", self[1].Area);
        Assert.Equal("own1", self[1].ScaleAnchors[0].GetString());  // own overrides inherited
        Assert.Equal("Pregunta 2 self", self[1].Text);

        // 'parent': q1 + q2 (both all-groups, no parent variant -> text "") + q3 (parent-specific).
        Assert.Equal(new[] { 1, 2, 3 }, parent.Select(i => i.Number));
        Assert.Equal(string.Empty, parent[0].Text);              // q1: no parent variant
        Assert.Equal(string.Empty, parent[1].Text);              // q2: no parent variant
        Assert.Equal("Pregunta 3 parent", parent[2].Text);       // q3: parent variant
    }

    // ========================================================================= helpers

    private VocationalReader MakeReader() =>
        new(new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()));

    private static RequestContext Ctx() =>
        RequestContext.Authenticated(
            new RequestActor("u1", "student", "u1@e.st", "Test User"),
            schoolId: null, permissions: Array.Empty<string>(),
            tokenSource: TokenSource.DevelopmentHeader, isDevelopmentOverride: true);

    private static async Task<string> SeedInstrumentAsync(NpgsqlConnection conn, string version)
    {
        var id = "vi-" + Guid.NewGuid().ToString("N");
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "vocational_instruments" ("id","version","name","status","groupWeights","isActive")
            VALUES (@id, @version, 'Test', 'active', @gw::jsonb, true)
            """, conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("version", version);
        cmd.Parameters.AddWithValue("gw", """{"self":1,"parent":1,"teacher":1,"sibling_friend":1}""");
        await cmd.ExecuteNonQueryAsync();
        return id;
    }

    private static async Task<string> SeedDimensionAsync(
        NpgsqlConnection conn, string instrumentId, string key, string nameEs, int weight, int order, string scaleAnchors)
    {
        var id = "vd-" + Guid.NewGuid().ToString("N");
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "vocational_dimensions" ("id","instrumentId","key","nameEs","nameEn","weight","scaleAnchors","order")
            VALUES (@id, @inst, @key, @nameEs, 'Dim EN', @weight, @scale::jsonb, @order)
            """, conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("inst", instrumentId);
        cmd.Parameters.AddWithValue("key", key);
        cmd.Parameters.AddWithValue("nameEs", nameEs);
        cmd.Parameters.AddWithValue("weight", weight);
        cmd.Parameters.AddWithValue("scale", scaleAnchors);
        cmd.Parameters.AddWithValue("order", order);
        await cmd.ExecuteNonQueryAsync();
        return id;
    }

    private static async Task<string> SeedQuestionAsync(
        NpgsqlConnection conn, string instrumentId, int number, string block, string type, int order,
        string? dimensionId, string? group, string? scaleAnchors, string? area = null)
    {
        var id = "vq-" + Guid.NewGuid().ToString("N");
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "vocational_questions"
                ("id","instrumentId","dimensionId","block","number","type","area","scaleAnchors","group","order")
            VALUES (@id, @inst, @dim, @block, @number, @type, @area, @scale::jsonb, @group, @order)
            """, conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("inst", instrumentId);
        cmd.Parameters.AddWithValue("dim", (object?)dimensionId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("block", block);
        cmd.Parameters.AddWithValue("number", number);
        cmd.Parameters.AddWithValue("type", type);
        cmd.Parameters.AddWithValue("area", (object?)area ?? DBNull.Value);
        cmd.Parameters.AddWithValue("scale", (object?)scaleAnchors ?? DBNull.Value);
        cmd.Parameters.AddWithValue("group", (object?)group ?? DBNull.Value);
        cmd.Parameters.AddWithValue("order", order);
        await cmd.ExecuteNonQueryAsync();
        return id;
    }

    private static async Task SeedVariantAsync(NpgsqlConnection conn, string questionId, string group, string textEs)
    {
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "vocational_question_variants" ("id","questionId","group","textEs","isActive")
            VALUES (@id, @qid, @group, @textEs, true)
            """, conn);
        cmd.Parameters.AddWithValue("id", Guid.NewGuid().ToString());
        cmd.Parameters.AddWithValue("qid", questionId);
        cmd.Parameters.AddWithValue("group", group);
        cmd.Parameters.AddWithValue("textEs", textEs);
        await cmd.ExecuteNonQueryAsync();
    }
}
