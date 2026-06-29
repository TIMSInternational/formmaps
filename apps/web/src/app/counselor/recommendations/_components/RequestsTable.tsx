"use client";

import { useTranslation } from "react-i18next";
import { motion } from "motion/react";
import {
  FileText, Calendar, User, Users, CheckCircle2,
} from "lucide-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import type { RecommendationRequest } from "@/services/recommendationService";
import { StatusBadge } from "./StatusBadge";
import { RecommendationActionMenu as ActionMenu } from "@/components/recommendations/RecommendationActionMenu";

export function RequestsTable({
  allRequests,
  myRequestIds,
  onAction,
}: {
  allRequests: RecommendationRequest[];
  myRequestIds: Set<string>;
  onAction: () => void;
}) {
  const { t } = useTranslation("counselor");

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.18 }}
      style={{
        borderRadius: 8,
        border: "1px solid var(--admin-border-default)",
        background: "var(--admin-bg-card)",
        overflow: "hidden",
      }}
    >
      {/* Table header */}
      <div
        style={{
          padding: "12px 16px",
          borderBottom: "1px solid var(--admin-border-default)",
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: "var(--admin-bg-hover)",
        }}
      >
        <Users style={{ width: 14, height: 14, color: "#065292" }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>
          {t("recommendations.allRequests", "All Requests")}
        </span>
        <span style={{
          fontSize: 11, fontWeight: 600, padding: "1px 6px", borderRadius: 10,
          background: "var(--admin-border-default)", color: "var(--admin-font-secondary)",
        }}>
          {allRequests.length}
        </span>
      </div>

      {allRequests.length === 0 ? (
        <div style={{ textAlign: "center", padding: "48px 16px" }}>
          <FileText style={{ width: 32, height: 32, color: "var(--admin-font-tertiary)", margin: "0 auto 12px", opacity: 0.4 }} />
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--admin-font-primary)", marginBottom: 4 }}>
            {t("recommendations.noRequests", "No Requests")}
          </div>
          <div style={{ fontSize: 12, color: "var(--admin-font-tertiary)", maxWidth: 300, margin: "0 auto" }}>
            {t("recommendations.noRequestsDesc", "No recommendation requests have been made in your school yet.")}
          </div>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead style={{ fontSize: 11, color: "var(--admin-font-tertiary)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                {t("recommendations.colStudent", "Student")}
              </TableHead>
              <TableHead style={{ fontSize: 11, color: "var(--admin-font-tertiary)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                {t("recommendations.colRecommender", "Recommender")}
              </TableHead>
              <TableHead style={{ fontSize: 11, color: "var(--admin-font-tertiary)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                {t("recommendations.colStatus", "Status")}
              </TableHead>
              <TableHead style={{ fontSize: 11, color: "var(--admin-font-tertiary)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                {t("recommendations.colDue", "Due")}
              </TableHead>
              <TableHead style={{ fontSize: 11, color: "var(--admin-font-tertiary)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                {t("recommendations.colSubmitted", "Submitted")}
              </TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {allRequests.map((req) => {
              const isMe = myRequestIds.has(req.id);
              return (
                <TableRow
                  key={req.id}
                  style={{ background: isMe ? "var(--admin-accent-blue, #065292)08" : undefined }}
                >
                  <TableCell>
                    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <div style={{
                        width: 26, height: 26, borderRadius: 6,
                        background: "#06529215",
                        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                      }}>
                        <User style={{ width: 12, height: 12, color: "#065292" }} />
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>
                          {req.student?.name ?? "—"}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>
                          {req.student?.email ?? ""}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div style={{ fontSize: 13, color: "var(--admin-font-primary)", fontWeight: isMe ? 600 : 400 }}>
                      {req.recommender?.name ?? "—"}
                      {isMe && (
                        <span style={{
                          marginLeft: 6, fontSize: 10, fontWeight: 600,
                          padding: "1px 5px", borderRadius: 3,
                          background: "#06529215", color: "#065292",
                        }}>
                          {t("recommendations.you", "You")}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={req.status} />
                  </TableCell>
                  <TableCell>
                    {req.dueDate ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--admin-font-secondary)" }}>
                        <Calendar style={{ width: 11, height: 11 }} />
                        {new Date(req.dueDate).toLocaleDateString()}
                      </div>
                    ) : (
                      <span style={{ fontSize: 12, color: "var(--admin-font-tertiary)" }}>{"—"}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {req.submittedAt ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "#10b981" }}>
                        <CheckCircle2 style={{ width: 11, height: 11 }} />
                        {new Date(req.submittedAt).toLocaleDateString()}
                      </div>
                    ) : (
                      <span style={{ fontSize: 12, color: "var(--admin-font-tertiary)" }}>{"—"}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <ActionMenu req={req} isMyRequest={isMe} onAction={onAction} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </motion.div>
  );
}
