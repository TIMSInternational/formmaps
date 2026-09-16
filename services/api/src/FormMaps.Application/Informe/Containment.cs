using System.Globalization;

namespace FormMaps.Application.Informe;

// Containment — "nothing overflows its box, anywhere" as an assertion instead of a thing somebody
// notices in a PDF viewer. Ported from the legacy __tests__/containment.ts.
//
// The pre-existing golden tests asserted that the maximum y drawn stays above BOTTOM. That catches
// text running off the PAGE and nothing else, which is why two whole classes of defect shipped:
//
//   - text drawn past the bottom edge of the card it belongs to. The intro page's three instrument
//     cards were a literal roundedRect(..., 132) with unmeasured text inside, so the PCA card's last
//     line, "e imagen propia.", printed below the card on page 2 of every report ever generated;
//   - one box drawn on top of another. The resumen page's recommendation panel landed on top of the
//     KPI tiles whenever both hero cards were empty — and every text inside each box still fitted.
//
// Neither moves maxY past BOTTOM. Both are box-relative, so this records the boxes.
//
// In pdfkit the recorder was a patch on PDFDocument.prototype, so it saw every draw a section made
// without any section knowing it was being watched. XGraphics is sealed and cannot be patched, so
// the .NET equivalent is the other half of the same idea: every draw in the document goes through
// InformeCanvas, and InformeCanvas records. The recording is always on — a 20-page informe is a few
// thousand small structs — so the self-check is available in production, not only under test.
//
// This detector lives in the application, not the test project, on purpose: it is the guarantee the
// document ships with, and every slice from here on asserts against it.

/// <summary>A container box that was drawn — a card, panel, tile, chip or bar.</summary>
public readonly record struct DrawnBox(int Page, double X, double Y, double W, double H, int Seq);

/// <summary>A text run that was drawn. <see cref="H"/> is the full height of a wrapped block.</summary>
public readonly record struct DrawnText(int Page, double X, double Y, double W, double H, int Seq, string Text);

/// <summary>Everything a render drew, in draw order.</summary>
public sealed class DrawRecording
{
    private readonly List<DrawnBox> _boxes = [];
    private readonly List<DrawnText> _texts = [];
    private int _seq;

    /// <summary>Filled/stroked rectangles, in draw order.</summary>
    public IReadOnlyList<DrawnBox> Boxes => _boxes;

    /// <summary>Text runs, in draw order.</summary>
    public IReadOnlyList<DrawnText> Texts => _texts;

    /// <summary>The highest page number anything was drawn on.</summary>
    public int Pages { get; private set; }

    internal void AddBox(int page, double x, double y, double w, double h)
    {
        _boxes.Add(new DrawnBox(page, x, y, w, h, _seq++));
        Pages = Math.Max(Pages, page);
    }

    internal void AddText(int page, double x, double y, double w, double h, string text)
    {
        _texts.Add(new DrawnText(page, x, y, w, h, _seq++, text));
        Pages = Math.Max(Pages, page);
    }
}

/// <summary>One containment failure: what kind, and enough geometry to find it in the PDF.</summary>
public sealed record ContainmentViolation(string Kind, string Detail)
{
    /// <inheritdoc />
    public override string ToString() => $"{Kind}: {Detail}";
}

/// <summary>The three checks, run over a <see cref="DrawRecording"/>.</summary>
public static class Containment
{
    /// <summary>The navy footer bar occupies the strip below BOTTOM; its own text belongs there.</summary>
    private const double FooterTop = InformeLayout.PageH - InformeLayout.FooterBarH;

    /// <summary>A box covering essentially the whole page is a background, not a container.</summary>
    private static bool IsBackground(in DrawnBox b) =>
        b.W >= InformeLayout.PageW - 1 && b.H >= InformeLayout.PageH - 1;

    /// <summary>Accent bars, rules and hairlines are decoration; nothing is "inside" them.</summary>
    private static bool IsContainer(in DrawnBox b) => !IsBackground(b) && b.W >= 40 && b.H >= 20;

    private static string F(double v) => v.ToString("F1", CultureInfo.InvariantCulture);

    private static string F0(double v) => v.ToString("F0", CultureInfo.InvariantCulture);

    private static string Snippet(string text) => text.Length <= 44 ? text : text[..44];

    /// <summary>
    /// Every text run must fit inside the innermost box it was drawn into.
    ///
    /// <paramref name="pad"/> absorbs the difference between a glyph's advance box and its drawn
    /// extent — the reported height is the line box, which sits a little proud of the ink.
    /// </summary>
    public static IReadOnlyList<ContainmentViolation> FindTextOverflows(DrawRecording recording, double pad = 1.5)
    {
        ArgumentNullException.ThrowIfNull(recording);
        var violations = new List<ContainmentViolation>();

        foreach (var t in recording.Texts)
        {
            DrawnBox? innermost = null;
            foreach (var b in recording.Boxes)
            {
                if (b.Page != t.Page || b.Seq >= t.Seq || !IsContainer(b))
                {
                    continue;
                }

                // The run's ORIGIN decides which box it belongs to; where it ends is what is in question.
                if (t.X < b.X - pad || t.X > b.X + b.W + pad || t.Y < b.Y - pad || t.Y > b.Y + b.H + pad)
                {
                    continue;
                }

                if (innermost is null || b.W * b.H < innermost.Value.W * innermost.Value.H)
                {
                    innermost = b;
                }
            }

            if (innermost is null)
            {
                continue;
            }

            var box = innermost.Value;
            var overBottom = t.Y + t.H - (box.Y + box.H);
            var overRight = t.X + t.W - (box.X + box.W);

            if (overBottom > pad)
            {
                violations.Add(new ContainmentViolation(
                    "text-below-box",
                    $"p{t.Page} \"{Snippet(t.Text)}\" overflows its box by {F(overBottom)}pt " +
                    $"(text {F0(t.Y)}..{F0(t.Y + t.H)}, box {F0(box.Y)}..{F0(box.Y + box.H)})"));
            }

            if (overRight > pad)
            {
                violations.Add(new ContainmentViolation(
                    "text-past-box",
                    $"p{t.Page} \"{Snippet(t.Text)}\" runs {F(overRight)}pt past its box's right edge"));
            }
        }

        return violations;
    }

    /// <summary>No text may cross the page's own bounds.</summary>
    public static IReadOnlyList<ContainmentViolation> FindPageOverflows(DrawRecording recording, double pad = 1.5)
    {
        ArgumentNullException.ThrowIfNull(recording);
        var violations = new List<ContainmentViolation>();

        foreach (var t in recording.Texts)
        {
            if (t.Y >= FooterTop - pad)
            {
                // Drawn into the footer bar, by design.
                continue;
            }

            if (t.Y + t.H > InformeLayout.Bottom + pad)
            {
                violations.Add(new ContainmentViolation(
                    "text-below-page",
                    $"p{t.Page} \"{Snippet(t.Text)}\" ends at {F(t.Y + t.H)} > BOTTOM {F(InformeLayout.Bottom)}"));
            }

            // A full-bleed page (cover, divider) legitimately draws left of the margin; 14pt of slack
            // is what the legacy detector allowed, and it is what keeps those pages reportable.
            if (t.X < InformeLayout.Margin - pad - 14)
            {
                violations.Add(new ContainmentViolation(
                    "text-left-of-margin",
                    $"p{t.Page} \"{Snippet(t.Text)}\" starts at x={F(t.X)}"));
            }

            if (t.X + t.W > InformeLayout.PageW - InformeLayout.Margin + pad)
            {
                violations.Add(new ContainmentViolation(
                    "text-past-margin",
                    $"p{t.Page} \"{Snippet(t.Text)}\" ends at x={F(t.X + t.W)} > {F(InformeLayout.PageW - InformeLayout.Margin)}"));
            }
        }

        return violations;
    }

    /// <summary>
    /// Two container boxes on the same page must not overlap.
    ///
    /// This is the check that catches the recommendation panel landing on top of the KPI tiles: both
    /// boxes were drawn correctly in isolation, and every text inside each of them fitted. A box
    /// fully inside another is NESTING — a chip on a panel — and is not a collision.
    /// </summary>
    public static IReadOnlyList<ContainmentViolation> FindBoxCollisions(DrawRecording recording, double pad = 1)
    {
        ArgumentNullException.ThrowIfNull(recording);
        var violations = new List<ContainmentViolation>();

        var byPage = new Dictionary<int, List<DrawnBox>>();
        foreach (var b in recording.Boxes)
        {
            if (!IsContainer(b))
            {
                continue;
            }

            if (!byPage.TryGetValue(b.Page, out var list))
            {
                byPage[b.Page] = list = [];
            }

            list.Add(b);
        }

        foreach (var (page, boxes) in byPage)
        {
            for (var i = 0; i < boxes.Count; i++)
            {
                for (var j = i + 1; j < boxes.Count; j++)
                {
                    var a = boxes[i];
                    var b = boxes[j];

                    var ox = Math.Min(a.X + a.W, b.X + b.W) - Math.Max(a.X, b.X);
                    var oy = Math.Min(a.Y + a.H, b.Y + b.H) - Math.Max(a.Y, b.Y);
                    if (ox <= pad || oy <= pad)
                    {
                        continue;
                    }

                    var aInB = a.X >= b.X - pad && a.Y >= b.Y - pad && a.X + a.W <= b.X + b.W + pad && a.Y + a.H <= b.Y + b.H + pad;
                    var bInA = b.X >= a.X - pad && b.Y >= a.Y - pad && b.X + b.W <= a.X + a.W + pad && b.Y + b.H <= a.Y + a.H + pad;
                    if (aInB || bInA)
                    {
                        continue;
                    }

                    violations.Add(new ContainmentViolation(
                        "box-collision",
                        $"p{page} boxes overlap by {F(ox)}×{F(oy)}pt " +
                        $"({F0(a.X)},{F0(a.Y)},{F0(a.W)}×{F0(a.H)}) vs ({F0(b.X)},{F0(b.Y)},{F0(b.W)}×{F0(b.H)})"));
                }
            }
        }

        return violations;
    }

    /// <summary>All three checks, in one list.</summary>
    public static IReadOnlyList<ContainmentViolation> FindAll(DrawRecording recording) =>
    [
        .. FindPageOverflows(recording),
        .. FindTextOverflows(recording),
        .. FindBoxCollisions(recording),
    ];

    /// <summary>The violations as one newline-separated string — empty when there are none, so a test can assert on "".</summary>
    public static string Describe(IEnumerable<ContainmentViolation> violations) =>
        string.Join("\n", violations ?? []);
}
