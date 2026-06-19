"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { bakeEditedPdf } from "../_lib/bakeEditedPdf";
import type { DocumentEdit } from "@/store/useGlobalStore";

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

/**
 * Single-line experience values to two-way bind, keyed `exp.<entryId>.<field>`
 * (field ∈ jobTitle | company | location | startDate | endDate). Keyed by the
 * entry's stable id (not its index) so deletes/reorders can't mis-route a commit.
 */
export type ExperienceValues = Record<string, string>;

interface OriginalPdfEditorProps {
  /** Resolves to a (short-TTL signed) URL for the original PDF, or null. */
  loadUrl: () => Promise<string | null>;
  /** Live values of the contact fields (from the right-panel form). */
  contactValues?: ContactValues;
  /** Fired as the user edits a contact run on the document (left → right, live). */
  onContactFieldChange?: (field: ContactField, value: string) => void;
  /** Fired when a contact run loses focus, so the change can be persisted. */
  onContactFieldCommit?: () => void;
  /** Live experience single-line values, keyed `exp.<entryId>.<field>`. */
  experienceValues?: ExperienceValues;
  /** Fired when an experience run loses focus → persist that field on its entry. */
  onExperienceFieldCommit?: (entryId: string, field: string, value: string) => void;
  /** Saved in-place edits to restore onto the document on load. */
  documentEdits?: DocumentEdit[];
  /** Fired with the full current edit set whenever a run changes, to persist it. */
  onDocumentEditsChange?: (edits: DocumentEdit[]) => void;
  /** Filename for the "Download (with edits)" baked PDF. */
  fileName?: string;
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
  experienceValues,
  onExperienceFieldCommit,
  documentEdits,
  onDocumentEditsChange,
  fileName,
}: OriginalPdfEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<EditorState>("loading");
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState(false);
  // bound key (contact field or "exp.<i>.<field>") → the inner editable element.
  const fieldElsRef = useRef<Map<string, HTMLElement>>(new Map());

  // Keep the latest callbacks / values in refs so the (expensive) load effect
  // that builds listeners doesn't re-run when the parent re-renders.
  const onChangeRef = useRef(onContactFieldChange);
  onChangeRef.current = onContactFieldChange;
  const onCommitRef = useRef(onContactFieldCommit);
  onCommitRef.current = onContactFieldCommit;
  const contactValuesRef = useRef(contactValues);
  contactValuesRef.current = contactValues;
  const experienceValuesRef = useRef(experienceValues);
  experienceValuesRef.current = experienceValues;
  const onExpCommitRef = useRef(onExperienceFieldCommit);
  onExpCommitRef.current = onExperienceFieldCommit;
  const documentEditsRef = useRef(documentEdits);
  documentEditsRef.current = documentEdits;
  const onEditsRef = useRef(onDocumentEditsChange);
  onEditsRef.current = onDocumentEditsChange;
  // Previous values, so the right→left effects apply only the user's actual
  // changes — never overwriting the PDF's own text on first render (e.g. when the
  // parsed value differs only in casing/format from the document).
  const prevContactRef = useRef<ContactValues | null>(null);
  const prevExperienceRef = useRef<ExperienceValues | null>(null);

  // Persist the full current in-place edit set (called on document-run blur).
  // No-op when nothing changed, so a focus-without-edit doesn't trigger a save.
  const persistEdits = useCallback(() => {
    const host = hostRef.current;
    if (!host || !onEditsRef.current) return;
    const edits = collectEdits(host);
    const prev = documentEditsRef.current || [];
    if (JSON.stringify(edits) === JSON.stringify(prev)) return;
    onEditsRef.current(edits);
    // Optimistically update the ref so a second blur before React commits the new
    // prop doesn't re-fire the same payload.
    documentEditsRef.current = edits;
  }, []);

  useEffect(() => {
    let cancelled = false;
    let pdfDoc: { destroy: () => void } | null = null;
    const fieldEls = fieldElsRef.current;
    fieldEls.clear();
    prevContactRef.current = null;
    prevExperienceRef.current = null;

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
          // px-per-point, used by the PDF baker (Download) to map screen → PDF space.
          pageEl.dataset.pdfScale = String(scale);

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
          // can tell when it has actually changed. Assign a per-page run index
          // in pdf.js item order — value-independent, so it stays stable across
          // reloads (and binding never shifts it) for locating saved edits.
          let runIndex = 0;
          textDiv.querySelectorAll<HTMLElement>("span").forEach((span) => {
            if (!span.textContent || span.getAttribute("role") === "img") return;
            span.contentEditable = "true";
            span.spellcheck = false;
            span.dataset.orig = span.textContent;
            // Original on-screen width, so the PDF baker covers the FULL original
            // glyph run even when the replacement is shorter.
            span.dataset.origWidth = String(span.getBoundingClientRect().width);
            span.dataset.runIndex = String(runIndex++);
          });
        }

        if (cancelled) return;

        // Bind contact + experience values: locate each in the document and wrap
        // it in its own editable element so it can mirror the right-panel form.
        const targets: BindTarget[] = [];
        const cv = contactValuesRef.current || {};
        for (const f of CONTACT_FIELDS) {
          const value = (cv[f] ?? "").trim();
          if (value.length >= 2) {
            targets.push({ key: f, value, kind: f === "phone" ? "phone" : undefined });
          }
        }
        const ev = experienceValuesRef.current || {};
        for (const [key, raw] of Object.entries(ev)) {
          const value = (raw ?? "").trim();
          if (value.length >= 2) targets.push({ key, value });
        }
        bindFields(host, targets, fieldEls);

        // Restore any saved in-place edits onto their runs (located by the stable
        // pre-binding (page, runIndex) + an original-text guard).
        const restored = restoreEdits(host, documentEditsRef.current || []);

        // Sample each bound/restored field's real background + text colour from the
        // page so edits blend into the document (white-on-teal header, black-on-white
        // body, …) instead of looking like a pasted box. Wait one frame so the
        // wrapped elements have laid out before we read their geometry.
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        if (cancelled) return;
        const dprNow = window.devicePixelRatio || 1;
        for (const el of fieldEls.values()) sampleRunColors(el, dprNow);
        for (const el of restored) sampleRunColors(el, dprNow);

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

  // Right → left for experience: when an experience field changes on the right
  // (e.g. the entry modal saves), update its bound run on the document.
  useEffect(() => {
    if (state !== "ready" || !experienceValues) return;
    const prev = prevExperienceRef.current;
    prevExperienceRef.current = experienceValues;
    if (!prev) return; // first pass only records the baseline
    for (const [key, val] of Object.entries(experienceValues)) {
      if (prev[key] === val) continue; // unchanged on the right
      const el = fieldElsRef.current.get(key);
      if (!el || document.activeElement === el) continue;
      const next = val ?? "";
      if ((el.textContent ?? "") !== next) {
        el.textContent = next;
        el.classList.toggle("pdf-edited", next !== el.dataset.orig);
      }
    }
  }, [experienceValues, state]);

  // Left → right (+ Phase-1 in-place edits for non-bound runs).
  const handleInput = useCallback((e: React.FormEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;
    // First time a run is edited, blend it into the document's own colours.
    if (!target.style.getPropertyValue("--pdf-bg")) {
      sampleRunColors(target, window.devicePixelRatio || 1);
    }
    const key = target.dataset.field;
    if (key !== undefined) {
      const value = target.textContent ?? "";
      target.classList.toggle("pdf-edited", value !== target.dataset.orig);
      // Contact fields mirror live into the right-panel form; experience fields
      // persist on blur (handleBlur) to avoid a save per keystroke.
      if (!key.startsWith("exp.")) onChangeRef.current?.(key as ContactField, value);
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

  // Commit when a run loses focus: structured commit for bound fields, plus the
  // full document-edit set for any edited run (free-form or bound).
  const handleBlur = useCallback((e: React.FocusEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement | null;
    const key = target?.dataset.field;
    if (key !== undefined) {
      if (key.startsWith("exp.")) {
        // exp.<entryId>.<field> — entryId is a UUID (no dots), field has no dots.
        const [, entryId, field] = key.split(".");
        if (entryId && field) onExpCommitRef.current?.(entryId, field, target?.textContent ?? "");
      } else {
        onCommitRef.current?.();
      }
    }
    if (target?.dataset.orig !== undefined) persistEdits();
  }, [persistEdits]);

  // Bake the in-place edits into a new PDF (cover original glyphs + redraw the
  // edited text) and download it. Re-fetches the original bytes (CORS-allowed
  // S3 GET) so the page's original copy is never mutated.
  const handleDownload = useCallback(async () => {
    const host = hostRef.current;
    if (!host || downloading) return;
    setDownloading(true);
    setDownloadError(false);
    try {
      const url = await loadUrl();
      if (!url) throw new Error("no original url");
      const res = await fetch(url);
      if (!res.ok) throw new Error(`fetch original failed: ${res.status}`);
      const bytes = await res.arrayBuffer();
      const out = await bakeEditedPdf(bytes, host);
      const blob = new Blob([out], { type: "application/pdf" });
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = fileName || "resume-edited.pdf";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
    } catch {
      setDownloadError(true);
      setTimeout(() => setDownloadError(false), 4000);
    } finally {
      setDownloading(false);
    }
  }, [loadUrl, fileName, downloading]);

  return (
    <div className="flex flex-col gap-2">
      {state === "ready" && (
        <div className="flex items-center justify-between gap-3 px-1">
          <p className="text-xs text-muted-foreground">
            Editing your uploaded document — your contact and experience details stay in sync with the panel on the right.
          </p>
          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading}
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-[#065292] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#054473] disabled:opacity-60"
          >
            {downloading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            {downloading ? "Preparing…" : "Download (with edits)"}
          </button>
        </div>
      )}
      {downloadError && (
        <p className="px-1 text-xs text-[#dc2626]">Couldn&apos;t generate the PDF. Please try again.</p>
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
/**
 * Locate a phone number inside a run by its DIGIT sequence, so a stored value
 * that differs only in formatting (e.g. "407-946-3245" vs "(407) 946-3245")
 * still binds. Returns indices into the ORIGINAL text so the run keeps the
 * document's own formatting when rebuilt.
 */
function locatePhoneByDigits(text: string, value: string): { start: number; end: number } | null {
  const wanted = value.replace(/\D/g, "");
  if (wanted.length < 7) return null; // too short to be a confident phone match
  const digitIdx: number[] = [];
  let digits = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch >= "0" && ch <= "9") {
      digitIdx.push(i);
      digits += ch;
    }
  }
  const at = digits.indexOf(wanted);
  if (at < 0) return null;
  let start = digitIdx[at];
  let end = digitIdx[at + wanted.length - 1] + 1;
  // Pull in wrapping formatting so e.g. "(407) 946-3245" binds whole, not "407) 946-3245".
  while (start > 0 && (text[start - 1] === "(" || text[start - 1] === "+")) start--;
  while (end < text.length && text[end] === ")") end++;
  return { start, end };
}

/**
 * One value to bind on the document. `key` is the bound id (a contact field like
 * "phone", or an experience field like "exp.0.company"); `kind` selects a
 * specialised matcher (phone digit-normalisation) — everything else is plain
 * substring matching.
 */
export type BindTarget = { key: string; value: string; kind?: "phone" };

/** Find a target's value in a run: exact, then case-insensitive, then (phone) by digits. */
function locateTarget(text: string, target: BindTarget): { start: number; end: number } | null {
  const { value } = target;
  const exact = text.indexOf(value);
  if (exact >= 0) return { start: exact, end: exact + value.length };
  const lower = text.toLowerCase().indexOf(value.toLowerCase());
  if (lower >= 0) return { start: lower, end: lower + value.length };
  if (target.kind === "phone") return locatePhoneByDigits(text, value);
  return null;
}

/**
 * Locate each target value in the document and wrap it in its own editable
 * `[data-field]` element (keyed by `target.key`), locking the rest of the run.
 * Handles several targets in one run (e.g. a "company  dates  title  location"
 * experience line). Targets are matched in array order, so when two targets
 * share an identical value (e.g. the same location in two jobs) they bind to
 * successive occurrences in document order. A value that can't be located is
 * skipped — still editable on the right, just not mirrored.
 */
export function bindFields(
  host: HTMLElement,
  targets: BindTarget[],
  out: Map<string, HTMLElement>,
) {
  const spans = Array.from(host.querySelectorAll<HTMLElement>(".pdf-edit-layer span[data-orig]"));
  // Map preserves insertion (= array) order, which is the tie-breaker for
  // duplicate values: earlier targets claim earlier occurrences.
  const remaining = new Map<string, BindTarget>();
  for (const t of targets) {
    const value = (t.value ?? "").trim();
    if (value.length >= 2) remaining.set(t.key, { ...t, value });
  }

  for (const span of spans) {
    if (remaining.size === 0) break;
    const text = span.textContent ?? "";

    // Collect every remaining target that appears in this run.
    const matches: Array<{ key: string; start: number; end: number }> = [];
    for (const [key, t] of remaining) {
      const located = locateTarget(text, t);
      if (!located) continue;
      matches.push({ key, start: located.start, end: located.end });
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

    // Rebuild the run as: text … [field] … text, with each value its own editable
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
      fieldEl.dataset.field = m.key;
      fieldEl.dataset.orig = matched;
      fieldEl.contentEditable = "true";
      fieldEl.spellcheck = false;
      fieldEl.textContent = matched;
      span.appendChild(fieldEl);
      // Capture the bound run's original width (full value) for the PDF baker.
      fieldEl.dataset.origWidth = String(fieldEl.getBoundingClientRect().width);
      out.set(m.key, fieldEl);
      remaining.delete(m.key);
      cursor = m.end;
    }
    if (cursor < text.length) span.appendChild(document.createTextNode(text.slice(cursor)));
  }
}

/** Contact-field convenience wrapper over {@link bindFields}. */
export function bindContactFields(
  host: HTMLElement,
  values: ContactValues,
  out: Map<ContactField, HTMLElement>,
) {
  const targets: BindTarget[] = CONTACT_FIELDS.filter(
    (f) => (values[f] ?? "").trim().length >= 2,
  ).map((f) => ({
    key: f,
    value: (values[f] ?? "").trim(),
    kind: f === "phone" ? ("phone" as const) : undefined,
  }));
  bindFields(host, targets, out as Map<string, HTMLElement>);
}

/**
 * The editable run holding an edit, and the original span that owns its stable
 * (page, runIndex). For a free-form run the two are the same element; for a
 * bound field the run is the inner `[data-field]` sub-span and the owner is its
 * `[data-run-index]` ancestor (the original text-layer span).
 */
function editableRuns(host: HTMLElement): Array<{ page: number; runIndex: number; el: HTMLElement }> {
  const out: Array<{ page: number; runIndex: number; el: HTMLElement }> = [];
  host.querySelectorAll<HTMLElement>(".pdf-page").forEach((pageEl, page) => {
    pageEl.querySelectorAll<HTMLElement>("[data-orig]").forEach((el) => {
      const owner = el.closest<HTMLElement>("[data-run-index]");
      if (!owner) return;
      out.push({ page, runIndex: Number(owner.dataset.runIndex), el });
    });
  });
  return out;
}

/** Collect the current in-place edits (runs whose text differs from their original). */
export function collectEdits(host: HTMLElement): DocumentEdit[] {
  const out: DocumentEdit[] = [];
  for (const { page, runIndex, el } of editableRuns(host)) {
    const orig = el.dataset.orig ?? "";
    const text = el.textContent ?? "";
    if (text !== orig) out.push({ page, runIndex, orig, text });
  }
  return out;
}

/**
 * Re-apply saved edits onto their runs. Located by the value-independent
 * (page, runIndex) of the owning original span, then disambiguated within it by
 * the original text (`orig`). A run that can't be matched (e.g. a bound field
 * whose value diverged and no longer re-binds) is safely skipped — the panel
 * still holds its structured value. Returns the elements actually restored.
 */
export function restoreEdits(host: HTMLElement, edits: DocumentEdit[]): HTMLElement[] {
  if (!edits.length) return [];
  const restored: HTMLElement[] = [];
  const runs = editableRuns(host);
  // Consume each run once so that several edits sharing the same
  // (page, runIndex, orig) — e.g. two identical bound values on one line — map to
  // distinct runs in document order instead of all hitting the first match.
  const used = new Set<HTMLElement>();
  for (const e of edits) {
    const match = runs.find(
      (r) =>
        !used.has(r.el) &&
        r.page === e.page &&
        r.runIndex === e.runIndex &&
        (r.el.dataset.orig ?? "") === e.orig,
    );
    if (!match) continue;
    used.add(match.el);
    if ((match.el.textContent ?? "") !== e.text) {
      match.el.textContent = e.text;
      match.el.classList.add("pdf-edited");
      restored.push(match.el);
    }
  }
  return restored;
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
