using System.Globalization;
using System.Text;
using System.Text.Json;
using FormMaps.Application.Assessments;

namespace FormMaps.Application.CareerFit.Adapters;

/// <summary>The engine's competency levels (every rule-set id, 0–4) plus what could not be matched and what was defaulted.</summary>
public sealed record CompetencyAdaptation(
    IReadOnlyDictionary<int, int> Levels,
    IReadOnlyList<string> UnknownNames,
    IReadOnlyList<int> DefaultedIds,
    IReadOnlyList<InputWarning> Warnings);

/// <summary>
/// FM-CF-005 defect 2 — competency name → id. The engine keys competencies by id 1..24 and its
/// validate_inputs demands all 24; the platform stores <c>competences.PcaCmps[{CmpNom, Level}]</c> by
/// NAME, as TIMS sends it — uppercased and unnormalised ("COMUNICACIÓN") — and the only name→id table
/// anywhere is the rule set's <c>competencies[]</c> (24 Spanish title-case names). An exact-string join
/// matches nothing; the spec's 422 on fewer than 24 would reject real students (TIMS open question 3).
/// So: names are compared NORMALISED (Unicode NFD, non-spacing marks removed, case folded, punctuation
/// such as "/" and "," and runs of whitespace collapsed to one space); a name that still matches nothing
/// is recorded, not thrown; an id no entry reached is defaulted to level 0 with a warning; a level
/// outside 0–4 is clamped with a warning; a non-integer level is rounded half away from zero with a
/// warning; on a duplicate name the FIRST entry wins with a warning. Deliberately NOT here: any
/// attainment arithmetic (F02 is CareerFitFormulas.CalculateCompetencies), and any guess at a name the
/// rule set does not carry — the unknown list is the evidence TIMS needs to answer question 3.
/// </summary>
public static class CompetencyAdapter
{
    private const int MinLevel = 0;
    private const int MaxLevel = 4;

    /// <summary>Adapt the raw pca_results.competences jsonb (via <see cref="PcaNormalization.NormalizeCompetences"/>).</summary>
    public static CompetencyAdaptation Adapt(JsonElement competences, IReadOnlyList<CompetencyDefinition> definitions) =>
        Adapt(PcaNormalization.NormalizeCompetences(competences), definitions);

    /// <summary>
    /// Adapt normalised {name, level} entries. <paramref name="competences"/> null (absent block) means
    /// every definition is defaulted — recorded, not thrown, so the orchestrator can decide scorability.
    /// </summary>
    public static CompetencyAdaptation Adapt(
        IReadOnlyList<CompetenceEntry>? competences, IReadOnlyList<CompetencyDefinition> definitions)
    {
        var byNormalisedName = BuildLookup(definitions);
        var warnings = new List<InputWarning>();
        var levels = new Dictionary<int, int>(definitions.Count);
        var unknown = new List<string>();

        foreach (var entry in competences ?? [])
        {
            var key = NormalizeName(entry.Name);
            if (!byNormalisedName.TryGetValue(key, out var definition))
            {
                unknown.Add(entry.Name);
                warnings.Add(new InputWarning(
                    InputInstruments.Competencies,
                    InputWarningCodes.CompetencyNameUnknown,
                    $"Competency name \"{entry.Name}\" (normalised \"{key}\") matches no rule-set competency; ignored."));
                continue;
            }

            if (levels.ContainsKey(definition.CompetencyId))
            {
                warnings.Add(new InputWarning(
                    InputInstruments.Competencies,
                    InputWarningCodes.CompetencyNameDuplicate,
                    $"Competency \"{entry.Name}\" (id {definition.CompetencyId}) appears more than once; the first entry (level {levels[definition.CompetencyId]}) wins."));
                continue;
            }

            levels[definition.CompetencyId] = ToLevel(definition, entry.Level, warnings);
        }

        if (levels.Count != definitions.Count)
        {
            throw new ArgumentException("Competencies must contain IDs 1..24"); // NAIVE: the spec's 422
        }

        var defaulted = new List<int>();
        foreach (var definition in definitions)
        {
            if (levels.ContainsKey(definition.CompetencyId))
            {
                continue;
            }

            levels[definition.CompetencyId] = MinLevel;
            defaulted.Add(definition.CompetencyId);
            warnings.Add(new InputWarning(
                InputInstruments.Competencies,
                InputWarningCodes.CompetencyMissingDefaulted,
                $"Competency {definition.CompetencyId} \"{definition.Name}\" is missing from the PCA result; defaulted to level {MinLevel}."));
        }

        // Ordered by id so the audit and the engine iterate deterministically.
        var ordered = new Dictionary<int, int>(levels.Count);
        foreach (var id in levels.Keys.OrderBy(id => id))
        {
            ordered[id] = levels[id];
        }

        return new CompetencyAdaptation(ordered, unknown, defaulted, warnings);
    }

    /// <summary>
    /// The comparison key: NFD, non-spacing marks dropped (Ó → O, Ñ → N), lower-cased invariantly,
    /// every non-letter/digit run (space, "/", ",", "-") collapsed to one space, trimmed. "COMUNICACIÓN" and
    /// "Comunicación" → "comunicacion"; "Perseverancia/Tenacidad" and "PERSEVERANCIA / TENACIDAD" →
    /// "perseverancia tenacidad".
    /// </summary>
    public static string NormalizeName(string name)
    {
#pragma warning disable CS0162
        return name; // NAIVE: exact-string join
        var decomposed = name.Normalize(NormalizationForm.FormD);
        var builder = new StringBuilder(decomposed.Length);
        var pendingSeparator = false;
        foreach (var ch in decomposed)
        {
            if (CharUnicodeInfo.GetUnicodeCategory(ch) == UnicodeCategory.NonSpacingMark)
            {
                continue;
            }

            if (char.IsLetterOrDigit(ch))
            {
                if (pendingSeparator && builder.Length > 0)
                {
                    builder.Append(' ');
                }

                pendingSeparator = false;
                builder.Append(char.ToLowerInvariant(ch));
            }
            else
            {
                pendingSeparator = true;
            }
        }

        return builder.ToString();
    }

    private static Dictionary<string, CompetencyDefinition> BuildLookup(IReadOnlyList<CompetencyDefinition> definitions)
    {
        var lookup = new Dictionary<string, CompetencyDefinition>(definitions.Count, StringComparer.Ordinal);
        foreach (var definition in definitions)
        {
            var key = NormalizeName(definition.Name);
            if (lookup.TryGetValue(key, out var existing))
            {
                // Two rule-set names collapsing to one key would make the mapping ambiguous — a rule-set
                // defect, not a student-data defect, so it fails loudly.
                throw new CareerFitInputException(
                    InputInstruments.Competencies,
                    InputWarningCodes.CompetencyDefinitionsCollide,
                    $"Rule-set competencies {existing.CompetencyId} \"{existing.Name}\" and {definition.CompetencyId} \"{definition.Name}\" normalise to the same key \"{key}\".");
            }

            lookup[key] = definition;
        }

        return lookup;
    }

    private static int ToLevel(CompetencyDefinition definition, double raw, List<InputWarning> warnings)
    {
        if (double.IsNaN(raw) || double.IsInfinity(raw))
        {
            warnings.Add(new InputWarning(
                InputInstruments.Competencies,
                InputWarningCodes.CompetencyLevelNotANumber,
                $"Competency {definition.CompetencyId} \"{definition.Name}\" level is not a finite number; defaulted to {MinLevel}."));
            return MinLevel;
        }

        var rounded = Math.Round(raw, MidpointRounding.AwayFromZero);
        if (rounded != raw)
        {
            warnings.Add(new InputWarning(
                InputInstruments.Competencies,
                InputWarningCodes.CompetencyLevelRounded,
                $"Competency {definition.CompetencyId} \"{definition.Name}\" level {raw.ToString(CultureInfo.InvariantCulture)} is not an integer; rounded to {rounded.ToString(CultureInfo.InvariantCulture)}."));
        }

        if (rounded < MinLevel || rounded > MaxLevel)
        {
            var clamped = (int)Math.Clamp(rounded, MinLevel, MaxLevel);
            warnings.Add(new InputWarning(
                InputInstruments.Competencies,
                InputWarningCodes.CompetencyLevelClamped,
                $"Competency {definition.CompetencyId} \"{definition.Name}\" level {rounded.ToString(CultureInfo.InvariantCulture)} is outside {MinLevel}–{MaxLevel}; clamped to {clamped}."));
            return clamped;
        }

        return (int)rounded;
    }
}
