"use client";

import {
  GraduationCap,
  BarChart3,
  TrendingUp,
  Users,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { format } from "date-fns";
import { Card, CardHeader } from "./shared-ui";
import type { EvaluationGroupWithId } from "@/services/evaluationService";
import type { StudentGpa } from "@/services/transcriptService";

interface GraduationProgress {
  totalCreditsEarned: number;
  totalCreditsRequired: number;
  isOnTrack: boolean;
}

interface OverviewTabProps {
  graduationProgress?: GraduationProgress | null;
  gpaData?: StudentGpa | null;
  milCompleted: number;
  milTotal: number;
  pcaCompleted: number;
  pcaTotal: number;
  evalCompleted: number;
  evalTotal: number;
  evalGroups?: EvaluationGroupWithId[] | null;
}

export function OverviewTab({
  graduationProgress,
  gpaData,
  milCompleted,
  milTotal,
  pcaCompleted,
  pcaTotal,
  evalCompleted,
  evalTotal,
  evalGroups,
}: OverviewTabProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Graduation Progress */}
      <Card>
        <CardHeader icon={GraduationCap} color="#065292" title="Graduation Pathway" />
        <div style={{ padding: 16 }}>
          {graduationProgress ? (
            <div className="space-y-4">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end" }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: "var(--admin-font-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Credits Acquired</div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: "var(--admin-font-primary)", marginTop: 2 }}>
                    {graduationProgress.totalCreditsEarned} <span style={{ fontSize: 14, color: "var(--admin-font-tertiary)", fontWeight: 400 }}>/ {graduationProgress.totalCreditsRequired} req.</span>
                  </div>
                </div>
                <span style={{
                  fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 3,
                  background: graduationProgress.isOnTrack ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)",
                  color: graduationProgress.isOnTrack ? "#10b981" : "#ef4444",
                }}>
                  {graduationProgress.isOnTrack ? "On Track" : "At Risk"}
                </span>
              </div>
              <Progress
                value={graduationProgress.totalCreditsRequired ? (graduationProgress.totalCreditsEarned / graduationProgress.totalCreditsRequired) * 100 : 0}
                className="h-2"
              />
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: "20px 0", color: "var(--admin-font-tertiary)", fontSize: 12 }}>
              Graduation data is not fully calculated yet.
            </div>
          )}
        </div>
      </Card>

      {/* GPA & Transcript Summary */}
      <Card>
        <CardHeader icon={BarChart3} color="#f59e0b" title="GPA & Academic Standing" />
        <div style={{ padding: 16 }}>
          {gpaData ? (
            <div className="space-y-3">
              <div style={{ display: "flex", gap: 16 }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: "var(--admin-font-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Weighted GPA</div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: "var(--admin-font-primary)", marginTop: 2 }}>
                    {gpaData.gpaWeighted?.toFixed(2) ?? "\u2014"}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: "var(--admin-font-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Unweighted</div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: "var(--admin-font-primary)", marginTop: 2 }}>
                    {gpaData.gpaUnweighted?.toFixed(2) ?? "\u2014"}
                  </div>
                </div>
                {gpaData.classRank && (
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 600, color: "var(--admin-font-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Class Rank</div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: "var(--admin-font-primary)", marginTop: 2 }}>
                      #{gpaData.classRank} <span style={{ fontSize: 12, color: "var(--admin-font-tertiary)", fontWeight: 400 }}>/ {gpaData.classSize}</span>
                    </div>
                  </div>
                )}
              </div>
              <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>
                Total Credits: {gpaData.totalCredits} {gpaData.computedAt && `| Last computed: ${format(new Date(gpaData.computedAt), "MMM d, yyyy")}`}
              </div>
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: "20px 0", color: "var(--admin-font-tertiary)", fontSize: 12 }}>
              No GPA data computed yet.
            </div>
          )}
        </div>
      </Card>

      {/* Assessment Completion Summary */}
      <Card>
        <CardHeader icon={TrendingUp} color="#14b8a6" title="Assessment Completion" />
        <div style={{ padding: 16 }} className="space-y-3">
          {[
            { label: "MIL / LIA", completed: milCompleted, total: milTotal, color: "#065292" },
            { label: "PCA Exams", completed: pcaCompleted, total: pcaTotal || 1, color: "#8b5cf6" },
            { label: "360 Evaluations", completed: evalCompleted, total: evalTotal || 1, color: "#14b8a6" },
          ].map((item) => {
            const pct = item.total > 0 ? Math.round((item.completed / item.total) * 100) : 0;
            return (
              <div key={item.label}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--admin-font-primary)" }}>{item.label}</span>
                  <span style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>{item.completed}/{item.total} ({pct}%)</span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: "var(--admin-bg-hover)", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${pct}%`, borderRadius: 3, background: item.color, transition: "width 0.3s" }} />
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* 360 Evaluation Status */}
      <Card>
        <CardHeader icon={Users} color="#ec4899" title="360 Evaluation Status" badge={
          evalTotal > 0 ? (
            <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 3, background: "rgba(236,72,153,0.1)", color: "#ec4899", marginLeft: 4 }}>
              {evalCompleted}/{evalTotal} complete
            </span>
          ) : null
        } />
        <div style={{ padding: 16 }}>
          {evalGroups && evalGroups.length > 0 ? (
            <div className="space-y-2">
              {evalGroups.map((g) => (
                <div key={g.id} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "8px 12px", borderRadius: 6, border: "1px solid var(--admin-border-default)",
                  background: g.isEvaluationCompleted ? "rgba(16,185,129,0.03)" : "var(--admin-bg-card)",
                }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--admin-font-primary)" }}>{g.evaluatorName}</div>
                    <div style={{ fontSize: 10, color: "var(--admin-font-tertiary)" }}>{g.relation} | {g.evaluatorEmail}</div>
                  </div>
                  <span style={{
                    fontSize: 9, fontWeight: 600, padding: "2px 6px", borderRadius: 3,
                    background: g.isEvaluationCompleted ? "rgba(16,185,129,0.1)" : g.isTokenUsed ? "rgba(59,130,246,0.1)" : "rgba(245,158,11,0.1)",
                    color: g.isEvaluationCompleted ? "#10b981" : g.isTokenUsed ? "#065292" : "#f59e0b",
                    textTransform: "uppercase",
                  }}>
                    {g.isEvaluationCompleted ? "Completed" : g.isTokenUsed ? "In Progress" : "Pending"}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: "20px 0", color: "var(--admin-font-tertiary)", fontSize: 12 }}>
              No 360 evaluations assigned yet.
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
