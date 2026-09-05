using FormMaps.Application.CareerFit;
using FormMaps.Application.CareerFit.Resolver;
using Microsoft.Extensions.Configuration;

namespace FormMaps.Infrastructure.CareerFit;

// FM-CF-003 ConfigCache. Implements ICareerFitRulesProvider over the rule set embedded in
// FormMaps.Application (embedded from CareerFit/Data, the one source of truth): the version comes
// from configuration key CareerFit:RulesVersion (env CareerFit__RulesVersion), defaulting to the
// embedded 1.0.0-draft.1; the load + resolver run exactly once per process inside a
// Lazy<T>(ExecutionAndPublication), so concurrent first readers block on one load and every later
// read is a field access — spec §26: resolve and cache once per version, never re-read inside scoring.
//
// Fail-closed: a rule set the resolver rejects (FM-CF-009) surfaces as CareerFitRulesInvalidException
// from the first access and from EVERY later access (Lazy caches the exception — a rule set does not
// become valid by retrying; unlike LiaQuestionCatalogCache, there is no transient failure mode here).
// AddFormMapsInfrastructure forces the load at composition time so an invalid or missing version
// stops the host BEFORE Build(), the same phase StartupEnvironmentValidator fails in.
//
// Deliberately NOT here: reading rules from the database (the rule set is a build artefact, gated in
// CI, not tenant data), hot-swapping versions at runtime (a new version is a new deploy), and any
// per-request or per-tenant state.

/// <summary>Singleton, thread-safe, once-per-process loader of the ACTIVE CareerFit rule set.</summary>
public sealed class CareerFitRulesProvider : ICareerFitRulesProvider
{
    /// <summary>Configuration key selecting the embedded rule-set version (section CareerFit, key RulesVersion).</summary>
    public const string RulesVersionConfigurationKey = "CareerFit:RulesVersion";

    /// <summary>The version loaded when the key is absent or blank — the only one embedded today.</summary>
    public const string DefaultRulesVersion = "1.0.0-draft.1";

    private readonly Lazy<CareerFitActiveRuleSet> _active;

    /// <summary>
    /// Loads <paramref name="rulesVersion"/> through <paramref name="loader"/> (default:
    /// <see cref="CareerFitRulesJson.LoadEmbedded"/>) on first access. The loader is injectable so tests can
    /// feed a poisoned rule set; production always uses the embedded one.
    /// </summary>
    public CareerFitRulesProvider(string rulesVersion, Func<string, CareerFitRules>? loader = null)
    {
        if (string.IsNullOrWhiteSpace(rulesVersion))
        {
            throw new ArgumentException("A CareerFit rules version is required.", nameof(rulesVersion));
        }

        RulesVersion = rulesVersion;
        var load = loader ?? CareerFitRulesJson.LoadEmbedded;
        _active = new Lazy<CareerFitActiveRuleSet>(
            () => LoadAndResolve(rulesVersion, load),
            LazyThreadSafetyMode.ExecutionAndPublication);
    }

    /// <summary>Reads CareerFit:RulesVersion (blank → <see cref="DefaultRulesVersion"/>); nothing is loaded yet.</summary>
    public static CareerFitRulesProvider FromConfiguration(IConfiguration configuration)
    {
        ArgumentNullException.ThrowIfNull(configuration);
        var configured = configuration[RulesVersionConfigurationKey];
        return new CareerFitRulesProvider(string.IsNullOrWhiteSpace(configured) ? DefaultRulesVersion : configured.Trim());
    }

    /// <inheritdoc />
    public string RulesVersion { get; }

    /// <inheritdoc />
    public CareerFitRules Rules => _active.Value.Rules;

    /// <inheritdoc />
    public IReadOnlyList<ResolvedFamilyRules> ResolvedFamilies => _active.Value.Families;

    /// <inheritdoc />
    public ResolvedFamilyRules ResolvedFamily(int familyId) => _active.Value.Family(familyId);

    /// <summary>
    /// True once the rule set has loaded AND resolved; false before the first access and after a failed
    /// one (Lazy.IsValueCreated stays false when the factory threw, even though the exception is cached
    /// and every later access rethrows it).
    /// </summary>
    public bool IsLoaded => _active.IsValueCreated;

    /// <summary>
    /// Forces the load now. Called by AddFormMapsInfrastructure so an invalid rule set fails the host at
    /// composition time; throws exactly what a later <see cref="Rules"/> access would.
    /// </summary>
    public CareerFitRulesProvider EnsureLoaded()
    {
        _ = _active.Value;
        return this;
    }

    private static CareerFitActiveRuleSet LoadAndResolve(string rulesVersion, Func<string, CareerFitRules> load)
    {
        var rules = load(rulesVersion);
        if (!string.Equals(rules.RulesVersion, rulesVersion, StringComparison.Ordinal))
        {
            // The resource was found by its file name; the document inside disagrees. Refuse rather than
            // score under a version label the audit trail would then misreport.
            throw new CareerFitRulesInvalidException(rulesVersion,
            [
                new CareerFitRulesProblem(null, null, "rules_version",
                    $"configured version '{rulesVersion}' but the document declares '{rules.RulesVersion}'"),
            ]);
        }

        return CareerFitRulesResolver.Resolve(rules);
    }
}
