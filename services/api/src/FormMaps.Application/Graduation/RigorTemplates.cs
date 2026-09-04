using System.Text.Json;
using System.Text.Json.Serialization;

namespace FormMaps.Application.Graduation;

/// <summary>
/// Port of legacy <c>api/src/lib/rigorTemplates.ts</c> — the three functions the graduation-plan ROUTES need
/// (issue #55 remainder): <see cref="NormalizeField"/> (rigorTemplates.ts:88), <see cref="ResolveTier"/>
/// (:109) and the label half of <c>resolveTemplate</c> (:119), backed by a VERBATIM copy of
/// <c>api/data/rigor-templates.json</c> embedded at Graduation/Data/rigor-templates.json.
///
/// <para>SCOPE — deliberately partial. The planner-facing half of <c>resolveTemplate</c> (depthTracks,
/// breadth, maxHonorsPerYear, narrativeHints) has exactly two legacy callers, <c>generateDraftPlan</c> and
/// <c>generateRationale</c>, and BOTH live on the two POST /generate routes that DECISION D1 keeps on Node
/// permanently. Porting the composition here would be dead code that silently rots against the JSON. The
/// vendored file still carries those fields untouched so a refresh stays a <c>cp</c> plus a <c>git diff</c>.</para>
///
/// <para>THE UNKNOWN-TIER THROW IS FAITHFUL, not defensive. <c>resolveTemplate</c> reads
/// <c>field.tiers[tier]</c> and then indexes <c>t.trackMinYears[i]</c> inside a <c>depthTracks.map</c>; every
/// field in the file has at least one depth track (the zod schema requires <c>.min(1)</c>), so a
/// <c>templateKey</c> whose tier segment is not one of the three literals is a TypeError in legacy and a 500
/// on the route. <see cref="ResolveTemplateLabel"/> throws for the same input, and the API's exception handler
/// renders the same <c>{ success:false, message:"Internal server error" }</c>. An UNKNOWN FIELD, by contrast,
/// is NOT an error — it silently falls back to <c>undecided-general</c> (:121), including in the returned
/// <c>key</c>, which is why <see cref="ResolveTemplateLabel"/> re-derives the field rather than trusting the
/// caller's string.</para>
/// </summary>
public static class RigorTemplates
{
    private const string UndecidedField = "undecided-general";

    public const string TierMostSelective = "most-selective";
    public const string TierSelective = "selective";
    public const string TierOpen = "open";

    private static readonly Lazy<TemplateFile> File = new(Load, LazyThreadSafetyMode.ExecutionAndPublication);

    /// <summary>
    /// <c>normalizeField(majorText, preferredFields?)</c> (rigorTemplates.ts:88). Probe the major first, then
    /// each preferred field in order; anything that resolves nothing is <c>undecided-general</c>.
    /// </summary>
    public static string NormalizeField(string majorText, IReadOnlyList<string>? preferredFields)
    {
        var direct = Probe(majorText);
        if (direct is not null)
        {
            return direct;
        }

        foreach (var preferred in preferredFields ?? [])
        {
            var viaPreference = Probe(preferred);
            if (viaPreference is not null)
            {
                return viaPreference;
            }
        }

        return UndecidedField;
    }

    /// <summary>
    /// <c>resolveTier(university?)</c> (rigorTemplates.ts:109). Note the shape of the null handling, which is
    /// NOT "unknown rate means selective": a missing rate is <c>selective</c> only when a university object was
    /// supplied at all, and <c>open</c> when the caller passed null/undefined. setTarget decides which of those
    /// it is by <c>universityId || universityName ? { acceptanceRate } : null</c> — so a target with a
    /// free-text university name and no rate lands on <c>selective</c>, and a target with no university at all
    /// lands on <c>open</c>.
    /// </summary>
    public static string ResolveTier(bool hasUniversity, double? acceptanceRate)
    {
        var bands = File.Value.TierBands;

        // `rate == null || Number.isNaN(rate)` — loose ==, so both null and undefined take this arm.
        if (acceptanceRate is null || double.IsNaN(acceptanceRate.Value))
        {
            return hasUniversity ? TierSelective : TierOpen;
        }

        if (acceptanceRate.Value <= bands.MostSelectiveMaxAcceptanceRate)
        {
            return TierMostSelective;
        }

        return acceptanceRate.Value <= bands.SelectiveMaxAcceptanceRate ? TierSelective : TierOpen;
    }

    /// <summary>
    /// The <c>label</c> of <c>resolveTemplate(fieldKey, tier)</c> (rigorTemplates.ts:126) — the only field of
    /// the composed template any ported route reads (<c>targetDto.templateLabel</c>, <c>planDto.templateLabel</c>).
    /// The separator is an EM DASH with spaces, exactly as the template literal writes it.
    /// </summary>
    public static string ResolveTemplateLabel(string fieldKey, string? tier)
    {
        var file = File.Value;
        var usedKey = file.Fields.ContainsKey(fieldKey) ? fieldKey : UndecidedField;
        var field = file.Fields[usedKey];

        // `field.tiers[tier]` is undefined for anything else, and the very next line dereferences it.
        var tierLabel = tier switch
        {
            TierMostSelective => "Most Selective",
            TierSelective => "Selective",
            TierOpen => "Open Admissions",
            _ => throw new InvalidOperationException(
                $"rigor-templates: unknown selectivity tier '{tier}' — legacy resolveTemplate throws here."),
        };

        return $"{field.Label} — {tierLabel}";
    }

    /// <summary>The 10 field keys, exposed for the parity tests.</summary>
    public static IReadOnlyCollection<string> FieldKeys => File.Value.Fields.Keys.ToArray();

    /// <summary>
    /// <c>probe(s)</c> (rigorTemplates.ts:90): exact field key, then exact alias, then a longest-alias-first
    /// SUBSTRING pass so "computer engineering" beats "engineering".
    /// </summary>
    private static string? Probe(string source)
    {
        var lower = (source ?? string.Empty).Trim().ToLowerInvariant();
        var file = File.Value;

        if (file.Fields.ContainsKey(lower))
        {
            return lower;
        }

        if (file.FieldAliases.TryGetValue(lower, out var exact))
        {
            return exact;
        }

        foreach (var alias in file.SortedAliasKeys)
        {
            if (lower.Contains(alias, StringComparison.Ordinal))
            {
                return file.FieldAliases[alias];
            }
        }

        return null;
    }

    private static TemplateFile Load()
    {
        var assembly = typeof(RigorTemplates).Assembly;
        var resourceName = assembly.GetManifestResourceNames()
            .Single(name => name.EndsWith("rigor-templates.json", StringComparison.Ordinal));

        using var stream = assembly.GetManifestResourceStream(resourceName)
            ?? throw new InvalidOperationException("Embedded rigor-templates.json not found.");

        var raw = JsonSerializer.Deserialize<RawTemplateFile>(stream)
            ?? throw new InvalidOperationException("rigor-templates.json failed to deserialize.");

        // `Object.keys(fieldAliases).sort((a, b) => b.length - a.length || a.localeCompare(b))`. Every alias key
        // in the file is lowercase ASCII, where localeCompare and Ordinal agree; using Ordinal keeps the order
        // deterministic across ICU versions.
        var sorted = raw.FieldAliases.Keys
            .OrderByDescending(k => k.Length)
            .ThenBy(k => k, StringComparer.Ordinal)
            .ToArray();

        return new TemplateFile(
            raw.Fields.ToDictionary(kv => kv.Key, kv => new FieldEntry(kv.Value.Label), StringComparer.Ordinal),
            raw.FieldAliases.ToDictionary(kv => kv.Key, kv => kv.Value, StringComparer.Ordinal),
            sorted,
            raw.TierBands);
    }

    private sealed record TemplateFile(
        IReadOnlyDictionary<string, FieldEntry> Fields,
        IReadOnlyDictionary<string, string> FieldAliases,
        IReadOnlyList<string> SortedAliasKeys,
        RawTierBands TierBands);

    private sealed record FieldEntry(string Label);

    private sealed record RawTemplateFile(
        [property: JsonPropertyName("fieldAliases")] Dictionary<string, string> FieldAliases,
        [property: JsonPropertyName("tierBands")] RawTierBands TierBands,
        [property: JsonPropertyName("fields")] Dictionary<string, RawField> Fields);

    private sealed record RawField([property: JsonPropertyName("label")] string Label);

    public sealed record RawTierBands(
        [property: JsonPropertyName("mostSelectiveMaxAcceptanceRate")] double MostSelectiveMaxAcceptanceRate,
        [property: JsonPropertyName("selectiveMaxAcceptanceRate")] double SelectiveMaxAcceptanceRate);
}
