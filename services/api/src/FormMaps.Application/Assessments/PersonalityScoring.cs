using System.Text;
using System.Text.Json.Serialization;

namespace FormMaps.Application.Assessments;

/// <summary>One submitted binary answer (legacy PersonalityAnswer). N is carried for parity but is NOT used by the tally.</summary>
public sealed record PersonalityAnswer(string Dimension, int N, string Choice);

/// <summary>
/// Per-dimension scoring detail (legacy DimensionScore). The JSON names are camelCase (legacy
/// personality-scoring.ts), matching the dimension_scores jsonb the write side (FM-030) persists and the
/// read side (FM-017 PersonalityResultsAssembler) echoes VERBATIM to the frontend. The names are on the
/// record — not a per-call serializer policy — so any serialization of it stays on-contract; a PascalCase
/// jsonb would silently blank the results radar / intensity bars (they read winningPole/normalizedIntensity).
/// </summary>
public sealed record PersonalityDimensionScore(
    [property: JsonPropertyName("dimension")] string Dimension,
    [property: JsonPropertyName("firstCount")] int FirstCount,
    [property: JsonPropertyName("secondCount")] int SecondCount,
    [property: JsonPropertyName("winningPole")] string WinningPole,
    [property: JsonPropertyName("intensity")] int Intensity,
    [property: JsonPropertyName("answered")] int Answered,
    [property: JsonPropertyName("maxPerDimension")] int MaxPerDimension,
    [property: JsonPropertyName("normalizedIntensity")] int NormalizedIntensity,
    [property: JsonPropertyName("balanced")] bool Balanced);

/// <summary>
/// Resolved score (legacy PersonalityScore). Dimensions is a KEYED map (legacy Record&lt;Dimension,
/// DimensionScore&gt;) in canonical EI,SN,TF,JP insertion order — serializes to the `{ "EI": {...}, ... }`
/// jsonb the Phase-C write persists and the FM-017 read side (PersonalityResultsAssembler, which gates on
/// JsonValueKind.Object) consumes. Emitting an array here would make the reader return empty dimension_scores.
/// </summary>
public sealed record PersonalityScore(
    string Variant,
    string Type,
    IReadOnlyDictionary<string, PersonalityDimensionScore> Dimensions);

/// <summary>
/// Pure port of legacy services/personality/personality-scoring.ts (the binary forced-choice tally). Each
/// answered item scores one point to the chosen option's pole (A → first pole E/S/T/J, B → second pole
/// I/N/F/P); per dimension the higher-count pole wins the letter (tie → FIRST pole, flagged balanced), and
/// the four winners form the 4-letter type. Intensity = the winning pole's raw count; normalizedIntensity =
/// round(intensity / maxPerDimension × 100) on the variant scale (10 laboral / 20 estudiantil) — NOT
/// ÷answered (corpus #12). I/O-free and defensive: invalid choices and unknown dimensions are ignored (the
/// service enforces strict A/B → 400 and retake → 409 at write time, not the engine).
/// </summary>
public static class PersonalityScoring
{
    /// <summary>Canonical dimension order (legacy DIMENSIONS).</summary>
    public static readonly IReadOnlyList<string> Dimensions = ["EI", "SN", "TF", "JP"];

    // The two poles of each dimension, in [firstPole (A), secondPole (B)] order (legacy DIMENSION_POLES).
    private static readonly IReadOnlyDictionary<string, (string First, string Second)> DimensionPoles =
        new Dictionary<string, (string, string)>(StringComparer.Ordinal)
        {
            ["EI"] = ("E", "I"),
            ["SN"] = ("S", "N"),
            ["TF"] = ("T", "F"),
            ["JP"] = ("J", "P"),
        };

    // Per-variant max points a single dimension can accumulate = the normalization divisor (legacy
    // VARIANT_ITEMS_PER_DIMENSION): 10 items/dim laboral, 20 estudiantil.
    private static readonly IReadOnlyDictionary<string, int> VariantItemsPerDimension =
        new Dictionary<string, int>(StringComparer.Ordinal)
        {
            ["laboral"] = 10,
            ["estudiantil"] = 20,
        };

    /// <summary>On an even split the FIRST pole wins the letter (legacy TIE_BREAK_TO_FIRST_POLE).</summary>
    public const bool TieBreakToFirstPole = true;

    /// <summary>The normalization divisor / per-dimension cap for a variant (10 laboral, 20 estudiantil). Throws on unknown.</summary>
    public static int GetMaxPerDimension(string variant) =>
        VariantItemsPerDimension.TryGetValue(variant, out var max)
            ? max
            : throw new ArgumentOutOfRangeException(nameof(variant), variant, "Unknown personality variant");

    /// <summary>
    /// Score binary answers into a resolved type + per-dimension intensities (legacy scorePersonality).
    /// Pure/defensive: answers with an invalid choice or unknown dimension are ignored; an unanswered
    /// dimension (0-0) resolves to the first pole with balanced=true.
    /// </summary>
    public static PersonalityScore ScorePersonality(string variant, IEnumerable<PersonalityAnswer> answers)
    {
        var maxPerDimension = GetMaxPerDimension(variant);

        var first = Dimensions.ToDictionary(d => d, _ => 0, StringComparer.Ordinal);
        var second = Dimensions.ToDictionary(d => d, _ => 0, StringComparer.Ordinal);

        foreach (var answer in answers)
        {
            if (answer.Dimension is null || !first.ContainsKey(answer.Dimension))
            {
                continue; // null or unknown dimension — ignore (legacy tallies[dim] is undefined → skipped)
            }

            if (answer.Choice == "A")
            {
                first[answer.Dimension] += 1;
            }
            else if (answer.Choice == "B")
            {
                second[answer.Dimension] += 1;
            }

            // any other value: ignore (skipped / malformed)
        }

        // Keyed by dimension in canonical EI,SN,TF,JP insertion order (legacy Record<Dimension,DimensionScore>).
        var dimensions = new Dictionary<string, PersonalityDimensionScore>(Dimensions.Count, StringComparer.Ordinal);
        var typeCode = new StringBuilder(Dimensions.Count);

        foreach (var dimension in Dimensions)
        {
            var (firstPole, secondPole) = DimensionPoles[dimension];
            var f = first[dimension];
            var s = second[dimension];
            var answered = f + s;

            var tie = f == s;
            var firstWins = TieBreakToFirstPole ? f >= s : f > s;
            var winningPole = firstWins ? firstPole : secondPole;
            var intensity = firstWins ? f : s;
            var normalizedIntensity = ClampPercent(RoundHalfUp((double)intensity / maxPerDimension * 100));

            dimensions[dimension] = new PersonalityDimensionScore(
                Dimension: dimension,
                FirstCount: f,
                SecondCount: s,
                WinningPole: winningPole,
                Intensity: intensity,
                Answered: answered,
                MaxPerDimension: maxPerDimension,
                NormalizedIntensity: normalizedIntensity,
                Balanced: tie);

            typeCode.Append(winningPole);
        }

        return new PersonalityScore(variant, typeCode.ToString(), dimensions);
    }

    private static int ClampPercent(int value) => Math.Max(0, Math.Min(100, value));

    // JS Math.round(x) = Math.floor(x + 0.5) (half-up toward +Inf) — .NET Math.Round is banker's rounding,
    // so use the explicit form. For the 10/20 divisors every value is already an exact integer, but keep it faithful.
    private static int RoundHalfUp(double value) => (int)Math.Floor(value + 0.5);
}
