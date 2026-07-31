namespace FormMaps.Application.Migration;

/// <summary>
/// One domain's row in GET /api/v1/migration/roadmap. The first six properties are the original
/// response shape (kept name/order/type-stable for backward compatibility -- see formmaps#12/#13).
/// <see cref="LiveInProd"/> and <see cref="LastVerified"/> are additive fields: the accurate
/// live-vs-dark signal issue #13 asked for, sourced from domain-status.manifest.json rather than
/// inferred from <see cref="Status"/> (which only tracks code completion, not the flag/deploy state).
/// </summary>
public sealed record MigrationDomainStatus(
    string Domain,
    string CurrentOwner,
    string TargetOwner,
    string FirstMove,
    string Risk,
    string Status,
    bool LiveInProd = false,
    string? LastVerified = null);
