using System.Text.Json.Serialization;

namespace FormMaps.Application.Migration;

/// <summary>
/// Raw shape of the embedded domain-status.manifest.json (formmaps#12/#13) -- the single source of
/// truth GET /api/v1/migration/roadmap derives its response from, instead of the previous hardcoded,
/// silently-stale array. See the manifest's own "howToKeepThisCurrent" field for the update convention.
/// </summary>
public sealed record DomainStatusManifest(
    int SchemaVersion,
    string LastUpdated,
    [property: JsonPropertyName("howToKeepThisCurrent")] string HowToKeepThisCurrent,
    IReadOnlyList<DomainStatusManifestEntry> Domains);

public sealed record DomainStatusManifestEntry(
    string Domain,
    string CurrentOwner,
    string TargetOwner,
    string FirstMove,
    string Risk,
    string Status,
    bool LiveInProd,
    string LastVerified,
    string? Note);
