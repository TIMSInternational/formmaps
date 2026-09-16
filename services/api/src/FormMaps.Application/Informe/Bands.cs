namespace FormMaps.Application.Informe;

// The one idea underneath every chart in the informe: every 0–100 scale has three bands —
// Baja < 34 · Media 34–66 · Alta ≥ 67 — and the thresholds are DRAWN (ticks on a bar, rings on the
// radar, notches in a ring, gridlines behind bars), so one glance answers "is this high?" without
// reading a number. The MIL instrument's own five-band vocabulary (Excede, Excepcional…) never
// reaches the page: the document has one band vocabulary.

/// <summary>The three value bands of a 0–100 score.</summary>
public enum Band
{
    Low,
    Med,
    High,
}

/// <summary>Band thresholds and classification.</summary>
public static class Bands
{
    /// <summary>Scores at or above this are Media.</summary>
    public const double MedFrom = 34;

    /// <summary>Scores at or above this are Alta.</summary>
    public const double HighFrom = 67;

    /// <summary>The drawn thresholds, in ascending order.</summary>
    public static IReadOnlyList<double> Thresholds { get; } = [MedFrom, HighFrom];

    /// <summary>≥ 67 High · ≥ 34 Med · else Low.</summary>
    public static Band Of(double value) => value >= HighFrom ? Band.High : value >= MedFrom ? Band.Med : Band.Low;

    /// <summary>The label key of a band: band.high / band.med / band.low.</summary>
    public static string LabelKey(this Band band) => band switch
    {
        Band.High => "band.high",
        Band.Med => "band.med",
        _ => "band.low",
    };
}
