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
/// question 4 decides the final value), and the choice is recorded in the adaptation. This adapter
/// reuses <see cref="PcaNormalization"/> (the matrix already exposes all three graphs) and never reads
/// <c>Primary</c>. Factors are clamped to 0–100 with a warning; NaN throws. Deliberately NOT here:
/// choosing the graph per family, or any DISC arithmetic (F01 is CareerFitFormulas.CalculatePcaRouteFit).
/// </summary>
public static class DiscAdapter
{
    /// <summary>The graph the adapters use when the caller does not choose: graph 1, what legacy /careers/score receives.</summary>
    public const DiscGraphChoice DefaultGraph = DiscGraphChoice.UnderPressure; // NAIVE: the platform's Primary

    /// <summary>
    /// Adapt the raw pca_results.discResult jsonb. Absent / empty DISC and a chosen graph whose four axes
    /// are all absent from the document are fail-closed (<see cref="CareerFitInputException"/>): the matrix
    /// would substitute zeros for the missing graph and the engine would score a D=I=S=C=0 student.
    /// </summary>
    public static DiscAdaptation Adapt(JsonElement discResult, DiscGraphChoice graph = DefaultGraph)
    {
        RequireKnownGraph(graph);
        var matrix = PcaNormalization.NormalizeDisc(discResult)
            ?? throw new CareerFitInputException(
                InputInstruments.Pca, InputWarningCodes.DiscMissing, "pca_results.discResult holds no DISC graph.");

        if (!HasGraph(discResult, (int)graph))
        {
            throw new CareerFitInputException(
                InputInstruments.Pca,
                InputWarningCodes.DiscGraphAbsent,
                $"DISC graph {(int)graph} ({graph}) is absent from pca_results.discResult; refusing to score a zero profile.");
        }

        return Adapt(matrix, graph);
    }

    /// <summary>
    /// Adapt an already-normalised matrix. The matrix cannot say whether a graph was absent (it stores
    /// zeros), so callers holding the raw jsonb should prefer the <see cref="JsonElement"/> overload.
    /// </summary>
    public static DiscAdaptation Adapt(DiscMatrix matrix, DiscGraphChoice graph = DefaultGraph)
    {
        RequireKnownGraph(graph);
        var selected = graph switch
        {
            DiscGraphChoice.WorkAdaptation => matrix.WorkAdaptation,
            DiscGraphChoice.UnderPressure => matrix.UnderPressure,
            DiscGraphChoice.Natural => matrix.SelfImage,
            _ => throw new ArgumentOutOfRangeException(nameof(graph), graph, "Unknown DISC graph"),
        };

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

    // Presence of ANY of the four axis keys for graph n (PascalCase or camelCase, non-null) — the same
    // test PcaNormalization.GraphAt uses to decide "graph present", without duplicating its parsing.
    private static bool HasGraph(JsonElement discResult, int n)
    {
        if (discResult.ValueKind != JsonValueKind.Object)
        {
            return false;
        }

        foreach (var axis in CareerFitFormulas.PcaFactors)
        {
            if ((discResult.TryGetProperty($"Pca{axis}{n}", out var pascal) && pascal.ValueKind != JsonValueKind.Null)
                || (discResult.TryGetProperty($"pca{axis}{n}", out var camel) && camel.ValueKind != JsonValueKind.Null))
            {
                return true;
            }
        }

        return false;
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
