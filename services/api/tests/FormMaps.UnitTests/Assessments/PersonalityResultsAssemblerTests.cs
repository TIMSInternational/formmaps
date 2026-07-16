using System.Text.Json;
using FormMaps.Application.Assessments;

namespace FormMaps.UnitTests.Assessments;

/// <summary>
/// Pins the pure personality results assembly (legacy buildResults, personality-session-service.ts):
/// user_name coalesce, variant/language normalization, dimension_scores reordered to [EI,SN,TF,JP]
/// with missing dropped, stored dimensionScores echoed verbatim, the localized profile, ISO
/// timestamps, and violation count.
/// </summary>
public class PersonalityResultsAssemblerTests
{
    private static JsonElement Json(string raw)
    {
        using var doc = JsonDocument.Parse(raw);
        return doc.RootElement.Clone();
    }

    private static string Dim(string d, string pole) =>
        $$"""{"dimension":"{{d}}","firstCount":6,"secondCount":4,"winningPole":"{{pole}}","intensity":6,"answered":10,"maxPerDimension":10,"normalizedIntensity":60,"balanced":false}""";

    private static readonly JsonElement EmptyArray = Json("[]");

    private static PersonalityResults Build(
        string? userName = "Ada Lovelace",
        string? userEmail = "ada@example.test",
        string variant = "estudiantil",
        string? language = "es",
        string? resolvedType = "ISTP",
        JsonElement? dimensionScores = null,
        JsonElement? violations = null,
        DateTime? startedAt = null,
        DateTime? completedAt = null,
        bool flagForReview = false)
    {
        return PersonalityResultsAssembler.Build(
            sessionId: "sess-1",
            userName: userName,
            userEmail: userEmail,
            variantRaw: variant,
            sessionLanguage: language,
            resolvedType: resolvedType,
            dimensionScores: dimensionScores ?? Json($"{{{string.Join(",", $"\"EI\":{Dim("EI", "I")}", $"\"SN\":{Dim("SN", "S")}", $"\"TF\":{Dim("TF", "T")}", $"\"JP\":{Dim("JP", "P")}")}}}"),
            violations: violations ?? EmptyArray,
            flagForReview: flagForReview,
            startedAt: startedAt,
            completedAt: completedAt);
    }

    [Theory]
    [InlineData("Ada Lovelace", "ada@example.test", "Ada Lovelace")]
    [InlineData("", "ada@example.test", "ada@example.test")]
    [InlineData(null, "ada@example.test", "ada@example.test")]
    [InlineData(null, null, "")]
    public void UserName_coalesces_name_then_email_then_empty(string? name, string? email, string expected)
    {
        Assert.Equal(expected, Build(userName: name, userEmail: email).UserName);
    }

    [Theory]
    [InlineData("laboral", "laboral")]
    [InlineData("estudiantil", "estudiantil")]
    [InlineData("something", "estudiantil")]
    [InlineData(null, "estudiantil")]
    public void Variant_normalizes(string? raw, string expected)
    {
        Assert.Equal(expected, Build(variant: raw!).Variant);
    }

    [Theory]
    [InlineData("en", "en")]
    [InlineData("es", "es")]
    [InlineData("fr", "es")]
    [InlineData(null, "es")]
    public void Language_normalizes(string? raw, string expected)
    {
        Assert.Equal(expected, Build(language: raw).Language);
    }

    [Fact]
    public void Type_echoed_and_profile_localized_to_language()
    {
        var es = Build(resolvedType: "ISTP", language: "es");
        Assert.Equal("ISTP", es.Type);
        Assert.Equal("ISTP", es.Profile.Type);
        Assert.Equal("El Técnico Resolutivo", es.Profile.Alias);

        var en = Build(resolvedType: "ISTP", language: "en");
        Assert.Equal("The Resolute Technician", en.Profile.Alias);
    }

    [Fact]
    public void DimensionScores_reordered_to_canonical_order_missing_dropped()
    {
        // Stored out of order (JP first) and missing SN -> array is [EI, TF, JP].
        var stored = Json($"{{{string.Join(",", $"\"JP\":{Dim("JP", "P")}", $"\"TF\":{Dim("TF", "T")}", $"\"EI\":{Dim("EI", "I")}")}}}");
        var result = Build(dimensionScores: stored);

        Assert.Equal(3, result.DimensionScores.Count);
        Assert.Equal(
            new[] { "EI", "TF", "JP" },
            result.DimensionScores.Select(d => d.GetProperty("dimension").GetString()).ToArray());
    }

    [Fact]
    public void Score_dimensions_is_stored_object_passthrough()
    {
        var result = Build();
        Assert.Equal("estudiantil", result.Score.Variant);
        Assert.Equal("ISTP", result.Score.Type);
        Assert.Equal(JsonValueKind.Object, result.Score.Dimensions.ValueKind);
        // camelCase stored keys preserved verbatim.
        Assert.Equal("I", result.Score.Dimensions.GetProperty("EI").GetProperty("winningPole").GetString());
        Assert.Equal(60, result.Score.Dimensions.GetProperty("EI").GetProperty("normalizedIntensity").GetInt32());
    }

    [Fact]
    public void Violation_count_and_flag_and_timestamps()
    {
        var violations = Json("""[{"type":"blur"},{"type":"tab"}]""");
        var result = Build(
            violations: violations,
            flagForReview: true,
            startedAt: new DateTime(2026, 7, 16, 1, 2, 3, 4, DateTimeKind.Utc),
            completedAt: new DateTime(2026, 7, 16, 12, 0, 0, 0, DateTimeKind.Utc));

        Assert.Equal(2, result.ViolationCount);
        Assert.True(result.FlagForReview);
        Assert.Equal("2026-07-16T01:02:03.004Z", result.StartedAt);
        Assert.Equal("2026-07-16T12:00:00.000Z", result.CompletedAt);
    }

    [Fact]
    public void Null_timestamps_are_null()
    {
        var result = Build(startedAt: null, completedAt: null);
        Assert.Null(result.StartedAt);
        Assert.Null(result.CompletedAt);
    }

    [Fact]
    public void Score_dimensions_passes_through_non_object_verbatim()
    {
        // Legacy `session.dimensionScores ?? {}` only coalesces null — an array jsonb stays an array
        // in score.dimensions (NOT coerced to {}). dimension_scores lookups then find nothing -> [].
        var result = Build(dimensionScores: Json("[]"));
        Assert.Equal(JsonValueKind.Array, result.Score.Dimensions.ValueKind);
        Assert.Empty(result.DimensionScores);
    }

    [Fact]
    public void DimensionScores_drops_falsy_values_like_filter_boolean()
    {
        // Legacy DIMENSIONS.map(d=>storedDims[d]).filter(Boolean): null/false/0 are falsy and dropped;
        // only the JP object survives.
        var stored = Json($$"""{"EI":null,"SN":false,"TF":0,"JP":{{Dim("JP", "P")}}}""");
        var result = Build(dimensionScores: stored);
        Assert.Single(result.DimensionScores);
        Assert.Equal("JP", result.DimensionScores[0].GetProperty("dimension").GetString());
    }
}
