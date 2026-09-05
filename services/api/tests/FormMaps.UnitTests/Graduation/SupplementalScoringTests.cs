using System.Text.Json;
using FormMaps.Application.Graduation;

namespace FormMaps.UnitTests.Graduation;

/// <summary>
/// The scoring rail behind GET /api/v1/student/graduation-plan/supplemental
/// (planWorkflowService.ts:176-213). No AI on this path — it is arithmetic over the global course catalog,
/// which is exactly why it is worth pinning to the decimal.
/// </summary>
public class SupplementalScoringTests
{
    private static SupplementalCandidate Course(
        string id, string title, double rating = 0, string? category = "", string[]? skills = null,
        string[]? careerPaths = null) =>
        new(id, title, "Provider", category, rating, skills ?? [], careerPaths ?? []);

    private static IReadOnlySet<string> NoneEnrolled => new HashSet<string>(StringComparer.Ordinal);

    // ---------------------------------------------------------------- the > 14 threshold

    /// <summary>
    /// Rating alone is the only signal that can land ON the boundary. rating*3 must EXCEED 14, so 4.6 (13.8 ->
    /// 14) is out and 5.0 (15) is in. This is the filter that decides whether the rail renders at all.
    /// </summary>
    [Theory]
    [InlineData(4.0, false)]  // 12
    [InlineData(4.6, false)]  // 13.8 -> rounds to 14, and the test is `> 14`
    [InlineData(4.7, true)]   // 14.1 -> 14? no: 14.1 rounds to 14 ... see the next case
    [InlineData(5.0, true)]   // 15
    public void Rating_alone_must_exceed_fourteen(double rating, bool _)
    {
        var result = SupplementalScoring.Score(
            [Course("c1", "Course", rating)], NoneEnrolled, [], "computer-science", "Computer Science");

        // The assertion is on the SCORE, not on a hand-computed inclusion flag: Math.round(4.7*3) = 14, which
        // is NOT > 14, so 4.7 is excluded too. Asserting the arithmetic keeps the table honest.
        var expectedScore = (int)Math.Floor((rating * 3d) + 0.5d);
        if (expectedScore > 14)
        {
            Assert.Equal(expectedScore, Assert.Single(result).MatchScore);
        }
        else
        {
            Assert.Empty(result);
        }
    }

    [Fact]
    public void Enrolled_courses_are_dropped_before_scoring()
    {
        var enrolled = new HashSet<string>(["c1"], StringComparer.Ordinal);

        var result = SupplementalScoring.Score(
            [Course("c1", "Great Course", 5), Course("c2", "Other Course", 5)],
            enrolled, [], "arts", "Art");

        Assert.Equal("c2", Assert.Single(result).Id);
    }

    // ---------------------------------------------------------------- the three bonuses

    [Fact]
    public void Gap_hit_adds_twenty_and_sets_fillsGap_and_the_gap_reason()
    {
        var result = SupplementalScoring.Score(
            [Course("c1", "Intro to Chemistry", rating: 0)],
            NoneEnrolled, ["chemistry"], "zz", major: null);

        var course = Assert.Single(result);
        Assert.Equal(20, course.MatchScore);
        Assert.Equal("chemistry", course.FillsGap);
        Assert.Equal("Your school can't fully cover this area — this course fills the chemistry gap.", course.Reason);
    }

    /// <summary>
    /// fieldKey is split on "-" and only words LONGER than two characters count, so "cs"-style stubs
    /// contribute nothing. 15 alone is above the threshold, which makes this bonus solely sufficient.
    /// </summary>
    [Fact]
    public void Field_word_adds_fifteen_and_two_letter_segments_are_ignored()
    {
        var hit = SupplementalScoring.Score(
            [Course("c1", "Applied Science Basics")], NoneEnrolled, [], "computer-science", null);
        Assert.Equal(15, Assert.Single(hit).MatchScore);

        // "cs" and "ai" are both <= 2 chars, so neither becomes a keyword and nothing scores.
        var miss = SupplementalScoring.Score(
            [Course("c1", "CS and AI Primer")], NoneEnrolled, [], "cs-ai", null);
        Assert.Empty(miss);
    }

    [Fact]
    public void Major_adds_ten_only_when_it_is_longer_than_two_characters()
    {
        var scored = SupplementalScoring.Score(
            [Course("c1", "Nursing Fundamentals", rating: 2)], NoneEnrolled, [], "zz", "Nursing");
        Assert.Equal(16, Assert.Single(scored).MatchScore); // 2*3 + 10

        // A two-letter major never scores, even when the haystack contains it.
        var notScored = SupplementalScoring.Score(
            [Course("c1", "Ax Basics", rating: 5)], NoneEnrolled, [], "zz", "ax");
        Assert.Equal(15, Assert.Single(notScored).MatchScore); // 5*3, no +10
    }

    [Fact]
    public void Skills_and_careerPaths_are_part_of_the_haystack()
    {
        var result = SupplementalScoring.Score(
            [Course("c1", "Untitled", skills: ["Robotics"], careerPaths: ["Mechanical Engineer"])],
            NoneEnrolled, ["robotics"], "zz", null);

        Assert.Equal(20, Assert.Single(result).MatchScore);
    }

    [Fact]
    public void Reason_falls_back_to_your_goal_when_there_is_no_major()
    {
        var result = SupplementalScoring.Score(
            [Course("c1", "Studio Art", rating: 5)], NoneEnrolled, [], "arts", null);

        Assert.Equal("Builds toward your goal.", Assert.Single(result).Reason);
        Assert.Null(Assert.Single(result).FillsGap);
    }

    // ---------------------------------------------------------------- ordering + slice

    [Fact]
    public void Sorts_by_score_desc_then_title_and_takes_at_most_ten()
    {
        var courses = Enumerable.Range(0, 15)
            .Select(i => Course($"c{i}", $"Course {i:00}", rating: 5))
            .ToList();

        var result = SupplementalScoring.Score(courses, NoneEnrolled, [], "zz", null);

        Assert.Equal(10, result.Count);
        Assert.Equal("Course 00", result[0].Title);
        Assert.Equal("Course 09", result[9].Title);
    }

    [Fact]
    public void Higher_score_beats_alphabetical_order()
    {
        var result = SupplementalScoring.Score(
            [Course("a", "AAA", rating: 5), Course("b", "BBB", rating: 5, skills: ["chemistry"])],
            NoneEnrolled, ["chemistry"], "zz", null);

        Assert.Equal("BBB", result[0].Title); // 35 vs 15
        Assert.Equal("AAA", result[1].Title);
    }

    // ---------------------------------------------------------------- gapReport parsing

    [Fact]
    public void GapCategories_lowercases_and_tolerates_a_non_array_report()
    {
        using var array = JsonDocument.Parse("""[{"category":"Science"},{"category":"FINE ARTS"}]""");
        Assert.Equal(["science", "fine arts"], SupplementalScoring.GapCategories(array.RootElement));

        using var notAnArray = JsonDocument.Parse("""{"category":"Science"}""");
        Assert.Empty(SupplementalScoring.GapCategories(notAnArray.RootElement));

        Assert.Empty(SupplementalScoring.GapCategories(null));
    }

    /// <summary>
    /// Legacy does <c>g.category.toLowerCase()</c> with no guard, so a malformed entry is a TypeError and the
    /// route 500s. Swallowing it here would turn that 500 into a 200 with a different result set — not
    /// behaviour-neutral, so it throws.
    /// </summary>
    [Fact]
    public void GapCategories_throws_on_an_entry_without_a_string_category()
    {
        using var doc = JsonDocument.Parse("""[{"missingCredits":2}]""");
        Assert.Throws<SupplementalScoring.MalformedGapReportException>(
            () => SupplementalScoring.GapCategories(doc.RootElement));
    }
}
