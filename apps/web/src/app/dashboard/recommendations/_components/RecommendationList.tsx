"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { FileText, User, Calendar, Download, XCircle, Check } from "lucide-react";
import { toast } from "sonner";
import {
  RecommendationRequest,
  getRecommendationLetterUrl,
} from "@/services/recommendationService";
import { formatDateOnly } from "@/lib/dateUtils";
import StatusBadge from "./StatusBadge";
import { useTranslation } from "react-i18next";
import { relationshipLabel } from "@/components/recommendations/relationshipLabel";

interface RecommendationListProps {
  requests: RecommendationRequest[];
}

// The positive lifecycle a request walks through. "declined" is a separate
// terminal state rendered inline rather than as a step on this track.
// label = i18n key
const TIMELINE_STEPS: { key: string; label: string }[] = [
  { key: "requested", label: "counselor:recommendations.statusRequested" },
  { key: "accepted", label: "counselor:recommendations.statusAccepted" },
  { key: "in_progress", label: "recommendations.list.stepInProgress" },
  { key: "submitted", label: "counselor:recommendations.statusSubmitted" },
];

function StatusTimeline({ status }: { status: string }) {
  const { t } = useTranslation("student");
  const currentIndex = TIMELINE_STEPS.findIndex((s) => s.key === status);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0, marginTop: 12 }}>
      {TIMELINE_STEPS.map((step, i) => {
        const reached = currentIndex >= 0 && i <= currentIndex;
        const isLast = i === TIMELINE_STEPS.length - 1;
        const dotColor = reached ? "var(--admin-accent-blue)" : "var(--admin-border-default)";
        return (
          <div
            key={step.key}
            style={{ display: "flex", alignItems: "center", flex: isLast ? "0 0 auto" : 1 }}
          >
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <div
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: "50%",
                  background: reached ? dotColor : "transparent",
                  border: `2px solid ${dotColor}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                {reached && <Check style={{ width: 9, height: 9, color: "#fff" }} />}
              </div>
              <span
                style={{
                  fontSize: 9,
                  fontWeight: reached ? 600 : 500,
                  color: reached ? "var(--admin-accent-blue)" : "var(--admin-font-tertiary)",
                  whiteSpace: "nowrap",
                }}
              >
                {t(step.label)}
              </span>
            </div>
            {!isLast && (
              <div
                style={{
                  flex: 1,
                  height: 2,
                  margin: "0 4px",
                  marginBottom: 16,
                  background: i < currentIndex ? "var(--admin-accent-blue)" : "var(--admin-border-default)",
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function RecommendationList({ requests }: RecommendationListProps) {
  const { t } = useTranslation("student");
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  async function handleDownload(id: string) {
    setDownloadingId(id);
    try {
      const { url, filename } = await getRecommendationLetterUrl(id);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename || "recommendation-letter.pdf";
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      toast.error(t("recommendations.list.downloadFailed"));
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      style={{
        borderRadius: 8,
        border: "1px solid var(--admin-border-default)",
        background: "var(--admin-bg-card)",
        overflow: "hidden",
      }}
    >
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
        <FileText style={{ width: 14, height: 14, color: "var(--admin-accent-blue)" }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>
          My Requests
        </span>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            padding: "1px 6px",
            borderRadius: 10,
            background: "var(--admin-border-default)",
            color: "var(--admin-font-secondary)",
          }}
        >
          {requests.length}
        </span>
      </div>

      {requests.length === 0 ? (
        <div style={{ textAlign: "center", padding: "48px 16px" }}>
          <FileText
            style={{
              width: 32,
              height: 32,
              color: "var(--admin-font-tertiary)",
              margin: "0 auto 12px",
              opacity: 0.4,
            }}
          />
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "var(--admin-font-primary)",
              marginBottom: 4,
            }}
          >
            {t("recommendations.list.emptyTitle")}
          </div>
          <div
            style={{ fontSize: 12, color: "var(--admin-font-tertiary)", maxWidth: 300, margin: "0 auto" }}
          >
            {t("recommendations.list.emptyBody")}
          </div>
        </div>
      ) : (
        requests.map((req, i) => {
          const isDeclined = req.status === "declined";
          const canDownload = req.status === "submitted" && !!req.letterFileKey;
          return (
            <motion.div
              key={req.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              style={{
                padding: "14px 16px",
                borderBottom: "1px solid var(--admin-border-default)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10, flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      background: "#102B4715",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <User style={{ width: 14, height: 14, color: "var(--admin-accent-blue)" }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        flexWrap: "wrap",
                        marginBottom: 3,
                      }}
                    >
                      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>
                        {req.recommender?.name ?? t("recommendations.list.unknownRecommender")}
                      </span>
                      <StatusBadge status={req.status} />
                    </div>
                    <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>
                      {req.relationship ? relationshipLabel(req.relationship, t) : null}
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-end",
                    gap: 6,
                    flexShrink: 0,
                  }}
                >
                  {req.dueDate && (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                        fontSize: 11,
                        color: "var(--admin-font-tertiary)",
                      }}
                    >
                      <Calendar style={{ width: 11, height: 11 }} />
                      {t("recommendations.list.due", { date: formatDateOnly(req.dueDate) })}
                    </div>
                  )}
                  {canDownload && (
                    <button
                      onClick={() => handleDownload(req.id)}
                      disabled={downloadingId === req.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 5,
                        height: 28,
                        padding: "0 10px",
                        fontSize: 11,
                        fontWeight: 600,
                        borderRadius: 6,
                        border: "none",
                        background: "#102B47",
                        color: "#fff",
                        cursor: downloadingId === req.id ? "wait" : "pointer",
                        opacity: downloadingId === req.id ? 0.7 : 1,
                      }}
                    >
                      <Download style={{ width: 12, height: 12 }} />
                      {downloadingId === req.id ? t("recommendations.list.preparing") : t("recommendations.list.downloadLetter")}
                    </button>
                  )}
                </div>
              </div>

              {isDeclined ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 6,
                    marginTop: 10,
                    padding: "8px 10px",
                    borderRadius: 6,
                    background: "#ef444410",
                    fontSize: 11,
                    color: "#ef4444",
                  }}
                >
                  <XCircle style={{ width: 13, height: 13, flexShrink: 0, marginTop: 1 }} />
                  <span>
                    {/* The reason is the recommender's own sentence — drop its trailing
                        period so the template's "." doesn't double it. */}
                    {req.declineReason?.trim()
                      ? t("recommendations.list.declinedWithReason", { reason: req.declineReason.trim().replace(/\.+$/, "") })
                      : t("recommendations.list.declined")}
                  </span>
                </div>
              ) : (
                <StatusTimeline status={req.status} />
              )}
            </motion.div>
          );
        })
      )}
    </motion.div>
  );
}
