using System.Globalization;

namespace FormMaps.Application.Graduation;

/// <summary>One global-catalog course as <c>getSupplementalRecommendations</c> reads it.</summary>
public sealed record SupplementalCandidate(
    string Id,
    string Title,
    string? Provider,
    string? Category,
    double? Rating,
    IReadOnlyList<string> Skills,
    IReadOnlyList<string> CareerPaths);

/// <summary>
/// The PURE half of <c>getSupplementalRecommendations</c> (planWorkflowService.ts:192-213), lifted out of the
/// repository so every scoring quirk below is unit-testable without a database.
///
/// <para>Quirks that are behaviour, not accidents, and are reproduced deliberately:</para>
/// <list type="bullet">
/// <item><c>fillsGap</c> is <c>gaps[gaps.indexOf(gapHit)]</c>, i.e. <c>gapHit</c> re-looked-up by value — for
/// duplicate gap categories that is still the same string, so it is just an identity. Emitted as-is.</item>
/// <item>The gap keyword is matched as a bare SUBSTRING of the haystack, so a one-character gap category
/// matches almost everything. Legacy does not guard it and neither does this.</item>
/// <item>The major bonus needs <c>major.length &gt; 2</c> BEFORE the substring test, so two-letter majors
/// never score it.</item>
/// <item><c>Math.round</c>, not banker's rounding: JS rounds .5 AWAY from zero, and these scores are
/// non-negative, so <c>Math.Floor(score + 0.5)</c> is exact.</item>
/// <item>The threshold is <c>&gt; 14</c> on the ROUNDED score, applied after rounding.</item>
/// </list>
///
/// <para>KNOWN APPROXIMATION, the same one the landed graduation-rules lane recorded for
/// <c>sortBy=name</c>: the title tie-break is <c>a.title.localeCompare(b.title)</c> in Node (ICU root locale)
/// and <see cref="StringComparison.InvariantCulture"/> here. They agree on ASCII and may differ on
/// non-ASCII titles.</para>
/// </summary>
public static class SupplementalScoring
{
    /// <summary>
    /// Thrown when a <c>gapReport</c> entry has no string <c>category</c>. Legacy does
    /// <c>g.category.toLowerCase()</c> unguarded, which is a TypeError on such a row and a 500 on the route.
    /// Reproduced rather than silently skipped: swallowing it would turn a 500 into a 200 with a DIFFERENT
    /// result set, which is not behaviour-neutral on flip.
    /// </summary>
    public sealed class MalformedGapReportException(string message) : InvalidOperationException(message);

    public static IReadOnlyList<SupplementalCourseDto> Score(
        IReadOnlyList<SupplementalCandidate> courses,
        IReadOnlySet<string> enrolledCourseIds,
        IReadOnlyList<string> gapCategoriesLowered,
        string fieldKey,
        string? major)
    {
        // `target.fieldKey.split("-").filter(w => w.length > 2)`.
        var fieldWords = (fieldKey ?? string.Empty)
            .Split('-')
            .Where(w => w.Length > 2)
            .ToArray();

        var majorText = major ?? string.Empty;
        var majorLower = majorText.ToLowerInvariant();
        var majorScores = majorText.Length > 2;

        var scored = new List<SupplementalCourseDto>();
        foreach (var course in courses)
        {
            if (enrolledCourseIds.Contains(course.Id))
            {
                continue;
            }

            // `${title} ${category || ""} ${skills.join(" ")} ${careerPaths.join(" ")}`.toLowerCase()
            var haystack = string.Concat(
                    course.Title,
                    " ",
                    string.IsNullOrEmpty(course.Category) ? string.Empty : course.Category,
                    " ",
                    string.Join(" ", course.Skills),
                    " ",
                    string.Join(" ", course.CareerPaths))
                .ToLowerInvariant();

            // `(Number(c.rating) || 0) * 3` — NaN and 0 are both falsy, so either contributes nothing.
            var rating = course.Rating;
            var score = (rating is null || double.IsNaN(rating.Value) ? 0d : rating.Value) * 3d;

            var gapHit = gapCategoriesLowered.FirstOrDefault(g => haystack.Contains(g, StringComparison.Ordinal));
            if (gapHit is not null)
            {
                score += 20d;
            }

            if (fieldWords.Any(w => haystack.Contains(w, StringComparison.Ordinal)))
            {
                score += 15d;
            }

            if (majorScores && haystack.Contains(majorLower, StringComparison.Ordinal))
            {
                score += 10d;
            }

            var matchScore = (int)Math.Floor(score + 0.5d);
            if (matchScore <= 14)
            {
                continue;
            }

            scored.Add(new SupplementalCourseDto(
                Id: course.Id,
                Title: course.Title,
                Provider: course.Provider,
                Category: course.Category,
                Rating: rating,
                MatchScore: matchScore,
                FillsGap: gapHit,
                Reason: gapHit is not null
                    ? $"Your school can't fully cover this area — this course fills the {gapHit} gap."
                    : $"Builds toward {(string.IsNullOrEmpty(majorText) ? "your goal" : majorText)}."));
        }

        // JS Array.prototype.sort is stable; LINQ OrderBy/ThenBy is stable too, so equal (score, title) pairs
        // keep the catalog order the `createdDate DESC LIMIT 200` query produced.
        return scored
            .OrderByDescending(c => c.MatchScore)
            .ThenBy(c => c.Title, StringComparer.Create(CultureInfo.InvariantCulture, ignoreCase: false))
            .Take(10)
            .ToList();
    }

    /// <summary>
    /// <c>((plan?.gapReport as Array&lt;{category:string}&gt;) || []).map(g =&gt; g.category.toLowerCase())</c>.
    /// A non-array gapReport (object, string, SQL NULL) yields an empty list, exactly like the <c>|| []</c>.
    /// </summary>
    public static IReadOnlyList<string> GapCategories(System.Text.Json.JsonElement? gapReport)
    {
        if (gapReport is not { ValueKind: System.Text.Json.JsonValueKind.Array } array)
        {
            return [];
        }

        var categories = new List<string>();
        foreach (var entry in array.EnumerateArray())
        {
            if (entry.ValueKind == System.Text.Json.JsonValueKind.Object
                && entry.TryGetProperty("category", out var category)
                && category.ValueKind == System.Text.Json.JsonValueKind.String)
            {
                categories.Add(category.GetString()!.ToLowerInvariant());
                continue;
            }

            throw new MalformedGapReportException(
                "gapReport entry has no string `category`; legacy throws a TypeError here and the route 500s.");
        }

        return categories;
    }
}
