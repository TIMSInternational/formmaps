using FormMaps.Application.Informe;

namespace FormMaps.UnitTests.Informe;

/// <summary>34 and 67: the thresholds every chart in the document draws.</summary>
public class BandsTests
{
    [Theory]
    [InlineData(0, Band.Low)]
    [InlineData(33.9, Band.Low)]
    [InlineData(34, Band.Med)]
    [InlineData(66.9, Band.Med)]
    [InlineData(67, Band.High)]
    [InlineData(100, Band.High)]
    public void Of_classifies_at_the_drawn_thresholds(double value, Band expected)
    {
        Assert.Equal(expected, Bands.Of(value));
    }

    [Fact]
    public void Thresholds_are_34_and_67_and_the_label_keys_resolve()
    {
        Assert.Equal(new[] { 34d, 67d }, Bands.Thresholds);
        Assert.Equal("Alta", InformeLabels.Get("es", Band.High.LabelKey()));
        Assert.Equal("Media", InformeLabels.Get("es", Band.Med.LabelKey()));
        Assert.Equal("Low", InformeLabels.Get("en", Band.Low.LabelKey()));
    }
}
