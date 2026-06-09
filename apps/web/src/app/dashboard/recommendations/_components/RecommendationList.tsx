"use client";

import { motion } from "motion/react";
import { FileText, User, Calendar, CheckCircle2 } from "lucide-react";
import { RecommendationRequest } from "@/services/recommendationService";
import { formatDateOnly } from "@/lib/dateUtils";
import StatusBadge from "./StatusBadge";

interface RecommendationListProps {
  requests: RecommendationRequest[];
}

export default function RecommendationList({ requests }: RecommendationListProps) {
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
        <FileText
          style={{ width: 14, height: 14, color: "#065292" }}
        />
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: "var(--admin-font-primary)",
          }}
        >
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
            No requests yet
          </div>
          <div
            style={{
              fontSize: 12,
              color: "var(--admin-font-tertiary)",
              maxWidth: 300,
              margin: "0 auto",
            }}
          >
            Click &quot;Request Letter&quot; to ask a counselor or teacher for a
            recommendation.
          </div>
        </div>
      ) : (
        requests.map((req, i) => (
          <motion.div
            key={req.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
            style={{
              padding: "14px 16px",
              borderBottom: "1px solid var(--admin-border-default)",
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 12,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--admin-bg-hover)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10, flex: 1, minWidth: 0 }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: "#06529215",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <User
                  style={{ width: 14, height: 14, color: "#065292" }}
                />
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
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: "var(--admin-font-primary)",
                    }}
                  >
                    {req.recommender?.name ?? "Unknown"}
                  </span>
                  <StatusBadge status={req.status} />
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--admin-font-tertiary)",
                  }}
                >
                  {req.relationship}
                </div>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-end",
                gap: 3,
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
                  Due {formatDateOnly(req.dueDate)}
                </div>
              )}
              {req.submittedAt && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: 11,
                    color: "#10b981",
                  }}
                >
                  <CheckCircle2 style={{ width: 11, height: 11 }} />
                  Submitted {new Date(req.submittedAt).toLocaleDateString()}
                </div>
              )}
              {!req.dueDate && !req.submittedAt && (
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--admin-font-tertiary)",
                  }}
                >
                  {new Date(req.createdDate).toLocaleDateString()}
                </div>
              )}
            </div>
          </motion.div>
        ))
      )}
    </motion.div>
  );
}
