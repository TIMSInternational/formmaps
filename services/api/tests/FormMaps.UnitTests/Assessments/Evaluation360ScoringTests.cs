using System.Text.Json;
using FormMaps.Application.Assessments;

namespace FormMaps.UnitTests.Assessments;

/// <summary>
/// Pins the 360 category scorer (legacy evaluation360.ts): group weighting (teacher 1.1 / parent 0.9 /
/// self 1.0 / sibling_friend 0.8 / other 0.8), self excluded by default, category preferred from the item
/// then a RELATION-SCOPED catalog fallback, strict-numeric rating gate, and insertion-ordered averages.
/// </summary>
public class Evaluation360ScoringTests
{
    private static JsonElement Items(string json) => JsonDocument.Parse(json).RootElement;

    [Theory]
    [InlineData("self", "self")]
    [InlineData("Parent", "parent")]
    [InlineData("TEACHER", "teacher")]
    [InlineData("sibling_friend", "sibling_friend")]
    [InlineData("sibling", "sibling_friend")]
    [InlineData("friend", "sibling_friend")]
    [InlineData("mentor", "other")]
    [InlineData("", "other")]
    public void NormalizeGroupType_maps_to_canonical_bucket(string input, string expected)
    {
        Assert.Equal(expected, Evaluation360Scoring.NormalizeGroupType(input));
    }

    [Fact]
    public void Averages_weight_by_group_and_exclude_self_by_default()
    {
        var feedbacks = new[]
        {
            new FeedbackRow("teacher", "teacher", Items("""[{"category":"Arts","rating":4,"isAnswered":true}]""")),
            new FeedbackRow("parent", "parent", Items("""[{"category":"Arts","rating":5,"isAnswered":true}]""")),
            new FeedbackRow("friend", "sibling_friend", Items("""[{"category":"Arts","rating":3,"isAnswered":true}]""")),
            new FeedbackRow("self", "self", Items("""[{"category":"Arts","rating":1,"isAnswered":true}]""")),
        };

        var averages = Evaluation360Scoring.CategoryAverages(
            Evaluation360Scoring.CategoryScoresFromFeedback(feedbacks, questions: []));

        // (4*1.1 + 5*0.9 + 3*0.8) / 3 = 3.77 ; the self rating (1) is excluded.
        var arts = Assert.Single(averages);
        Assert.Equal("Arts", arts.Key);
        Assert.Equal(3.77, arts.Value);
    }

    [Fact]
    public void Skips_unanswered_zero_and_non_numeric_ratings()
    {
        var feedbacks = new[]
        {
            new FeedbackRow("teacher", "teacher", Items("""
                [{"category":"Arts","rating":4,"isAnswered":true},
                 {"category":"Arts","rating":5,"isAnswered":false},
                 {"category":"Arts","rating":0},
                 {"category":"Arts","rating":"5"}]
                """)),
        };

        var averages = Evaluation360Scoring.CategoryAverages(
            Evaluation360Scoring.CategoryScoresFromFeedback(feedbacks, questions: []));

        // Only the first item counts: 4*1.1 / 1 = 4.4.
        Assert.Equal(4.4, Assert.Single(averages).Value);
    }

    [Fact]
    public void Falls_back_to_relation_scoped_catalog_join_and_drops_cross_relation_numbers()
    {
        // Catalog numbers are globally disjoint per relation: number 7 belongs to the Teacher set.
        var questions = new[] { new Question360Lite(7, "Leadership", "Teacher") };
        var feedbacks = new[]
        {
            // teacher item without category -> resolves via number 7 scoped to Teacher -> Leadership.
            new FeedbackRow("teacher", "teacher", Items("""[{"questionNumber":7,"rating":4,"isAnswered":true}]""")),
            // parent item that stored per-form display order 7 -> the Teacher-scoped row must NOT leak;
            // scoping DROPS it rather than mis-counting it into Leadership.
            new FeedbackRow("parent", "parent", Items("""[{"questionNumber":7,"rating":5,"isAnswered":true}]""")),
        };

        var averages = Evaluation360Scoring.CategoryAverages(
            Evaluation360Scoring.CategoryScoresFromFeedback(feedbacks, questions));

        var leadership = Assert.Single(averages);
        Assert.Equal("Leadership", leadership.Key);
        Assert.Equal(4.4, leadership.Value); // only the teacher row; the parent number 7 is dropped
    }

    [Fact]
    public void Preserves_first_seen_category_order()
    {
        var feedbacks = new[]
        {
            new FeedbackRow("teacher", "teacher", Items("""
                [{"category":"Science","rating":4,"isAnswered":true},
                 {"category":"Arts","rating":3,"isAnswered":true}]
                """)),
        };

        var averages = Evaluation360Scoring.CategoryAverages(
            Evaluation360Scoring.CategoryScoresFromFeedback(feedbacks, questions: []));

        Assert.Equal(new[] { "Science", "Arts" }, averages.Select(a => a.Key).ToArray());
    }
}
