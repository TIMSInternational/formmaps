"use client";

import { useEffect } from "react";
import { captureError } from "@/lib/sentry";
import { pickErrorPageLang } from "@/lib/errorPageLang";

/**
 * Root-layout error boundary (audit F). app/error.tsx cannot catch a crash in the root layout itself (providers,
 * fonts, the auth wrapper); without this file Next shows its bare default page. Next requires this component to
 * render its own <html>/<body>, and nothing from the layout (CSS, i18n provider, store) is available, so the
 * copy is inline (en/es from the saved language) and the styles are inline.
 */
const COPY = {
  en: {
    title: "Something went wrong",
    desc: "FormMaps hit an unexpected error. Our team has been notified.",
    retry: "Try again",
    home: "Go to the home page",
  },
  es: {
    title: "Algo salió mal",
    desc: "FormMaps tuvo un error inesperado. Nuestro equipo ya fue notificado.",
    retry: "Intentar de nuevo",
    home: "Ir a la página de inicio",
  },
} as const;

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    captureError(error, { digest: error.digest, boundary: "global" });
  }, [error]);

  const lang = pickErrorPageLang();
  const copy = COPY[lang];

  return (
    <html lang={lang}>
      <body style={{ margin: 0, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", background: "#F7F8FA", color: "#1E3C5C" }}>
        <main
          role="alert"
          data-testid="global-error"
          style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, boxSizing: "border-box" }}
        >
          <div style={{ maxWidth: 440, textAlign: "center" }}>
            <p style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.2em", color: "#21707B", margin: "0 0 8px" }}>FORMMAPS</p>
            <h1 style={{ fontSize: 24, fontWeight: 600, margin: "0 0 8px" }}>{copy.title}</h1>
            <p style={{ fontSize: 15, lineHeight: 1.5, color: "#4A5B6E", margin: "0 0 28px" }}>{copy.desc}</p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={reset}
                style={{ border: 0, borderRadius: 8, background: "#21707B", color: "#fff", padding: "10px 22px", fontSize: 14, fontWeight: 500, cursor: "pointer" }}
              >
                {copy.retry}
              </button>
              {/* A full page load on purpose: the root layout (and with it the client router) is what crashed. */}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a
                href="/"
                style={{ borderRadius: 8, border: "1px solid #C9D2DC", color: "#1E3C5C", padding: "10px 22px", fontSize: 14, fontWeight: 500, textDecoration: "none" }}
              >
                {copy.home}
              </a>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
