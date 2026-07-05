"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "motion/react";
import {
  Bell,
  X,
  CheckCheck,
  Sparkles,
  GraduationCap,
  TrendingUp,
  BookOpen,
  Calendar,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useGlobalStore } from "@/store/useGlobalStore";
import { normalizeRole } from "@/lib/roleUtils";
import { Roles } from "@/lib/permissions";
import { useDashboardAssessmentSummary } from "@/hooks/useAssessmentQueries";
import { buildSeedNotifications, type SeedNotification } from "./notificationSeeds";

type Notification = SeedNotification;

const ICON_MAP: Record<string, React.ElementType> = {
  career: TrendingUp,
  university: GraduationCap,
  assessment: Sparkles,
  course: BookOpen,
  coaching: Calendar,
  system: AlertCircle,
};

const DISMISSED_KEY = "formmaps_notifications_dismissed";
const READ_KEY = "formmaps_notifications_read";

function getIdSet(key: string): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(key) || "[]"));
  } catch {
    return new Set();
  }
}

export function NotificationCenter() {
  const { t } = useTranslation();
  const user = useGlobalStore((s) => s.user);
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const panelRef = useRef<HTMLDivElement>(null);

  const isStudent = normalizeRole(user.role) === Roles.STUDENT;
  // Only students have assessments; the query stays disabled for other roles.
  const { data: summary } = useDashboardAssessmentSummary(isStudent ? user.id ?? "" : "");
  const assessmentsComplete =
    !!summary && summary.totalAssessments > 0 && summary.completedAssessments >= summary.totalAssessments;

  // Derive the list from REAL state each render, applying persisted read/dismiss
  // flags. Seeds are never stored, so completing assessments (or a role that
  // has none) is reflected immediately — no stale "results ready" claims.
  useEffect(() => {
    const dismissed = getIdSet(DISMISSED_KEY);
    const read = getIdSet(READ_KEY);
    const seeds = buildSeedNotifications(t, isStudent, assessmentsComplete)
      .filter((n) => !dismissed.has(n.id))
      .map((n) => ({ ...n, read: read.has(n.id) }));
    setNotifications(seeds);
  }, [t, isStudent, assessmentsComplete]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAllRead = useCallback(() => {
    setNotifications((prev) => {
      const read = getIdSet(READ_KEY);
      prev.forEach((n) => read.add(n.id));
      localStorage.setItem(READ_KEY, JSON.stringify([...read]));
      return prev.map((n) => ({ ...n, read: true }));
    });
  }, []);

  const dismissNotification = useCallback((id: string) => {
    setNotifications((prev) => {
      const dismissed = getIdSet(DISMISSED_KEY);
      dismissed.add(id);
      localStorage.setItem(DISMISSED_KEY, JSON.stringify([...dismissed]));
      return prev.filter((n) => n.id !== id);
    });
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell trigger */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative flex items-center justify-center rounded-md p-1.5 transition-colors"
        style={{ color: "var(--admin-font-tertiary)" }}
        aria-label={`${t("shell.notifications")}${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold text-white"
            style={{ background: "var(--admin-accent-blue, #2E9098)" }}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-2 w-[320px] rounded-xl overflow-hidden z-50"
            style={{
              background: "var(--admin-bg-card, #1e1e1e)",
              border: "1px solid var(--admin-border-default, #2a2a2a)",
              boxShadow: "0 12px 32px rgba(0,0,0,0.4)",
            }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-4 py-3"
              style={{ borderBottom: "1px solid var(--admin-border-default)" }}
            >
              <span
                className="text-xs font-bold uppercase tracking-wider"
                style={{ color: "var(--admin-font-tertiary)" }}
              >
                {t("shell.notifications")}
              </span>
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="flex items-center gap-1 text-[11px] font-medium transition-colors"
                  style={{ color: "var(--admin-accent-blue)" }}
                >
                  <CheckCheck className="h-3 w-3" />
                  {t("shell.markAllRead")}
                </button>
              )}
            </div>

            {/* List */}
            <div className="max-h-[320px] overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="py-8 text-center">
                  <Bell className="h-5 w-5 mx-auto mb-2" style={{ color: "var(--admin-font-tertiary)" }} />
                  <span className="text-xs" style={{ color: "var(--admin-font-tertiary)" }}>
                    {t("shell.noNotifications")}
                  </span>
                </div>
              ) : (
                notifications.map((n) => {
                  const Icon = ICON_MAP[n.type] || AlertCircle;
                  return (
                    <div
                      key={n.id}
                      className={cn(
                        "flex items-start gap-3 px-4 py-3 transition-colors cursor-default",
                        !n.read && "bg-[var(--admin-bg-hover)]",
                      )}
                      style={{ borderBottom: "1px solid var(--admin-border-light, #222)" }}
                    >
                      <div
                        className="flex items-center justify-center rounded-lg shrink-0 mt-0.5"
                        style={{
                          width: 28,
                          height: 28,
                          background: "var(--admin-bg-icon-box, var(--admin-bg-hover))",
                          border: "1px solid var(--admin-border-light)",
                        }}
                      >
                        <Icon className="h-3.5 w-3.5" style={{ color: "var(--admin-font-tertiary)" }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <span
                            className="text-xs font-semibold"
                            style={{ color: "var(--admin-font-primary)" }}
                          >
                            {n.title}
                          </span>
                          <button
                            onClick={() => dismissNotification(n.id)}
                            className="p-0.5 rounded shrink-0 transition-colors"
                            style={{ color: "var(--admin-font-tertiary)" }}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                        <p
                          className="text-[11px] mt-0.5 leading-relaxed"
                          style={{ color: "var(--admin-font-tertiary)" }}
                        >
                          {n.description}
                        </p>
                        {!n.read && (
                          <div
                            className="h-1.5 w-1.5 rounded-full mt-1.5"
                            style={{ background: "var(--admin-accent-blue)" }}
                          />
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
