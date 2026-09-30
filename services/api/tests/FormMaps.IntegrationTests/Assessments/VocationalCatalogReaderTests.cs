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
        var q2 = await SeedQuestionAsync(conn, instrumentId, number: 2, block: "open", type: "open", order: 1, dimensionId: null, group: null, scaleAnchors: """["own1","own2"]""", area: "interests", options: """[{"value":"a","labelEs":"A"}]""");
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
        Assert.Equal("a", self[1].Options[0].GetProperty("value").GetString()); // options jsonb passthrough
        Assert.Equal(JsonValueKind.Null, self[0].Options.ValueKind);            // null options -> JSON null
        Assert.Equal("Pregunta 2 self", self[1].Text);

        // 'parent': q1 + q2 (both all-groups, no parent variant -> text "") + q3 (parent-specific).
        Assert.Equal(new[] { 1, 2, 3 }, parent.Select(i => i.Number));
        Assert.Equal(string.Empty, parent[0].Text);              // q1: no parent variant
        Assert.Equal(string.Empty, parent[1].Text);              // q2: no parent variant
        Assert.Equal("Pregunta 3 parent", parent[2].Text);       // q3: parent variant
    }

    [Fact]
    public async Task GetQuestionnaire_resolves_english_per_field_with_spanish_fallback()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        var instrumentId = await SeedInstrumentAsync(conn, "v1");
        var d1 = await SeedDimensionAsync(conn, instrumentId, "d1", "Dim1", weight: 1, order: 0,
            scaleAnchors: """["nunca","siempre"]""", scaleAnchorsEn: """["never","always"]""");
        var d2 = await SeedDimensionAsync(conn, instrumentId, "d2", "Dim2", weight: 1, order: 1,
            scaleAnchors: """["bajo","alto"]""");                                    // no English anchors
        // q1: inherits d1 (translated). q2: inherits d2 (untranslated). q3: own Spanish scale, no own English —
        // must NOT borrow d1's English. q4: own scale + own English. q5: options, one label untranslated.
        var q1 = await SeedQuestionAsync(conn, instrumentId, 1, "dimension", "likert", 0, d1, null, null);
        await SeedVariantAsync(conn, q1, "self", "¿Pregunta 1?", "Question 1?");
        var q2 = await SeedQuestionAsync(conn, instrumentId, 2, "dimension", "likert", 1, d2, null, null);
        await SeedVariantAsync(conn, q2, "self", "¿Pregunta 2?");                        // no English text
        var q3 = await SeedQuestionAsync(conn, instrumentId, 3, "group_specific", "likert", 2, d1, null, """["poco","mucho"]""");
        await SeedVariantAsync(conn, q3, "self", "¿Pregunta 3?", "   ");                 // blank English → Spanish
        var q4 = await SeedQuestionAsync(conn, instrumentId, 4, "group_specific", "likert", 3, null, null,
            """["poco","mucho"]""", scaleAnchorsEn: """["a little","a lot"]""");
        await SeedVariantAsync(conn, q4, "self", "¿Pregunta 4?", "Question 4?");
        var q5 = await SeedQuestionAsync(conn, instrumentId, 5, "prioritization", "multi_select", 4, null, null, null,
            options: """[{"value":"a","labelEs":"Uno","labelEn":"One"},{"value":"b","labelEs":"Dos"}]""");
        await SeedVariantAsync(conn, q5, "self", "Selecciona:", "Select:");

        var reader = MakeReader();
        var en = await reader.GetQuestionnaireAsync(Ctx(), "self", "en");
        var es = await reader.GetQuestionnaireAsync(Ctx(), "self");

        Assert.Equal(new[] { "Question 1?", "¿Pregunta 2?", "¿Pregunta 3?", "Question 4?", "Select:" }, en.Select(i => i.Text));
        Assert.Equal(new[] { "¿Pregunta 1?", "¿Pregunta 2?", "¿Pregunta 3?", "¿Pregunta 4?", "Selecciona:" }, es.Select(i => i.Text));
        Assert.Equal(new[] { "never", "always" }, Strings(en[0].ScaleAnchors));
        Assert.Equal(new[] { "bajo", "alto" }, Strings(en[1].ScaleAnchors));
        Assert.Equal(new[] { "poco", "mucho" }, Strings(en[2].ScaleAnchors));   // own Spanish, never d1's English
        Assert.Equal(new[] { "a little", "a lot" }, Strings(en[3].ScaleAnchors));
        Assert.Equal(new[] { "nunca", "siempre" }, Strings(es[0].ScaleAnchors));
        Assert.Equal(new[] { "poco", "mucho" }, Strings(es[3].ScaleAnchors));

        // Options keep value/labelEs/labelEn and gain a resolved label; values and order are untouched.
        Assert.Equal(new[] { "a", "b" }, en[4].Options.EnumerateArray().Select(o => o.GetProperty("value").GetString()));
        Assert.Equal(new[] { "One", "Dos" }, en[4].Options.EnumerateArray().Select(o => o.GetProperty("label").GetString()));
        Assert.Equal(new[] { "Uno", "Dos" }, es[4].Options.EnumerateArray().Select(o => o.GetProperty("label").GetString()));
        Assert.Equal("Uno", en[4].Options[0].GetProperty("labelEs").GetString());
        Assert.Equal("One", es[4].Options[0].GetProperty("labelEn").GetString());
    }

    [Fact]
    public async Task GetInstrument_carries_english_name_and_dimension_anchors()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        var instrumentId = await SeedInstrumentAsync(conn, "v1");
        await using (var cmd = new NpgsqlCommand("""UPDATE "vocational_instruments" SET "nameEn" = 'Test EN' WHERE "id" = @id""", conn))
        {
            cmd.Parameters.AddWithValue("id", instrumentId);
            await cmd.ExecuteNonQueryAsync();
        }

        await SeedDimensionAsync(conn, instrumentId, "d1", "Dim1", 1, 0, """["a1","a2"]""", scaleAnchorsEn: """["e1","e2"]""");
        await SeedDimensionAsync(conn, instrumentId, "d2", "Dim2", 1, 1, """["b1","b2"]""");

        var dto = await MakeReader().GetInstrumentAsync(Ctx());

        Assert.Equal("Test EN", dto!.NameEn);
        Assert.Equal("Dim EN", dto.Dimensions[0].NameEn);
        Assert.Equal(new[] { "e1", "e2" }, Strings(dto.Dimensions[0].ScaleAnchorsEn));
        Assert.Equal(JsonValueKind.Null, dto.Dimensions[1].ScaleAnchorsEn.ValueKind);
    }

    private static string?[] Strings(JsonElement array) => array.EnumerateArray().Select(e => e.GetString()).ToArray();

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
        NpgsqlConnection conn, string instrumentId, string key, string nameEs, int weight, int order, string scaleAnchors,
        string? scaleAnchorsEn = null)
    {
        var id = "vd-" + Guid.NewGuid().ToString("N");
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "vocational_dimensions" ("id","instrumentId","key","nameEs","nameEn","weight","scaleAnchors","scaleAnchorsEn","order")
            VALUES (@id, @inst, @key, @nameEs, 'Dim EN', @weight, @scale::jsonb, @scaleEn::jsonb, @order)
            """, conn);
        cmd.Parameters.AddWithValue("scaleEn", (object?)scaleAnchorsEn ?? DBNull.Value);
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
        string? dimensionId, string? group, string? scaleAnchors, string? area = null, string? options = null,
        string? scaleAnchorsEn = null)
    {
        var id = "vq-" + Guid.NewGuid().ToString("N");
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "vocational_questions"
                ("id","instrumentId","dimensionId","block","number","type","area","scaleAnchors","scaleAnchorsEn","options","group","order")
            VALUES (@id, @inst, @dim, @block, @number, @type, @area, @scale::jsonb, @scaleEn::jsonb, @options::jsonb, @group, @order)
            """, conn);
        cmd.Parameters.AddWithValue("scaleEn", (object?)scaleAnchorsEn ?? DBNull.Value);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("inst", instrumentId);
        cmd.Parameters.AddWithValue("dim", (object?)dimensionId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("block", block);
        cmd.Parameters.AddWithValue("number", number);
        cmd.Parameters.AddWithValue("type", type);
        cmd.Parameters.AddWithValue("area", (object?)area ?? DBNull.Value);
        cmd.Parameters.AddWithValue("scale", (object?)scaleAnchors ?? DBNull.Value);
        cmd.Parameters.AddWithValue("options", (object?)options ?? DBNull.Value);
        cmd.Parameters.AddWithValue("group", (object?)group ?? DBNull.Value);
        cmd.Parameters.AddWithValue("order", order);
        await cmd.ExecuteNonQueryAsync();
        return id;
    }

    private static async Task SeedVariantAsync(NpgsqlConnection conn, string questionId, string group, string textEs, string? textEn = null)
    {
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "vocational_question_variants" ("id","questionId","group","textEs","textEn","isActive")
            VALUES (@id, @qid, @group, @textEs, @textEn, true)
            """, conn);
        cmd.Parameters.AddWithValue("textEn", (object?)textEn ?? DBNull.Value);
        cmd.Parameters.AddWithValue("id", Guid.NewGuid().ToString());
        cmd.Parameters.AddWithValue("qid", questionId);
        cmd.Parameters.AddWithValue("group", group);
        cmd.Parameters.AddWithValue("textEs", textEs);
        await cmd.ExecuteNonQueryAsync();
    }
}
