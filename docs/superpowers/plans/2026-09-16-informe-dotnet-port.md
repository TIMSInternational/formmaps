# Career & University Informe — .NET port plan

**Date:** 2026-09-16
**Status:** Slice 0 landed (pure layer + tests); renderer choice pending Federico
**Branch:** `feat/informe-dotnet-port`
**Design reference:** `docs/superpowers/specs/2026-09-16-informe-design-spec-v2.md` (renderer-agnostic; §7 is the page architecture and colour rule)
**Legacy source:** `tafurfede/formmaps-platform` `api/src/services/informe/` (PR #352, in production from 2026-09-16)

## Why a port

The informe generator is TypeScript + pdfkit and lives only in the legacy repo, which is
still deployed but is not where the company builds: `services/api` here is the .NET 10
solution with the CareerFit engine, the assessment readers and the RLS-scoped data access
the document must be assembled from. Federico decided the port on 2026-09-15. The design
was finished in TypeScript first so the port inherits a settled document, not a moving one.

## What must survive the port (the thinking, not the pdfkit code)

1. **Absence is representable in the view model** (`InformeViewModel.cs`): nullable
   academics / disc / competences / factor scores, and `InformeCoverage` as the one place
   that answers "was this measured?". Four states: MEASURED · ABSENT · PARTIAL · UNAVAILABLE.
   Nothing downstream may infer absence from a zero. (Legacy defect: "todas tus competencias
   están en un buen nivel" printed over zero competencies.)
2. **The empty-state grammar**: white + 1pt dashed `[3,3]`, the em dash, the pending ring.
   Never `0`, never `N/D`. Cream carries no meaning.
3. **One band vocabulary**, 34/67, drawn on every chart (`Bands.cs`).
4. **Colour meaning**: red/amber/green are VALUE only; identity from the brand series
   (`InformeTheme.cs`, `InformeChart.Disc`).
5. **Engine prose reads** (`EngineProse.cs`): humanize, engineParagraphs, teaser, splitBridging.
6. **The containment invariant as a test**: every text run fits the innermost box it was drawn
   into; no two container boxes on a page overlap; nothing crosses the page bounds. In the
   legacy renderer this is a recorder patched onto `PDFDocument.prototype`. The .NET equivalent
   depends on the renderer chosen (below) and is the first thing to build after it.
7. **Page architecture** (spec §7): standard · banner (resumen) · bleed chart (PCA, MIL) ·
   divider with a map · the merged front page; balanced card pagination; the recommendation
   panel breaking between paragraphs; running kickers.
8. **Ink floors** measured, never padded to: 0.62 of the usable box, 0.40 on a part-closing page.

## Slices

### Slice 0 — pure layer (this branch, done)
- `FormMaps.Application/Informe/InformeViewModel.cs` — the typed contract, presence model included.
- `Bands.cs`, `EngineProse.cs`, `InformeLabels.cs` (+ `Data/informe-labels.es-en.json`, 207 keys,
  exported verbatim from the legacy `theme.ts`), `InformeInterpret.cs` (+ `Data/interpret.es-en.json`),
  `InformeTheme.cs` (every token, exported verbatim).
- `tests/FormMaps.UnitTests/Informe/*` — the legacy `humanize.test.ts` cases byte for byte, label
  parity, band thresholds, interpret lookups.
- No PDF dependency yet.

### Slice 1 — renderer choice + layout core (needs a decision)
Two candidates. Both run on App Runner Linux x64.

| | QuestPDF | PDFsharp 6 |
|---|---|---|
| model | declarative fluent layout; containers, auto-pagination, `Layers`, `Background` — banner and bleed bands are one call | imperative, pdfkit-like: `XGraphics.DrawString` at (x, y), `MeasureString` |
| overflow | throws `DocumentLayoutException` when content cannot fit — the no-overflow invariant becomes a construction property | nothing; the invariant must be re-asserted by a recorder (as today) |
| containment test | wrap the fluent API in a recorder that logs container rectangles + text runs from the rendered output (QuestPDF exposes `Element` trees; or assert on the PDF's content stream via PdfPig) | the legacy recorder ports 1:1: wrap `XGraphics` and log every `DrawRectangle`/`DrawString` |
| port cost | rewrite the sections in the fluent model (≈ 2–3 weeks); measure-and-fit disappears | transliterate the sections (≈ 1–2 weeks); every `measure`/`textBlock` call maps directly |
| fonts | `FontManager.RegisterFont` (Poppins TTF, OFL) | `XFont` via a font resolver (Poppins TTF) |
| licence | **Community MIT-like licence only for companies under USD 1M annual gross revenue; otherwise Professional/Enterprise (paid)** — must be confirmed for TIMS International before adding the package | MIT |
| natives | bundles SkiaSharp natives (Linux x64 fine; needs `libfontconfig1` in the image) | pure managed |

Recommendation: **QuestPDF if the licence condition holds** — the page shapes of §7 are what its
model does natively and overflow becomes impossible by construction; otherwise **PDFsharp** and a
1:1 transliteration. Either way Slice 1 delivers: font registration, `LayoutMath` (grid, spacing,
line height RE-MEASURED for the chosen engine), the containment recorder + its three self-checks
(the detector must fail on a deliberately overflowing card and a deliberate collision, and not fire
on a chip nested in a panel), and the cover + front page rendered from a fixture.

### Slice 2 — sections
Port order follows the legacy render order: resumen (banner, paragraph-breaking panel) · dividers
with maps · disc (bleed + captions) · estilo · personality · lia (bleed) · competencias (level board,
coverage bar, pending panel) · threeSixty · intereses · carrerasMetodologia (instrument flow, not a
donut, from `InformeScoring`) · carreras (balanced cards, shared suggestion once) · universidades
(balanced) + tabla (a block of the same section) · plan · glosario. Golden test per section on a
max-length fixture; `structure` test asserting each page shape from the recorded draws; the two
real-student fixtures reproduced as fictional equivalents (never real data in the repo).

### Slice 3 — assembler (the reason the port exists)
`IInformeAssembler.BuildAsync(RequestContext, userId, lang)` under the caller's RLS session, reading
the SAME sources the dashboard reads: `ICareerFitInputReader` (PCA disc + competences, LIA
percentiles, personality), the CareerFit run (`OwnerEvaluation` → `InformeCareer`: `CareerFitAbsolute`
is the score, `CompetencyGate`/`ConvergenceLevel` become the prose the engine writes, `CriticalGaps`
become `BridgingReasons`), the 360 aggregate, academics, universities. Produces `InformeCoverage`
honestly — a missing instrument is ABSENT, not zero — and `InformeScoring` with `Weight = null`
(CareerFit publishes no fixed weights; the methodology page draws the instrument flow).
Endpoint: `GET /api/v1/career-informe/{userId}/pdf?lang=es|en` behind `IUserAccessGuard`
(uniform 404), completion-gated (409), `application/pdf`, dark behind a `FORMMAPS_ROUTE_*` flag
like the other ported routes.

### Slice 4 — delivery
`informe_deliveries` ledger keyed by `(userId, assessmentFingerprint, channel)`, sweep + drain in
`FormMaps.Workers`, SES raw-MIME attachment via the existing `AWSSDK.SimpleEmailV2` rail. Same
design as the 2026-06-30 spec §4–§5; nothing here depends on the renderer.

## Cutover
The legacy route keeps serving until Slice 3's endpoint renders both fictional fixtures with zero
containment violations and the page counts match the legacy document for the same view model
(Sara-shaped 14pp, Tomás-shaped 13pp, complete 20pp). Then flip the route flag, watch, and retire
the pdfkit renderer.
