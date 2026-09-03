using System.Globalization;
using System.Text.Json;
using FormMaps.Application.Assessments;

namespace FormMaps.Application.CareerFit.Adapters;

/// <summary>
/// What the platform persists for one personality dimension, reduced to what the adapter needs:
/// the winning pole letter, the two raw tallies when they were stored, and the normalised intensity
/// (0–100, the winning count over the variant's items-per-dimension) when it was.
/// </summary>
public sealed record PersonalityDimensionEvidence(
    string WinningPole,
    int? FirstCount,
    int? SecondCount,
    int? NormalizedIntensity);

/// <summary>The engine's PersonalityInput plus, per dimension (EI/SN/TF/JP), how its pole pair was derived, and the repairs made.</summary>
public sealed record PersonalityAdaptation(
    PersonalityInput Personality,
    IReadOnlyDictionary<string, PersonalityPoleDerivation> Derivation,
    IReadOnlyList<InputWarning> Warnings);

/// <summary>
/// FM-CF-005 defect 4 — one intensity per dimension versus eight pole values. The platform's
/// <see cref="PersonalityScoring"/> persists, per dimension, ONE winner and ONE intensity
/// (dimension_scores jsonb: winningPole, intensity, normalizedIntensity, firstCount, secondCount); the
/// engine reads a value per POLE (personality_dimension_match is <c>getattr(p, preferred_pole)</c>) and
/// expects the two poles of a dimension to sum to 100. Copying normalizedIntensity onto the winner
/// scores the loser at 100 − a number that is not a share of the answered items, and — because
/// normalizedIntensity divides by the variant's item count, not by the items answered — can put the
/// WINNER below the loser on a partially answered dimension (9 of 20 items to E, 6 to I: intensity 45,
/// so E = 45 and I = 55). So, per dimension: when both counts are stored and at least one item was
/// answered, each pole = 100 × its count / (firstCount + secondCount) — continuous, faithful, sums to
/// 100 by construction (<see cref="PersonalityPoleDerivation.Counts"/>); when no counts are stored,
/// winner = 50 + normalizedIntensity / 2 and loser = 100 − winner
/// (<see cref="PersonalityPoleDerivation.Intensity"/>); 0 / 0 answered is 50 / 50
/// (<see cref="PersonalityPoleDerivation.Unanswered"/>). The path is recorded per dimension. A dimension
/// with neither counts nor an intensity, a missing dimension, or a winning pole that is not one of the
/// dimension's two letters is fail-closed. Deliberately NOT here: the type code (the engine never reads
/// it) and route scoring (F04-personality is CareerFitFormulas.CalculatePersonality).
/// </summary>
public static class PersonalityAdapter
{
    /// <summary>The two poles of each dimension in [first (A), second (B)] order — legacy DIMENSION_POLES, PersonalityScoring.cs.</summary>
    public static readonly IReadOnlyDictionary<string, (string First, string Second)> DimensionPoles =
        new Dictionary<string, (string, string)>(StringComparer.Ordinal)
        {
            ["EI"] = ("E", "I"),
            ["SN"] = ("S", "N"),
            ["TF"] = ("T", "F"),
            ["JP"] = ("J", "P"),
        };

    /// <summary>
    /// Adapt the stored dimension_scores jsonb exactly as <c>PersonalityResultReader</c> loads it: an
    /// object keyed EI/SN/TF/JP whose members carry camelCase winningPole / firstCount / secondCount /
    /// normalizedIntensity (PersonalityDimensionScore's JSON names). A null / non-object document is fail-closed.
    /// </summary>
    public static PersonalityAdaptation Adapt(JsonElement dimensionScores)
    {
        if (dimensionScores.ValueKind != JsonValueKind.Object)
        {
            throw new CareerFitInputException(
                InputInstruments.Personality,
                InputWarningCodes.PersonalityScoresMissing,
                "personality_assessment_sessions.dimension_scores is absent or not an object.");
        }

        var evidence = new Dictionary<string, PersonalityDimensionEvidence>(StringComparer.Ordinal);
        foreach (var dimension in PersonalityScoring.Dimensions)
        {
            if (!dimensionScores.TryGetProperty(dimension, out var entry) || entry.ValueKind != JsonValueKind.Object)
            {
                continue; // reported as missing by the typed overload
            }

            var winningPole = entry.TryGetProperty("winningPole", out var pole) && pole.ValueKind == JsonValueKind.String
                ? pole.GetString() ?? ""
                : "";
            evidence[dimension] = new PersonalityDimensionEvidence(
                winningPole,
                ReadInt(entry, "firstCount"),
                ReadInt(entry, "secondCount"),
                ReadInt(entry, "normalizedIntensity"));
        }

        return Adapt(evidence);
    }

    /// <summary>Adapt a freshly computed <see cref="PersonalityScore"/> (the write-side shape; counts are always present).</summary>
    public static PersonalityAdaptation Adapt(PersonalityScore score) =>
        Adapt(score.Dimensions.ToDictionary(
            kv => kv.Key,
            kv => new PersonalityDimensionEvidence(
                kv.Value.WinningPole, kv.Value.FirstCount, kv.Value.SecondCount, kv.Value.NormalizedIntensity),
            StringComparer.Ordinal));

    /// <summary>Adapt per-dimension evidence keyed EI/SN/TF/JP. Every dimension is required.</summary>
    public static PersonalityAdaptation Adapt(IReadOnlyDictionary<string, PersonalityDimensionEvidence> evidence)
    {
        var warnings = new List<InputWarning>();
        var derivation = new Dictionary<string, PersonalityPoleDerivation>(PersonalityScoring.Dimensions.Count, StringComparer.Ordinal);
        var poles = new Dictionary<string, double>(8, StringComparer.Ordinal);

        foreach (var dimension in PersonalityScoring.Dimensions)
        {
            var (first, second) = DimensionPoles[dimension];
            if (!evidence.TryGetValue(dimension, out var dim))
            {
                throw new CareerFitInputException(
                    InputInstruments.Personality,
                    InputWarningCodes.PersonalityDimensionMissing,
                    $"Personality dimension {dimension} is missing from dimension_scores.");
            }

            if (dim.WinningPole != first && dim.WinningPole != second)
            {
                throw new CareerFitInputException(
                    InputInstruments.Personality,
                    InputWarningCodes.PersonalityPoleUnknown,
                    $"Personality dimension {dimension} winning pole \"{dim.WinningPole}\" is not {first} or {second}.");
            }

            var (firstValue, secondValue, path) = Derive(dimension, dim, first, second, warnings);
            derivation[dimension] = path;
            poles[first] = firstValue;
            poles[second] = secondValue;
        }

        var personality = new PersonalityInput(
            poles["E"], poles["I"], poles["S"], poles["N"], poles["T"], poles["F"], poles["J"], poles["P"]);
        return new PersonalityAdaptation(personality, derivation, warnings);
    }

    private static (double First, double Second, PersonalityPoleDerivation Path) Derive(
        string dimension,
        PersonalityDimensionEvidence dim,
        string first,
        string second,
        List<InputWarning> warnings)
    {
        if (dim is { FirstCount: { } f, SecondCount: { } s })
        {
            if (f < 0 || s < 0)
            {
                throw new CareerFitInputException(
                    InputInstruments.Personality,
                    InputWarningCodes.PersonalityNoEvidence,
                    $"Personality dimension {dimension} has negative counts ({f} / {s}).");
            }

            var total = f + s;
            if (total == 0)
            {
                warnings.Add(new InputWarning(
                    InputInstruments.Personality,
                    InputWarningCodes.PersonalityDimensionUnanswered,
                    $"Personality dimension {dimension}: no item answered (0 / 0); poles set to 50 / 50."));
                return (50.0, 50.0, PersonalityPoleDerivation.Unanswered);
            }

            var winnerIsFirst = dim.WinningPole == first;
            var winnerCount = winnerIsFirst ? f : s;
            var loserCount = winnerIsFirst ? s : f;
            if (winnerCount < loserCount)
            {
                // The stored winner contradicts the stored tallies; the tallies are the primary evidence.
                warnings.Add(new InputWarning(
                    InputInstruments.Personality,
                    InputWarningCodes.PersonalityWinnerContradictsCounts,
                    $"Personality dimension {dimension}: winning pole {dim.WinningPole} has {winnerCount} items against {loserCount}; poles derived from the counts."));
            }

            // Oriented to the winner: winner = 100 × its count / answered; loser = the complement, so the
            // pair sums to exactly 100 (never two independent divisions that could differ by an ulp).
            var winner = 100.0 * winnerCount / total;
            var loser = 100.0 - winner;
            warnings.Add(new InputWarning(
                InputInstruments.Personality,
                InputWarningCodes.PersonalityDerivedFromCounts,
                $"Personality dimension {dimension}: poles from counts {f} / {s}."));
            return winnerIsFirst
                ? (winner, loser, PersonalityPoleDerivation.Counts)
                : (loser, winner, PersonalityPoleDerivation.Counts);
        }

        if (dim.NormalizedIntensity is { } intensity)
        {
            if (intensity is < 0 or > 100)
            {
                var clamped = Math.Clamp(intensity, 0, 100);
                warnings.Add(new InputWarning(
                    InputInstruments.Personality,
                    InputWarningCodes.PersonalityIntensityClamped,
                    $"Personality dimension {dimension}: normalizedIntensity {intensity} is outside 0–100; clamped to {clamped}."));
                intensity = clamped;
            }

            var winner = 50.0 + (intensity / 2.0);
            var loser = 100.0 - winner;
            warnings.Add(new InputWarning(
                InputInstruments.Personality,
                InputWarningCodes.PersonalityDerivedFromIntensity,
                $"Personality dimension {dimension}: counts not stored; poles from normalizedIntensity {intensity.ToString(CultureInfo.InvariantCulture)} (winner 50 + intensity / 2)."));
            return dim.WinningPole == first
                ? (winner, loser, PersonalityPoleDerivation.Intensity)
                : (loser, winner, PersonalityPoleDerivation.Intensity);
        }

        throw new CareerFitInputException(
            InputInstruments.Personality,
            InputWarningCodes.PersonalityNoEvidence,
            $"Personality dimension {dimension} has neither counts nor a normalizedIntensity.");
    }

    // A present integral JSON number → its value; absent, null, non-numeric or fractional → null
    // ("not stored"): the typed path then decides whether the remaining evidence is enough.
    private static int? ReadInt(JsonElement entry, string name)
    {
        if (!entry.TryGetProperty(name, out var value) || value.ValueKind != JsonValueKind.Number)
        {
            return null;
        }

        return value.TryGetInt32(out var parsed) ? parsed : null;
    }
}
