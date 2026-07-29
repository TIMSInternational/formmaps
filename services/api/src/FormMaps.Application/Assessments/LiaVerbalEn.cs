using System.Text.Json;

namespace FormMaps.Application.Assessments;

/// <summary>
/// Port of legacy lib/lia-core/verbal-en.ts — the English verbal-reasoning question TEXT bank (distinct
/// from LiaAnswerScoring.GetVerbalAnswerForLanguage, which only overrides the ANSWER KEY). Certified,
/// human-reviewed instrument content (VERBAL_EN_REVIEWED_BY_HUMAN=true in the source) — the embedded JSON
/// is a mechanical export of the TS source, never hand-transcribed.
/// </summary>
public static class LiaVerbalEn
{
    private static readonly JsonDocument Bank = LoadBank();

    /// <summary>
    /// The EN question-data override for this item, or null if this item doesn't diverge from ES (legacy
    /// getVerbalEn returns undefined for ~289 of the 305 rows — only documented divergent items have an
    /// entry). Practice and assessment banks are keyed separately, matching the source shape.
    /// </summary>
    public static JsonElement? GetQuestionText(int itemNumber, bool isPractice)
    {
        var section = isPractice ? "practice" : "assessment";
        if (!Bank.RootElement.TryGetProperty(section, out var sectionElement))
        {
            return null;
        }

        return sectionElement.TryGetProperty(itemNumber.ToString(), out var item) ? item.Clone() : null;
    }

    private static JsonDocument LoadBank()
    {
        var assembly = typeof(LiaVerbalEn).Assembly;
        var resourceName = assembly.GetManifestResourceNames()
            .Single(name => name.EndsWith("lia-verbal-en.json", StringComparison.Ordinal));
        using var stream = assembly.GetManifestResourceStream(resourceName)
            ?? throw new InvalidOperationException("Embedded lia-verbal-en.json not found.");
        return JsonDocument.Parse(stream);
    }
}
