"use client";

import React, { useState, useEffect } from "react";
import { Calendar, Loader2 } from "lucide-react";
import type { AssessmentSchedule } from "@/services/assessmentCommandService";

const GRADES = [9, 10, 11, 12];
const GRADE_LABELS: Record<number, string> = { 9: "Freshman", 10: "Sophomore", 11: "Junior", 12: "Senior" };
const ASSESSMENT_TYPES = ["PCA", "MIL", "360", "Personality"] as const;

export interface ScheduleSaveItem {
  gradeLevel: number;
  assessmentType: string;
  startDate: string;
  endDate: string;
}

export function ScheduleGrid({ schedules, onSave, isSaving }: {
  schedules: AssessmentSchedule[];
  onSave: (s: ScheduleSaveItem[]) => void;
  isSaving: boolean;
}) {
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
    const items = Object.entries(draft)
      .filter(([, v]) => v.startDate && v.endDate)
      .map(([k, v]) => {
        const [grade, type] = k.split("-");
        return { gradeLevel: parseInt(grade), assessmentType: type, startDate: v.startDate, endDate: v.endDate };
      });
    onSave(items);
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
          <Calendar style={{ width: 16, height: 16, color: "#2E9098" }} />
          <span style={{ fontSize: 14, fontWeight: 600, color: "var(--admin-font-primary)" }}>Assessment Schedule</span>
        </div>
        <button
          onClick={handleSave}
          disabled={isSaving || !dirty}
          style={{
            height: 30, borderRadius: 6, padding: "0 14px", fontSize: 11, fontWeight: 600,
            background: dirty ? "#2E9098" : "var(--admin-bg-hover)",
            color: dirty ? "#fff" : "var(--admin-font-tertiary)",
            border: dirty ? "none" : "1px solid var(--admin-border-default)",
            cursor: dirty ? "pointer" : "default",
            display: "flex", alignItems: "center", gap: 4,
          }}
        >
          {isSaving ? <Loader2 style={{ width: 12, height: 12, animation: "spin 1s linear infinite" }} /> : null}
          {dirty ? "Save Schedule" : "Saved"}
        </button>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: "var(--admin-bg-hover)" }}>
              <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, color: "var(--admin-font-tertiary)", fontSize: 10, textTransform: "uppercase" }}>Grade</th>
              {ASSESSMENT_TYPES.map(t => (
                <th key={t} colSpan={2} style={{ padding: "8px 12px", textAlign: "center", fontWeight: 600, color: "var(--admin-font-tertiary)", fontSize: 10, textTransform: "uppercase" }}>{t}</th>
              ))}
            </tr>
            <tr style={{ background: "var(--admin-bg-hover)" }}>
              <th />
              {ASSESSMENT_TYPES.map(t => (
                <React.Fragment key={t}>
                  <th style={{ padding: "4px 8px", textAlign: "center", fontWeight: 500, color: "var(--admin-font-tertiary)", fontSize: 9 }}>Start</th>
                  <th style={{ padding: "4px 8px", textAlign: "center", fontWeight: 500, color: "var(--admin-font-tertiary)", fontSize: 9 }}>End</th>
                </React.Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {GRADES.map(g => (
              <tr key={g} style={{ borderTop: "1px solid var(--admin-border-default)" }}>
                <td style={{ padding: "8px 12px", fontWeight: 600, color: "var(--admin-font-primary)" }}>
                  {g} <span style={{ fontWeight: 400, color: "var(--admin-font-tertiary)" }}>({GRADE_LABELS[g]})</span>
                </td>
                {ASSESSMENT_TYPES.map(t => {
                  const key = `${g}-${t}`;
                  const val = draft[key] || { startDate: "", endDate: "" };
                  return (
                    <React.Fragment key={t}>
                      <td style={{ padding: "4px 6px" }}>
                        <input
                          type="date"
                          value={val.startDate}
                          onChange={e => update(g, t, "startDate", e.target.value)}
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
                          onChange={e => update(g, t, "endDate", e.target.value)}
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
