using System.Globalization;
using System.Text.Json;

namespace FormMaps.Application.Informe;

// The interpretive-content library: bilingual, band-keyed templated text per DISC dimension, per
// cognitive domain and per competency level, plus the methodology paragraph and the glossary —
// the legacy interpret.es-en.json, embedded unchanged. Every lookup returns "" for an unknown
// dimension, domain, level or language rather than throwing, and the band is the 34/67 band of
// Bands, so this file and the charts can never disagree about what "Alta" means.

/// <summary>A glossary line: the term and its one-sentence definition.</summary>
public sealed record GlossaryEntry(string Term, string Definition);

/// <summary>Bilingual interpretive copy, keyed by dimension/domain/level and score band.</summary>
public static class InformeInterpret
{
    private static readonly Lazy<Content> Data = new(Load);

    /// <summary>A 2–3 sentence interpretation of one DISC dimension (D, I, S, C) at this score.</summary>
    public static string Disc(string dim, double score, string lang) => Banded(Data.Value.Disc, dim, score, lang);

    /// <summary>A 2–3 sentence interpretation of one cognitive domain (razonamiento, deteccion, numerico, memoria, orientacion).</summary>
    public static string Cognitive(string domain, double score, string lang) => Banded(Data.Value.Cognitive, domain, score, lang);

    /// <summary>The interpretation of a competency level 1–4.</summary>
    public static string Competence(int level, string lang) =>
        Data.Value.Competence.TryGetValue(level.ToString(CultureInfo.InvariantCulture), out var byLang)
            && byLang.TryGetValue(Normalize(lang), out var text)
            ? text
            : string.Empty;

    /// <summary>The methodology paragraph.</summary>
    public static string Methodology(string lang) =>
        Data.Value.Methodology.TryGetValue(Normalize(lang), out var text) ? text : string.Empty;

    /// <summary>The glossary, in authored order.</summary>
    public static IReadOnlyList<GlossaryEntry> Glossary(string lang) =>
        Data.Value.Glossary.TryGetValue(Normalize(lang), out var entries) ? entries : [];

    private static string Banded(
        IReadOnlyDictionary<string, IReadOnlyDictionary<string, IReadOnlyDictionary<string, string>>> table,
        string key,
        double score,
        string lang)
    {
        ArgumentNullException.ThrowIfNull(key);
        var band = Bands.Of(score) switch { Band.High => "high", Band.Med => "med", _ => "low" };
        return table.TryGetValue(key, out var byBand)
            && byBand.TryGetValue(band, out var byLang)
            && byLang.TryGetValue(Normalize(lang), out var text)
            ? text
            : string.Empty;
    }

    private static string Normalize(string lang) => string.Equals(lang, "en", StringComparison.Ordinal) ? "en" : "es";

    private sealed record Content(
        IReadOnlyDictionary<string, IReadOnlyDictionary<string, IReadOnlyDictionary<string, string>>> Disc,
        IReadOnlyDictionary<string, IReadOnlyDictionary<string, IReadOnlyDictionary<string, string>>> Cognitive,
        IReadOnlyDictionary<string, IReadOnlyDictionary<string, string>> Competence,
        IReadOnlyDictionary<string, string> Methodology,
        IReadOnlyDictionary<string, IReadOnlyList<GlossaryEntry>> Glossary);

    private static Content Load()
    {
        using var stream = EmbeddedJson.Open(typeof(InformeInterpret).Assembly, "interpret.es-en.json");
        using var doc = JsonDocument.Parse(stream);
        var root = doc.RootElement;

        var glossary = new Dictionary<string, IReadOnlyList<GlossaryEntry>>(StringComparer.Ordinal);
        foreach (var lang in root.GetProperty("glossary").EnumerateObject())
        {
            glossary[lang.Name] = lang.Value.EnumerateArray()
                .Select(e => new GlossaryEntry(
                    e.GetProperty("term").GetString() ?? string.Empty,
                    e.GetProperty("def").GetString() ?? string.Empty))
                .ToList();
        }

        return new Content(
            Disc: ThreeLevel(root.GetProperty("disc")),
            Cognitive: ThreeLevel(root.GetProperty("cognitive")),
            Competence: TwoLevel(root.GetProperty("competence")),
            Methodology: OneLevel(root.GetProperty("methodology")),
            Glossary: glossary);
    }

    private static IReadOnlyDictionary<string, string> OneLevel(JsonElement element)
    {
        var result = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var p in element.EnumerateObject())
        {
            result[p.Name] = p.Value.GetString() ?? string.Empty;
        }

        return result;
    }

    private static IReadOnlyDictionary<string, IReadOnlyDictionary<string, string>> TwoLevel(JsonElement element)
    {
        var result = new Dictionary<string, IReadOnlyDictionary<string, string>>(StringComparer.Ordinal);
        foreach (var p in element.EnumerateObject())
        {
            result[p.Name] = OneLevel(p.Value);
        }

        return result;
    }

    private static IReadOnlyDictionary<string, IReadOnlyDictionary<string, IReadOnlyDictionary<string, string>>> ThreeLevel(JsonElement element)
    {
        var result = new Dictionary<string, IReadOnlyDictionary<string, IReadOnlyDictionary<string, string>>>(StringComparer.Ordinal);
        foreach (var p in element.EnumerateObject())
        {
            result[p.Name] = TwoLevel(p.Value);
        }

        return result;
    }
}
