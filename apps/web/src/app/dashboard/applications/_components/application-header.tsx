"use client";

import { motion } from "motion/react";
import { ArrowLeft, MapPin, Calendar } from "lucide-react";
import { TrackedApplication } from "@/services/applicationService";
import { COLUMN_LABELS, fitBadge } from "./types";

interface ApplicationHeaderProps {
  app: TrackedApplication;
  onBack: () => void;
}

export function ApplicationHeader({ app, onBack }: ApplicationHeaderProps) {
  const fit = fitBadge(app.matchScore);

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-3">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-xs w-fit transition-colors"
        style={{ color: "var(--admin-font-tertiary)" }}
      >
        <ArrowLeft className="h-3 w-3" />
        Back to tracker
      </button>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-muted-foreground">
            Application Detail
          </span>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight leading-none">
            {app.name}
          </h1>
          <div className="flex items-center gap-3 flex-wrap mt-1">
            {app.location && (
              <span className="flex items-center gap-1 text-xs" style={{ color: "var(--admin-font-tertiary)" }}>
                <MapPin className="h-3 w-3" />
                {app.location}
              </span>
            )}
            {app.deadline && (
              <span className="flex items-center gap-1 text-xs" style={{ color: "var(--admin-accent-amber)" }}>
                <Calendar className="h-3 w-3" />
                {app.deadline}
              </span>
            )}
            <span
              className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
              style={{
                background: "var(--admin-bg-hover)",
                color: "var(--admin-font-tertiary)",
                border: "1px solid var(--admin-border-light)",
              }}
            >
              {COLUMN_LABELS[app.column] ?? app.column}
            </span>
            {fit && (
              <span
                className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                style={{ background: fit.bg, color: fit.color }}
              >
                {fit.label}
              </span>
            )}
            {app.matchScore && (
              <span
                className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                style={{ background: "rgba(59,130,246,0.1)", color: "var(--admin-accent-blue)" }}
              >
                {app.matchScore}% match
              </span>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
