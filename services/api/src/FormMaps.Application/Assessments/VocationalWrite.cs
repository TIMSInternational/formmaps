using FormMaps.Application.Auth;

namespace FormMaps.Application.Assessments;

/// <summary>
/// Outcome status for the vocational score recompute (legacy recomputeVocationalResult): the compute is
/// gated (needs self + ≥1 other rater), so a run can end Ready (persisted), NotReady (not enough raters,
/// nothing persisted), or NeverComputed (no active instrument, nothing persisted). All three return HTTP
/// 200 at the route — the status is carried in the JSON body.
/// </summary>
public enum VocationalRecomputeStatus
{
    Ready,
    NotReady,
    NeverComputed,
}

/// <summary>
/// Result of a vocational score recompute. On <see cref="VocationalRecomputeStatus.Ready"/>, <see cref="Ready"/>
/// is the persisted <see cref="VocationalResultPayload"/> (also the response body); on NotReady,
/// <see cref="NotReadyReason"/> carries the legacy reason (e.g. "needs_self_plus_one").
/// </summary>
public sealed record VocationalRecomputeOutcome(
    VocationalRecomputeStatus Status,
    VocationalResultPayload? Ready,
    string? NotReadyReason);

/// <summary>
/// Write-owner for the authed vocational recompute (legacy vocational360Service.ts). Wires the shipped
/// FM-028 <see cref="VocationalScoring"/> engine: loads the active instrument + completed rater responses,
/// computes, and — only when ready — UPSERTs vocational_results (idempotent on evaluatedUserId +
/// instrumentVersion). Ownership is enforced at the endpoint via canAccessUser (a privileged role may
/// recompute an accessible user), so this method is not self-scoped. Decimal is persisted as a numeric
/// value; the jsonb payloads are serialized camelCase (the reader/frontend echo the inner keys verbatim).
/// </summary>
public interface IVocationalWriter
{
    Task<VocationalRecomputeOutcome> RecomputeScoreAsync(
        RequestContext context,
        string evaluatedUserId,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// The authed vocational INTEGRATED recompute (legacy recomputeIntegratedResult): fuses the persisted
    /// 360 composite (FM-033), the FM-035 profile's PCA competences + MIL cognitive channels via the shipped
    /// FM-028 <see cref="VocationalIntegration"/> engine, and — only when ready (all three channels present) —
    /// UPSERTs vocational_integrated_results. Returns the <see cref="IntegrationOutcome"/> (ready payload or
    /// not-ready), or <c>null</c> when there is no active instrument (never_computed, nothing persisted).
    /// </summary>
    Task<IntegrationOutcome?> RecomputeIntegratedAsync(
        RequestContext context,
        string evaluatedUserId,
        CancellationToken cancellationToken = default);
}
