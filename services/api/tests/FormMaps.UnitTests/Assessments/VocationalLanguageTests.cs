using System.Text.Json;
using FormMaps.Application.Assessments;

namespace FormMaps.UnitTests.Assessments;

/// <summary>
/// Vocational 360 language resolution (mirrors legacy vocational360-language.test.ts). Pins: ?lang
/// normalization (default Spanish), per-field English with Spanish fallback for text / scale anchors / option
/// labels, the same-level anchor rule (a question's own Spanish scale is never paired with its dimension's
/// English scale), and that option values and order never change.
/// </summary>
public class VocationalLanguageTests
{
    private static JsonElement J(string json)
    {
        using var document = JsonDocument.Parse(json);
        return document.RootElement.Clone();
    }

    private static readonly JsonElement Null = J("null");

    private static string?[] Strings(JsonElement array) => array.EnumerateArray().Select(e => e.GetString()).ToArray();

    [Theory]
    [InlineData(null, "es")]
    [InlineData("", "es")]
    [InlineData("es", "es")]
    [InlineData("sp", "es")]
    [InlineData("fr", "es")]
    [InlineData("en", "en")]
    [InlineData(" EN ", "en")]
    [InlineData("en-US", "en")]
    public void Normalize_defaults_to_spanish_and_only_accepts_english_prefixes(string? raw, string expected) =>
        Assert.Equal(expected, VocationalLanguage.Normalize(raw));

    [Fact]
    public void ResolveText_uses_english_only_when_requested_and_present()
    {
        Assert.Equal("How much?", VocationalLanguage.ResolveText("¿Cuánto?", "How much?", "en"));
        Assert.Equal("¿Cuánto?", VocationalLanguage.ResolveText("¿Cuánto?", "How much?", "es"));
        Assert.Equal("¿Cuánto?", VocationalLanguage.ResolveText("¿Cuánto?", null, "en"));
        Assert.Equal("¿Cuánto?", VocationalLanguage.ResolveText("¿Cuánto?", "  ", "en"));
    }

    [Fact]
    public void ResolveScaleAnchors_prefers_the_question_scale_and_takes_english_from_the_same_level()
    {
        var qEs = J("""["poco","mucho"]""");
        var qEn = J("""["a little","a lot"]""");
        var dEs = J("""["nunca","siempre"]""");
        var dEn = J("""["never","always"]""");

        Assert.Equal(new[] { "a little", "a lot" }, Strings(VocationalLanguage.ResolveScaleAnchors(qEs, qEn, dEs, dEn, "en")));
        Assert.Equal(new[] { "poco", "mucho" }, Strings(VocationalLanguage.ResolveScaleAnchors(qEs, qEn, dEs, dEn, "es")));
        // Own Spanish scale without its own English → Spanish, never the dimension's English.
        Assert.Equal(new[] { "poco", "mucho" }, Strings(VocationalLanguage.ResolveScaleAnchors(qEs, Null, dEs, dEn, "en")));
        // Inherited scale (own null / jsonb 'null') → the dimension's, English when available.
        Assert.Equal(new[] { "never", "always" }, Strings(VocationalLanguage.ResolveScaleAnchors(Null, Null, dEs, dEn, "en")));
        Assert.Equal(new[] { "nunca", "siempre" }, Strings(VocationalLanguage.ResolveScaleAnchors(Null, Null, dEs, Null, "en")));
        Assert.Equal(JsonValueKind.Null, VocationalLanguage.ResolveScaleAnchors(Null, Null, Null, Null, "en").ValueKind);
        Assert.Equal(JsonValueKind.Null, VocationalLanguage.ResolveScaleAnchors(default, default, default, default, "en").ValueKind);
    }

    [Fact]
    public void ResolveScaleAnchors_rejects_an_incomplete_english_set()
    {
        var es = J("""["1","2","3"]""");
        Assert.Equal(new[] { "1", "2", "3" }, Strings(VocationalLanguage.ResolveScaleAnchors(es, J("""["one","two"]"""), Null, Null, "en")));
        Assert.Equal(new[] { "1", "2", "3" }, Strings(VocationalLanguage.ResolveScaleAnchors(es, J("""["one",2,"three"]"""), Null, Null, "en")));
    }

    [Fact]
    public void ResolveOptions_adds_a_resolved_label_and_keeps_values_order_and_source_labels()
    {
        var options = J("""[{"value":"a","labelEs":"Uno","labelEn":"One"},{"value":"b","labelEs":"Dos"},{"value":"c","labelEs":"Tres","labelEn":""}]""");

        var en = VocationalLanguage.ResolveOptions(options, "en");
        var es = VocationalLanguage.ResolveOptions(options, "es");

        Assert.Equal(new[] { "a", "b", "c" }, en.EnumerateArray().Select(o => o.GetProperty("value").GetString()));
        Assert.Equal(new[] { "One", "Dos", "Tres" }, en.EnumerateArray().Select(o => o.GetProperty("label").GetString()));
        Assert.Equal(new[] { "Uno", "Dos", "Tres" }, es.EnumerateArray().Select(o => o.GetProperty("label").GetString()));
        Assert.Equal("Uno", en[0].GetProperty("labelEs").GetString());
        Assert.Equal("One", es[0].GetProperty("labelEn").GetString());
    }

    [Fact]
    public void ResolveOptions_passes_non_arrays_through()
    {
        Assert.Equal(JsonValueKind.Null, VocationalLanguage.ResolveOptions(Null, "en").ValueKind);
        Assert.Equal("x", VocationalLanguage.ResolveOptions(J("""{"k":"x"}"""), "en").GetProperty("k").GetString());
    }
}
