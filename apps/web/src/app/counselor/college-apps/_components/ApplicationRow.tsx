"use client";

import { Trash2 } from "lucide-react";

interface Application {
  id: string;
  collegeName: string;
  universityId?: string;
  fit: "reach" | "match" | "safety";
  deadlineType: "ED" | "EA" | "RD" | "Rolling";
  deadlineDate: string;
  status: "researching" | "applying" | "submitted" | "accepted" | "rejected" | "waitlisted" | "enrolled";
}

interface BatchPrediction {
  collegeName: string;
  universityId?: string;
  percentageDisplay: number;
  classification: string;
  confidence: "high" | "medium" | "low";
  predictionSource?: "rule_based" | "ml_logistic" | "ml_ensemble";
  modelMetrics?: { accuracy: number; auc: number; trainedOn: number };
}

const PREDICTION_COLORS: Record<string, { bg: string; text: string }> = {
  safety: { bg: "rgba(16,185,129,0.1)", text: "#10b981" },
  likely: { bg: "rgba(59,130,246,0.1)", text: "#2E9098" },
  match: { bg: "rgba(99,102,241,0.1)", text: "#2E9098" },
  competitive: { bg: "rgba(245,158,11,0.1)", text: "#f59e0b" },
  reach: { bg: "rgba(249,115,22,0.1)", text: "#f97316" },
  high_reach: { bg: "rgba(239,68,68,0.1)", text: "#ef4444" },
};

const CONFIDENCE_COLORS: Record<string, string> = {
  high: "#10b981",
  medium: "#f59e0b",
  low: "#ef4444",
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  researching: { label: "Researching", color: "#6b7280", bg: "rgba(107,114,128,0.1)" },
  applying: { label: "Applying", color: "#2E9098", bg: "rgba(59,130,246,0.1)" },
  submitted: { label: "Submitted", color: "#f59e0b", bg: "rgba(245,158,11,0.1)" },
  accepted: { label: "Accepted", color: "#10b981", bg: "rgba(16,185,129,0.1)" },
  rejected: { label: "Rejected", color: "#ef4444", bg: "rgba(239,68,68,0.1)" },
  waitlisted: { label: "Waitlisted", color: "#f97316", bg: "rgba(249,115,22,0.1)" },
  enrolled: { label: "Enrolled", color: "#059669", bg: "rgba(5,150,105,0.1)" },
};

const FIT_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  reach: { label: "Reach", color: "#ef4444", bg: "rgba(239,68,68,0.1)" },
  match: { label: "Match", color: "#f59e0b", bg: "rgba(245,158,11,0.1)" },
  safety: { label: "Safety", color: "#10b981", bg: "rgba(16,185,129,0.1)" },
};

const STATUSES = ["researching", "applying", "submitted", "accepted", "rejected", "waitlisted", "enrolled"] as const;

interface ApplicationRowProps {
  app: Application;
  prediction?: BatchPrediction;
  isLast: boolean;
  onStatusChange: (appId: string, status: string, app: Application) => void;
  onDelete: (appId: string) => void;
  deleteDisabled: boolean;
}

export function ApplicationRow({ app, prediction, isLast, onStatusChange, onDelete, deleteDisabled }: ApplicationRowProps) {
  const statusCfg = STATUS_CONFIG[app.status] || STATUS_CONFIG.researching;
  const fitCfg = FIT_CONFIG[app.fit] || FIT_CONFIG.match;
  const predColors = prediction ? (PREDICTION_COLORS[prediction.classification] || PREDICTION_COLORS.match) : null;

  return (
    <div style={{
      display: "grid", gridTemplateColumns: "1.8fr 1fr 0.8fr 0.8fr 1fr 1fr 0.6fr",
      padding: "12px 16px", alignItems: "center",
      borderBottom: isLast ? "none" : "1px solid var(--admin-border-light)",
      transition: "background 0.1s",
    }}
    onMouseEnter={(e) => { e.currentTarget.style.background = "var(--admin-bg-hover)"; }}
    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
    >
      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>{app.collegeName}</span>
      {/* Chances column */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {prediction ? (
          <>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 6,
              background: predColors!.bg, color: predColors!.text,
            }}>
              <span style={{
                width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
                background: CONFIDENCE_COLORS[prediction.confidence] || CONFIDENCE_COLORS.low,
              }} title={`${prediction.confidence} confidence`} />
              {prediction.percentageDisplay}%
            </span>
            <span style={{ fontSize: 10, color: "var(--admin-font-tertiary)" }}>
              {prediction.predictionSource && prediction.predictionSource !== "rule_based"
                ? `ML${prediction.modelMetrics ? ` (${Math.round(prediction.modelMetrics.accuracy * 100)}%)` : ""}`
                : "Est."}
            </span>
          </>
        ) : (
          <span style={{ fontSize: 11, color: "var(--admin-font-light)" }}>...</span>
        )}
      </div>
      <span style={{
        display: "inline-flex", alignItems: "center", fontSize: 11, fontWeight: 600,
        padding: "3px 10px", borderRadius: 6, width: "fit-content",
        background: fitCfg.bg, color: fitCfg.color,
      }}>
        {fitCfg.label}
      </span>
      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--admin-font-secondary)" }}>{app.deadlineType}</span>
      <span style={{ fontSize: 12, color: "var(--admin-font-secondary)" }}>
        {new Date(app.deadlineDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
      </span>
      <div>
        <select
          value={app.status}
          onChange={(e) => onStatusChange(app.id, e.target.value, app)}
          style={{
            height: 28, borderRadius: 6, padding: "0 6px", fontSize: 11, fontWeight: 600,
            border: "1px solid var(--admin-border-default)",
            background: statusCfg.bg, color: statusCfg.color,
            outline: "none", cursor: "pointer", fontFamily: "inherit",
          }}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
          ))}
        </select>
      </div>
      <div>
        <button
          onClick={() => onDelete(app.id)}
          disabled={deleteDisabled}
          title="Remove application"
          style={{
            width: 28, height: 28, borderRadius: 6,
            border: "1px solid var(--admin-border-default)", background: "transparent",
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <Trash2 style={{ width: 12, height: 12, color: "#ef4444" }} />
        </button>
      </div>
    </div>
  );
}
