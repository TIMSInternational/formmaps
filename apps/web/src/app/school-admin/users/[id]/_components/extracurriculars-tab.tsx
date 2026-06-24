"use client";

import {
  Calendar,
  CheckCircle2,
  Clock,
  Heart,
  XCircle,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { format } from "date-fns";
import { Card, CardHeader } from "./shared-ui";
import type { CommunityServiceSummary, CommunityServiceEntry, CommunityServiceVerifyPayload } from "@/types/communityService";
import type { UseMutationResult } from "@tanstack/react-query";

interface ExtracurricularsTabProps {
  csData?: CommunityServiceSummary | null;
  verifyEntry: UseMutationResult<CommunityServiceEntry, Error, { entryId: string; payload: CommunityServiceVerifyPayload }>;
}

export function ExtracurricularsTab({ csData, verifyEntry }: ExtracurricularsTabProps) {
  return (
    <Card>
      <CardHeader icon={Heart} color="#ec4899" title="Community Service Log" />
      <div style={{ padding: 16 }}>
        {/* Progress */}
        <div style={{
          padding: "14px 16px", borderRadius: 6,
          border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-hover)",
          marginBottom: 16,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: "var(--admin-font-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Service Requirement</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: "var(--admin-font-primary)", marginTop: 2 }}>
                {csData?.totalHoursVerified ?? 0} <span style={{ fontSize: 14, color: "var(--admin-font-tertiary)", fontWeight: 400 }}>/ {csData?.totalHoursRequired ?? 0} hrs</span>
              </div>
            </div>
            <Heart style={{ width: 20, height: 20, color: "#ec4899", opacity: 0.5 }} />
          </div>
          <Progress
            value={csData?.totalHoursRequired ? ((csData.totalHoursVerified ?? 0) / csData.totalHoursRequired) * 100 : 0}
            className="h-2"
          />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
            <span style={{ fontSize: 10, color: "var(--admin-font-tertiary)" }}>0 hrs</span>
            <span style={{ fontSize: 10, color: "var(--admin-font-tertiary)" }}>Goal: {csData?.totalHoursRequired ?? 0} hrs</span>
          </div>
        </div>

        {/* Entries */}
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)", marginBottom: 10, paddingBottom: 6, borderBottom: "1px solid var(--admin-border-default)" }}>Activity Ledger</div>
        {csData?.entries && csData.entries.length > 0 ? (
          <div className="space-y-3">
            {csData.entries.map((entry) => {
              const isPending = entry.status === "pending";
              return (
                <div key={entry.id} style={{
                  padding: "12px 14px", borderRadius: 6,
                  border: "1px solid var(--admin-border-default)",
                  background: isPending ? "rgba(245,158,11,0.03)" : "var(--admin-bg-card)",
                  display: "flex", alignItems: "start", justifyContent: "space-between", gap: 12,
                  flexWrap: "wrap",
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: "var(--admin-font-primary)" }}>{entry.organization}</span>
                      {entry.status === "verified" && (
                        <span style={{ fontSize: 9, fontWeight: 600, padding: "1px 6px", borderRadius: 3, background: "rgba(16,185,129,0.1)", color: "#10b981" }}>Verified</span>
                      )}
                      {entry.status === "rejected" && (
                        <span style={{ fontSize: 9, fontWeight: 600, padding: "1px 6px", borderRadius: 3, background: "rgba(107,114,128,0.1)", color: "#6b7280" }}>Rejected</span>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                      <span style={{ fontSize: 11, color: "var(--admin-font-tertiary)", display: "flex", alignItems: "center", gap: 3 }}>
                        <Clock style={{ width: 10, height: 10 }} /> {entry.hours} hours
                      </span>
                      <span style={{ fontSize: 11, color: "var(--admin-font-tertiary)", display: "flex", alignItems: "center", gap: 3 }}>
                        <Calendar style={{ width: 10, height: 10 }} /> {format(new Date(entry.date), "MMM d, yyyy")}
                      </span>
                    </div>
                    {entry.description && (
                      <p style={{ fontSize: 11, color: "var(--admin-font-tertiary)", marginTop: 6, lineHeight: 1.4 }}>{entry.description}</p>
                    )}
                    {entry.status === "rejected" && entry.note && (
                      <p style={{ fontSize: 11, color: "#ef4444", marginTop: 6, lineHeight: 1.4 }}>Reason: {entry.note}</p>
                    )}
                  </div>

                  {isPending && (
                    <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                      <button
                        disabled={verifyEntry.isPending}
                        onClick={() => verifyEntry.mutate({ entryId: entry.id, payload: { status: "verified" } })}
                        style={{
                          height: 28, borderRadius: 5, padding: "0 8px",
                          fontSize: 10, fontWeight: 600,
                          display: "flex", alignItems: "center", gap: 3,
                          background: "rgba(16,185,129,0.1)", color: "#10b981",
                          border: "1px solid rgba(16,185,129,0.2)", cursor: "pointer",
                        }}
                      >
                        <CheckCircle2 style={{ width: 11, height: 11 }} /> Approve
                      </button>
                      <button
                        disabled={verifyEntry.isPending}
                        onClick={() => {
                          const note = window.prompt("Reason for rejection (optional):");
                          if (note === null) return;
                          verifyEntry.mutate({ entryId: entry.id, payload: { status: "rejected", note } });
                        }}
                        style={{
                          height: 28, borderRadius: 5, padding: "0 8px",
                          fontSize: 10, fontWeight: 600,
                          display: "flex", alignItems: "center", gap: 3,
                          background: "rgba(239,68,68,0.05)", color: "#ef4444",
                          border: "1px solid rgba(239,68,68,0.2)", cursor: "pointer",
                        }}
                      >
                        <XCircle style={{ width: 11, height: 11 }} /> Reject
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ textAlign: "center", padding: "32px 16px" }}>
            <Heart style={{ width: 20, height: 20, color: "var(--admin-font-tertiary)", margin: "0 auto 6px", opacity: 0.4 }} />
            <div style={{ fontSize: 12, color: "var(--admin-font-tertiary)" }}>No community service entries logged yet.</div>
          </div>
        )}
      </div>
    </Card>
  );
}
