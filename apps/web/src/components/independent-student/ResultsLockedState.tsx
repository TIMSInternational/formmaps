"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "react-i18next";
import { Lock } from "lucide-react";
import { COMPLETE_PURCHASE_ROUTE } from "@/lib/independentStudent";

/**
 * audit 2026-10-09 C18: what a results page shows when its API answers 402 (student paywall ON, no paid
 * results). Before this the pages rendered "you have not completed this assessment" and linked back to the
 * test — a loop for a student who had finished it. The CTA carries a return URL so the purchase page brings
 * them back here once access is granted.
 */
export function ResultsLockedState({ backHref = "/dashboard/assessments" }: { backHref?: string }) {
  const { t } = useTranslation();
  const pathname = usePathname();
  const purchaseHref = `${COMPLETE_PURCHASE_ROUTE}?returnTo=${encodeURIComponent(pathname || backHref)}`;

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-card rounded-2xl border border-border shadow-sm p-8 text-center" role="status">
        <Lock className="w-12 h-12 text-[var(--admin-accent-blue)] mx-auto mb-4" />
        <h1 className="text-xl font-bold text-foreground mb-2">{t("independentStudent.resultsLocked.title")}</h1>
        <p className="text-muted-foreground mb-6">{t("independentStudent.resultsLocked.body")}</p>
        <div className="space-y-3">
          <Link
            href={purchaseHref}
            className="block w-full bg-[var(--admin-accent-blue)] text-white py-3 px-4 rounded-lg font-semibold hover:bg-[#256F76] transition-colors"
          >
            {t("independentStudent.resultsLocked.cta")}
          </Link>
          <Link href={backHref} className="block w-full text-muted-foreground py-2 text-sm hover:text-foreground">
            {t("independentStudent.resultsLocked.back")}
          </Link>
        </div>
      </div>
    </div>
  );
}
