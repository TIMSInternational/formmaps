"use client";

import { motion } from "motion/react";
import { Save, Loader2 } from "lucide-react";
import { TrackedApplication } from "@/services/applicationService";
import { InfoRow } from "./shared";
import { COLUMN_LABELS, fitBadge } from "./types";

interface OverviewTabProps {
  app: TrackedApplication;
  notes: string;
  notesDirty: boolean;
  savingNotes: boolean;
  onNotesChange: (value: string) => void;
  onSaveNotes: () => void;
}

export function OverviewTab({ app, notes, notesDirty, savingNotes, onNotesChange, onSaveNotes }: OverviewTabProps) {
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
        <InfoRow label="Name" value={app.name} />
        <InfoRow label="Type" value={app.type ?? "—"} />
        <InfoRow label="Location" value={app.location ?? "—"} />
        <InfoRow label="Status" value={COLUMN_LABELS[app.column] ?? app.column} />
        <InfoRow label="Deadline" value={app.deadline ?? "—"} />
        {app.matchScore && <InfoRow label="Match Score" value={`${app.matchScore}%`} />}
        {fit && (
          <div className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--admin-font-tertiary)" }}>
              Fit
            </span>
            <span
              className="text-xs font-semibold px-2 py-0.5 rounded-full w-fit"
              style={{ background: fit.bg, color: fit.color }}
            >
              {fit.label}
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
            Notes
          </span>
          {notesDirty && (
            <button
              onClick={onSaveNotes}
              disabled={savingNotes}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium text-white disabled:opacity-60 transition-opacity"
              style={{ background: "var(--admin-accent-blue)" }}
            >
              {savingNotes ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
              Save
            </button>
          )}
        </div>
        <textarea
          rows={5}
          placeholder="Add notes about this application..."
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
