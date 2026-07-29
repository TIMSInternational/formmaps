using FormMaps.Application.Assessments;
using Xunit;

namespace FormMaps.UnitTests.Assessments;

public sealed class LiaVerbalEnTests
{
    [Fact]
    public void Practice_item_2_has_an_EN_override()
    {
        var text = LiaVerbalEn.GetQuestionText(itemNumber: 2, isPractice: true);
        Assert.NotNull(text);
    }

    [Fact]
    public void Assessment_item_with_no_divergence_returns_null()
    {
        // Item 51 is beyond the assessment bank (which has items 1-50).
        var text = LiaVerbalEn.GetQuestionText(itemNumber: 51, isPractice: false);
        Assert.Null(text);
    }

    [Fact]
    public void Nonexistent_item_number_returns_null_not_throws()
    {
        var text = LiaVerbalEn.GetQuestionText(itemNumber: 9999, isPractice: true);
        Assert.Null(text);
    }
}
