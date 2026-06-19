import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";

/**
 * Geometry of one edited run, in CSS px relative to its rendered page, plus the
 * page's pdf.js viewport scale and the PDF page height in points.
 */
export interface RunRect {
  relX: number; // px from the page's left edge
  top: number; // px from the page's top edge
  width: number; // px
  height: number; // px
  scale: number; // pdf.js viewport scale (px per PDF point)
  pageHeightPt: number; // PDF page height in points
}

export interface PdfRect {
  x: number;
  y: number; // bottom-left origin (PDF user space)
  width: number;
  height: number;
}

/**
 * Map a rendered run's screen rect to PDF user space (points, bottom-left
 * origin). pdf.js lays the page out at `scale` px per point, top-left origin;
 * pdf-lib draws in points, bottom-left origin — so divide by scale and flip Y.
 */
export function mapRectToPdf(r: RunRect): PdfRect {
  const x = r.relX / r.scale;
  const width = r.width / r.scale;
  const height = r.height / r.scale;
  // Top edge in points, measured from the page top; flip to a bottom-left origin.
  const topPt = r.top / r.scale;
  const y = r.pageHeightPt - topPt - height;
  return { x, y, width, height };
}

/** Parse a CSS `rgb(r, g, b)` string into a pdf-lib colour, or null. */
function parseRgb(value: string): { r: number; g: number; b: number } | null {
  const m = value.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (!m) return null;
  return { r: Number(m[1]) / 255, g: Number(m[2]) / 255, b: Number(m[3]) / 255 };
}

/** True when a run has been edited from its original text. */
function isEdited(el: HTMLElement): boolean {
  if (el.dataset.orig === undefined) return false;
  return (el.textContent ?? "") !== el.dataset.orig;
}

/**
 * Bake the in-place edits from the live editor DOM into a new PDF: cover each
 * edited run's original glyphs with the page's own background colour, then draw
 * the new text in the run's foreground colour at the same spot. Returns the new
 * PDF bytes. The original is never mutated.
 */
export async function bakeEditedPdf(
  originalBytes: ArrayBuffer | Uint8Array,
  host: HTMLElement,
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(originalBytes);
  const helvetica = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();
  const pageEls = Array.from(host.querySelectorAll<HTMLElement>(".pdf-page"));

  pageEls.forEach((pageEl, i) => {
    const page = pages[i];
    if (!page) return;
    const scale = Number(pageEl.dataset.pdfScale) || 1;
    const pageHeightPt = page.getHeight();
    const pageRect = pageEl.getBoundingClientRect();

    // Every edited leaf run on this page (bound fields + free-form runs).
    const runs = Array.from(pageEl.querySelectorAll<HTMLElement>("[data-orig]")).filter(isEdited);
    for (const el of runs) {
      const rect = el.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) continue;
      const mapped = mapRectToPdf({
        relX: rect.left - pageRect.left,
        top: rect.top - pageRect.top,
        width: rect.width,
        height: rect.height,
        scale,
        pageHeightPt,
      });
      drawRun(page, helvetica, el, mapped);
    }
  });

  return doc.save();
}

function drawRun(
  page: ReturnType<PDFDocument["getPages"]>[number],
  font: PDFFont,
  el: HTMLElement,
  rect: PdfRect,
): void {
  const bg = parseRgb(el.style.getPropertyValue("--pdf-bg")) ?? { r: 1, g: 1, b: 1 };
  const fg = parseRgb(el.style.getPropertyValue("--pdf-fg")) ?? { r: 0.07, g: 0.07, b: 0.07 };
  const text = el.textContent ?? "";

  // Cover the original glyphs with the page's own background.
  page.drawRectangle({
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    color: rgb(bg.r, bg.g, bg.b),
  });

  if (!text.trim()) return;

  // Size the new text to the run's cap height; shrink to fit the original width
  // so a slightly longer replacement still stays on its line.
  const scaleFromCss = Number(el.closest<HTMLElement>(".pdf-page")?.dataset.pdfScale) || 1;
  const cssFont = parseFloat(getComputedStyle(el).fontSize || "0");
  let size = cssFont > 0 ? cssFont / scaleFromCss : rect.height * 0.8;
  const measured = font.widthOfTextAtSize(text, size);
  if (measured > rect.width && measured > 0) {
    size = Math.max(4, (size * rect.width) / measured);
  }
  // Baseline sits a little above the rect bottom (descender room).
  const baseline = rect.y + rect.height * 0.22;
  page.drawText(text, {
    x: rect.x,
    y: baseline,
    size,
    font,
    color: rgb(fg.r, fg.g, fg.b),
  });
}
