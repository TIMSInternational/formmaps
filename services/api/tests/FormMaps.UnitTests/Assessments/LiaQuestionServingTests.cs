using FormMaps.Application.Assessments;
using Xunit;

namespace FormMaps.UnitTests.Assessments;

public sealed class LiaQuestionServingTests
{
    [Fact]
    public void Practice_questions_never_include_the_answer_key()
    {
        var questions = LiaQuestionServing.FetchPracticeQuestions("pattern_recognition", "es");
        Assert.NotEmpty(questions);
        Assert.All(questions, q => Assert.True(q.IsPractice));
    }

    [Fact]
    public void Assessment_questions_are_ordered_by_item_number_and_capped_at_take()
    {
        var questions = LiaQuestionServing.FetchAssessmentQuestions("numerical_speed", "es", take: 60);
        Assert.Equal(60, questions.Count);
        for (var i = 1; i < questions.Count; i++)
        {
            Assert.True(questions[i].ItemNumber > questions[i - 1].ItemNumber);
        }
    }

    [Fact]
    public void EN_language_swaps_verbal_practice_item_2_text()
    {
        var es = LiaQuestionServing.FetchPracticeQuestions("verbal_reasoning", "es")
            .Single(q => q.ItemNumber == 2);
        var en = LiaQuestionServing.FetchPracticeQuestions("verbal_reasoning", "en")
            .Single(q => q.ItemNumber == 2);
        Assert.NotEqual(es.QuestionData.GetRawText(), en.QuestionData.GetRawText());
    }
}
