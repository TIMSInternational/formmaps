"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { AlertCircle, RefreshCw } from "lucide-react";
import { captureError } from "@/lib/sentry";

/**
 * Student dashboard error boundary (audit F). A crash in one dashboard page used to fall through to the root
 * app/error.tsx, which replaces the whole screen; this keeps the dashboard layout (sidebar, header) and
 * offers Retry in place. The layout's providers are still mounted here, so translations are available.
 */
export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useTranslation();

  useEffect(() => {
    captureError(error, { digest: error.digest, boundary: "dashboard" });
  }, [error]);

  return (
    <div role="alert" data-testid="dashboard-error" className="flex flex-col items-center justify-center py-20 px-4 text-center">
      <div
        className="flex items-center justify-center rounded-full mb-4"
        style={{ width: 56, height: 56, background: "var(--admin-accent-bg-red, rgba(239,68,68,0.1))" }}
      >
        <AlertCircle className="h-6 w-6" style={{ color: "var(--admin-accent-red, #ef4444)" }} />
      </div>
      <h2 className="text-lg font-semibold mb-1" style={{ color: "var(--admin-font-primary, var(--foreground))" }}>
        {t("error.somethingWentWrong")}
      </h2>
      <p className="text-sm mb-6 max-w-sm" style={{ color: "var(--admin-font-tertiary, var(--muted-foreground))" }}>
        {t("error.unexpectedError")}
      </p>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center gap-2 rounded-md bg-[var(--admin-accent-blue)] px-4 py-2 text-sm font-medium text-white"
        >
          <RefreshCw className="h-4 w-4" />
          {t("error.tryAgain")}
        </button>
        <Link
          href="/dashboard"
          className="inline-flex items-center rounded-md border px-4 py-2 text-sm font-medium"
          style={{ borderColor: "var(--admin-border-default, var(--border))" }}
        >
          {t("error.notFound.goToDashboard")}
        </Link>
      </div>
    </div>
  );
}
