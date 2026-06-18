"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Contact fields we two-way bind between the right panel and the PDF. */
export const CONTACT_FIELDS = [
  "fullName",
  "email",
  "phone",
  "location",
  "linkedin",
  "website",
  "github",
] as const;
export type ContactField = (typeof CONTACT_FIELDS)[number];
export type ContactValues = Partial<Record<ContactField, string>>;

interface OriginalPdfEditorProps {
  /** Resolves to a (short-TTL signed) URL for the original PDF, or null. */
  loadUrl: () => Promise<string | null>;
  /** Live values of the contact fields (from the right-panel form). */
  contactValues?: ContactValues;
  /** Fired as the user edits a contact run on the document (left → right, live). */
  onContactFieldChange?: (field: ContactField, value: string) => void;
  /** Fired when a contact run loses focus, so the change can be persisted. */
  onContactFieldCommit?: () => void;
}

type EditorState = "loading" | "ready" | "error";

/**
 * In-place editor for the user's ACTUAL uploaded PDF. Renders each page to a
 * canvas (the exact original look), then overlays pdf.js's text layer — spans
 * positioned precisely over the original glyphs — and makes them contentEditable.
 * A run stays transparent (canvas shows through) until changed, then gets an
 * opaque white background covering the original glyph with the edited text in
 * place.
 *
 * Two-way contact binding: each contact field's value (name, phone, email,
 * links, …) is located in the PDF text and wrapped in its own editable element.
 * Editing it on the document updates the right-panel form live (onContactFieldChange),
 * and changing the field on the right updates the document live (the effect below).
 * Fields whose parsed value can't be confidently located are simply left
 * un-bound — they still edit/save via the right panel, just without live mirroring.
 */
export function OriginalPdfEditor({
  loadUrl,
  contactValues,
  onContactFieldChange,
  onContactFieldCommit,
}: OriginalPdfEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<EditorState>("loading");
  // field → the inner editable element wrapping that value on the document.
  const fieldElsRef = useRef<Map<ContactField, HTMLElement>>(new Map());

  // Keep the latest callbacks / values in refs so the (expensive) load effect
  // that builds listeners doesn't re-run when the parent re-renders.
  const onChangeRef = useRef(onContactFieldChange);
  onChangeRef.current = onContactFieldChange;
  const onCommitRef = useRef(onContactFieldCommit);
  onCommitRef.current = onContactFieldCommit;
  const contactValuesRef = useRef(contactValues);
  contactValuesRef.current = contactValues;
  // Previous contact values, so the right→left effect applies only the user's
  // actual changes — never overwriting the PDF's own text on first render
  // (e.g. when the parsed value differs only in casing/format from the document).
  const prevContactRef = useRef<ContactValues | null>(null);

  useEffect(() => {
    let cancelled = false;
    let pdfDoc: { destroy: () => void } | null = null;
    const fieldEls = fieldElsRef.current;
    fieldEls.clear();
    prevContactRef.current = null;

    (async () => {
      try {
        const url = await loadUrl();
        if (cancelled) return;
        if (!url) {
          setState("error");
          return;
        }

        const [pdfjs, { configurePdfWorker }] = await Promise.all([
          import("pdfjs-dist"),
          import("../../resumes/_components/pdfWorker"),
        ]);
        if (cancelled) return;
        configurePdfWorker();

        const doc = await pdfjs.getDocument(url).promise;
        if (cancelled) {
          doc.destroy();
          return;
        }
        pdfDoc = doc;

        const host = hostRef.current;
        if (!host) {
          setState("error");
          return;
        }
        host.replaceChildren();
        const containerWidth = host.clientWidth || 600;
        const dpr = window.devicePixelRatio || 1;

        for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
          const page = await doc.getPage(pageNum);
          if (cancelled) return;

          const base = page.getViewport({ scale: 1 });
          const scale = containerWidth / base.width;
          const viewport = page.getViewport({ scale });

          const pageEl = document.createElement("div");
          pageEl.className = "pdf-page relative mx-auto mb-4 bg-white shadow-sm rounded-sm overflow-hidden";
          pageEl.style.width = `${viewport.width}px`;
          pageEl.style.height = `${viewport.height}px`;

          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(viewport.width * dpr);
          canvas.height = Math.floor(viewport.height * dpr);
          canvas.style.width = `${viewport.width}px`;
          canvas.style.height = `${viewport.height}px`;
          // Canvas is purely the visual — all interaction happens on the text
          // layer above it, so it must not intercept clicks.
          canvas.className = "absolute inset-0 pointer-events-none";
          // willReadFrequently: we sample the page's own colors (below) so edits
          // can blend into the document instead of looking like a pasted box.
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          if (!ctx) {
            setState("error");
            return;
          }
          ctx.scale(dpr, dpr);
          pageEl.appendChild(canvas);

          // Text layer host — pdf.js positions spans via these CSS variables.
          const textDiv = document.createElement("div");
          textDiv.className = "textLayer pdf-edit-layer";
          textDiv.style.setProperty("--total-scale-factor", String(scale));
          textDiv.style.setProperty("--scale-round-x", "1px");
          textDiv.style.setProperty("--scale-round-y", "1px");
          pageEl.appendChild(textDiv);

          host.appendChild(pageEl);

          await page.render({ canvas, canvasContext: ctx, viewport }).promise;
          if (cancelled) return;

          const textContent = await page.getTextContent();
          if (cancelled) return;
          const textLayer = new pdfjs.TextLayer({
            textContentSource: textContent,
            container: textDiv,
            viewport,
          });
          await textLayer.render();
          if (cancelled) return;

          // Make each text run editable and remember its original value so we
          // can tell when it has actually changed.
          textDiv.querySelectorAll<HTMLElement>("span").forEach((span) => {
            if (!span.textContent || span.getAttribute("role") === "img") return;
            span.contentEditable = "true";
            span.spellcheck = false;
            span.dataset.orig = span.textContent;
          });
        }

        if (cancelled) return;

        // Bind contact fields: locate each value in the document and wrap it in
        // its own editable element so it can mirror the right-panel form.
        bindContactFields(host, contactValuesRef.current || {}, fieldEls);

        // Sample each bound field's real background + text colour from the page
        // so edits blend into the document (white-on-teal header, black-on-white
        // body, …) instead of looking like a pasted box. Wait one frame so the
        // wrapped elements have laid out before we read their geometry.
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        if (cancelled) return;
        const dprNow = window.devicePixelRatio || 1;
        for (const el of fieldEls.values()) sampleRunColors(el, dprNow);

        setState("ready");
      } catch {
        if (!cancelled) setState("error");
      }
    })();

    return () => {
      cancelled = true;
      fieldEls.clear();
      try {
        pdfDoc?.destroy();
      } catch {
        // ignore destroy errors on unmount
      }
    };
  }, [loadUrl]);

  // Right → left: when a contact field changes on the right, update the run on
  // the document — unless the user is actively editing that same run on the left.
  useEffect(() => {
    if (state !== "ready" || !contactValues) return;
    const prev = prevContactRef.current;
    prevContactRef.current = contactValues;
    // First pass after the document is ready only records the baseline; it must
    // not push parsed values onto the document the user hasn't touched.
    if (!prev) return;
    for (const field of CONTACT_FIELDS) {
      if (prev[field] === contactValues[field]) continue; // unchanged on the right
      const el = fieldElsRef.current.get(field);
      if (!el || document.activeElement === el) continue;
      const next = contactValues[field] ?? "";
      if ((el.textContent ?? "") !== next) {
        el.textContent = next;
        el.classList.toggle("pdf-edited", next !== el.dataset.orig);
      }
    }
  }, [contactValues, state]);

  // Left → right (+ Phase-1 in-place edits for non-contact runs).
  const handleInput = useCallback((e: React.FormEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;
    // First time a run is edited, blend it into the document's own colours.
    if (!target.style.getPropertyValue("--pdf-bg")) {
      sampleRunColors(target, window.devicePixelRatio || 1);
    }
    if (target.dataset.field !== undefined) {
      const value = target.textContent ?? "";
      target.classList.toggle("pdf-edited", value !== target.dataset.orig);
      onChangeRef.current?.(target.dataset.field as ContactField, value);
      return;
    }
    if (target.dataset.orig !== undefined) {
      target.classList.toggle("pdf-edited", target.textContent !== target.dataset.orig);
    }
  }, []);

  // Sample colours on focus too, so a run blends in the moment it's clicked
  // (before any text changes) — not just once edited.
  const handleFocus = useCallback((e: React.FocusEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;
    const editable = target.dataset.field !== undefined || target.dataset.orig !== undefined;
    if (editable && !target.style.getPropertyValue("--pdf-bg")) {
      sampleRunColors(target, window.devicePixelRatio || 1);
    }
  }, []);

  // Commit (persist) when a bound contact run loses focus.
  const handleBlur = useCallback((e: React.FocusEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement | null;
    if (target?.dataset.field !== undefined) onCommitRef.current?.();
  }, []);

  return (
    <div className="flex flex-col gap-2">
      {state === "ready" && (
        <p className="px-1 text-xs text-muted-foreground">
          Editing your uploaded document — your contact details stay in sync with the panel on the right.
        </p>
      )}
      {state === "loading" && (
        <div className="p-6 text-sm text-muted-foreground">Loading your document for editing…</div>
      )}
      {state === "error" && (
        <div className="p-6 text-sm text-muted-foreground">Couldn&apos;t load your document for editing.</div>
      )}
      <div ref={hostRef} onInput={handleInput} onFocus={handleFocus} onBlur={handleBlur} className="w-full" />
    </div>
  );
}

/**
 * Locate each contact value in the document and wrap it in its own editable
 * `[data-field]` element, locking the rest of the run. Handles several fields in
 * one run (e.g. a "phone | email | github" contact line), exact match first then
 * a case-insensitive fallback (keeping the document's own casing). A value that
 * can't be located is skipped — still editable on the right, just not mirrored.
 */
export function bindContactFields(
  host: HTMLElement,
  values: ContactValues,
  out: Map<ContactField, HTMLElement>,
) {
  const spans = Array.from(host.querySelectorAll<HTMLElement>(".pdf-edit-layer span[data-orig]"));
  const remaining = new Set<ContactField>(
    CONTACT_FIELDS.filter((f) => (values[f] ?? "").trim().length >= 2),
  );

  for (const span of spans) {
    if (remaining.size === 0) break;
    const text = span.textContent ?? "";

    // Collect every remaining field that appears in this run.
    const matches: Array<{ field: ContactField; start: number; end: number }> = [];
    for (const field of remaining) {
      const value = (values[field] ?? "").trim();
      let idx = text.indexOf(value);
      if (idx < 0) {
        const lower = text.toLowerCase().indexOf(value.toLowerCase());
        if (lower < 0) continue;
        idx = lower;
      }
      matches.push({ field, start: idx, end: idx + value.length });
    }
    if (matches.length === 0) continue;

    // Keep non-overlapping matches in document order.
    matches.sort((a, b) => a.start - b.start);
    const chosen: typeof matches = [];
    let lastEnd = -1;
    for (const m of matches) {
      if (m.start >= lastEnd) {
        chosen.push(m);
        lastEnd = m.end;
      }
    }

    // Rebuild the run as: text … [field] … text, with each field its own editable
    // element. The run itself is no longer editable so separators stay put.
    span.replaceChildren();
    span.removeAttribute("data-orig");
    span.contentEditable = "false";
    let cursor = 0;
    for (const m of chosen) {
      if (m.start > cursor) span.appendChild(document.createTextNode(text.slice(cursor, m.start)));
      const matched = text.slice(m.start, m.end); // keep the PDF's own casing
      const fieldEl = document.createElement("span");
      fieldEl.className = "pdf-field";
      fieldEl.dataset.field = m.field;
      fieldEl.dataset.orig = matched;
      fieldEl.contentEditable = "true";
      fieldEl.spellcheck = false;
      fieldEl.textContent = matched;
      span.appendChild(fieldEl);
      out.set(m.field, fieldEl);
      remaining.delete(m.field);
      cursor = m.end;
    }
    if (cursor < text.length) span.appendChild(document.createTextNode(text.slice(cursor)));
  }
}

/**
 * Read the page canvas under a text run and stash its real background + text
 * colours on the element (`--pdf-bg` / `--pdf-fg`). An edited run then covers the
 * original glyph with the document's own background and renders the new text in
 * the original colour, so edits blend in instead of looking like a pasted box.
 * Best-effort: on any failure (e.g. a tainted canvas) it leaves the defaults.
 */
function sampleRunColors(el: HTMLElement, dpr: number): void {
  // Lock the run to at least its original width so a SHORTER replacement still
  // fully covers the original glyph (otherwise the tail of the old text shows,
  // e.g. on a coloured header). Captured pre-edit, in layout (pre-transform) px.
  if (!el.style.minWidth) {
    el.style.display = "inline-block";
    el.style.minWidth = `${el.offsetWidth}px`;
  }
  try {
    const pageEl = el.closest<HTMLElement>(".pdf-page");
    const canvas = pageEl?.querySelector("canvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    const cr = canvas.getBoundingClientRect();
    const fr = el.getBoundingClientRect();
    if (fr.width < 1 || fr.height < 1) return;
    const cw = canvas.width;
    const ch = canvas.height;
    const x = clampInt(Math.round((fr.left - cr.left) * dpr), 0, cw - 1);
    const y = clampInt(Math.round((fr.top - cr.top) * dpr), 0, ch - 1);
    const w = clampInt(Math.round(fr.width * dpr), 1, cw - x);
    const h = clampInt(Math.round(fr.height * dpr), 1, ch - y);

    // Background: the thin gaps just above and below the glyphs are almost
    // always pure background. Cluster the pixels into coarse buckets to find the
    // dominant colour, then average the ACTUAL pixels in that bucket so the cover
    // matches the page EXACTLY (e.g. true #fff, not a quantised ~#f8f8f8 box).
    const buckets = new Map<string, { n: number; r: number; g: number; b: number }>();
    const tally = (sx: number, sy: number, sw: number, sh: number) => {
      if (sw < 1 || sh < 1) return;
      const data = ctx.getImageData(sx, sy, sw, sh).data;
      for (let o = 0; o < data.length; o += 4) {
        const key = `${data[o] >> 4},${data[o + 1] >> 4},${data[o + 2] >> 4}`;
        const e = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
        e.n += 1;
        e.r += data[o];
        e.g += data[o + 1];
        e.b += data[o + 2];
        buckets.set(key, e);
      }
    };
    tally(x, clampInt(y - 2, 0, ch - 1), w, 1);
    tally(x, clampInt(y + h, 0, ch - 1), w, 1);
    if (buckets.size === 0) tally(x, y, w, h);
    let mode = { n: 0, r: 255 * 1, g: 255, b: 255 };
    for (const e of buckets.values()) if (e.n > mode.n) mode = e;
    const denom = Math.max(1, mode.n);
    const br = Math.round(mode.r / denom);
    const bg = Math.round(mode.g / denom);
    const bb = Math.round(mode.b / denom);

    // Text colour: within the run, the pixel furthest from the background.
    const inner = ctx.getImageData(x, y, w, h).data;
    let fr2 = 17;
    let fg2 = 17;
    let fb2 = 17;
    let far = -1;
    for (let o = 0; o < inner.length; o += 4) {
      const r = inner[o];
      const g = inner[o + 1];
      const b = inner[o + 2];
      const d = (r - br) ** 2 + (g - bg) ** 2 + (b - bb) ** 2;
      if (d > far) {
        far = d;
        fr2 = r;
        fg2 = g;
        fb2 = b;
      }
    }

    el.style.setProperty("--pdf-bg", `rgb(${br},${bg},${bb})`);
    el.style.setProperty("--pdf-fg", `rgb(${fr2},${fg2},${fb2})`);
  } catch {
    // tainted/unreadable canvas — keep the CSS defaults
  }
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
