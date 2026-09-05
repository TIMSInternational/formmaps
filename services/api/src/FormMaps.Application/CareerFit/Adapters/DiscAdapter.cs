using System.Globalization;
using System.Text.Json;
using FormMaps.Application.Assessments;

namespace FormMaps.Application.CareerFit.Adapters;

/// <summary>The engine's PCAInput plus the graph it was taken from and the repairs made.</summary>
public sealed record DiscAdaptation(PcaInput Pca, DiscGraphChoice Graph, IReadOnlyList<InputWarning> Warnings);

/// <summary>
/// FM-CF-005 defect 1 — which DISC graph. TIMS returns DISC across three graphs (Pca{D,I,S,C}{1..3});
/// the platform's canonical <c>DiscMatrix.Primary</c> is graph 2 (Under Pressure — PcaNormalization.cs,
/// AssessmentProfile.cs) while legacy /careers/score, the FM-CF-013 shadow target, is fed graph 1 (Work
/// Adaptation — useTimsQueries.ts pcaD1..pcaC1). Two callers, two graphs, no parameter: a shadow run
/// would compare the engine on one profile against legacy on another and report the difference as
/// engine error. So the graph is an explicit <see cref="DiscGraphChoice"/>, defaulting to
/// <see cref="DiscGraphChoice.WorkAdaptation"/> (matches the legacy scorer for the shadow; TIMS open
/// question 4 decides the final value), and the choice is recorded in the adaptation. It never reads
/// <c>Primary</c>. Factors are clamped to 0–100 with a warning; NaN throws.
///
/// WHY THE CHOSEN GRAPH IS READ FROM THE RAW JSONB. <see cref="PcaNormalization.NormalizeDisc"/> fills a
/// missing axis with <c>?? 0</c> — the legacy reader's behaviour, correct for its own callers and NOT
/// changed here. For the engine that substitution invents data: a DISC 0 is not "unknown", it is the most
/// extreme value the scale carries, and an archetype whose rule for that factor is PASSIVE scores it 100
/// (F01). A partially present graph is therefore NOT scorable and fails closed with
/// <see cref="InputWarningCodes.DiscFactorMissing"/>. So the four axes of the CHOSEN graph are walked
/// straight out of the jsonb here — exactly as <see cref="CompetencyAdapter"/> walks PcaCmps for the same
/// reason — while <see cref="PcaNormalization"/> is still what decides "no DISC at all".
///
/// Deliberately NOT here: choosing the graph per family, any DISC arithmetic (F01 is
/// CareerFitFormulas.CalculatePcaRouteFit), and any repair of a partial graph — there is nothing to repair
/// a DISC factor from.
/// </summary>
public static class DiscAdapter
{
    /// <summary>The graph the adapters use when the caller does not choose: graph 1, what legacy /careers/score receives.</summary>
    public const DiscGraphChoice DefaultGraph = DiscGraphChoice.WorkAdaptation;

    /// <summary>
    /// Adapt the raw pca_results.discResult jsonb. Three fail-closed cases, in this order
    /// (<see cref="CareerFitInputException"/> each): no DISC at all (DISC_MISSING), the chosen graph wholly
    /// absent (DISC_GRAPH_ABSENT), and the chosen graph only PARTIALLY present (DISC_FACTOR_MISSING). All
    /// three are places where the normalised matrix would hand back a substituted 0 and the engine would
    /// score a profile nobody measured.
    /// </summary>
    public static DiscAdaptation Adapt(JsonElement discResult, DiscGraphChoice graph = DefaultGraph)
    {
        RequireKnownGraph(graph);

        // NormalizeDisc still answers exactly one question — "is there any DISC here at all?" — which keeps
        // "no DISC" identical to what every other reader of this column calls no DISC.
        if (PcaNormalization.NormalizeDisc(discResult) is null)
        {
            throw new CareerFitInputException(
                InputInstruments.Pca, InputWarningCodes.DiscMissing, "pca_results.discResult holds no DISC graph.");
        }

        return Adapt(ReadChosenGraph(discResult, graph), graph);
    }

    /// <summary>
    /// Adapt an already-normalised matrix. The matrix cannot say whether a graph was absent (it stores
    /// zeros), so callers holding the raw jsonb should prefer the <see cref="JsonElement"/> overload.
    /// </summary>
    public static DiscAdaptation Adapt(DiscMatrix matrix, DiscGraphChoice graph = DefaultGraph)
    {
        RequireKnownGraph(graph);
        return Adapt(
            graph switch
            {
                DiscGraphChoice.WorkAdaptation => matrix.WorkAdaptation,
                DiscGraphChoice.UnderPressure => matrix.UnderPressure,
                DiscGraphChoice.Natural => matrix.SelfImage,
                _ => throw new ArgumentOutOfRangeException(nameof(graph), graph, "Unknown DISC graph"),
            },
            graph);
    }

    // The shared tail of both overloads: record the choice, clamp the four factors, done.
    private static DiscAdaptation Adapt(DiscGraph selected, DiscGraphChoice graph)
    {
        var warnings = new List<InputWarning>
        {
            new(InputInstruments.Pca, InputWarningCodes.DiscGraphSelected, $"DISC taken from graph {(int)graph} ({graph})."),
        };

        var pca = new PcaInput(
            Clamp("D", selected.D, warnings),
            Clamp("I", selected.I, warnings),
            Clamp("S", selected.S, warnings),
            Clamp("C", selected.C, warnings));

        return new DiscAdaptation(pca, graph, warnings);
    }

    private static void RequireKnownGraph(DiscGraphChoice graph)
    {
        if (!Enum.IsDefined(graph))
        {
            throw new CareerFitInputException(
                InputInstruments.Pca,
                InputWarningCodes.DiscGraphChoiceInvalid,
                $"DISC graph choice {(int)graph} is not one of WorkAdaptation (1), UnderPressure (2), Natural (3).");
        }
    }

    /// <summary>
    /// The four axes of the CHOSEN graph, read straight out of the jsonb with the Level left NULLABLE —
    /// <see cref="PcaNormalization.GraphAt"/>'s selection rules without its <c>?? 0</c>. All four absent is
    /// DISC_GRAPH_ABSENT (the graph was never taken); some absent is DISC_FACTOR_MISSING (the graph was taken
    /// and is incomplete). "Absent" covers a key that is not there, a JSON null, and a value that is neither a
    /// number nor a numeric string — the same three things PcaNormalization's <c>num</c> turns into
    /// undefined, and all three equally unmeasured.
    /// </summary>
    private static DiscGraph ReadChosenGraph(JsonElement discResult, DiscGraphChoice graph)
    {
        var n = (int)graph;
        var read = CareerFitFormulas.PcaFactors
            .Select(axis => (Axis: axis, Value: Num(GetProp(discResult, $"Pca{axis}{n}", $"pca{axis}{n}"))))
            .ToList();

        var unmeasured = read.Where(a => a.Value is null).Select(a => $"{a.Axis} (Pca{a.Axis}{n})").ToList();
        if (unmeasured.Count == read.Count)
        {
            throw new CareerFitInputException(
                InputInstruments.Pca,
                InputWarningCodes.DiscGraphAbsent,
                $"DISC graph {n} ({graph}) is absent from pca_results.discResult; refusing to score a zero profile.");
        }

        if (unmeasured.Count > 0)
        {
            throw new CareerFitInputException(
                InputInstruments.Pca,
                InputWarningCodes.DiscFactorMissing,
                $"DISC graph {n} ({graph}) is only PARTIALLY present in pca_results.discResult: "
                + $"{string.Join(", ", unmeasured)} absent, null or non-numeric. Refusing to substitute 0 for an "
                + "unmeasured factor — 0 is a real, extreme DISC value (a PASSIVE route rule scores it 100), so "
                + "the substitute would invent a profile rather than record a gap.");
        }

        return new DiscGraph(read[0].Value!.Value, read[1].Value!.Value, read[2].Value!.Value, read[3].Value!.Value);
    }

    // PcaNormalization.Num: a JSON number → its value; a non-empty numeric string → parsed; anything else →
    // null. Duplicated here rather than exposed, so that method keeps its exact legacy contract for its own
    // callers — the same reason CompetencyAdapter carries its own copy.
    private static double? Num(JsonElement? element)
    {
        if (element is not { } value)
        {
            return null;
        }

        return value.ValueKind switch
        {
            JsonValueKind.Number => value.GetDouble(),
            JsonValueKind.String when !string.IsNullOrWhiteSpace(value.GetString())
                && double.TryParse(value.GetString(), NumberStyles.Float, CultureInfo.InvariantCulture, out var parsed) => parsed,
            _ => null,
        };
    }

    // PcaNormalization.GetProp: first present, non-null property of the PascalCase / camelCase pair.
    private static JsonElement? GetProp(JsonElement obj, string first, string second)
    {
        if (obj.ValueKind != JsonValueKind.Object)
        {
            return null;
        }

        if (obj.TryGetProperty(first, out var a) && a.ValueKind != JsonValueKind.Null)
        {
            return a;
        }

        if (obj.TryGetProperty(second, out var b) && b.ValueKind != JsonValueKind.Null)
        {
            return b;
        }

        return null;
    }

    private static double Clamp(string factor, double value, List<InputWarning> warnings)
    {
        if (double.IsNaN(value))
        {
            throw new CareerFitInputException(
                InputInstruments.Pca, InputWarningCodes.DiscFactorNotANumber, $"DISC factor {factor} is NaN.");
        }

        if (value is >= 0 and <= 100)
        {
            return value;
        }

        var clamped = Math.Clamp(value, 0, 100);
        warnings.Add(new InputWarning(
            InputInstruments.Pca,
            InputWarningCodes.DiscFactorClamped,
            $"DISC factor {factor} was {value.ToString(CultureInfo.InvariantCulture)}; clamped to {clamped.ToString(CultureInfo.InvariantCulture)}."));
        return clamped;
    }
}
