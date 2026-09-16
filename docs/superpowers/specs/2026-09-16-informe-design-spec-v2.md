# FormMaps Informe — visual design direction (implementable spec)

Scope: `formmaps-platform/api/src/services/informe/` (pdfkit, A4, MARGIN 48, CONTENT_W 499.28, BOTTOM 801.89, footer bar 28pt).
Evidence: `Informe FormMaps - Sara Decarlini.pdf` (22 pp, DISC + MIL + 13/24 competencies; no Personality/360/academics/universities) and `Informe FormMaps - Tomas Uribe.pdf` (20 pp, DISC + MIL only; no careers at all).

Page numbers below are **footer numbers** (the number printed bottom-right). Physical page = footer + 1 (cover) + number of dividers before it. The parent's PNGs were named by physical index: `p4-04.png` = footer 3 (resumen), `p6-06.png` = footer 4 (PCA), … `p14-14.png` = footer 11 (metodología), `p15-15.png` = footer 12 (carreras).

Measured facts this spec relies on (verified with pdfkit + the embedded Poppins):

| fact | value |
|---|---|
| Poppins line height in pdfkit | `1.5 × size + lineGap` (8.5 → 12.75; 9 → 13.5; 9.5 → 14.25; 10.5 → 15.75; 13 → 19.5; 17 → 25.5) |
| Existing half-card width `CONTENT_W/2 − 6` | 243.64 — already equals 3 columns of a 6-col / 12pt-gutter grid (col = 73.213) |
| MIL domain description length | 202–278 chars → 3 lines at 8.5pt across 475pt; the current one-line clamp shows ~45 chars |
| Source of the `0` tiles | `assemble.ts` replaces a null `AcademicsSnapshot` with a zero-filled object; `interestsScore`/`motivatorsScore` are `Number(… ?? 0)` |
| Quadrant mapping | `px = D/100, py = I/100` — unrelated to the ACTIVO/REFLEXIVO/PERSONAS/TAREAS labels it draws |
| 360 "Tú" marker | drawn at the same x as "Otros" (the VM has one score per category) — a fake second series |

Diagnosis in one sentence: the renderer treats "one section = one page" and "absent = zero", so it produces (a) top-packed pages with a blank lower third whenever a section is short, (b) orphan pages when a section is slightly too long, and (c) measured-looking zeros for data that was never collected.

---

## 1. Density & composition system

### 1.1 Page geometry (unchanged constants, named)

```
PAGE_W 595.28   PAGE_H 841.89   MARGIN 48   CONTENT_W 499.28
TOP_BAR 4 (teal)        FOOTER_BAR 28 (navy, y 813.89..841.89)
BOTTOM 801.89           ← content may touch this line, never cross it
```

Header block on a section-opening page (existing, keep): yellow tab `rect(48, 50, 4, 20)`; kicker at y 49 (8.5 SemiBold teal, tracking 1.2); title at y 59 (17 Bold, width CONTENT_W − 90); sub at y 88 (9.5 Regular, lineGap 2.5, width CONTENT_W − 80); spot illustration 60×60 at (PAGE_W − MARGIN − 66, 34).

```
Y0_OPEN = 88 + measure(sub, {width: CONTENT_W-80, size 9.5, lineGap 2.5}) + 16
          → 120.75 with a 1-line sub, 137.5 with a 2-line sub   (was +12; use 16)
Y0_CONT = 48            ← continuation pages (no header)
H_OPEN  = BOTTOM − Y0_OPEN   ≈ 664–681
H_CONT  = BOTTOM − 48        = 753.89
```

Continuation pages get a running kicker so they are never anonymous: `"PARTE 1 · TU PERFIL  —  Competencias (cont.)"` 7 SemiBold C.grey at (MARGIN, 30), tracking 0.8.

### 1.2 Column grid

6 columns, 12pt gutter. `col = (499.28 − 5×12) / 6 = 73.213`.

| span | width | use |
|---|---|---|
| 6 | 499.28 | full-width panels, section rules |
| 3 + 3 | 243.64 each | 2-up cards (matches today's `halfW`) |
| 2 + 2 + 2 | 158.43 each | 3-up motivator / instrument cards |
| 4 + 2 | 328.85 / 158.43 | chart + side column (MIL, quadrant + legend) |
| 4-col mode | (499.28 − 36)/4 = 115.82 | KPI tiles, competency level board |

Never use ad-hoc widths like `CONTENT_W − 190`, `MARGIN + 236`; all x positions are `MARGIN + n×(73.213 + 12)`.

### 1.3 Spacing scale and vertical rhythm

Replace `SP` with an 8-based scale (4 allowed only inside a component):

```
SP.xxs 2   SP.xs 4   SP.sm 8   SP.md 12   SP.lg 16   SP.xl 24   SP.xxl 32   SP.xxxl 48
```

Rules (in pt):

| relation | gap |
|---|---|
| header → first block | 16 |
| H2/H3 → its block | 8 (H3) / 12 (H2) |
| card → card in a stack | 12 (today 10 — normalise) |
| cards side by side | 12 (gutter) |
| block → block inside a section | 16 |
| sub-section → sub-section | 24 |
| section → next section **on the same page** | 32, with a *section rule* (see 1.5) |
| inside a card: pad | 16 (panels), 12 (tiles), 8×5 (chips) |
| inside a card: title → body | 6 |

Card anatomy (one system, no exceptions):

| kind | radius | fill | stroke | left accent |
|---|---|---|---|---|
| panel (≥ 240 wide) | 12 | cream | none | 4pt, only when the panel is *measured content with a series colour* (DISC style blocks, plan horizons) |
| white panel (universities) | 12 | white | 1pt C.line | none; keep the 3pt yellow top rule |
| tile (KPI, academic) | 8 | cream | none | none |
| chip / row | 6 | cream | none | none |
| pill | h/2 | tint | none / 1pt | — |
| **empty** (any size) | same as its measured twin | **white** | **1pt dashed [3,3] C.line** | **none** |

Type scale (everything already used, now named — see tokens §5):

```
kicker  8.5 SemiBold teal  tracking 1.2       h1 17 Bold (25.5)
h2      11  SemiBold ink (16.5)               h3 10.5 SemiBold ink (15.75)
body    9.5 Regular body  lineGap 2.5 (16.75) small 8.7 Regular lineGap 2 (15.05)
caption 7.5 Regular/Medium grey (11.25)       micro 6.8 SemiBold (10.2)
stat    15 Bold teal   ring 16 Bold ink       display 28 Bold (42)
```

### 1.4 Flow model — sections become blocks, a paginator places them

This is the structural change; everything else in this document assumes it. Sections stop calling `newPage()`; they return a `SectionSpec` and a paginator in `layout.ts` places it.

```ts
interface Block {
  h: number;                     // measured height (pt), includes internal padding, excludes trailing gap
  draw: (y: number) => void;     // must draw inside [y, y + h); receives the y the paginator chose
  keepWithNext?: boolean;        // headings: never the last thing on a page
  priority?: 1 | 2 | 3;          // 1 = data, 2 = interpretation, 3 = filler (droppable)
  rows?: { items: Block[]; minRows: number };  // breakable list; a fragment holds ≥ minRows
}
interface SectionSpec {
  id: string;                    // "disc" | "estilo" | … (also the TOC key)
  part: 1 | 2 | 3 | 4 | 0;
  measured: boolean;             // false → render only its empty-state card (see §2)
  header: Block;                 // kicker + title + sub, keepWithNext = true
  blocks: Block[];
  ownPage: "always" | "auto";
}
```

Placement algorithm (`placeSection`), executed in `render.ts` order:

1. `total = header.h + Σ blocks.h + 16 × (blocks.length)`.
2. Start a **new page** if any of: `ownPage === "always"`; `total ≥ 0.60 × H_OPEN` (≈ 400pt); the section is the first after a divider; remaining space on the current page `< header.h + blocks[0].h + 24`.
   Otherwise **flow**: advance 32, draw a *section rule*, draw the header at the current y (kicker/title/sub keep their relative offsets: kicker y, title y+10, sub y+39).
3. Place blocks top-down. When `y + b.h > BOTTOM`:
   - `priority === 3` → **drop the block** (never paginate filler);
   - `rows` → emit as many rows as fit (≥ `minRows`, else none), new page, continue;
   - else → new page (Y0_CONT = 48, running kicker), then draw.
   `keepWithNext` blocks are placed only if the following block (or its first `minRows` rows) also fits.
4. After every placement record `pageInk[pageIndex] = max(pageInk, y + b.h)`. This is the density metric (1.6).

Section rule (drawn between two sections sharing a page): hairline `0.6pt C.line` across CONTENT_W at y, nothing else. The yellow tab + kicker of the next header is enough signal.

### 1.5 Which sections earn their own page (with the two fixtures)

| section | ownPage | typical h | Sara | Tomas |
|---|---|---|---|---|
| resumen | always | 620–700 | page | page |
| disc (PCA) | auto → ≥ 400 → own | ~700 | page | page |
| estilo | auto → own | ~700 | page | page |
| personality | auto | ~420 | absent | absent |
| lia (MIL) | auto → own | ~770 | page | page |
| competencias | auto → own when present | ~560 | page (+ pending panel flows under, see p.7) | **absent** → its empty card flows under MIL |
| threeSixty | auto; when absent it is one row of the *pending panel* | 120–400 | absent | absent |
| intereses + académico | auto; absent → pending-panel row | 160–420 | absent | absent |
| carrerasMetodologia | auto | ~520 | page | page (engine did not score → see §4 p.11) |
| carreras | auto (rows: cards, minRows 1) | 5 cards ≈ 900 | 2 pages, second at ~45% → Part-3 stub flows under it | absent → empty card under metodología |
| universidades | auto (rows: cards) | 6 cards ≈ 700 | absent | absent |
| tabla | **never own page**; a block of `universidades` flowed after the cards | 26 + 7 + 34×n + 60 | absent | absent |
| plan | always | ~600 | page | page |
| glosario | auto → own | ~640 | page | page |

Divider rule: `insertDivider(part)` is called only if **at least one section of that part is measured**. Otherwise no divider, no pages; the part is represented by a *Part stub band* (§2.6) appended to the flow of the previous part, and by a grey "pendiente" entry in the TOC. For Sara and Tomas this deletes physical pages 17, 18, 19 (Part 3) outright.

### 1.6 Minimum ink coverage (acceptance metric, asserted in tests)

```
INK_FLOOR        = 0.62   → last ink bottom ≥ Y0 + 0.62 × (BOTTOM − Y0)   (≈ y 545 on an opening page, 515 on a continuation page)
PART_CLOSE_FLOOR = 0.40   → the last page before a divider / end of document may stop at 40%
```

The paginator does not pad to reach the floor — decorative fill is forbidden. The floor is met structurally by (a) flowing short sections, (b) letting long lists break, (c) dropping priority-3 filler. Add a test in `__tests__` that renders the two fixture VMs and asserts every page's `pageInk` is above the floor, that no page has `pageInk < 200` (orphan), and that the page count is ≤ 17 (Sara) / ≤ 14 (Tomas).

### 1.7 TOC and cover become two-pass

`bufferPages` is already on. Each header draw pushes `{ id, title, level, physicalPage, measured }` into `ctx.toc`. In the footer pass compute footer numbers, then `switchToPage(1)` and draw the index entries: measured → title ink + dotted leader + number; absent → title C.grey, no leader, right-aligned `pendiente` 8.5 Medium C.grey. The hard-coded page list in `indice.ts` goes away (it is already wrong: it says PCA is page 6; the footer says 4).

Cover instrument line: build from `vm.coverage` (§2.1): `"PCA · MIL · Competencias 13/24  ·  21 de octubre de 2024"` — only measured instruments are listed.

---

## 2. Empty-state design language

### 2.1 Data states — the view-model must carry them

Four states, and the renderer must be able to tell them apart from the VM alone:

| state | meaning | rendered as |
|---|---|---|
| MEASURED | instrument completed, value present (including a real 0) | normal component; a measured 0 draws as a 0 (bar = a 7pt dot at the origin, number "0") |
| ABSENT | instrument never completed | *reserved-space* component (white, dashed) — never a number |
| PARTIAL | instrument completed but a known subset is missing (13/24 competencies; 2 of 4 career factors) | measured components + a *coverage* indicator + per-item empty chips |
| UNAVAILABLE | engine refused to compute (Tomas: no career ranking) | reserved-space card with the engine's reason, never an empty ranking |

Changes to `types.ts` / `assemble.ts` (spec, not code):

```ts
academics: AcademicsSnapshot | null           // stop substituting zeros in assemble.ts
breakdown: { discScore: number | null; milScore: number | null; interestsScore: number | null; motivatorsScore: number | null }
threeSixty: { categories; evaluatorCount; selfCategories?: Record<string, number> } // selfCategories absent today → no "Tú" series
coverage: {                                   // NEW — single source of truth for presence
  pca:          { measured: boolean; date?: string }
  mil:          { measured: boolean; date?: string }
  competencias: { measured: boolean; done: number; total: number; notEvaluated?: string[] }
  personalidad: { measured: boolean }
  threeSixty:   { measured: boolean; evaluators: number }
  academico:    { measured: boolean }
  universidades:{ measured: boolean }
  careers:      { measured: boolean; reason?: string }   // false when the engine refused to rank
}
scoring?: { engine: "careerfit" | "legacy"; factors: { id; label; weight: number | null; measured: boolean }[] }
```

`measured` for 360 = `evaluatorCount > 0`; for competencias = `competences?.length > 0`; for académico = snapshot non-null AND at least one field non-null.

### 2.2 The three empty primitives (add to `layout.ts` / `charts-primitives.ts`)

**`pendingRing(cx, cy, r = 7)`** — the "not yet" glyph.
`circle(cx, cy, r).lineWidth(1.2).dash(2, {space: 2}).stroke(C.grey); undash(); circle(cx, cy, 1.6).fill(C.grey)`.

**`checkBadge(cx, cy, r = 7)`** — the "measured" glyph, used only in the instrument strip and coverage contexts.
`circle(cx, cy, r).fill(C.teal); path("M cx-3.4 cy L cx-1 cy+2.4 L cx+3.6 cy-2.6").lineWidth(1.5).lineCap("round").stroke(C.white)`.

**`emptyChip(x, y, label = "SIN MEDIR")`** — inline marker for an absent factor/series.
h 15, radius 7.5, white fill, 1pt solid C.line stroke, text 7.5 SemiBold C.grey, padding 7. Returns width.

### 2.3 Reserved-space card (`emptyCard`) — the section-level empty state

```
┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐   white fill, 1pt dashed [3,3] C.line, radius 12
   ◌  Pendiente de evaluar                                     ◌ = pendingRing at (x+16+7, y+16+7)
      Todavía nadie ha respondido tu evaluación 360°. Invita    title 10 SemiBold ink at x+40, y+16
      a 3–5 personas que te conozcan bien …                    body 9 Regular body, lineGap 2.5, width w−56, at y+16+15+6
      Cómo completarlo: en tu perfil → Evaluación 360°  →      cta 8.5 Medium teal (optional), 6 below body
└ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘   h = 16 + 15 + 6 + bodyH + (cta ? 6 + 12.75 : 0) + 16;  min 72
```

- No accent bar, no illustration inside, no cream. The dashed edge, the em dash and the pending ring are the signal; a reader sees "a place is held here". (Cream carries no meaning of its own: it is the panel surface for measured data and commentary alike — decided 2026-09-15, worklist B8.)
- Title is always the same two words (`empty.title`) so the pattern is learnable across the document. The body names the instrument, what it *would add*, and how to complete it. Never "0", never "N/D", never "sin datos".
- When a whole *section* is absent, its `SectionSpec.blocks = [emptyCard]` and its header is **not** drawn; instead the card carries the section name in its title: `"Evaluación 360° — pendiente de evaluar"`. This removes the "heading with nothing under it" failure (page 10).

### 2.4 Pending panel — three absent sections on one page must look intentional

When ≥ 2 consecutive sections of a part are absent (Sara: 360 + intereses/motivadores + académico), collapse them into **one** panel instead of three stacked cards:

```
┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐
  ◌  Pendiente de evaluar                              [ 3 EVALUACIONES ]     title 10 SemiBold; chip 7.5 SemiBold grey (white, 1pt line)
  ────────────────────────────────────────────────────────────────────── 0.6 C.line
  Evaluación 360°     Todavía nadie ha respondido …         Cómo completarlo   name 9 SemiBold ink w 120 | body 8.7/2 body | cta 8 Medium teal w 90 right
  ────────────────────────────────────────────────────────────────────── 
  Intereses y         Se derivan de la evaluación 360°;      Cómo completarlo
  motivadores         se completan automáticamente …
  ──────────────────────────────────────────────────────────────────────
  Perfil académico    No has registrado tu promedio, SAT/ACT, cursos …    Cómo completarlo
└ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘
```

Geometry: pad 16; body column x = x+16+120+12, width = w − 32 − 120 − 12 − 90 − 12 = 245.28 at full width; rowH = measure(body) + 12; h = 16 + 15 + 10 + Σ rowH + 16 (≈ 177 with three 2-line bodies). Priority 1, unbreakable. It flows under the last measured section of the part (for Sara: under competencias, see §4 p.7).

### 2.5 Empty states inside components

| component | measured | absent |
|---|---|---|
| KPI / academic tile | cream, value 15 Bold teal | white, dashed, value `—` 15 Bold C.grey. If **all** tiles in a group are absent, draw one `emptyCard` instead of the grid (page 10's 8 tiles → 1 card). |
| barRow | track C.line + fill | track only, drawn as a **dashed outline**: `roundedRect(x,y,w,h,h/2).lineWidth(0.8).dash(3,{space:3}).stroke(C.grey)`; value column `—` in C.grey; label in C.grey |
| career-card factor rows (PCA/LIA/Int./Mot.) | as today | dashed track + `—`; plus **one** factor legend under the section sub (not per card): four pills `PCA ✓  LIA ✓  Int. ◌  Mot. ◌` (h 15, radius 7.5, measured = teal fill/white text, absent = white/dashed/grey) and a 7.5 grey caption: `"Los factores sin medir no aportan puntos; por eso el índice es más bajo de lo que sería con el perfil completo."` |
| ring | as today | not drawn; the slot shows pendingRing r 12 centred with `—` 12 Bold grey below (used for the university #1 spotlight) |
| donut segment (metodología) | filled wedge | stroke-only wedge: same path, `lineWidth 1, dash [3,3], stroke C.grey`, legend row label grey + `emptyChip` |
| radar axis | vertex dot | not applicable to MIL (all-or-nothing); if ever partial: no vertex, spoke dashed |
| table row | as today | a row is never drawn for an absent university; an empty table is never drawn (page 15) |
| 360 "Tú" series | dumbbell only when `selfCategories` exists | remove the fake yellow marker and the "Tú" legend entry until self scores exist |

### 2.6 Part stub band (a whole part absent)

Replaces the Part-3 divider + 2 pages. Full width, h = 96, white, dashed, radius 12:

```
┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐
  [spot-universidades 44×44   PARTE 3 · UNIVERSIDADES                 kicker 7.5 SemiBold grey tracking 1
   at x+16,y+26, opacity .6]  Pendiente de evaluar                     title 10 SemiBold ink
                              Las universidades sugeridas necesitan tu perfil académico y tus preferencias.
                              Complétalos y esta parte se generará automáticamente.   body 8.7/2, width w−16−44−12−16
└ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘
```

`doc.opacity(0.6)` before `doc.image(...)`, `doc.opacity(1)` after. Priority 1, appended to the previous part's flow.

### 2.7 Instrument strip (resumen page) — the up-front contract with the reader

Six pills in one row directly under the resumen sub, so every later empty card has already been announced:

```
[✓ PCA · 18 oct 2024] [✓ MIL · 21 oct 2024] [✓ Competencias 13/24] [◌ Personalidad] [◌ 360°] [◌ Académico]
```

Pill: h 22, radius 11, padding 8/10; measured = teal fill, white 8 SemiBold text, checkBadge r 5 at left; absent = white, 1pt dashed C.line, grey text, pendingRing r 5. Wrap to a second row if the six widths + 6×8 gaps exceed CONTENT_W (they will in EN); row pitch 28. Below the strip a 7.5 grey caption: `"◌ = evaluación pendiente. Las secciones correspondientes aparecen con borde punteado."`

### 2.8 Copy (ES / EN) — add to `theme.ts` LABELS

```
"empty.title":            "Pendiente de evaluar"                         / "Not yet assessed"
"empty.chip":             "SIN MEDIR"                                    / "NOT MEASURED"
"empty.value":            "—"                                            / "—"
"empty.cta":              "Cómo completarlo"                             / "How to complete it"
"empty.count":            "{n} evaluaciones"                             / "{n} assessments"
"empty.pca.body":         "Aún no has completado el PCA. Cuando lo hagas, aquí verás tu estilo de comportamiento en cuatro dimensiones y tres contextos."
"empty.mil.body":         "Aún no has completado la Medición de Inteligencia Laboral. Añade cinco dominios cognitivos a tu perfil y activa el factor LIA en cada carrera."
"empty.competencias.body":"Tu PCA no incluyó la evaluación de competencias. Un PCA completo añade 24 competencias en escala 1–4 y activa la puerta competencial de cada carrera."
"empty.personalidad.body":"Todavía no has completado la evaluación de personalidad. Es un complemento, no un requisito: añade una señal más a tu perfil."
"empty.threeSixty.body":  "Todavía nadie ha respondido tu evaluación 360°. Invita a 3–5 personas que te conozcan bien (docentes, familia, compañeros) para ver cómo te perciben."
"empty.intereses.body":   "Tus intereses y motivadores se derivan de la evaluación 360°. Se completan automáticamente cuando recibas respuestas."
"empty.academico.body":   "No has registrado tu historial académico (promedio, SAT/ACT, cursos y actividades). Añádelo en tu perfil para activar el ajuste universitario."
"empty.universidades.body":"Las universidades sugeridas necesitan tu perfil académico y tus preferencias. Complétalos y esta parte se generará automáticamente."
"empty.careers.body":     "Con los datos actuales el motor prefiere no ordenar carreras: las diferencias serían azar, no medición. {reason}"
"coverage.of":            "{done} de {total} competencias evaluadas"
"coverage.notEvaluated":  "{n} competencias del catálogo no se evaluaron en este PCA"
"factors.note":           "Los factores sin medir no aportan puntos; por eso el índice es más bajo de lo que sería con el perfil completo."
"part.pending":           "Pendiente de evaluar"
"toc.pending":            "pendiente"
"strip.caption":          "◌ = evaluación pendiente. Las secciones correspondientes aparecen con borde punteado."
```

Also change the intro bullet `"Las cifras N/D indican información aún no disponible."` → `"Las tarjetas con borde punteado y el signo — marcan evaluaciones pendientes, no resultados de cero."` and delete every remaining `"N/D"` literal (resumen.ts ×3, disc.ts, intereses.ts).

---

## 3. Better graphics (pdfkit primitives only)

Common upgrades applied everywhere first:

- **Band ticks.** Every 0–100 track gets two 1pt C.grid ticks at 34% and 67% (from y−2 to y+h+2). One glance tells Baja/Media/Alta. New primitive `bandBar(x, y, w, v, color, h = 6, marker = true)`: track + ticks + fill + optional marker (`circle r = h×0.75, white fill, 1.5 stroke color`).
- **Band chip.** `bandChip(x, y, band)` → `Alta`/`Media`/`Baja`, h 13, radius 6.5, tint bg (`greenSoft/amberSoft/redSoft`), 7 SemiBold text in the band colour.
- **Ring.** Stroke 6 (was 7), radius 28 on cards / 34 hero; number 16 Bold ink; add `/100` 6.5 Regular grey 2pt under the number; two 2pt ticks on the track at 34 and 67 (`lineWidth 1, C.white` over the track so they read as notches).
- **Series opacity.** Secondary series use `fillOpacity(0.55)`; never a second colour ramp.

### 3.1 DISC grouped bars → grouped bars v2 (keep the form, fix the resolution)

Weak today: 64pt max height flattens 25 vs 21; no scale; the three contexts look equal though only *Conducta bajo presión* drives matching.

Panel `CONTENT_W × 200`, cream, radius 12. Inner x from `MARGIN+16`, width 467.28; three groups of 155.76.

```
y+16   group title 8.5 Medium body           primary group: title + chip "PERFIL BASE" (6.5 SemiBold navy on yellow, h 12, r 6, pad 5, 6pt after title)
y+44   top of value labels                   gridlines: v=34 → y+165−37.4 ; v=67 → y+165−73.7  (0.6pt C.grid, dash 2/2)
y+55   bar top at v=100                      "34" / "67" 6.5 grey right-aligned in 14pt at MARGIN+8 (first group only)
y+165  baseline (1pt C.line across inner width)
y+169  D I S C letters 7.5 SemiBold in series colour
```

Bars: w 22, gap 10, cluster width 118, cluster x = `gx + (155.76 − 118)/2`; `bh = v/100 × 110`; radius 3; value 7.5 Bold ink centred at `baseline − bh − 11`. Non-primary groups draw bars with `fillOpacity(0.55)` and value labels in C.body. Colours: D red, I yellow, S green, C teal (existing).

### 3.2 DISC dimension cards → band bar + marker

Replace the icon + paragraph pair with: icon 28 · title `Dominancia — 25` (10 SemiBold) · bandChip right · `bandBar` 6pt across the inner width with a marker at v · paragraph (8.7/2). Card 243.64 wide, h = 66 + measure(text, 211.64) + 16 (≈ 157). The marker + ticks make "25 is Baja, 87 is Alta" visible without reading.

### 3.3 MIL radar → keep, resize, stop duplicating

Weak today: r 78 with wrapped labels, plus five bars that repeat the same five numbers, plus a one-line clamped description that discards 80% of the copy, plus an "Interpretación" that duplicates page 3.

Chart block h 216 (unbreakable):

- Radar `cx = MARGIN + 120, cy = y + 108, r = 80`. Rings at 34 and 67 only (0.8pt C.grid solid), outer ring 0.6 C.line; spokes 0.6 C.line. Polygon: `fillOpacity 0.18 teal` **plus** `lineWidth 1.5 stroke teal`; vertices r 3. Labels at `r + 16`: name 7.5 Medium body, score 8.5 Bold teal on the next line (2-line label block, width 64, centred).
- Right column x = `MARGIN + 4×73.213 + 4×12 = 388.85`… use span 4+2: chart column 328.85, side column x = `MARGIN + 340.85`, width 158.43. Composite ring r 34 stroke 6 at (x + 40, y + 52) with `72` 18 Bold, `MIL COMPUESTO` 6.5 caption below, bandChip under; then a **data-driven** 3-sentence summary 8.7/2 in width 158.43 starting y + 104: `"Tu dominio más alto es Detección (96) y el más bajo, Numérico (55). Tu compuesto, 72, está en la banda Alta."` (template `mil.summary` with the two extremes + composite band — replaces the duplicated `profileSummary`).
- Legend line at y + 200: three 5pt dots + `Alta ≥ 67 · Media 34–66 · Baja < 34` 7.5 grey.

Domain rows (breakable, minRows 2) at y + 216 + 20, full width:

```
[icon 15]  Razonamiento  [Alta]                                        73     name 9.5 Medium ink at x+24; bandChip after the name; score 9.5 Bold teal right (w 28)
           ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬|▬▬▬▬▬▬▬|▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬                 bandBar at (x+24, ry+17, w−24−40, 5) no marker
           Tu capacidad de razonamiento es sobresaliente. Resuelves problemas… (full text, 3 lines)   8.5 Regular body, lineGap 1, width w−24, at ry+28
rowH = 28 + measure(desc, 8.5/1, w−24) + 10   (≈ 79 for 3 lines)
```

No clamp. Five rows ≈ 396; page total ≈ 138 + 216 + 20 + 396 = 770 < 801.89.

### 3.4 Competency pip rows → level board

Weak today: 13 cards × 46pt spend a page on one bit per card; four level colours make the grid a traffic light; the count "2/4" repeats the pips; the 14th slot orphans.

```
13 de 24 competencias evaluadas            ▮▮▮▮▮▮▮▮▮▮▮▮▮▯▯▯▯▯▯▯▯▯▯▯   coverage row h 24: text 9 Medium ink; coverageBar 200×6 right-aligned (segments: teal r1 filled; remaining 0.8 dashed grey outline; gap 2)

┌ Fortaleza (4) ─1┐ ┌ Sólida (3) ────5┐ ┌ En desarrollo (2) 4┐ ┌ Inicial (1) ────4┐   column header h 30: 4pt top bar in level colour, name 8 SemiBold ink, count 8 Bold colour right
│ Trabajo en Equipo│ │ Empatía          │ │ Comunicación        │ │ Orient. al Cliente │   chips: cream r6, 8.5 Medium ink, h = measure(name, colW−16) + 10, gap 6
│                  │ │ Búsq. de Inform. │ │ Relaciones Interp.  │ │ Admin. de Proyectos│
│                  │ │ Perseverancia    │ │ Capacidad de Escucha│ │ Pensamiento Anal.  │
│                  │ │ Tacto/Diplomacia │ │ Atención al Detalle │ │ Orden, Calidad …   │
└──────────────────┘ └──────────────────┘ └─────────────────────┘ └────────────────────┘
◌ 11 competencias del catálogo no se evaluaron en este PCA                            caption 8.5 grey (or dashed hollow chips if names are known, flow-wrapped, gap 6)
```

Four columns of 115.82 with 12 gutters. Level colours stay (4 green, 3 teal, 2 amber, 1 red) but **only** on the column header bar; chips are cream/ink. Board h = 30 + 8 + max(stack) + 8. Distribution is readable at a glance; the pips are gone.

"Ya destacas en / Para desarrollar" panels: list only level-4 names (fallback level-3) and level-1 names (fallback level-2), max 4 each, then the interpretation sentence. This stops the 8-name run-on.

### 3.5 Quadrant → DISC style map v2

Weak today: `px = D/100, py = I/100` does not encode the axes it labels; single dot; 210×150 is not square so the diagonal styles are distorted.

Square 220×220, cream r 12, plot inset 18 (plot 184×184). Solid 1pt C.grid crosshair. Mapping from a DiscGraph `{d,i,s,c}`:

```
tx = ((d + c) − (i + s)) / 200      // −1 Personas … +1 Tareas
ty = ((d + i) − (s + c)) / 200      // −1 Reflexivo … +1 Activo
px = (tx + 1) / 2 ;  py = (ty + 1) / 2 ;  X = x + 18 + px × 184 ;  Y = y + 18 + (1 − py) × 184
```

Corner labels 6.5 SemiBold grey: TL `Activo · Personas (I)`, TR `Activo · Tareas (D)`, BL `Reflexivo · Personas (S)`, BR `Reflexivo · Tareas (C)`; axis words ACTIVO / REFLEXIVO / PERSONAS / TAREAS as today. Plot all three contexts: `underPressure` = filled teal r 6 with yellow ring r 10 (primary); `workAdaptation` = hollow circle r 5 stroke 1.5 teal; `selfImage` = hollow diamond 10pt stroke 1.5 navy; hairlines 0.8 C.grid from primary to each other marker. Legend (three glyphs + context names, 8 Medium) in the side column, then a data-driven sentence: `"Bajo presión te ubicas en la zona Reflexivo · {Tareas|Personas|equilibrada}: tus dimensiones más altas son Cumplimiento (87) y Estabilidad (68)."`

Sara's primary (25, 50, 68, 87) → px 0.485, py 0.30: lower-centre, which is what her profile says.

### 3.6 Career and university cards

Keep the layout; apply §2.5 (absent factors dashed + `—`, one factor legend per section), ring v2, and print the confidence chip from `cr.confidence` (the VM field) rather than re-deriving a band from `totalScore` (today `bandInfo()` ignores `confidence`).

### 3.7 Comparison table → heat cells

Weak today: 4pt mini bars under each number are too small to compare. Replace each numeric cell (cols 3–6) with a **heat cell**: `roundedRect(cx+4, ry−2, colW−8, 24, 4)` filled with the band tint (`greenSoft/amberSoft/redSoft` by 34/67), number 9 SemiBold in the band colour centred. Match column stays 10 Bold teal. Row pitch 34 unchanged. A table with 0 rows is never drawn.

### 3.8 Methodology donut → data-driven, or an instrument-flow diagram

The donut must take `vm.scoring.factors`. Segment `weight` present → filled wedge as today; factor `measured === false` → stroke-only dashed wedge (§2.5) and a grey legend row with `emptyChip`. Centre: `Σ measured weights` + `"% del modelo medido"` 6.5 grey (e.g. `75%`), not a hard-coded `100 PUNTOS`.

If `scoring.factors[*].weight` is null (CareerFit does not expose fixed weights), draw the **instrument-flow** instead, same 170pt panel:

```
[✓ PCA]  [✓ MIL]  [◌ Intereses]  [◌ Motivadores]   ──▶   ( 0–100 )   ──▶   "Puerta competencial" chip
four pills (h 22, r 11, measured/absent styles)        chevron: path "M x y-5 L x+6 y L x y+5" 1.5 teal    ring r 26 track-only with "0–100" 9 Bold
```

with a 8.7/2 explanatory paragraph beneath (from `interpret.methodologyCopy`, which must also drop the 40/35/15/10 sentence for CareerFit). This fixes brief item F by construction: the page can only describe factors the VM says were used.

### 3.9 360 chart

Until `selfCategories` exists: one series. Rows h 34 (was 40): label 9.5 Medium ink; `bandBar` 8pt (0–5 mapped ×20) with marker; value `x.x` 9 Bold teal right. Evaluator count moves into the header as a chip `n = 4 evaluadores` (teal pill). When self scores arrive: dumbbell — hollow yellow circle at self, filled teal at others, 1pt C.grid connector, legend `Tú / Otros` restored.

---

## 4. Per-page redesign (footer numbers; `pN.png` = physical)

Each entry: contents → arrangement (y budget with a 2-line sub, Y0 = 138) → absent behaviour.

### p.3 resumen (`p4-04.png`) — not in the brief's list but it is where the empty-state contract starts

Contents: header · **instrument strip** (§2.7) · 4 KPI tiles · #1 career + #1 university spotlights · Recomendación principal.

```
138  instrument strip (22, +6 caption 11) → 177
193  KPI tiles 2×2, 243.64 × 54, gutter 12 → 311
     tile values: "Dominancia 25 · Cumplimiento 87" | "72" | "—" (dashed tile) | "Psicología · 41.5"
327  spotlights 2-up, shared measured h (≥ 120) → ~460
     absent university → the right card is an emptyCard: "Universidad #1 — pendiente de evaluar" + empty.universidades.body (Tomas today shows two EMPTY cream boxes with accent bars — never again)
     absent career (Tomas) → left card emptyCard with empty.careers.body + reason
480  Recomendación principal (yellow panel, measured) → this is the ONLY place profileSummary renders
```

### p.4 PCA (`p6-06.png`)

Contents: header · grouped bars v2 (200) · H2 "Qué significa cada dimensión para ti" · 4 band-bar cards (2×2).

```
138  bars v2 panel 200 → 338
362  H2 (16.5) → 379
391  cards row 1 (h ≈ 157) → 548
560  cards row 2 → 717            ≈ 87% ink; estilo starts a new page (it is ≥ 400)
```

Absent DISC: section = one emptyCard (`PCA — pendiente de evaluar`); estilo is skipped entirely (it is derived from DISC) and the pending row for PCA appears in the Part-1 pending panel.

### p.5 estilo (`p7-07.png`)

Contents: header · 4 style cards as **2×2** (not 4 full-width) · strengths/watch panels · style map v2 + legend + sentence.

```
138  style cards 2×2, 243.64 wide, h = 12 + 16.5 + 6 + measure(text 9/2, 211.64) + 14 (≈ 95); rows pitch h+12 → 340
356  strengths / watch panels 86 → 442
466  H3 "Tu mapa de estilo" → 482
490  quadrant 220×220 at MARGIN | side column x = MARGIN+232, w 267: legend (3 rows × 16) then the data-driven sentence 9/2.5 → 710   ≈ 86%
```

The four style texts today are fixed strings ("Tu estilo depende de tus dimensiones más altas entre PCA" is a placeholder). Select them from `interpret.es-en.json` by the highest dimension of `underPressure` (add a `style.<D|I|S|C>.{work,communicate,pressure,motivates}` table); strengths/watch-outs likewise by dimension. This is a content task, but the layout above only holds if the texts are 90–140 chars.

### p.6 MIL (`p8-08.png`)

Contents: header · radar + composite ring + summary (216) · 5 full-text domain rows. No "Interpretación" card (duplicate removed).

```
138  chart block 216 → 354
374  domain rows 5 × ≈79 → 770       ≈ 95%; rows are breakable (minRows 2) as a safety valve
```

Absent MIL: emptyCard `MIL — pendiente de evaluar`; the composite KPI tile on p.3 shows `—`.

### p.7 competencias (`p9-09.png`) + p.8 orphan (`p10-10.png`)

Contents: header · coverage row · level board · not-evaluated caption · destacas/desarrollar panels · (priority-3 "Cómo crecer" strip) · **pending panel** for 360 + intereses + académico.

```
138  coverage row 24 → 162
174  level board 30 + 8 + 5×(22+6) + 8 = 186 → 360
368  not-evaluated caption 13 → 381
397  destacas / desarrollar panels, measured, ≈ 120 → 517
533  pending panel (§2.4) ≈ 177 → 710     ≈ 86%
     "Cómo crecer" (priority 3, h 100) is dropped by the paginator because it does not fit — page 8 no longer exists
```

Tomas (no competencies): the section is one emptyCard that flows under MIL's domain rows if ≥ 72 + 32 remain, else opens the next page followed by the pending panel (4 rows: competencias, personalidad, 360, intereses+académico) — ~300pt on one page, then the Part-2 divider. That page is a part-closing page (floor 40%) and passes.

### p.9 360 (`physical 11`) and p.10 intereses/académico (`physical 12`)

Both pages disappear for Sara and Tomas: they are rows of the pending panel on p.7.

When 360 **is** measured: header · evaluator chip in the header · up to 8 band-bar rows (34 each = 272) · "Lo que dicen de ti" with a data-driven sentence (highest and lowest category) → ≈ 138 + 272 + 24 + 88 = 522; intereses/motivadores then **flow under it** (they are ≤ 400) with a section rule:

```
554  section rule + header (kicker/title only, no sub) → 600
616  interest chips (h 22, pitch 30, 3 per row) → ≤ 706
722  motivator cards 3-up 158.43 × 56 → 778
```

Académico (when measured) opens the next page as a 4-col tile grid (2 rows × 52, pitch 60) + a teal insight panel whose text is data-driven (`"Promedio 3.8, SAT 1350 y 4 cursos AP: un perfil competitivo para universidades selectivas."`); if académico is absent but 360 is measured, its emptyCard flows under the motivators.

### p.11 metodología (`p14-14.png`)

Contents: header · donut (data-driven) **or** instrument-flow · cluster bars with counts · note (priority 3).

Cluster rows: label 9.5 Medium (w 140) · bandBar 8pt · value 9 Bold teal · `"{careerCount} carreras"` 7.5 grey after the value. Fix the mapping: use `vm.clusters` directly (sorted), not `clusterKeys.find(includes)` with an index fallback that silently mislabels.

Tomas (engine refused to rank): the cluster block is replaced by an emptyCard with `empty.careers.body` + the engine reason; the donut/flow still renders (it describes the method, which is true regardless).

### p.12–13 carreras (`p15-15.png`, physical 16)

Contents: header · factor legend (§2.5) · cards (rows, minRows 1) · Part-3 stub band when universities are absent.

```
138  factor legend pills 15 + caption 11 → 170
186  card 1 (h ≈ 116) … cards flow; ≈ 3 per page
—    page 13: cards 4–5 end ≈ 400; Part-3 stub band (96) flows under → 528 (part-closing page, floor 40% ✓)
```

Absent careers (Tomas): section = emptyCard flowing under metodología.

### p.14 universidades (`physical 18`) and p.15 tabla (`physical 19`)

For both fixtures: **deleted** (no divider, no pages; stub band on the last carreras page; TOC says `pendiente`).

When measured: universidades cards (rows, minRows 1) ≈ 96–130 each; **tabla is a block of the same section** (H3 + heat-cell table + priority-3 note) placed by the paginator after the last card — on the same page when `26 + 7 + 34×n + 40` fits, otherwise on the continuation page with the running kicker. It never opens a page with a header of its own.

---

## 5. Token additions to `theme.ts`

```ts
// ─── Spacing (replace SP) ───────────────────────────────────────────────────
export const SP = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48,
                    page: 595.28, margin: 48 } as const;

// ─── Layout constants (move page-composition numbers out of sections) ──────
export const LAYOUT = {
  y0Cont: 48, kickerY: 49, titleY: 59, subY: 88, afterHeader: 16,
  sectionGap: 32, blockGap: 16, cardGap: 12, subsectionGap: 24,
  ownPageRatio: 0.60, minFollow: 24, inkFloor: 0.62, partCloseFloor: 0.40,
  grid: { cols: 6, gutter: 12, col: 73.213, half: 243.64, third: 158.43, twoThirds: 328.85, quarter: 115.82 },
} as const;

// ─── Radii / strokes ────────────────────────────────────────────────────────
export const RADIUS = { chip: 6, tile: 8, card: 12, panel: 14, pill: 11 } as const;
export const STROKE = { hair: 0.6, rule: 1, glyph: 1.2, marker: 1.5, ring: 6, ringHero: 7 } as const;

// ─── Type scale ─────────────────────────────────────────────────────────────
export const TYPE = {
  kicker:  { font: "Poppins-SemiBold", size: 8.5, tracking: 1.2 },
  h1:      { font: "Poppins-Bold",     size: 17 },
  h2:      { font: "Poppins-SemiBold", size: 11 },
  h3:      { font: "Poppins-SemiBold", size: 10.5 },
  body:    { font: "Poppins-Regular",  size: 9.5, lineGap: 2.5 },
  small:   { font: "Poppins-Regular",  size: 8.7, lineGap: 2 },
  dense:   { font: "Poppins-Regular",  size: 8.5, lineGap: 1 },   // MIL domain rows
  caption: { font: "Poppins-Regular",  size: 7.5 },
  micro:   { font: "Poppins-SemiBold", size: 6.8 },
  stat:    { font: "Poppins-Bold",     size: 15 },
  ring:    { font: "Poppins-Bold",     size: 16 },
  display: { font: "Poppins-Bold",     size: 28 },
} as const;
/** pdfkit line height for Poppins = 1.5 × size + lineGap (measured). */
export const lineH = (size: number, gap = 0) => 1.5 * size + gap;

// ─── Colour additions (every hex currently inlined in sections/*.ts) ───────
tealSoft:   "#E4F0F0",  // interest chips bg
tealMid:    "#7DB6BC",  // secondary cluster bars, series[2]
tealDeep:   "#247A86",  // alternate university bar
onTeal:     "#D4E5E2",  // body text on teal panels
onNavy:     "#CBE0DE",  // body text on navy panels
navyMid:    "#0A6BB8",  // plan horizon 2
navyLight:  "#4F90D0",  // plan horizon 3
yellowSoft: "#FFF9E0",  // recommendation / note panel bg
yellowText: "#5C4D14",  // text on yellowSoft
yellowLabel:"#9A7B00",  // label on yellowSoft

// ─── Chart palette ──────────────────────────────────────────────────────────
export const CHART = {
  track: C.line, grid: C.grid, baseline: C.line,
  series: [C.teal, C.navy, "#7DB6BC", C.yellow],      // never more than 4 series
  disc:  { D: C.red, I: C.yellow, S: C.green, C: C.teal },
  band:  { low: C.red, med: C.amber, high: C.green },
  bandSoft: { low: C.redSoft, med: C.amberSoft, high: C.greenSoft },
  thresholds: [34, 67] as const,
  barH: { sm: 5, md: 6, lg: 8 },
  ring: { r: { card: 28, hero: 34 }, stroke: 6 },
  radar: { r: 80, fillOpacity: 0.18, stroke: 1.5 },
  mutedOpacity: 0.55,
  discBars: { panelH: 200, barW: 22, gap: 10, maxH: 110 },
  quadrant: { size: 220, inset: 18 },
} as const;

// ─── Empty-state tokens ─────────────────────────────────────────────────────
export const EMPTY = {
  fill: C.white, stroke: C.line, dash: [3, 3] as const, strokeW: 1,
  text: C.grey, glyph: C.grey, glyphR: 7, glyphDash: [2, 2] as const,
  chip: { h: 15, r: 7.5, padX: 7, size: 7.5 },
  value: "—",
  cardMinH: 72, stubH: 96, illustrationOpacity: 0.6,
} as const;
```

Label keys to add: everything in §2.8 plus `mil.summary`, `estilo.mapSentence`, `run.kicker` (`"{part} — {section} (cont.)"`), `factors.legend.*`, `coverage.*`, `part.pending`, `toc.pending`, `strip.caption`, and the `style.<dim>.*` tables if the estilo copy becomes data-driven.

---

## 6. New primitives summary (signatures the engineer will add)

`layout.ts`
- `placeSection(doc, ctx, spec: SectionSpec): void` — the paginator (§1.4), records `ctx.pageInk[]` and `ctx.toc[]`.
- `sectionRule(doc, y)`, `runningKicker(doc, text)`.
- `emptyCard(doc, x, y, w, { title, body, cta? }): number` (draws, returns h) + `measureEmptyCard(...)`.
- `pendingPanel(doc, x, y, w, rows: { name, body, cta }[]): number` + measure twin.
- `partStub(doc, x, y, { kicker, body, illustration }): 96`.
- `instrumentStrip(doc, x, y, w, items: { label, measured, meta? }[]): number`.

`charts-primitives.ts`
- `pendingRing`, `checkBadge`, `emptyChip`, `bandChip`, `bandBar`, `coverageBar(x, y, w, total, done)`, `emptyBar(x, y, w, h)`, `ringV2` (ticks + `/100`), `radarV2` (34/67 rings, stroke), `styleMap(x, y, size, graphs: {label, g: DiscGraph, role}[])`, `heatCell(x, y, w, v)`.

`charts-composite.ts`
- `discBarsV2(doc, x, y, graphs, primaryIndex)`, `levelBoard(doc, x, y, w, comps, catalogueTotal, notEvaluated?)`, `domainRows(...)` (returns Block with `rows`), `instrumentFlow(doc, x, y, w, factors)`, `donutV2(..., segs: {pct, color, measured}[])`.

---

## 7. Implementation order (highest value first)

1. **VM presence flags** (`coverage`, nullable `academics`, nullable factor scores, `scoring.factors`) — nothing else can distinguish absent from zero without this.
2. **Empty primitives + copy** (§2) and replace every `N/D` / `0`-for-absent site: resumen tiles and spotlights, career factor rows, academic tiles, 360 sentence, metodología donut. Visible improvement on both fixtures within a day.
3. **Paginator + SectionSpec** (§1.4) and convert sections in this order: competencias (kills page 8), threeSixty/intereses (kills pages 9–10), universidades/tabla + divider rule (kills 13–15), carreras, then the rest. Add the density test (§1.6).
4. **Chart upgrades**: MIL page (un-clamp + summary), level board, style map v2, DISC bars v2, ring v2, heat cells.
5. **TOC two-pass + cover instrument line.**

Expected result on the Sara fixture: 22 → ~16 pages, no page below 40% ink, no `0`/`N/D` that means "not measured", no duplicated summary, no clipped MIL copy, and a methodology page that can only describe the factors the engine actually used.

---

## 7. Page architecture and colour meaning (built 2026-09-16, worklist B + C)

Twelve content pages shared one skeleton (kicker · h1 · sub · blocks). The document now has **four page shapes**, each used for a reason, plus a colour rule. Everything below is renderer-agnostic and is what the .NET port must reproduce.

### 7.1 Colour meaning (B7)

**Red, amber and green are VALUE and nothing else**: band chips, level-board header bars, confidence chips, the "ya destacas / para desarrollar" panels. Anything that *names* a thing draws from the brand series `[teal, navy, tealMid, yellow]`:

| thing | colours |
|---|---|
| DISC dimensions (bars, glyphs, spot mark, dimension-card bars) | D `navy` · I `yellow` · S `tealMid #7DB6BC` · C `teal` — glyph tints `navySoft #E4EAF1` / `yellowSoft` / `tealSoft` / `tealSoft`, glyph ink `navy` / `yellowLabel` / `tealDeep` / `teal`; the letters under the bars are `body` ink |
| instrument cards (front page) | PCA `teal` · MIL `navy` · 360° `tealDeep` |
| estilo topic cards, personality axes, legacy donut segments | series in order |

Cream carries no meaning (B8): it is the panel surface for data and commentary alike. The pending signal is the dashed edge + `—` + pendingRing, nothing else.

### 7.2 Shape A — standard (unchanged)
Kicker · h1 · sub · blocks, §1.1. Continuation pages carry the running kicker (7 SemiBold grey at (MARGIN, 30), key `run.kicker`).

### 7.3 Shape B — banner (resumen)
- Navy band from y 0, full width. `bandH = 100 + stripH + 16 + 54 + 16`. Kicker `yellow` at y 49, h1 `white` at y 59, **no sub** — the h1 is the header. Yellow tab stays.
- **Page budget for a complete profile** (the case that fills this page): band ≈ 236 · spotlight row ≤ ~180 · recommendation ≤ ~340. The four KPI tiles are ONE row of `quarter` width (labels `ESTILO PCA` / `MIL COMPUESTO` / `PROMEDIO` / `CARRERA #1`; the career tile is the score only, the spotlight names it; the style tile falls back to letters `C 87 · S 68`). Each spotlight shows a **teaser**: the insight's first sentence, cut at a word boundary at 120 chars — the full text is on the card in Part 2.
- Instrument strip on dark: measured pill `white` fill / `navy` text / teal checkBadge; pending pill `navy` fill + 1pt dashed `[3,3]` `tealLine` + `tealLine` text + pendingRing in `tealLine`; caption `tealLine`.
- KPI tiles 2×2 on dark: measured `navyPanel #1B3A5B`, label `tealLine` 8, value `white` 12 Bold; pending: `navy` fill + dashed `tealLine`, value `—` in `tealLine`. A pending tile never prints a figure. The style tile names the two **highest** dimensions of `underPressure` (letters `D 25 · C 87` when the full names do not fit the tile).
- White page resumes at `bandH + 24`: spotlight row (moves whole to a continuation page if it does not fit), then the recommendation panel.
- **Recommendation panel breaks between paragraphs**: PAD_TOP 32, PAD_BOTTOM 16, paragraph gap 8, heading→body gap 2; as many paragraphs as fit close the page's panel, the rest open `RECOMENDACIÓN PRINCIPAL (CONT.)` on the next page under the running kicker. Placement reads the LAYOUT cursor, never pdfkit's `doc.y`.

### 7.4 Shape C — bleed chart (PCA, MIL)
The instrument's primary chart runs edge to edge as a cream rect `(0, y, PAGE_W, h)`; the content geometry keeps MARGIN / CONTENT_W.
- PCA: `h = 187 + footerH + 14`; the three context captions (7.5 Regular, lineGap 1.5, `body`) sit inside the band at `y + 187`, aligned to the groups (`discBarsV2Columns`).
- MIL: band at `y − 8`, `h 232`; radar + ring + chip + summary + legend all lie inside.

### 7.5 Shape D — divider with a map (C10)
Under the intro paragraph (`290 + introH + 28`): one row per section of the part, pitch 24. Measured: `yellow` dot r 4.5, title 10 Medium `white`, folio 9 SemiBold `yellow` right-aligned in a 56pt slot at the right margin, **written in the buffered-page pass** like the contents. Pending: dashed `tealLine` ring, title `tealLine`, the word `pendiente` 8 Regular `tealLine`. Optional meta (`13/24`) 8 Regular `tealLine` after the title. Hairline 0.5 `tealLine` at 30% opacity under each row. Part 1 lists its measured sections **and** the pending instruments — the same statement as the pending panel that closes the part. The art takes what is left: `fit [CONTENT_W, min(331, 800 − artTop)]` from `rowsEnd + 20`.

### 7.6 Front page — introduction + contents (C11)
Cover → **one** page: header (kicker `Introducción`, h1 `Acerca de este informe`, sub) · three instrument cards (third width, `52 + descH + 16`) · two columns of `half`: LEFT `Contenido` — level-0 rows 8.5 SemiBold `teal` tracking 1 (pitch 22 + 4), level-1 rows 9.5 Medium `ink` with a 0.6 `line` hairline and a 24pt folio slot at the column's right edge (`pendiente` in `grey` when pending); RIGHT the teal "Cómo se construyen tus recomendaciones" panel (`16 + titleH + 6 + bodyH + 18`) and the "Cómo leer este informe" bullets. The contents no longer lists itself. Ink: 87% (Sara), 87% (Tomás).

### 7.7 Universities and the 360 page (first render with a complete profile, 2026-09-16)
- **University cards balance** like the career cards (measure all, spread evenly, never a lone card on a page). **The comparison table is a block of the same section**: it follows the last card on the same page when `32 + 38 + 32 + 34n + 14 + note` fits, else continues under the running kicker with a kicker + 13pt title. It never opens a page with a full header.
- **The 360 page draws one series.** The VM carries only the evaluators' average per category; the yellow "Tú" marker (drawn at exactly that value) and its legend are gone until a self score exists. The insight sentence is data-driven: two highest categories and the lowest.

### 7.8 Result
Sara 15 → **14 pp**, Tomás 14 → **13 pp**, a complete fictional profile (every instrument, 5 careers, 5 universities) **20 pp**. Every content page ≥ 71% ink except: the Part-1 pending-panel page (57%, part-closing, floor 40%) and, on the complete profile, personality 60%, 360 57%, intereses 59% — single-instrument pages with nothing to flow under them. Zero containment violations on all three in ES and EN. `__tests__/structure.test.ts` asserts each shape from the recorded draws. The complete fixture is `render-harness-full.ts` beside this file.
