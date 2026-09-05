using System.Text.Json.Serialization;

namespace FormMaps.Application.CareerFit;

// FM-CF-004. The four closed vocabularies of docs/careerfit/sources/formmaps_engine_reference.py
// (Gate, Confidence, Support) and the convergence ladder of 14_GATES_CONVERG B. Each member is
// serialised — by System.Text.Json and by ToReferenceValue() — to the reference's exact string value,
// so an audit row or a payload compares byte-for-byte against the Python engine's output. Nothing
// else lives here: no Spanish labels, no product copy (FM-CF-011 owns presentation).

/// <summary>
/// Gate state of an instrument or of the whole evaluation (reference <c>Gate</c>; workbook 14_GATES_CONVERG A).
/// Declared in severity order so <see cref="CareerFitFormulas.CombineGates"/> can take the maximum.
/// Gates never discard a family — they change its label and explanation.
/// </summary>
[JsonConverter(typeof(JsonStringEnumConverter<Gate>))]
public enum Gate
{
    [JsonStringEnumMemberName("SATISFIED")] Satisfied = 0,
    [JsonStringEnumMemberName("CONDITIONED")] Conditioned = 1,
    [JsonStringEnumMemberName("CRITICAL")] Critical = 2,
}

/// <summary>360 confidence label (reference <c>Confidence</c>; F05). NOT_DETERMINABLE = fewer than two valid sources.</summary>
[JsonConverter(typeof(JsonStringEnumConverter<Confidence>))]
public enum Confidence
{
    [JsonStringEnumMemberName("HIGH")] High,
    [JsonStringEnumMemberName("MEDIUM")] Medium,
    [JsonStringEnumMemberName("LOW")] Low,
    [JsonStringEnumMemberName("NOT_DETERMINABLE")] NotDeterminable,
}

/// <summary>How strongly one instrument supports a family (reference <c>Support</c>; F22/F23).</summary>
[JsonConverter(typeof(JsonStringEnumConverter<Support>))]
public enum Support
{
    [JsonStringEnumMemberName("STRONG")] Strong,
    [JsonStringEnumMemberName("PARTIAL")] Partial,
    [JsonStringEnumMemberName("DIVERGENT")] Divergent,
}

/// <summary>Cross-instrument convergence (reference <c>convergence_level</c>; 14_GATES_CONVERG B): 4/3/2/other strong instruments.</summary>
[JsonConverter(typeof(JsonStringEnumConverter<Convergence>))]
public enum Convergence
{
    [JsonStringEnumMemberName("VERY_HIGH")] VeryHigh,
    [JsonStringEnumMemberName("SOLID")] Solid,
    [JsonStringEnumMemberName("PARTIAL")] Partial,
    [JsonStringEnumMemberName("DIVERGENT")] Divergent,
}

/// <summary>Reference string values for the engine enums, and the strict parsers back (unknown text throws).</summary>
public static class CareerFitEnums
{
    /// <summary>"SATISFIED" / "CONDITIONED" / "CRITICAL".</summary>
    public static string ToReferenceValue(this Gate gate) => gate switch
    {
        Gate.Satisfied => "SATISFIED",
        Gate.Conditioned => "CONDITIONED",
        Gate.Critical => "CRITICAL",
        _ => throw new ArgumentOutOfRangeException(nameof(gate), gate, "Unknown gate"),
    };

    /// <summary>"HIGH" / "MEDIUM" / "LOW" / "NOT_DETERMINABLE".</summary>
    public static string ToReferenceValue(this Confidence confidence) => confidence switch
    {
        Confidence.High => "HIGH",
        Confidence.Medium => "MEDIUM",
        Confidence.Low => "LOW",
        Confidence.NotDeterminable => "NOT_DETERMINABLE",
        _ => throw new ArgumentOutOfRangeException(nameof(confidence), confidence, "Unknown confidence"),
    };

    /// <summary>"STRONG" / "PARTIAL" / "DIVERGENT".</summary>
    public static string ToReferenceValue(this Support support) => support switch
    {
        Support.Strong => "STRONG",
        Support.Partial => "PARTIAL",
        Support.Divergent => "DIVERGENT",
        _ => throw new ArgumentOutOfRangeException(nameof(support), support, "Unknown support"),
    };

    /// <summary>"VERY_HIGH" / "SOLID" / "PARTIAL" / "DIVERGENT".</summary>
    public static string ToReferenceValue(this Convergence convergence) => convergence switch
    {
        Convergence.VeryHigh => "VERY_HIGH",
        Convergence.Solid => "SOLID",
        Convergence.Partial => "PARTIAL",
        Convergence.Divergent => "DIVERGENT",
        _ => throw new ArgumentOutOfRangeException(nameof(convergence), convergence, "Unknown convergence"),
    };

    public static Gate ParseGate(string value) => value switch
    {
        "SATISFIED" => Gate.Satisfied,
        "CONDITIONED" => Gate.Conditioned,
        "CRITICAL" => Gate.Critical,
        _ => throw new ArgumentException($"Unknown gate: {value}", nameof(value)),
    };

    public static Confidence ParseConfidence(string value) => value switch
    {
        "HIGH" => Confidence.High,
        "MEDIUM" => Confidence.Medium,
        "LOW" => Confidence.Low,
        "NOT_DETERMINABLE" => Confidence.NotDeterminable,
        _ => throw new ArgumentException($"Unknown confidence: {value}", nameof(value)),
    };

    public static Support ParseSupport(string value) => value switch
    {
        "STRONG" => Support.Strong,
        "PARTIAL" => Support.Partial,
        "DIVERGENT" => Support.Divergent,
        _ => throw new ArgumentException($"Unknown support: {value}", nameof(value)),
    };

    public static Convergence ParseConvergence(string value) => value switch
    {
        "VERY_HIGH" => Convergence.VeryHigh,
        "SOLID" => Convergence.Solid,
        "PARTIAL" => Convergence.Partial,
        "DIVERGENT" => Convergence.Divergent,
        _ => throw new ArgumentException($"Unknown convergence: {value}", nameof(value)),
    };
}
