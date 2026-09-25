# LIA item-bank PDF

Generates the LIA (MIL) item bank and answer key as a TIMS house-style PDF, in two
editions from one source.

```bash
python3 tools/lia-pdf/build_tims.py --lang both --out docs/lia
```

| Flag | Values | Default |
| --- | --- | --- |
| `--lang` | `es`, `en`, `both` | `both` |
| `--out` | any directory (created if absent) | next to the script |

Output is `TIMS-LIA-Banco-de-Items-ES.pdf` (fully Spanish) and
`TIMS-LIA-Item-Bank-EN.pdf` (fully English), 22 pages each. The committed copies
live in `docs/lia/`.

Requires `reportlab`, and the macOS system fonts Georgia and Menlo
(`/System/Library/Fonts/`). On a box without them the fonts must be supplied;
there is no fallback for Georgia.

## Never hand-edit the output

Four of the five subtests **store no answer**. The correct answer is computed
from the item's own data at scoring time, so editing an item silently moves its
key — there is no key file that would fall out of date and give the mistake
away. `build_tims.py` reimplements the production logic from
`LiaAnswerScoring.cs` and recomputes every answer.

**After any change to the item bank, regenerate.** A hand-edited PDF drifts from
the instrument with nothing to flag it.

## Files

| Path | What it is |
| --- | --- |
| `build_tims.py` | The generator. |
| `items.json` | The 305 items, extracted from `lia-question-bank.json` and `lia-verbal-en.json`, with answers recomputed. |
| `assets/` | Four logo PNGs extracted from the TIMS "Hallazgos" reference PDF. Navy `#0D0E4F` and red `#E40104` are sampled from their pixels. |

## Notes for anyone editing the generator

- The language helper is **`L(es, en)`**, not `t()` — `t` is used as a local for
  `Table(...)` throughout `story()` and would shadow it.
- TOC page numbers work by building the story **twice**: pass 1 records the page
  each section landed on, pass 2 prints them. `SECTION_PAGES` is cleared between
  editions.
- `canvas.setCharSpace()` does not exist in ReportLab. Letterspacing is done by
  joining characters with spaces (`sp()`).
- The standard fonts render U+1589 as a black box, so the mirrored-R glyph is
  drawn, not typeset (`draw_R`).
- `box()` returns a `KeepTogether` — a callout whose title lands at the foot of a
  page with its body overleaf reads as two unrelated fragments.

## Confidentiality

The output is labelled *CONFIDENTIAL — CONTAINS THE ANSWER KEY*, and it does.
Note this is not a new exposure: the source bank is already tracked in this repo
at `services/api/src/FormMaps.Application/Assessments/Data/lia-question-bank.json`,
so the key was always derivable by anyone with repo access. Treat the built PDFs
as you treat the bank.
