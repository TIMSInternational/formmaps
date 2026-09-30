"use client";

import { MessageSquareText } from "lucide-react";
import { useTranslation } from "react-i18next";

interface PlanRationalePanelProps {
  rationale: string | null;
}

// Rationale is AI-written plain text — render as text only, never as HTML.
export function PlanRationalePanel({ rationale }: PlanRationalePanelProps) {
  const { t } = useTranslation();
  if (!rationale) return null;
  return (
    <section className="rounded-xl p-4 bg-[var(--admin-bg-panel)] border border-[var(--admin-border-default)]">
      <div className="flex items-center gap-2 mb-2">
        <MessageSquareText className="h-4 w-4 text-[var(--admin-accent-blue)]" />
        <h2 className="text-sm font-semibold text-[var(--admin-font-primary)]">
          {t("components.planRationalePanel.title")}
        </h2>
      </div>
      <p className="text-xs leading-relaxed whitespace-pre-line text-[var(--admin-font-secondary)]">
        {rationale}
      </p>
    </section>
  );
}
