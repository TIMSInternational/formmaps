namespace FormMaps.Application.StudentCoursePlan;

/// <summary>
/// Pure compute for the two course-plan.ts compute reads (FM-DOTNET-086). Kept out of the reader so the scoring /
/// eligibility rules are unit-testable without a DB.
/// </summary>
public static class CoursePlanRecommendationsScorer
{
    /// <summary>
    /// Ports the recommendations scorer (course-plan.ts L170-182): drop already-enrolled courses; base 50; +15 for each
    /// preferredField (already lowercased) that is a substring of "title shortDescription category" lowercased; +10 when
    /// rating &gt; 4; cap at 100; sort by matchScore DESC (stable → ties keep the id-ordered load order, a determinism
    /// superset over the legacy unordered take-100); take 10.
    /// </summary>
    public static IReadOnlyList<(CourseRow Course, int MatchScore)> Score(
        IReadOnlyList<CourseRow> courses, IReadOnlySet<string> enrolledCourseIds, IReadOnlyList<string> preferredFieldsLower)
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

                return (Course: c, MatchScore: Math.Min(100, score));
            })
            .OrderByDescending(x => x.MatchScore) // stable — preserves the id-ordered load order on ties
            .Take(10)
            .ToList();
    }
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
