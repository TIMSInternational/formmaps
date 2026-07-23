using FormMaps.Application.Pathways;

namespace FormMaps.UnitTests.Pathways;

/// <summary>
/// Pins <see cref="PathwaysComputer.JsLocaleCompare"/> (the JS String.prototype.localeCompare parity used for the
/// department + chain sort) against Node's observed gold (Node 20, ICU, resolved locale en-US). RED-IF-REGRESSED:
/// catches a swap to an ordinal compare, which would order punctuation vs digits AND case the wrong way. The gold was
/// captured by running <c>a.localeCompare(b)</c> in node for each pair.
/// </summary>
public class PathwaysLocaleCompareTests
{
    [Theory]
    [InlineData("ALG1|ALG2", "ALG1|GEOM", -1)] // letter vs letter after shared prefix
    [InlineData("ALG12", "ALG1|X", 1)]         // digit '2' vs '|' — ICU sorts '|' BEFORE '2' (ordinal is the opposite)
    [InlineData("A|B", "A|B|C", -1)]           // shorter prefix sorts first
    [InlineData("General", "Mathematics", -1)] // department names
    [InlineData("Mathematics", "Science", -1)]
    public void Matches_node_gold(string a, string b, int expected) =>
        Assert.Equal(expected, PathwaysComputer.JsLocaleCompare(a, b));

    [Fact]
    public void Is_symmetric_and_reflexive()
    {
        Assert.Equal(0, PathwaysComputer.JsLocaleCompare("Math", "Math"));
        Assert.Equal(
            -Math.Sign(PathwaysComputer.JsLocaleCompare("Science", "Art")),
            Math.Sign(PathwaysComputer.JsLocaleCompare("Art", "Science")));
    }
}
