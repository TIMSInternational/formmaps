# Illustration set

Eleven flat geometric marks in the brand palette, used by
`src/components/illustration/Illustration.tsx`.

Served as a `.webp` pair per mark — `@320` (1x–2x) and `@640` (3x). 416 KB for
the whole set. The 2048px PNG masters are **not** in the repo (15 MB); they live
in `~/Downloads/formmaps-illustrations/masters/`.

| file | used by |
|---|---|
| `not-started` | `EmptyState` type `not_started` |
| `no-results` | `EmptyState` type `no_results` |
| `no-data` | `EmptyState` type `no_data` |
| `locked` | `EmptyState` type `permission_denied` |
| `connection-lost` | `EmptyState` type `loading_error`; evaluator `ErrorScreen` |
| `completed` | evaluator `SuccessScreen` |
| `already-done` | evaluator `AlreadySubmittedScreen` |
| `journey` | spare — the alternate onboarding mark |
| `welcome` | student invite hero (`onboarding/student/[token]`) |
| `not-found` | `app/not-found.tsx` (404) |
| `broke` | `app/error.tsx` (500) |

## Two rules any new mark has to follow

The app themes with a `.dark` class, so **one file has to work on `#FFFFFF` and
on `#0A0A0A`**. That rules out two things that are easy to produce by accident:

1. **No navy, no black, no white fills.** `#102B47` on `#0A0A0A` is invisible —
   a first pass had a "thank you" mark that was 55% navy and effectively
   disappeared in dark mode. An opaque white ground is worse: a white box on a
   dark dashboard. Palette is teal `#2E9098`, yellow `#FFD23F`, grey `#8A93A3`.
2. **No soft or subtle interior fills.** They survive the alpha cutout as a grey
   halo. A first-pass "no results" circle had one baked in.

Verify a new mark before adding it: corner pixel alpha must be 0, and the share
of ink darker than roughly `rgb(70, 80, 110)` must be 0%.

**A dark-ink check is not sufficient on its own.** The cutout also leaves a veil
of *pale*, partly-transparent pixels that passes that test and still shows as a
grey blob on a dark background. Strip anything with alpha < 150, or further than
~90 in RGB distance from the three inks while not fully opaque — two of the three
most recent marks needed it.

## How these were made

Higgsfield `gpt_image_2_5`, 3 credits each. The defaults matter — `quality`
defaults to `low` and `resolution` to `1k`, and without `background` set you get
an opaque image, which is exactly the failure mode rule 1 warns about.

```
model       gpt_image_2_5
quality     high
resolution  2k
background  transparent
aspect      1:1
```

Prompt skeleton:

> Flat geometric abstract illustration, Swiss International Typographic style,
> Bauhaus influence. Built ONLY from circles, arcs, dots and thin straight
> lines. STRICT palette, use ONLY these three: deep teal #2E9098, warm golden
> yellow #FFD23F, mid grey #8A93A3. Do NOT use dark navy, do NOT use black, do
> NOT use white fills. Crisp flat vector edges, uniform stroke weight,
> perfectly even solid colour with no texture, grain, glow or shading. The
> inside of every shape is COMPLETELY EMPTY and fully transparent. ABSOLUTELY
> NO people, faces, figures, objects, text, letters or numbers. No shadows, no
> 3D, no gradients. Transparent background. Centred, generous empty margin.
> SUBJECT: _(one concrete geometric description)_

The vocabulary — arcs from a common origin, dots on a grid, nodes joined by
paths, a set of shapes with one picked out — is the same one the PDF informe
draws in pdfkit (`services/api` → `informe/marks.ts` in the legacy repo), so the
report and the product read as one thing.

Export: resize the 2048 master to 320 and 640, `WEBP` quality 90, method 6.
