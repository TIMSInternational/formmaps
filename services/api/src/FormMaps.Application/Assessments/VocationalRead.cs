using System.Text.Json;
using FormMaps.Application.Auth;

namespace FormMaps.Application.Assessments;

/// <summary>
/// Serialized vocational score result (legacy serializeVocationalResult). Composite is a JSON NUMBER
/// (Number(Decimal)); dimensionScores/rankings/weightsApplied pass through as stored jsonb (camelCase inner
/// keys). Carries a computed <c>Status</c> = "ready" (the reader returns null for "never_computed").
/// </summary>
public sealed record VocationalScoreRead(
    string EvaluatedUserId,
    string InstrumentVersion,
    double Composite,
    string Band,
    int RespondentCount,
    IReadOnlyList<string> GroupsIncluded,
    JsonElement DimensionScores,
    JsonElement Rankings,
    JsonElement WeightsApplied,
    string ComputedAt)
{
    public string Status => "ready";
}

/// <summary>Serialized vocational integrated result (legacy serializeIntegratedResult) — all four scores as JSON numbers.</summary>
public sealed record VocationalIntegratedRead(
    string EvaluatedUserId,
    string InstrumentVersion,
    double IntegratedComposite,
    string Band,
    double ThreeSixtyScore,
    double PcaScore,
    double MilScore,
    JsonElement WeightsApplied,
    string ComputedAt)
{
    public string Status => "ready";
}

/// <summary>
/// Reads the persisted vocational result tables under the caller's read-only RLS session (legacy
/// getVocationalResult / getIntegratedResult). Returns null when there is no active instrument or no stored
/// row (the endpoint maps null to <c>{status:"never_computed"}</c>).
/// </summary>
public interface IVocationalReader
{
    Task<VocationalScoreRead?> GetScoreAsync(RequestContext context, string evaluatedUserId, CancellationToken cancellationToken = default);

    Task<VocationalIntegratedRead?> GetIntegratedAsync(RequestContext context, string evaluatedUserId, CancellationToken cancellationToken = default);
}
