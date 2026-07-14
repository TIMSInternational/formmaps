"use client";

import { useEffect } from "react";
import { captureError } from "@/lib/sentry";
import { useGlobalStore } from "@/store/useGlobalStore";
import { roleHomeMap, normalizeRole } from "@/lib/roleUtils";

// This is the route error boundary — it must be self-contained and never throw.
// It reads the locale + role defensively (no hooks/providers that a broken
// render could have taken down) so it always renders and always sends the user
// back to THEIR portal (parents to /parent, not /dashboard).
function pickLang(): "es" | "en" {
  try {
    const raw = (typeof window !== "undefined" ? localStorage.getItem("i18nextLng") || navigator.language || "" : "");
    if (raw.toLowerCase().startsWith("es")) return "es";
  } catch {
    /* ignore — fall back to English */
  }
  return "en";
}

function pickHome(): string {
  try {
    const role = useGlobalStore.getState().user?.role;
    const home = roleHomeMap[normalizeRole(role)];
    if (home) return home;
  } catch {
    /* ignore — fall back below */
  }
  return "/dashboard";
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    captureError(error, { digest: error.digest });
  }, [error]);

  const lang = pickLang();
  const home = pickHome();
  const copy =
    lang === "es"
      ? {
          title: "Algo salió mal",
          desc: "Ocurrió un error inesperado. Nuestro equipo ya fue notificado.",
          retry: "Intentar de nuevo",
          home: "Volver al inicio",
        }
      : {
          title: "Something went wrong",
          desc: "An unexpected error occurred. Our team has been notified.",
          retry: "Try again",
          home: "Back to home",
        };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="text-center max-w-md">
        <h1 className="text-7xl font-bold text-red-500 mb-4">500</h1>
        <h2 className="text-2xl font-semibold mb-2">{copy.title}</h2>
        <p className="text-muted-foreground mb-8">{copy.desc}</p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={reset}
            className="inline-flex items-center justify-center rounded-md bg-[#2E9098] px-6 py-2.5 text-sm font-medium text-white hover:bg-[#247379] transition-colors"
          >
            {copy.retry}
          </button>
          <a
            href={home}
            className="inline-flex items-center justify-center rounded-md border border-gray-300 px-6 py-2.5 text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            {copy.home}
          </a>
        </div>
      </div>
    </main>
  );
}
