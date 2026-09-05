using FormMaps.Application.CareerFit.Resolver;

namespace FormMaps.Application.CareerFit;

// FM-CF-003. The ConfigCache seam the engine reads its rules through (spec §26): one immutable ACTIVE
// rule-set version per process, resolved and validated exactly once, never re-read inside scoring.
// Callers hold the ResolvedFamilyRules they need for the whole evaluation of a student; nothing here
// is per-factor, per-request or mutable. The implementation (embedded JSON, Lazy<T>, configuration
// key, startup check) is FormMaps.Infrastructure/CareerFit/CareerFitRulesProvider.

/// <summary>The process's active CareerFit rule set: loaded once, validated by the resolver, immutable afterwards.</summary>
public interface ICareerFitRulesProvider
{
    /// <summary>The rules_version this process was configured to load (CareerFit:RulesVersion, or the embedded default).</summary>
    string RulesVersion { get; }

    /// <summary>The loaded rule set. Every call returns the same instance; the first call may throw <see cref="CareerFitRulesInvalidException"/>.</summary>
    CareerFitRules Rules { get; }

    /// <summary>One engine bundle per scorable family, in the rule set's family order (mc_lib.Model.families). Same instance every call.</summary>
    IReadOnlyList<ResolvedFamilyRules> ResolvedFamilies { get; }

    /// <summary>The bundle for one scorable family; throws <see cref="KeyNotFoundException"/> for an unknown or non-scorable id.</summary>
    ResolvedFamilyRules ResolvedFamily(int familyId);
}
