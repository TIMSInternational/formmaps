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
    /// Greedy fill, honouring every explicit newline, over the same break opportunities pdfkit uses.
    ///
    /// The text is cut into SEGMENTS at every break opportunity, and each segment carries the
    /// whitespace that followed it. A candidate line is measured as the concatenation of its segments
    /// INCLUDING that trailing whitespace, and emitted with it trimmed. Both halves of that matter and
    /// both were found by diffing against pdfkit over 4,810 wraps of the document's own copy:
    ///
    ///   - Measuring with the trailing space is why the MIL instrument card breaks after
    ///     "capacidad numérica," in the shipped document. "capacidad numérica, memoria" is 130.268pt
    ///     and fits the 132.43pt column; with its space it is 132.485pt and does not.
    ///   - Breaking only at spaces put "4-dimension" and "step-by-step" on lines pdfkit splits. A
    ///     hyphen is a break opportunity, and the hyphen stays with the line above it.
    ///
    /// A segment that cannot fit a line even on its own — a long university name in a narrow card, a
    /// compound nobody anticipated — is filled CHARACTER by character instead, continuing on the line
    /// already in progress, which is what pdfkit does and is why it never overflows a column. That was
    /// also measured rather than assumed: the first port let such a word run past its box.
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

            string? current = null;
            foreach (var segment in Segments(hardLine))
            {
                var candidate = current is null ? segment : current + segment;
                if (AdvanceWidth(widths, candidate, font, size, tracking) <= width)
                {
                    current = candidate;
                    continue;
                }

                if (AdvanceWidth(widths, segment.TrimEnd(), font, size, tracking) > width)
                {
                    // The segment cannot fit a line however it is placed, so stop wrapping words and
                    // fill by character — starting on the line already in progress, not on a fresh one.
                    current = FillByCharacter(widths, lines, current ?? string.Empty, segment, width, font, size, tracking);
                    continue;
                }

                if (current is null)
                {
                    current = segment;
                    continue;
                }

                lines.Add(current.TrimEnd());
                current = segment;
            }

            lines.Add((current ?? string.Empty).TrimEnd());
        }

        return lines;
    }

    /// <summary>
    /// Packs <paramref name="segment"/> into <paramref name="buffer"/> one character at a time, emitting
    /// a line each time the column is full, and returns what is left over as the new current line.
    /// A single character that does not fit an empty line is kept anyway rather than looping forever.
    /// </summary>
    private static string FillByCharacter(IGlyphWidths widths, List<string> lines, string buffer, string segment, double width, string font, double size, double tracking)
    {
        foreach (var ch in segment)
        {
            var candidate = buffer + ch;
            if (buffer.Length > 0 && AdvanceWidth(widths, candidate, font, size, tracking) > width)
            {
                lines.Add(buffer.TrimEnd());
                buffer = ch.ToString();
                continue;
            }

            buffer = candidate;
        }

        return buffer;
    }

    /// <summary>
    /// Characters a line may break AFTER, beyond the space — the subset of UAX #14's break-after
    /// classes that the informe's copy actually exercises, each one established by a disagreement with
    /// pdfkit over the label dictionary and the interpretive library rather than read off the spec.
    /// </summary>
    private static bool IsBreakAfter(char c) => c is '-' or '\u2013' or '\u2014' or '|' or '/';

    /// <summary>
    /// Whether a hyphen or solidus sits in a numeric context, where UAX #14 (LB25) forbids the break.
    /// "2026-09-16" and "24/24" are single tokens; splitting a date or a coverage count across two
    /// lines is exactly the kind of thing nobody notices until it is in a student's report. The DASHES
    /// are not covered by this: pdfkit breaks "0–100" after the en dash, and so does this.
    /// </summary>
    private static bool IsNumericJoin(char c, char next) => c is '-' or '/' && char.IsDigit(next);

    /// <summary>
    /// Cuts a line into segments at every break opportunity. Each segment keeps the break character
    /// that ends it and any whitespace that follows, so a caller can measure with the whitespace and
    /// emit without it.
    /// </summary>
    private static IEnumerable<string> Segments(string line)
    {
        var start = 0;
        var i = 0;
        while (i < line.Length)
        {
            if (line[i] == ' ')
            {
                while (i < line.Length && line[i] == ' ')
                {
                    i++;
                }

                yield return line[start..i];
                start = i;
                continue;
            }

            if (IsBreakAfter(line[i]) && i + 1 < line.Length && !IsNumericJoin(line[i], line[i + 1]))
            {
                i++;

                // Whatever whitespace follows the break character belongs to the line ABOVE, or the
                // next line starts with a space: "spaced repetition — " breaks after the dash, and the
                // continuation begins at "can", not at " can".
                while (i < line.Length && line[i] == ' ')
                {
                    i++;
                }

                yield return line[start..i];
                start = i;
                continue;
            }

            i++;
        }

        if (start < line.Length)
        {
            yield return line[start..];
        }
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
