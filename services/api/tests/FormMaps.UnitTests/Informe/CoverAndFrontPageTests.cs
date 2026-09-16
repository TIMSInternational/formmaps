using FormMaps.Application.Informe;
using FormMaps.Application.Informe.Sections;

namespace FormMaps.UnitTests.Informe;

/// <summary>
/// The first two pages of the document, rendered from a fixture and asserted against the containment
/// detector rather than looked at in a viewer.
///
/// Both pages are here because both carried a shipped defect: the cover ran a long student name off
/// the right edge, and the front page's three instrument cards were a literal roundedRect(..., 132)
/// whose PCA description printed its last line below the card on page 2 of every report ever
/// generated. Neither moved maxY past BOTTOM; both are box-relative.
/// </summary>
public class CoverAndFrontPageTests
{
    private static string Text(InformeCanvas canvas) => string.Join("\n", canvas.Recording.Texts.Select(t => t.Text));

    [Theory]
    [InlineData("es")]
    [InlineData("en")]
    public void The_cover_draws_nothing_outside_its_bounds(string lang)
    {
        using var canvas = new InformeCanvas();
        InformeCover.Render(canvas, InformeFixtures.Complete(), lang);

        Assert.Equal(string.Empty, Containment.Describe(Containment.FindAll(canvas.Recording)));
        Assert.Equal(1, canvas.Recording.Pages);
    }

    [Fact]
    public void A_long_name_stays_inside_the_page()
    {
        // "María Valentina Rodríguez Bustamante-Peralta" reached x = 589 on a 595pt page when the name
        // was drawn at a flat 22pt with no width bound.
        using var canvas = new InformeCanvas();
        InformeCover.Render(canvas, InformeFixtures.Complete(InformeFixtures.LongName), "es");

        var name = Assert.Single(canvas.Recording.Texts, t => t.Text == InformeFixtures.LongName);
        Assert.True(name.X + name.W <= InformeLayout.PageW - InformeLayout.Margin + 1.5, $"the name ends at x={name.X + name.W:F1}");
        Assert.Equal(string.Empty, Containment.Describe(Containment.FindPageOverflows(canvas.Recording)));
    }

    [Fact]
    public void The_cover_names_only_the_instruments_the_student_completed()
    {
        // This line was the static string "PCA · LIA · 360°" and printed 360° on the cover of reports
        // whose 360 had never been answered — the cover asserting data the document then had to deny.
        using var canvas = new InformeCanvas();
        InformeCover.Render(canvas, InformeFixtures.Complete(), "es");
        var complete = Text(canvas);

        Assert.Contains("PCA · MIL · Competencias 24/24 · Personalidad · 360°", complete, StringComparison.Ordinal);
        Assert.Contains("16 de septiembre de 2026", complete, StringComparison.Ordinal);

        using var sparse = new InformeCanvas();
        InformeCover.Render(sparse, InformeFixtures.Sparse(), "es");
        var nothing = Text(sparse);

        Assert.DoesNotContain("360°", nothing, StringComparison.Ordinal);
        Assert.DoesNotContain("PCA", nothing, StringComparison.Ordinal);
        Assert.Contains("16 de septiembre de 2026", nothing, StringComparison.Ordinal);
    }

    [Fact]
    public void A_partial_competency_set_is_named_out_of_the_catalogue_not_out_of_itself()
    {
        // A 13-of-24 PCA rendered "13 de 13 competencias evaluadas" in production because the total
        // collapsed to the done count. The cover states the same pair, so it states it the same way.
        var vm = InformeFixtures.Complete();
        var partial = vm with
        {
            Coverage = vm.Coverage with { Competencias = new CompetencyCoverage(true, 13, 24) },
        };

        using var canvas = new InformeCanvas();
        InformeCover.Render(canvas, partial, "es");

        Assert.Contains("Competencias 13/24", Text(canvas), StringComparison.Ordinal);
        Assert.DoesNotContain("13/13", Text(canvas), StringComparison.Ordinal);
    }

    [Theory]
    [InlineData("es")]
    [InlineData("en")]
    public void The_front_page_draws_nothing_outside_its_boxes(string lang)
    {
        var spanish = lang == "es";
        using var canvas = new InformeCanvas();
        InformeFrontPage.Render(canvas, InformeFixtures.Complete(), lang, InformeFixtures.Contents(spanish));

        Assert.Equal(string.Empty, Containment.Describe(Containment.FindAll(canvas.Recording)));
    }

    [Theory]
    [InlineData("es")]
    [InlineData("en")]
    public void The_front_page_holds_when_half_the_report_is_still_pending(string lang)
    {
        var spanish = lang == "es";
        using var canvas = new InformeCanvas();
        InformeFrontPage.Render(canvas, InformeFixtures.Sparse(), lang, InformeFixtures.ContentsWithPending(spanish));

        Assert.Equal(string.Empty, Containment.Describe(Containment.FindAll(canvas.Recording)));
        Assert.Contains(InformeLabels.Get(lang, "toc.pending"), Text(canvas), StringComparison.Ordinal);
    }

    [Fact]
    public void The_instrument_cards_are_as_tall_as_their_tallest_description()
    {
        // The defect this replaces: roundedRect(cx, y, cardW, 132) with unmeasured text inside, so the
        // PCA card's last line — "e imagen propia." — printed BELOW the card on page 2 of every report.
        using var canvas = new InformeCanvas();
        InformeFrontPage.Render(canvas, InformeFixtures.Complete(), "es", InformeFixtures.Contents());

        var cards = canvas.Recording.Boxes
            .Where(b => Math.Abs(b.W - InformeLayout.GridThird) < 0.01)
            .ToList();

        Assert.Equal(3, cards.Count);

        // All three are the height of the TALLEST description, not of their own — a shared height that
        // is derived, where the literal 132 was a guess.
        Assert.Single(cards.Select(c => Math.Round(c.H, 4)).Distinct());
        Assert.NotEqual(132, Math.Round(cards[0].H, 4));

        foreach (var card in cards)
        {
            var inside = canvas.Recording.Texts
                .Where(t => t.X > card.X && t.X < card.X + card.W && t.Y >= card.Y && t.Y <= card.Y + card.H)
                .ToList();

            // Name, label and description.
            Assert.Equal(3, inside.Count);
            Assert.All(inside, t => Assert.True(t.Y + t.H <= card.Y + card.H + 1.5, $"\"{t.Text}\" spills out of its card"));
        }
    }

    [Fact]
    public void Every_contents_line_gets_a_folio_slot_at_the_columns_edge()
    {
        var entries = InformeFixtures.Contents();
        using var canvas = new InformeCanvas();

        var result = InformeFrontPage.Render(canvas, InformeFixtures.Complete(), "es", entries);

        // The folios used to be hard-coded "because the PDF structure never changes", which was
        // already false before sections started disappearing when they have no data.
        Assert.Equal(entries.Select(e => e.Id), result.Anchors.Select(a => a.Id));
        Assert.All(result.Anchors, a => Assert.Equal(InformeLayout.Margin + InformeLayout.GridHalf - 24, a.X, 10));
        Assert.All(result.Anchors, a => Assert.True(a.Y > 0 && a.Y < InformeLayout.Bottom, $"folio slot for {a.Id} is at y={a.Y:F1}"));
        Assert.True(result.Cursor > 0 && result.Cursor <= InformeLayout.Bottom);
    }

    [Fact]
    public void A_pending_part_is_listed_in_grey_rather_than_vanishing()
    {
        var entries = InformeFixtures.ContentsWithPending();
        using var canvas = new InformeCanvas();

        var result = InformeFrontPage.Render(canvas, InformeFixtures.Sparse(), "es", entries);

        // A reader who knows the report has a universities part should be able to see that it is
        // still outstanding — silently dropping the line is what hides it.
        Assert.Contains(result.Anchors, a => a is { Id: "universidades", Pending: true });
        Assert.Contains(result.Anchors, a => a is { Id: "resumen", Pending: false });
        Assert.Equal(4, result.Anchors.Count(a => a.Pending));
    }

    [Fact]
    public void The_two_pages_together_make_a_two_page_pdf()
    {
        using var canvas = new InformeCanvas();
        InformeCover.Render(canvas, InformeFixtures.Complete(), "es");
        InformeFrontPage.Render(canvas, InformeFixtures.Complete(), "es", InformeFixtures.Contents());

        Assert.Equal(string.Empty, Containment.Describe(Containment.FindAll(canvas.Recording)));
        Assert.Equal(2, canvas.Recording.Pages);

        var pdf = canvas.Save();
        Assert.Equal(2, canvas.PageCount);
        Assert.True(pdf.Length > 2000, "the PDF should carry the embedded font subset and both pages");
        Assert.Equal("%PDF", System.Text.Encoding.ASCII.GetString(pdf, 0, 4));
    }
}
