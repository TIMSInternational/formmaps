using System.Text.Json;
using FormMaps.Application.Assessments;
using FormMaps.Application.CareerFit;
using FormMaps.Application.CareerFit.Adapters;

namespace FormMaps.UnitTests.CareerFit.Adapters;

/// <summary>
/// FM-CF-005 defect 3: LiaPercentileMapper emits 0 below its table and 100 above it; the engine's
/// MILInput is 1–99. And a missing subtest must not become a four-subtest MIL fit.
/// </summary>
public class MilAdapterTests
{
    private static JsonElement J(string json)
    {
        using var doc = JsonDocument.Parse(json);
        return doc.RootElement.Clone();
    }

    private static Dictionary<string, int> All(int value) =>
        LiaScoring.SubtestOrder.ToDictionary(s => s, _ => value, StringComparer.Ordinal);

    [Fact]
    public void The_platform_really_emits_0_and_100_at_the_tails()
    {
        // Not exotic: the norm table's own first row maps ANY negative final score (more wrong than right
        // after the penalty) to 0, and its last row maps a perfect 60/60 to 100 — routine values in
        // lia_assessment_sessions.percentiles.
        Assert.Equal(0, LiaPercentileMapper.GetPercentile("pattern_recognition", -1));
        Assert.Equal(100, LiaPercentileMapper.GetPercentile("pattern_recognition", 60));
        // ...and the engine rejects both.
        Assert.Throws<ArgumentException>(() => CareerFitFormulas.RequireRange("MIL.DC", 0, 1, 99));
        Assert.Throws<ArgumentException>(() => CareerFitFormulas.RequireRange("MIL.DC", 100, 1, 99));
    }

    [Fact]
    public void Defect3_percentile_0_clamps_to_1_and_100_to_99_each_with_a_warning()
    {
        var percentiles = All(50);
        percentiles["pattern_recognition"] = 0;
        percentiles["working_memory"] = 100;

        var result = MilAdapter.Adapt(percentiles);

        Assert.Equal(new MilInput(DC: 1, RZ: 50, VN: 50, MT: 99, OR: 50), result.Mil);
        var clamps = result.Warnings.Where(w => w.Code == InputWarningCodes.MilPercentileClamped).ToList();
        Assert.Equal(2, clamps.Count);
        Assert.Contains(clamps, w => w.Message.Contains("DC (pattern_recognition) percentile 0") && w.Message.Contains("clamped to 1"));
        Assert.Contains(clamps, w => w.Message.Contains("MT (working_memory) percentile 100") && w.Message.Contains("clamped to 99"));
        Assert.All(clamps, w => Assert.Equal(InputInstruments.Mil, w.Instrument));
        CareerFitFormulas.ValidateInputs(
            new PcaInput(1, 1, 1, 1), Enumerable.Range(1, 24).ToDictionary(i => i, _ => 1), result.Mil, new PersonalityInput(1, 1, 1, 1, 1, 1, 1, 1));
    }

    [Fact]
    public void In_range_percentiles_pass_through_untouched_with_no_warning()
    {
        var percentiles = new Dictionary<string, int>(StringComparer.Ordinal)
        {
            ["pattern_recognition"] = 1,
            ["verbal_reasoning"] = 99,
            ["numerical_speed"] = 38,
            ["working_memory"] = 57,
            ["visual_rotation"] = 82,
        };

        var result = MilAdapter.Adapt(percentiles);

        Assert.Equal(new MilInput(1, 99, 38, 57, 82), result.Mil);
        Assert.Empty(result.Warnings);
    }

    [Fact]
    public void Subtest_keys_map_to_the_workbook_codes_per_04_MIL_LOGICA()
    {
        // DC Detección de Características = pattern recognition (legacy feature-detection-001);
        // RZ Razonamiento = verbal reasoning; VN Velocidad y Exactitud Numérica = numerical speed;
        // MT Memoria de Trabajo = working memory; OR Orientación = visual rotation (spatial-orientation-001).
        var percentiles = new Dictionary<string, int>(StringComparer.Ordinal)
        {
            ["pattern_recognition"] = 11,
            ["verbal_reasoning"] = 22,
            ["numerical_speed"] = 33,
            ["working_memory"] = 44,
            ["visual_rotation"] = 55,
        };

        var mil = MilAdapter.Adapt(percentiles).Mil;

        Assert.Equal(11, mil.DC);
        Assert.Equal(22, mil.RZ);
        Assert.Equal(33, mil.VN);
        Assert.Equal(44, mil.MT);
        Assert.Equal(55, mil.OR);
        Assert.Equal(CareerFitFormulas.MilSubtests.OrderBy(s => s), MilAdapter.SubtestKeys.Keys.OrderBy(k => k));
        Assert.Equal(LiaScoring.SubtestOrder.OrderBy(s => s), MilAdapter.SubtestKeys.Values.OrderBy(s => s));
    }

    [Fact]
    public void Defect3_a_missing_subtest_throws_a_typed_exception_instead_of_scoring_four()
    {
        var percentiles = All(50);
        percentiles.Remove("numerical_speed");

        var ex = Assert.Throws<CareerFitInputException>(() => MilAdapter.Adapt(percentiles));

        Assert.Equal(InputInstruments.Mil, ex.Instrument);
        Assert.Equal(InputWarningCodes.MilSubtestMissing, ex.Code);
        Assert.Contains("VN (numerical_speed)", ex.Message);
    }

    [Fact]
    public void A_missing_subtest_in_the_jsonb_throws_too_including_a_non_numeric_value()
    {
        Assert.Equal(
            InputWarningCodes.MilSubtestMissing,
            Assert.Throws<CareerFitInputException>(() => MilAdapter.Adapt(J("""{"pattern_recognition":50,"verbal_reasoning":50,"numerical_speed":50,"working_memory":50}"""))).Code);
        Assert.Equal(
            InputWarningCodes.MilSubtestMissing,
            Assert.Throws<CareerFitInputException>(() => MilAdapter.Adapt(J("""{"pattern_recognition":50,"verbal_reasoning":50,"numerical_speed":50,"working_memory":50,"visual_rotation":null}"""))).Code);
        Assert.Equal(InputWarningCodes.MilPercentilesMissing, Assert.Throws<CareerFitInputException>(() => MilAdapter.Adapt(J("null"))).Code);
        Assert.Equal(InputWarningCodes.MilPercentilesMissing, Assert.Throws<CareerFitInputException>(() => MilAdapter.Adapt(J("[]"))).Code);
    }

    [Fact]
    public void The_jsonb_shape_LiaCompletion_persists_adapts_with_tail_clamps()
    {
        var raw = J("""{"pattern_recognition":100,"verbal_reasoning":57,"numerical_speed":0,"working_memory":38,"visual_rotation":82,"global":55.4}""");

        var result = MilAdapter.Adapt(raw);

        Assert.Equal(new MilInput(99, 57, 1, 38, 82), result.Mil);
        Assert.Equal(2, result.Warnings.Count);
    }

    [Fact]
    public void Out_of_domain_and_fractional_percentiles_are_data_errors_not_clamps()
    {
        var negative = All(50);
        negative["visual_rotation"] = -1;
        Assert.Equal(InputWarningCodes.MilPercentileOutOfDomain, Assert.Throws<CareerFitInputException>(() => MilAdapter.Adapt(negative)).Code);

        var over = All(50);
        over["visual_rotation"] = 101;
        Assert.Equal(InputWarningCodes.MilPercentileOutOfDomain, Assert.Throws<CareerFitInputException>(() => MilAdapter.Adapt(over)).Code);

        Assert.Equal(
            InputWarningCodes.MilPercentileNotInteger,
            Assert.Throws<CareerFitInputException>(() => MilAdapter.Adapt(J("""{"pattern_recognition":50.5,"verbal_reasoning":50,"numerical_speed":50,"working_memory":50,"visual_rotation":50}"""))).Code);
    }
}
