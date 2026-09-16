namespace FormMaps.Application.Informe;

// The measure-and-fit core of the informe — the no-overflow guarantee, ported from the legacy
// layout.ts (tafurfede/formmaps-platform, PR #352) and kept renderer-independent on purpose.
//
// The fundamental invariant, unchanged from the legacy renderer:
//
//     Measure(text, width, style) === the height DrawTextBlock consumes for the same inputs
//
// In pdfkit that identity held because measure() and textBlock() both set the same font state and
// both delegated the wrapping to the library. PDFsharp does NOT wrap: MeasureString measures one
// line and DrawString draws one line. So the wrapping is OURS now, and the identity holds for a
// different reason — Measure and DrawTextBlock call the SAME WrapLines with the same arguments and
// multiply by the same LineHeight. That shared call is the whole guarantee; nothing here may grow a
// second way to break a paragraph into lines.
//
// A box's height is DERIVED from a measurement, never written as a literal. The legacy renderer had
// 42 hard-coded heights across its sections, and one of them — roundedRect(cx, y, cardW, 132) on the
// intro page — printed "e imagen propia." below the card on page 2 of every report ever generated.

/// <summary>
/// The width oracle the layout measures through: the advance width of a single line of text in one
/// face at one size, with no tracking applied. Implemented by the renderer (see InformeCanvas), so
/// the layout math itself carries no PDF dependency and is unit-testable without one.
/// </summary>
public interface IGlyphWidths
{
    /// <summary>Advance width in points of <paramref name="text"/> as one line, no tracking.</summary>
    double Width(string text, string font, double size);
}

/// <summary>Horizontal alignment of a wrapped text block within its column.</summary>
public enum TextAlign
{
    Left,
    Center,
    Right,
}

/// <summary>Measure-and-fit primitives. Pure math over an <see cref="IGlyphWidths"/>.</summary>
public static class LayoutMath
{
    /// <summary>Default card padding in points (the legacy layout.ts DEFAULT_PAD).</summary>
    public const double DefaultPad = 16;

    /// <summary>
    /// Height of one line, in points.
    ///
    /// pdfkit measured Poppins at 1.5 × size and the entire document's geometry was calibrated on
    /// that number — a fact about pdfkit's treatment of this font, not a general truth, which is why
    /// the layout invariants say to re-measure it first thing in any other renderer. It was:
    /// PoppinsMetricsTests records PDFsharp reporting 1.5000 for all four faces across the whole type
    /// scale, so the calibration carries over unchanged and every card height in the spec still holds.
    /// </summary>
    public static double LineHeight(double size, double lineGap = 0) => InformeType.LineHeight(size, lineGap);

    /// <summary>Normalises CRLF/CR to LF so wrapping sees one newline convention.</summary>
    public static string NormalizeBreaks(string? text) =>
        (text ?? string.Empty).Replace("\r\n", "\n", StringComparison.Ordinal).Replace('\r', '\n');

    /// <summary>
    /// Advance width of one line including tracking. Tracking (pdfkit's characterSpacing) is added
    /// BETWEEN characters, so a run of n characters carries n−1 of it — the kicker's 1.2pt tracking
    /// widens "INTRODUCCIÓN" by 13.2pt, which is the difference between a kicker that fits its
    /// column and one the containment detector reports as running past it.
    /// </summary>
    public static double AdvanceWidth(IGlyphWidths widths, string? text, string font, double size, double tracking = 0)
    {
        ArgumentNullException.ThrowIfNull(widths);
        if (string.IsNullOrEmpty(text))
        {
            return 0;
        }

        var width = widths.Width(text, font, size);
        if (tracking != 0 && text.Length > 1)
        {
            width += tracking * (text.Length - 1);
        }

        return width;
    }

    /// <summary>
    /// Breaks <paramref name="text"/> into the lines that will actually be drawn, at <paramref name="width"/>.
    ///
    /// Greedy fill on spaces, honouring every explicit newline. A word wider than the column gets a
    /// line to itself and is NOT broken mid-word — the same thing pdfkit does, so the ported geometry
    /// behaves identically; the containment detector is what catches the result if one ever overflows.
    ///
    /// A candidate line is measured WITH the space that would follow it, because that is what pdfkit
    /// does: its line breaker takes each segment up to the next break opportunity, trailing whitespace
    /// included. The difference is one space wide and it really does move words between lines — the
    /// MIL instrument card breaks after "capacidad numérica," in the shipped document because
    /// "capacidad numérica, memoria" measures 130.268pt, fits the 132.43pt column, and then does not
    /// fit it once its trailing space is counted (132.485pt). Ignoring the space re-wrapped that card.
    /// The last word of a line has no following space and is measured without one.
    ///
    /// KNOWN GAP: pdfkit breaks at every UAX #14 opportunity, so it can also break after a hyphen or
    /// an em dash. This breaks on spaces only. No line in the shipped document depends on it (the
    /// three instrument descriptions, which are the densest copy in the document, reproduce exactly —
    /// see LayoutMathTests), but a long hyphenated word is where the two would still part company.
    /// </summary>
    public static IReadOnlyList<string> WrapLines(IGlyphWidths widths, string? text, double width, string font, double size, double tracking = 0)
    {
        ArgumentNullException.ThrowIfNull(widths);
        var lines = new List<string>();

        foreach (var hardLine in NormalizeBreaks(text).Split('\n'))
        {
            if (hardLine.Length == 0)
            {
                // A blank line is a real line: it consumes a line height, which is how a paragraph
                // break keeps its air when prose() has preserved one.
                lines.Add(string.Empty);
                continue;
            }

            var words = hardLine.Split(' ');
            string? current = null;
            for (var i = 0; i < words.Length; i++)
            {
                var candidate = current is null ? words[i] : current + " " + words[i];
                var probe = i == words.Length - 1 ? candidate : candidate + " ";
                if (current is null || AdvanceWidth(widths, probe, font, size, tracking) <= width)
                {
                    current = candidate;
                }
                else
                {
                    lines.Add(current);
                    current = words[i];
                }
            }

            lines.Add(current ?? string.Empty);
        }

        return lines;
    }

    /// <summary>
    /// The height a wrapped block of <paramref name="text"/> consumes at <paramref name="width"/>.
    /// Equal by construction to what <c>InformeCanvas.DrawTextBlock</c> consumes for the same inputs.
    /// </summary>
    public static double Measure(IGlyphWidths widths, string? text, double width, InformeTextStyle style)
    {
        ArgumentNullException.ThrowIfNull(style);
        return WrapLines(widths, text, width, style.Font, style.Size, style.Tracking).Count
            * LineHeight(style.Size, style.LineGap);
    }

    /// <summary>
    /// The height of a card that holds <paramref name="contentHeight"/> points of content.
    /// Sizing a box from a measurement is the point: a box derived this way can never be too small.
    /// </summary>
    public static double CardHeight(double contentHeight, double pad = DefaultPad) => contentHeight + (2 * pad);

    /// <summary>
    /// The largest size in [<paramref name="minSize"/>, <paramref name="startSize"/>] at which
    /// <paramref name="text"/> fits <paramref name="maxWidth"/> on one line.
    ///
    /// The cover drew the student name at a flat 22pt with no width bound, so
    /// "María Valentina Rodríguez Bustamante-Peralta" reached x = 589 on a 595pt page. Stepping the
    /// size down is the fix; the caller still passes a width so anything longer still wraps rather
    /// than bleeding off the page.
    /// </summary>
    public static double ShrinkToFit(IGlyphWidths widths, string text, string font, double startSize, double minSize, double maxWidth, double step = 1)
    {
        ArgumentOutOfRangeException.ThrowIfNegativeOrZero(step);
        var size = startSize;
        while (size > minSize && AdvanceWidth(widths, text, font, size) > maxWidth)
        {
            size -= step;
        }

        return Math.Max(size, minSize);
    }

    /// <summary>Whether <paramref name="needed"/> points still fit above <paramref name="bottom"/> from <paramref name="y"/>.</summary>
    public static bool Fits(double y, double needed, double bottom = InformeLayout.Bottom) => y + needed <= bottom;

    /// <summary>
    /// Hard character cap — defence in depth for engine- and AI-authored strings, which have no
    /// length contract. Returns at most <paramref name="max"/> characters plus an ellipsis.
    /// </summary>
    public static string Clamp(string? text, int max)
    {
        var value = text ?? string.Empty;
        if (value.Length <= max)
        {
            return value;
        }

        return max <= 0 ? "…" : string.Concat(value.AsSpan(0, max), "…");
    }
}
