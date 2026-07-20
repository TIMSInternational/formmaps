using System.Text.Json;
using FormMaps.Application.Assessments;

namespace FormMaps.UnitTests.Assessments;

/// <summary>
/// Unit pins for <see cref="ProctoringViolations"/> (port of lib/proctoring.ts) — the bound (cap 200 + field
/// defaults + length slices) and merge (existing verbatim + incoming, cap 500, flag ≥ 3) logic behind the
/// external evaluator violations flush.
/// </summary>
public sealed class ProctoringViolationsTests
{
    private const string DefaultTs = "2026-01-01T00:00:00.000Z";

    [Fact]
    public void Bound_non_array_is_empty()
    {
        Assert.Empty(ProctoringViolations.Bound(Json("{}"), DefaultTs));
        Assert.Empty(ProctoringViolations.Bound(Json("null"), DefaultTs));
    }

    [Fact]
    public void Bound_applies_field_defaults()
    {
        var result = ProctoringViolations.Bound(Json("[{}]"), DefaultTs);
        Assert.Single(result);
        Assert.Equal("unknown", result[0].Type);
        Assert.Equal(DefaultTs, result[0].Timestamp);
        Assert.Equal(string.Empty, result[0].Details);
    }

    [Fact]
    public void Bound_coerces_and_slices()
    {
        var longType = new string('t', 100);
        var raw = $$"""[{"type":"{{longType}}","timestamp":"ts","details":42}]""";
        var result = ProctoringViolations.Bound(Json(raw), DefaultTs);
        Assert.Equal(50, result[0].Type.Length);      // sliced to 50
        Assert.Equal("42", result[0].Details);        // String(number)
    }

    [Fact]
    public void Bound_caps_at_200_per_request()
    {
        var items = string.Join(",", Enumerable.Range(0, 250).Select(_ => "{\"type\":\"x\"}"));
        var result = ProctoringViolations.Bound(Json($"[{items}]"), DefaultTs);
        Assert.Equal(200, result.Count);
    }

    [Fact]
    public void Merge_appends_incoming_after_existing_and_flags_at_threshold()
    {
        var existing = Json("""[{"type":"a"},{"type":"b"}]""");
        var incoming = ProctoringViolations.Bound(Json("""[{"type":"c"}]"""), DefaultTs);
        var merge = ProctoringViolations.Merge(existing, incoming);
        Assert.Equal(3, merge.Count);
        Assert.True(merge.Flag);                       // >= 3
        Assert.Equal("a", merge.All[0]!["type"]!.GetValue<string>());
        Assert.Equal("c", merge.All[2]!["type"]!.GetValue<string>());
    }

    [Fact]
    public void Merge_below_threshold_does_not_flag()
    {
        var incoming = ProctoringViolations.Bound(Json("""[{"type":"a"},{"type":"b"}]"""), DefaultTs);
        var merge = ProctoringViolations.Merge(existing: null, incoming);
        Assert.Equal(2, merge.Count);
        Assert.False(merge.Flag);
    }

    [Fact]
    public void Merge_caps_stored_at_500()
    {
        var existingItems = string.Join(",", Enumerable.Range(0, 499).Select(_ => "{\"type\":\"x\"}"));
        var existing = Json($"[{existingItems}]");
        var incoming = ProctoringViolations.Bound(Json("""[{"type":"a"},{"type":"b"},{"type":"c"}]"""), DefaultTs);
        var merge = ProctoringViolations.Merge(existing, incoming);
        Assert.Equal(500, merge.Count);
    }

    private static JsonElement Json(string json)
    {
        using var doc = JsonDocument.Parse(json);
        return doc.RootElement.Clone();
    }
}
