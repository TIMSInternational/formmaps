using System.Text;
using FormMaps.Application.Informe;

namespace FormMaps.UnitTests.Informe;

/// <summary>
/// Self-checks on the containment detector.
///
/// A containment test that cannot fail is worth nothing. The legacy recorder carried three of these
/// for exactly that reason, and they are cheap insurance that the recorder still sees the draws after
/// a library upgrade changes a signature — which matters more in .NET than it did in pdfkit, because
/// the recorder is no longer a prototype patch that cannot be bypassed but a class every section has
/// to go through.
///
/// The detector must FAIL on a deliberately overflowing card, FAIL on a deliberate collision, and NOT
/// fire on a chip legitimately nested in a panel.
/// </summary>
public class ContainmentSelfCheckTests
{
    [Fact]
    public void Catches_text_drawn_past_the_bottom_of_its_own_card()
    {
        using var canvas = new InformeCanvas();
        canvas.NewContentPage();

        // A card sized by a guess, with text that needs more room — the exact shape of the intro-page
        // defect that printed "e imagen propia." below the card on page 2 of every report.
        canvas.RoundedRect(48, 100, 160, 40, InformeRadius.Card, fill: InformeColors.Cream);
        canvas.DrawTextBlock(
            "Mide tu estilo de comportamiento en cuatro dimensiones a través de tres contextos distintos.",
            64,
            112,
            130,
            new InformeTextStyle("Poppins-Regular", 9, LineGap: 2),
            InformeColors.Body);

        var violations = Containment.FindTextOverflows(canvas.Recording);

        Assert.Contains(violations, v => v.Kind == "text-below-box");
    }

    [Fact]
    public void Catches_one_box_drawn_on_top_of_another()
    {
        using var canvas = new InformeCanvas();
        canvas.NewContentPage();

        canvas.RoundedRect(48, 100, 240, 60, 10, fill: InformeColors.Cream);
        canvas.RoundedRect(48, 140, 240, 60, 10, fill: InformeColors.YellowSoft);  // overlaps by 20pt

        var violations = Containment.FindBoxCollisions(canvas.Recording);

        Assert.Contains(violations, v => v.Kind == "box-collision");
        Assert.Contains("overlap", violations[0].Detail, StringComparison.Ordinal);
    }

    [Fact]
    public void Does_not_flag_a_chip_nested_inside_a_panel()
    {
        using var canvas = new InformeCanvas();
        canvas.NewContentPage();

        canvas.RoundedRect(48, 100, 400, 120, InformeRadius.Card, fill: InformeColors.Cream);
        canvas.RoundedRect(64, 120, 90, 22, InformeRadius.Pill, fill: InformeColors.Teal);

        Assert.Empty(Containment.FindBoxCollisions(canvas.Recording));
    }

    [Fact]
    public void Catches_text_running_below_the_pages_content_zone()
    {
        using var canvas = new InformeCanvas();
        canvas.NewContentPage();

        canvas.DrawText("Debajo del límite", InformeLayout.Margin, InformeLayout.Bottom - 2, InformeType.Body, InformeColors.Body);

        Assert.Contains(Containment.FindPageOverflows(canvas.Recording), v => v.Kind == "text-below-page");
    }

    [Fact]
    public void Does_not_flag_the_footer_bars_own_text()
    {
        using var canvas = new InformeCanvas();
        canvas.NewContentPage();

        canvas.FillRect(0, InformeLayout.PageH - InformeLayout.FooterBarH, InformeLayout.PageW, InformeLayout.FooterBarH, InformeColors.Navy);
        canvas.DrawText("FormMaps · 3", InformeLayout.Margin, InformeLayout.PageH - 20, InformeType.Caption, InformeColors.White);

        Assert.Empty(Containment.FindPageOverflows(canvas.Recording));
    }

    [Fact]
    public void Attributes_draws_to_the_page_that_was_switched_back_to()
    {
        // The buffered passes (footers, contents folios, divider folios) write onto earlier pages. If
        // the recorder does not follow that, every one of those runs is attributed to the LAST page,
        // where a folio can land inside another section's card and read as an overflow there.
        using var canvas = new InformeCanvas();
        canvas.NewContentPage();
        canvas.NewContentPage();
        canvas.NewContentPage();

        canvas.SwitchToPage(1);
        canvas.DrawText("12", 200, 200, InformeType.Body, InformeColors.Ink);

        Assert.Equal(1, Assert.Single(canvas.Recording.Texts, t => t.Text == "12").Page);
        Assert.Equal(3, canvas.PageCount);
    }

    [Fact]
    public void The_dashed_edge_reaches_the_pdf_as_three_points_on_and_three_off()
    {
        // White with a 1pt dashed [3,3] edge is the ENTIRE empty-state signal — the dashed edge, the em
        // dash and the pending ring are what tell a reader a place is being held, and no caption
        // explains it. PDFsharp writes its dash array in multiples of the pen width, so the canvas
        // divides by the width to keep the pattern in points. This asserts the result in the emitted
        // operators, at two different pen widths, because getting it wrong is invisible in code review
        // and changes the grammar in every empty card of the document.
        using var canvas = new InformeCanvas(compressContentStreams: false);
        canvas.NewContentPage();
        canvas.RoundedRect(48, 100, 240, 80, InformeRadius.Card, fill: InformeEmpty.Fill, stroke: InformeEmpty.Stroke, strokeWidth: InformeEmpty.StrokeW, dash: InformeEmpty.Dash);
        canvas.StrokeCircle(300, 140, InformeEmpty.GlyphR, InformeEmpty.Glyph, InformeStroke.Glyph, InformeEmpty.GlyphDash);

        var content = Encoding.Latin1.GetString(canvas.Save());

        // PDFsharp writes the array and the phase with no separator: "[3 3]0 d".
        Assert.Contains("[3 3]0 d", content, StringComparison.Ordinal);
        Assert.Contains("[2 2]0 d", content, StringComparison.Ordinal);
    }
}
