using FormMaps.Application.SchoolAnalytics;

namespace FormMaps.UnitTests.SchoolAnalytics;

/// <summary>
/// Pure-math parity for the school-analytics arithmetic (FM-DOTNET-049). No DB. Pins: GRADE_MAP (incl. trim +
/// unknown-skipped), per-student mean, progressScore rounding (a .5 case that distinguishes JS half-up from .NET
/// banker's), the studentsAtRisk &lt; 2.0 boundary, empty-input zeros, range→days, step math, and the half-open
/// [start,end) UTC bucketing (label dates + event placement + empty→all-zeros).
/// </summary>
public class SchoolAnalyticsMathTests
{
    // ---- GRADE_MAP ----

    [Theory]
    [InlineData("A", 4.0)]
    [InlineData("A-", 3.7)]
    [InlineData("B+", 3.3)]
    [InlineData("B", 3.0)]
    [InlineData("B-", 2.7)]
    [InlineData("C+", 2.3)]
    [InlineData("C", 2.0)]
    [InlineData("C-", 1.7)]
    [InlineData("D", 1.0)]
    [InlineData("F", 0.0)]
    public void MapGrade_maps_every_known_grade(string grade, double expected) =>
        Assert.Equal(expected, SchoolAnalyticsMath.MapGrade(grade));

    [Theory]
    [InlineData(" A ")] // trimmed before lookup
    [InlineData("A")]
    public void MapGrade_trims_before_lookup(string grade) =>
        Assert.Equal(4.0, SchoolAnalyticsMath.MapGrade(grade));

    [Theory]
    [InlineData("Z")]       // unknown
    [InlineData("")]        // empty
    [InlineData("   ")]     // whitespace -> trims to ""
    [InlineData("a")]       // case-sensitive: lowercase is unknown
    [InlineData(null)]      // null grade
    public void MapGrade_unknown_or_empty_is_null_not_zero(string? grade) =>
        Assert.Null(SchoolAnalyticsMath.MapGrade(grade));

    // ---- mean ----

    [Fact]
    public void Mean_is_left_to_right_sum_over_count() =>
        Assert.Equal(8.0 / 3.0, SchoolAnalyticsMath.Mean([4.0, 0.0, 4.0]), 12);

    // ---- JsRound (half-up ties) ----

    [Theory]
    [InlineData(0.5, 1)]
    [InlineData(1.5, 2)]
    [InlineData(2.5, 3)] // banker's ToEven would give 2 — this pins half-up
    [InlineData(3.5, 4)]
    [InlineData(0.4, 0)]
    [InlineData(0.6, 1)]
    [InlineData(0.0, 0)]
    public void JsRound_rounds_half_up(double input, double expected) =>
        Assert.Equal(expected, SchoolAnalyticsMath.JsRound(input));

    // ---- progressScore rounding ----

    [Fact]
    public void ProgressScore_uses_half_up_not_bankers()
    {
        // 0.25 * 25 * 10 = 62.5 EXACTLY (0.25 and 250 are exact doubles). Half-up -> 63 -> 6.3;
        // banker's Math.Round(62.5) -> 62 -> 6.2. This is the load-bearing rounding pin.
        Assert.Equal(6.3, SchoolAnalyticsMath.ProgressScore(0.25));
    }

    [Theory]
    [InlineData(4.0, 100.0)]
    [InlineData(2.0, 50.0)]
    [InlineData(0.0, 0.0)]
    [InlineData(3.7, 92.5)]
    public void ProgressScore_scales_gpa_to_1dp(double gpa, double expected) =>
        Assert.Equal(expected, SchoolAnalyticsMath.ProgressScore(gpa));

    // ---- AggregateGpa (overview) ----

    [Fact]
    public void AggregateGpa_means_per_student_then_mean_of_means()
    {
        // s1: {A=4, F=0} -> mean 2.0 ; s2: {A=4} -> mean 4.0. totalGpa=6, gpaCount=2, mean-of-means=3.0 -> 75.0.
        var result = SchoolAnalyticsMath.AggregateGpa(
        [
            ("s1", "A"), ("s1", "F"), ("s2", "A"),
        ]);

        Assert.Equal(2, result.GpaCount);
        Assert.Equal(75.0, result.AverageProgressScore);
        Assert.Equal(0, result.StudentsAtRisk); // 2.0 is NOT < 2.0
    }

    [Fact]
    public void AggregateGpa_skips_unmapped_grades_and_students_with_none()
    {
        // s1 has one mapped (A) + one unknown (Z, skipped) -> mean 4.0. s2 has ONLY unknowns -> contributes nothing.
        var result = SchoolAnalyticsMath.AggregateGpa(
        [
            ("s1", "A"), ("s1", "Z"), ("s2", "Z"), ("s2", "  "),
        ]);

        Assert.Equal(1, result.GpaCount); // only s1
        Assert.Equal(100.0, result.AverageProgressScore);
        Assert.Equal(0, result.StudentsAtRisk);
    }

    [Fact]
    public void AggregateGpa_at_risk_is_strict_below_2()
    {
        // s1: C- (1.7) -> at risk ; s2: C (2.0) -> NOT at risk (strict <).
        var result = SchoolAnalyticsMath.AggregateGpa([("s1", "C-"), ("s2", "C")]);

        Assert.Equal(2, result.GpaCount);
        Assert.Equal(1, result.StudentsAtRisk);
    }

    [Fact]
    public void AggregateGpa_empty_is_all_zero()
    {
        var result = SchoolAnalyticsMath.AggregateGpa([]);

        Assert.Equal(0, result.GpaCount);
        Assert.Equal(0, result.StudentsAtRisk);
        Assert.Equal(0.0, result.AverageProgressScore);
    }

    // ---- range -> days / step ----

    [Theory]
    [InlineData("90d", 90)]
    [InlineData("1y", 365)]
    [InlineData("30d", 30)]
    [InlineData("bogus", 30)]
    [InlineData("", 30)]
    [InlineData(null, 30)]
    public void DaysForRange(string? range, int expected) =>
        Assert.Equal(expected, SchoolAnalyticsMath.DaysForRange(range));

    [Theory]
    [InlineData(30, 2)]
    [InlineData(90, 7)]
    [InlineData(365, 30)]
    [InlineData(1, 1)] // max(1, 0)
    public void StepForDays(int days, int expected) =>
        Assert.Equal(expected, SchoolAnalyticsMath.StepForDays(days));

    // ---- bucketing ----

    [Fact]
    public void ComputeBuckets_labels_are_utc_midnights_stepped_from_now()
    {
        var now = new DateTime(2026, 1, 15, 12, 34, 56, DateTimeKind.Utc);
        var buckets = SchoolAnalyticsMath.ComputeBuckets(now, days: 30, events: []);

        // step=2, i = 29,27,...,1 -> 15 buckets. First bucketStart = Jan15 - 29d = 2025-12-17; last = Jan14.
        Assert.Equal(15, buckets.Labels.Count);
        Assert.Equal("2025-12-17", buckets.Labels[0]);
        Assert.Equal("2026-01-14", buckets.Labels[^1]);
        Assert.All(buckets.Values, v => Assert.Equal(0, v)); // no events -> all zero
    }

    [Fact]
    public void ComputeBuckets_counts_events_in_half_open_interval()
    {
        var now = new DateTime(2026, 1, 15, 12, 0, 0, DateTimeKind.Utc);
        var events = new[]
        {
            new DateTime(2025, 12, 17, 0, 0, 0, DateTimeKind.Utc), // == bucket0 start -> bucket0
            new DateTime(2025, 12, 19, 0, 0, 0, DateTimeKind.Utc), // == bucket0 end == bucket1 start -> bucket1
            new DateTime(2026, 1, 15, 0, 0, 0, DateTimeKind.Utc),  // "today" -> last bucket [Jan14,Jan16)
            new DateTime(2025, 12, 16, 0, 0, 0, DateTimeKind.Utc), // before first bucket -> counted nowhere
        };

        var buckets = SchoolAnalyticsMath.ComputeBuckets(now, days: 30, events);

        Assert.Equal(1, buckets.Values[0]);   // Dec17 (start inclusive), Dec19 excluded
        Assert.Equal(1, buckets.Values[1]);   // Dec19 (next start)
        Assert.Equal(1, buckets.Values[^1]);  // today
        Assert.Equal(3, buckets.Values.Sum()); // the pre-range Dec16 event is in no bucket
    }
}
