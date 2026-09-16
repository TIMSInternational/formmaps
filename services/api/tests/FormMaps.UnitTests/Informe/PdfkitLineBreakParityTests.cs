using System.Reflection;
using System.Text.Json;
using FormMaps.Application.Informe;

namespace FormMaps.UnitTests.Informe;

/// <summary>
/// The ported wrapper against pdfkit's own line breaking, over the document's own copy.
///
/// This is the evidence for the premise the whole port rests on. Every card height in the informe is
/// derived from a measured text height, a measured height is lines × line height, and the number of
/// lines is a wrapping decision — so if the .NET wrapper and pdfkit disagree anywhere, card heights
/// drift, pages drift, and the cutover criterion ("the page counts match the legacy document for the
/// same view model") cannot be met. Widths already agree to a thousandth of a point; this is the
/// other half.
///
/// The fixture is ground truth captured from the legacy renderer, not from this code: pdfkit was run
/// over every string in the label dictionary and the interpretive library — 482 of them, the real
/// Spanish and English copy — at the document's real column widths, in all four Poppins faces, with
/// PDFDocument._line intercepted to record each line as it was emitted. 1,928 cases.
///
/// Two rules came out of the first run, both invisible until measured, and both now covered here:
/// pdfkit measures a candidate line WITH the space that would follow it, and it breaks after a hyphen
/// or a dash, not only at spaces.
/// </summary>
public class PdfkitLineBreakParityTests
{
    /// <summary>One captured wrap: which string, in which face at which size, in how wide a column, and the length of each line pdfkit emitted.</summary>
    private sealed record LineBreakCase(int TextIndex, int Face, double Width, double Size, int[] LineLengths);

    private sealed record Golden(string[] Faces, string[] Texts, LineBreakCase[] Cases);

    private static Golden Load()
    {
        var assembly = typeof(PdfkitLineBreakParityTests).Assembly;
        var name = assembly.GetManifestResourceNames().Single(n => n.EndsWith(".pdfkit-linebreaks.json", StringComparison.Ordinal));
        using var stream = assembly.GetManifestResourceStream(name)!;
        using var doc = JsonDocument.Parse(stream);
        var root = doc.RootElement;
        return new Golden(
            [.. root.GetProperty("faces").EnumerateArray().Select(e => e.GetString()!)],
            [.. root.GetProperty("texts").EnumerateArray().Select(e => e.GetString()!)],
            [.. root.GetProperty("cases").EnumerateArray().Select(c =>
            {
                var f = c.EnumerateArray().ToArray();
                return new LineBreakCase(
                    f[0].GetInt32(),
                    f[1].GetInt32(),
                    f[2].GetDouble(),
                    f[3].GetDouble(),
                    [.. f[4].EnumerateArray().Select(e => e.GetInt32())]);
            })]);
    }

    [Fact]
    public void Every_line_break_matches_pdfkit()
    {
        var golden = Load();
        using var canvas = new InformeCanvas();

        var failures = new List<string>();
        foreach (var c in golden.Cases)
        {
            var text = golden.Texts[c.TextIndex];
            var face = golden.Faces[c.Face];

            var actual = LayoutMath.WrapLines(canvas, text, c.Width, face, c.Size);
            var expected = c.LineLengths;
            if (actual.Select(l => l.Length).SequenceEqual(expected))
            {
                continue;
            }

            if (failures.Count < 10)
            {
                failures.Add($"{face} {c.Size}pt in {c.Width}pt\n  pdfkit line lengths: {string.Join(", ", expected)}\n  ours:                {string.Join(", ", actual.Select(l => l.Length))}\n  ours reads: {string.Join(" | ", actual)}");
            }
        }

        Assert.True(failures.Count == 0, $"{failures.Count}+ of {golden.Cases.Length} wraps disagree with pdfkit:\n\n{string.Join("\n\n", failures)}");
    }

    [Fact]
    public void The_fixture_is_the_real_copy_and_covers_the_tight_columns()
    {
        var golden = Load();

        Assert.True(golden.Texts.Length >= 480, "the corpus should be the whole label dictionary plus the interpretive library");
        Assert.True(golden.Cases.Length >= 1900);
        Assert.Equal(["Poppins-Regular", "Poppins-Medium", "Poppins-SemiBold", "Poppins-Bold"], golden.Faces);

        // The instrument card column is the tightest in the document and the one that exposed the
        // trailing-space rule.
        Assert.Contains(golden.Cases, c => Math.Abs(c.Width - (InformeLayout.GridThird - 26)) < 0.01);
        Assert.Contains(golden.Texts, t => t.Contains("capacidad numérica", StringComparison.Ordinal));
    }
}
