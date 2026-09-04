using FormMaps.Application.Assessments;

namespace FormMaps.Application.CareerFit.Adapters;

// FM-CF-007 — NAIVE FIRST. This is the plausible-but-wrong aggregation, committed on purpose so the
// FM-CF-007/008 tests can be watched failing on the defect symptom before the real one replaces it
// (same red-first protocol as commit 1050d707 for the FM-CF-005 adapters). It pools every rater's
// answers into one mean, declares perfect consensus because nothing disagreed, calls coverage 1.0,
// scores IND, and has no explicit no-evidence path. Every one of those is a defect the next commit
// fixes.

/// <summary>NAIVE: variable-level 360 aggregation with no source integration, no real consensus and no exclusions.</summary>
public static class V360Aggregation
{
    /// <summary>Codes excluded from V1 scoring — declared, but NOT consulted by this naive version.</summary>
    public static readonly IReadOnlyList<string> ExcludedInV1 = ["IND"];

    /// <summary>NAIVE aggregation of a student's rater groups to variable level.</summary>
    public static V360Adaptation Adapt(CareerFitRules rules, IReadOnlyList<ScoringGroup>? raterGroups)
    {
        ArgumentNullException.ThrowIfNull(rules);
        var codes = rules.V360Variables.Select(v => v.Code).ToHashSet(StringComparer.Ordinal);
        var pooled = new Dictionary<string, List<double>>(StringComparer.Ordinal);
        var responses = 0;

        foreach (var group in raterGroups ?? [])
        {
            foreach (var response in group.Responses)
            {
                if (response.Type != "likert" || response.DimensionKey is not string code
                    || !codes.Contains(code) || response.RatingValue is not double rating)
                {
                    continue;
                }

                if (!pooled.TryGetValue(code, out var values))
                {
                    values = [];
                    pooled[code] = values;
                }

                values.Add(CareerFitFormulas.NormalizeLikert((int)rating)!.Value);
                responses++;
            }
        }

        var aggregates = new Dictionary<string, V360Aggregate>(StringComparer.Ordinal);
        var audits = new List<V360VariableAudit>();
        foreach (var (code, values) in pooled)
        {
            var score = values.Sum() / values.Count;
            var confidence = CareerFitFormulas.Confidence360(
                100.0, 1.0, responses, rules.Thresholds.V360Confidence);
            aggregates[code] = new V360Aggregate(score, 100.0, confidence.Index);
            audits.Add(new V360VariableAudit(code, score, 100.0, confidence.Index, 1.0, responses, values.Count, values.Count, ["SELF"]));
        }

        var global = CareerFitFormulas.Confidence360(100.0, 1.0, responses, rules.Thresholds.V360Confidence);
        return new V360Adaptation(aggregates, global.Label, V360Sources.VocationalResponses, [], audits);
    }
}

/// <summary>NAIVE <see cref="IV360Adapter"/> over the process's active rule set.</summary>
public sealed class VocationalV360Adapter(ICareerFitRulesProvider rulesProvider) : IV360Adapter
{
    /// <inheritdoc />
    public V360Adaptation Adapt(ThreeSixtyProfile? threeSixty, IReadOnlyList<ScoringGroup>? raterGroups) =>
        V360Aggregation.Adapt(rulesProvider.Rules, raterGroups);
}
