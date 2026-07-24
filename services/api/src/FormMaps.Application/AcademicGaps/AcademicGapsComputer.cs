using FormMaps.Application.Assessments;
using FormMaps.Application.SchoolAnalytics;

namespace FormMaps.Application.AcademicGaps;

/// <summary>
/// Pure, DB-free port of the credit/gap arithmetic in routes/academic-gaps.ts (the 3 non-AI reads). Ports the two
/// shared helpers verbatim — <c>courseMatchesCategory</c> (lib/gradMatch.ts) and <c>creditDeficitStatus</c>
/// (lib/gradStatus.ts) — plus each endpoint's per-student compute. No I/O → golden-pinnable without a database.
///
/// <para><b>Two DELIBERATE per-endpoint divergences preserved:</b> (1) /summary's earned adds <c>Number(g.credits)</c>
/// even when the grade's course is missing (<c>course ? Number(course.credits) : 0</c> only guards the fallback),
/// whereas /students/{id}'s totalCreditsEarned SKIPS a grade whose course is missing entirely (<c>if (!course)
/// continue</c>). (2) /summary's per-student "missing" count and /recommendations do NOT apply the elective
/// fallback; only /students/{id}'s catCredits does. Both are faithful to the live TS.</para>
///
/// <para><b>Rounding.</b> progressPercent uses JS <c>Math.round</c> (ties toward +∞) via <see cref="SchoolAnalyticsMath.JsRound"/>,
/// not .NET banker's rounding. All credit values arrive as double (Number()-ified upstream).</para>
/// </summary>
public static class AcademicGapsComputer
{
    // ---- shared helper ports ----

    /// <summary>lib/gradMatch.ts courseMatchesCategory: STRICT to requiredCourses codes when present (case-insensitive),
    /// else department-name == category (both non-empty). Lowercasing is ordinal/invariant (ASCII codes/depts).</summary>
    public static bool CourseMatchesCategory(string? code, string? department, GapCategory cat)
    {
        var codeLower = (code ?? string.Empty).ToLowerInvariant();
        if (cat.RequiredCourses.Count > 0)
        {
            if (codeLower.Length == 0)
            {
                return false;
            }

            foreach (var required in cat.RequiredCourses)
            {
                if (string.Equals(required.ToLowerInvariant(), codeLower, StringComparison.Ordinal))
                {
                    return true;
                }
            }

            return false;
        }

        var deptLower = (department ?? string.Empty).ToLowerInvariant();
        var categoryLower = (cat.Category ?? string.Empty).ToLowerInvariant();
        return deptLower.Length > 0 && string.Equals(deptLower, categoryLower, StringComparison.Ordinal);
    }

    /// <summary>lib/gradStatus.ts creditDeficitStatus: on_track (deficit ≤ 0) / off_track (deficit &gt; 30% of the
    /// requirement) / at_risk (otherwise).</summary>
    public static string CreditDeficitStatus(double deficit, double totalRequired)
    {
        if (deficit <= 0)
        {
            return "on_track";
        }

        if (totalRequired > 0 && deficit > totalRequired * 0.3)
        {
            return "off_track";
        }

        return "at_risk";
    }

    // ---- GET /summary ----

    public static SummaryResult ComputeSummary(SummaryLoad load)
    {
        if (!load.HasRules || load.Students.Count == 0)
        {
            return new SummaryResult([], null);
        }

        var totalRequired = load.TotalRequired;
        var categories = load.Categories;

        var gradesByStudent = new Dictionary<string, List<GapGrade>>(StringComparer.Ordinal);
        foreach (var g in load.Grades)
        {
            if (!gradesByStudent.TryGetValue(g.StudentId, out var list))
            {
                gradesByStudent[g.StudentId] = list = [];
            }

            list.Add(g);
        }

        var perStudent = new List<StudentGapRow>(load.Students.Count);
        foreach (var student in load.Students)
        {
            var studentGrades = gradesByStudent.TryGetValue(student.Id, out var sg) ? sg : [];

            // earned: own credits when > 0, else the course's catalog credits (0 when the course is missing) — but the
            // Number(g.credits) branch fires regardless of whether the course exists.
            double earned = 0;
            foreach (var g in studentGrades)
            {
                var hasCourse = load.Courses.TryGetValue(g.CourseId, out var course);
                earned += g.Credits > 0 ? g.Credits : (hasCourse ? course!.Credits : 0);
            }

            var deficit = Math.Max(0, totalRequired - earned);

            // missing: categories whose matched-earned credits fall short. NO elective fallback here; a grade whose
            // course is missing is skipped.
            var missing = 0;
            foreach (var cat in categories)
            {
                double catEarned = 0;
                foreach (var g in studentGrades)
                {
                    if (!load.Courses.TryGetValue(g.CourseId, out var course))
                    {
                        continue;
                    }

                    if (CourseMatchesCategory(course.Code, course.Department, cat))
                    {
                        catEarned += g.Credits > 0 ? g.Credits : course.Credits;
                    }
                }

                if (catEarned < cat.MinCredits)
                {
                    missing++;
                }
            }

            var status = CreditDeficitStatus(deficit, totalRequired);
            var progressPercent = totalRequired > 0
                ? Math.Min(100, SchoolAnalyticsMath.JsRound(earned / totalRequired * 100))
                : 0;

            perStudent.Add(new StudentGapRow(
                StudentId: student.Id,
                StudentName: student.Name,
                GradeLevel: student.GradeLevel,
                OverallStatus: status,
                CreditDeficit: deficit,
                MissingRequiredCourses: missing,
                CreditsEarned: earned,
                CreditsRequired: totalRequired,
                ProgressPercent: progressPercent,
                TopGap: string.Empty));
        }

        var summary = new GapSummary(
            TotalStudents: load.Students.Count,
            OnTrack: perStudent.Count(s => s.OverallStatus == "on_track"),
            AtRisk: perStudent.Count(s => s.OverallStatus == "at_risk"),
            OffTrack: perStudent.Count(s => s.OverallStatus == "off_track"));

        return new SummaryResult(perStudent, summary);
    }

    // ---- GET /students/{studentId} (HasRules == true; the endpoint owns the empty-shape branch) ----

    public static StudentGapsResult ComputeStudentDetail(StudentGapsLoad load)
    {
        var categories = load.Categories;
        var electiveCat = FindElectiveCategory(categories);

        // catCredits keyed by category name (later init wins on a duplicate name, matching the JS object).
        var catCredits = new Dictionary<string, double>(StringComparer.Ordinal);
        foreach (var cat in categories)
        {
            catCredits[cat.Category] = 0;
        }

        double totalCreditsEarned = 0;
        foreach (var g in load.Grades)
        {
            if (!load.Courses.TryGetValue(g.CourseId, out var course))
            {
                continue;
            }

            var credits = g.Credits > 0 ? g.Credits : course.Credits;
            totalCreditsEarned += credits;

            var matched = false;
            foreach (var cat in categories)
            {
                if (CourseMatchesCategory(course.Code, course.Department, cat))
                {
                    catCredits[cat.Category] += credits;
                    matched = true;
                    break;
                }
            }

            if (!matched && electiveCat is not null)
            {
                catCredits[electiveCat.Category] += credits;
            }
        }

        var gaps = new List<GapEntry>();
        foreach (var cat in categories)
        {
            var earned = catCredits.GetValueOrDefault(cat.Category, 0);
            var needed = cat.MinCredits - earned;
            if (needed > 0)
            {
                gaps.Add(new GapEntry(cat.Category, earned, cat.MinCredits, needed));
            }
        }

        return new StudentGapsResult(load.StudentId, load.StudentName, load.GradeLevel, totalCreditsEarned, load.TotalRequired, gaps);
    }

    // ---- GET /recommendations/{studentId} (HasRules == true) ----

    public static RecommendationsResult ComputeRecommendations(RecommendationsLoad load)
    {
        var categories = load.Categories;
        var completedCourseIds = new HashSet<string>(load.Grades.Select(g => g.CourseId), StringComparer.Ordinal);
        var courseMap = new Dictionary<string, GapCourse>(StringComparer.Ordinal);
        foreach (var c in load.Courses)
        {
            courseMap[c.Id] = c;
        }

        // Matched credits per category (NO elective fallback).
        var catCredits = new Dictionary<string, double>(StringComparer.Ordinal);
        foreach (var cat in categories)
        {
            catCredits[cat.Category] = 0;
        }

        foreach (var g in load.Grades)
        {
            if (!courseMap.TryGetValue(g.CourseId, out var course))
            {
                continue;
            }

            var credits = g.Credits > 0 ? g.Credits : course.Credits;
            foreach (var cat in categories)
            {
                if (CourseMatchesCategory(course.Code, course.Department, cat))
                {
                    catCredits[cat.Category] += credits;
                    break;
                }
            }
        }

        var recommendations = new List<CourseRec>();
        foreach (var cat in categories)
        {
            var shortfall = cat.MinCredits - catCredits.GetValueOrDefault(cat.Category, 0);
            if (shortfall <= 0)
            {
                continue;
            }

            var taken = 0;
            foreach (var course in load.Courses)
            {
                if (taken >= 3)
                {
                    break;
                }

                if (completedCourseIds.Contains(course.Id))
                {
                    continue;
                }

                if (!CourseMatchesCategory(course.Code, course.Department, cat))
                {
                    continue;
                }

                recommendations.Add(new CourseRec(
                    CourseId: course.Id,
                    CourseCode: course.Code,
                    CourseName: course.Name,
                    Credits: course.Credits,
                    Category: cat.Category,
                    Reason: $"Helps fill {JsNumber.ToJsonNumber(shortfall)} credit shortfall in {cat.Category}"));
                taken++;
            }
        }

        return new RecommendationsResult(recommendations);
    }

    // electiveCat = first category with electivesAllowed AND category name containing "elective" (case-insensitive).
    private static GapCategory? FindElectiveCategory(IReadOnlyList<GapCategory> categories)
    {
        foreach (var cat in categories)
        {
            if (cat.ElectivesAllowed && (cat.Category ?? string.Empty).ToLowerInvariant().Contains("elective"))
            {
                return cat;
            }
        }

        return null;
    }
}
