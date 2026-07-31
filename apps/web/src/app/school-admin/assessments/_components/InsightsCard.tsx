"use client";

import { Sparkles, RefreshCw } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { InsightsData } from "@/services/assessmentCommandService";

const EXAM_SHORT: Record<string, string> = {
  PatternRecognition: "Pattern", VerbalReasoning: "Verbal",
  WorkingMemory: "Memory", NumericVelocity: "Numeric", VisualRotation: "Rotation",
};

function MetricChip({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div style={{
      padding: "6px 12px", borderRadius: 6, background: `${color}10`,
      border: `1px solid ${color}20`,
    }}>
      <div style={{ fontSize: 16, fontWeight: 700, color, letterSpacing: "-0.02em" }}>{value}</div>
      <div style={{ fontSize: 9, fontWeight: 600, color: "var(--admin-font-tertiary)", textTransform: "uppercase" }}>{label}</div>
    </div>
  );
}

export function InsightsCard({ insights, onRefresh, isRefreshing }: {
  insights: InsightsData | undefined;
  onRefresh: () => void;
  isRefreshing: boolean;
}) {
  if (!insights?.hasEnoughData) {
    const completion = insights?.completion;
    const pct = completion && completion.total > 0
      ? Math.round((completion.complete / completion.total) * 100)
      : 0;
    return (
      <div style={{
        borderRadius: 8, border: "1px solid var(--admin-border-default)",
        background: "var(--admin-bg-card)", padding: 20,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <Sparkles style={{ width: 16, height: 16, color: "#8b5cf6" }} />
          <span style={{ fontSize: 14, fontWeight: 600, color: "var(--admin-font-primary)" }}>AI School Insights</span>
        </div>
        {completion && completion.total > 0 ? (
          <>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 13, color: "var(--admin-font-secondary)" }}>
                <strong style={{ color: "var(--admin-font-primary)", fontWeight: 700 }}>{`${completion.complete} / ${completion.total}`}</strong> students completed all assessments
              </span>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#2E9098" }}>{pct}%</span>
            </div>
            <div style={{ height: 6, borderRadius: 4, background: "var(--admin-bg-hover)", overflow: "hidden", marginBottom: 10 }}>
              <div style={{ height: "100%", width: `${pct}%`, background: "#102B47", borderRadius: 4, transition: "width 0.3s ease" }} />
            </div>
            <p style={{ fontSize: 12, color: "var(--admin-font-tertiary)", marginBottom: 10 }}>
              Insights unlock when 100% of students finish.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {[
                { label: "MIL", value: completion.byComponent.lia },
                { label: "PCA", value: completion.byComponent.disc },
                { label: "360", value: completion.byComponent.eval360 },
              ].map(c => (
                <span key={c.label} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: "var(--admin-bg-hover)", color: "var(--admin-font-secondary)" }}>
                  {c.label}: {c.value}/{completion.total}
                </span>
              ))}
            </div>
          </>
        ) : (
          <p style={{ fontSize: 13, color: "var(--admin-font-tertiary)" }}>
            {insights?.message || "Insights will appear once enough students complete assessments."}
          </p>
        )}
      </div>
    );
  }

  const agg = insights.aggregates!;
  return (
    <div style={{
      borderRadius: 8, border: "1px solid var(--admin-border-default)",
      background: "var(--admin-bg-card)", padding: 20,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Sparkles style={{ width: 16, height: 16, color: "#8b5cf6" }} />
          <span style={{ fontSize: 14, fontWeight: 600, color: "var(--admin-font-primary)" }}>AI School Insights</span>
          {insights.cached && (
            <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: "var(--admin-bg-hover)", color: "var(--admin-font-tertiary)" }}>Cached</span>
          )}
        </div>
        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          style={{
            height: 30, borderRadius: 6, padding: "0 10px", fontSize: 11, fontWeight: 500,
            display: "flex", alignItems: "center", gap: 4,
            background: "transparent", color: "var(--admin-font-tertiary)",
            border: "1px solid var(--admin-border-default)", cursor: "pointer",
          }}
        >
          <RefreshCw style={{ width: 12, height: 12, animation: isRefreshing ? "spin 1s linear infinite" : "none" }} />
          Refresh
        </button>
      </div>

      {/* Narrative */}
      {insights.narrative && (
        <div style={{ fontSize: 13, color: "var(--admin-font-secondary)", lineHeight: 1.6, marginBottom: 16, padding: 12, borderRadius: 6, background: "var(--admin-bg-hover)" }}>
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              p: ({ children }) => <p style={{ marginBottom: 6 }}>{children}</p>,
              strong: ({ children }) => <strong style={{ fontWeight: 600, color: "var(--admin-font-primary)" }}>{children}</strong>,
              ul: ({ children }) => <ul style={{ paddingLeft: 16, marginBottom: 6 }}>{children}</ul>,
              ol: ({ children }) => <ol style={{ paddingLeft: 16, marginBottom: 6 }}>{children}</ol>,
              li: ({ children }) => <li style={{ marginBottom: 2 }}>{children}</li>,
              h1: ({ children }) => <h1 style={{ fontSize: 14, fontWeight: 600, color: "var(--admin-font-primary)", margin: "4px 0" }}>{children}</h1>,
              h2: ({ children }) => <h2 style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)", margin: "4px 0" }}>{children}</h2>,
              h3: ({ children }) => <h3 style={{ fontSize: 12, fontWeight: 600, color: "var(--admin-font-primary)", margin: "4px 0" }}>{children}</h3>,
              code: ({ children }) => (
                <code style={{ padding: "1px 4px", borderRadius: 3, fontSize: 11, background: "var(--admin-bg-hover)", color: "var(--admin-accent-blue)" }}>
                  {children}
                </code>
              ),
              a: ({ children, href }) => (
                <a href={href} style={{ color: "var(--admin-accent-blue)" }}>{children}</a>
              ),
            }}
          >
            {insights.narrative}
          </ReactMarkdown>
        </div>
      )}

      {/* Metric chips */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <MetricChip label="Students" value={agg.totalStudents} color="#2E9098" />
        <MetricChip label="Profiles" value={agg.profilesComplete} color="#10b981" />
        <MetricChip label="360 Reviews" value={agg.eval360Count} color="#f59e0b" />
        {Object.entries(agg.pcaAverages).map(([k, v]) => (
          <MetricChip key={k} label={EXAM_SHORT[k] || k} value={`${v}%`} color="#8b5cf6" />
        ))}
      </div>

      {/* DISC + Career */}
      {(agg.discDistribution || agg.topCareerClusters?.length > 0) && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginTop: 14 }}>
          {agg.discDistribution && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: "var(--admin-font-tertiary)", textTransform: "uppercase", marginBottom: 4 }}>PCA Distribution</div>
              <div style={{ display: "flex", gap: 6 }}>
                {Object.entries(agg.discDistribution).map(([k, v]) => (
                  <span key={k} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: "var(--admin-bg-hover)", color: "var(--admin-font-secondary)" }}>
                    {k}: {v}
                  </span>
                ))}
              </div>
            </div>
          )}
          {agg.topCareerClusters?.length > 0 && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: "var(--admin-font-tertiary)", textTransform: "uppercase", marginBottom: 4 }}>Top Career Clusters</div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {agg.topCareerClusters.map(c => (
                  <span key={c.name} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: "var(--admin-bg-hover)", color: "var(--admin-font-secondary)" }}>
                    {c.name} ({c.count})
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
