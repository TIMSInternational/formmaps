using System.Text.Json;

namespace FormMaps.Application.Assessments;

/// <summary>One stored 360 feedback row (evaluator relation/groupType + the feedbackItems jsonb array).</summary>
public sealed record FeedbackRow(string? Relation, string? GroupType, JsonElement FeedbackItems);

/// <summary>Catalog row used for the relation-scoped legacy questionNumber → category fallback join.</summary>
public sealed record Question360Lite(int QuestionNumber, string Category, string? RelationType);

/// <summary>A category's running weighted total + rating count.</summary>
public readonly record struct CategoryScore(double Total, int Count);

/// <summary>
/// Faithful port of legacy lib/evaluation360.ts — the single place that turns stored 360 feedback into
/// weighted per-category scores. Each item is preferentially keyed by the category captured at submit
/// time; legacy items without one fall back to a RELATION-SCOPED join of their questionNumber against the
/// Question360 catalog (a number only resolves if it belongs to the row's own relation set, so a wrong
/// per-form display number can't borrow another relation's category). Self-evaluations are excluded from
/// the derived profile by default (a 360 measures how OTHERS perceive the student).
/// </summary>
public static class Evaluation360Scoring
{
    private static readonly IReadOnlyDictionary<string, double> GroupWeight = new Dictionary<string, double>(StringComparer.Ordinal)
    {
        ["teacher"] = 1.1,
        ["parent"] = 0.9,
        ["self"] = 1.0,
        ["sibling_friend"] = 0.8,
        ["other"] = 0.8,
    };

    /// <summary>Canonical evaluator bucket (port of evaluationGroups.ts normalizeGroupType).</summary>
    public static string NormalizeGroupType(string? groupType)
    {
        var g = new string((groupType ?? string.Empty)
            .Trim()
            .ToLowerInvariant()
            .Where(ch => ch is not (' ' or '\t' or '\n' or '\r' or '_' or '-'))
            .ToArray());
        return g switch
        {
            "self" => "self",
            "parent" => "parent",
            "teacher" => "teacher",
            "siblingfriend" or "sibling" or "friend" => "sibling_friend",
            _ => "other",
        };
    }

    public static IReadOnlyList<KeyValuePair<string, CategoryScore>> CategoryScoresFromFeedback(
        IReadOnlyList<FeedbackRow> feedbacks,
        IReadOnlyList<Question360Lite> questions,
        bool includeSelf = false)
    {
        // last-writer-wins on duplicate questionNumber, matching Map.set.
        var catByNum = new Dictionary<double, Question360Lite>();
        foreach (var q in questions)
        {
            catByNum[q.QuestionNumber] = q;
        }

        var order = new List<string>();
        var acc = new Dictionary<string, CategoryScore>(StringComparer.Ordinal);

        foreach (var fb in feedbacks)
        {
            var (bucket, weight, relationType) = BucketFor(fb);
            if (!includeSelf && bucket == "self")
            {
                continue;
            }

            if (fb.FeedbackItems.ValueKind != JsonValueKind.Array)
            {
                continue;
            }

            foreach (var raw in fb.FeedbackItems.EnumerateArray())
            {
                if (raw.ValueKind != JsonValueKind.Object)
                {
                    continue;
                }

                // answered === false skips; a strictly-numeric rating > 0 is required (a string rating,
                // like a string questionNumber, does NOT count — legacy uses `typeof x !== "number"`).
                if (GetProp(raw, "IsAnswered", "isAnswered") is { ValueKind: JsonValueKind.False })
                {
                    continue;
                }

                var ratingProp = GetProp(raw, "Rating", "rating");
                if (ratingProp is not { ValueKind: JsonValueKind.Number } ratingElement)
                {
                    continue;
                }

                var rating = ratingElement.GetDouble();
                if (rating <= 0)
                {
                    continue;
                }

                var category = ResolveCategory(raw, catByNum, relationType);
                if (category is null)
                {
                    continue;
                }

                if (!acc.TryGetValue(category, out var entry))
                {
                    order.Add(category);
                    entry = default;
                }

                acc[category] = new CategoryScore(entry.Total + (rating * weight), entry.Count + 1);
            }
        }

        var result = new List<KeyValuePair<string, CategoryScore>>(order.Count);
        foreach (var category in order)
        {
            result.Add(new KeyValuePair<string, CategoryScore>(category, acc[category]));
        }

        return result;
    }

    public static IReadOnlyList<KeyValuePair<string, double>> CategoryAverages(
        IReadOnlyList<KeyValuePair<string, CategoryScore>> scores)
    {
        var output = new List<KeyValuePair<string, double>>(scores.Count);
        foreach (var (category, score) in scores)
        {
            if (score.Count > 0)
            {
                output.Add(new KeyValuePair<string, double>(category, JsNumber.ToFixed2(score.Total / score.Count)));
            }
        }

        return output;
    }

    // groupType is canonical; free-text `relation` is only a fallback for rows without groupType.
    private static (string Bucket, double Weight, string RelationType) BucketFor(FeedbackRow fb)
    {
        string bucket;
        double weight;
        if (!string.IsNullOrEmpty(fb.GroupType))
        {
            bucket = NormalizeGroupType(fb.GroupType);
            weight = GroupWeight.TryGetValue(bucket, out var w) ? w : 0.8;
        }
        else
        {
            var r = (fb.Relation ?? string.Empty).ToLowerInvariant();
            if (r == "teacher")
            {
                bucket = "teacher";
                weight = 1.1;
            }
            else if (r == "self")
            {
                bucket = "self";
                weight = 1.0;
            }
            else if (r is "parent" or "mother" or "father")
            {
                bucket = "parent";
                weight = 0.9;
            }
            else
            {
                bucket = string.IsNullOrEmpty(r) ? "other" : r;
                weight = 0.8;
            }
        }

        return (bucket, weight, RelationTypeForBucket(bucket));
    }

    private static string RelationTypeForBucket(string bucket) => bucket switch
    {
        "self" => "Self",
        "parent" => "Parent",
        "teacher" => "Teacher",
        _ => "Other",
    };

    // Prefer the category stored at submit time; else the catalog join scoped to this row's relation.
    private static string? ResolveCategory(
        JsonElement raw, IReadOnlyDictionary<double, Question360Lite> catByNum, string relationType)
    {
        var categoryProp = GetProp(raw, "Category", "category");
        if (categoryProp is { ValueKind: JsonValueKind.String } categoryElement)
        {
            var category = categoryElement.GetString();
            if (!string.IsNullOrEmpty(category))
            {
                return category;
            }
        }

        var qNumProp = GetProp(raw, "QuestionNumber", "questionNumber");
        if (qNumProp is { ValueKind: JsonValueKind.Number } qNumElement
            && catByNum.TryGetValue(qNumElement.GetDouble(), out var hit)
            && (string.IsNullOrEmpty(hit.RelationType) || hit.RelationType == relationType))
        {
            return hit.Category;
        }

        return null;
    }

    // JS `obj[a] ?? obj[b]`: first present, non-null property.
    private static JsonElement? GetProp(JsonElement obj, string first, string second)
    {
        if (obj.TryGetProperty(first, out var a) && a.ValueKind != JsonValueKind.Null)
        {
            return a;
        }

        if (obj.TryGetProperty(second, out var b) && b.ValueKind != JsonValueKind.Null)
        {
            return b;
        }

        return null;
    }
}
