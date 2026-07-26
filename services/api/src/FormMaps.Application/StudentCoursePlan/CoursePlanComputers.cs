using System.Text.Json;

namespace FormMaps.Application.StudentCoursePlan;

/// <summary>
/// Pure compute for the two course-plan.ts compute reads (FM-DOTNET-086). Kept out of the reader so the scoring /
/// eligibility rules are unit-testable without a DB.
/// </summary>
public static class CoursePlanRecommendationsScorer
{
    /// <summary>
    /// Ports the recommendations scorer (course-plan.ts L170-182, + the Task-6 language/engine-career-alignment fold):
    /// drop already-enrolled courses; base 50; +15 for each preferredField (already lowercased) that is a substring of
    /// "title shortDescription category" lowercased; +10 when rating &gt; 4; **+10** (NOT +15 — that weight belongs to
    /// courseService.ts's separate scorer, which has no .NET counterpart) when <paramref name="engineCareersLower"/> is
    /// non-empty AND any of the course's (lowercased) <see cref="CourseRow.CareerPaths"/> case-insensitive-substring-
    /// matches, in EITHER direction, any engine career (a single boolean gate via <c>.Any()</c>, not accumulated per
    /// match — see FM-DOTNET-086 course-rec-language-parity porting report §4/§9); cap at 100; sort by matchScore DESC
    /// (stable → ties keep the id-ordered load order, a determinism superset over the legacy unordered take-100);
    /// take 10. Language filtering itself is NOT this function's concern — courses are assumed pre-filtered to the
    /// caller's allowed languages by the reader/query layer before reaching this scorer (mirrors the TS split between
    /// query-time `resolveAllowedCourseLanguages` and in-memory `scoreCourse`).
    /// </summary>
    public static IReadOnlyList<(CourseRow Course, int MatchScore)> Score(
        IReadOnlyList<CourseRow> courses,
        IReadOnlySet<string> enrolledCourseIds,
        IReadOnlyList<string> preferredFieldsLower,
        IReadOnlyList<string> engineCareersLower)
    {
        return courses
            .Where(c => !enrolledCourseIds.Contains(c.Id))
            .Select(c =>
            {
                var score = 50;
                var text = $"{c.Title} {c.ShortDescription} {c.Category}".ToLowerInvariant();
                foreach (var field in preferredFieldsLower)
                {
                    if (text.Contains(field, StringComparison.Ordinal))
                    {
                        score += 15;
                    }
                }

                if (c.RatingNumber > 4)
                {
                    score += 10;
                }

                if (engineCareersLower.Count > 0)
                {
                    var courseCareerPathsLower = c.CareerPaths.Select(cp => cp.ToLowerInvariant());
                    var engineCareerAligned = courseCareerPathsLower.Any(cp =>
                        engineCareersLower.Any(ec => cp.Contains(ec, StringComparison.Ordinal) || ec.Contains(cp, StringComparison.Ordinal)));
                    if (engineCareerAligned)
                    {
                        score += 10;
                    }
                }

                return (Course: c, MatchScore: Math.Min(100, score));
            })
            .OrderByDescending(x => x.MatchScore) // stable — preserves the id-ordered load order on ties
            .Take(10)
            .ToList();
    }
}

/// <summary>
/// Ports extractEngineCareerTitles (courseService.ts) — used ONLY by <see cref="CoursePlanRecommendationsScorer"/>'s
/// engine-career-alignment bonus (FM-DOTNET-086 course-rec-language-parity porting report §4/§5). Handles both the
/// schema-documented array-of-objects shape (currently unused by any TS writer) and the REAL persisted shape — a JSON
/// OBJECT keyed by catalog programId, <c>{ [programId]: aiInsightText }</c>, written by careerService.ts's
/// scoreCareers. Absent/null/non-object/non-array input, or the Prisma schema-default empty array literal, → [].
/// Never throws.
/// </summary>
public static class EngineCareerTitleExtractor
{
    private const int MaxTitles = 5;

    /// <summary>
    /// CRITICAL parity detail (report §4): for the object shape, "top 5" means the first 5 property names in
    /// JSON-DOCUMENT order — the real data carries no rank/score, so JS's <c>Object.keys(...).slice(0,5)</c> relies on
    /// ECMA-262's guaranteed string-key insertion-order enumeration. This reads via
    /// <see cref="JsonElement.EnumerateObject"/>, which preserves source-document property order, and NEVER via a
    /// <c>Dictionary&lt;string,string&gt;</c> (whose enumeration order is an implementation detail, not a documented
    /// contract, and is not safe to rely on for byte-for-byte TS parity).
    ///
    /// KNOWN PARITY GAP (documented, not silently approximated): TS resolves each programId key to its
    /// human-readable <c>programTitle</c> via an in-memory career catalog (data/careers.json), falling back to the raw
    /// key only on a catalog miss. This repo has no ported career-catalog data source yet (confirmed: no
    /// careers.json / CareerCatalog-equivalent under services/api/src as of this port), so every key resolves via the
    /// TS catalog-miss fallback path — the raw programId string is used as the comparand. This converges with TS
    /// once/if a catalog is ported here, but diverges from TS today for any prod careerMatches key that TS's catalog
    /// WOULD have resolved to a different display title (see FM-DOTNET-086 course-rec-language-parity porting report
    /// §2/§9 for the full gap writeup).
    /// </summary>
    public static IReadOnlyList<string> Extract(JsonElement careerMatches)
    {
        switch (careerMatches.ValueKind)
        {
            case JsonValueKind.Object:
                return careerMatches.EnumerateObject()
                    .Take(MaxTitles)
                    .Select(p => p.Name)
                    .ToList();

            case JsonValueKind.Array:
                var titles = new List<string>();
                foreach (var entry in careerMatches.EnumerateArray().Take(MaxTitles))
                {
                    if (entry.ValueKind != JsonValueKind.Object)
                    {
                        continue;
                    }

                    var title = TryGetString(entry, "programTitle") ?? TryGetString(entry, "title") ?? TryGetString(entry, "name");
                    if (title is not null)
                    {
                        titles.Add(title);
                    }
                }

                return titles;

            default:
                return []; // absent / null / scalar → never throws
        }
    }

    private static string? TryGetString(JsonElement obj, string propertyName) =>
        obj.TryGetProperty(propertyName, out var prop) && prop.ValueKind == JsonValueKind.String ? prop.GetString() : null;
}

/// <summary>
/// Ports computeEligibilityMap (schoolCoursesService.ts L991-1031) reduced to the endpoint's shape (courseId /
/// courseCode / eligible / missing codes). Resolution map = the WHOLE catalog by UPPER(code) (last-by-id wins on a
/// case collision — a determinism superset over the legacy JS-Map insertion order); enumeration = active + status
/// "active" only. A course is eligible when the caller's grade level is allowed AND no prerequisite is missing. A
/// not-in-catalog prereq contributes its RAW code to missing; an uncompleted in-catalog prereq contributes the
/// resolved course's code.
/// </summary>
public static class EligibilityMapComputer
{
    public sealed record CatalogCourse(
        string Id, string Code, IReadOnlyList<int> GradeLevels, IReadOnlyList<string> Prerequisites, bool IsActive, string Status);

    public static IReadOnlyList<EligibilityEntry> Compute(
        IReadOnlyList<CatalogCourse> catalog, IReadOnlySet<string> completedCourseIds, int? studentGradeLevel)
    {
        // Resolution over the FULL catalog by UPPER(code); build in load (id) order so last-by-id wins on a collision.
        var byCode = new Dictionary<string, CatalogCourse>(StringComparer.Ordinal);
        foreach (var c in catalog)
        {
            byCode[c.Code.ToUpperInvariant()] = c;
        }

        var entries = new List<EligibilityEntry>();
        foreach (var course in catalog.Where(c => c.IsActive && c.Status == "active"))
        {
            var missingCodes = new List<string>();

            // student.gradeLevel is JS-truthy (non-null AND non-zero) AND gradeLevels non-empty AND not included.
            var gradeError = studentGradeLevel is int g && g != 0
                && course.GradeLevels.Count > 0 && !course.GradeLevels.Contains(g);

            foreach (var rawPrereq in course.Prerequisites)
            {
                if (string.IsNullOrEmpty(rawPrereq?.Trim()))
                {
                    continue; // !prereqCode?.trim()
                }

                if (!byCode.TryGetValue(rawPrereq.Trim().ToUpperInvariant(), out var prereq))
                {
                    missingCodes.Add(rawPrereq); // not in catalog → RAW code
                }
                else if (!completedCourseIds.Contains(prereq.Id))
                {
                    missingCodes.Add(prereq.Code); // uncompleted → resolved course's code
                }
            }

            entries.Add(new EligibilityEntry(
                CourseId: course.Id,
                CourseCode: course.Code,
                Eligible: !gradeError && missingCodes.Count == 0,
                MissingCodes: missingCodes));
        }

        return entries;
    }
}
