"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import {
  FileText,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  Calendar,
  User,
  Users,
  ChevronDown,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getRecommendationDashboard,
  listReceivedRecommendations,
  respondToRecommendation,
  updateRecommendationStatus,
  RecommendationRequest,
} from "@/services/recommendationService";

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS_META: Record<
  string,
  { label: string; color: string; bg: string; icon: React.ElementType }
> = {
  requested: {
    label: "Requested",
    color: "#065292",
    bg: "#06529210",
    icon: Clock,
  },
  accepted: {
    label: "Accepted",
    color: "#f59e0b",
    bg: "#f59e0b10",
    icon: CheckCircle2,
  },
  in_progress: {
    label: "In Progress",
    color: "#f97316",
    bg: "#f9731610",
    icon: Loader2,
  },
  submitted: {
    label: "Submitted",
    color: "#10b981",
    bg: "#10b98110",
    icon: CheckCircle2,
  },
  declined: {
    label: "Declined",
    color: "#ef4444",
    bg: "#ef444410",
    icon: XCircle,
  },
};

function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? {
    label: status,
    color: "var(--admin-font-tertiary)",
    bg: "var(--admin-bg-hover)",
    icon: Clock,
  };
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 11,
        fontWeight: 600,
        padding: "2px 8px",
        borderRadius: 4,
        background: meta.bg,
        color: meta.color,
        whiteSpace: "nowrap",
      }}
    >
      <meta.icon style={{ width: 11, height: 11 }} />
      {meta.label}
    </span>
  );
}

// ── Action dropdown ───────────────────────────────────────────────────────────

function ActionMenu({
  req,
  isMyRequest,
  onAction,
}: {
  req: RecommendationRequest;
  isMyRequest: boolean;
  onAction: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!isMyRequest) return null;
  if (req.status === "declined" || req.status === "submitted") return null;

  const canRespond = req.status === "requested";
  const canUpdateStatus = req.status === "accepted" || req.status === "in_progress";

  const handle = async (fn: () => Promise<void>) => {
    setLoading(true);
    setOpen(false);
    try {
      await fn();
      onAction();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? "Action failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={loading}
        style={{
          height: 28,
          borderRadius: 5,
          padding: "0 10px",
          fontSize: 11,
          fontWeight: 600,
          display: "flex",
          alignItems: "center",
          gap: 4,
          background: "var(--admin-bg-hover)",
          color: "var(--admin-font-primary)",
          border: "1px solid var(--admin-border-default)",
          cursor: loading ? "not-allowed" : "pointer",
          opacity: loading ? 0.6 : 1,
        }}
      >
        {loading ? (
          <Loader2 style={{ width: 11, height: 11 }} className="animate-spin" />
        ) : (
          <>
            Actions
            <ChevronDown style={{ width: 11, height: 11 }} />
          </>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <>
            <div
              style={{
                position: "fixed",
                inset: 0,
                zIndex: 40,
              }}
              onClick={() => setOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -4 }}
              transition={{ duration: 0.1 }}
              style={{
                position: "absolute",
                right: 0,
                top: "calc(100% + 4px)",
                zIndex: 50,
                minWidth: 160,
                borderRadius: 6,
                border: "1px solid var(--admin-border-default)",
                background: "var(--admin-bg-card)",
                boxShadow: "0 4px 16px rgba(0,0,0,0.1)",
                overflow: "hidden",
              }}
            >
              {canRespond && (
                <>
                  <MenuButton
                    label="Accept"
                    color="#10b981"
                    onClick={() =>
                      handle(async () => {
                        await respondToRecommendation(req.id, "accept");
                        toast.success("Request accepted");
                      })
                    }
                  />
                  <MenuButton
                    label="Decline"
                    color="#ef4444"
                    onClick={() =>
                      handle(async () => {
                        await respondToRecommendation(req.id, "decline");
                        toast.success("Request declined");
                      })
                    }
                  />
                </>
              )}
              {canUpdateStatus && (
                <>
                  {req.status !== "in_progress" && (
                    <MenuButton
                      label="Mark In Progress"
                      color="#f97316"
                      onClick={() =>
                        handle(async () => {
                          await updateRecommendationStatus(req.id, "in_progress");
                          toast.success("Status updated to In Progress");
                        })
                      }
                    />
                  )}
                  <MenuButton
                    label="Mark Submitted"
                    color="#10b981"
                    onClick={() =>
                      handle(async () => {
                        await updateRecommendationStatus(req.id, "submitted");
                        toast.success("Marked as submitted");
                      })
                    }
                  />
                </>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function MenuButton({
  label,
  color,
  onClick,
}: {
  label: string;
  color: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%",
        textAlign: "left",
        padding: "8px 12px",
        border: "none",
        background: "transparent",
        cursor: "pointer",
        fontSize: 12,
        fontWeight: 600,
        color,
        borderBottom: "1px solid var(--admin-border-default)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "var(--admin-bg-hover)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
      }}
    >
      {label}
    </button>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CounselorRecommendationsPage() {
  const [dashboard, setDashboard] = useState<{
    total: number;
    countByStatus: Record<string, number>;
    requests: RecommendationRequest[];
  } | null>(null);
  const [myRequests, setMyRequests] = useState<RecommendationRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [dash, received] = await Promise.all([
        getRecommendationDashboard(),
        listReceivedRecommendations(),
      ]);
      setDashboard(dash);
      setMyRequests(Array.isArray(received) ? received : []);
    } catch {
      toast.error("Failed to load recommendation data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const myRequestIds = new Set(myRequests.map((r) => r.id));

  const allRequests = dashboard?.requests ?? [];

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton
          className="h-8 w-64"
          style={{ background: "var(--admin-bg-hover)" }}
        />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array(4)
            .fill(0)
            .map((_, i) => (
              <Skeleton
                key={i}
                className="h-24"
                style={{ background: "var(--admin-bg-hover)" }}
              />
            ))}
        </div>
        <Skeleton
          className="h-[400px]"
          style={{ background: "var(--admin-bg-hover)" }}
        />
      </div>
    );
  }

  const countByStatus = dashboard?.countByStatus ?? {};

  const summaryStats = [
    {
      label: "Requested",
      value: countByStatus.requested ?? 0,
      color: "#065292",
      icon: Clock,
    },
    {
      label: "Accepted",
      value: countByStatus.accepted ?? 0,
      color: "#f59e0b",
      icon: CheckCircle2,
    },
    {
      label: "In Progress",
      value: countByStatus.in_progress ?? 0,
      color: "#f97316",
      icon: Loader2,
    },
    {
      label: "Submitted",
      value: countByStatus.submitted ?? 0,
      color: "#10b981",
      icon: CheckCircle2,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-1"
      >
        <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-muted-foreground">
          Counselor
        </span>
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight leading-none">
          Recommendation Dashboard
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Track and respond to letters of recommendation across your school.
        </p>
      </motion.div>

      {/* Summary cards */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08 }}
        className="grid grid-cols-2 md:grid-cols-4 gap-3"
      >
        {summaryStats.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 + i * 0.05 }}
            style={{
              borderRadius: 8,
              border: "1px solid var(--admin-border-default)",
              background: "var(--admin-bg-card)",
              padding: 16,
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: `${stat.color}15`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 10,
              }}
            >
              <stat.icon
                style={{ width: 15, height: 15, color: stat.color }}
              />
            </div>
            <div
              style={{
                fontSize: 24,
                fontWeight: 700,
                color: "var(--admin-font-primary)",
                letterSpacing: "-0.02em",
              }}
            >
              {stat.value}
            </div>
            <div
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: "var(--admin-font-tertiary)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                marginTop: 2,
              }}
            >
              {stat.label}
            </div>
          </motion.div>
        ))}
      </motion.div>

      {/* Requests table */}
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
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "var(--admin-font-primary)",
            }}
          >
            All Requests
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
            {allRequests.length}
          </span>
        </div>

        {allRequests.length === 0 ? (
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
              No Requests
            </div>
            <div
              style={{
                fontSize: 12,
                color: "var(--admin-font-tertiary)",
                maxWidth: 300,
                margin: "0 auto",
              }}
            >
              No recommendation requests have been made in your school yet.
            </div>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead style={{ fontSize: 11, color: "var(--admin-font-tertiary)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Student
                </TableHead>
                <TableHead style={{ fontSize: 11, color: "var(--admin-font-tertiary)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Recommender
                </TableHead>
                <TableHead style={{ fontSize: 11, color: "var(--admin-font-tertiary)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Status
                </TableHead>
                <TableHead style={{ fontSize: 11, color: "var(--admin-font-tertiary)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Due
                </TableHead>
                <TableHead style={{ fontSize: 11, color: "var(--admin-font-tertiary)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Submitted
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
                    style={{
                      background: isMe ? "var(--admin-accent-blue, #065292)08" : undefined,
                    }}
                  >
                    <TableCell>
                      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                        <div
                          style={{
                            width: 26,
                            height: 26,
                            borderRadius: 6,
                            background: "#06529215",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                          }}
                        >
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
                          <span
                            style={{
                              marginLeft: 6,
                              fontSize: 10,
                              fontWeight: 600,
                              padding: "1px 5px",
                              borderRadius: 3,
                              background: "#06529215",
                              color: "#065292",
                            }}
                          >
                            You
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
                        <span style={{ fontSize: 12, color: "var(--admin-font-tertiary)" }}>—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {req.submittedAt ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "#10b981" }}>
                          <CheckCircle2 style={{ width: 11, height: 11 }} />
                          {new Date(req.submittedAt).toLocaleDateString()}
                        </div>
                      ) : (
                        <span style={{ fontSize: 12, color: "var(--admin-font-tertiary)" }}>—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <ActionMenu
                        req={req}
                        isMyRequest={isMe}
                        onAction={load}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </motion.div>
    </div>
  );
}
