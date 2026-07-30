using FormMaps.Application.Counselor;

namespace FormMaps.UnitTests.Counselor;

/// <summary>
/// Pure-logic parity tests for <see cref="EnrichedCaseloadComputer"/> (FM-DOTNET-068 — listEnrichedStudents
/// enrichment). Pins GPA/credit math, the three assessment badges (incl. the eval360 min(total,3) rule), at-risk
/// status, credit-progress percentage, career-path jsonb precedence, the search/status filters, the sort keys (name via
/// ICU localeCompare; gpa/alertCount/gradeLevel numeric, desc), and pagination + totalPages.
/// </summary>
public class EnrichedCaseloadComputerTests
{
    private static readonly EnrichedCaseloadOptions DefaultOpts = new(null, null, null, null, Page: 1, Limit: 20);

    [Fact]
    public void Empty_students_returns_empty_page()
    {
        var result = EnrichedCaseloadComputer.Compute(CaseloadData.Empty, DefaultOpts);
        Assert.Empty(result.Data);
        Assert.Equal(0, result.Total);
        Assert.Equal(0, result.TotalPages);
    }

    [Fact]
    public void Gpa_averages_mapped_grades_rounded_2dp_and_skips_unmapped()
    {
        // A(4) + B(3) + "P"(unmapped, skipped) → avg 3.5.
        var data = Data(
            students: [Student("s1")],
            grades: [Grade("s1", "A", 3, "c1"), Grade("s1", "B", 3, "c1"), Grade("s1", "P", 3, "c1")]);

        var s = Single(data);
        Assert.Equal(3.5, s.Gpa);
    }

    [Fact]
    public void Credits_earned_uses_own_credits_or_course_fallback()
    {
        var data = Data(
            students: [Student("s1")],
            grades: [Grade("s1", "A", 0, "c1"), Grade("s1", "B", 2.5, "c2")],
            courseCredits: new() { ["c1"] = 4 }); // c1 own=0 → fallback 4; c2 own=2.5 → 2.5

        var s = Single(data);
        Assert.Equal(6.5, s.CreditProgress.Earned);
    }

    [Theory]
    [InlineData(5, false, "completed")]  // all 5 exam types completed
    [InlineData(2, false, "in_progress")] // some completed
    [InlineData(0, true, "in_progress")]  // started but none completed
    [InlineData(0, false, "not_started")]
    public void Lia_badge(int completedTypes, bool startedOnly, string expected)
    {
        var sessions = new List<CaseloadPcaSession>();
        var types = new[] { "PatternRecognition", "VerbalReasoning", "WorkingMemory", "NumericVelocity", "VisualRotation" };
        for (var i = 0; i < completedTypes; i++)
        {
            sessions.Add(new CaseloadPcaSession("s1", types[i], "Completed"));
        }

        if (startedOnly)
        {
            sessions.Add(new CaseloadPcaSession("s1", "PatternRecognition", "InProgress"));
        }

        var s = Single(Data(students: [Student("s1")], pcaSessions: sessions));
        Assert.Equal(expected, s.Lia);
    }

    [Theory]
    [InlineData(3, 3, "completed")]   // completed >= min(total,3)
    [InlineData(5, 3, "completed")]   // min(5,3)=3, completed 3 → completed
    [InlineData(4, 2, "in_progress")] // completed 2 < min(4,3)=3
    [InlineData(2, 0, "in_progress")] // total>0, none completed → in_progress (NOT not_started)
    public void Eval360_badge_uses_min_total_3(int total, int completed, string expected)
    {
        var groups = new List<CaseloadEvalGroup>();
        for (var i = 0; i < total; i++)
        {
            groups.Add(new CaseloadEvalGroup("s1", i < completed));
        }

        var s = Single(Data(students: [Student("s1")], evalGroups: groups));
        Assert.Equal(expected, s.Eval360);
    }

    [Theory]
    [InlineData(true, "completed")]    // any pca_evaluation isCompleted → completed
    [InlineData(false, "in_progress")] // a pca_evaluation row exists but not completed → in_progress
    public void Pca_badge_from_pca_evaluations(bool completed, string expected)
    {
        var s = Single(Data(students: [Student("s1")], pcaEvals: [new CaseloadPcaEval("s1", completed)]));
        Assert.Equal(expected, s.Pca);
    }

    [Theory]
    [InlineData(true, "completed")]
    [InlineData(false, "not_started")]
    public void Personality_badge_from_completed_user_ids(bool completedListed, string expected)
    {
        var s = Single(Data(students: [Student("s1")], personalityCompletedUserIds: completedListed ? ["s1"] : []));
        Assert.Equal(expected, s.Personality);
    }

    [Fact]
    public void Pca_badge_not_started_with_no_evaluations()
    {
        Assert.Equal("not_started", Single(Data(students: [Student("s1")])).Pca);
    }

    [Fact]
    public void Status_inactive_then_at_risk_then_active()
    {
        var inactive = Single(Data(students: [Student("s1", isActive: false)]));
        Assert.Equal("inactive", inactive.Status);

        var atRiskGpa = Single(Data(students: [Student("s1")], grades: [Grade("s1", "F", 1, "c1")]));
        Assert.Equal("at_risk", atRiskGpa.Status); // gpa 0 < 2.5

        var atRiskAlert = Single(Data(students: [Student("s1")], grades: [Grade("s1", "A", 1, "c1")], alertCounts: new() { ["s1"] = 2 }));
        Assert.Equal("at_risk", atRiskAlert.Status);
        Assert.Equal(2, atRiskAlert.AlertCount);

        var active = Single(Data(students: [Student("s1")], grades: [Grade("s1", "A", 1, "c1")]));
        Assert.Equal("active", active.Status);
    }

    [Fact]
    public void Credit_progress_percentage_caps_at_100()
    {
        var data = Data(students: [Student("s1")], grades: [Grade("s1", "A", 200, "c1")], creditsRequired: 120);
        var s = Single(data);
        Assert.Equal(120, s.CreditProgress.Required);
        Assert.Equal(100, s.CreditProgress.Percentage); // min(100, round(200/120*100))
    }

    [Fact]
    public void Career_path_precedence_name_then_careerName_then_cluster_then_clusterName()
    {
        var data = Data(students: [Student("s0"), Student("s1"), Student("s2"), Student("s3"), Student("s4")], profiles:
        [
            new CaseloadProfile("s0", """[{"name":"Doctor","careerName":"X","cluster":"Health"}]"""), // name WINS
            new CaseloadProfile("s1", """[{"name":"","careerName":"Engineer","cluster":"STEM"}]"""),   // empty name → careerName
            new CaseloadProfile("s2", """[{"cluster":"Arts"}]"""),                                     // → cluster
            new CaseloadProfile("s3", """[]"""),                                                       // empty → null
            new CaseloadProfile("s4", """not json"""),                                                 // malformed → null
        ]);

        var byId = EnrichedCaseloadComputer.Compute(data, DefaultOpts).Data.ToDictionary(s => s.Id);
        Assert.Equal("Doctor", byId["s0"].CareerPath);
        Assert.Equal("Engineer", byId["s1"].CareerPath);
        Assert.Equal("Arts", byId["s2"].CareerPath);
        Assert.Null(byId["s3"].CareerPath);
        Assert.Null(byId["s4"].CareerPath);
    }

    [Fact]
    public void Search_filters_name_or_email_case_insensitively()
    {
        var data = Data(students:
        [
            Student("s1", name: "Alice Smith", email: "alice@x.st"),
            Student("s2", name: "Bob Jones", email: "bob@x.st"),
        ]);

        var result = EnrichedCaseloadComputer.Compute(data, DefaultOpts with { Search = "smith" });
        Assert.Single(result.Data);
        Assert.Equal("s1", result.Data[0].Id);
        Assert.Equal(1, result.Total);
    }

    [Fact]
    public void Status_filter_applies()
    {
        var data = Data(
            students: [Student("s1", isActive: false), Student("s2")],
            grades: [Grade("s2", "A", 1, "c1")]);

        var result = EnrichedCaseloadComputer.Compute(data, DefaultOpts with { Status = "inactive" });
        Assert.Single(result.Data);
        Assert.Equal("s1", result.Data[0].Id);
    }

    [Fact]
    public void Sort_by_name_ascending_and_descending()
    {
        var data = Data(students: [Student("s1", name: "Charlie"), Student("s2", name: "Alice"), Student("s3", name: "Bob")]);

        var asc = EnrichedCaseloadComputer.Compute(data, DefaultOpts with { SortBy = "name" }).Data.Select(s => s.Name);
        Assert.Equal(["Alice", "Bob", "Charlie"], asc);

        var desc = EnrichedCaseloadComputer.Compute(data, DefaultOpts with { SortBy = "name", SortOrder = "desc" }).Data.Select(s => s.Name);
        Assert.Equal(["Charlie", "Bob", "Alice"], desc);
    }

    [Fact]
    public void Sort_by_gpa_and_gradeLevel_numeric()
    {
        var data = Data(
            students: [Student("s1", gradeLevel: 12), Student("s2", gradeLevel: 9), Student("s3", gradeLevel: 11)],
            grades: [Grade("s1", "A", 1, "c1"), Grade("s2", "C", 1, "c1")]); // s1 gpa 4, s2 gpa 2, s3 null(-1)

        var byGpaDesc = EnrichedCaseloadComputer.Compute(data, DefaultOpts with { SortBy = "gpa", SortOrder = "desc" }).Data.Select(s => s.Id);
        Assert.Equal(["s1", "s2", "s3"], byGpaDesc);

        var byGrade = EnrichedCaseloadComputer.Compute(data, DefaultOpts with { SortBy = "gradeLevel" }).Data.Select(s => s.Id);
        Assert.Equal(["s2", "s3", "s1"], byGrade); // 9, 11, 12
    }

    [Fact]
    public void Pagination_slices_and_reports_totalpages()
    {
        var students = Enumerable.Range(1, 5).Select(i => Student($"s{i}", name: $"Name{i}")).ToList();
        var data = Data(students: students);

        var page2 = EnrichedCaseloadComputer.Compute(data, DefaultOpts with { Page = 2, Limit = 2 });
        Assert.Equal(5, page2.Total);
        Assert.Equal(3, page2.TotalPages);       // ceil(5/2)
        Assert.Equal(2, page2.Data.Count);
        Assert.Equal(["Name3", "Name4"], page2.Data.Select(s => s.Name));

        var page3 = EnrichedCaseloadComputer.Compute(data, DefaultOpts with { Page = 3, Limit = 2 });
        Assert.Single(page3.Data);
        Assert.Equal("Name5", page3.Data[0].Name);
    }

    // ---- builders ----

    private static EnrichedStudent Single(CaseloadData data) =>
        Assert.Single(EnrichedCaseloadComputer.Compute(data, DefaultOpts).Data);

    private static CaseloadStudent Student(
        string id, string? name = "Name", string? email = "e@x.st", int? gradeLevel = 11, bool isActive = true) =>
        new(id, name, email, gradeLevel, isActive, "2026-01-01T00:00:00.000Z");

    private static CaseloadGrade Grade(string studentId, string? grade, double credits, string courseId) =>
        new(studentId, grade, credits, courseId);

    private static CaseloadData Data(
        IReadOnlyList<CaseloadStudent> students,
        IReadOnlyList<CaseloadGrade>? grades = null,
        IReadOnlyList<CaseloadPcaSession>? pcaSessions = null,
        IReadOnlyList<CaseloadEvalGroup>? evalGroups = null,
        IReadOnlyList<CaseloadPcaEval>? pcaEvals = null,
        IReadOnlyList<CaseloadProfile>? profiles = null,
        Dictionary<string, int>? alertCounts = null,
        Dictionary<string, double>? courseCredits = null,
        double creditsRequired = 120,
        IReadOnlyList<string>? personalityCompletedUserIds = null) =>
        new(students, grades ?? [], pcaSessions ?? [], evalGroups ?? [], pcaEvals ?? [], profiles ?? [],
            alertCounts ?? new(), courseCredits ?? new(), creditsRequired, personalityCompletedUserIds ?? []);
}
