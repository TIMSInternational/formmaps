using System.Globalization;
using System.Reflection;
using System.Text;
using PdfSharp.Drawing;
using PdfSharp.Fonts;
using PdfSharp.Pdf;

namespace FormMaps.Application.Informe;

// InformeCanvas — the one surface the whole document draws through.
//
// It is two things at once, and deliberately so:
//
//   1. the PDFsharp half of the port. Every pdfkit call the legacy sections make has its counterpart
//      here: rect/roundedRect/fill, text with and without a width, circle, moveTo/lineTo/stroke,
//      image. Sections stay imperative measure-and-fit code and port one-to-one.
//   2. the containment recorder. In pdfkit the recorder was a patch on PDFDocument.prototype, so it
//      saw every draw without any section knowing. XGraphics is sealed and unpatchable, so the same
//      property is bought the other way round: there is no second way to draw, and this class
//      records. Recording is ALWAYS on — a 20-page informe is a few thousand small structs — so the
//      guarantee is available in production and not only under test.
//
// Wrapping belongs to LayoutMath, not here: DrawTextBlock calls the same LayoutMath.WrapLines that
// LayoutMath.Measure calls, which is what makes "measured height == consumed height" true.

/// <summary>Raster assets the document places (logo, part marks). Null bytes mean "not available" and the draw is skipped.</summary>
public interface IInformeAssets
{
    /// <summary>A logo variant by key, e.g. "fm-full-white".</summary>
    byte[]? Logo(string key);

    /// <summary>A part mark / illustration by key, e.g. "hero".</summary>
    byte[]? Illustration(string key);
}

/// <summary>Registers the four embedded Poppins faces with PDFsharp. Idempotent and thread-safe.</summary>
public sealed class PoppinsFontResolver : IFontResolver
{
    private static readonly Lock Gate = new();
    private static bool _registered;

    /// <summary>Installs this resolver as PDFsharp's global font resolver, once per process.</summary>
    public static void Register()
    {
        if (_registered)
        {
            return;
        }

        lock (Gate)
        {
            if (_registered)
            {
                return;
            }

            GlobalFontSettings.FontResolver ??= new PoppinsFontResolver();
            _registered = true;
        }
    }

    /// <inheritdoc />
    public byte[]? GetFont(string faceName) => PoppinsFonts.Load(faceName);

    /// <inheritdoc />
    public FontResolverInfo? ResolveTypeface(string familyName, bool isBold, bool isItalic)
    {
        // The informe names its faces directly ("Poppins-SemiBold"), never by family + weight.
        var face = PoppinsFonts.Faces.ContainsKey(familyName)
            ? familyName
            : isBold ? "Poppins-Bold" : "Poppins-Regular";
        return new FontResolverInfo(face);
    }
}

/// <summary>The informe's drawing surface: a PDFsharp document that records everything drawn on it.</summary>
public sealed class InformeCanvas : IGlyphWidths, IDisposable
{
    private readonly PdfDocument _document = new();
    private readonly Dictionary<(string Face, double Size), XFont> _fonts = [];
    private readonly Dictionary<string, XSolidBrush> _brushes = new(StringComparer.OrdinalIgnoreCase);
    private readonly XGraphics _measure;
    private XGraphics? _gfx;
    private StringBuilder? _content;
    private byte[]? _saved;
    private bool _disposed;

    /// <summary>
    /// Creates an empty document. Call <see cref="NewContentPage"/> or <see cref="NewFullBleedPage"/>
    /// to start drawing.
    ///
    /// <paramref name="compressContentStreams"/> is on in production and off when a test needs to read
    /// the emitted operators back — which is how the dashed-edge pattern is verified to reach the PDF
    /// as 3pt on / 3pt off, that dash being the entire signal that a place is being held.
    /// </summary>
    public InformeCanvas(bool compressContentStreams = true)
    {
        PoppinsFontResolver.Register();
        _document.Options.CompressContentStreams = compressContentStreams;
        _measure = XGraphics.CreateMeasureContext(
            new XSize(InformeLayout.PageW, InformeLayout.PageH),
            XGraphicsUnit.Point,
            XPageDirection.Downwards);
    }

    /// <summary>Everything drawn so far — the input to <see cref="Containment"/>.</summary>
    public DrawRecording Recording { get; } = new();

    /// <summary>The 1-based number of the page being drawn on; 0 before the first page.</summary>
    public int PageNumber { get; private set; }

    /// <summary>How many pages the document has. Readable after <see cref="Save"/>, which seals the document.</summary>
    public int PageCount { get; private set; }

    /// <summary>
    /// Whether tracked text can be drawn as one PDF text run with a real character-spacing operator
    /// rather than glyph by glyph — see <see cref="DrawLine"/>. False means the fallback is in use:
    /// the page still looks identical, but a text extractor reads tracked labels back with spaces
    /// inside the words. <c>CharacterSpacingIsNative</c> is asserted by the test suite, so a PDFsharp
    /// upgrade that moves the hook fails loudly instead of quietly degrading every kicker.
    /// </summary>
    public bool CharacterSpacingIsNative => _content is not null;

    // ── Pages ────────────────────────────────────────────────────────────────────────────────────

    /// <summary>
    /// Adds a white content page with the 4pt teal top bar and returns the first usable y (MARGIN).
    /// </summary>
    public double NewContentPage()
    {
        AddPage();
        FillRect(0, 0, InformeLayout.PageW, InformeLayout.PageH, InformeColors.White);
        FillRect(0, 0, InformeLayout.PageW, InformeLayout.TopBarH, InformeColors.Teal);
        return InformeLayout.Margin;
    }

    /// <summary>Adds a page flooded with one colour — the cover and the part dividers.</summary>
    public void NewFullBleedPage(string background)
    {
        AddPage();
        FillRect(0, 0, InformeLayout.PageW, InformeLayout.PageH, background);
    }

    /// <summary>
    /// Re-opens an existing page for drawing, for the buffered passes that write footers and folios
    /// once pagination is known. Subsequent draws are attributed to that page, exactly as the legacy
    /// recorder followed pdfkit's switchToPage — without it, every folio written back onto an earlier
    /// page was recorded against the LAST page and read as an overflow there.
    /// </summary>
    public void SwitchToPage(int pageNumber)
    {
        ArgumentOutOfRangeException.ThrowIfLessThan(pageNumber, 1);
        ArgumentOutOfRangeException.ThrowIfGreaterThan(pageNumber, PageCount);

        _gfx?.Dispose();
        _gfx = XGraphics.FromPdfPage(_document.Pages[pageNumber - 1], XGraphicsPdfPageOptions.Append, XGraphicsUnit.Point, XPageDirection.Downwards);
        _content = ResolveContentBuilder(_gfx);
        PageNumber = pageNumber;
    }

    private void AddPage()
    {
        var page = _document.AddPage();
        page.Width = XUnit.FromPoint(InformeLayout.PageW);
        page.Height = XUnit.FromPoint(InformeLayout.PageH);

        _gfx?.Dispose();
        _gfx = XGraphics.FromPdfPage(page, XGraphicsPdfPageOptions.Append, XGraphicsUnit.Point, XPageDirection.Downwards);
        _content = ResolveContentBuilder(_gfx);
        PageCount = _document.PageCount;
        PageNumber = PageCount;
    }

    // ── Shapes ───────────────────────────────────────────────────────────────────────────────────

    /// <summary>Fills a rectangle and records it as a container.</summary>
    public void FillRect(double x, double y, double w, double h, string color)
    {
        Gfx.DrawRectangle(Brush(color), x, y, w, h);
        Recording.AddBox(PageNumber, x, y, w, h);
    }

    /// <summary>
    /// Draws a rounded rectangle with an optional fill and an optional stroke, and records it.
    /// The empty-state grammar is a white fill with a 1pt dashed [3,3] edge — this is the one call
    /// that draws both a measured card and its pending twin, so the two can never drift apart.
    /// </summary>
    public void RoundedRect(double x, double y, double w, double h, double radius, string? fill = null, string? stroke = null, double strokeWidth = 1, IReadOnlyList<double>? dash = null)
    {
        var d = radius * 2;
        if (fill is not null && stroke is not null)
        {
            Gfx.DrawRoundedRectangle(Pen(stroke, strokeWidth, dash), Brush(fill), x, y, w, h, d, d);
        }
        else if (fill is not null)
        {
            Gfx.DrawRoundedRectangle(Brush(fill), x, y, w, h, d, d);
        }
        else if (stroke is not null)
        {
            Gfx.DrawRoundedRectangle(Pen(stroke, strokeWidth, dash), x, y, w, h, d, d);
        }
        else
        {
            return;
        }

        Recording.AddBox(PageNumber, x, y, w, h);
    }

    /// <summary>Fills a circle. Circles are glyphs, never containers, so nothing is recorded.</summary>
    public void FillCircle(double cx, double cy, double r, string color) =>
        Gfx.DrawEllipse(Brush(color), cx - r, cy - r, r * 2, r * 2);

    /// <summary>Strokes a circle — the pending ring is 1.2pt dashed [2,2].</summary>
    public void StrokeCircle(double cx, double cy, double r, string color, double width = 1, IReadOnlyList<double>? dash = null) =>
        Gfx.DrawEllipse(Pen(color, width, dash), cx - r, cy - r, r * 2, r * 2);

    /// <summary>Draws a straight line — section rules, hairlines, chart gridlines.</summary>
    public void Line(double x1, double y1, double x2, double y2, string color, double width = 1, IReadOnlyList<double>? dash = null, double opacity = 1) =>
        Gfx.DrawLine(Pen(color, width, dash, opacity), x1, y1, x2, y2);

    // ── Text ─────────────────────────────────────────────────────────────────────────────────────

    /// <summary>
    /// Draws one line of text at (x, y), the top-left of its line box, and returns the height it
    /// consumed. No wrapping: this is the pdfkit <c>lineBreak: false</c> case.
    /// </summary>
    public double DrawText(string? text, double x, double y, InformeTextStyle style, string color)
    {
        ArgumentNullException.ThrowIfNull(style);
        var value = text ?? string.Empty;
        var height = LayoutMath.LineHeight(style.Size, style.LineGap);
        if (value.Length == 0)
        {
            return height;
        }

        DrawLine(value, x, y, style, color);

        if (value.Trim().Length > 0)
        {
            var width = LayoutMath.AdvanceWidth(this, value, style.Font, style.Size, style.Tracking);
            Recording.AddText(PageNumber, x, y, width, height, value);
        }

        return height;
    }

    /// <summary>
    /// Draws <paramref name="text"/> wrapped into a column of width <paramref name="w"/> and returns
    /// the height consumed — equal by construction to <see cref="LayoutMath.Measure"/> for the same
    /// inputs, because both call the same <see cref="LayoutMath.WrapLines"/>.
    ///
    /// <paramref name="maxHeight"/> truncates the draw; the recorded extent is then the cap, not the
    /// measurement, so a deliberately clipped block is not reported as an overflow.
    /// </summary>
    public double DrawTextBlock(string? text, double x, double y, double w, InformeTextStyle style, string color, TextAlign align = TextAlign.Left, double? maxHeight = null)
    {
        ArgumentNullException.ThrowIfNull(style);
        var lines = LayoutMath.WrapLines(this, text, w, style.Font, style.Size, style.Tracking);
        var lineHeight = LayoutMath.LineHeight(style.Size, style.LineGap);
        var total = lines.Count * lineHeight;
        var consumed = maxHeight is { } cap ? Math.Min(total, cap) : total;
        var drawable = (int)Math.Floor((consumed / lineHeight) + 1e-9);

        var any = false;
        for (var i = 0; i < lines.Count && i < drawable; i++)
        {
            var line = lines[i];
            if (line.Length == 0)
            {
                continue;
            }

            var lineWidth = LayoutMath.AdvanceWidth(this, line, style.Font, style.Size, style.Tracking);
            var offset = align switch
            {
                TextAlign.Center => (w - lineWidth) / 2,
                TextAlign.Right => w - lineWidth,
                _ => 0,
            };

            DrawLine(line, x + offset, y + (i * lineHeight), style, color);
            any = any || line.Trim().Length > 0;
        }

        if (any)
        {
            // The recorded box is the COLUMN, not the ink: a block that wraps owns its full width,
            // which is what makes "runs past its box's right edge" meaningful for wrapped text.
            Recording.AddText(PageNumber, x, y, w, consumed, string.Join(" ", lines).Trim());
        }

        return consumed;
    }

    /// <summary>The height a wrapped block would consume — measure first, size the box to it, then draw.</summary>
    public double Measure(string? text, double width, InformeTextStyle style) => LayoutMath.Measure(this, text, width, style);

    /// <summary>The advance width of one line, tracking included.</summary>
    public double WidthOf(string? text, InformeTextStyle style) => LayoutMath.AdvanceWidth(this, text, style.Font, style.Size, style.Tracking);

    /// <inheritdoc />
    public double Width(string text, string font, double size) =>
        string.IsNullOrEmpty(text) ? 0 : _measure.MeasureString(text, Font(font, size)).Width;

    // ── Images ───────────────────────────────────────────────────────────────────────────────────

    /// <summary>Draws an image scaled to <paramref name="width"/>, preserving its aspect ratio. Null bytes draw nothing.</summary>
    public void DrawImage(byte[]? bytes, double x, double y, double width)
    {
        if (bytes is null || bytes.Length == 0)
        {
            return;
        }

        using var stream = new MemoryStream(bytes);
        using var image = XImage.FromStream(stream);
        var height = width * image.PixelHeight / image.PixelWidth;
        Gfx.DrawImage(image, x, y, width, height);
    }

    /// <summary>
    /// Draws an image contained within a box, centred horizontally and bottom-aligned — the cover
    /// mark and the part marks, which take whatever room the content above them leaves.
    /// </summary>
    public void DrawImageFit(byte[]? bytes, double x, double y, double w, double h)
    {
        if (bytes is null || bytes.Length == 0 || w <= 0 || h <= 0)
        {
            return;
        }

        using var stream = new MemoryStream(bytes);
        using var image = XImage.FromStream(stream);
        var scale = Math.Min(w / image.PixelWidth, h / image.PixelHeight);
        var dw = image.PixelWidth * scale;
        var dh = image.PixelHeight * scale;
        Gfx.DrawImage(image, x + ((w - dw) / 2), y + (h - dh), dw, dh);
    }

    // ── Output ───────────────────────────────────────────────────────────────────────────────────

    /// <summary>
    /// The finished PDF. Saving seals the PDFsharp document — it cannot be drawn on afterwards — so
    /// the bytes are kept and a second call returns the same ones rather than throwing at a caller
    /// that merely wanted to hash or re-send what it already rendered.
    /// </summary>
    public byte[] Save()
    {
        if (_saved is not null)
        {
            return _saved;
        }

        _gfx?.Dispose();
        _gfx = null;
        using var buffer = new MemoryStream();
        _document.Save(buffer);
        return _saved = buffer.ToArray();
    }

    /// <inheritdoc />
    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }

        _disposed = true;
        _gfx?.Dispose();
        _measure.Dispose();
        _document.Dispose();
    }

    // ── Internals ────────────────────────────────────────────────────────────────────────────────

    private XGraphics Gfx => _gfx ?? throw new InvalidOperationException("No page to draw on — call NewContentPage() or NewFullBleedPage() first.");

    private void DrawLine(string text, double x, double y, InformeTextStyle style, string color)
    {
        var font = Font(style.Font, style.Size);
        var brush = Brush(color);

        if (style.Tracking == 0)
        {
            Gfx.DrawString(text, font, brush, new XPoint(x, y), XStringFormats.TopLeft);
            return;
        }

        // Tracking. PDFsharp models no text state beyond the font, so it has no setting for PDF's
        // character-spacing operator (Tc) — the whole library, public and internal, has no such
        // concept. Two ways to get it, and the difference is only visible to a text extractor.
        if (_content is { } content)
        {
            // Write Tc into the content stream PDFsharp is building, around one ordinary DrawString.
            // Tc is a text-state parameter: legal inside a text object and outside one (a tracked
            // kicker is often the first text on a page, before PDFsharp has opened BT), and it
            // survives until reset. The run then draws as ONE text-showing operator, so an extractor
            // reads "PREPARADO PARA" rather than "PREP ARADO P ARA".
            //
            // Positioning is unaffected: PDFsharp moves between draws with Td, which is relative to
            // the previous LINE matrix and not to where the last Tj happened to end, so the extra
            // advance Tc introduces cannot push a later draw off its mark.
            content.Append(Pdf(style.Tracking)).Append(" Tc\n");
            try
            {
                Gfx.DrawString(text, font, brush, new XPoint(x, y), XStringFormats.TopLeft);
            }
            finally
            {
                content.Append("0 Tc\n");
            }

            return;
        }

        // Fallback, if a PDFsharp upgrade ever moves the hook: draw the run glyph by glyph. The page
        // looks the same — Tc spaces glyphs exactly as this does, which is why both agree with
        // AdvanceWidth — but each glyph becomes its own text-showing operator and extraction suffers.
        var cx = x;
        foreach (var ch in text)
        {
            var glyph = ch.ToString();
            Gfx.DrawString(glyph, font, brush, new XPoint(cx, y), XStringFormats.TopLeft);
            cx += _measure.MeasureString(glyph, font).Width + style.Tracking;
        }
    }

    /// <summary>A number as PDF writes them: invariant, no exponent, no trailing zeros.</summary>
    private static string Pdf(double value) => value.ToString("0.####", CultureInfo.InvariantCulture);

    /// <summary>
    /// The StringBuilder PDFsharp accumulates this page's content stream into, reached through the
    /// public <c>XGraphics.Internals</c> property. The property it hangs off is declared on an
    /// internal nested type, hence the reflection; a failure to resolve it is not an error, it just
    /// selects the glyph-by-glyph fallback.
    /// </summary>
    private static StringBuilder? ResolveContentBuilder(XGraphics gfx)
    {
        try
        {
            var internals = gfx.Internals;
            return internals?.GetType()
                .GetProperty("ContentStringBuilder", BindingFlags.Public | BindingFlags.Instance)?
                .GetValue(internals) as StringBuilder;
        }
        catch (TargetInvocationException)
        {
            return null;
        }
    }

    private XFont Font(string face, double size)
    {
        var key = (face, size);
        if (!_fonts.TryGetValue(key, out var font))
        {
            _fonts[key] = font = new XFont(face, size);
        }

        return font;
    }

    private XSolidBrush Brush(string color)
    {
        if (!_brushes.TryGetValue(color, out var brush))
        {
            _brushes[color] = brush = new XSolidBrush(ParseColor(color));
        }

        return brush;
    }

    private XPen Pen(string color, double width, IReadOnlyList<double>? dash, double opacity = 1)
    {
        var xcolor = ParseColor(color);
        if (opacity < 1)
        {
            xcolor.A = opacity;
        }

        var pen = new XPen(xcolor, width);
        if (dash is { Count: > 0 })
        {
            // PDFsharp writes the dash array in MULTIPLES OF THE PEN WIDTH, so a [3,3] pattern under a
            // 1.2pt pen would come out as 3.6pt dashes. Dividing here keeps the pattern in points,
            // which is what the spec states and what the empty-state grammar depends on: the dashed
            // edge IS the signal that a place is being held.
            pen.DashStyle = XDashStyle.Custom;
            pen.DashPattern = [.. dash.Select(d => d / width)];
        }

        return pen;
    }

    private static XColor ParseColor(string hex)
    {
        ArgumentNullException.ThrowIfNull(hex);
        var value = hex.AsSpan().TrimStart('#');
        if (value.Length != 6)
        {
            throw new ArgumentOutOfRangeException(nameof(hex), hex, "Expected a #RRGGBB colour.");
        }

        return XColor.FromArgb(
            byte.Parse(value[..2], NumberStyles.HexNumber, CultureInfo.InvariantCulture),
            byte.Parse(value[2..4], NumberStyles.HexNumber, CultureInfo.InvariantCulture),
            byte.Parse(value[4..], NumberStyles.HexNumber, CultureInfo.InvariantCulture));
    }
}
