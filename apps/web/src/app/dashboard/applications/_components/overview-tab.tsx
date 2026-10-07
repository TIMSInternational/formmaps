"use client";

import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { Save, Loader2 } from "lucide-react";
import { TrackedApplication } from "@/services/applicationService";
import { InfoRow } from "./shared";
import { COLUMN_LABELS, fitBadge } from "./types";
import { useDateFormat } from "@/hooks/useDateFormat";

interface OverviewTabProps {
  app: TrackedApplication;
  notes: string;
  notesDirty: boolean;
  savingNotes: boolean;
  onNotesChange: (value: string) => void;
  onSaveNotes: () => void;
}

export function OverviewTab({ app, notes, notesDirty, savingNotes, onNotesChange, onSaveNotes }: OverviewTabProps) {
  const { t } = useTranslation();
  const { formatDate } = useDateFormat();
  const fit = fitBadge(app.matchScore);

  return (
    <motion.div
      key="overview"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      className="space-y-4"
    >
      {/* Info card */}
      <div
        className="rounded-xl p-5 grid grid-cols-2 sm:grid-cols-3 gap-5"
        style={{ background: "var(--admin-bg-card)", border: "1px solid var(--admin-border-default)" }}
      >
        <InfoRow label={t("studentUi.applications.overview.name")} value={app.name} />
        <InfoRow label={t("studentUi.applications.overview.type")} value={app.type ? t(`studentUi.applications.overview.types.${app.type}`, { defaultValue: app.type }) : "—"} capitalize />
        <InfoRow label={t("studentUi.applications.overview.location")} value={app.location ?? "—"} />
        <InfoRow label={t("studentUi.applications.overview.status")} value={COLUMN_LABELS[app.column] ? t(COLUMN_LABELS[app.column]) : app.column} />
        <InfoRow label={t("studentUi.applications.overview.deadline")} value={formatDate(app.deadline)} />
        {app.matchScore && <InfoRow label={t("studentUi.applications.overview.matchScore")} value={`${app.matchScore}%`} />}
        {fit && (
          <div className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--admin-font-tertiary)" }}>
              {t("studentUi.applications.overview.fit")}
            </span>
            <span
              className="text-xs font-semibold px-2 py-0.5 rounded-full w-fit"
              style={{ background: fit.bg, color: fit.color }}
            >
              {t(fit.label)}
            </span>
          </div>
        )}
      </div>

      {/* Notes */}
      <div
        className="rounded-xl p-5 space-y-3"
        style={{ background: "var(--admin-bg-card)", border: "1px solid var(--admin-border-default)" }}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold" style={{ color: "var(--admin-font-primary)" }}>
            {t("studentUi.applications.overview.notes")}
          </span>
          {notesDirty && (
            <button
              onClick={onSaveNotes}
              disabled={savingNotes}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium text-white disabled:opacity-60 transition-opacity"
              style={{ background: "var(--admin-accent-blue)" }}
            >
              {savingNotes ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
              {t("common.save")}
            </button>
          )}
        </div>
        <textarea
          rows={5}
          placeholder={t("studentUi.applications.overview.notesPlaceholder")}
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          className="w-full px-3 py-2.5 rounded-lg text-sm outline-none resize-none"
          style={{
            background: "var(--admin-bg-input)",
            border: "1px solid var(--admin-border-default)",
            color: "var(--admin-font-primary)",
          }}
        />
      </div>
    </motion.div>
  );
}
