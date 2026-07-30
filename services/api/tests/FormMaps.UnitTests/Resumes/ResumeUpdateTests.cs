using System.Text.Json;
using FormMaps.Application.Resumes;

namespace FormMaps.UnitTests.Resumes;

public sealed class ResumeUpdateTests
{
    private static JsonElement J(string json) => JsonDocument.Parse(json).RootElement.Clone();

    [Fact]
    public void ResolveFields_only_includes_keys_present_in_body()
    {
        var fields = ResumeUpdate.ResolveFields(J("""{"name":"New Name","unrelatedKey":"ignored"}"""));
        Assert.Single(fields);
        Assert.Equal("New Name", fields["name"].GetString());
    }

    [Fact]
    public void ResolveFields_empty_body_yields_no_fields()
    {
        Assert.Empty(ResumeUpdate.ResolveFields(J("{}")));
    }

    [Fact]
    public void ResolveFields_includes_all_ten_whitelisted_keys_when_present()
    {
        var body = J("""
            {"name":"n","template":"t","careerField":"c","personalInfo":{},"experience":[],
             "education":[],"skills":[],"sections":[],"fieldVisibility":{},"customFields":[]}
            """);
        Assert.Equal(10, ResumeUpdate.ResolveFields(body).Count);
    }

    [Fact]
    public void SanitizeDocumentEdits_absent_key_returns_null()
    {
        Assert.Null(ResumeUpdate.SanitizeDocumentEdits(J("{}")));
    }

    [Fact]
    public void SanitizeDocumentEdits_valid_entries_pass_through()
    {
        var result = ResumeUpdate.SanitizeDocumentEdits(
            J("""{"documentEdits":[{"page":1,"runIndex":2,"orig":"a","text":"b"}]}"""));
        using var doc = JsonDocument.Parse(result!);
        var entry = doc.RootElement[0];
        Assert.Equal(1, entry.GetProperty("page").GetInt32());
        Assert.Equal(2, entry.GetProperty("runIndex").GetInt32());
        Assert.Equal("a", entry.GetProperty("orig").GetString());
        Assert.Equal("b", entry.GetProperty("text").GetString());
    }

    [Fact]
    public void SanitizeDocumentEdits_caps_at_1000_entries()
    {
        var items = string.Join(",", Enumerable.Range(0, 1500).Select(i => $$"""{"page":{{i}},"runIndex":0,"orig":"x","text":"y"}"""));
        var result = ResumeUpdate.SanitizeDocumentEdits(J($"{{\"documentEdits\":[{items}]}}"));
        using var doc = JsonDocument.Parse(result!);
        Assert.Equal(1000, doc.RootElement.GetArrayLength());
    }

    [Fact]
    public void SanitizeDocumentEdits_clamps_orig_and_text_to_1000_chars()
    {
        var longText = new string('a', 2000);
        var result = ResumeUpdate.SanitizeDocumentEdits(
            J($$"""{"documentEdits":[{"page":0,"runIndex":0,"orig":"{{longText}}","text":"{{longText}}"}]}"""));
        using var doc = JsonDocument.Parse(result!);
        Assert.Equal(1000, doc.RootElement[0].GetProperty("orig").GetString()!.Length);
        Assert.Equal(1000, doc.RootElement[0].GetProperty("text").GetString()!.Length);
    }

    [Fact]
    public void SanitizeDocumentEdits_drops_non_object_entries()
    {
        var result = ResumeUpdate.SanitizeDocumentEdits(J("""{"documentEdits":["not-an-object",42,{"page":0,"runIndex":0}]}"""));
        using var doc = JsonDocument.Parse(result!);
        Assert.Equal(1, doc.RootElement.GetArrayLength());
    }

    [Fact]
    public void SanitizeDocumentEdits_non_array_documentEdits_yields_empty_array()
    {
        var result = ResumeUpdate.SanitizeDocumentEdits(J("""{"documentEdits":"not-an-array"}"""));
        using var doc = JsonDocument.Parse(result!);
        Assert.Equal(0, doc.RootElement.GetArrayLength());
    }

    [Fact]
    public void SanitizeDocumentEdits_non_numeric_page_coerces_to_zero_and_entry_survives()
    {
        var result = ResumeUpdate.SanitizeDocumentEdits(
            J("""{"documentEdits":[{"page":"garbage","runIndex":0,"orig":"a","text":"b"}]}"""));
        using var doc = JsonDocument.Parse(result!);
        Assert.Equal(1, doc.RootElement.GetArrayLength());
        Assert.Equal(0, doc.RootElement[0].GetProperty("page").GetInt32());
    }

    [Fact]
    public void SanitizeDocumentEdits_negative_page_drops_entry()
    {
        var result = ResumeUpdate.SanitizeDocumentEdits(
            J("""{"documentEdits":[{"page":-1,"runIndex":0,"orig":"a","text":"b"}]}"""));
        using var doc = JsonDocument.Parse(result!);
        Assert.Equal(0, doc.RootElement.GetArrayLength());
    }

    [Fact]
    public void SanitizeDocumentEdits_negative_runIndex_drops_entry()
    {
        var result = ResumeUpdate.SanitizeDocumentEdits(
            J("""{"documentEdits":[{"page":0,"runIndex":-1,"orig":"a","text":"b"}]}"""));
        using var doc = JsonDocument.Parse(result!);
        Assert.Equal(0, doc.RootElement.GetArrayLength());
    }

    [Fact]
    public void SanitizeDocumentEdits_non_canonical_whole_number_page_survives_as_integer()
    {
        var result = ResumeUpdate.SanitizeDocumentEdits(
            J("""{"documentEdits":[{"page":3.0,"runIndex":1e2,"orig":"a","text":"b"}]}"""));
        using var doc = JsonDocument.Parse(result!);
        Assert.Equal(1, doc.RootElement.GetArrayLength());
        Assert.Equal(3, doc.RootElement[0].GetProperty("page").GetInt32());
        Assert.Equal(100, doc.RootElement[0].GetProperty("runIndex").GetInt32());
    }
}
