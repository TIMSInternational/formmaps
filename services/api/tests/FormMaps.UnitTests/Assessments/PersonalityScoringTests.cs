using FormMaps.Application.Assessments;

namespace FormMaps.UnitTests.Assessments;

/// <summary>
/// Personality scoring tally parity (FM-DOTNET-027). Mirrors the legacy personality-scoring.unit.test.ts
/// cases (the TS engine's own spec — there is no shared golden.json for personality) plus the corpus #12
/// invariants: intensity ÷ maxPerDimension (10/20) × 100 — NOT ÷answered; tie → FIRST pole + balanced;
/// defensive ignore of invalid choices / unknown dimensions (strict A/B → 400 and retake → 409 are the
/// service/write path, Phase C). Any drift in the divisor, tie-break, or type assembly turns one of these red.
/// </summary>
public class PersonalityScoringTests
{
    // Build an answer list: for each (dimension, aCount, bCount) emit aCount "A" then bCount "B" answers.
    private static List<PersonalityAnswer> Build(params (string Dim, int A, int B)[] spec)
    {
        var list = new List<PersonalityAnswer>();
        var n = 1;
        foreach (var (dim, a, b) in spec)
        {
            for (var i = 0; i < a; i++)
            {
                list.Add(new PersonalityAnswer(dim, n++, "A"));
            }

            for (var i = 0; i < b; i++)
            {
                list.Add(new PersonalityAnswer(dim, n++, "B"));
            }
        }

        return list;
    }

    private static PersonalityDimensionScore Dim(PersonalityScore score, string dimension) =>
        score.Dimensions[dimension];

    [Fact]
    public void All_A_laboral_scores_ESTJ_full_first_pole_intensity()
    {
        var score = PersonalityScoring.ScorePersonality(
            "laboral", Build(("EI", 10, 0), ("SN", 10, 0), ("TF", 10, 0), ("JP", 10, 0)));

        Assert.Equal("ESTJ", score.Type);
        Assert.Equal(4, score.Dimensions.Count);
        foreach (var d in score.Dimensions.Values)
        {
            Assert.Equal(d.WinningPole, DimensionFirstPole(d.Dimension));
            Assert.Equal(10, d.Intensity);
            Assert.Equal(10, d.MaxPerDimension);
            Assert.Equal(100, d.NormalizedIntensity);
            Assert.False(d.Balanced);
            Assert.Equal(10, d.FirstCount);
            Assert.Equal(0, d.SecondCount);
            Assert.Equal(10, d.Answered);
        }
    }

    [Fact]
    public void All_B_estudiantil_scores_INFP_full_second_pole_intensity()
    {
        var score = PersonalityScoring.ScorePersonality(
            "estudiantil", Build(("EI", 0, 20), ("SN", 0, 20), ("TF", 0, 20), ("JP", 0, 20)));

        Assert.Equal("INFP", score.Type);
        foreach (var d in score.Dimensions.Values)
        {
            Assert.Equal(20, d.Intensity);
            Assert.Equal(20, d.MaxPerDimension);
            Assert.Equal(100, d.NormalizedIntensity);
            Assert.False(d.Balanced);
        }
    }

    [Fact]
    public void Tie_resolves_to_first_pole_and_flags_balanced()
    {
        // 10 A + 10 B on EI (estudiantil) → 10/10 tie → E wins, balanced, intensity 10, 10/20 → 50.
        var score = PersonalityScoring.ScorePersonality("estudiantil", Build(("EI", 10, 10)));
        var ei = Dim(score, "EI");

        Assert.Equal(ei.FirstCount, ei.SecondCount);
        Assert.Equal("E", ei.WinningPole);
        Assert.True(ei.Balanced);
        Assert.Equal(10, ei.Intensity);
        Assert.Equal(50, ei.NormalizedIntensity);
    }

    [Fact]
    public void Unanswered_dimensions_resolve_to_first_pole_balanced_zero()
    {
        var score = PersonalityScoring.ScorePersonality("laboral", []);

        Assert.Equal("ESTJ", score.Type); // all first poles by tie-break
        foreach (var d in score.Dimensions.Values)
        {
            Assert.Equal(0, d.Answered);
            Assert.Equal(0, d.FirstCount);
            Assert.Equal(0, d.SecondCount);
            Assert.True(d.Balanced);
            Assert.Equal(0, d.NormalizedIntensity);
        }
    }

    [Fact]
    public void Mixed_estudiantil_second_pole_wins_with_partial_intensity()
    {
        // 5 A + 15 B per dimension → second pole wins, intensity 15, 15/20 × 100 = 75.
        var score = PersonalityScoring.ScorePersonality(
            "estudiantil", Build(("EI", 5, 15), ("SN", 5, 15), ("TF", 5, 15), ("JP", 5, 15)));

        Assert.Equal("INFP", score.Type);
        var ei = Dim(score, "EI");
        Assert.Equal(5, ei.FirstCount);
        Assert.Equal(15, ei.SecondCount);
        Assert.Equal(15, ei.Intensity);
        Assert.Equal(20, ei.Answered);
        Assert.Equal(75, ei.NormalizedIntensity);
        Assert.False(ei.Balanced);
    }

    [Fact]
    public void Type_is_assembled_in_EI_SN_TF_JP_order()
    {
        // E (A), N (B), T (A), P (B) → "ENTP" — pins per-dimension letter placement + order.
        var score = PersonalityScoring.ScorePersonality(
            "laboral", Build(("EI", 10, 0), ("SN", 0, 10), ("TF", 10, 0), ("JP", 0, 10)));
        Assert.Equal("ENTP", score.Type);
    }

    [Theory]
    [InlineData("laboral", 10)]
    [InlineData("estudiantil", 20)]
    public void GetMaxPerDimension_is_the_variant_cap(string variant, int expected)
    {
        Assert.Equal(expected, PersonalityScoring.GetMaxPerDimension(variant));
    }

    [Fact]
    public void GetMaxPerDimension_throws_on_unknown_variant()
    {
        Assert.Throws<ArgumentOutOfRangeException>(() => PersonalityScoring.GetMaxPerDimension("bogus"));
        Assert.Throws<ArgumentOutOfRangeException>(
            () => PersonalityScoring.ScorePersonality("bogus", []));
    }

    [Fact]
    public void Invalid_choices_and_unknown_dimensions_are_ignored_defensively()
    {
        // "C"/"" choices and an "XX" dimension contribute nothing; only the valid A/B on EI count.
        var answers = new List<PersonalityAnswer>
        {
            new("EI", 1, "A"),
            new("EI", 2, "C"),   // invalid choice → ignored
            new("EI", 3, ""),    // empty choice → ignored
            new("XX", 4, "A"),   // unknown dimension → ignored
        };

        var score = PersonalityScoring.ScorePersonality("laboral", answers);
        var ei = Dim(score, "EI");

        Assert.Equal(1, ei.FirstCount);
        Assert.Equal(0, ei.SecondCount);
        Assert.Equal(1, ei.Answered);
        Assert.Equal("E", ei.WinningPole);
        // Other dimensions untouched (0-0 → balanced).
        Assert.True(Dim(score, "SN").Balanced);
    }

    [Fact]
    public void Dimensions_is_keyed_by_dimension_covering_all_four()
    {
        // The output is a KEYED map (legacy Record<Dimension,DimensionScore>) so it serializes to the
        // { "EI": {...}, ... } jsonb the FM-017 reader consumes — NOT a JSON array (which reads back empty).
        var score = PersonalityScoring.ScorePersonality("laboral", []);

        Assert.Equal(new[] { "EI", "SN", "TF", "JP" }, score.Dimensions.Keys);
        foreach (var (key, value) in score.Dimensions)
        {
            Assert.Equal(key, value.Dimension); // key matches the inner dimension field
        }
    }

    [Fact]
    public void Null_dimension_answer_is_ignored_not_thrown()
    {
        // Legacy tallies[null] → undefined → continue; the permissive engine must ignore, not throw.
        var answers = new List<PersonalityAnswer> { new(null!, 1, "A"), new("EI", 2, "A") };
        var score = PersonalityScoring.ScorePersonality("laboral", answers);

        Assert.Equal(1, Dim(score, "EI").FirstCount); // only the valid EI answer counted
    }

    [Fact]
    public void NormalizedIntensity_clamps_over_max_submissions_to_100()
    {
        // 15 A on a laboral (max 10) dimension → intensity 15 → 150% → clamped to 100 (defensive; the
        // coverage gate prevents over-submission in practice, but the engine stays bounded).
        var score = PersonalityScoring.ScorePersonality("laboral", Build(("EI", 15, 0)));
        var ei = Dim(score, "EI");

        Assert.Equal(15, ei.Intensity);
        Assert.Equal(100, ei.NormalizedIntensity);
    }

    [Theory]
    // normalizedIntensity = round(intensity / maxPerDimension × 100) on the variant scale, NOT ÷answered.
    [InlineData("laboral", 7, 70)]      // 7/10 → 70
    [InlineData("laboral", 3, 30)]      // 3/10 → 30
    [InlineData("estudiantil", 3, 15)]  // 3/20 → 15 (÷answered would be 100)
    [InlineData("estudiantil", 13, 65)] // 13/20 → 65
    public void NormalizedIntensity_divides_by_maxPerDimension_not_answered(string variant, int aCount, int expected)
    {
        // Only aCount answers on EI, all "A" → intensity = aCount, answered = aCount. If the divisor were
        // `answered`, normalized would always be 100; it must instead be aCount/maxPerDimension × 100.
        var score = PersonalityScoring.ScorePersonality(variant, Build(("EI", aCount, 0)));
        Assert.Equal(expected, Dim(score, "EI").NormalizedIntensity);
    }

    private static string DimensionFirstPole(string dimension) => dimension switch
    {
        "EI" => "E",
        "SN" => "S",
        "TF" => "T",
        "JP" => "J",
        _ => throw new ArgumentOutOfRangeException(nameof(dimension)),
    };
}
