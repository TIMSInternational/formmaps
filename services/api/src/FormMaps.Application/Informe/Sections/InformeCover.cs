using System.Globalization;

namespace FormMaps.Application.Informe.Sections;

// sections/cover.ts — the full-bleed navy cover, page 1. Ported call for call.

/// <summary>Page 1: the cover.</summary>
public static class InformeCover
{
    /// <summary>The muted teals the cover labels are set in. Cover-local in the legacy renderer too — they are not design tokens.</summary>
    private const string PreparedForInk = "#90B8BC";
    private const string SchoolInk = "#AECBCE";
    private const string MetaInk = "#7FA0A3";

    /// <summary>Draws the cover on a new page.</summary>
    public static void Render(InformeCanvas canvas, InformeViewModel vm, string lang, IInformeAssets? assets = null)
    {
        ArgumentNullException.ThrowIfNull(canvas);
        ArgumentNullException.ThrowIfNull(vm);

        var spanish = !string.Equals(lang, "en", StringComparison.Ordinal);
        string T(string key) => InformeLabels.Get(lang, key);

        canvas.NewFullBleedPage(InformeColors.Navy);

        // The cover mark, bleeding off the lower-right corner. It is drawn BEFORE the yellow bar and
        // the type so nothing it carries can sit on top of them.
        canvas.DrawImageFit(
            assets?.Illustration("hero"),
            InformeLayout.PageW * 0.16,
            404,
            InformeLayout.PageW * 0.86,
            InformeLayout.PageH - 30 - 404);

        canvas.FillRect(0, InformeLayout.PageH - 6, InformeLayout.PageW, 6, InformeColors.Yellow);
        canvas.DrawImage(assets?.Logo("fm-full-white"), InformeLayout.Margin, 60, 218);

        canvas.DrawText(
            T("cover.kicker").ToUpper(Culture(spanish)),
            InformeLayout.Margin,
            150,
            new InformeTextStyle("Poppins-SemiBold", 10, Tracking: 1.3),
            InformeColors.Yellow);

        canvas.DrawTextBlock(
            T("section.cover.title"),
            InformeLayout.Margin,
            172,
            InformeLayout.ContentW,
            new InformeTextStyle("Poppins-Bold", 32),
            InformeColors.White);

        // Decorative rule: 46 × 3, too thin to be a container.
        canvas.FillRect(InformeLayout.Margin, 268, 46, 3, InformeColors.Yellow);

        canvas.DrawText(
            spanish ? "PREPARADO PARA" : "PREPARED FOR",
            InformeLayout.Margin,
            300,
            new InformeTextStyle("Poppins-Regular", 10, Tracking: 1),
            PreparedForInk);

        // The name was drawn at a flat 22pt with no width bound, so "María Valentina Rodríguez
        // Bustamante-Peralta" reached x = 589 on a 595pt page. Step the size down until it fits on one
        // line; the width bound then catches anything longer still.
        var nameWidth = InformeLayout.ContentW - 40;
        var nameSize = LayoutMath.ShrinkToFit(canvas, vm.Student.Name, "Poppins-Bold", 22, 14, nameWidth);
        canvas.DrawTextBlock(
            vm.Student.Name,
            InformeLayout.Margin,
            316 + ((22 - nameSize) * 0.5),
            nameWidth,
            new InformeTextStyle("Poppins-Bold", nameSize),
            InformeColors.White);

        var schoolGrade = string.Join(
            "  ·  ",
            new[] { vm.Student.School, vm.Student.Grade }.Where(s => !string.IsNullOrWhiteSpace(s)));
        if (schoolGrade.Length > 0)
        {
            canvas.DrawTextBlock(
                schoolGrade,
                InformeLayout.Margin,
                346,
                InformeLayout.ContentW,
                new InformeTextStyle("Poppins-Medium", 11),
                SchoolInk);
        }

        canvas.DrawTextBlock(
            InstrumentLine(vm.Coverage, spanish, vm.GeneratedAt),
            InformeLayout.Margin,
            378,
            InformeLayout.ContentW - 40,
            new InformeTextStyle("Poppins-Regular", 8.5),
            MetaInk);
    }

    /// <summary>
    /// Only the instruments the student actually completed, then the date.
    ///
    /// This line was the static string "PCA · LIA · 360°" and printed 360° on the cover of reports
    /// whose 360 had never been answered — the cover asserting data the document then had to deny.
    /// </summary>
    private static string InstrumentLine(InformeCoverage coverage, bool spanish, DateTimeOffset generatedAt)
    {
        var done = new List<string>();
        if (coverage.Pca.Measured)
        {
            done.Add("PCA");
        }

        if (coverage.Mil.Measured)
        {
            done.Add("MIL");
        }

        if (coverage.Competencias.Measured)
        {
            done.Add($"{(spanish ? "Competencias" : "Competencies")} {coverage.Competencias.Done}/{coverage.Competencias.Total}");
        }

        if (coverage.Personalidad.Measured)
        {
            done.Add(spanish ? "Personalidad" : "Personality");
        }

        if (coverage.ThreeSixty.Measured)
        {
            done.Add("360°");
        }

        var date = spanish
            ? generatedAt.ToString("d 'de' MMMM 'de' yyyy", Culture(true))
            : generatedAt.ToString("MMMM d, yyyy", Culture(false));

        return done.Count > 0 ? $"{string.Join(" · ", done)}  ·  {date}" : date;
    }

    private static CultureInfo Culture(bool spanish) => CultureInfo.GetCultureInfo(spanish ? "es-CO" : "en-US");
}
