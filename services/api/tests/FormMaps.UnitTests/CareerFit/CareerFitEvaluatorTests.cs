using System.Reflection;
using System.Text.Json;
using FormMaps.Application.Auth;
using FormMaps.Application.CareerFit;
using FormMaps.Application.CareerFit.Adapters;
using FormMaps.Application.CareerFit.Resolver;
using FormMaps.Domain.Auth;
using FormMaps.Infrastructure.CareerFit;
using Xunit.Abstractions;

namespace FormMaps.UnitTests.CareerFit;

/// <summary>
/// FM-CF-010 (P1–P3): the orchestrator's pure centre reproduces the NORMATIVE reference engine through
/// the orchestrator's own path (EvaluateCore over the FM-CF-004 parity fixture: every family within 1e-9,
/// every string equal, ranks 1..14 by descending absolute), and EvaluateAsync wires read → adapt → score →
/// write → return with the 360 NoData consequences exactly as documented: careerfit360 0.0,
/// NOT_DETERMINABLE, 360 DIVERGENT, VERY_HIGH unreachable. The seams are faked here; the database half of
/// the same contract is FormMaps.IntegrationTests/CareerFit/CareerFitEvaluatorTests.
/// </summary>
public class CareerFitEvaluatorTests(ITestOutputHelper output)
{
    private const double Tolerance = 1e-9;
    private const string RulesVersion = "1.0.0-draft.1";

    private static readonly string[] NumericFields =
        ["pca_route_fit", "competency_fit", "pca_index", "mil_fit", "personality_fit", "careerfit360", "careerfit_absolute"];

    private static readonly string[] StringFields =
        ["pca_winning_route", "competency_gate", "mil_gate", "personality_winning_route", "final_gate", "convergence_level"];

    private static readonly JsonElement Fixture = LoadFixture();
    private static readonly CareerFitRules Rules = CareerFitRulesJson.LoadEmbedded(RulesVersion);

    // ---------------------------------------------------------------- EvaluateCore: reference parity

    [Fact]
    public void EvaluateCore_reproduces_the_reference_engine_for_every_fixture_case_and_ranks_them()
    {
        // The same assertion CareerFitParityTests makes on EvaluateOwner, taken through the orchestrator's
        // path: validation, every scorable family, AssignRelativeFit. The fixture was scored with the
        // reference's single convergence pair, so the rule set's per_instrument recut is stripped.
        var ruleSet = CareerFitRulesResolver.Resolve(WithReferenceThresholds(Rules));
        Assert.Equal(14, ruleSet.Families.Count);

        var cases = 0;
        var comparisons = 0;
        var maxDeviation = 0.0;
        var failures = new List<string>();

        foreach (var c in Fixture.GetProperty("cases").EnumerateArray())
        {
            cases++;
            var caseId = c.GetProperty("case_id").GetInt32();
            var ranked = CareerFitEvaluator.EvaluateCore(ReadAssessment(c.GetProperty("inputs")), ruleSet);

            // Ranking: 14 families, ranks 1..14 unique, descending absolute, F21 relative spread.
            Assert.Equal(14, ranked.Count);
            Assert.Equal(Enumerable.Range(1, 14), ranked.Select(r => r.RankPosition!.Value));
            Assert.Equal(14, ranked.Select(r => r.OwnerId).Distinct().Count());
            for (var i = 1; i < ranked.Count; i++)
            {
                Assert.True(ranked[i - 1].CareerFitAbsolute >= ranked[i].CareerFitAbsolute, $"case {caseId}: rank {i} above rank {i + 1}");
            }

            Assert.Equal(100.0, ranked[0].CareerFitRelative);
            Assert.Equal(0.0, ranked[^1].CareerFitRelative);

            // Per family: the reference's numbers and labels.
            var expectedByFamily = c.GetProperty("expected_by_family");
            foreach (var actual in ranked)
            {
                var expected = expectedByFamily.GetProperty(actual.OwnerId.ToString());
                foreach (var field in NumericFields)
                {
                    var want = expected.GetProperty(field).GetDouble();
                    var got = NumericField(actual, field);
                    var deviation = Math.Abs(want - got);
                    comparisons++;
                    maxDeviation = Math.Max(maxDeviation, deviation);
                    if (!(deviation <= Tolerance))
                    {
                        failures.Add($"case {caseId} family {actual.OwnerId} {field}: expected {want:R} got {got:R}");
                    }
                }

                foreach (var field in StringFields)
                {
                    var want = expected.GetProperty(field).GetString();
                    var got = StringField(actual, field);
                    comparisons++;
                    if (want != got)
                    {
                        failures.Add($"case {caseId} family {actual.OwnerId} {field}: expected {want} got {got}");
                    }
                }
            }

            // The family the reference scores highest is rank 1.
            var bestExpected = expectedByFamily.EnumerateObject()
                .MaxBy(p => p.Value.GetProperty("careerfit_absolute").GetDouble()).Name;
            Assert.Equal(int.Parse(bestExpected), ranked[0].OwnerId);
        }

        output.WriteLine($"EvaluateCore parity: {cases} cases x 14 families, {comparisons} comparisons, max abs deviation {maxDeviation:E3}");
        Assert.Equal(60, cases);
        Assert.True(failures.Count == 0, $"{failures.Count} divergence(s):\n" + string.Join("\n", failures.Take(25)));
    }

    [Fact]
    public void EvaluateCore_validates_the_assessment_before_scoring_anything()
    {
        var ruleSet = CareerFitRulesResolver.Resolve(Rules);
        var valid = ReadAssessment(Fixture.GetProperty("cases")[0].GetProperty("inputs"));

        var ex = Assert.Throws<ArgumentException>(() =>
            CareerFitEvaluator.EvaluateCore(valid with { Pca = valid.Pca with { D = 100.5 } }, ruleSet));
        Assert.Equal("PCA.D must be between 0 and 100; got 100.5", ex.Message);

        var missing = new Dictionary<int, int>(valid.Competencies);
        missing.Remove(24);
        Assert.Equal("Competencies must contain IDs 1..24",
            Assert.Throws<ArgumentException>(() => CareerFitEvaluator.EvaluateCore(valid with { Competencies = missing }, ruleSet)).Message);
    }

    [Fact]
    public void Stored_inputs_re_score_to_the_bit_identical_run()
    {
        // The reason careerfit_runs."inputs" is the evaluate_owner assessment dict: a stored run must be
        // re-derivable. Serialise → parse → EvaluateCore must equal EvaluateCore on the original, bit for bit.
        var ruleSet = CareerFitRulesResolver.Resolve(Rules);
        foreach (var c in Fixture.GetProperty("cases").EnumerateArray().Take(10))
        {
            var original = ReadAssessment(c.GetProperty("inputs"));
            var roundTripped = CareerFitRunJson.ParseInputs(SampleStudentRows.Parse(CareerFitRunJson.SerializeInputs(original)));

            var expected = CareerFitEvaluator.EvaluateCore(original, ruleSet);
            var actual = CareerFitEvaluator.EvaluateCore(roundTripped, ruleSet);

            Assert.Equal(expected.Select(e => (e.OwnerId, e.CareerFitAbsolute, e.RankPosition)), actual.Select(e => (e.OwnerId, e.CareerFitAbsolute, e.RankPosition)));
            Assert.Equal(expected.Select(e => e.PcaIndex), actual.Select(e => e.PcaIndex));
            Assert.Equal(expected.Select(e => e.PersonalityFit), actual.Select(e => e.PersonalityFit));
        }
    }

    // ---------------------------------------------------------------- EvaluateAsync: the wiring

    [Fact]
    public async Task EvaluateAsync_reads_adapts_scores_writes_and_returns_the_run_in_rank_order()
    {
        var reader = new FakeReader(SampleRaw());
        var writer = new FakeWriter();
        var evaluator = new CareerFitEvaluator(reader, writer, new CareerFitRulesProvider(RulesVersion), NoDataV360Adapter.Instance);

        var run = await evaluator.EvaluateAsync(Student("student-1", "school-a"), "student-1");

        // What was written is what was returned.
        var written = Assert.Single(writer.Writes);
        Assert.Equal(writer.Receipt.RunId, run.Id);
        Assert.Equal(writer.Receipt.CreatedAt, run.CreatedAt);
        Assert.Same(written.Families, run.Families);
        Assert.Equal("student-1", run.UserId);
        Assert.Equal("school-a", run.SchoolId);
        Assert.Equal(RulesVersion, run.RulesVersion);
        Assert.Equal(new CareerFitInputSources("pca-1", "lia-1", "pers-1"), run.Sources);

        // Default graph: 1 (Work Adaptation) — the legacy scorer's, recorded, and the DISC taken from it.
        Assert.Equal(DiscGraphChoice.WorkAdaptation, run.DiscGraph);
        Assert.Equal(new PcaInput(89, 18, 18, 21), run.Inputs.Pca);
        Assert.Contains(run.Quality.Warnings, w => w.Code == InputWarningCodes.DiscGraphSelected);

        // Every rule-set competency matched by name (no repairs), the LIA tails untouched, personality from counts.
        Assert.Empty(run.Quality.UnknownCompetencyNames);
        Assert.Empty(run.Quality.DefaultedCompetencyIds);
        Assert.Equal(new MilInput(72, 58, 81, 47, 63), run.Inputs.Mil);
        Assert.All(run.Quality.PersonalityDerivation.Values, d => Assert.Equal(PersonalityPoleDerivation.Counts, d));
        Assert.Equal(70.0, run.Inputs.Personality.E); // 14 of 20 items to E
        Assert.Equal(30.0, run.Inputs.Personality.I);

        // 14 families, ranked, and rank order is the list order.
        Assert.Equal(14, run.Families.Count);
        Assert.Equal(Enumerable.Range(1, 14), run.Families.Select(f => f.RankPosition!.Value));
        Assert.Equal(run.Families[0], run.Best);
        Assert.Equal(Enumerable.Range(1, 14).OrderBy(i => i), run.Families.Select(f => f.OwnerId).OrderBy(i => i));
    }

    [Fact]
    public async Task EvaluateAsync_with_NoData_360_scores_zero_NOT_DETERMINABLE_and_never_reaches_VERY_HIGH()
    {
        // The documented P1–P3 consequence: 360 carries no evidence, so it is DIVERGENT for every family and
        // convergence can count at most three STRONG instruments. Stated in the quality record too.
        var writer = new FakeWriter();
        var evaluator = new CareerFitEvaluator(new FakeReader(SampleRaw()), writer, new CareerFitRulesProvider(RulesVersion), NoDataV360Adapter.Instance);

        var run = await evaluator.EvaluateAsync(Student("student-1", "school-a"), "student-1");

        Assert.Equal(V360Sources.NoData, run.Quality.V360Source);
        Assert.Contains(run.Quality.Warnings, w => w.Code == InputWarningCodes.V360NoData);
        Assert.False(run.Quality.HasRepairs);
        Assert.Empty(run.Inputs.V360Aggregates);
        Assert.Equal(Confidence.NotDeterminable, run.Inputs.CareerFit360Confidence);
        Assert.All(run.Families, f =>
        {
            Assert.Equal(0.0, f.CareerFit360);
            Assert.Null(f.CareerFit360Consensus);
            Assert.Equal(Confidence.NotDeterminable, f.CareerFit360Confidence);
            Assert.Equal(Support.Divergent, f.ConvergenceDetail.Supports["360"]);
            Assert.True(f.ConvergenceDetail.StrongCount <= 3);
            Assert.NotEqual(Convergence.VeryHigh, f.ConvergenceLevel);
        });

        // The persisted quality document says so explicitly.
        var quality = SampleStudentRows.Parse(CareerFitRunJson.SerializeInputQuality(run.Quality, run.Sources));
        Assert.False(quality.GetProperty("evidence").GetProperty("360").GetBoolean());
        Assert.True(quality.GetProperty("evidence").GetProperty("PCA").GetBoolean());
    }

    [Fact]
    public async Task EvaluateAsync_honours_the_graph_override_and_records_it()
    {
        var writer = new FakeWriter();
        var evaluator = new CareerFitEvaluator(new FakeReader(SampleRaw()), writer, new CareerFitRulesProvider(RulesVersion), NoDataV360Adapter.Instance);

        var run = await evaluator.EvaluateAsync(Student("student-1", "school-a"), "student-1", DiscGraphChoice.UnderPressure);

        Assert.Equal(DiscGraphChoice.UnderPressure, run.DiscGraph);
        Assert.Equal(DiscGraphChoice.UnderPressure, writer.Writes[0].DiscGraph);
        Assert.Equal(new PcaInput(87, 87, 26, 25), run.Inputs.Pca); // graph 2 of the sample
    }

    [Fact]
    public async Task EvaluateAsync_writes_nothing_when_the_reader_fails_closed()
    {
        var writer = new FakeWriter();
        var reader = new FakeReader(new CareerFitInputException(
            InputInstruments.Mil, InputWarningCodes.MilPercentilesMissing, "no completed LIA session"));
        var evaluator = new CareerFitEvaluator(reader, writer, new CareerFitRulesProvider(RulesVersion), NoDataV360Adapter.Instance);

        var ex = await Assert.ThrowsAsync<CareerFitInputException>(() => evaluator.EvaluateAsync(Student("student-1", "school-a"), "student-1"));

        Assert.Equal(InputInstruments.Mil, ex.Instrument);
        Assert.Empty(writer.Writes);
    }

    [Fact]
    public async Task EvaluateAsync_writes_nothing_when_an_adapter_fails_closed()
    {
        // The reader found a row but its jsonb is null (a session completed without percentiles): the
        // adapter's fail-closed rule, not a zero MIL.
        var writer = new FakeWriter();
        var raw = SampleRaw() with { LiaPercentiles = SampleStudentRows.JsonNull() };
        var evaluator = new CareerFitEvaluator(new FakeReader(raw), writer, new CareerFitRulesProvider(RulesVersion), NoDataV360Adapter.Instance);

        var ex = await Assert.ThrowsAsync<CareerFitInputException>(() => evaluator.EvaluateAsync(Student("student-1", "school-a"), "student-1"));

        Assert.Equal(InputWarningCodes.MilPercentilesMissing, ex.Code);
        Assert.Empty(writer.Writes);
    }

    // A wholly unmeasured competency block used to score: the adapter defaults all 24 ids to level 0 and
    // CalculateCompetencies reads them as measured zeros, so every family came back COMP_GATE=CRITICAL and
    // the run was persisted and ranked. "Critical behavioural gap on all fourteen families" is then a
    // finding about a student we hold no competency data for. Theory rather than Fact because the three
    // shapes reach it by different paths: SQL/jsonb null, an empty array, and names that match nothing.
    [Theory]
    [InlineData("null")]
    [InlineData("{\"PcaCmps\":[]}")]
    [InlineData("{\"PcaCmps\":[{\"CmpNom\":\"NO SUCH COMPETENCY\",\"Level\":3}]}")]
    public async Task EvaluateAsync_refuses_a_wholly_unmeasured_competency_block(string competencesJson)
    {
        var writer = new FakeWriter();
        var raw = SampleRaw() with { Competences = SampleStudentRows.Parse(competencesJson) };
        var evaluator = new CareerFitEvaluator(new FakeReader(raw), writer, new CareerFitRulesProvider(RulesVersion), NoDataV360Adapter.Instance);

        var ex = await Assert.ThrowsAsync<CareerFitInputException>(() => evaluator.EvaluateAsync(Student("student-1", "school-a"), "student-1"));

        Assert.Equal(InputInstruments.Competencies, ex.Instrument);
        Assert.Equal(InputWarningCodes.CompetenciesMissing, ex.Code);
        Assert.Empty(writer.Writes);
    }

    // The counterpart, and the reason the guard counts ids instead of testing for an empty block: a
    // PARTIAL gap is normal and must still score — one unreadable competency is not an unmeasured student.
    [Fact]
    public async Task EvaluateAsync_still_scores_when_only_some_competencies_are_missing()
    {
        var writer = new FakeWriter();
        var full = SampleStudentRows.Parse(SampleStudentRows.CompetencesJson(Rules));
        var trimmed = full.GetProperty("PcaCmps").EnumerateArray().Skip(1)
            .Select(e => e.GetRawText());
        var raw = SampleRaw() with
        {
            Competences = SampleStudentRows.Parse($"{{\"PcaCmps\":[{string.Join(',', trimmed)}]}}"),
        };
        var evaluator = new CareerFitEvaluator(new FakeReader(raw), writer, new CareerFitRulesProvider(RulesVersion), NoDataV360Adapter.Instance);

        var run = await evaluator.EvaluateAsync(Student("student-1", "school-a"), "student-1");

        Assert.Single(writer.Writes);
        Assert.Single(run.Quality.DefaultedCompetencyIds);
        Assert.Equal(Rules.Families.Count(f => f.Scorable), run.Families.Count);
    }

    // ---------------------------------------------------------------- fakes

    private static CareerFitRawInputs SampleRaw() => new(
        UserId: "student-1",
        SchoolId: "school-a",
        DiscResult: SampleStudentRows.Parse(SampleStudentRows.DiscJson),
        Competences: SampleStudentRows.Parse(SampleStudentRows.CompetencesJson(Rules)),
        LiaPercentiles: SampleStudentRows.Parse(SampleStudentRows.PercentilesJson),
        PersonalityDimensionScores: SampleStudentRows.Parse(SampleStudentRows.DimensionScoresJson()),
        ThreeSixty: null,
        V360RaterGroups: [],
        Sources: new CareerFitInputSources("pca-1", "lia-1", "pers-1"));

    private sealed class FakeReader : ICareerFitInputReader
    {
        private readonly CareerFitRawInputs? _raw;
        private readonly Exception? _failure;

        public FakeReader(CareerFitRawInputs raw) => _raw = raw;

        public FakeReader(Exception failure) => _failure = failure;

        public Task<CareerFitRawInputs> ReadAsync(RequestContext context, string userId, CancellationToken cancellationToken = default)
        {
            if (_failure is not null)
            {
                throw _failure;
            }

            Assert.Equal(_raw!.UserId, userId);
            return Task.FromResult(_raw);
        }
    }

    private sealed class FakeWriter : ICareerFitRunWriter
    {
        public CareerFitRunReceipt Receipt { get; } = new(Guid.NewGuid(), new DateTimeOffset(2026, 9, 3, 12, 0, 0, TimeSpan.Zero));

        public List<CareerFitEvaluation> Writes { get; } = [];

        public Task<CareerFitRunReceipt> WriteAsync(RequestContext context, CareerFitEvaluation evaluation, CancellationToken cancellationToken = default)
        {
            Writes.Add(evaluation);
            return Task.FromResult(Receipt);
        }
    }

    private static RequestContext Student(string userId, string? schoolId) =>
        RequestContext.Authenticated(
            new RequestActor(userId, FormMapsRoles.Student, $"{userId}@e.st", userId),
            schoolId, permissions: [],
            tokenSource: TokenSource.DevelopmentHeader, isDevelopmentOverride: true);

    // ---------------------------------------------------------------- fixture plumbing (CareerFitParityTests')

    private static JsonElement LoadFixture()
    {
        var assembly = Assembly.GetExecutingAssembly();
        var name = assembly.GetManifestResourceNames().Single(n => n.EndsWith("parity-fixture.json", StringComparison.Ordinal));
        using var stream = assembly.GetManifestResourceStream(name)!;
        return JsonDocument.Parse(stream).RootElement.Clone();
    }

    private static CareerFitRules WithReferenceThresholds(CareerFitRules rules)
    {
        var t = Fixture.GetProperty("thresholds");
        return rules with
        {
            Thresholds = rules.Thresholds with
            {
                Convergence = new ConvergenceThresholds(
                    StrongMin: t.GetProperty("strong_support_min").GetDouble(),
                    PartialMin: t.GetProperty("partial_support_min").GetDouble(),
                    PerInstrument: null),
            },
        };
    }

    private static CareerFitAssessment ReadAssessment(JsonElement inputs)
    {
        var pca = inputs.GetProperty("pca");
        var mil = inputs.GetProperty("mil");
        var p = inputs.GetProperty("personality");
        var competencies = inputs.GetProperty("competencies").EnumerateObject()
            .ToDictionary(kv => int.Parse(kv.Name), kv => kv.Value.GetInt32());
        var v360 = new Dictionary<string, V360Aggregate>(StringComparer.Ordinal);
        foreach (var v in inputs.GetProperty("v360").EnumerateObject())
        {
            v360[v.Name] = new V360Aggregate(v.Value.GetDouble());
        }

        return new CareerFitAssessment(
            Pca: new PcaInput(pca.GetProperty("D").GetDouble(), pca.GetProperty("I").GetDouble(), pca.GetProperty("S").GetDouble(), pca.GetProperty("C").GetDouble()),
            Competencies: competencies,
            Mil: new MilInput(mil.GetProperty("DC").GetInt32(), mil.GetProperty("RZ").GetInt32(), mil.GetProperty("VN").GetInt32(), mil.GetProperty("MT").GetInt32(), mil.GetProperty("OR").GetInt32()),
            Personality: new PersonalityInput(
                p.GetProperty("E").GetDouble(), p.GetProperty("I").GetDouble(), p.GetProperty("S").GetDouble(), p.GetProperty("N").GetDouble(),
                p.GetProperty("T").GetDouble(), p.GetProperty("F").GetDouble(), p.GetProperty("J").GetDouble(), p.GetProperty("P").GetDouble()),
            V360Aggregates: v360,
            CareerFit360Confidence: CareerFitEnums.ParseConfidence(inputs.GetProperty("careerfit360_confidence").GetString()!));
    }

    private static double NumericField(OwnerEvaluation e, string field) => field switch
    {
        "pca_route_fit" => e.PcaRouteFit,
        "competency_fit" => e.CompetencyFit,
        "pca_index" => e.PcaIndex,
        "mil_fit" => e.MilFit,
        "personality_fit" => e.PersonalityFit,
        "careerfit360" => e.CareerFit360,
        "careerfit_absolute" => e.CareerFitAbsolute,
        _ => throw new ArgumentOutOfRangeException(nameof(field), field, null),
    };

    private static string StringField(OwnerEvaluation e, string field) => field switch
    {
        "pca_winning_route" => e.PcaWinningRoute,
        "competency_gate" => e.CompetencyGate.ToReferenceValue(),
        "mil_gate" => e.MilGate.ToReferenceValue(),
        "personality_winning_route" => e.PersonalityWinningRoute,
        "final_gate" => e.FinalGate.ToReferenceValue(),
        "convergence_level" => e.ConvergenceLevel.ToReferenceValue(),
        _ => throw new ArgumentOutOfRangeException(nameof(field), field, null),
    };
}
