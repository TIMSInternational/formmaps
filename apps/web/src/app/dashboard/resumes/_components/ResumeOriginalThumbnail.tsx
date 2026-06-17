"use client";

import React, { useEffect, useRef, useState } from "react";
import { getOriginalUrl } from "@/services/resumeService";

interface ResumeOriginalThumbnailProps {
  resumeId: string;
  fallback: React.ReactNode;
}

type RenderState = "loading" | "rendered" | "error";

/**
 * Renders page 1 of the user's ACTUAL uploaded original PDF (fetched via a
 * short-TTL presigned S3 URL) onto a canvas using pdf.js. Lazy: it only does
 * any work once scrolled into view, so a long list doesn't fire N presigns and
 * N PDF renders at once. On any failure (null URL, fetch/parse/render error) it
 * renders the provided `fallback` (the typeset preview) instead of throwing.
 */
export function ResumeOriginalThumbnail({ resumeId, fallback }: ResumeOriginalThumbnailProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [inView, setInView] = useState(false);
  const [state, setState] = useState<RenderState>("loading");

  // Lazy trigger: render only when the card scrolls into view, then stop observing.
  useEffect(() => {
    const node = containerRef.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      // No IO support — just load eagerly rather than never showing anything.
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setInView(true);
        observer.disconnect();
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!inView) return;

    let cancelled = false;
    // Holds the loaded pdf document so we can destroy it on unmount.
    let pdfDoc: { destroy: () => void } | null = null;

    (async () => {
      try {
        const url = await getOriginalUrl(resumeId);
        if (cancelled) return;
        if (!url) {
          setState("error");
          return;
        }

        // Lazy-import so pdf.js (and its worker) only loads when actually needed.
        const [pdfjs, { configurePdfWorker }] = await Promise.all([
          import("pdfjs-dist"),
          import("./pdfWorker"),
        ]);
        if (cancelled) return;

        // Bundle the worker same-origin — CSP blocks CDN workerSrc.
        configurePdfWorker();

        const doc = await pdfjs.getDocument(url).promise;
        if (cancelled) {
          doc.destroy();
          return;
        }
        pdfDoc = doc;

        const page = await doc.getPage(1);
        if (cancelled) return;

        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container) {
          setState("error");
          return;
        }
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          setState("error");
          return;
        }

        // Scale page 1 to fill the container width; top-aligned, aspect kept.
        const baseViewport = page.getViewport({ scale: 1 });
        const containerWidth = container.clientWidth || 240;
        const scale = (containerWidth / baseViewport.width) * (window.devicePixelRatio || 1);
        const viewport = page.getViewport({ scale });

        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);

        await page.render({ canvas, canvasContext: ctx, viewport }).promise;
        if (cancelled) return;

        setState("rendered");

        // The bitmap now lives on the canvas, so release the pdf.js document and
        // its Web Worker immediately. The resume grid keeps cards mounted after
        // they scroll away — without this, the page would accumulate one live
        // worker + document per viewed original. Null it first so the unmount
        // cleanup below doesn't double-destroy.
        pdfDoc = null;
        doc.destroy();
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
  }, [inView, resumeId]);

  if (state === "error") {
    return <>{fallback}</>;
  }

  return (
    <div ref={containerRef} className="absolute inset-0 overflow-hidden bg-white">
      {state === "loading" && (
        <div className="absolute inset-0 animate-pulse bg-secondary" aria-hidden="true" />
      )}
      <canvas
        ref={canvasRef}
        className="block w-full h-auto"
        style={{ display: state === "rendered" ? "block" : "none" }}
      />
    </div>
  );
}
