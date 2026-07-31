import { GlobalWorkerOptions } from "pdfjs-dist";

/**
 * Configure pdf.js to load its worker bundled SAME-ORIGIN. The app CSP blocks
 * CDN workerSrc, so we resolve the worker shipped inside node_modules via the
 * bundler. Isolated in its own module because `import.meta.url` is ESM-only
 * syntax (ts-jest's CommonJS transform can't parse it) — tests mock this module.
 */
let configured = false;

export function configurePdfWorker(): void {
  if (configured) return;
  GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();
  configured = true;
}
