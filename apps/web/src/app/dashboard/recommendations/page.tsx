"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import {
  FileText,
  Plus,
  X,
  Search,
  Calendar,
  User,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  Send,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  listMyRecommendations,
  requestRecommendation,
  RecommendationRequest,
} from "@/services/recommendationService";
import { apiRequest } from "@/lib/api/apiClient";

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
      }}
    >
      <meta.icon style={{ width: 11, height: 11 }} />
      {meta.label}
    </span>
  );
}

// ── Staff search ──────────────────────────────────────────────────────────────

interface StaffUser {
  id: string;
  name: string;
  email: string;
  roleName?: string;
}

function StaffSearch({
  value,
  onChange,
}: {
  value: StaffUser | null;
  onChange: (u: StaffUser | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!query || query.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await apiRequest(
          `/api/v1/school-admin/users?search=${encodeURIComponent(query)}&limit=10`,
          { method: "GET" }
        );
        const users: StaffUser[] = (res?.data?.data ?? res?.data ?? []).filter(
          (u: StaffUser) => u.roleName !== "student"
        );
        setResults(users);
        setOpen(true);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  if (value) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 12px",
          borderRadius: 6,
          border: "1px solid var(--admin-border-default)",
          background: "var(--admin-bg-card)",
        }}
      >
        <div>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "var(--admin-font-primary)",
            }}
          >
            {value.name}
          </div>
          <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>
            {value.email}
          </div>
        </div>
        <button
          onClick={() => onChange(null)}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--admin-font-tertiary)",
            display: "flex",
          }}
        >
          <X style={{ width: 14, height: 14 }} />
        </button>
      </div>
    );
  }

  return (
    <div style={{ position: "relative" }}>
      <div className="relative">
        <Search
          className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5"
          style={{ color: "var(--admin-font-tertiary)" }}
        />
        <Input
          placeholder="Search counselors and staff..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-9 h-9 text-sm"
          style={{
            borderRadius: 6,
            background: "var(--admin-bg-card)",
            border: "1px solid var(--admin-border-default)",
          }}
        />
        {loading && (
          <Loader2
            className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin"
            style={{ color: "var(--admin-font-tertiary)" }}
          />
        )}
      </div>
      <AnimatePresence>
        {open && results.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            style={{
              position: "absolute",
              top: "calc(100% + 4px)",
              left: 0,
              right: 0,
              zIndex: 50,
              borderRadius: 6,
              border: "1px solid var(--admin-border-default)",
              background: "var(--admin-bg-card)",
              boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
              overflow: "hidden",
            }}
          >
            {results.map((u) => (
              <button
                key={u.id}
                onClick={() => {
                  onChange(u);
                  setQuery("");
                  setOpen(false);
                }}
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: "8px 12px",
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  borderBottom: "1px solid var(--admin-border-default)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--admin-bg-hover)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
              >
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--admin-font-primary)",
                  }}
                >
                  {u.name}
                </div>
                <div
                  style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}
                >
                  {u.email}
                  {u.roleName ? ` · ${u.roleName}` : ""}
                </div>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function RecommendationsPage() {
  const [requests, setRequests] = useState<RecommendationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [selectedStaff, setSelectedStaff] = useState<StaffUser | null>(null);
  const [relationship, setRelationship] = useState("");
  const [message, setMessage] = useState("");
  const [dueDate, setDueDate] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await listMyRecommendations();
      setRequests(Array.isArray(data) ? data : []);
    } catch {
      toast.error("Failed to load recommendation requests");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const resetForm = () => {
    setSelectedStaff(null);
    setRelationship("");
    setMessage("");
    setDueDate("");
    setShowForm(false);
  };

  const handleSubmit = async () => {
    if (!selectedStaff) {
      toast.error("Please select a staff member");
      return;
    }
    if (!relationship.trim()) {
      toast.error("Please describe your relationship");
      return;
    }
    if (!message.trim()) {
      toast.error("Please include a request message");
      return;
    }
    setSubmitting(true);
    try {
      await requestRecommendation({
        recommenderId: selectedStaff.id,
        relationship: relationship.trim(),
        requestMessage: message.trim(),
        dueDate: dueDate || undefined,
      });
      toast.success("Recommendation request sent");
      resetForm();
      load();
    } catch (err: unknown) {
      const errObj = err as { response?: { data?: { message?: string } } };
      const msg =
        errObj?.response?.data?.message ?? "Failed to send request";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton
          className="h-8 w-64"
          style={{ background: "var(--admin-bg-hover)" }}
        />
        <div className="grid grid-cols-1 gap-3">
          {Array(3)
            .fill(0)
            .map((_, i) => (
              <Skeleton
                key={i}
                className="h-20"
                style={{ background: "var(--admin-bg-hover)" }}
              />
            ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4"
      >
        <div className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-muted-foreground">
            Applications
          </span>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight leading-none">
            Letters of Recommendation
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Request and track letters from your counselors and teachers.
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          style={{
            height: 36,
            borderRadius: 6,
            padding: "0 14px",
            fontSize: 12,
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: "var(--admin-accent-blue, #065292)",
            color: "#fff",
            border: "none",
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          <Plus style={{ width: 14, height: 14 }} />
          Request Letter
        </button>
      </motion.div>

      {/* Request form */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            style={{
              borderRadius: 8,
              border: "1px solid var(--admin-border-default)",
              background: "var(--admin-bg-card)",
              overflow: "hidden",
            }}
          >
            {/* Form header */}
            <div
              style={{
                padding: "12px 16px",
                borderBottom: "1px solid var(--admin-border-default)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                background: "var(--admin-bg-hover)",
              }}
            >
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--admin-font-primary)",
                }}
              >
                New Recommendation Request
              </span>
              <button
                onClick={resetForm}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--admin-font-tertiary)",
                  display: "flex",
                }}
              >
                <X style={{ width: 16, height: 16 }} />
              </button>
            </div>

            {/* Form body */}
            <div
              style={{
                padding: 16,
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
              }}
            >
              {/* Staff search — full width */}
              <div style={{ gridColumn: "1 / -1" }}>
                <label
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: "var(--admin-font-secondary)",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    display: "block",
                    marginBottom: 6,
                  }}
                >
                  Staff Member *
                </label>
                <StaffSearch
                  value={selectedStaff}
                  onChange={setSelectedStaff}
                />
              </div>

              {/* Relationship */}
              <div>
                <label
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: "var(--admin-font-secondary)",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    display: "block",
                    marginBottom: 6,
                  }}
                >
                  Relationship *
                </label>
                <Input
                  placeholder="e.g. Math teacher, Counselor"
                  value={relationship}
                  onChange={(e) => setRelationship(e.target.value)}
                  className="h-9 text-sm"
                  style={{
                    borderRadius: 6,
                    background: "var(--admin-bg-card)",
                    border: "1px solid var(--admin-border-default)",
                  }}
                />
              </div>

              {/* Due date */}
              <div>
                <label
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: "var(--admin-font-secondary)",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    display: "block",
                    marginBottom: 6,
                  }}
                >
                  Due Date
                </label>
                <Input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="h-9 text-sm"
                  style={{
                    borderRadius: 6,
                    background: "var(--admin-bg-card)",
                    border: "1px solid var(--admin-border-default)",
                  }}
                />
              </div>

              {/* Message — full width */}
              <div style={{ gridColumn: "1 / -1" }}>
                <label
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: "var(--admin-font-secondary)",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    display: "block",
                    marginBottom: 6,
                  }}
                >
                  Request Message *
                </label>
                <textarea
                  placeholder="Describe why you are requesting this letter and any relevant context..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={3}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: 6,
                    border: "1px solid var(--admin-border-default)",
                    background: "var(--admin-bg-card)",
                    color: "var(--admin-font-primary)",
                    fontSize: 13,
                    resize: "vertical",
                    outline: "none",
                    fontFamily: "inherit",
                  }}
                />
              </div>

              {/* Actions */}
              <div
                style={{
                  gridColumn: "1 / -1",
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: 8,
                }}
              >
                <button
                  onClick={resetForm}
                  disabled={submitting}
                  style={{
                    height: 34,
                    borderRadius: 6,
                    padding: "0 14px",
                    fontSize: 12,
                    fontWeight: 600,
                    background: "transparent",
                    color: "var(--admin-font-primary)",
                    border: "1px solid var(--admin-border-default)",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  style={{
                    height: 34,
                    borderRadius: 6,
                    padding: "0 14px",
                    fontSize: 12,
                    fontWeight: 600,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    background: "var(--admin-accent-blue, #065292)",
                    color: "#fff",
                    border: "none",
                    cursor: submitting ? "not-allowed" : "pointer",
                    opacity: submitting ? 0.7 : 1,
                  }}
                >
                  {submitting ? (
                    <Loader2
                      style={{ width: 13, height: 13 }}
                      className="animate-spin"
                    />
                  ) : (
                    <Send style={{ width: 13, height: 13 }} />
                  )}
                  Send Request
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Requests list */}
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
              Click "Request Letter" to ask a counselor or teacher for a
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
                    Due {new Date(req.dueDate).toLocaleDateString()}
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
    </div>
  );
}
