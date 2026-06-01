"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  PenLine, Users, FileText, Clock, CheckCircle2, Search,
  Loader2, ChevronDown, ChevronRight, Send, X, MessageSquare,
} from "lucide-react";
import { apiRequest } from "@/lib/api/apiClient";
import { toast } from "sonner";

// --- Types ---
interface Student {
  id: string;
  name: string;
  email: string;
}

interface Essay {
  id: string;
  title: string;
  type: string;
  status: "draft" | "in_review" | "revision" | "final";
  wordCount: number;
  collegeName: string | null;
  content: string;
  createdAt: string;
  updatedAt: string;
}

interface Comment {
  id: string;
  authorName: string;
  authorRole: string;
  content: string;
  createdAt: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  draft: { label: "Draft", color: "#6b7280", bg: "rgba(107,114,128,0.1)" },
  in_review: { label: "In Review", color: "#f59e0b", bg: "rgba(245,158,11,0.1)" },
  revision: { label: "Revision", color: "#3b82f6", bg: "rgba(59,130,246,0.1)" },
  final: { label: "Final", color: "#10b981", bg: "rgba(16,185,129,0.1)" },
};

const TYPE_CONFIG: Record<string, { color: string; bg: string }> = {
  personal_statement: { color: "#8b5cf6", bg: "rgba(139,92,246,0.1)" },
  supplemental: { color: "#3b82f6", bg: "rgba(59,130,246,0.1)" },
  common_app: { color: "#6366f1", bg: "rgba(99,102,241,0.1)" },
  coalition: { color: "#14b8a6", bg: "rgba(20,184,166,0.1)" },
  scholarship: { color: "#f59e0b", bg: "rgba(245,158,11,0.1)" },
  other: { color: "#6b7280", bg: "rgba(107,114,128,0.1)" },
};

function formatType(type: string): string {
  return type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function EssaysPage() {
  const queryClient = useQueryClient();
  const [selectedStudentId, setSelectedStudentId] = useState<string>("");
  const [expandedEssayId, setExpandedEssayId] = useState<string | null>(null);
  const [newComment, setNewComment] = useState("");

  // Fetch students
  const { data: studentsData, isLoading: studentsLoading } = useQuery({
    queryKey: ["counselor-students"],
    queryFn: async () => {
      const res = await apiRequest("/api/v1/counselor/me/students?limit=50");
      const items = res?.data?.data ?? res?.data ?? []; return Array.isArray(items) ? items : [];
    },
  });
  const students: Student[] = studentsData ?? [];

  // Fetch essays for selected student
  const { data: essaysData, isLoading: essaysLoading } = useQuery({
    queryKey: ["student-essays", selectedStudentId],
    queryFn: async () => {
      const res = await apiRequest(`/api/v1/college/students/${selectedStudentId}/essays`);
      return res?.data ?? [];
    },
    enabled: !!selectedStudentId,
  });
  const essays: Essay[] = essaysData ?? [];

  // Fetch comments for expanded essay
  const { data: commentsData, isLoading: commentsLoading } = useQuery({
    queryKey: ["essay-comments", expandedEssayId],
    queryFn: async () => {
      const res = await apiRequest(`/api/v1/college/essays/${expandedEssayId}/comments`);
      return res?.data ?? [];
    },
    enabled: !!expandedEssayId,
  });
  const comments: Comment[] = commentsData ?? [];

  // Add comment mutation
  const addComment = useMutation({
    mutationFn: async () => {
      return apiRequest(`/api/v1/college/essays/${expandedEssayId}/comments`, {
        method: "POST",
        data: { content: newComment },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["essay-comments", expandedEssayId] });
      toast.success("Comment added");
      setNewComment("");
    },
    onError: () => toast.error("Failed to add comment"),
  });

  // Stats
  const totalEssays = essays.length;
  const draftsCount = essays.filter((e) => e.status === "draft").length;
  const inReviewCount = essays.filter((e) => e.status === "in_review").length;
  const finalCount = essays.filter((e) => e.status === "final").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
        <p style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.2em", fontWeight: 700, color: "var(--admin-font-tertiary)" }}>College Prep</p>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: "var(--admin-font-primary)", letterSpacing: "-0.01em", marginTop: 2 }}>
          Essay Hub
        </h1>
        <p style={{ fontSize: 13, color: "var(--admin-font-tertiary)", marginTop: 2, maxWidth: 600 }}>
          Review student essays, track progress, and provide feedback through comments.
        </p>
      </motion.div>

      {/* Stats */}
      {selectedStudentId && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
          style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
          {[
            { label: "TOTAL ESSAYS", value: totalEssays, icon: PenLine, color: "var(--admin-font-primary)" },
            { label: "DRAFTS", value: draftsCount, icon: FileText, color: "#6b7280" },
            { label: "IN REVIEW", value: inReviewCount, icon: Clock, color: "#f59e0b" },
            { label: "FINAL", value: finalCount, icon: CheckCircle2, color: "#10b981" },
          ].map((stat) => (
            <div key={stat.label} style={{ padding: 16, borderRadius: 10, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--admin-font-light)" }}>{stat.label}</span>
                <stat.icon style={{ width: 16, height: 16, color: stat.color }} />
              </div>
              <span style={{ fontSize: 28, fontWeight: 700, color: stat.color }}>{stat.value}</span>
            </div>
          ))}
        </motion.div>
      )}

      {/* Student Selector */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Users style={{ width: 16, height: 16, color: "var(--admin-font-tertiary)" }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>Student:</span>
        </div>
        <select
          value={selectedStudentId}
          onChange={(e) => { setSelectedStudentId(e.target.value); setExpandedEssayId(null); }}
          style={{
            height: 36, borderRadius: 8, padding: "0 12px", fontSize: 13,
            border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)",
            color: "var(--admin-font-primary)", outline: "none", minWidth: 240, fontFamily: "inherit",
          }}
        >
          <option value="">Select a student...</option>
          {students.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        {studentsLoading && <Loader2 style={{ width: 16, height: 16, color: "var(--admin-font-tertiary)", animation: "spin 1s linear infinite" }} />}
      </motion.div>

      {/* Essays List */}
      {selectedStudentId && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
          style={{ display: "flex", flexDirection: "column", gap: 10 }}>

          {essaysLoading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[...Array(3)].map((_, i) => <div key={i} style={{ height: 80, borderRadius: 8, background: "var(--admin-bg-hover)" }} />)}
            </div>
          ) : essays.length === 0 ? (
            <div style={{
              padding: 48, textAlign: "center", borderRadius: 10,
              border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)",
            }}>
              <PenLine style={{ width: 32, height: 32, color: "var(--admin-font-light)", margin: "0 auto 12px" }} />
              <p style={{ fontSize: 13, color: "var(--admin-font-tertiary)" }}>
                No essays yet. Essays will appear here once the student creates them.
              </p>
            </div>
          ) : (
            essays.map((essay) => {
              const statusCfg = STATUS_CONFIG[essay.status] || STATUS_CONFIG.draft;
              const typeCfg = TYPE_CONFIG[essay.type] || TYPE_CONFIG.other;
              const isExpanded = expandedEssayId === essay.id;

              return (
                <div key={essay.id} style={{
                  borderRadius: 10, border: "1px solid var(--admin-border-default)",
                  background: "var(--admin-bg-card)", overflow: "hidden",
                }}>
                  {/* Essay Card Header */}
                  <div
                    onClick={() => setExpandedEssayId(isExpanded ? null : essay.id)}
                    style={{
                      padding: "14px 16px", cursor: "pointer", transition: "background 0.1s",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "var(--admin-bg-hover)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                  >
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 14, fontWeight: 600, color: "var(--admin-font-primary)" }}>{essay.title}</span>
                          <span style={{
                            fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 4,
                            background: typeCfg.bg, color: typeCfg.color, textTransform: "uppercase",
                          }}>
                            {formatType(essay.type)}
                          </span>
                          <span style={{
                            fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 4,
                            background: statusCfg.bg, color: statusCfg.color,
                          }}>
                            {statusCfg.label}
                          </span>
                        </div>
                        <div style={{ display: "flex", gap: 12, marginTop: 6, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>
                            {essay.wordCount} words
                          </span>
                          {essay.collegeName && (
                            <span style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>
                              {essay.collegeName}
                            </span>
                          )}
                          <span style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>
                            {new Date(essay.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          </span>
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
                        {isExpanded ? (
                          <ChevronDown style={{ width: 16, height: 16, color: "var(--admin-font-tertiary)" }} />
                        ) : (
                          <ChevronRight style={{ width: 16, height: 16, color: "var(--admin-font-tertiary)" }} />
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Expanded Detail */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        style={{ overflow: "hidden" }}
                      >
                        <div style={{ borderTop: "1px solid var(--admin-border-light)", padding: 16 }}>
                          {/* Essay Content */}
                          <div style={{ marginBottom: 16 }}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--admin-font-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
                              Essay Content
                            </div>
                            <div style={{
                              padding: 14, borderRadius: 8, background: "var(--admin-bg-hover)",
                              border: "1px solid var(--admin-border-default)",
                              fontSize: 13, lineHeight: 1.7, color: "var(--admin-font-secondary)",
                              maxHeight: 300, overflowY: "auto", whiteSpace: "pre-wrap",
                            }}>
                              {essay.content || "No content available."}
                            </div>
                            <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
                              <span style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>
                                {essay.wordCount} words
                              </span>
                              <span style={{
                                fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 4,
                                background: statusCfg.bg, color: statusCfg.color,
                              }}>
                                {statusCfg.label}
                              </span>
                            </div>
                          </div>

                          {/* Comments Section */}
                          <div>
                            <div style={{
                              display: "flex", alignItems: "center", gap: 6, marginBottom: 10,
                              fontSize: 11, fontWeight: 600, color: "var(--admin-font-tertiary)",
                              textTransform: "uppercase", letterSpacing: "0.05em",
                            }}>
                              <MessageSquare style={{ width: 12, height: 12 }} />
                              Comments ({comments.length})
                            </div>

                            {commentsLoading ? (
                              <div style={{ padding: 16, textAlign: "center" }}>
                                <Loader2 style={{ width: 16, height: 16, color: "var(--admin-font-tertiary)", margin: "0 auto", animation: "spin 1s linear infinite" }} />
                              </div>
                            ) : (
                              <>
                                {comments.length > 0 && (
                                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
                                    {comments.map((comment) => (
                                      <div key={comment.id} style={{
                                        padding: "10px 12px", borderRadius: 6,
                                        border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)",
                                      }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                                          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--admin-font-primary)" }}>{comment.authorName}</span>
                                          <span style={{
                                            fontSize: 9, fontWeight: 600, padding: "1px 6px", borderRadius: 3,
                                            background: "var(--admin-bg-hover)", color: "var(--admin-font-tertiary)",
                                            textTransform: "uppercase", border: "1px solid var(--admin-border-default)",
                                          }}>
                                            {comment.authorRole}
                                          </span>
                                          <span style={{ fontSize: 10, color: "var(--admin-font-tertiary)", marginLeft: "auto" }}>
                                            {new Date(comment.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                                          </span>
                                        </div>
                                        <p style={{ fontSize: 12, color: "var(--admin-font-secondary)", lineHeight: 1.5, margin: 0 }}>{comment.content}</p>
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {comments.length === 0 && (
                                  <div style={{ padding: 16, textAlign: "center", marginBottom: 12 }}>
                                    <p style={{ fontSize: 12, color: "var(--admin-font-tertiary)" }}>No comments yet. Be the first to provide feedback.</p>
                                  </div>
                                )}

                                {/* Add Comment */}
                                <div style={{ display: "flex", gap: 8 }}>
                                  <textarea
                                    placeholder="Add a comment or feedback..."
                                    value={newComment}
                                    onChange={(e) => setNewComment(e.target.value)}
                                    rows={2}
                                    style={{
                                      flex: 1, borderRadius: 6, padding: "8px 10px", fontSize: 12,
                                      border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)",
                                      color: "var(--admin-font-primary)", outline: "none", fontFamily: "inherit",
                                      resize: "vertical", minHeight: 60,
                                    }}
                                  />
                                  <button
                                    onClick={() => addComment.mutate()}
                                    disabled={addComment.isPending || !newComment.trim()}
                                    style={{
                                      height: 34, borderRadius: 6, padding: "0 14px", fontSize: 12, fontWeight: 600,
                                      display: "flex", alignItems: "center", gap: 4, alignSelf: "flex-end",
                                      background: "#6366f1", color: "#fff", border: "none", cursor: "pointer",
                                      opacity: (addComment.isPending || !newComment.trim()) ? 0.5 : 1,
                                    }}
                                  >
                                    {addComment.isPending ? (
                                      <Loader2 style={{ width: 12, height: 12, animation: "spin 1s linear infinite" }} />
                                    ) : (
                                      <Send style={{ width: 12, height: 12 }} />
                                    )}
                                    Send
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })
          )}
        </motion.div>
      )}

      {/* Empty state when no student selected */}
      {!selectedStudentId && !studentsLoading && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }}
          style={{ padding: 48, textAlign: "center", borderRadius: 10, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)" }}>
          <Users style={{ width: 32, height: 32, color: "var(--admin-font-light)", margin: "0 auto 12px" }} />
          <p style={{ fontSize: 13, color: "var(--admin-font-tertiary)" }}>
            Select a student above to review their essays and provide feedback.
          </p>
        </motion.div>
      )}
    </div>
  );
}
