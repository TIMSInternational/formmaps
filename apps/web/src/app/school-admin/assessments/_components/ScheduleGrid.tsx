"use client";

import React, { useState, useEffect } from "react";
import { Calendar, Loader2 } from "lucide-react";
import type { AssessmentSchedule } from "@/services/assessmentCommandService";
import { useTranslation } from "react-i18next";

const GRADES = [9, 10, 11, 12];
const ASSESSMENT_TYPES = ["PCA", "MIL", "360", "Personality"] as const;

export interface ScheduleSaveItem {
  gradeLevel: number;
  assessmentType: string;
  startDate?: string;
  endDate?: string;
  /** Remove this grade × type window (both dates were emptied). */
  clear?: boolean;
}

/** What to save: every complete cell, plus a clear for each saved window whose dates were both emptied. */
export function scheduleSaveItems(
  saved: { gradeLevel: number; assessmentType: string }[],
  draft: Record<string, { startDate: string; endDate: string }>,
): ScheduleSaveItem[] {
  const items: ScheduleSaveItem[] = Object.entries(draft)
    .filter(([, v]) => v.startDate && v.endDate)
    .map(([k, v]) => {
      const [grade, type] = k.split("-");
      return { gradeLevel: parseInt(grade), assessmentType: type, startDate: v.startDate, endDate: v.endDate };
    });
  for (const s of saved) {
    const v = draft[`${s.gradeLevel}-${s.assessmentType}`];
    if (v && !v.startDate && !v.endDate) items.push({ gradeLevel: s.gradeLevel, assessmentType: s.assessmentType, clear: true });
  }
  return items;
}

export function ScheduleGrid({ schedules, onSave, isSaving }: {
  schedules: AssessmentSchedule[];
  onSave: (s: ScheduleSaveItem[]) => void;
  isSaving: boolean;
}) {
  const { t } = useTranslation("school_admin");
  // Assessment-type codes are data keys (saved as-is); only "Personality" needs a translated label.
  const typeLabel = (type: string) => (type === "Personality" ? t("assessments.pipeline.colPersonality") : type);
  const [draft, setDraft] = useState<Record<string, { startDate: string; endDate: string }>>({});
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const map: Record<string, { startDate: string; endDate: string }> = {};
    for (const s of schedules) {
      map[`${s.gradeLevel}-${s.assessmentType}`] = {
        startDate: s.startDate.split("T")[0],
        endDate: s.endDate.split("T")[0],
      };
    }
    setDraft(map);
  }, [schedules]);

  const update = (grade: number, type: string, field: "startDate" | "endDate", val: string) => {
    const key = `${grade}-${type}`;
    setDraft(prev => ({ ...prev, [key]: { ...prev[key] || { startDate: "", endDate: "" }, [field]: val } }));
    setDirty(true);
  };

  const handleSave = () => {
    onSave(scheduleSaveItems(schedules, draft));
    setDirty(false);
  };

  return (
    <div style={{
      borderRadius: 8, border: "1px solid var(--admin-border-default)",
      background: "var(--admin-bg-card)", overflow: "hidden",
    }}>
      <div style={{
        padding: "12px 16px", borderBottom: "1px solid var(--admin-border-default)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Calendar style={{ width: 16, height: 16, color: "var(--admin-accent-blue)" }} />
          <span style={{ fontSize: 14, fontWeight: 600, color: "var(--admin-font-primary)" }}>{t("assessments.schedule.title")}</span>
        </div>
        <button
          onClick={handleSave}
          disabled={isSaving || !dirty}
          style={{
            height: 30, borderRadius: 6, padding: "0 14px", fontSize: 11, fontWeight: 600,
            background: dirty ? "var(--admin-accent-blue)" : "var(--admin-bg-hover)",
            color: dirty ? "#fff" : "var(--admin-font-tertiary)",
            border: dirty ? "none" : "1px solid var(--admin-border-default)",
            cursor: dirty ? "pointer" : "default",
            display: "flex", alignItems: "center", gap: 4,
          }}
        >
          {isSaving ? <Loader2 style={{ width: 12, height: 12, animation: "spin 1s linear infinite" }} /> : null}
          {dirty ? t("assessments.schedule.save") : t("assessments.schedule.saved")}
        </button>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: "var(--admin-bg-hover)" }}>
              <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, color: "var(--admin-font-tertiary)", fontSize: 10, textTransform: "uppercase" }}>{t("counselor:pipeline.colGrade")}</th>
              {ASSESSMENT_TYPES.map(type => (
                <th key={type} colSpan={2} style={{ padding: "8px 12px", textAlign: "center", fontWeight: 600, color: "var(--admin-font-tertiary)", fontSize: 10, textTransform: "uppercase" }}>{typeLabel(type)}</th>
              ))}
            </tr>
            <tr style={{ background: "var(--admin-bg-hover)" }}>
              <th />
              {ASSESSMENT_TYPES.map(type => (
                <React.Fragment key={type}>
                  <th style={{ padding: "4px 8px", textAlign: "center", fontWeight: 500, color: "var(--admin-font-tertiary)", fontSize: 9 }}>{t("assessments.schedule.start")}</th>
                  <th style={{ padding: "4px 8px", textAlign: "center", fontWeight: 500, color: "var(--admin-font-tertiary)", fontSize: 9 }}>{t("assessments.schedule.end")}</th>
                </React.Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {GRADES.map(g => (
              <tr key={g} style={{ borderTop: "1px solid var(--admin-border-default)" }}>
                <td style={{ padding: "8px 12px", fontWeight: 600, color: "var(--admin-font-primary)" }}>
                  {g} <span style={{ fontWeight: 400, color: "var(--admin-font-tertiary)" }}>({t(`analytics.gradeLabels.${g}`)})</span>
                </td>
                {ASSESSMENT_TYPES.map(type => {
                  const key = `${g}-${type}`;
                  const val = draft[key] || { startDate: "", endDate: "" };
                  return (
                    <React.Fragment key={type}>
                      <td style={{ padding: "4px 6px" }}>
                        <input
                          type="date"
                          value={val.startDate}
                          onChange={e => update(g, type, "startDate", e.target.value)}
                          style={{
                            width: "100%", fontSize: 11, padding: "4px 6px", borderRadius: 4,
                            border: "1px solid var(--admin-border-default)",
                            background: "var(--admin-bg-input)", color: "var(--admin-font-primary)",
                          }}
                        />
                      </td>
                      <td style={{ padding: "4px 6px" }}>
                        <input
                          type="date"
                          value={val.endDate}
                          onChange={e => update(g, type, "endDate", e.target.value)}
                          style={{
                            width: "100%", fontSize: 11, padding: "4px 6px", borderRadius: 4,
                            border: "1px solid var(--admin-border-default)",
                            background: "var(--admin-bg-input)", color: "var(--admin-font-primary)",
                          }}
                        />
                      </td>
                    </React.Fragment>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
