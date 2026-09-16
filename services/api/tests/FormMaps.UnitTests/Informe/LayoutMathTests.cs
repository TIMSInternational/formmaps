using FormMaps.Application.Informe;

namespace FormMaps.UnitTests.Informe;

/// <summary>
/// The measure-and-fit core. The one thing that has to be true here is the identity
///
///     Measure(text, width, style) == the height DrawTextBlock consumes for the same inputs
///
/// because every box in the document is sized from the left-hand side and filled from the right.
/// In pdfkit the identity held because both sides handed the wrapping to the library. PDFsharp does
/// not wrap, so the wrapping is ours — and the identity now rests on both sides calling the same
/// WrapLines. These tests are what stops a second wrapping path being introduced.
/// </summary>
public class LayoutMathTests
{
    private static readonly InformeTextStyle Body = InformeType.Body;

    public static TheoryData<string> Paragraphs =>
    [
        "Corto.",
        "Mide tu estilo de comportamiento en 4 dimensiones (D·I·S·C) a través de 3 contextos: adaptación laboral, conducta bajo presión e imagen propia.",
        "Tu perfil completo alimenta un motor de coincidencia que pondera personalidad (PCA), capacidad cognitiva (MIL), intereses y motivadores. Las carreras se puntúan de 0 a 100.",
        "Una\nlínea\ndura\npor\nlínea.",
        "Un párrafo.\n\nY otro después de una línea en blanco.",
        "Supercalifragilisticoexpialidosoantidisestablishmentarianismo",
    ];

    [Theory]
    [MemberData(nameof(Paragraphs))]
    public void Measured_height_equals_the_height_a_drawn_block_consumes(string text)
    {
        using var canvas = new InformeCanvas();
        canvas.NewContentPage();

        var measured = canvas.Measure(text, 240, Body);
        var consumed = canvas.DrawTextBlock(text, InformeLayout.Margin, 100, 240, Body, InformeColors.Body);

        Assert.Equal(measured, consumed, 10);
    }

    [Theory]
    [MemberData(nameof(Paragraphs))]
    public void A_card_sized_from_the_measurement_contains_its_own_text(string text)
    {
        // measure -> size the box to the measurement -> draw. The whole discipline in three calls; a
        // card built this way cannot be too small, which is what the 42 hard-coded literal heights in
        // the legacy sections could not promise.
        using var canvas = new InformeCanvas();
        canvas.NewContentPage();

        const double cardW = 240;
        const double pad = LayoutMath.DefaultPad;
        var contentH = canvas.Measure(text, cardW - (2 * pad), Body);

        canvas.RoundedRect(InformeLayout.Margin, 100, cardW, LayoutMath.CardHeight(contentH, pad), InformeRadius.Card, fill: InformeColors.Cream);
        canvas.DrawTextBlock(text, InformeLayout.Margin + pad, 100 + pad, cardW - (2 * pad), Body, InformeColors.Body);

        Assert.Equal(string.Empty, Containment.Describe(Containment.FindAll(canvas.Recording)));
    }

    [Fact]
    public void The_line_height_is_the_pdfkit_constant_the_document_was_calibrated_on()
    {
        // 1.5 x size + lineGap was MEASURED in pdfkit, and PoppinsMetricsTests re-measured it in
        // PDFsharp: 1.5000 for all four faces across the whole type scale. Every card height in the
        // design spec derives from it, so it is asserted here rather than left implicit.
        Assert.Equal(14.25, LayoutMath.LineHeight(9.5), 10);
        Assert.Equal(16.75, LayoutMath.LineHeight(9.5, 2.5), 10);
        Assert.Equal(25.5, LayoutMath.LineHeight(17), 10);
        Assert.Equal(12.75, LayoutMath.LineHeight(8.5), 10);

        using var canvas = new InformeCanvas();
        canvas.NewContentPage();
        Assert.Equal(LayoutMath.LineHeight(9.5), canvas.Measure("una sola línea", 500, new InformeTextStyle("Poppins-Regular", 9.5)), 10);
    }

    [Fact]
    public void Every_wrapped_line_fits_the_column()
    {
        using var canvas = new InformeCanvas();
        const string text = "Evalúa 5 dominios cognitivos — razonamiento, detección, capacidad numérica, memoria y orientación — con precisión y velocidad.";
        const double width = 132.43;

        var lines = LayoutMath.WrapLines(canvas, text, width, "Poppins-Regular", 8.3);

        Assert.True(lines.Count > 1, "the fixture text is meant to wrap");
        foreach (var line in lines)
        {
            Assert.True(LayoutMath.AdvanceWidth(canvas, line, "Poppins-Regular", 8.3) <= width, $"\"{line}\" is wider than the column");
        }
    }

    [Fact]
    public void Wrapping_preserves_the_text_and_honours_hard_line_breaks()
    {
        using var canvas = new InformeCanvas();

        var wrapped = LayoutMath.WrapLines(canvas, "uno dos tres cuatro cinco seis siete ocho", 40, "Poppins-Regular", 9.5);
        Assert.Equal("uno dos tres cuatro cinco seis siete ocho", string.Join(" ", wrapped));

        // A blank line is a real line: it is what keeps a paragraph break's air after prose() has
        // preserved one.
        var paragraphs = LayoutMath.WrapLines(canvas, "Uno.\n\nDos.", 500, "Poppins-Regular", 9.5);
        Assert.Equal(["Uno.", string.Empty, "Dos."], paragraphs);
    }

    [Fact]
    public void A_word_too_wide_for_the_column_is_filled_by_character_exactly_as_pdfkit_fills_it()
    {
        // A word that cannot fit a line however it is placed — a long university name in a narrow
        // card — is not given a line of its own to overflow. pdfkit stops wrapping words and packs
        // characters, CONTINUING the line already in progress, and that is why it never runs a word
        // past a column. Both expectations below are pdfkit's own output, captured from the legacy
        // renderer; see PdfkitLineBreakParityTests for the 1,928-case version of this.
        using var canvas = new InformeCanvas();

        Assert.Equal(
            // The leading space on the last line is pdfkit's too: the space that followed the long word
            // is what is left of its segment once the character fill stops, and it opens the next line.
            ["hola superc", "alifragilistic", "oexpialidoso", " adios"],
            LayoutMath.WrapLines(canvas, "hola supercalifragilisticoexpialidoso adios", 60, "Poppins-Regular", 9.5));

        Assert.Equal(
            ["Conscientiousnes", "s"],
            LayoutMath.WrapLines(canvas, "Conscientiousness", 158.43, "Poppins-Bold", 17));

        // Every emitted line fits, which is the point of the whole exercise.
        foreach (var line in LayoutMath.WrapLines(canvas, "hola supercalifragilisticoexpialidoso adios", 60, "Poppins-Regular", 9.5))
        {
            Assert.True(LayoutMath.AdvanceWidth(canvas, line, "Poppins-Regular", 9.5) <= 60, $"\"{line}\" overflows");
        }
    }

    [Fact]
    public void The_instrument_descriptions_break_exactly_where_the_shipped_document_breaks_them()
    {
        // Read off pages 2 of the production PDF (PR #352, in production from 2026-09-16). These are
        // the densest copy in the document and the tightest column in it (132.43pt), so they are the
        // best available evidence that the ported wrapper agrees with pdfkit — which is the premise
        // the whole port rests on and the cutover criterion the page counts are checked against.
        //
        // The third line is the one that matters: "capacidad numérica, memoria" measures 130.268pt and
        // fits the column, and is still the wrong break, because pdfkit counts the space that would
        // follow it (132.485pt > 132.43pt).
        using var canvas = new InformeCanvas();
        const double column = InformeLayout.GridThird - 26;

        var mil = LayoutMath.WrapLines(
            canvas,
            "Evalúa 5 dominios cognitivos — razonamiento, detección, capacidad numérica, memoria y orientación — con precisión y velocidad.",
            column,
            "Poppins-Regular",
            8.3);

        Assert.Equal(
            [
                "Evalúa 5 dominios cognitivos —",
                "razonamiento, detección,",
                "capacidad numérica,",
                "memoria y orientación — con",
                "precisión y velocidad.",
            ],
            mil);

        var pca = LayoutMath.WrapLines(
            canvas,
            "Mide tu estilo de comportamiento en 4 dimensiones (D·I·S·C) a través de 3 contextos: adaptación laboral, conducta bajo presión e imagen propia.",
            column,
            "Poppins-Regular",
            8.3);

        Assert.Equal(
            [
                "Mide tu estilo de",
                "comportamiento en 4",
                "dimensiones (D·I·S·C) a través",
                "de 3 contextos: adaptación",
                "laboral, conducta bajo presión",
                "e imagen propia.",
            ],
            pca);
    }

    [Fact]
    public void Tracking_widens_a_line_by_one_gap_between_each_pair_of_characters()
    {
        using var canvas = new InformeCanvas();
        const string kicker = "INTRODUCCIÓN";

        var plain = LayoutMath.AdvanceWidth(canvas, kicker, "Poppins-SemiBold", 8.5);
        var tracked = LayoutMath.AdvanceWidth(canvas, kicker, "Poppins-SemiBold", 8.5, 1.2);

        Assert.Equal(plain + (1.2 * (kicker.Length - 1)), tracked, 10);
    }

    [Fact]
    public void A_long_name_is_stepped_down_until_it_fits_and_never_below_the_floor()
    {
        using var canvas = new InformeCanvas();
        const double width = InformeLayout.ContentW - 40;

        // The cover drew the name at a flat 22pt with no width bound, so this one reached x = 589 on a
        // 595pt page.
        var longName = LayoutMath.ShrinkToFit(canvas, "María Valentina Rodríguez Bustamante-Peralta", "Poppins-Bold", 22, 14, width);
        Assert.True(longName < 22, "a name that does not fit must be stepped down");
        Assert.True(LayoutMath.AdvanceWidth(canvas, "María Valentina Rodríguez Bustamante-Peralta", "Poppins-Bold", longName) <= width);

        Assert.Equal(22, LayoutMath.ShrinkToFit(canvas, "Ana Ruiz", "Poppins-Bold", 22, 14, width), 10);

        // The floor holds even for a name no size can fit on one line; the width bound then wraps it.
        Assert.Equal(14, LayoutMath.ShrinkToFit(canvas, new string('M', 400), "Poppins-Bold", 22, 14, width), 10);
    }

    [Fact]
    public void Clamp_caps_engine_prose_at_a_hard_character_count()
    {
        Assert.Equal("corto", LayoutMath.Clamp("corto", 10));
        Assert.Equal("cor…", LayoutMath.Clamp("corto", 3));
        Assert.Equal("…", LayoutMath.Clamp("corto", 0));
        Assert.Equal(string.Empty, LayoutMath.Clamp(null, 10));
    }

    [Fact]
    public void Fits_answers_against_the_page_bottom()
    {
        Assert.True(LayoutMath.Fits(700, 100));
        Assert.False(LayoutMath.Fits(700, 102));
        Assert.True(LayoutMath.Fits(InformeLayout.Bottom - 1, 1));
    }

    [Fact]
    public void A_truncated_block_reports_and_records_the_capped_height()
    {
        // The divider map and the contents rows clip a long title rather than let it push the row
        // pitch. The recorder has to honour the cap, or a deliberately clipped block reads as an
        // overflow.
        using var canvas = new InformeCanvas();
        canvas.NewContentPage();

        const string text = "Un título muy largo que necesitaría bastantes más líneas de las que caben en su fila.";
        var full = canvas.Measure(text, 120, Body);
        var capped = canvas.DrawTextBlock(text, InformeLayout.Margin, 100, 120, Body, InformeColors.Body, maxHeight: LayoutMath.LineHeight(9.5, 2.5) * 2);

        Assert.True(full > capped);
        Assert.Equal(LayoutMath.LineHeight(9.5, 2.5) * 2, capped, 10);
        Assert.Equal(capped, Assert.Single(canvas.Recording.Texts).H, 10);
    }

    [Fact]
    public void The_grid_is_six_columns_with_a_twelve_point_gutter()
    {
        Assert.Equal(InformeLayout.ContentW, InformeLayout.GridW(6), 2);
        Assert.Equal(InformeLayout.GridHalf, InformeLayout.GridW(3), 2);
        Assert.Equal(InformeLayout.GridThird, InformeLayout.GridW(2), 2);
        Assert.Equal(InformeLayout.GridTwoThirds, InformeLayout.GridW(4), 2);
        Assert.Equal(InformeLayout.Margin, InformeLayout.GridX(0), 10);
        Assert.Equal(InformeLayout.Margin + InformeLayout.GridHalf + InformeLayout.GridGutter, InformeLayout.GridX(3), 2);
    }
}
