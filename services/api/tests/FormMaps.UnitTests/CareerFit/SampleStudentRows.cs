using System.Text.Json;
using FormMaps.Application.Assessments;
using FormMaps.Application.CareerFit;

namespace FormMaps.UnitTests.CareerFit;

/// <summary>
/// One student's raw platform rows in EXACTLY the shapes the real writers persist — the same JSON the
/// integration harness seeds into pca_results / lia_assessment_sessions / personality_assessment_sessions
/// (CareerFitEvaluatorTests there) — so the pure evaluator tests and the database tests score the same
/// student. DISC: TIMS's three graphs (PcaD1..PcaC3, CompleteProfileAssemblerTests' shape). Competences:
/// PcaCmps[{CmpNom, Level}] with the names as TIMS sends them (upper-case, accented) for all 24 rule-set
/// competencies. Percentiles: LiaCompletionScorer's five subtest keys. Dimension scores: what
/// PersonalitySessionWriter serialises (PersonalityScoring.ScorePersonality(...).Dimensions).
/// </summary>
public static class SampleStudentRows
{
    public const string DiscJson = """
        {"PcaD1":89,"PcaI1":18,"PcaS1":18,"PcaC1":21,
         "PcaD2":87,"PcaI2":87,"PcaS2":26,"PcaC2":25,
         "PcaD3":90,"PcaI3":60,"PcaS3":25,"PcaC3":25}
        """;

    public const string PercentilesJson = """
        {"pattern_recognition":72,"verbal_reasoning":58,"numerical_speed":81,"working_memory":47,"visual_rotation":63,"global":64.2}
        """;

    /// <summary>Every rule-set competency, named the way TIMS sends it, at a level that cycles 1..4 by id.</summary>
    public static string CompetencesJson(CareerFitRules rules)
    {
        var entries = rules.Competencies
            .Select(c => $$"""{"CmpNom":"{{c.Name.ToUpperInvariant()}}","Level":{{1 + (c.CompetencyId - 1) % 4}}}""");
        return $$"""{"PcaCmps":[{{string.Join(",", entries)}}]}""";
    }

    /// <summary>A completed estudiantil (20 items per dimension) session scored by the platform's own tally.</summary>
    public static string DimensionScoresJson()
    {
        var answers = new List<PersonalityAnswer>();
        var n = 1;
        foreach (var (dimension, aCount) in new[] { ("EI", 14), ("SN", 8), ("TF", 17), ("JP", 11) })
        {
            for (var i = 0; i < 20; i++)
            {
                answers.Add(new PersonalityAnswer(dimension, n++, i < aCount ? "A" : "B"));
            }
        }

        var score = PersonalityScoring.ScorePersonality("estudiantil", answers);
        return JsonSerializer.Serialize(score.Dimensions);
    }

    public static JsonElement Parse(string json)
    {
        using var doc = JsonDocument.Parse(json);
        return doc.RootElement.Clone();
    }

    public static JsonElement JsonNull() => Parse("null");
}
