using FormMaps.Application.Assessments;

namespace FormMaps.UnitTests.Assessments;

/// <summary>
/// Pins the pure timeline merge (legacy getTimeline / getTimelineStats): heterogeneous events with
/// score only on pca, stable date-DESC sort (ties keep pca &lt; evaluation &lt; course), in-memory
/// pagination, Z-string dates, and the stats aggregate (total = 5 + evals + courses).
/// </summary>
public class AssessmentTimelineTests
{
    private static DateTime D(int day) => new(2026, 6, day, 0, 0, 0, DateTimeKind.Utc);

    [Fact]
    public void Merges_sorts_desc_and_maps_each_type()
    {
        var pca = new[]
        {
            new PcaTimelineRow("p1", "Pattern", "PatternRecognition", true, 90, D(3)),  // completed -> mil
            new PcaTimelineRow("p2", "Verbal", "VerbalReasoning", false, 0, D(1)),       // in progress -> pca, score 0
        };
        var evals = new[] { new EvalTimelineRow("e1", "peer", "Ms. Ruiz", false, D(2)) };
        var courses = new[] { new CourseTimelineRow("c1", "course-42", "enrolled", 30, D(4), D(1)) };

        var result = AssessmentTimeline.BuildTimeline(pca, evals, courses, page: 1, limit: 50);

        Assert.Equal(4, result.Total);
        Assert.Equal(1, result.TotalPages);
        Assert.Equal(new TimelineSummary(2, 1, 1), result.Summary);

        // date DESC: course(4), mil(3), eval(2), pca(1)
        Assert.Equal(new[] { "course", "mil", "evaluation", "pca" }, result.Events.Select(e => e.Type).ToArray());

        var mil = result.Events[1];
        Assert.Equal("Pattern", mil.Title);
        Assert.Equal("completed", mil.Status);
        Assert.Equal(90, mil.Score);
        Assert.Equal("2026-06-03T00:00:00.000Z", mil.Date);

        var pcaEvent = result.Events[3];
        Assert.Equal("in_progress", pcaEvent.Status);
        Assert.Equal(0, pcaEvent.Score); // present even when 0

        var evalEvent = result.Events[2];
        Assert.Equal("360° Evaluation - peer", evalEvent.Title);
        Assert.Equal("pending", evalEvent.Status);
        Assert.Null(evalEvent.Score); // omitted on serialization

        var courseEvent = result.Events[0];
        Assert.Equal("Course: course-42", courseEvent.Title);
        Assert.Equal("enrolled", courseEvent.Status);
        Assert.Null(courseEvent.Score);
    }

    [Fact]
    public void Stable_sort_keeps_pca_before_eval_before_course_on_equal_dates()
    {
        var pca = new[] { new PcaTimelineRow("p", "P", "PatternRecognition", false, 10, D(5)) };
        var evals = new[] { new EvalTimelineRow("e", "peer", "X", false, D(5)) };
        var courses = new[] { new CourseTimelineRow("c", "cid", "enrolled", 0, D(5), D(5)) };

        var result = AssessmentTimeline.BuildTimeline(pca, evals, courses, 1, 50);

        Assert.Equal(new[] { "pca", "evaluation", "course" }, result.Events.Select(e => e.Type).ToArray());
    }

    [Fact]
    public void Course_date_falls_back_to_createdDate_when_enrolledAt_null()
    {
        var courses = new[] { new CourseTimelineRow("c", "cid", "enrolled", 0, null, D(7)) };
        var result = AssessmentTimeline.BuildTimeline([], [], courses, 1, 50);
        Assert.Equal("2026-06-07T00:00:00.000Z", result.Events[0].Date);
    }

    [Fact]
    public void Paginates_in_memory()
    {
        var pca = Enumerable.Range(1, 5)
            .Select(i => new PcaTimelineRow($"p{i}", "P", "PatternRecognition", false, i, D(i)))
            .ToArray();

        var page2 = AssessmentTimeline.BuildTimeline(pca, [], [], page: 2, limit: 2);
        Assert.Equal(5, page2.Total);
        Assert.Equal(3, page2.TotalPages); // ceil(5/2)
        Assert.Equal(2, page2.Events.Count);
        // desc dates 5,4,3,2,1 -> page 2 (limit 2) = the 3rd/4th = dates 3,2
        Assert.Equal("2026-06-03T00:00:00.000Z", page2.Events[0].Date);
        Assert.Equal("2026-06-02T00:00:00.000Z", page2.Events[1].Date);
    }

    [Fact]
    public void Large_page_returns_empty_not_first_page()
    {
        // Legacy slice((page-1)*limit, page*limit) returns [] past the end; a naive int32
        // (page-1)*limit would overflow negative and wrongly return the first page.
        var pca = new[] { new PcaTimelineRow("p", "P", "PatternRecognition", false, 10, D(5)) };
        // (30000000-1)*100 ≈ 3e9 overflows int32; BuildTimeline must compute the offset in long.
        var result = AssessmentTimeline.BuildTimeline(pca, [], [], page: 30000000, limit: 100);
        Assert.Empty(result.Events);
        Assert.Equal(1, result.Total);
    }

    [Fact]
    public void Stats_uses_hardcoded_pca_total_of_5()
    {
        var pca = new[]
        {
            new PcaTimelineRow("p1", "P", "PatternRecognition", true, 90, D(1)),
            new PcaTimelineRow("p2", "P", "VerbalReasoning", false, 10, D(2)),
        };
        var evals = new[] { new EvalTimelineRow("e", "peer", "X", true, D(3)) };
        var courses = new[] { new CourseTimelineRow("c", "cid", "completed", 100, D(4), D(4)) };

        var stats = AssessmentTimeline.BuildStats(pca, evals, courses);

        // completed = 1 pca + 1 eval + 1 course = 3; total = 5 + 1 + 1 = 7; round(3/7*100)=43
        Assert.Equal(43, stats.OverallCompletion);
        Assert.Equal(new BreakdownItem(1, 5), stats.AssessmentBreakdown.Pca);
        Assert.Equal(new BreakdownItem(1, 1), stats.AssessmentBreakdown.Evaluation);
        Assert.Equal(new BreakdownItem(1, 1), stats.AssessmentBreakdown.Courses);
    }

    [Fact]
    public void Stats_empty_is_zero_completion()
    {
        var stats = AssessmentTimeline.BuildStats([], [], []);
        Assert.Equal(0, stats.OverallCompletion); // totalItems = 5 (>0) -> round(0/5*100)=0
        Assert.Equal(new BreakdownItem(0, 5), stats.AssessmentBreakdown.Pca);
    }
}
