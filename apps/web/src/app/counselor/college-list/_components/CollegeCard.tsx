"use client";

import { useState, type ReactNode } from "react";
import { BarChart3, GraduationCap, DollarSign } from "lucide-react";

interface BatchPrediction {
  collegeName: string;
  universityId?: string;
  percentageDisplay: number;
  classification: string;
  confidence: "high" | "medium" | "low";
  strengths: string[];
  weaknesses: string[];
  predictionSource?: "rule_based" | "ml_logistic" | "ml_ensemble";
  modelMetrics?: { accuracy: number; auc: number; trainedOn: number };
}

const PREDICTION_COLORS: Record<string, { bg: string; text: string }> = {
  safety: { bg: "rgba(16,185,129,0.1)", text: "#10b981" },
  likely: { bg: "rgba(59,130,246,0.1)", text: "#065292" },
  match: { bg: "rgba(99,102,241,0.1)", text: "#065292" },
  competitive: { bg: "rgba(245,158,11,0.1)", text: "#f59e0b" },
  reach: { bg: "rgba(249,115,22,0.1)", text: "#f97316" },
  high_reach: { bg: "rgba(239,68,68,0.1)", text: "#ef4444" },
};

function PredictionBadge({ prediction }: { prediction: BatchPrediction }) {
  const [showPopover, setShowPopover] = useState(false);
  const colors = PREDICTION_COLORS[prediction.classification] || PREDICTION_COLORS.match;
  return (
    <div style={{ position: "relative", display: "inline-flex" }}>
      <span
        onMouseEnter={() => setShowPopover(true)}
        onMouseLeave={() => setShowPopover(false)}
        onClick={() => setShowPopover(!showPopover)}
        style={{
          fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 6, cursor: "pointer",
          background: colors.bg, color: colors.text, whiteSpace: "nowrap",
        }}
      >
        {prediction.percentageDisplay}% {prediction.classification === "high_reach" ? "High Reach" :
          prediction.classification.charAt(0).toUpperCase() + prediction.classification.slice(1)}
      </span>
      {showPopover && (prediction.strengths.length > 0 || prediction.weaknesses.length > 0) && (
        <div style={{
          position: "absolute", top: "100%", left: 0, zIndex: 20, marginTop: 6,
          width: 260, padding: 12, borderRadius: 8,
          background: "var(--admin-bg-card)", border: "1px solid var(--admin-border-default)",
          boxShadow: "0 4px 16px rgba(0,0,0,0.12)", fontSize: 11, color: "var(--admin-font-secondary)",
        }}>
          {prediction.strengths.length > 0 && (
            <div style={{ marginBottom: prediction.weaknesses.length > 0 ? 8 : 0 }}>
              <div style={{ fontWeight: 700, color: "#10b981", marginBottom: 4 }}>Strengths</div>
              {prediction.strengths.map((s, i) => <div key={i} style={{ marginBottom: 2 }}>+ {s}</div>)}
            </div>
          )}
          {prediction.weaknesses.length > 0 && (
            <div>
              <div style={{ fontWeight: 700, color: "#ef4444", marginBottom: 4 }}>Weaknesses</div>
              {prediction.weaknesses.map((w, i) => <div key={i} style={{ marginBottom: 2 }}>- {w}</div>)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface CollegeBase {
  city: string;
  state: string;
  acceptanceRate: number | null;
  satRange: string | null;
  tuition: number | null;
}

interface CollegeSearchResult extends CollegeBase {
  id: string;
  name: string;
}

interface CollegeListItem extends CollegeBase {
  id: string;
  collegeId: string;
  collegeName: string;
  classification: "reach" | "match" | "safety";
}

interface CollegeCardProps {
  college: CollegeSearchResult | CollegeListItem;
  actions: ReactNode;
  prediction?: BatchPrediction;
}

export function CollegeCard({ college, actions, prediction }: CollegeCardProps) {
  return (
    <div style={{
      padding: 14, borderRadius: 8,
      border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)",
      transition: "background 0.1s",
    }}
    onMouseEnter={(e) => { e.currentTarget.style.background = "var(--admin-bg-hover)"; }}
    onMouseLeave={(e) => { e.currentTarget.style.background = "var(--admin-bg-card)"; }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>
              {"collegeName" in college ? college.collegeName : college.name}
            </p>
            {prediction && <PredictionBadge prediction={prediction} />}
          </div>
          <p style={{ fontSize: 11, color: "var(--admin-font-tertiary)", marginTop: 2 }}>
            {college.city}, {college.state}
          </p>
          <div style={{ display: "flex", gap: 12, marginTop: 8, flexWrap: "wrap" }}>
            {college.acceptanceRate != null && (
              <span style={{ fontSize: 11, color: "var(--admin-font-secondary)", display: "flex", alignItems: "center", gap: 4 }}>
                <BarChart3 style={{ width: 11, height: 11, color: "var(--admin-font-light)" }} />
                {(college.acceptanceRate * 100).toFixed(0)}% acceptance
              </span>
            )}
            {college.satRange && (
              <span style={{ fontSize: 11, color: "var(--admin-font-secondary)", display: "flex", alignItems: "center", gap: 4 }}>
                <GraduationCap style={{ width: 11, height: 11, color: "var(--admin-font-light)" }} />
                SAT {college.satRange}
              </span>
            )}
            {college.tuition != null && (
              <span style={{ fontSize: 11, color: "var(--admin-font-secondary)", display: "flex", alignItems: "center", gap: 4 }}>
                <DollarSign style={{ width: 11, height: 11, color: "var(--admin-font-light)" }} />
                ${college.tuition.toLocaleString()}/yr
              </span>
            )}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          {actions}
        </div>
      </div>
    </div>
  );
}
