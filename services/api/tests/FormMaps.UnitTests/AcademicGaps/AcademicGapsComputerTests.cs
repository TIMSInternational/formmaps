using FormMaps.Application.AcademicGaps;

namespace FormMaps.UnitTests.AcademicGaps;

/// <summary>
/// Pure-logic parity tests for <see cref="AcademicGapsComputer"/> (FM-DOTNET-080 — the 3 non-AI academic-gaps reads).
/// Pins the two shared-helper ports (courseMatchesCategory strict-vs-department; creditDeficitStatus buckets), the
/// credit fallback, the elective fallback (student-detail only), the missing-count, progressPercent (JsRound + the 100
/// cap), and the two DELIBERATE per-endpoint divergences (summary counts credits without a course; detail skips them).
/// </summary>
public class AcademicGapsComputerTests
{
    private static GapCategory Cat(string name, double min, string[]? required = null, bool electives = true) =>
        new(name, min, required ?? [], electives);

    private static GapCourse Course(string id, string? code, string? dept, double credits, string? name = null) =>
        new(id, code, name ?? code, dept, credits);

    // ---- courseMatchesCategory ----

    [Fact]
    public void Match_strict_to_required_codes_case_insensitive()
    {
        var cat = Cat("English", 4, required: ["ENG-9", "ENG-10"]);
        Assert.True(AcademicGapsComputer.CourseMatchesCategory("eng-9", "Science", cat));   // code wins over dept
        Assert.False(AcademicGapsComputer.CourseMatchesCategory("ENG-11", "English", cat)); // not in the list
        Assert.False(AcademicGapsComputer.CourseMatchesCategory("", "English", cat));       // empty code never matches
    }

    [Fact]
    public void Match_falls_back_to_department_when_no_required_list()
    {
        var cat = Cat("Science", 4);
        Assert.True(AcademicGapsComputer.CourseMatchesCategory("BIO-1", "science", cat));   // dept == category (ci)
        Assert.False(AcademicGapsComputer.CourseMatchesCategory("BIO-1", "", cat));          // empty dept never matches
        Assert.False(AcademicGapsComputer.CourseMatchesCategory("BIO-1", "Math", cat));
    }

    // ---- creditDeficitStatus ----

    [Theory]
    [InlineData(0, 100, "on_track")]
    [InlineData(-5, 100, "on_track")]
    [InlineData(10, 100, "at_risk")]   // 10 ≤ 30% of 100
    [InlineData(30, 100, "at_risk")]   // exactly 30% → still at_risk (strict >)
    [InlineData(31, 100, "off_track")] // > 30%
    [InlineData(5, 0, "at_risk")]      // totalRequired 0 → skips off_track branch
    public void Status_buckets(double deficit, double total, string expected) =>
        Assert.Equal(expected, AcademicGapsComputer.CreditDeficitStatus(deficit, total));

    // ---- summary ----

    [Fact]
    public void Summary_empty_when_no_rules_or_no_students()
    {
        Assert.Null(AcademicGapsComputer.ComputeSummary(new SummaryLoad(false, [], [], Empty, [], 120)).Summary);
        Assert.Null(AcademicGapsComputer.ComputeSummary(new SummaryLoad(true, [], [], Empty, [Cat("X", 1)], 120)).Summary);
    }

    [Fact]
    public void Summary_credit_fallback_and_missing_count_and_percent()
    {
        var students = new[] { new GapStudent("s1", "Alice", 11) };
        // g1: own credits 3 (used); g2: own 0 → course catalog 4; g3: own 0 + course MISSING → contributes 0.
        var grades = new[]
        {
            new GapGrade("s1", "c1", 3),
            new GapGrade("s1", "c2", 0),
            new GapGrade("s1", "cX", 0),
        };
        var courses = Map(Course("c1", "ENG-9", "English", 99 /*ignored, own>0*/), Course("c2", "BIO-1", "Science", 4));
        var cats = new[] { Cat("English", 4, required: ["ENG-9"]), Cat("Science", 5) };

        var result = AcademicGapsComputer.ComputeSummary(new SummaryLoad(true, students, grades, courses, cats, 20));
        var row = Assert.Single(result.PerStudent);

        Assert.Equal(7, row.CreditsEarned);            // 3 + 4 + 0 (cX course missing + own 0 → contributes 0)
        Assert.Equal(13, row.CreditDeficit);           // max(0, 20 - 7)
        Assert.Equal(2, row.MissingRequiredCourses);   // English 3<4 short AND Science 4<5 short
        Assert.Equal(20, row.CreditsRequired);
        Assert.Equal(35, row.ProgressPercent);         // round(7/20*100)=35
        Assert.Equal(string.Empty, row.TopGap);
        Assert.NotNull(result.Summary);
        Assert.Equal(1, result.Summary!.TotalStudents);
    }

    [Fact]
    public void Summary_missing_counts_each_short_category()
    {
        var students = new[] { new GapStudent("s1", "Alice", 11) };
        var grades = new[] { new GapGrade("s1", "c1", 3) };                       // 3 English credits
        var courses = Map(Course("c1", "ENG-9", "English", 3));
        var cats = new[] { Cat("English", 4, required: ["ENG-9"]), Cat("Science", 5) }; // English short by 1, Science 0<5

        var result = AcademicGapsComputer.ComputeSummary(new SummaryLoad(true, students, grades, courses, cats, 20));
        Assert.Equal(2, result.PerStudent[0].MissingRequiredCourses); // both categories short
    }

    [Fact]
    public void Summary_progress_percent_caps_at_100()
    {
        var students = new[] { new GapStudent("s1", "Alice", 11) };
        var grades = new[] { new GapGrade("s1", "c1", 200) };
        var courses = Map(Course("c1", "ENG-9", "English", 200));
        var cats = new[] { Cat("English", 4, required: ["ENG-9"]) };

        var result = AcademicGapsComputer.ComputeSummary(new SummaryLoad(true, students, grades, courses, cats, 20));
        Assert.Equal(100, result.PerStudent[0].ProgressPercent);   // min(100, 1000)
        Assert.Equal("on_track", result.PerStudent[0].OverallStatus);
        Assert.Equal(0, result.PerStudent[0].CreditDeficit);
    }

    // ---- student detail ----

    [Fact]
    public void Detail_missing_course_grade_is_skipped_entirely()
    {
        // Divergence vs summary: a grade whose course is absent contributes NOTHING here even with own credits > 0.
        var grades = new[] { new GapGrade("s1", "cX", 5) };
        var load = new StudentGapsLoad(true, "s1", "Alice", 11, grades, Empty, [Cat("English", 4)], 24);
        var result = AcademicGapsComputer.ComputeStudentDetail(load);
        Assert.Equal(0, result.CreditsEarned);   // grade dropped (course missing)
    }

    [Fact]
    public void Detail_elective_fallback_and_gaps()
    {
        // c1 matches English (required); c2 matches nothing → elective fallback lands in "Electives".
        var grades = new[] { new GapGrade("s1", "c1", 3), new GapGrade("s1", "c2", 2) };
        var courses = Map(Course("c1", "ENG-9", "English", 3), Course("c2", "ART-1", "Art", 2));
        var cats = new[]
        {
            Cat("English", 4, required: ["ENG-9"]),
            Cat("Electives", 5, electives: true),   // name contains "elective", electivesAllowed
        };
        var load = new StudentGapsLoad(true, "s1", "Alice", 11, grades, courses, cats, 24);

        var result = AcademicGapsComputer.ComputeStudentDetail(load);
        Assert.Equal(5, result.CreditsEarned);      // 3 + 2
        Assert.Equal(24, result.CreditsRequired);
        // English earned 3 < 4 → gap shortfall 1; Electives earned 2 < 5 → gap shortfall 3.
        Assert.Equal(2, result.Gaps.Count);
        var english = result.Gaps.Single(g => g.Area == "English");
        Assert.Equal(3, english.Earned);
        Assert.Equal(1, english.Shortfall);
        var electives = result.Gaps.Single(g => g.Area == "Electives");
        Assert.Equal(2, electives.Earned);
        Assert.Equal(3, electives.Shortfall);
    }

    [Fact]
    public void Detail_no_gap_when_requirement_met()
    {
        var grades = new[] { new GapGrade("s1", "c1", 6) };
        var courses = Map(Course("c1", "ENG-9", "English", 6));
        var cats = new[] { Cat("English", 4, required: ["ENG-9"]) };
        var result = AcademicGapsComputer.ComputeStudentDetail(new StudentGapsLoad(true, "s1", "A", 11, grades, courses, cats, 24));
        Assert.Empty(result.Gaps);
    }

    // ---- recommendations ----

    [Fact]
    public void Recommendations_first_three_available_per_short_category_with_reason()
    {
        // English short (0 earned, min 4). 4 matching un-completed courses available → only first 3 recommended.
        var courses = new[]
        {
            Course("c1", "ENG-9", "English", 1),
            Course("c2", "ENG-10", "English", 1),
            Course("c3", "ENG-11", "English", 1),
            Course("c4", "ENG-12", "English", 1),
        };
        var cats = new[] { Cat("English", 4) }; // department match (no required list)
        var load = new RecommendationsLoad(true, [], courses, cats);

        var result = AcademicGapsComputer.ComputeRecommendations(load);
        Assert.Equal(3, result.Recommendations.Count);
        Assert.Equal(new[] { "c1", "c2", "c3" }, result.Recommendations.Select(r => r.CourseId).ToArray());
        Assert.Equal("Helps fill 4 credit shortfall in English", result.Recommendations[0].Reason);
        Assert.Equal("ENG-9", result.Recommendations[0].CourseCode);
    }

    [Fact]
    public void Recommendations_excludes_completed_and_met_categories()
    {
        var grades = new[] { new GapGrade("s1", "c1", 4) };  // completed c1 (English), meeting the 4-credit requirement
        var courses = new[] { Course("c1", "ENG-9", "English", 4), Course("c2", "ENG-10", "English", 2) };
        var cats = new[] { Cat("English", 4) };
        var result = AcademicGapsComputer.ComputeRecommendations(new RecommendationsLoad(true, grades, courses, cats));
        Assert.Empty(result.Recommendations);   // requirement met → no shortfall → no recs
    }

    [Fact]
    public void Recommendations_fractional_shortfall_formats_like_js()
    {
        var courses = new[] { Course("c1", "ENG-9", "English", 1) };
        var cats = new[] { Cat("English", 2.5) };
        var result = AcademicGapsComputer.ComputeRecommendations(new RecommendationsLoad(true, [], courses, cats));
        Assert.Equal("Helps fill 2.5 credit shortfall in English", result.Recommendations[0].Reason);
    }

    private static readonly IReadOnlyDictionary<string, GapCourse> Empty = new Dictionary<string, GapCourse>();

    private static IReadOnlyDictionary<string, GapCourse> Map(params GapCourse[] courses) =>
        courses.ToDictionary(c => c.Id, c => c);
}
