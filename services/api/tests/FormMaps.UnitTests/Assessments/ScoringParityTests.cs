using System.Reflection;
using System.Text.Json;
using System.Text.Json.Nodes;
using FormMaps.Application.Assessments;

namespace FormMaps.UnitTests.Assessments;

/// <summary>
/// Node ⇄ .NET scoring parity. Vocational 360, the integrated result, personality and the MIL composite are
/// each implemented in legacy Node and in .NET, and production routes a call to either one per
/// FORMMAPS_ROUTE_* flag — so the two must produce the same result for the same answers, to the last digit.
///
/// Data/scoring-parity.json holds ~870 cases (named edge cases from the scoring audit + seeded random ones)
/// with the outputs of the Node engines that scored production so far (scripts/scoring-parity/
/// generate-fixture.ts records the Node commit). Each case is replayed through the .NET engine, serialized
/// into the same shape, and compared field by field with EXACT number equality. A failure lists every
/// disagreeing field as "case → path: node=… dotnet=…".
/// </summary>
public sealed class ScoringParityTests
{
    private static readonly JsonSerializerOptions In = new() { PropertyNameCaseInsensitive = true };
    private static readonly JsonSerializerOptions Out = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

    private static readonly Lazy<JsonObject> Fixture = new(() =>
    {
        var assembly = typeof(ScoringParityTests).Assembly;
        var name = assembly.GetManifestResourceNames().Single(n => n.EndsWith("scoring-parity.json", StringComparison.Ordinal));
        using var stream = assembly.GetManifestResourceStream(name)!;
        return JsonNode.Parse(stream)!.AsObject();
    });

    private static IEnumerable<JsonObject> Cases(string section) => Fixture.Value[section]!.AsArray().Select(c => c!.AsObject());

    private static T Read<T>(JsonNode? node) => node.Deserialize<T>(In)!;

    /// <summary>Serialize the runtime type (so derived-record properties and Status are included).</summary>
    private static JsonNode? ToNode(object? value) =>
        value is null ? null : JsonSerializer.SerializeToNode(value, value.GetType(), Out);

    [Fact]
    public void Fixture_was_generated_from_the_node_engines()
    {
        Assert.False(string.IsNullOrWhiteSpace(Fixture.Value["nodeCommit"]?.GetValue<string>()));
        Assert.True(Cases("vocational").Count() > 150);
    }

    [Fact]
    public void Vocational_360_matches_node()
    {
        var failures = new List<string>();
        foreach (var c in Cases("vocational"))
        {
            var outcome = VocationalScoring.ComputeVocationalResult(
                Read<ScoringConfig>(c["config"]),
                Read<List<ScoringQuestion>>(c["questions"]),
                Read<List<ScoringGroup>>(c["groups"]));
            Diff(c["name"]!.GetValue<string>(), "", c["expected"], ToNode(outcome), failures);
        }
        AssertNone(failures);
    }

    [Fact]
    public void Integrated_result_matches_node()
    {
        var failures = new List<string>();
        foreach (var c in Cases("integrated"))
        {
            var outcome = VocationalIntegration.ComputeIntegratedResult(Read<IntegrationConfig>(c["config"]), Read<IntegrationInputs>(c["inputs"]));
            Diff(c["name"]!.GetValue<string>(), "", c["expected"], ToNode(outcome), failures);
        }
        AssertNone(failures);
    }

    [Fact]
    public void Pca_competences_to_score_matches_node()
    {
        var failures = new List<string>();
        foreach (var c in Cases("competences"))
        {
            var score = VocationalIntegration.CompetencesToScore(Read<List<Competence>>(c["competences"]));
            Diff(c["name"]!.GetValue<string>(), "", c["expected"], score is null ? null : JsonValue.Create(score.Value), failures);
        }
        AssertNone(failures);
    }

    [Fact]
    public void Personality_matches_node()
    {
        var failures = new List<string>();
        foreach (var c in Cases("personality"))
        {
            var score = PersonalityScoring.ScorePersonality(c["variant"]!.GetValue<string>(), Read<List<PersonalityAnswer>>(c["answers"]));
            Diff(c["name"]!.GetValue<string>(), "", c["expected"], ToNode(score), failures);
        }
        AssertNone(failures);
    }

    [Fact]
    public void Mil_composite_matches_node()
    {
        var failures = new List<string>();
        foreach (var c in Cases("mil"))
        {
            var result = MilComposite.Compute(Read<Dictionary<string, double>>(c["perDomainPercent"]));
            Diff(c["name"]!.GetValue<string>(), "", c["expected"], ToNode(result), failures);
        }
        AssertNone(failures);
    }

    // ------------------------------------------------------------------ comparison

    private static void AssertNone(List<string> failures) =>
        Assert.True(failures.Count == 0, $"{failures.Count} field(s) differ between Node and .NET:\n" + string.Join("\n", failures.Take(40)));

    /// <summary>Structural comparison: objects by key (order-free), arrays by position, numbers exactly.</summary>
    private static void Diff(string caseName, string path, JsonNode? node, JsonNode? dotnet, List<string> failures)
    {
        string Where() => $"{caseName} → {(path.Length == 0 ? "(root)" : path)}";
        switch (node, dotnet)
        {
            case (null, null):
                return;
            case (null, _) or (_, null):
                failures.Add($"{Where()}: node={node?.ToJsonString() ?? "null"} dotnet={dotnet?.ToJsonString() ?? "null"}");
                return;
            case (JsonObject a, JsonObject b):
                foreach (var key in a.Select(p => p.Key).Union(b.Select(p => p.Key)))
                {
                    Diff(caseName, $"{path}.{key}", a[key], b[key], failures);
                }
                return;
            case (JsonArray a, JsonArray b):
                if (a.Count != b.Count)
                {
                    failures.Add($"{Where()}: node has {a.Count} items, dotnet {b.Count} — node={a.ToJsonString()} dotnet={b.ToJsonString()}");
                    return;
                }
                for (var i = 0; i < a.Count; i++)
                {
                    Diff(caseName, $"{path}[{i}]", a[i], b[i], failures);
                }
                return;
            case (JsonValue a, JsonValue b):
                if (a.GetValueKind() == JsonValueKind.Number && b.GetValueKind() == JsonValueKind.Number)
                {
                    var x = a.GetValue<double>();
                    var y = b.GetValue<double>();
                    if (!x.Equals(y)) failures.Add($"{Where()}: node={x:R} dotnet={y:R}");
                    return;
                }
                if (a.ToJsonString() != b.ToJsonString()) failures.Add($"{Where()}: node={a.ToJsonString()} dotnet={b.ToJsonString()}");
                return;
            default:
                failures.Add($"{Where()}: node={node.ToJsonString()} dotnet={dotnet.ToJsonString()}");
                return;
        }
    }
}
