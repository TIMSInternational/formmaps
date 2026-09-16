namespace FormMaps.Application.Informe.Sections;

// sections/intro.ts — "Acerca de este informe": the introduction AND the contents, on one page.
//
// These were two pages. The contents page sat at 53% ink and drew its dotted leaders as a loop of
// "·" characters; the introduction sat at 66%. Neither earned a page. One page now carries the three
// instrument cards across the top, the contents in the left column with a hairline per row and the
// folio at the column's edge, and the reading guide in the right column.
//
// The folios are written once pagination is known — they used to be hard-coded "because the PDF
// structure never changes", which was already false before sections started disappearing when they
// have no data.

/// <summary>One line in the table of contents. <see cref="Id"/> ties the line to the section that renders it.</summary>
public sealed record TocEntry(string Id, string Title, int Level, bool Pending = false);

/// <summary>Where a contents line's folio slot is, so the real page number can be written after pagination.</summary>
public sealed record TocAnchor(string Id, double Y, double X, double W, int Level, bool Pending);

/// <summary>What the front page leaves behind: the folio slots, and the y its content ended at.</summary>
public sealed record FrontPageResult(IReadOnlyList<TocAnchor> Anchors, double Cursor);

/// <summary>Page 2: the merged introduction and contents.</summary>
public static class InformeFrontPage
{
    private const double FolioW = 24;
    private const double PendingW = 60;

    /// <summary>The instrument card's body top — the descriptions all start here, whatever the title did.</summary>
    private const double BodyTop = 52;

    /// <summary>Draws the front page on a new page and returns its folio slots.</summary>
    public static FrontPageResult Render(InformeCanvas canvas, InformeViewModel vm, string lang, IReadOnlyList<TocEntry> entries, IInformeAssets? assets = null)
    {
        ArgumentNullException.ThrowIfNull(canvas);
        ArgumentNullException.ThrowIfNull(vm);
        ArgumentNullException.ThrowIfNull(entries);

        var spanish = !string.Equals(lang, "en", StringComparison.Ordinal);
        string T(string key) => InformeLabels.Get(lang, key);
        string L(string es, string en) => spanish ? es : en;

        canvas.NewContentPage();

        // ── Section header ───────────────────────────────────────────────────────────────────────
        canvas.FillRect(InformeLayout.Margin, 50, 4, 20, InformeColors.Yellow);
        canvas.DrawText(
            T("section.intro.kicker").ToUpperInvariant(),
            InformeLayout.Margin + 12,
            InformeLayout.KickerY,
            InformeType.Kicker,
            InformeColors.Teal);
        canvas.DrawTextBlock(
            T("section.intro.title"),
            InformeLayout.Margin + 12,
            InformeLayout.TitleY,
            InformeLayout.ContentW - 90,
            InformeType.H1,
            InformeColors.Ink);
        var subHeight = canvas.DrawTextBlock(
            T("section.intro.sub"),
            InformeLayout.Margin + 12,
            InformeLayout.SubY,
            InformeLayout.ContentW - 80,
            InformeType.Body,
            InformeColors.Body);

        var y = InformeLayout.SubY + subHeight + InformeSpacing.Lg;

        // ── The three instruments ────────────────────────────────────────────────────────────────
        // Accent colours NAME the instrument, so they come from the brand series, never from the
        // value palette — red/amber/green mean value and nothing else anywhere in this document.
        var instruments = Instruments(L);

        var cardW = InformeLayout.GridThird;
        var bodyStyle = new InformeTextStyle("Poppins-Regular", 8.3, LineGap: 2);
        var bodyW = cardW - 26;

        // The card height is DERIVED from the tallest measured description. A literal 132 once put the
        // PCA card's last line, "e imagen propia.", below the card on page 2 of every report.
        var descHeight = instruments.Max(i => canvas.Measure(i.Description, bodyW, bodyStyle));
        var cardH = BodyTop + descHeight + 16;

        for (var i = 0; i < instruments.Count; i++)
        {
            var instrument = instruments[i];
            var cx = InformeLayout.Margin + (i * (cardW + InformeLayout.GridGutter));

            canvas.RoundedRect(cx, y, cardW, cardH, InformeRadius.Card, fill: InformeColors.Cream);
            canvas.FillRect(cx, y, 4, cardH, instrument.Color);
            canvas.DrawText(instrument.Name, cx + 16, y + 16, new InformeTextStyle("Poppins-Bold", 13), InformeColors.Ink);
            canvas.DrawText(
                instrument.Label.ToUpperInvariant(),
                cx + 16,
                y + 36,
                new InformeTextStyle("Poppins-SemiBold", 8, Tracking: 0.5),
                instrument.Color);
            canvas.DrawTextBlock(instrument.Description, cx + 16, y + BodyTop, bodyW, bodyStyle, InformeColors.Body);
        }

        y += cardH + InformeSpacing.Xl;

        // ── Left column: contents ────────────────────────────────────────────────────────────────
        var halfW = InformeLayout.GridHalf;
        var folioX = InformeLayout.Margin + halfW - FolioW;
        var pendingX = InformeLayout.Margin + halfW - PendingW;

        canvas.DrawText(T("section.indice.kicker"), InformeLayout.Margin, y, InformeType.H3, InformeColors.Ink);

        var ly = y + 22;
        var anchors = new List<TocAnchor>();
        var partStyle = new InformeTextStyle("Poppins-SemiBold", 8.5, Tracking: 1);
        var entryStyle = new InformeTextStyle("Poppins-Medium", 9.5);
        var pendingStyle = new InformeTextStyle("Poppins-Medium", 8.5);

        foreach (var entry in entries)
        {
            if (entry.Level == 0)
            {
                ly += 4;
                canvas.DrawText(entry.Title, InformeLayout.Margin, ly, partStyle, entry.Pending ? InformeColors.Grey : InformeColors.Teal);
                if (entry.Pending)
                {
                    canvas.DrawTextBlock(T("toc.pending"), pendingX, ly, PendingW, pendingStyle, InformeColors.Grey, TextAlign.Right);
                }

                anchors.Add(new TocAnchor(entry.Id, ly, folioX, FolioW, entry.Level, entry.Pending));
                ly += 22;
                continue;
            }

            var titleW = halfW - FolioW - 10;
            var titleH = canvas.Measure(entry.Title, titleW, entryStyle);
            canvas.DrawTextBlock(entry.Title, InformeLayout.Margin, ly, titleW, entryStyle, entry.Pending ? InformeColors.Grey : InformeColors.Ink);
            if (entry.Pending)
            {
                canvas.DrawTextBlock(T("toc.pending"), pendingX, ly + 1, PendingW, pendingStyle, InformeColors.Grey, TextAlign.Right);
            }

            anchors.Add(new TocAnchor(entry.Id, ly, folioX, FolioW, entry.Level, entry.Pending));

            // A hairline per row instead of a dotted leader.
            canvas.Line(InformeLayout.Margin, ly + titleH + 4, InformeLayout.Margin + halfW, ly + titleH + 4, InformeColors.Line, InformeStroke.Hair);
            ly += titleH + 9;
        }

        var leftBottom = ly;

        // ── Right column: how it is built, how to read it ────────────────────────────────────────
        var rx = InformeLayout.Margin + halfW + InformeLayout.GridGutter;
        var panelW = halfW - 36;
        var recTitle = L("Cómo se construyen tus recomendaciones", "How your recommendations are built");
        var recBody = L(
            "Tu perfil completo alimenta un motor de coincidencia que pondera personalidad (PCA), capacidad cognitiva (MIL), intereses y motivadores. Las carreras se puntúan de 0 a 100; las universidades se evalúan por ajuste académico, programa, preferencias, presupuesto y resultados. Una inteligencia artificial añade una interpretación personalizada a cada coincidencia.",
            "Your complete profile feeds a matching engine that weights personality (PCA), cognitive ability (MIL), interests and motivators. Careers are scored 0–100; universities are evaluated by academic fit, programme, preferences, budget and outcomes. AI adds a personalised interpretation to each match.");

        var recTitleStyle = InformeType.H2;
        var recBodyStyle = new InformeTextStyle("Poppins-Regular", 9, LineGap: 2.5);
        var recTitleH = canvas.Measure(recTitle, panelW, recTitleStyle);
        var recBodyH = canvas.Measure(recBody, panelW, recBodyStyle);
        var recH = 16 + recTitleH + 6 + recBodyH + 18;

        canvas.RoundedRect(rx, y, halfW, recH, InformeRadius.Card, fill: InformeColors.Teal);
        canvas.DrawTextBlock(recTitle, rx + 18, y + 16, panelW, recTitleStyle, InformeColors.White);
        canvas.DrawTextBlock(recBody, rx + 18, y + 16 + recTitleH + 6, panelW, recBodyStyle, InformeColors.OnTeal);

        var by = y + recH + InformeSpacing.Lg;
        canvas.DrawText(L("Cómo leer este informe", "How to read this report"), rx, by, InformeType.H3, InformeColors.Ink);
        by += 22;

        // The middle bullet once explained an "N/D" the document no longer prints, and described absent
        // data as a figure — the confusion the empty-state grammar exists to remove.
        var bullets = L(
            "Los porcentajes y las barras reflejan datos reales de tus evaluaciones.|Las tarjetas con borde punteado y el signo — marcan evaluaciones pendientes, no resultados de cero.|El informe se actualiza a medida que completas tus evaluaciones.",
            "Percentages and bars reflect real data from your assessments.|Dashed cards and an — mark pending assessments, not results of zero.|The report updates as you complete your assessments.")
            .Split('|');

        var bulletStyle = new InformeTextStyle("Poppins-Regular", 9, LineGap: 2);
        foreach (var bullet in bullets)
        {
            canvas.FillCircle(rx + 4, by + 5, 2.5, InformeColors.Yellow);
            by += canvas.DrawTextBlock(bullet, rx + 14, by, halfW - 14, bulletStyle, InformeColors.Body) + 6;
        }

        return new FrontPageResult(anchors, Math.Max(leftBottom, by));
    }

    private sealed record Instrument(string Name, string Label, string Color, string Description);

    private static IReadOnlyList<Instrument> Instruments(Func<string, string, string> L) =>
    [
        new(
            "PCA",
            L("Personalidad", "Personality"),
            InformeColors.Teal,
            L("Mide tu estilo de comportamiento en 4 dimensiones (D·I·S·C) a través de 3 contextos: adaptación laboral, conducta bajo presión e imagen propia.",
              "Measures your behavioural style in 4 dimensions (D·I·S·C) across 3 contexts: work adaptation, behaviour under pressure and self-image.")),
        new(
            "MIL",
            L("Inteligencia Laboral", "Labor Intelligence"),
            InformeColors.Navy,
            L("Evalúa 5 dominios cognitivos — razonamiento, detección, capacidad numérica, memoria y orientación — con precisión y velocidad.",
              "Evaluates 5 cognitive domains — reasoning, detection, numerical ability, memory and orientation — by precision and speed.")),
        new(
            "360°",
            L("Cómo te ven", "How others see you"),
            InformeColors.TealDeep,
            L("Recoge la valoración de personas a tu alrededor en competencias clave, contrastando tu autopercepción con la de los demás.",
              "Gathers ratings from people around you on key competences, contrasting your self-perception with theirs.")),
    ];
}
