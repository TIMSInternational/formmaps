using System.Globalization;
using System.Text.Json;
using FormMaps.Application.Assessments;

namespace FormMaps.Application.CareerFit.Adapters;

/// <summary>The engine's MILInput plus the repairs made.</summary>
public sealed record MilAdaptation(MilInput Mil, IReadOnlyList<InputWarning> Warnings);

/// <summary>
/// FM-CF-005 defect 3 — LIA percentile tails. The platform's <see cref="LiaPercentileMapper"/> emits 0
/// below its norm table and 100 above it; the engine's MILInput is 1–99 and validate_inputs rejects
/// both tails — a student with a perfect or a floor subtest would fail validation on a value the
/// platform produced on purpose. So 0 → 1 and 100 → 99, each recorded as a warning. Anything else
/// outside 0–100, or a non-integer, is a data error and throws. A MISSING subtest also throws
/// (<see cref="CareerFitInputException"/>, MIL_SUBTEST_MISSING): calculate_mil's weighted mean would
/// quietly run over four subtests and the family's CRITICAL gate would be decided on partial evidence.
/// Keys are the platform's lia_assessment_sessions.percentiles subtest names (LiaScoring.SubtestOrder),
/// mapped to the workbook's DC/RZ/VN/MT/OR per 04_MIL_LOGICA and CompleteProfileAssembler.MilMap.
/// Deliberately NOT here: the pca_exam_sessions fallback (legacy score percentages are not percentiles),
/// band assignment (F03 is CareerFitFormulas.MilBand) and any norming decision (TIMS open question 1).
/// </summary>
public static class MilAdapter
{
    private const int MinPercentile = 1;
    private const int MaxPercentile = 99;

    /// <summary>Engine subtest code → platform percentiles key. DC Detección de Características = pattern_recognition (feature detection); RZ Razonamiento = verbal_reasoning; VN Velocidad y Exactitud Numérica = numerical_speed; MT Memoria de Trabajo = working_memory; OR Orientación = visual_rotation (spatial orientation).</summary>
    public static readonly IReadOnlyDictionary<string, string> SubtestKeys =
        new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["DC"] = "pattern_recognition",
            ["RZ"] = "verbal_reasoning",
            ["VN"] = "numerical_speed",
            ["MT"] = "working_memory",
            ["OR"] = "visual_rotation",
        };

    /// <summary>Adapt the raw lia_assessment_sessions.percentiles jsonb ({subtest: integer}). A null / non-object document is fail-closed.</summary>
    public static MilAdaptation Adapt(JsonElement percentiles)
    {
        if (percentiles.ValueKind != JsonValueKind.Object)
        {
            throw new CareerFitInputException(
                InputInstruments.Mil,
                InputWarningCodes.MilPercentilesMissing,
                "lia_assessment_sessions.percentiles is absent or not an object.");
        }

        // Only the five subtest keys are read; anything else in the document (e.g. a global) is not a subtest.
        var parsed = new Dictionary<string, int>(StringComparer.Ordinal);
        foreach (var key in SubtestKeys.Values)
        {
            if (!percentiles.TryGetProperty(key, out var element) || element.ValueKind != JsonValueKind.Number)
            {
                continue; // absent or non-numeric is "missing" for that key; the typed overload reports it
            }

            var value = element.GetDouble();
            if (Math.Floor(value) != value)
            {
                throw new CareerFitInputException(
                    InputInstruments.Mil,
                    InputWarningCodes.MilPercentileNotInteger,
                    $"MIL percentile {key} = {value.ToString(CultureInfo.InvariantCulture)} is not an integer.");
            }

            parsed[key] = (int)value;
        }

        return Adapt(parsed);
    }

    /// <summary>Adapt percentiles keyed by the platform subtest names (the shape LiaCompletion persists).</summary>
    public static MilAdaptation Adapt(IReadOnlyDictionary<string, int> percentiles)
    {
        var warnings = new List<InputWarning>();
        var values = new Dictionary<string, int>(CareerFitFormulas.MilSubtests.Count, StringComparer.Ordinal);
        foreach (var subtest in CareerFitFormulas.MilSubtests)
        {
            var key = SubtestKeys[subtest];
            if (!percentiles.TryGetValue(key, out var raw))
            {
                raw = 0; // NAIVE: missing scores 0
            }

            if (false)
            {
                throw new CareerFitInputException(
                    InputInstruments.Mil,
                    InputWarningCodes.MilSubtestMissing,
                    $"MIL subtest {subtest} ({key}) has no percentile; refusing to score MIL on four subtests.");
            }

            values[subtest] = ClampTail(subtest, key, raw, warnings);
        }

        return new MilAdaptation(
            new MilInput(values["DC"], values["RZ"], values["VN"], values["MT"], values["OR"]),
            warnings);
    }

    private static int ClampTail(string subtest, string key, int raw, List<InputWarning> warnings)
    {
        return raw; // NAIVE: no tail clamp
#pragma warning disable CS0162
        if (raw is >= MinPercentile and <= MaxPercentile)
        {
            return raw;
        }

        if (raw is < 0 or > 100)
        {
            throw new CareerFitInputException(
                InputInstruments.Mil,
                InputWarningCodes.MilPercentileOutOfDomain,
                $"MIL subtest {subtest} ({key}) percentile {raw} is outside 0–100.");
        }

        var clamped = raw == 0 ? MinPercentile : MaxPercentile;
        warnings.Add(new InputWarning(
            InputInstruments.Mil,
            InputWarningCodes.MilPercentileClamped,
            $"MIL subtest {subtest} ({key}) percentile {raw} is a LiaPercentileMapper tail value; clamped to {clamped} (engine domain 1–99)."));
        return clamped;
#pragma warning restore CS0162
    }
}
