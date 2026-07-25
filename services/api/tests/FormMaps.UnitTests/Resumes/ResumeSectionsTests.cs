using System.Text.Json;
using System.Text.Json.Nodes;
using FormMaps.Application.Resumes;

namespace FormMaps.UnitTests.Resumes;

/// <summary>
/// Pure resume-section helpers (FM-DOTNET-089) — parity with routes/resume.ts. Pins the reorder map+filter (drop
/// not-found ids, drop sections not named in the order, preserve duplicates), append, delete-by-id, the
/// sectionOrder array gate (string-only extraction), and the new-section build (type allowlist→custom,
/// title string-slice-200 else "New Section", items array-slice-100 else []).
/// </summary>
public sealed class ResumeSectionsTests
{
    private const string Three = """[{"id":"a","title":"A"},{"id":"b","title":"B"},{"id":"c","title":"C"}]""";

    private static string[] Ids(string json) =>
        (JsonNode.Parse(json) as JsonArray)!.Select(n => n!["id"]!.GetValue<string>()).ToArray();

    private static JsonElement Body(string json) => JsonDocument.Parse(json).RootElement.Clone();

    // ---- Reorder ----

    [Fact]
    public void Reorder_reorders_by_id() =>
        Assert.Equal(["c", "a", "b"], Ids(ResumeSections.Reorder(Three, ["c", "a", "b"])));

    [Fact]
    public void Reorder_drops_ids_not_found() =>
        Assert.Equal(["a", "b"], Ids(ResumeSections.Reorder(Three, ["a", "zzz", "b"])));

    [Fact]
    public void Reorder_drops_sections_not_in_the_order() =>
        Assert.Equal(["b"], Ids(ResumeSections.Reorder(Three, ["b"]))); // a and c are lost — faithful to legacy

    [Fact]
    public void Reorder_preserves_duplicate_ids() =>
        Assert.Equal(["a", "a"], Ids(ResumeSections.Reorder(Three, ["a", "a"])));

    [Fact]
    public void Reorder_empty_order_is_empty() =>
        Assert.Empty(Ids(ResumeSections.Reorder(Three, [])));

    [Fact]
    public void Reorder_null_sections_is_empty() =>
        Assert.Empty(Ids(ResumeSections.Reorder(null, ["a"])));

    // ---- Append ----

    [Fact]
    public void Append_adds_to_existing()
    {
        var result = ResumeSections.Append(Three, """{"id":"d","title":"D"}""");
        Assert.Equal(["a", "b", "c", "d"], Ids(result));
    }

    [Fact]
    public void Append_to_null_yields_single()
    {
        var result = ResumeSections.Append(null, """{"id":"d"}""");
        Assert.Equal(["d"], Ids(result));
    }

    // ---- Delete ----

    [Fact]
    public void Delete_removes_matching_id() =>
        Assert.Equal(["a", "c"], Ids(ResumeSections.Delete(Three, "b")));

    [Fact]
    public void Delete_no_match_keeps_all() =>
        Assert.Equal(["a", "b", "c"], Ids(ResumeSections.Delete(Three, "zzz")));

    // ---- IsCorruptSections (legacy (sections as [])||[] then .map/.push/.filter) ----

    [Theory]
    [InlineData("{}", true)]              // object → .map/.push throws → 500
    [InlineData("\"x\"", true)]           // non-empty string → throws
    [InlineData("5", true)]               // non-zero number → throws
    [InlineData("true", true)]            // true → throws
    [InlineData("[]", false)]             // array → fine
    [InlineData("""[{"id":"a"}]""", false)]
    [InlineData("null", false)]           // jsonb null → [] (falsy)
    [InlineData("\"\"", false)]           // "" falsy → []
    [InlineData("0", false)]              // 0 falsy → []
    [InlineData("false", false)]          // false falsy → []
    [InlineData(null, false)]             // SQL NULL → []
    public void IsCorruptSections_matches_legacy_throw(string? json, bool expected) =>
        Assert.Equal(expected, ResumeSections.IsCorruptSections(json));

    // ---- TryReadSectionOrder ----

    [Fact]
    public void SectionOrder_array_of_strings()
    {
        Assert.True(ResumeSections.TryReadSectionOrder(Body("""{"sectionOrder":["x","y"]}"""), out var order));
        Assert.Equal(["x", "y"], order);
    }

    [Fact]
    public void SectionOrder_keeps_only_strings()
    {
        Assert.True(ResumeSections.TryReadSectionOrder(Body("""{"sectionOrder":["x",1,"y",true]}"""), out var order));
        Assert.Equal(["x", "y"], order); // non-strings dropped (never === a string id)
    }

    [Theory]
    [InlineData("""{"sectionOrder":"nope"}""")]
    [InlineData("""{"sectionOrder":123}""")]
    [InlineData("{}")]
    [InlineData("[]")]
    public void SectionOrder_non_array_is_false(string json) =>
        Assert.False(ResumeSections.TryReadSectionOrder(Body(json), out _));

    // ---- BuildSection ----

    [Fact]
    public void BuildSection_allowed_type_kept()
    {
        var node = JsonNode.Parse(ResumeSections.BuildSection(Body("""{"type":"education","title":"School","items":[1,2]}"""), "id-1"))!;
        Assert.Equal("id-1", node["id"]!.GetValue<string>());
        Assert.Equal("education", node["type"]!.GetValue<string>());
        Assert.Equal("School", node["title"]!.GetValue<string>());
        Assert.Equal(2, node["items"]!.AsArray().Count);
    }

    [Fact]
    public void BuildSection_unknown_type_becomes_custom()
    {
        var node = JsonNode.Parse(ResumeSections.BuildSection(Body("""{"type":"bogus"}"""), "id-1"))!;
        Assert.Equal("custom", node["type"]!.GetValue<string>());
        Assert.Equal("New Section", node["title"]!.GetValue<string>()); // non-string title default
        Assert.Empty(node["items"]!.AsArray());                          // non-array items → []
    }

    [Fact]
    public void BuildSection_title_sliced_to_200()
    {
        var node = JsonNode.Parse(ResumeSections.BuildSection(Body($$"""{"title":"{{new string('t', 300)}}"}"""), "id-1"))!;
        Assert.Equal(200, node["title"]!.GetValue<string>().Length);
    }

    [Fact]
    public void BuildSection_items_capped_at_100()
    {
        var items = string.Join(",", Enumerable.Range(0, 150));
        var node = JsonNode.Parse(ResumeSections.BuildSection(Body($$"""{"items":[{{items}}]}"""), "id-1"))!;
        Assert.Equal(100, node["items"]!.AsArray().Count);
    }
}
