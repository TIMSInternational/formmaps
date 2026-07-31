using System.Reflection;
using System.Text.Json;

namespace FormMaps.Application.Migration;

/// <summary>
/// Loads GET /api/v1/migration/roadmap's domain list from the embedded domain-status.manifest.json
/// (formmaps#12/#13), the same load-once-from-embedded-JSON pattern used by PersonalityProfileBank /
/// LiaPercentileMapper / LiaVerbalEn. Replaces a hardcoded array that had gone silently stale (e.g.
/// showing "planned" for domains shipped weeks earlier) with a single, hand-maintained source of
/// truth -- see the manifest's own "howToKeepThisCurrent" field for how it's kept accurate.
/// </summary>
public sealed class MigrationRoadmapProvider : IMigrationRoadmapProvider
{
    private static readonly JsonSerializerOptions LoadOptions = new()
    {
        PropertyNameCaseInsensitive = true,
    };

    private static readonly IReadOnlyList<MigrationDomainStatus> Roadmap = Load();

    public IReadOnlyList<MigrationDomainStatus> GetRoadmap()
    {
        return Roadmap;
    }

    private static IReadOnlyList<MigrationDomainStatus> Load()
    {
        var assembly = typeof(MigrationRoadmapProvider).Assembly;
        var resourceName = assembly.GetManifestResourceNames()
            .Single(name => name.EndsWith("domain-status.manifest.json", StringComparison.Ordinal));

        using var stream = assembly.GetManifestResourceStream(resourceName)
            ?? throw new InvalidOperationException("Embedded domain-status.manifest.json not found.");

        var manifest = JsonSerializer.Deserialize<DomainStatusManifest>(stream, LoadOptions)
            ?? throw new InvalidOperationException("domain-status.manifest.json failed to deserialize.");

        return manifest.Domains
            .Select(d => new MigrationDomainStatus(
                Domain: d.Domain,
                CurrentOwner: d.CurrentOwner,
                TargetOwner: d.TargetOwner,
                FirstMove: d.FirstMove,
                Risk: d.Risk,
                Status: d.Status,
                LiveInProd: d.LiveInProd,
                LastVerified: d.LastVerified))
            .ToList();
    }
}
