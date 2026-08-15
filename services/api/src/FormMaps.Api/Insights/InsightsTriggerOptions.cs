namespace FormMaps.Api.Insights;

/// <summary>
/// Configuration for <see cref="LegacyApiInsightsTrigger"/> (formmaps#144). The base URL is the legacy
/// Node API's origin (e.g. the nexa-api App Runner URL), read from the LEGACY_API_BASE_URL environment
/// variable at the composition root. Deliberately NO code default: the origin differs per environment,
/// and a wrong default would fail far less diagnosably than the loud per-fire "not configured" Error
/// the trigger logs when the value is absent.
/// </summary>
public sealed record InsightsTriggerOptions
{
    public InsightsTriggerOptions(string? legacyApiBaseUrl)
    {
        // Normalized HERE (single point) so "https://host/" and "https://host" both produce
        // "https://host" + the absolute route path — never "host//api/...".
        LegacyApiBaseUrl = string.IsNullOrWhiteSpace(legacyApiBaseUrl) ? null : legacyApiBaseUrl.TrimEnd('/');
    }

    /// <summary>Legacy Node API origin, without a trailing slash; null when not configured.</summary>
    public string? LegacyApiBaseUrl { get; }
}
