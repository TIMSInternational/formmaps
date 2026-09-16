namespace FormMaps.Application.Informe;

// The design tokens of the informe — colour, spacing, page geometry, radii, strokes, type scale,
// chart palette and empty-state tokens — exported verbatim from the legacy theme.ts so the .NET
// renderer draws the SAME document. Renderer-agnostic: hex strings and points, nothing else.
//
// Colour meaning is a rule, not a taste: red, amber and green are VALUE and nothing else (band chips,
// level-board headers, confidence chips). Anything that names a thing — a DISC dimension, an
// instrument, a topic card, a personality axis — draws from InformeChart.Series. Cream is the panel
// surface and carries no meaning; the pending signal is the dashed edge, the em dash and the ring.

/// <summary>Brand colour tokens (hex).</summary>
public static class InformeColors
{
    /// <summary>deep navy — primary dark, ink.</summary>
    public const string Navy = "#102B47";

    /// <summary>deep teal — primary highlight.</summary>
    public const string Teal = "#2E9098";

    /// <summary>warm cream — panel surface.</summary>
    public const string Cream = "#F2F0E7";

    /// <summary>accent yellow.</summary>
    public const string Yellow = "#FFD23F";

    /// <summary>pure white.</summary>
    public const string White = "#FFFFFF";

    /// <summary>alias of navy — headlines.</summary>
    public const string Ink = "#102B47";

    /// <summary>dark slate — body copy.</summary>
    public const string Body = "#3E4C61";

    /// <summary>mid grey — secondary labels, captions.</summary>
    public const string Grey = "#8A93A3";

    /// <summary>warm grey — borders, dividers, chart tracks.</summary>
    public const string Line = "#E4E1D6";

    /// <summary>VALUE: high band / strengths.</summary>
    public const string Green = "#15A66B";

    /// <summary>VALUE: mid band.</summary>
    public const string Amber = "#E0A107";

    /// <summary>VALUE: low band.</summary>
    public const string Red = "#E0524E";

    /// <summary>crosshair and threshold strokes.</summary>
    public const string Grid = "#C5D0DE";

    /// <summary>soft green tint.</summary>
    public const string GreenSoft = "#E3F5EC";

    /// <summary>soft amber tint.</summary>
    public const string AmberSoft = "#FFF6D9";

    /// <summary>soft red tint.</summary>
    public const string RedSoft = "#FDECEA";

    /// <summary>soft peach — bridging suggestion bg.</summary>
    public const string PeachSoft = "#FFF3E6";

    /// <summary>strong text on greenSoft.</summary>
    public const string GreenDeep = "#1B5E3F";

    /// <summary>bridging / to-develop label.</summary>
    public const string Brown = "#C2632C";

    /// <summary>bridging body text.</summary>
    public const string BrownText = "#8A5A2C";

    /// <summary>light teal — divider line, on-navy captions.</summary>
    public const string TealLine = "#AECBCE";

    /// <summary>interest chips bg.</summary>
    public const string TealSoft = "#E4F0F0";

    /// <summary>series[2]; DISC S.</summary>
    public const string TealMid = "#7DB6BC";

    /// <summary>alternate university bar; DISC S ink.</summary>
    public const string TealDeep = "#247A86";

    /// <summary>body text on teal panels.</summary>
    public const string OnTeal = "#D4E5E2";

    /// <summary>body text on navy panels.</summary>
    public const string OnNavy = "#CBE0DE";

    /// <summary>plan horizon 2.</summary>
    public const string NavyMid = "#0A6BB8";

    /// <summary>plan horizon 3.</summary>
    public const string NavyLight = "#2F6FA8";

    /// <summary>recommendation / note panel bg.</summary>
    public const string YellowSoft = "#FFF9E0";

    /// <summary>text on yellowSoft.</summary>
    public const string YellowText = "#5C4D14";

    /// <summary>label on yellowSoft; DISC I ink.</summary>
    public const string YellowLabel = "#9A7B00";

    /// <summary>navy tint — the D glyph disc.</summary>
    public const string NavySoft = "#E4EAF1";

    /// <summary>a panel resting on a navy ground.</summary>
    public const string NavyPanel = "#1B3A5B";

}

/// <summary>Spacing scale in points (8-based; Xs only inside a component).</summary>
public static class InformeSpacing
{
    public const double Xxs = 2;
    public const double Xs = 4;
    public const double Sm = 8;
    public const double Md = 12;
    public const double Lg = 16;
    public const double Xl = 24;
    public const double Xxl = 32;
    public const double Xxxl = 48;
    public const double Page = 595.28;
    public const double Margin = 48;
}

/// <summary>Page composition constants. PageW/PageH are A4 in points; content may touch Bottom, never cross it.</summary>
public static class InformeLayout
{
    public const double PageW = 595.28;
    public const double PageH = 841.89;
    public const double Margin = 48;
    public const double ContentW = PageW - 2 * Margin;
    /// <summary>PageH − 40: the footer zone. The 28pt navy footer bar sits below it.</summary>
    public const double Bottom = PageH - 40;
    public const double FooterBarH = 28;
    public const double TopBarH = 4;

    public const double Y0Cont = 48;
    public const double KickerY = 49;
    public const double TitleY = 59;
    public const double SubY = 88;
    public const double AfterHeader = 16;
    public const double SectionGap = 32;
    public const double BlockGap = 16;
    public const double CardGap = 12;
    public const double SubsectionGap = 24;
    public const double OwnPageRatio = 0.6;
    public const double MinFollow = 24;
    public const double InkFloor = 0.62;
    public const double PartCloseFloor = 0.4;

    /// <summary>6 columns, 12pt gutter: col = (ContentW − 5×12) / 6.</summary>
    public const int GridCols = 6;
    public const double GridGutter = 12;
    public const double GridCol = 73.213;
    public const double GridHalf = 243.64;
    public const double GridThird = 158.43;
    public const double GridTwoThirds = 328.85;
    public const double GridQuarter = 115.82;

    /// <summary>x of grid column <paramref name="n"/> (0-based), measured from the left margin.</summary>
    public static double GridX(int n) => Margin + n * (GridCol + GridGutter);

    /// <summary>Width of a <paramref name="span"/>-column run.</summary>
    public static double GridW(int span) => span * GridCol + (span - 1) * GridGutter;
}

/// <summary>Corner radii in points.</summary>
public static class InformeRadius
{
    public const double Chip = 6;
    public const double Tile = 8;
    public const double Card = 12;
    public const double Panel = 14;
    public const double Pill = 11;
}

/// <summary>Stroke weights in points.</summary>
public static class InformeStroke
{
    public const double Hair = 0.6;
    public const double Rule = 1;
    public const double Glyph = 1.2;
    public const double Marker = 1.5;
    public const double Ring = 6;
    public const double RingHero = 7;
}

/// <summary>A type style: registered font name, size, extra line gap and tracking, all in points.</summary>
public sealed record InformeTextStyle(string Font, double Size, double LineGap = 0, double Tracking = 0);

/// <summary>
/// The type scale. ⚠ The legacy renderer measured Poppins line height as 1.5 × size + lineGap in pdfkit
/// and calibrated every card height on it. Re-measure it in the .NET renderer before trusting any
/// derived height — see <see cref="LineHeight"/>.
/// </summary>
public static class InformeType
{
    public static InformeTextStyle Kicker { get; } = new("Poppins-SemiBold", 8.5, Tracking: 1.2);
    public static InformeTextStyle H1 { get; } = new("Poppins-Bold", 17);
    public static InformeTextStyle H2 { get; } = new("Poppins-SemiBold", 11);
    public static InformeTextStyle H3 { get; } = new("Poppins-SemiBold", 10.5);
    public static InformeTextStyle Body { get; } = new("Poppins-Regular", 9.5, LineGap: 2.5);
    public static InformeTextStyle Small { get; } = new("Poppins-Regular", 8.7, LineGap: 2);
    public static InformeTextStyle Dense { get; } = new("Poppins-Regular", 8.5, LineGap: 1);
    public static InformeTextStyle Caption { get; } = new("Poppins-Regular", 7.5);
    public static InformeTextStyle Micro { get; } = new("Poppins-SemiBold", 6.8);
    public static InformeTextStyle Stat { get; } = new("Poppins-Bold", 15);
    public static InformeTextStyle Ring { get; } = new("Poppins-Bold", 16);
    public static InformeTextStyle Display { get; } = new("Poppins-Bold", 28);

    /// <summary>pdfkit line height for Poppins = 1.5 × size + lineGap — MEASURED in pdfkit, not a general truth.</summary>
    public static double LineHeight(double size, double gap = 0) => 1.5 * size + gap;
}

/// <summary>Chart palette and geometry. Identity colours come from <see cref="Series"/>; value colours from <see cref="Band"/>.</summary>
public static class InformeChart
{
    public const string Track = "#E4E1D6";
    public const string Grid = "#C5D0DE";
    public const string Baseline = "#E4E1D6";

    /// <summary>The brand series — never more than four series in one chart.</summary>
    public static IReadOnlyList<string> Series { get; } = ["#2E9098", "#102B47", "#7DB6BC", "#FFD23F"];

    /// <summary>DISC identity colours: D navy · I yellow · S tealMid · C teal.</summary>
    public static IReadOnlyDictionary<string, string> Disc { get; } = new Dictionary<string, string>(StringComparer.Ordinal)
    {
        ["D"] = "#102B47",
        ["I"] = "#FFD23F",
        ["S"] = "#7DB6BC",
        ["C"] = "#2E9098",
    };

    /// <summary>Ink for the DISC letter glyphs (I uses yellowLabel for legibility).</summary>
    public static IReadOnlyDictionary<string, string> DiscInk { get; } = new Dictionary<string, string>(StringComparer.Ordinal)
    {
        ["D"] = "#102B47",
        ["I"] = "#9A7B00",
        ["S"] = "#247A86",
        ["C"] = "#2E9098",
    };

    /// <summary>Tints behind the DISC letter glyphs.</summary>
    public static IReadOnlyDictionary<string, string> DiscTint { get; } = new Dictionary<string, string>(StringComparer.Ordinal)
    {
        ["D"] = "#E4EAF1",
        ["I"] = "#FFF9E0",
        ["S"] = "#E4F0F0",
        ["C"] = "#E4F0F0",
    };

    /// <summary>VALUE colours by band.</summary>
    public static IReadOnlyDictionary<Band, string> BandColor { get; } = new Dictionary<Band, string>
    {
        [Band.Low] = "#E0524E",
        [Band.Med] = "#E0A107",
        [Band.High] = "#15A66B",
    };

    /// <summary>Soft tints by band (chip backgrounds).</summary>
    public static IReadOnlyDictionary<Band, string> BandSoft { get; } = new Dictionary<Band, string>
    {
        [Band.Low] = "#FDECEA",
        [Band.Med] = "#FFF6D9",
        [Band.High] = "#E3F5EC",
    };

    public const double BarHSm = 5;
    public const double BarHMd = 6;
    public const double BarHLg = 8;
    public const double RingRCard = 28;
    public const double RingRHero = 34;
    public const double RingStroke = 6;
    public const double RadarR = 80;
    public const double RadarFillOpacity = 0.18;
    public const double RadarStroke = 1.5;
    public const double MutedOpacity = 0.55;
    public const double DiscBarsPanelH = 200;
    public const double DiscBarsBarW = 22;
    public const double DiscBarsGap = 10;
    public const double DiscBarsMaxH = 110;
    public const double QuadrantSize = 220;
    public const double QuadrantInset = 18;
}

/// <summary>The empty-state grammar: white + 1pt dashed [3,3] is the ONLY empty signal; the value is "—", never 0 or N/D.</summary>
public static class InformeEmpty
{
    public const string Fill = "#FFFFFF";
    public const string Stroke = "#E4E1D6";
    public static IReadOnlyList<double> Dash { get; } = [3, 3];
    public const double StrokeW = 1;
    public const string Text = "#8A93A3";
    public const string Glyph = "#8A93A3";
    public const double GlyphR = 7;
    public static IReadOnlyList<double> GlyphDash { get; } = [2, 2];
    public const double ChipH = 15;
    public const double ChipR = 7.5;
    public const double ChipPadX = 7;
    public const double ChipSize = 7.5;
    public const string Value = "—";
    public const double CardMinH = 72;
    public const double StubH = 96;
    public const double IllustrationOpacity = 0.6;
}
