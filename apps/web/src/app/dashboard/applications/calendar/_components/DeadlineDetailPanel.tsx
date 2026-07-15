"use client";

import { motion } from "motion/react";
import { Calendar, GraduationCap, X } from "lucide-react";
import { TrackedApplication } from "@/services/applicationService";

interface DotColor {
  dot: string;
  bg: string;
  text: string;
}

interface DeadlineDetailPanelProps {
  selectedDay: string;
  selectedApps: TrackedApplication[];
  appColorIndex: Map<string, number>;
  dotColors: DotColor[];
  onClose: () => void;
}

const COLUMN_LABELS: Record<string, string> = {
  researching: "Researching",
  shortlisted: "Shortlisted",
  applying: "Applying",
  applied: "Applied",
  accepted: "Accepted",
};

export function DeadlineDetailPanel({
  selectedDay,
  selectedApps,
  appColorIndex,
  dotColors,
  onClose,
}: DeadlineDetailPanelProps) {
  return (
    <motion.div
      key={selectedDay}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 4 }}
      className="rounded-2xl p-5 space-y-3"
      style={{ background: "var(--admin-bg-card)", border: "1px solid var(--admin-border-default)" }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4" style={{ color: "var(--admin-accent-blue)" }} />
          <span className="text-sm font-semibold" style={{ color: "var(--admin-font-primary)" }}>
            {(() => {
              const [y, m, d] = selectedDay.split("-").map(Number);
              return new Date(y, m - 1, d).toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
                year: "numeric",
              });
            })()}
          </span>
          <span
            className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
            style={{ background: "rgba(59,130,246,0.1)", color: "var(--admin-accent-blue)" }}
          >
            {selectedApps.length} deadline{selectedApps.length !== 1 ? "s" : ""}
          </span>
        </div>
        <button onClick={onClose}>
          <X className="h-4 w-4" style={{ color: "var(--admin-font-tertiary)" }} />
        </button>
      </div>

      <div className="space-y-2">
        {selectedApps.map((app) => {
          const ci = appColorIndex.get(app.id) ?? 0;
          const color = dotColors[ci];
          return (
            <div
              key={app.id}
              className="flex items-center gap-3 px-4 py-3 rounded-xl"
              style={{ background: color.bg, border: `1px solid ${color.dot}25` }}
            >
              <span
                className="h-2.5 w-2.5 rounded-full shrink-0"
                style={{ background: color.dot }}
              />
              <GraduationCap className="h-4 w-4 shrink-0" style={{ color: color.text }} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate" style={{ color: "var(--admin-font-primary)" }}>
                  {app.name}
                </div>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  {app.location && (
                    <span className="text-[11px]" style={{ color: "var(--admin-font-tertiary)" }}>
                      {app.location}
                    </span>
                  )}
                  <span
                    className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                    style={{
                      background: "var(--admin-bg-hover)",
                      color: "var(--admin-font-tertiary)",
                    }}
                  >
                    {COLUMN_LABELS[app.column] ?? app.column}
                  </span>
                </div>
              </div>
              {app.matchScore && (
                <span
                  className="text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0"
                  style={{ background: "rgba(59,130,246,0.1)", color: "var(--admin-accent-blue)" }}
                >
                  {app.matchScore}%
                </span>
              )}
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
