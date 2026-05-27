"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { apiRequest } from "@/lib/api/apiClient";
import { Skeleton } from "@/components/ui/skeleton";
import { motion, AnimatePresence } from "motion/react";
import {
  FileText, Search, Filter, Calendar, User, Tag, ChevronDown, ChevronUp,
  StickyNote, Clock,
} from "lucide-react";

const NOTE_TYPES = [
  { value: "", label: "All Types" },
  { value: "general", label: "General" },
  { value: "meeting", label: "Meeting" },
  { value: "follow_up", label: "Follow-up" },
  { value: "academic", label: "Academic" },
  { value: "career", label: "Career" },
  { value: "personal", label: "Personal" },
];

const TYPE_COLORS: Record<string, { bg: string; color: string }> = {
  general: { bg: "rgba(107,114,128,0.12)", color: "#6b7280" },
  meeting: { bg: "rgba(59,130,246,0.12)", color: "#3b82f6" },
  follow_up: { bg: "rgba(245,158,11,0.12)", color: "#f59e0b" },
  academic: { bg: "rgba(16,185,129,0.12)", color: "#10b981" },
  career: { bg: "rgba(139,92,246,0.12)", color: "#8b5cf6" },
  personal: { bg: "rgba(236,72,153,0.12)", color: "#ec4899" },
};

interface NoteData {
  id: string;
  type: string;
  content: string;
  tags: string[];
  isPrivate: boolean;
  followUpDate: string | null;
  followUpCompleted: boolean;
  createdDate: string;
  student: { id: string; name: string; email: string };
  author: { id: string; name: string };
}

export default function CounselorNotesPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [groupBy, setGroupBy] = useState<"none" | "student" | "type">("none");
  const limit = 20;

  const { data, isLoading } = useQuery({
    queryKey: ["counselor-notes", search, typeFilter, page],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (typeFilter) params.set("type", typeFilter);
      params.set("page", String(page));
      params.set("limit", String(limit));
      const res = await apiRequest(`/api/v1/counselor/me/notes?${params}`);
      return res;
    },
    staleTime: 1000 * 30,
  });

  const notes: NoteData[] = data?.data ?? [];
  const total: number = data?.total ?? 0;
  const totalPages = Math.ceil(total / limit);

  const formatDate = (d: string) => {
    const date = new Date(d);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  const formatTime = (d: string) => {
    const date = new Date(d);
    return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  };

  const typeColor = (type: string) => TYPE_COLORS[type] ?? TYPE_COLORS.general;

  return (
    <div style={{ color: "var(--admin-font-primary)" }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{
          fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em",
          color: "var(--admin-font-primary)", display: "flex", alignItems: "center", gap: 10,
        }}>
          <FileText style={{ width: 22, height: 22, color: "#6366f1" }} />
          Session Notes
        </h1>
        <p style={{ fontSize: 13, color: "var(--admin-font-tertiary)", marginTop: 2 }}>
          All your session notes across students
        </p>
      </div>

      {/* Search + Filter Bar */}
      <div style={{
        display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap", alignItems: "center",
      }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 240,
          background: "var(--admin-bg-card)", border: "1px solid var(--admin-border-default)",
          borderRadius: 8, padding: "0 12px", height: 38,
        }}>
          <Search style={{ width: 15, height: 15, color: "var(--admin-font-tertiary)", flexShrink: 0 }} />
          <input
            type="text"
            placeholder="Search by student name or note content..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            style={{
              flex: 1, border: "none", outline: "none", background: "transparent",
              fontSize: 13, color: "var(--admin-font-primary)", fontFamily: "inherit",
            }}
          />
        </div>

        <div style={{ position: "relative" }}>
          <select
            value={typeFilter}
            onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
            style={{
              height: 38, borderRadius: 8, padding: "0 32px 0 12px",
              fontSize: 13, fontFamily: "inherit", cursor: "pointer",
              background: "var(--admin-bg-card)", border: "1px solid var(--admin-border-default)",
              color: "var(--admin-font-primary)", appearance: "none",
              WebkitAppearance: "none",
            }}
          >
            {NOTE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          <Filter style={{
            width: 13, height: 13, color: "var(--admin-font-tertiary)",
            position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
            pointerEvents: "none",
          }} />
        </div>

        <div style={{ fontSize: 13, color: "var(--admin-font-tertiary)", display: "flex", alignItems: "center", gap: 4 }}>
          <StickyNote style={{ width: 14, height: 14 }} />
          {total} note{total !== 1 ? "s" : ""}
        </div>

        {/* Group by toggle */}
        <div style={{ display: "flex", alignItems: "center", gap: 2, background: "var(--admin-bg-card)", border: "1px solid var(--admin-border-default)", borderRadius: 8, padding: 2 }}>
          {([
            { value: "none", label: "Timeline" },
            { value: "student", label: "By Student" },
            { value: "type", label: "By Type" },
          ] as const).map((opt) => (
            <button key={opt.value} onClick={() => setGroupBy(opt.value)}
              style={{
                height: 32, padding: "0 12px", borderRadius: 6, fontSize: 12, fontWeight: 600,
                border: "none", cursor: "pointer", fontFamily: "inherit",
                background: groupBy === opt.value ? "var(--admin-accent-blue, #6366f1)" : "transparent",
                color: groupBy === opt.value ? "#fff" : "var(--admin-font-tertiary)",
                transition: "all 0.15s",
              }}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Notes List */}
      {isLoading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {Array(5).fill(0).map((_, i) => (
            <Skeleton key={i} style={{ height: 120, borderRadius: 10, background: "var(--admin-bg-hover)" }} />
          ))}
        </div>
      ) : notes.length === 0 ? (
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          padding: 60, gap: 12, color: "var(--admin-font-tertiary)",
        }}>
          <FileText style={{ width: 40, height: 40, opacity: 0.3 }} />
          <span style={{ fontSize: 15, fontWeight: 500 }}>No notes found</span>
          <span style={{ fontSize: 13 }}>
            {search || typeFilter ? "Try adjusting your search or filter" : "You haven't created any session notes yet"}
          </span>
        </div>
      ) : (() => {
        // Group notes if needed
        const groups: { label: string; key: string; notes: NoteData[] }[] = [];
        if (groupBy === "student") {
          const byStudent = new Map<string, NoteData[]>();
          for (const n of notes) {
            const key = n.student.id;
            if (!byStudent.has(key)) byStudent.set(key, []);
            byStudent.get(key)!.push(n);
          }
          for (const [key, items] of byStudent) {
            groups.push({ label: items[0].student.name || items[0].student.email, key, notes: items });
          }
        } else if (groupBy === "type") {
          const byType = new Map<string, NoteData[]>();
          for (const n of notes) {
            if (!byType.has(n.type)) byType.set(n.type, []);
            byType.get(n.type)!.push(n);
          }
          for (const [key, items] of byType) {
            groups.push({ label: key.replace("_", " "), key, notes: items });
          }
        } else {
          groups.push({ label: "", key: "all", notes });
        }

        return (
        <div style={{ display: "flex", flexDirection: "column", gap: groupBy !== "none" ? 20 : 10 }}>
          {groups.map((group) => (
            <div key={group.key}>
              {groupBy !== "none" && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  {groupBy === "student" && (
                    <span onClick={() => router.push(`/counselor/students/${group.key}`)}
                      style={{ fontSize: 15, fontWeight: 700, color: "var(--admin-font-primary)", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLSpanElement).style.color = "#6366f1"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLSpanElement).style.color = "var(--admin-font-primary)"; }}>
                      <User style={{ width: 16, height: 16, color: "var(--admin-font-tertiary)" }} />
                      {group.label}
                    </span>
                  )}
                  {groupBy === "type" && (() => { const tc = typeColor(group.key); return (
                    <span style={{ fontSize: 15, fontWeight: 700, color: tc.color, textTransform: "capitalize", display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 3, background: tc.color, display: "inline-block" }} />
                      {group.label}
                    </span>
                  ); })()}
                  <span style={{ fontSize: 11, color: "var(--admin-font-light)", padding: "2px 6px", borderRadius: 4, background: "var(--admin-bg-hover)" }}>{group.notes.length}</span>
                </div>
              )}
          <AnimatePresence mode="popLayout">
            {group.notes.map((note, idx) => {
              const isExpanded = expandedId === note.id;
              const tc = typeColor(note.type);
              const contentPreview = note.content.length > 180
                ? note.content.slice(0, 180) + "..."
                : note.content;

              return (
                <motion.div
                  key={note.id}
                  layout
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2, delay: idx * 0.03 }}
                  style={{
                    background: "var(--admin-bg-card)",
                    border: "1px solid var(--admin-border-default)",
                    borderRadius: 10,
                    overflow: "hidden",
                    cursor: "pointer",
                    transition: "border-color 0.15s",
                  }}
                  onClick={() => setExpandedId(isExpanded ? null : note.id)}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = "var(--admin-border-hover)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = "var(--admin-border-default)"; }}
                >
                  <div style={{ padding: "16px 20px" }}>
                    {/* Top row: student, type badge, date */}
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
                      {/* Student name */}
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/counselor/students/${note.student.id}`);
                        }}
                        style={{
                          fontSize: 14, fontWeight: 600, color: "var(--admin-font-primary)",
                          cursor: "pointer", display: "flex", alignItems: "center", gap: 5,
                        }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLSpanElement).style.color = "#6366f1"; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLSpanElement).style.color = "var(--admin-font-primary)"; }}
                      >
                        <User style={{ width: 14, height: 14, color: "var(--admin-font-tertiary)" }} />
                        {note.student.name || note.student.email}
                      </span>

                      {/* Type badge */}
                      <span style={{
                        fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 4,
                        background: tc.bg, color: tc.color, textTransform: "capitalize",
                      }}>
                        {note.type.replace("_", " ")}
                      </span>

                      {/* Date — pushed right */}
                      <span style={{
                        marginLeft: "auto", fontSize: 12, color: "var(--admin-font-tertiary)",
                        display: "flex", alignItems: "center", gap: 4, flexShrink: 0,
                      }}>
                        <Calendar style={{ width: 12, height: 12 }} />
                        {formatDate(note.createdDate)} at {formatTime(note.createdDate)}
                      </span>
                    </div>

                    {/* Content */}
                    <div style={{
                      fontSize: 13, lineHeight: 1.65,
                      color: "var(--admin-font-secondary)",
                      whiteSpace: isExpanded ? "pre-wrap" : undefined,
                    }}>
                      {isExpanded ? note.content : contentPreview}
                    </div>

                    {/* Bottom row: tags + expand icon */}
                    <div style={{
                      display: "flex", alignItems: "center", gap: 8, marginTop: 10, flexWrap: "wrap",
                    }}>
                      {note.tags.length > 0 && (
                        <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
                          <Tag style={{ width: 12, height: 12, color: "var(--admin-font-tertiary)" }} />
                          {note.tags.map((tag) => (
                            <span key={tag} style={{
                              fontSize: 11, padding: "1px 6px", borderRadius: 4,
                              background: "var(--admin-bg-hover)", color: "var(--admin-font-tertiary)",
                            }}>
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}

                      {note.followUpDate && (
                        <span style={{
                          fontSize: 11, display: "flex", alignItems: "center", gap: 4,
                          color: note.followUpCompleted ? "#10b981" : "#f59e0b",
                        }}>
                          <Clock style={{ width: 12, height: 12 }} />
                          Follow-up: {formatDate(note.followUpDate)}
                          {note.followUpCompleted && " (completed)"}
                        </span>
                      )}

                      <span style={{ marginLeft: "auto", color: "var(--admin-font-tertiary)" }}>
                        {isExpanded
                          ? <ChevronUp style={{ width: 16, height: 16 }} />
                          : <ChevronDown style={{ width: 16, height: 16 }} />
                        }
                      </span>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
            </div>
          ))}
        </div>
        );
      })()}

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 24,
        }}>
          <button
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
            style={{
              height: 34, padding: "0 14px", borderRadius: 6, fontSize: 13, fontWeight: 500,
              border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)",
              color: page <= 1 ? "var(--admin-font-tertiary)" : "var(--admin-font-primary)",
              cursor: page <= 1 ? "not-allowed" : "pointer", fontFamily: "inherit",
            }}
          >
            Previous
          </button>
          <span style={{ fontSize: 13, color: "var(--admin-font-secondary)" }}>
            Page {page} of {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
            style={{
              height: 34, padding: "0 14px", borderRadius: 6, fontSize: 13, fontWeight: 500,
              border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)",
              color: page >= totalPages ? "var(--admin-font-tertiary)" : "var(--admin-font-primary)",
              cursor: page >= totalPages ? "not-allowed" : "pointer", fontFamily: "inherit",
            }}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
