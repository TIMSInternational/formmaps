using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace FormMaps.Application.Informe;

// The bilingual (es/en) server-side label dictionary of the informe — every kicker, title, band
// word, empty-state sentence and data-driven template the document prints, ported unchanged from
// the legacy theme.ts LABELS (207 keys) as an embedded JSON resource. Spanish is the source of
// truth; the two key sets are asserted identical by InformeLabelsTests, so a label can never be
// missing in one language only. A lookup for an unknown key returns the key itself and never
// throws: an authoring mistake shows up in the PDF instead of crashing the render.

/// <summary>Bilingual label lookup for the informe.</summary>
public static partial class InformeLabels
{
    private static readonly Lazy<IReadOnlyDictionary<string, IReadOnlyDictionary<string, string>>> Dictionaries = new(LoadEmbedded);

    /// <summary>The supported languages, Spanish first.</summary>
    public static IReadOnlyList<string> Languages { get; } = ["es", "en"];

    [GeneratedRegex(@"\{(\w+)\}")]
    private static partial Regex Placeholder();

    /// <summary>The label for <paramref name="key"/> in <paramref name="lang"/> ("es" unless "en"); the key itself when missing.</summary>
    public static string Get(string lang, string key)
    {
        ArgumentNullException.ThrowIfNull(key);
        return Dictionaries.Value[Normalize(lang)].TryGetValue(key, out var value) ? value : key;
    }

    /// <summary>Every label of one language.</summary>
    public static IReadOnlyDictionary<string, string> All(string lang) => Dictionaries.Value[Normalize(lang)];

    /// <summary>
    /// Fills {name} placeholders in a label template. An unmatched placeholder is left verbatim rather
    /// than blanked, so an authoring mistake is visible in the PDF instead of silently swallowed.
    /// </summary>
    public static string Fmt(string template, IReadOnlyDictionary<string, object?> vars)
    {
        ArgumentNullException.ThrowIfNull(template);
        ArgumentNullException.ThrowIfNull(vars);
        return Placeholder().Replace(template, m =>
            vars.TryGetValue(m.Groups[1].Value, out var value)
                ? Convert.ToString(value, CultureInfo.InvariantCulture) ?? string.Empty
                : m.Value);
    }

    private static string Normalize(string lang) => string.Equals(lang, "en", StringComparison.Ordinal) ? "en" : "es";

    private static IReadOnlyDictionary<string, IReadOnlyDictionary<string, string>> LoadEmbedded()
    {
        using var stream = EmbeddedJson.Open(typeof(InformeLabels).Assembly, "informe-labels.es-en.json");
        using var doc = JsonDocument.Parse(stream);
        var result = new Dictionary<string, IReadOnlyDictionary<string, string>>(StringComparer.Ordinal);
        foreach (var lang in Languages)
        {
            var table = new Dictionary<string, string>(StringComparer.Ordinal);
            foreach (var property in doc.RootElement.GetProperty(lang).EnumerateObject())
            {
                table[property.Name] = property.Value.GetString() ?? string.Empty;
            }

            result[lang] = table;
        }

        return result;
    }
}

/// <summary>Opens an embedded resource by its file name, whatever folder prefix the build gave it.</summary>
internal static class EmbeddedJson
{
    public static Stream Open(System.Reflection.Assembly assembly, string fileName)
    {
        var resourceName = assembly.GetManifestResourceNames()
            .SingleOrDefault(name => name.EndsWith("." + fileName, StringComparison.Ordinal))
            ?? throw new InvalidOperationException($"Embedded resource '{fileName}' is not in {assembly.GetName().Name}.");
        return assembly.GetManifestResourceStream(resourceName)
            ?? throw new InvalidOperationException($"Embedded resource {resourceName} could not be opened.");
    }
}
