"use client";

import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  FileText,
  Lightbulb,
  MessageSquare,
  XCircle,
} from "lucide-react";
import { SequenceBuilder } from "@/components/course-plan/SequenceBuilder";
import { Card, CardHeader } from "./shared-ui";
import type { CourseChangeRequest, ChangeRequestReviewPayload, StudentCoursePlanResponse } from "@/types/coursePlan";
import type { TranscriptData } from "@/services/transcriptService";
import type { UseMutationResult } from "@tanstack/react-query";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface AcademicsTabProps {
  pendingRequests: CourseChangeRequest[];
  reviewRequest: UseMutationResult<CourseChangeRequest, Error, { requestId: string; payload: ChangeRequestReviewPayload }>;
  gapsData: any;
  recsData: any;
  transcriptData?: TranscriptData;
  coursePlan: StudentCoursePlanResponse | undefined;
  adminAdd: UseMutationResult<void, Error, { courseId: string; courseCode: string; courseName: string; credits: number; gradeLevel: number; semester: string }>;
  adminRemove: UseMutationResult<void, Error, string>;
}

export function AcademicsTab({
  pendingRequests,
  reviewRequest,
  gapsData,
  recsData,
  transcriptData,
  coursePlan,
  adminAdd,
  adminRemove,
}: AcademicsTabProps) {
  return (
    <div className="space-y-4">
      {/* Pending change requests */}
      {pendingRequests.length > 0 && (
        <div style={{
          borderRadius: 8, border: "1px solid rgba(245,158,11,0.3)",
          background: "rgba(245,158,11,0.05)", overflow: "hidden",
        }}>
          <div style={{
            padding: "12px 16px", borderBottom: "1px solid rgba(245,158,11,0.2)",
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <AlertCircle style={{ width: 16, height: 16, color: "#f59e0b" }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>
              Action Required: Course Requests
            </span>
            <span style={{
              fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 3,
              background: "rgba(245,158,11,0.15)", color: "#f59e0b", marginLeft: 4,
            }}>
              {pendingRequests.length} pending
            </span>
          </div>
          <div style={{ padding: 16 }} className="space-y-3">
            {pendingRequests.map((req) => (
              <div key={req.id} style={{
                display: "flex", alignItems: "start", justifyContent: "space-between", gap: 12,
                padding: "12px 14px", borderRadius: 6,
                background: "var(--admin-bg-card)", border: "1px solid var(--admin-border-default)",
                flexWrap: "wrap",
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{
                      fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 3,
                      background: req.action === 'add' ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)",
                      color: req.action === 'add' ? "#10b981" : "#ef4444",
                    }}>
                      {req.action === "add" ? "Enrollment Request" : "Drop Request"}
                    </span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: "var(--admin-font-primary)" }}>{req.courseName}</span>
                  </div>
                  <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                    <span style={{ fontSize: 10, padding: "1px 4px", borderRadius: 3, background: "var(--admin-bg-hover)", color: "var(--admin-font-tertiary)" }}>{req.courseCode}</span>
                    <span style={{ fontSize: 10, padding: "1px 4px", borderRadius: 3, background: "var(--admin-bg-hover)", color: "var(--admin-font-tertiary)" }}>Grade {req.gradeLevel}</span>
                    <span style={{ fontSize: 10, padding: "1px 4px", borderRadius: 3, background: "var(--admin-bg-hover)", color: "var(--admin-font-tertiary)" }}>{req.semester}</span>
                  </div>
                  {req.studentNote && (
                    <div style={{ marginTop: 8, fontSize: 12, color: "var(--admin-font-tertiary)", fontStyle: "italic", display: "flex", alignItems: "start", gap: 6 }}>
                      <MessageSquare style={{ width: 12, height: 12, flexShrink: 0, marginTop: 2 }} />
                      &quot;{req.studentNote}&quot;
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <button
                    disabled={reviewRequest.isPending}
                    onClick={() => reviewRequest.mutate({ requestId: req.id, payload: { status: "approved" } })}
                    style={{
                      height: 30, borderRadius: 6, padding: "0 10px",
                      fontSize: 11, fontWeight: 600,
                      display: "flex", alignItems: "center", gap: 4,
                      background: "#10b981", color: "#fff",
                      border: "none", cursor: "pointer",
                      opacity: reviewRequest.isPending ? 0.6 : 1,
                    }}
                  >
                    <CheckCircle2 style={{ width: 12, height: 12 }} />
                    Approve
                  </button>
                  <button
                    disabled={reviewRequest.isPending}
                    onClick={() => reviewRequest.mutate({ requestId: req.id, payload: { status: "rejected" } })}
                    style={{
                      height: 30, borderRadius: 6, padding: "0 10px",
                      fontSize: 11, fontWeight: 600,
                      display: "flex", alignItems: "center", gap: 4,
                      background: "transparent", color: "#ef4444",
                      border: "1px solid rgba(239,68,68,0.3)", cursor: "pointer",
                      opacity: reviewRequest.isPending ? 0.6 : 1,
                    }}
                  >
                    <XCircle style={{ width: 12, height: 12 }} />
                    Deny
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Academic Gaps */}
      {gapsData && gapsData.creditGaps && gapsData.creditGaps.length > 0 && (
        <Card>
          <CardHeader icon={AlertTriangle} color="#ef4444" title="Academic Gaps" badge={
            <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 3,
              background: gapsData.overallStatus === "on_track" ? "rgba(16,185,129,0.1)" : gapsData.overallStatus === "at_risk" ? "rgba(245,158,11,0.1)" : "rgba(239,68,68,0.1)",
              color: gapsData.overallStatus === "on_track" ? "#10b981" : gapsData.overallStatus === "at_risk" ? "#f59e0b" : "#ef4444",
              marginLeft: 4, textTransform: "uppercase",
            }}>
              {gapsData.overallStatus?.replace("_", " ")}
            </span>
          } />
          <div style={{ padding: 16 }} className="space-y-2">
            {gapsData.creditGaps.map((gap: any) => (
              <div key={gap.category} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "8px 12px", borderRadius: 6, border: "1px solid var(--admin-border-default)",
              }}>
                <div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--admin-font-primary)" }}>{gap.category}</span>
                  <span style={{ fontSize: 10, color: "var(--admin-font-tertiary)", marginLeft: 8 }}>
                    {gap.creditsEarned}/{gap.creditsRequired} credits
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {gap.deficit > 0 && (
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#ef4444" }}>-{gap.deficit}</span>
                  )}
                  <span style={{
                    fontSize: 9, fontWeight: 600, padding: "2px 6px", borderRadius: 3, textTransform: "uppercase",
                    background: gap.severity === "critical" ? "rgba(239,68,68,0.1)" : gap.severity === "warning" ? "rgba(245,158,11,0.1)" : "rgba(59,130,246,0.1)",
                    color: gap.severity === "critical" ? "#ef4444" : gap.severity === "warning" ? "#f59e0b" : "#065292",
                  }}>
                    {gap.severity}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Course Recommendations */}
      {recsData && ((recsData.nextSemester?.length ?? 0) > 0 || (recsData.longTerm?.length ?? 0) > 0) && (
        <Card>
          <CardHeader icon={Lightbulb} color="#f59e0b" title="Course Recommendations" />
          <div style={{ padding: 16 }} className="space-y-4">
            {recsData.nextSemester && recsData.nextSemester.length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--admin-font-tertiary)", textTransform: "uppercase", marginBottom: 8 }}>Next Semester</div>
                <div className="space-y-2">
                  {recsData.nextSemester.map((rec: any) => (
                    <div key={rec.courseId || rec.courseCode} style={{
                      padding: "10px 12px", borderRadius: 6, border: "1px solid var(--admin-border-default)",
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                    }}>
                      <div>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--admin-font-primary)" }}>{rec.courseName}</span>
                        <span style={{ fontSize: 10, color: "var(--admin-font-tertiary)", marginLeft: 6 }}>{rec.courseCode}</span>
                        <div style={{ fontSize: 10, color: "var(--admin-font-tertiary)", marginTop: 2 }}>{rec.reason}</div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>{rec.credits} cr</span>
                        <span style={{
                          fontSize: 9, fontWeight: 600, padding: "2px 6px", borderRadius: 3, textTransform: "uppercase",
                          background: rec.priority === "high" ? "rgba(239,68,68,0.1)" : rec.priority === "medium" ? "rgba(245,158,11,0.1)" : "rgba(59,130,246,0.1)",
                          color: rec.priority === "high" ? "#ef4444" : rec.priority === "medium" ? "#f59e0b" : "#065292",
                        }}>
                          {rec.priority}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {recsData.longTerm && recsData.longTerm.length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--admin-font-tertiary)", textTransform: "uppercase", marginBottom: 8 }}>Long-Term Plan</div>
                <div className="space-y-2">
                  {recsData.longTerm.map((rec: any) => (
                    <div key={rec.courseId || rec.courseCode} style={{
                      padding: "8px 12px", borderRadius: 6, border: "1px solid var(--admin-border-default)",
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                    }}>
                      <div>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--admin-font-primary)" }}>{rec.courseName}</span>
                        <span style={{ fontSize: 10, color: "var(--admin-font-tertiary)", marginLeft: 6 }}>{rec.courseCode} | {rec.credits} cr</span>
                      </div>
                      <span style={{ fontSize: 10, color: "var(--admin-font-tertiary)", maxWidth: 200, textAlign: "right" }}>{rec.reason}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Transcript */}
      {transcriptData?.grades && Object.keys(transcriptData.grades).length > 0 && (
        <Card>
          <CardHeader icon={FileText} color="#065292" title="Transcript" />
          <div style={{ padding: 16 }} className="space-y-4">
            {Object.entries(transcriptData.grades).sort(([a], [b]) => b.localeCompare(a)).map(([year, courses]) => (
              <div key={year}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--admin-font-primary)", marginBottom: 6, paddingBottom: 4, borderBottom: "1px solid var(--admin-border-default)" }}>
                  {year}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: "4px 12px", fontSize: 11 }}>
                  {courses.map((c) => (
                    <div key={c.id} style={{ display: "contents" }}>
                      <span style={{ color: "var(--admin-font-primary)", fontWeight: 500 }}>{c.courseCode || "N/A"}</span>
                      <span style={{ color: "var(--admin-font-tertiary)" }}>{c.credits} cr</span>
                      <span style={{ color: "var(--admin-font-tertiary)", textTransform: "capitalize" }}>{c.courseLevel || "regular"}</span>
                      <span style={{
                        fontWeight: 600,
                        color: c.grade === "A" || c.grade === "A+" || c.grade === "A-" ? "#10b981" :
                          c.grade === "B" || c.grade === "B+" || c.grade === "B-" ? "#065292" :
                          c.grade === "F" ? "#ef4444" : "var(--admin-font-primary)",
                      }}>
                        {c.grade || (c.status === "in_progress" ? "IP" : "\u2014")}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Sequence Builder */}
      <Card>
        <SequenceBuilder
          planData={coursePlan}
          isLoading={false}
          mode="counselor"
          onCounselorAdd={(payload) => adminAdd.mutate(payload)}
          onCounselorRemove={(enrollmentId) => adminRemove.mutate(enrollmentId)}
          isCounselorAddPending={adminAdd.isPending}
          isCounselorRemovePending={adminRemove.isPending}
          recommendations={recsData}
          academicGaps={gapsData}
        />
      </Card>
    </div>
  );
}
