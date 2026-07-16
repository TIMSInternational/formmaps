namespace FormMaps.Application.Assessments;

/// <summary>One quintile band: Spanish name + English label + hex color.</summary>
public sealed record MilBand(string Band, string LabelEn, string Color);

/// <summary>Per-domain composite entry (camelCase on the wire: type/percent/weight/band/labelEn/color).</summary>
public sealed record MilDomainResult(
    string Type,
    double Percent,
    int Weight,
    string Band,
    string LabelEn,
    string Color);

/// <summary>The 300-point weighted composite result (serialized as `weightedComposite`).</summary>
public sealed record MilCompositeResult(
    int Raw,
    int Percent,
    string Band,
    string LabelEn,
    string Color,
    IReadOnlyList<MilDomainResult> PerDomain);

/// <summary>
/// Faithful port of the legacy TIMS 300-point weighted composite
/// (api/src/lib/lia/scoring.ts — <c>weightedComposite</c> / <c>classifyBand</c> / DOMAIN_WEIGHTS /
/// BAND_TABLE). Deterministic. Bands are provisional 20-point quintiles; the boundary value belongs
/// to the LOWER band; the composite band is classified on the EXACT (unrounded) percent so a value
/// just over a cut-off is not misclassified by display rounding.
/// </summary>
public static class MilComposite
{
    // Confirmed TIMS weights (sum = 300), in the legacy Object.entries iteration order — this is the
    // perDomain output order (NOT the MIL_EXAM_MAP order).
    private static readonly (string Type, int Weight)[] DomainWeights =
    [
        ("PatternRecognition", 20),
        ("VisualRotation", 100),
        ("NumericVelocity", 60),
        ("WorkingMemory", 80),
        ("VerbalReasoning", 40),
    ];

    // Ordered low -> high; maxInclusive is the quintile upper bound (boundary belongs to lower band).
    private static readonly (double MaxInclusive, string Band, string LabelEn, string Color)[] BandTable =
    [
        (20, "Insuficiente", "Insufficient", "#dc2626"),
        (40, "Bajo", "Low", "#d97706"),
        (60, "Adecuado", "Adequate", "#FFD600"),
        (80, "Excede", "Exceeds", "#059669"),
        (100, "Excepcional", "Exceptional", "#065292"),
    ];

    public static MilBand ClassifyBand(double percent)
    {
        foreach (var (maxInclusive, band, labelEn, color) in BandTable)
        {
            if (percent <= maxInclusive)
            {
                return new MilBand(band, labelEn, color);
            }
        }

        // percent > 100 (defensive): top band.
        var (_, topBand, topLabel, topColor) = BandTable[^1];
        return new MilBand(topBand, topLabel, topColor);
    }

    public static MilCompositeResult Compute(IReadOnlyDictionary<string, double> perDomainPercent)
    {
        var perDomain = new List<MilDomainResult>(DomainWeights.Length);
        double raw = 0;
        foreach (var (type, weight) in DomainWeights)
        {
            var percent = perDomainPercent.TryGetValue(type, out var p) ? p : 0;
            var info = ClassifyBand(percent);
            perDomain.Add(new MilDomainResult(type, percent, weight, info.Band, info.LabelEn, info.Color));
            raw += percent / 100 * weight;
        }

        // Classify on the exact (unrounded) percent; round only for display.
        var exactPercent = raw / 300 * 100;
        var top = ClassifyBand(exactPercent);

        return new MilCompositeResult(
            Raw: (int)Math.Round(raw, MidpointRounding.AwayFromZero),
            Percent: (int)Math.Round(exactPercent, MidpointRounding.AwayFromZero),
            Band: top.Band,
            LabelEn: top.LabelEn,
            Color: top.Color,
            PerDomain: perDomain);
    }
}
