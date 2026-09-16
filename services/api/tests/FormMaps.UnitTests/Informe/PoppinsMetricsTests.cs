using FormMaps.Application.Informe;
using PdfSharp.Fonts;
using PdfSharp.Drawing;

namespace FormMaps.UnitTests.Informe;

/// <summary>
/// The FIRST thing to establish in any renderer other than pdfkit.
///
/// Every card height in the informe derives from a line height that was MEASURED in
/// pdfkit, not derived from the font: `1.5 × size + lineGap`. It is a fact about that
/// library's treatment of Poppins, not a general truth, and the layout invariants say
/// in as many words: re-measure it first thing in any other renderer. If PDFsharp
/// disagrees, every measured box in the ported document is the wrong height, and the
/// containment guarantee goes with it.
///
/// This test records what PDFsharp actually reports. It does not assert the pdfkit
/// number — it asserts the ratio is stable across the type scale, so the port can be
/// calibrated on one constant the way pdfkit was, and prints both for comparison.
/// </summary>
public class PoppinsMetricsTests
{
    private sealed class EmbeddedPoppins : IFontResolver
    {
        public byte[]? GetFont(string faceName) => PoppinsFonts.Load(faceName);

        public FontResolverInfo? ResolveTypeface(string familyName, bool isBold, bool isItalic)
        {
            var face = familyName switch
            {
                "Poppins-Medium" or "Poppins-SemiBold" or "Poppins-Bold" or "Poppins-Regular" => familyName,
                _ => isBold ? "Poppins-Bold" : "Poppins-Regular",
            };
            return new FontResolverInfo(face);
        }
    }

    static PoppinsMetricsTests() => GlobalFontSettings.FontResolver = new EmbeddedPoppins();

    /// <summary>The informe type scale, as sizes in points.</summary>
    public static TheoryData<double> Sizes => [6.8, 7.5, 8.5, 9, 9.5, 10.5, 11, 13, 17, 28];

    [Fact]
    public void All_four_faces_load_from_the_embedded_resources()
    {
        foreach (var face in PoppinsFonts.Faces.Keys)
        {
            Assert.True(PoppinsFonts.Load(face).Length > 1000, face);
        }

        Assert.Throws<ArgumentOutOfRangeException>(() => PoppinsFonts.Load("Helvetica"));
    }

    [Theory]
    [MemberData(nameof(Sizes))]
    public void PDFsharp_reports_a_stable_line_height_ratio_for_Poppins(double size)
    {
        using var gfx = XGraphics.CreateMeasureContext(new XSize(595.28, 841.89), XGraphicsUnit.Point, XPageDirection.Downwards);
        var font = new XFont("Poppins-Regular", size);
        var measured = gfx.MeasureString("Hxy", font).Height;
        var ratio = measured / size;

        // pdfkit's Poppins line box is 1.5 × size. PDFsharp uses the font's own
        // ascent/descent/lineGap, so the number differs — what matters is that it is
        // CONSTANT across the scale, which is what lets one calibration constant work.
        Assert.InRange(ratio, 1.0, 2.0);
        Assert.Equal(Math.Round(ratio, 4), Math.Round(gfx.MeasureString("M", font).Height / size, 4));
    }

    [Fact]
    public void Record_the_ratio_for_the_port_to_calibrate_on()
    {
        using var gfx = XGraphics.CreateMeasureContext(new XSize(595.28, 841.89), XGraphicsUnit.Point, XPageDirection.Downwards);
        double[] scale = [6.8, 7.5, 8.5, 9, 9.5, 10.5, 11, 13, 17, 28];
        var ratios = scale
            .Select(s => gfx.MeasureString("Hxy", new XFont("Poppins-Regular", s)).Height / s)
            .ToList();

        var spread = ratios.Max() - ratios.Min();
        Assert.True(spread < 0.001, $"line-height ratio is not constant across the type scale: {string.Join(", ", ratios.Select(r => r.ToString("F4")))}");

        // Printed so the number is in the test log when the port calibrates on it.
        Console.WriteLine($"PDFsharp Poppins line-height ratio = {ratios[0]:F4} (pdfkit's was 1.5000)");
    }
}
