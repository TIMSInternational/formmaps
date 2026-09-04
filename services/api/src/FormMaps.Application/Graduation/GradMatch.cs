namespace FormMaps.Application.Graduation;

/// <summary>
/// Byte-for-byte port of legacy <c>api/src/lib/gradMatch.ts</c> — the single rule that decides whether a
/// completed course counts toward a graduation category. Pure, and deliberately kept in the Application layer
/// (not inside a reader) because BOTH /graduation/progress/:studentId and /graduation/gap-analysis/:studentId
/// call it, and legacy has a unit-test file of its own for it (__tests__/grad-match.test.ts).
///
/// The rule has two mutually exclusive arms and the order matters:
///   * an explicit requiredCourses list wins — the course matches ONLY by exact (lowercased) code, so a course
///     in the right department but not on the list does NOT count;
///   * otherwise the course's department must equal the category name (both lowercased), and an empty
///     department never matches.
/// </summary>
public static class GradMatch
{
    public static bool CourseMatchesCategory(
        string? courseCode,
        string? courseDepartment,
        string? category,
        IReadOnlyList<string>? requiredCourses)
    {
        var code = (courseCode ?? string.Empty).ToLowerInvariant();

        if (requiredCourses is { Count: > 0 })
        {
            return code.Length > 0
                && requiredCourses.Any(r => string.Equals(r.ToLowerInvariant(), code, StringComparison.Ordinal));
        }

        var department = (courseDepartment ?? string.Empty).ToLowerInvariant();
        var categoryName = (category ?? string.Empty).ToLowerInvariant();
        return department.Length > 0 && string.Equals(department, categoryName, StringComparison.Ordinal);
    }
}
