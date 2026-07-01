"use client";

import { motion } from "motion/react";
import { Check, Clock, AlertCircle, X } from "lucide-react";

export type TimelineStatus = "completed" | "active" | "pending" | "error";

export interface TimelineItem {
  id: string;
  title: string;
  description?: string;
  timestamp?: string;
  status?: TimelineStatus;
  icon?: React.ReactNode;
  content?: React.ReactNode;
}

interface TimelineProps {
  items: TimelineItem[];
  title?: string;
  showTimestamps?: boolean;
}

const statusColors: Record<TimelineStatus, { dot: string; line: string; text: string }> = {
  completed: {
    dot: "var(--admin-accent-green, #10b981)",
    line: "var(--admin-accent-green, #10b981)",
    text: "var(--admin-font-primary, #ebebeb)",
  },
  active: {
    dot: "var(--admin-accent-blue, #2E9098)",
    line: "var(--admin-accent-blue, #2E9098)",
    text: "var(--admin-font-primary, #ebebeb)",
  },
  pending: {
    dot: "var(--admin-font-light, #555)",
    line: "var(--admin-border-default, #2a2a2a)",
    text: "var(--admin-font-tertiary, #818181)",
  },
  error: {
    dot: "var(--admin-accent-red, #ef4444)",
    line: "var(--admin-accent-red, #ef4444)",
    text: "var(--admin-font-primary, #ebebeb)",
  },
};

function StatusIcon({ status }: { status: TimelineStatus }) {
  const size = { width: 12, height: 12 };
  switch (status) {
    case "completed": return <Check {...size} />;
    case "active": return <Clock {...size} />;
    case "error": return <X {...size} />;
    default: return <div style={{ width: 6, height: 6, borderRadius: 3, background: "currentColor" }} />;
  }
}

export function AdminTimeline({ items, title, showTimestamps = true }: TimelineProps) {
  return (
    <div style={{
      borderRadius: 8,
      border: "1px solid var(--admin-border-default, #2a2a2a)",
      background: "var(--admin-bg-card, #1e1e1e)",
      padding: "20px",
    }}>
      {title && (
        <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--admin-font-light, #555)", marginBottom: 16 }}>
          {title}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column" }}>
        {items.map((item, index) => {
          const status = item.status || "pending";
          const colors = statusColors[status];
          const isLast = index === items.length - 1;

          return (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.06, duration: 0.3 }}
              style={{ display: "flex", gap: 12, position: "relative", paddingBottom: isLast ? 0 : 20 }}
            >
              {/* Connector line */}
              {!isLast && (
                <div style={{
                  position: "absolute",
                  left: 11,
                  top: 24,
                  bottom: 0,
                  width: 1,
                  background: colors.line,
                  opacity: status === "pending" ? 0.3 : 0.5,
                }} />
              )}

              {/* Dot */}
              <div style={{
                width: 22, height: 22, borderRadius: 11, flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: status === "completed" || status === "error" ? colors.dot : "transparent",
                border: `2px solid ${colors.dot}`,
                color: status === "completed" || status === "error" ? "var(--admin-bg-card, #1e1e1e)" : colors.dot,
                position: "relative", zIndex: 1,
              }}>
                {item.icon || <StatusIcon status={status} />}
                {status === "active" && (
                  <div style={{
                    position: "absolute", inset: -3,
                    borderRadius: "50%",
                    border: `2px solid ${colors.dot}`,
                    opacity: 0.3,
                    animation: "pulse 2s infinite",
                  }} />
                )}
              </div>

              {/* Content */}
              <div style={{ flex: 1, minWidth: 0, paddingTop: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: colors.text }}>
                    {item.title}
                  </span>
                  {showTimestamps && item.timestamp && (
                    <span style={{ fontSize: 10, color: "var(--admin-font-light, #555)", flexShrink: 0 }}>
                      {item.timestamp}
                    </span>
                  )}
                </div>
                {item.description && (
                  <div style={{ fontSize: 12, color: "var(--admin-font-tertiary, #818181)", marginTop: 3, lineHeight: 1.5 }}>
                    {item.description}
                  </div>
                )}
                {item.content && (
                  <div style={{ marginTop: 8 }}>
                    {item.content}
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
