"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Lock } from "lucide-react";
import { getResultsPreview } from "@/services/subscriptionStatusService";

/**
 * The free results preview (#429, D4) for a student without paid results
 * (trial or unpaid): personality type, top-3 career family names, and which
 * assessments are done. The API serves ONLY these fields; full results,
 * reports and downloads answer 402 until a real charge.
 */
export function ResultsPreviewCard() {
  const { t } = useTranslation();
  const { data } = useQuery({ queryKey: ["resultsPreview"], queryFn: getResultsPreview, staleTime: 60_000 });
  if (!data || !data.resultsLocked) return null;

  const done: Array<[string, boolean]> = [
    ["pca", data.completed.pca],
    ["lia", data.completed.lia],
    ["personality", data.completed.personality],
    ["vocational360", data.completed.vocational360],
  ];

  return (
    <div className="dash-card p-4 text-left">
      <div className="flex items-center gap-2 mb-3">
        <Lock className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">{t("independentStudent.preview.title")}</h2>
      </div>
      {data.personalityType && (
        <p className="text-sm mb-2">
          {t("independentStudent.preview.personality")} <strong>{data.personalityType}</strong>
        </p>
      )}
      {data.topCareerFamilies.length > 0 && (
        <p className="text-sm mb-2">
          {t("independentStudent.preview.families")} <strong>{data.topCareerFamilies.join(" · ")}</strong>
        </p>
      )}
      <ul className="text-sm mb-3 space-y-1">
        {done.filter(([, ok]) => ok).map(([key]) => (
          <li key={key} className="flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            {t(`independentStudent.preview.completed.${key}`)}
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground mb-3">{t("independentStudent.preview.locked")}</p>
      <Link href="/subscribe" className="text-sm font-semibold text-[var(--admin-accent-blue)] hover:underline">
        {t("independentStudent.preview.unlock")}
      </Link>
    </div>
  );
}
