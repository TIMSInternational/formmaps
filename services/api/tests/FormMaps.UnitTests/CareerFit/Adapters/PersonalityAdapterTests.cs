using System.Text.Json;
using FormMaps.Application.Assessments;
using FormMaps.Application.CareerFit;
using FormMaps.Application.CareerFit.Adapters;

namespace FormMaps.UnitTests.CareerFit.Adapters;

/// <summary>
/// FM-CF-005 defect 4: the platform persists ONE winner + ONE intensity per dimension; the engine reads
/// a value per POLE and needs the two poles of a dimension to sum to 100. Fixture counts are chosen
/// so the naive "normalizedIntensity on the winner, 100 − it on the loser" is visibly wrong.
/// </summary>
public class PersonalityAdapterTests
{
    private static JsonElement J(string json)
    {
        using var doc = JsonDocument.Parse(json);
        return doc.RootElement.Clone();
    }

    private static PersonalityDimensionEvidence Counts(string winner, int first, int second, int? intensity = null) =>
        new(winner, first, second, intensity);

    private static Dictionary<string, PersonalityDimensionEvidence> Evidence(
        PersonalityDimensionEvidence ei, PersonalityDimensionEvidence sn, PersonalityDimensionEvidence tf, PersonalityDimensionEvidence jp) =>
        new(StringComparer.Ordinal) { ["EI"] = ei, ["SN"] = sn, ["TF"] = tf, ["JP"] = jp };

    [Fact]
    public void Defect4_with_counts_each_pole_is_its_share_of_the_answered_items_and_the_winner_is_never_below_the_loser()
    {
        // estudiantil: 20 items per dimension. EI answered 15 of 20: 9 to E, 6 to I.
        // PersonalityScoring persists normalizedIntensity = round(9 / 20 * 100) = 45 — a share of the
        // VARIANT's items, not of the answered ones. Copying it onto E gives E = 45 < I = 55: the winner
        // scored below the loser. The faithful value is 100 * 9 / 15 = 60.
        var score = PersonalityScoring.ScorePersonality("estudiantil", Answers("EI", a: 9, b: 6));
        Assert.Equal(45, score.Dimensions["EI"].NormalizedIntensity);
        Assert.Equal("E", score.Dimensions["EI"].WinningPole);

        var result = PersonalityAdapter.Adapt(score);

        Assert.Equal(60.0, result.Personality.E);
        Assert.Equal(40.0, result.Personality.I);
        Assert.True(result.Personality.E > result.Personality.I);
        Assert.Equal(100.0, result.Personality.E + result.Personality.I);
        Assert.Equal(PersonalityPoleDerivation.Counts, result.Derivation["EI"]);
    }

    [Fact]
    public void With_counts_the_pair_is_oriented_to_the_winning_pole_for_both_A_and_B_winners()
    {
        var evidence = Evidence(
            Counts("I", first: 4, second: 12),   // B wins: I = 75, E = 25
            Counts("S", first: 7, second: 3),    // A wins: S = 70, N = 30
            Counts("F", first: 1, second: 2),    // F = 66.66.., T = 33.33..
            Counts("J", first: 10, second: 10)); // tie → first pole wins the letter, 50 / 50

        var result = PersonalityAdapter.Adapt(evidence);
        var p = result.Personality;

        Assert.Equal(25.0, p.E);
        Assert.Equal(75.0, p.I);
        Assert.Equal(70.0, p.S);
        Assert.Equal(30.0, p.N);
        Assert.Equal(100.0 * 2 / 3, p.F);
        Assert.Equal(100.0 - (100.0 * 2 / 3), p.T);
        Assert.Equal(100.0, p.T + p.F);
        Assert.Equal(50.0, p.J);
        Assert.Equal(50.0, p.P);
        Assert.All(PersonalityScoring.Dimensions, d => Assert.Equal(PersonalityPoleDerivation.Counts, result.Derivation[d]));
        Assert.Equal(4, result.Warnings.Count(w => w.Code == InputWarningCodes.PersonalityDerivedFromCounts));
        CareerFitFormulas.ValidateInputs(new PcaInput(1, 1, 1, 1), Enumerable.Range(1, 24).ToDictionary(i => i, _ => 1), new MilInput(1, 1, 1, 1, 1), p);
    }

    [Fact]
    public void Without_counts_the_winner_gets_50_plus_half_the_intensity_and_the_loser_the_complement()
    {
        var evidence = Evidence(
            new PersonalityDimensionEvidence("E", null, null, 45),  // E = 72.5, I = 27.5
            new PersonalityDimensionEvidence("N", null, null, 100), // N = 100, S = 0
            new PersonalityDimensionEvidence("T", null, null, 0),   // T = 50, F = 50
            new PersonalityDimensionEvidence("P", null, null, 80)); // P = 90, J = 10

        var result = PersonalityAdapter.Adapt(evidence);
        var p = result.Personality;

        Assert.Equal(72.5, p.E);
        Assert.Equal(27.5, p.I);
        Assert.Equal(0.0, p.S);
        Assert.Equal(100.0, p.N);
        Assert.Equal(50.0, p.T);
        Assert.Equal(50.0, p.F);
        Assert.Equal(10.0, p.J);
        Assert.Equal(90.0, p.P);
        Assert.All(PersonalityScoring.Dimensions, d => Assert.Equal(PersonalityPoleDerivation.Intensity, result.Derivation[d]));
        Assert.Equal(4, result.Warnings.Count(w => w.Code == InputWarningCodes.PersonalityDerivedFromIntensity));
    }

    [Fact]
    public void Counts_win_over_intensity_when_both_are_stored_and_the_two_paths_are_recorded_as_different()
    {
        // Same stored intensity (45), with and without counts: the paths differ and say so.
        var withCounts = PersonalityAdapter.Adapt(Evidence(
            Counts("E", 9, 6, intensity: 45), Counts("S", 5, 5), Counts("T", 5, 5), Counts("J", 5, 5)));
        var withoutCounts = PersonalityAdapter.Adapt(Evidence(
            new("E", null, null, 45), Counts("S", 5, 5), Counts("T", 5, 5), Counts("J", 5, 5)));

        Assert.Equal(60.0, withCounts.Personality.E);
        Assert.Equal(72.5, withoutCounts.Personality.E);
        Assert.Equal(PersonalityPoleDerivation.Counts, withCounts.Derivation["EI"]);
        Assert.Equal(PersonalityPoleDerivation.Intensity, withoutCounts.Derivation["EI"]);
        // A half-stored pair (one count only) is "no counts".
        var half = PersonalityAdapter.Adapt(Evidence(new("E", 9, null, 45), Counts("S", 5, 5), Counts("T", 5, 5), Counts("J", 5, 5)));
        Assert.Equal(PersonalityPoleDerivation.Intensity, half.Derivation["EI"]);
    }

    [Fact]
    public void The_stored_dimension_scores_jsonb_shape_is_read_as_the_reader_loads_it()
    {
        // Exactly what PersonalityScoring serialises and PersonalityResultReader hands back (camelCase, keyed by dimension).
        var stored = JsonSerializer.SerializeToElement(PersonalityScoring.ScorePersonality("laboral", Answers("EI", a: 7, b: 3)).Dimensions);
        Assert.True(stored.TryGetProperty("EI", out var ei) && ei.TryGetProperty("winningPole", out _));

        var result = PersonalityAdapter.Adapt(stored);

        Assert.Equal(70.0, result.Personality.E);
        Assert.Equal(30.0, result.Personality.I);
        // Unanswered dimensions (0 / 0) are 50 / 50 and flagged, not thrown.
        Assert.Equal(50.0, result.Personality.S);
        Assert.Equal(50.0, result.Personality.N);
        Assert.Equal(PersonalityPoleDerivation.Unanswered, result.Derivation["SN"]);
        Assert.Equal(3, result.Warnings.Count(w => w.Code == InputWarningCodes.PersonalityDimensionUnanswered));
    }

    [Fact]
    public void A_legacy_row_without_counts_in_the_jsonb_falls_back_to_the_intensity_path()
    {
        var legacy = J("""
            {"EI":{"dimension":"EI","winningPole":"I","intensity":8,"normalizedIntensity":80},
             "SN":{"dimension":"SN","winningPole":"S","intensity":6,"normalizedIntensity":60},
             "TF":{"dimension":"TF","winningPole":"F","intensity":5,"normalizedIntensity":50},
             "JP":{"dimension":"JP","winningPole":"J","intensity":10,"normalizedIntensity":100}}
            """);

        var result = PersonalityAdapter.Adapt(legacy);
        var p = result.Personality;

        Assert.Equal((10.0, 90.0, 80.0, 20.0, 25.0, 75.0, 100.0, 0.0), (p.E, p.I, p.S, p.N, p.T, p.F, p.J, p.P));
        Assert.All(PersonalityScoring.Dimensions, d => Assert.Equal(PersonalityPoleDerivation.Intensity, result.Derivation[d]));
    }

    [Fact]
    public void Missing_dimension_unknown_pole_and_no_evidence_are_fail_closed()
    {
        var missing = Evidence(Counts("E", 5, 5), Counts("S", 5, 5), Counts("T", 5, 5), Counts("J", 5, 5));
        missing.Remove("TF");
        Assert.Equal(InputWarningCodes.PersonalityDimensionMissing, Assert.Throws<CareerFitInputException>(() => PersonalityAdapter.Adapt(missing)).Code);

        var wrongPole = Evidence(Counts("S", 5, 5), Counts("S", 5, 5), Counts("T", 5, 5), Counts("J", 5, 5));
        Assert.Equal(InputWarningCodes.PersonalityPoleUnknown, Assert.Throws<CareerFitInputException>(() => PersonalityAdapter.Adapt(wrongPole)).Code);

        var nothing = Evidence(new("E", null, null, null), Counts("S", 5, 5), Counts("T", 5, 5), Counts("J", 5, 5));
        Assert.Equal(InputWarningCodes.PersonalityNoEvidence, Assert.Throws<CareerFitInputException>(() => PersonalityAdapter.Adapt(nothing)).Code);

        Assert.Equal(InputWarningCodes.PersonalityScoresMissing, Assert.Throws<CareerFitInputException>(() => PersonalityAdapter.Adapt(J("null"))).Code);
        Assert.Equal(InputWarningCodes.PersonalityDimensionMissing, Assert.Throws<CareerFitInputException>(() => PersonalityAdapter.Adapt(J("{}"))).Code);
    }

    [Fact]
    public void A_winner_that_contradicts_its_counts_is_derived_from_the_counts_and_flagged()
    {
        var evidence = Evidence(Counts("I", first: 8, second: 2), Counts("S", 5, 5), Counts("T", 5, 5), Counts("J", 5, 5));

        var result = PersonalityAdapter.Adapt(evidence);

        Assert.Equal(80.0, result.Personality.E);
        Assert.Equal(20.0, result.Personality.I);
        Assert.Single(result.Warnings, w => w.Code == InputWarningCodes.PersonalityWinnerContradictsCounts);
    }

    [Fact]
    public void An_out_of_range_intensity_is_clamped_with_a_warning()
    {
        var evidence = Evidence(new("E", null, null, 130), Counts("S", 5, 5), Counts("T", 5, 5), Counts("J", 5, 5));

        var result = PersonalityAdapter.Adapt(evidence);

        Assert.Equal(100.0, result.Personality.E);
        Assert.Equal(0.0, result.Personality.I);
        Assert.Single(result.Warnings, w => w.Code == InputWarningCodes.PersonalityIntensityClamped);
    }

    // a answers to option A (first pole), b to option B (second pole) on one dimension; other dimensions unanswered.
    private static IEnumerable<PersonalityAnswer> Answers(string dimension, int a, int b)
    {
        var n = 1;
        for (var i = 0; i < a; i++)
        {
            yield return new PersonalityAnswer(dimension, n++, "A");
        }

        for (var i = 0; i < b; i++)
        {
            yield return new PersonalityAnswer(dimension, n++, "B");
        }
    }
}
