namespace FormMaps.Application.Assessments;

// ---- Input records (legacy vocationalScoringService.ts interfaces) ----

/// <summary>The four rater groups (legacy VOCATIONAL_GROUPS).</summary>
public sealed record RankingEntry(string Value, int Rank);

public sealed record ScoringResponse(
    int QuestionNumber,
    string Type,
    string? DimensionKey,
    double? RatingValue,
    IReadOnlyList<RankingEntry>? RankingOrder,
    IReadOnlyList<string>? SelectedValues,
    string? TextValue);

public sealed record ScoringGroup(string Group, IReadOnlyList<ScoringResponse> Responses);

public sealed record ScoringDimension(string Key, string NameEs, double Weight);

public sealed record ScoringBands(double Strong, double ModerateHigh, double Medium);

public sealed record ScoringRule(string Kind, double? TopPoints, double? N, double? PointsEach);

public sealed record ScoringQuestion(int Number, string Type, ScoringRule? ScoringRule);

public sealed record ScoringConfig(
    string InstrumentVersion,
    IReadOnlyDictionary<string, double> GroupWeights,
    ScoringBands Bands,
    IReadOnlyList<ScoringDimension> Dimensions);

// ---- Output records ----

public sealed record DimensionScore(
    string Key,
    string NameEs,
    double? Score,
    string? Band,
    IReadOnlyDictionary<string, double> ByGroup);

public sealed record InterestPoint(string Value, double Points);

public sealed record IndustryCount(string Value, double Count);

public sealed record WorkType(string Value, double Count);

public sealed record OpenInsight(string Group, string Text);

public sealed record Rankings(
    IReadOnlyList<InterestPoint> Interests,
    IReadOnlyList<IndustryCount> Industries,
    WorkType? WorkType,
    IReadOnlyList<OpenInsight> OpenInsights);

/// <summary>Discriminated outcome (legacy ScoringOutcome). Status mirrors the TS "ready"/"not_ready" tag.</summary>
public abstract record ScoringOutcome
{
    public abstract string Status { get; }
}

public sealed record VocationalNotReady(string Reason) : ScoringOutcome
{
    public override string Status => "not_ready";
}

public sealed record VocationalResultPayload(
    string InstrumentVersion,
    double Composite,
    string Band,
    int RespondentCount,
    IReadOnlyList<string> GroupsIncluded,
    IReadOnlyList<DimensionScore> DimensionScores,
    Rankings Rankings,
    IReadOnlyDictionary<string, double> WeightsApplied) : ScoringOutcome
{
    public override string Status => "ready";
}

/// <summary>
/// Pure port of legacy services/vocationalScoringService.ts — a config-driven, dimension-weighted
/// vocational-360 engine (NOT RIASEC/Holland: dimensions are arbitrary config keys). Likert 1-5 → 0-100,
/// averaged per dimension per rater group, group-weight-aggregated (renormalized over present groups),
/// then dimension-weight-aggregated into a composite and banded. I/O-free; the service does all DB work.
/// </summary>
public static class VocationalScoring
{
    /// <summary>The four rater groups (legacy VOCATIONAL_GROUPS).</summary>
    public static readonly IReadOnlyList<string> Groups = ["self", "parent", "teacher", "sibling_friend"];

    /// <summary>Round to 2 dp (legacy round2). Uses an exact JS Math.round — avoids both .NET banker's rounding AND the Math.Floor(x+0.5) ULP artifact (n*100 == 0.49999999999999994 → JS 0, floor(x+0.5) → 1).</summary>
    public static double Round2(double n) => JsRound(n * 100) / 100;

    // Byte-exact JS Math.round for all doubles: the integer closest to x, ties toward +Inf. `x - Floor(x)`
    // is the exact fractional part, so this reproduces JS Math.round without the Math.Floor(x+0.5) artifact.
    private static double JsRound(double x)
    {
        var f = Math.Floor(x);
        return (x - f) >= 0.5 ? f + 1 : f;
    }

    /// <summary>Likert 1-5 → 0-100 (legacy normalize): 1→0, 3→50, 5→100.</summary>
    public static double Normalize(double rating) => (rating - 1) / 4 * 100;

    /// <summary>Threshold ladder (legacy band), inclusive edges.</summary>
    public static string Band(double score, ScoringBands b)
    {
        if (score >= b.Strong)
        {
            return "strong";
        }

        if (score >= b.ModerateHigh)
        {
            return "moderateHigh";
        }

        if (score >= b.Medium)
        {
            return "medium";
        }

        return "low";
    }

    /// <summary>Mean of normalized likert ratings for a dimension within one group; null if none (legacy dimensionScoreForGroup).</summary>
    public static double? DimensionScoreForGroup(IReadOnlyList<ScoringResponse> responses, string dimensionKey)
    {
        var vals = responses
            .Where(r => r.Type == "likert" && r.DimensionKey == dimensionKey && r.RatingValue.HasValue)
            .Select(r => Normalize(r.RatingValue!.Value))
            .ToList();
        if (vals.Count == 0)
        {
            return null;
        }

        return vals.Sum() / vals.Count;
    }

    /// <summary>Restrict base weights to present groups and renormalize to sum 1; equal-split if base sums to 0 (legacy renormalizeGroupWeights).</summary>
    public static IReadOnlyDictionary<string, double> RenormalizeGroupWeights(
        IReadOnlyDictionary<string, double> baseWeights, IReadOnlyList<string> present)
    {
        var outp = new Dictionary<string, double>(StringComparer.Ordinal);
        var sum = present.Sum(g => baseWeights.GetValueOrDefault(g));
        if (sum == 0)
        {
            var eq = present.Count != 0 ? 1.0 / present.Count : 0;
            foreach (var g in present)
            {
                outp[g] = eq;
            }

            return outp;
        }

        foreach (var g in present)
        {
            outp[g] = baseWeights.GetValueOrDefault(g) / sum;
        }

        return outp;
    }

    /// <summary>Group-weight the present per-group scores, renormalizing over the groups that scored it; null if none (legacy aggregateDimension).</summary>
    public static double? AggregateDimension(
        IReadOnlyDictionary<string, double> byGroup, IReadOnlyDictionary<string, double> baseWeights)
    {
        var present = byGroup.Keys.ToList();
        if (present.Count == 0)
        {
            return null;
        }

        var w = RenormalizeGroupWeights(baseWeights, present);
        return present.Sum(g => byGroup[g] * w[g]);
    }

    /// <summary>Dimension-weight the scored dimensions, renormalizing over the scored ones; 0 if none scored (legacy composite).</summary>
    public static double Composite(IReadOnlyList<DimensionScore> dims, IReadOnlyList<ScoringDimension> dimMeta)
    {
        var wByKey = LastWins(dimMeta, d => d.Key, d => d.Weight, StringComparer.Ordinal);
        var scored = dims.Where(d => d.Score.HasValue).ToList();
        var wsum = scored.Sum(d => wByKey.GetValueOrDefault(d.Key));
        if (wsum == 0)
        {
            return 0;
        }

        return scored.Sum(d => d.Score!.Value * (wByKey.GetValueOrDefault(d.Key) / wsum));
    }

    /// <summary>Interest points / industry / workType / open-insight tallies, group-weighted (legacy computeRankings).</summary>
    public static Rankings ComputeRankings(
        IReadOnlyList<ScoringGroup> groups, IReadOnlyDictionary<string, double> baseWeights, IReadOnlyList<ScoringQuestion> questions)
    {
        var present = groups.Select(g => g.Group).ToList();
        var w = RenormalizeGroupWeights(baseWeights, present);
        var qByNum = LastWins(questions, q => q.Number, q => q);
        var interestPts = new OrderedTally();
        var industryCnt = new OrderedTally();
        var workTypeCnt = new OrderedTally();
        var openInsights = new List<OpenInsight>();

        foreach (var grp in groups)
        {
            var gw = w.GetValueOrDefault(grp.Group);
            foreach (var r in grp.Responses)
            {
                if (r.Type == "ranking" && r.RankingOrder is not null)
                {
                    var topPoints = (qByNum.TryGetValue(r.QuestionNumber, out var q) ? q.ScoringRule?.TopPoints : null) ?? 20.0;
                    foreach (var entry in r.RankingOrder)
                    {
                        var pts = Math.Max(0.0, topPoints - (entry.Rank - 1)) * gw;
                        interestPts.Add(entry.Value, pts);
                    }
                }
                else if (r.Type == "multi_select" && r.SelectedValues is not null)
                {
                    foreach (var v in r.SelectedValues)
                    {
                        industryCnt.Add(v, gw);
                    }
                }
                else if (r.Type == "single_select" && !string.IsNullOrEmpty(r.TextValue))
                {
                    workTypeCnt.Add(r.TextValue, gw);
                }
                else if (r.Type == "open" && r.TextValue is not null && JsString.JsTrim(r.TextValue).Length > 0)
                {
                    openInsights.Add(new OpenInsight(grp.Group, JsString.JsTrim(r.TextValue)));
                }
            }
        }

        // round2 THEN stable descending sort (JS Map insertion order + stable Array.sort → ties keep first-seen).
        var interests = interestPts.InOrder()
            .Select(e => new InterestPoint(e.Key, Round2(e.Value)))
            .OrderByDescending(x => x.Points)
            .ToList();
        var industries = industryCnt.InOrder()
            .Select(e => new IndustryCount(e.Key, Round2(e.Value)))
            .OrderByDescending(x => x.Count)
            .ToList();

        WorkType? workType = null;
        if (workTypeCnt.Count > 0)
        {
            var top = workTypeCnt.InOrder().OrderByDescending(e => e.Value).First();
            workType = new WorkType(top.Key, Round2(top.Value));
        }

        return new Rankings(interests, industries, workType, openInsights);
    }

    /// <summary>Top-level orchestrator (legacy computeVocationalResult): readiness gate → per-dimension scores → composite.</summary>
    public static ScoringOutcome ComputeVocationalResult(
        ScoringConfig config, IReadOnlyList<ScoringQuestion> questions, IReadOnlyList<ScoringGroup> groups)
    {
        var present = groups.Select(g => g.Group).ToList();
        var hasSelf = present.Contains("self");
        var others = present.Where(g => g != "self").ToList();
        if (!hasSelf || others.Count == 0)
        {
            return new VocationalNotReady("needs_self_plus_one");
        }

        var dimensionScores = config.Dimensions.Select(d =>
        {
            var byGroup = new Dictionary<string, double>(StringComparer.Ordinal);
            foreach (var grp in groups)
            {
                var s = DimensionScoreForGroup(grp.Responses, d.Key);
                if (s is not null)
                {
                    byGroup[grp.Group] = Round2(s.Value);
                }
            }

            var agg = AggregateDimension(byGroup, config.GroupWeights);
            // band is computed on the UNROUNDED aggregate; score is the rounded value (faithful asymmetry).
            return new DimensionScore(
                Key: d.Key,
                NameEs: d.NameEs,
                Score: agg is null ? null : Round2(agg.Value),
                Band: agg is null ? null : Band(agg.Value, config.Bands),
                ByGroup: byGroup);
        }).ToList();

        var comp = Round2(Composite(dimensionScores, config.Dimensions));
        return new VocationalResultPayload(
            InstrumentVersion: config.InstrumentVersion,
            Composite: comp,
            Band: Band(comp, config.Bands),
            RespondentCount: groups.Count,
            GroupsIncluded: present,
            DimensionScores: dimensionScores,
            Rankings: ComputeRankings(groups, config.GroupWeights, questions),
            WeightsApplied: RenormalizeGroupWeights(config.GroupWeights, present));
    }

    // Build a dictionary with JS `new Map(entries)` LAST-WINS semantics on duplicate keys (.NET
    // ToDictionary throws on a duplicate; the TS engine silently keeps the last entry).
    private static Dictionary<TKey, TVal> LastWins<TItem, TKey, TVal>(
        IEnumerable<TItem> items, Func<TItem, TKey> key, Func<TItem, TVal> value, IEqualityComparer<TKey>? comparer = null)
        where TKey : notnull
    {
        var dict = new Dictionary<TKey, TVal>(comparer);
        foreach (var item in items)
        {
            dict[key(item)] = value(item);
        }

        return dict;
    }

    // Accumulator that preserves first-seen key order (JS Map semantics) so a later stable sort
    // resolves equal-value ties in insertion order, matching the TS engine byte-for-byte.
    private sealed class OrderedTally
    {
        private readonly Dictionary<string, double> _map = new(StringComparer.Ordinal);
        private readonly List<string> _order = [];

        public int Count => _map.Count;

        public void Add(string key, double amount)
        {
            if (!_map.ContainsKey(key))
            {
                _map[key] = 0;
                _order.Add(key);
            }

            _map[key] += amount;
        }

        public IEnumerable<KeyValuePair<string, double>> InOrder() =>
            _order.Select(k => new KeyValuePair<string, double>(k, _map[k]));
    }
}
