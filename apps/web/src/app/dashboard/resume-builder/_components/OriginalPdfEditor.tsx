"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface OriginalPdfEditorProps {
  /** Resolves to a (short-TTL signed) URL for the original PDF, or null. */
  loadUrl: () => Promise<string | null>;
}

type EditorState = "loading" | "ready" | "error";

/**
 * In-place editor for the user's ACTUAL uploaded PDF (Phase 1: live editing,
 * no save yet). Renders each page to a canvas (the exact original look), then
 * overlays pdf.js's text layer — a set of absolutely-positioned spans sitting
 * precisely over the original glyphs. Each span is made contentEditable and
 * stays transparent (the canvas shows through) until the user changes it, at
 * which point it gets an opaque white background that covers the original glyph
 * and shows the edited text in place. So untouched text is the crisp original
 * document, and edits appear exactly where the original text was.
 *
 * Intentional Phase-1 limits: text replacement only (no add/remove/reorder),
 * no reflow, no persistence. Save/download is a later phase.
 */
export function OriginalPdfEditor({ loadUrl }: OriginalPdfEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<EditorState>("loading");

  useEffect(() => {
    let cancelled = false;
    let pdfDoc: { destroy: () => void } | null = null;

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
          pageEl.className = "relative mx-auto mb-4 bg-white shadow-sm rounded-sm overflow-hidden";
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
          const ctx = canvas.getContext("2d");
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

        if (!cancelled) setState("ready");
      } catch {
        if (!cancelled) setState("error");
      }
    })();

    return () => {
      cancelled = true;
      try {
        pdfDoc?.destroy();
      } catch {
        // ignore destroy errors on unmount
      }
    };
  }, [loadUrl]);

  // A run is "edited" once its text differs from the original — then we cover
  // the original glyph (opaque white) and show the new text in place.
  const handleInput = useCallback((e: React.FormEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement | null;
    if (!target || target.dataset.orig === undefined) return;
    target.classList.toggle("pdf-edited", target.textContent !== target.dataset.orig);
  }, []);

  return (
    <div className="flex flex-col gap-2">
      {state === "ready" && (
        <p className="px-1 text-xs text-muted-foreground">
          Editing your uploaded document — click any text to change it in place. Saving &amp; download are coming next.
        </p>
      )}
      {state === "loading" && (
        <div className="p-6 text-sm text-muted-foreground">Loading your document for editing…</div>
      )}
      {state === "error" && (
        <div className="p-6 text-sm text-muted-foreground">Couldn&apos;t load your document for editing.</div>
      )}
      <div ref={hostRef} onInput={handleInput} className="w-full" />
    </div>
  );
}
