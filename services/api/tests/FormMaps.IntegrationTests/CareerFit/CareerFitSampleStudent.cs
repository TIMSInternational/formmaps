using System.Text.Json;
using FormMaps.Application.Assessments;
using FormMaps.Application.CareerFit;

namespace FormMaps.IntegrationTests.CareerFit;

/// <summary>
/// The student the platform's writers would have produced — byte-identical to the unit tests'
/// <c>SampleStudentRows</c> so the pure and the persisted paths score the same person.
/// </summary>
/// <remarks>
/// Lifted out of <see cref="CareerFitEvaluatorDatabaseTests"/> when FM-CF-013's runner tests needed the
/// same seed: two copies of these blobs would let one drift and quietly score a different student in the
/// two files. Nothing here is a fixture of its own — it produces the JSON documents the real writers
/// persist, and each test file seeds them itself.
/// </remarks>
internal static class CareerFitSampleStudent
{
    public const string DiscJson = """
        {"PcaD1":89,"PcaI1":18,"PcaS1":18,"PcaC1":21,
         "PcaD2":87,"PcaI2":87,"PcaS2":26,"PcaC2":25,
         "PcaD3":90,"PcaI3":60,"PcaS3":25,"PcaC3":25}
        """;

    public const string PercentilesJson = """
        {"pattern_recognition":72,"verbal_reasoning":58,"numerical_speed":81,"working_memory":47,"visual_rotation":63,"global":64.2}
        """;

    public static string CompetencesJson(CareerFitRules rules)
    {
        var entries = rules.Competencies
            .Select(c => $$"""{"CmpNom":"{{c.Name.ToUpperInvariant()}}","Level":{{1 + (c.CompetencyId - 1) % 4}}}""");
        return $$"""{"PcaCmps":[{{string.Join(",", entries)}}]}""";
    }

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

        return JsonSerializer.Serialize(PersonalityScoring.ScorePersonality("estudiantil", answers).Dimensions);
    }
}
