namespace FormMaps.Application.Assessments;

// ---- Integration records (legacy vocationalIntegrationService.ts) ----

public sealed record IntegrationWeights(double ThreeSixty, double Pca, double Mil);

public sealed record IntegrationBands(double Strong, double ModerateHigh, double Medium);

public sealed record IntegrationConfig(
    string InstrumentVersion,
    IntegrationWeights IntegrationWeights,
    ScoringBands Bands);

public sealed record IntegrationInputs(double? ThreeSixty, double? PcaScore, double? MilScore);

public sealed record Competence(string Name, double Level);

public sealed record MilDomains(
    double MilReasoning,
    double MilDetection,
    double MilNumeric,
    double MilMemory,
    double MilOrientation);

public abstract record IntegrationOutcome
{
    public abstract string Status { get; }
}

public sealed record IntegrationNotReady(IReadOnlyList<string> Missing) : IntegrationOutcome
{
    public override string Status => "not_ready";
}

public sealed record IntegratedResultPayload(
    string InstrumentVersion,
    double IntegratedComposite,
    string Band,
    double ThreeSixtyScore,
    double PcaScore,
    double MilScore,
    IntegrationWeights WeightsApplied) : IntegrationOutcome
{
    public override string Status => "ready";
}

/// <summary>
/// Pure port of legacy services/vocationalIntegrationService.ts — fuses three channel scores (the
/// vocational-360 composite, PCA competences, MIL cognitive) into an integratedComposite. Shares
/// <see cref="VocationalScoring.Band"/> / <see cref="VocationalScoring.Round2"/>. I/O-free; the service
/// persists the result (all Decimal columns are emitted as JSON numbers via Number(Decimal), not strings).
/// </summary>
public static class VocationalIntegration
{
    /// <summary>Mean competence level (1-4) → 0-100; null on empty (legacy competencesToScore).</summary>
    public static double? CompetencesToScore(IReadOnlyList<Competence> competences)
    {
        if (competences.Count == 0)
        {
            return null;
        }

        var mean = competences.Sum(c => c.Level) / competences.Count;
        return VocationalScoring.Round2((mean - 1) / 3 * 100);
    }

    /// <summary>Mean of the five MIL domain percentiles (legacy milToScore).</summary>
    public static double MilToScore(MilDomains mil)
    {
        var vals = new[] { mil.MilReasoning, mil.MilDetection, mil.MilNumeric, mil.MilMemory, mil.MilOrientation };
        return VocationalScoring.Round2(vals.Sum() / vals.Length);
    }

    /// <summary>Renormalize the three integration weights to sum 1; all-zero if the base sums to 0 (legacy normalizeIntegrationWeights).</summary>
    public static IntegrationWeights NormalizeIntegrationWeights(IntegrationWeights w)
    {
        var sum = w.ThreeSixty + w.Pca + w.Mil;
        if (sum == 0)
        {
            return new IntegrationWeights(0, 0, 0);
        }

        return new IntegrationWeights(w.ThreeSixty / sum, w.Pca / sum, w.Mil / sum);
    }

    /// <summary>Weighted sum of the three channels, rounded (legacy integrate).</summary>
    public static double Integrate(double threeSixty, double pca, double mil, IntegrationWeights w) =>
        VocationalScoring.Round2((threeSixty * w.ThreeSixty) + (pca * w.Pca) + (mil * w.Mil));

    /// <summary>Orchestrator (legacy computeIntegratedResult): readiness gate (ordered missing [360, pca, mil]) → composite.</summary>
    public static IntegrationOutcome ComputeIntegratedResult(IntegrationConfig config, IntegrationInputs inputs)
    {
        var missing = new List<string>();
        if (inputs.ThreeSixty is null)
        {
            missing.Add("360");
        }

        if (inputs.PcaScore is null)
        {
            missing.Add("pca");
        }

        if (inputs.MilScore is null)
        {
            missing.Add("mil");
        }

        if (missing.Count != 0)
        {
            return new IntegrationNotReady(missing);
        }

        var w = NormalizeIntegrationWeights(config.IntegrationWeights);
        var composite = Integrate(inputs.ThreeSixty!.Value, inputs.PcaScore!.Value, inputs.MilScore!.Value, w);
        return new IntegratedResultPayload(
            InstrumentVersion: config.InstrumentVersion,
            IntegratedComposite: composite,
            Band: VocationalScoring.Band(composite, config.Bands),
            ThreeSixtyScore: inputs.ThreeSixty!.Value,
            PcaScore: inputs.PcaScore!.Value,
            MilScore: inputs.MilScore!.Value,
            WeightsApplied: w);
    }
}
