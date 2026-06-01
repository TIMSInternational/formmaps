"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import {
  ArrowLeft,
  GraduationCap,
  MapPin,
  Calendar,
  FileText,
  CheckSquare,
  BookOpen,
  Plus,
  X,
  Loader2,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Save,
  Trash2,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/api/apiClient";
import { TrackedApplication } from "@/services/applicationService";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Essay {
  id: string;
  title: string;
  prompt?: string;
  wordLimit?: number;
  dueDate?: string;
  status: "not_started" | "in_progress" | "complete";
  draft?: string;
}

interface ChecklistItem {
  id: string;
  name: string;
  category: "test_scores" | "transcripts" | "recommendations" | "financial_aid" | "other";
  dueDate?: string;
  notes?: string;
  completed: boolean;
}

type TabId = "overview" | "essays" | "checklist";

const CATEGORY_LABELS: Record<ChecklistItem["category"], string> = {
  test_scores: "Test Scores",
  transcripts: "Transcripts",
  recommendations: "Recommendations",
  financial_aid: "Financial Aid",
  other: "Other",
};

const CATEGORY_ORDER: ChecklistItem["category"][] = [
  "test_scores",
  "transcripts",
  "recommendations",
  "financial_aid",
  "other",
];

const ESSAY_STATUS_CONFIG = {
  not_started: { label: "Not Started", color: "var(--admin-font-tertiary)", bg: "var(--admin-bg-hover)" },
  in_progress: { label: "In Progress", color: "var(--admin-accent-amber)", bg: "rgba(245,158,11,0.1)" },
  complete: { label: "Complete", color: "var(--admin-accent-green)", bg: "rgba(16,185,129,0.1)" },
};

function fitBadge(score?: number) {
  if (!score) return null;
  if (score >= 75) return { label: "Safety", color: "var(--admin-accent-green)", bg: "rgba(16,185,129,0.1)" };
  if (score >= 55) return { label: "Match", color: "var(--admin-accent-blue)", bg: "rgba(59,130,246,0.1)" };
  return { label: "Reach", color: "var(--admin-accent-amber)", bg: "rgba(245,158,11,0.1)" };
}

function wordCount(text: string) {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ApplicationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [app, setApp] = useState<TrackedApplication | null>(null);
  const [isLoadingApp, setIsLoadingApp] = useState(true);

  // Overview
  const [notes, setNotes] = useState("");
  const [notesDirty, setNotesDirty] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);

  // Essays
  const [essays, setEssays] = useState<Essay[]>([]);
  const [loadingEssays, setLoadingEssays] = useState(false);
  const [expandedEssay, setExpandedEssay] = useState<string | null>(null);
  const [essayDrafts, setEssayDrafts] = useState<Record<string, string>>({});
  const [savingEssay, setSavingEssay] = useState<string | null>(null);
  const [reviewingEssay, setReviewingEssay] = useState<string | null>(null);
  const [aiReviews, setAiReviews] = useState<Record<string, string>>({});
  const [showAddEssay, setShowAddEssay] = useState(false);
  const [newEssay, setNewEssay] = useState({ title: "", prompt: "", wordLimit: "", dueDate: "" });

  // Checklist
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [loadingChecklist, setLoadingChecklist] = useState(false);
  const [generatingChecklist, setGeneratingChecklist] = useState(false);
  const [showAddItem, setShowAddItem] = useState(false);
  const [newItem, setNewItem] = useState({ name: "", category: "other" as ChecklistItem["category"], dueDate: "", notes: "" });
  const [savingItem, setSavingItem] = useState<string | null>(null);

  // ── Load application ──────────────────────────────────────────────────────

  useEffect(() => {
    async function load() {
      try {
        setIsLoadingApp(true);
        const res = await apiRequest<{ data: TrackedApplication } | TrackedApplication>(
          `/api/v1/student/applications/${id}`,
          { method: "GET" }
        );
        const data = (res as any)?.data ?? res;
        setApp(data);
        setNotes(data?.notes ?? "");
      } catch {
        toast.error("Failed to load application");
      } finally {
        setIsLoadingApp(false);
      }
    }
    load();
  }, [id]);

  // ── Load essays when tab opens ────────────────────────────────────────────

  useEffect(() => {
    if (activeTab !== "essays" || essays.length > 0) return;
    async function load() {
      try {
        setLoadingEssays(true);
        const res = await apiRequest<any>(`/api/v1/student/applications/${id}/essays`, { method: "GET" });
        const list: Essay[] = res?.data ?? res ?? [];
        setEssays(list);
        const drafts: Record<string, string> = {};
        list.forEach((e) => { if (e.draft) drafts[e.id] = e.draft; });
        setEssayDrafts(drafts);
      } catch {
        toast.error("Failed to load essays");
      } finally {
        setLoadingEssays(false);
      }
    }
    load();
  }, [activeTab, id, essays.length]);

  // ── Load checklist when tab opens ─────────────────────────────────────────

  useEffect(() => {
    if (activeTab !== "checklist" || checklist.length > 0) return;
    async function load() {
      try {
        setLoadingChecklist(true);
        const res = await apiRequest<any>(`/api/v1/student/applications/${id}/checklist`, { method: "GET" });
        setChecklist(res?.data ?? res ?? []);
      } catch {
        toast.error("Failed to load checklist");
      } finally {
        setLoadingChecklist(false);
      }
    }
    load();
  }, [activeTab, id, checklist.length]);

  // ── Overview: save notes ──────────────────────────────────────────────────

  const saveNotes = useCallback(async () => {
    try {
      setSavingNotes(true);
      await apiRequest(`/api/v1/student/applications/${id}`, {
        method: "PUT",
        data: { notes },
        showErrorToast: true,
      });
      setNotesDirty(false);
      toast.success("Notes saved");
    } catch {
      // error toasted by apiRequest
    } finally {
      setSavingNotes(false);
    }
  }, [id, notes]);

  // ── Essays ────────────────────────────────────────────────────────────────

  const addEssay = useCallback(async () => {
    if (!newEssay.title.trim()) return;
    try {
      const res = await apiRequest<any>(`/api/v1/student/applications/${id}/essays`, {
        method: "POST",
        data: {
          title: newEssay.title.trim(),
          prompt: newEssay.prompt.trim() || undefined,
          wordLimit: newEssay.wordLimit ? parseInt(newEssay.wordLimit) : undefined,
          dueDate: newEssay.dueDate || undefined,
        },
        showErrorToast: true,
      });
      const created: Essay = res?.data ?? res;
      setEssays((prev) => [...prev, created]);
      setNewEssay({ title: "", prompt: "", wordLimit: "", dueDate: "" });
      setShowAddEssay(false);
      toast.success("Essay added");
    } catch {
      // error toasted
    }
  }, [id, newEssay]);

  const saveEssayDraft = useCallback(async (essayId: string) => {
    try {
      setSavingEssay(essayId);
      const draft = essayDrafts[essayId] ?? "";
      const res = await apiRequest<any>(`/api/v1/student/applications/${id}/essays/${essayId}`, {
        method: "PUT",
        data: { draft, status: draft ? "in_progress" : "not_started" },
        showErrorToast: true,
      });
      const updated: Essay = res?.data ?? res;
      setEssays((prev) => prev.map((e) => (e.id === essayId ? { ...e, ...updated } : e)));
      toast.success("Draft saved");
    } catch {
      // error toasted
    } finally {
      setSavingEssay(null);
    }
  }, [id, essayDrafts]);

  const requestAiReview = useCallback(async (essayId: string) => {
    try {
      setReviewingEssay(essayId);
      const res = await apiRequest<any>(`/api/v1/student/applications/${id}/essays/${essayId}/ai-review`, {
        method: "POST",
        data: { draft: essayDrafts[essayId] ?? "" },
        showErrorToast: true,
      });
      const feedback: string = res?.feedback ?? res?.data?.feedback ?? "No feedback returned.";
      setAiReviews((prev) => ({ ...prev, [essayId]: feedback }));
      toast.success("AI review complete");
    } catch {
      // error toasted
    } finally {
      setReviewingEssay(null);
    }
  }, [id, essayDrafts]);

  // ── Checklist ─────────────────────────────────────────────────────────────

  const generateChecklist = useCallback(async () => {
    try {
      setGeneratingChecklist(true);
      const res = await apiRequest<any>(`/api/v1/student/applications/${id}/checklist/generate`, {
        method: "POST",
        showErrorToast: true,
      });
      const list: ChecklistItem[] = res?.data ?? res ?? [];
      setChecklist(list);
      toast.success("Checklist generated");
    } catch {
      // error toasted
    } finally {
      setGeneratingChecklist(false);
    }
  }, [id]);

  const toggleChecklistItem = useCallback(async (item: ChecklistItem) => {
    const updated = { ...item, completed: !item.completed };
    setChecklist((prev) => prev.map((c) => (c.id === item.id ? updated : c)));
    try {
      setSavingItem(item.id);
      await apiRequest(`/api/v1/student/applications/${id}/checklist/${item.id}`, {
        method: "PUT",
        data: { completed: updated.completed },
        showErrorToast: true,
      });
    } catch {
      setChecklist((prev) => prev.map((c) => (c.id === item.id ? item : c)));
      toast.error("Failed to update item");
    } finally {
      setSavingItem(null);
    }
  }, [id]);

  const addChecklistItem = useCallback(async () => {
    if (!newItem.name.trim()) return;
    try {
      const res = await apiRequest<any>(`/api/v1/student/applications/${id}/checklist`, {
        method: "POST",
        data: {
          name: newItem.name.trim(),
          category: newItem.category,
          dueDate: newItem.dueDate || undefined,
          notes: newItem.notes.trim() || undefined,
        },
        showErrorToast: true,
      });
      const created: ChecklistItem = res?.data ?? res;
      setChecklist((prev) => [...prev, created]);
      setNewItem({ name: "", category: "other", dueDate: "", notes: "" });
      setShowAddItem(false);
      toast.success("Item added");
    } catch {
      // error toasted
    }
  }, [id, newItem]);

  // ─── Render ───────────────────────────────────────────────────────────────

  const fit = fitBadge(app?.matchScore);
  const COLUMN_LABELS: Record<string, string> = {
    researching: "Researching",
    shortlisted: "Shortlisted",
    applying: "Applying",
    applied: "Applied",
    accepted: "Accepted",
  };

  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: "overview", label: "Overview", icon: <GraduationCap className="h-3.5 w-3.5" /> },
    { id: "essays", label: "Essays", icon: <BookOpen className="h-3.5 w-3.5" /> },
    { id: "checklist", label: "Checklist", icon: <CheckSquare className="h-3.5 w-3.5" /> },
  ];

  if (isLoadingApp) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!app) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <FileText className="h-10 w-10 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Application not found.</p>
        <button onClick={() => router.push("/dashboard/applications")} className="text-xs underline" style={{ color: "var(--admin-accent-blue)" }}>
          Back to tracker
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-4xl">
      {/* ── Header ── */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-3">
        <button
          onClick={() => router.push("/dashboard/applications")}
          className="flex items-center gap-1.5 text-xs w-fit transition-colors"
          style={{ color: "var(--admin-font-tertiary)" }}
        >
          <ArrowLeft className="h-3 w-3" />
          Back to tracker
        </button>

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-muted-foreground">
              Application Detail
            </span>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight leading-none">
              {app.name}
            </h1>
            <div className="flex items-center gap-3 flex-wrap mt-1">
              {app.location && (
                <span className="flex items-center gap-1 text-xs" style={{ color: "var(--admin-font-tertiary)" }}>
                  <MapPin className="h-3 w-3" />
                  {app.location}
                </span>
              )}
              {app.deadline && (
                <span className="flex items-center gap-1 text-xs" style={{ color: "var(--admin-accent-amber)" }}>
                  <Calendar className="h-3 w-3" />
                  {app.deadline}
                </span>
              )}
              <span
                className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                style={{
                  background: "var(--admin-bg-hover)",
                  color: "var(--admin-font-tertiary)",
                  border: "1px solid var(--admin-border-light)",
                }}
              >
                {COLUMN_LABELS[app.column] ?? app.column}
              </span>
              {fit && (
                <span
                  className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                  style={{ background: fit.bg, color: fit.color }}
                >
                  {fit.label}
                </span>
              )}
              {app.matchScore && (
                <span
                  className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                  style={{ background: "rgba(59,130,246,0.1)", color: "var(--admin-accent-blue)" }}
                >
                  {app.matchScore}% match
                </span>
              )}
            </div>
          </div>
        </div>
      </motion.div>

      {/* ── Tabs ── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="flex gap-1 p-1 rounded-xl"
        style={{ background: "var(--admin-bg-card)", border: "1px solid var(--admin-border-default)" }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-all"
            style={
              activeTab === tab.id
                ? { background: "var(--admin-bg-hover)", color: "var(--admin-font-primary)", border: "1px solid var(--admin-border-default)" }
                : { color: "var(--admin-font-tertiary)", border: "1px solid transparent" }
            }
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </motion.div>

      {/* ── Tab Content ── */}
      <AnimatePresence mode="wait">
        {/* ─── OVERVIEW TAB ─────────────────────────────────────────────── */}
        {activeTab === "overview" && (
          <motion.div
            key="overview"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="space-y-4"
          >
            {/* Info card */}
            <div
              className="rounded-xl p-5 grid grid-cols-2 sm:grid-cols-3 gap-5"
              style={{ background: "var(--admin-bg-card)", border: "1px solid var(--admin-border-default)" }}
            >
              <InfoRow label="Name" value={app.name} />
              <InfoRow label="Type" value={app.type ?? "—"} />
              <InfoRow label="Location" value={app.location ?? "—"} />
              <InfoRow label="Status" value={COLUMN_LABELS[app.column] ?? app.column} />
              <InfoRow label="Deadline" value={app.deadline ?? "—"} />
              {app.matchScore && <InfoRow label="Match Score" value={`${app.matchScore}%`} />}
              {fit && (
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--admin-font-tertiary)" }}>
                    Fit
                  </span>
                  <span
                    className="text-xs font-semibold px-2 py-0.5 rounded-full w-fit"
                    style={{ background: fit.bg, color: fit.color }}
                  >
                    {fit.label}
                  </span>
                </div>
              )}
            </div>

            {/* Notes */}
            <div
              className="rounded-xl p-5 space-y-3"
              style={{ background: "var(--admin-bg-card)", border: "1px solid var(--admin-border-default)" }}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold" style={{ color: "var(--admin-font-primary)" }}>
                  Notes
                </span>
                {notesDirty && (
                  <button
                    onClick={saveNotes}
                    disabled={savingNotes}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium text-white disabled:opacity-60 transition-opacity"
                    style={{ background: "var(--admin-accent-blue)" }}
                  >
                    {savingNotes ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                    Save
                  </button>
                )}
              </div>
              <textarea
                rows={5}
                placeholder="Add notes about this application..."
                value={notes}
                onChange={(e) => { setNotes(e.target.value); setNotesDirty(true); }}
                className="w-full px-3 py-2.5 rounded-lg text-sm outline-none resize-none"
                style={{
                  background: "var(--admin-bg-input)",
                  border: "1px solid var(--admin-border-default)",
                  color: "var(--admin-font-primary)",
                }}
              />
            </div>
          </motion.div>
        )}

        {/* ─── ESSAYS TAB ───────────────────────────────────────────────── */}
        {activeTab === "essays" && (
          <motion.div
            key="essays"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="space-y-3"
          >
            {/* Action bar */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold" style={{ color: "var(--admin-font-secondary)" }}>
                {essays.length} essay{essays.length !== 1 ? "s" : ""}
              </span>
              <button
                onClick={() => setShowAddEssay(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white"
                style={{ background: "var(--admin-accent-blue)" }}
              >
                <Plus className="h-3.5 w-3.5" />
                Add Essay
              </button>
            </div>

            {/* Add essay form */}
            <AnimatePresence>
              {showAddEssay && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div
                    className="rounded-xl p-4 space-y-3"
                    style={{ background: "var(--admin-bg-card)", border: "1px dashed var(--admin-border-default)" }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold" style={{ color: "var(--admin-font-primary)" }}>
                        New Essay
                      </span>
                      <button onClick={() => setShowAddEssay(false)}>
                        <X className="h-4 w-4" style={{ color: "var(--admin-font-tertiary)" }} />
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <FormInput
                        placeholder="Essay title *"
                        value={newEssay.title}
                        onChange={(v) => setNewEssay((p) => ({ ...p, title: v }))}
                      />
                      <FormInput
                        placeholder="Prompt (optional)"
                        value={newEssay.prompt}
                        onChange={(v) => setNewEssay((p) => ({ ...p, prompt: v }))}
                      />
                      <FormInput
                        placeholder="Word limit"
                        type="number"
                        value={newEssay.wordLimit}
                        onChange={(v) => setNewEssay((p) => ({ ...p, wordLimit: v }))}
                      />
                      <FormInput
                        placeholder="Due date"
                        type="date"
                        value={newEssay.dueDate}
                        onChange={(v) => setNewEssay((p) => ({ ...p, dueDate: v }))}
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={addEssay}
                        disabled={!newEssay.title.trim()}
                        className="px-4 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-40"
                        style={{ background: "var(--admin-accent-blue)" }}
                      >
                        Add
                      </button>
                      <button
                        onClick={() => setShowAddEssay(false)}
                        className="px-4 py-1.5 rounded-lg text-xs"
                        style={{ color: "var(--admin-font-tertiary)", border: "1px solid var(--admin-border-default)" }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Essay list */}
            {loadingEssays ? (
              <LoadingRow />
            ) : essays.length === 0 ? (
              <EmptyState icon={<BookOpen className="h-8 w-8" />} message="No essays yet. Add your first essay to get started." />
            ) : (
              <div className="space-y-2">
                {essays.map((essay) => {
                  const statusCfg = ESSAY_STATUS_CONFIG[essay.status];
                  const isExpanded = expandedEssay === essay.id;
                  const draft = essayDrafts[essay.id] ?? essay.draft ?? "";
                  const wc = wordCount(draft);
                  const review = aiReviews[essay.id];

                  return (
                    <motion.div
                      key={essay.id}
                      layout
                      className="rounded-xl overflow-hidden"
                      style={{ background: "var(--admin-bg-card)", border: "1px solid var(--admin-border-default)" }}
                    >
                      {/* Essay header */}
                      <button
                        onClick={() => setExpandedEssay(isExpanded ? null : essay.id)}
                        className="w-full flex items-center justify-between px-4 py-3 text-left"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <BookOpen className="h-4 w-4 shrink-0" style={{ color: "var(--admin-font-tertiary)" }} />
                          <div className="min-w-0">
                            <div className="text-sm font-medium truncate" style={{ color: "var(--admin-font-primary)" }}>
                              {essay.title}
                            </div>
                            {essay.dueDate && (
                              <div className="flex items-center gap-1 text-[11px] mt-0.5" style={{ color: "var(--admin-font-tertiary)" }}>
                                <Calendar className="h-3 w-3" />
                                Due {essay.dueDate}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span
                            className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                            style={{ background: statusCfg.bg, color: statusCfg.color }}
                          >
                            {statusCfg.label}
                          </span>
                          {essay.wordLimit && (
                            <span className="text-[10px]" style={{ color: "var(--admin-font-tertiary)" }}>
                              {wc}/{essay.wordLimit}w
                            </span>
                          )}
                          {isExpanded ? (
                            <ChevronUp className="h-3.5 w-3.5" style={{ color: "var(--admin-font-tertiary)" }} />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5" style={{ color: "var(--admin-font-tertiary)" }} />
                          )}
                        </div>
                      </button>

                      {/* Expanded content */}
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                          >
                            <div
                              className="px-4 pb-4 space-y-3"
                              style={{ borderTop: "1px solid var(--admin-border-light)" }}
                            >
                              {essay.prompt && (
                                <div className="pt-3">
                                  <p className="text-[11px] font-semibold mb-1" style={{ color: "var(--admin-font-tertiary)" }}>
                                    PROMPT
                                  </p>
                                  <p className="text-xs" style={{ color: "var(--admin-font-secondary)" }}>
                                    {essay.prompt}
                                  </p>
                                </div>
                              )}

                              {/* Draft textarea */}
                              <div className="pt-1">
                                <div className="flex items-center justify-between mb-1.5">
                                  <p className="text-[11px] font-semibold" style={{ color: "var(--admin-font-tertiary)" }}>
                                    DRAFT
                                  </p>
                                  <div className="flex items-center gap-1.5 text-[10px]" style={{ color: "var(--admin-font-tertiary)" }}>
                                    <span>{wc} words{essay.wordLimit ? ` / ${essay.wordLimit} limit` : ""}</span>
                                    {essay.wordLimit && wc > essay.wordLimit && (
                                      <span style={{ color: "var(--admin-accent-red)" }}>Over limit</span>
                                    )}
                                  </div>
                                </div>
                                <textarea
                                  rows={8}
                                  placeholder="Start writing your essay..."
                                  value={draft}
                                  onChange={(e) =>
                                    setEssayDrafts((prev) => ({ ...prev, [essay.id]: e.target.value }))
                                  }
                                  className="w-full px-3 py-2.5 rounded-lg text-sm outline-none resize-none"
                                  style={{
                                    background: "var(--admin-bg-input)",
                                    border: "1px solid var(--admin-border-default)",
                                    color: "var(--admin-font-primary)",
                                    lineHeight: "1.6",
                                  }}
                                />
                              </div>

                              {/* Actions */}
                              <div className="flex items-center gap-2 flex-wrap">
                                <button
                                  onClick={() => saveEssayDraft(essay.id)}
                                  disabled={savingEssay === essay.id}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-60"
                                  style={{ background: "var(--admin-accent-blue)" }}
                                >
                                  {savingEssay === essay.id ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <Save className="h-3 w-3" />
                                  )}
                                  Save Draft
                                </button>
                                <button
                                  onClick={() => requestAiReview(essay.id)}
                                  disabled={reviewingEssay === essay.id || !draft.trim()}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-60"
                                  style={{
                                    background: "rgba(139,92,246,0.1)",
                                    color: "var(--admin-accent-purple)",
                                    border: "1px solid rgba(139,92,246,0.2)",
                                  }}
                                >
                                  {reviewingEssay === essay.id ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <Sparkles className="h-3 w-3" />
                                  )}
                                  AI Review
                                </button>
                              </div>

                              {/* AI Review result */}
                              <AnimatePresence>
                                {review && (
                                  <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: "auto" }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="rounded-lg p-3 overflow-hidden"
                                    style={{
                                      background: "rgba(139,92,246,0.06)",
                                      border: "1px solid rgba(139,92,246,0.2)",
                                    }}
                                  >
                                    <div className="flex items-center gap-2 mb-2">
                                      <Sparkles className="h-3.5 w-3.5" style={{ color: "var(--admin-accent-purple)" }} />
                                      <span className="text-[11px] font-semibold" style={{ color: "var(--admin-accent-purple)" }}>
                                        AI Feedback
                                      </span>
                                    </div>
                                    <p className="text-xs leading-relaxed" style={{ color: "var(--admin-font-secondary)" }}>
                                      {review}
                                    </p>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}

        {/* ─── CHECKLIST TAB ────────────────────────────────────────────── */}
        {activeTab === "checklist" && (
          <motion.div
            key="checklist"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="space-y-3"
          >
            {/* Action bar */}
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="text-xs font-semibold" style={{ color: "var(--admin-font-secondary)" }}>
                {checklist.filter((c) => c.completed).length}/{checklist.length} completed
              </span>
              <div className="flex gap-2">
                <button
                  onClick={generateChecklist}
                  disabled={generatingChecklist}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-60"
                  style={{
                    background: "rgba(139,92,246,0.1)",
                    color: "var(--admin-accent-purple)",
                    border: "1px solid rgba(139,92,246,0.2)",
                  }}
                >
                  {generatingChecklist ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                  Generate Checklist
                </button>
                <button
                  onClick={() => setShowAddItem(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white"
                  style={{ background: "var(--admin-accent-blue)" }}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Item
                </button>
              </div>
            </div>

            {/* Add item form */}
            <AnimatePresence>
              {showAddItem && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div
                    className="rounded-xl p-4 space-y-3"
                    style={{ background: "var(--admin-bg-card)", border: "1px dashed var(--admin-border-default)" }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold" style={{ color: "var(--admin-font-primary)" }}>
                        New Item
                      </span>
                      <button onClick={() => setShowAddItem(false)}>
                        <X className="h-4 w-4" style={{ color: "var(--admin-font-tertiary)" }} />
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <FormInput
                        placeholder="Item name *"
                        value={newItem.name}
                        onChange={(v) => setNewItem((p) => ({ ...p, name: v }))}
                      />
                      <div>
                        <select
                          value={newItem.category}
                          onChange={(e) => setNewItem((p) => ({ ...p, category: e.target.value as ChecklistItem["category"] }))}
                          className="w-full px-3 py-2 rounded-lg text-xs outline-none"
                          style={{
                            background: "var(--admin-bg-input)",
                            border: "1px solid var(--admin-border-default)",
                            color: "var(--admin-font-primary)",
                          }}
                        >
                          {CATEGORY_ORDER.map((c) => (
                            <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                          ))}
                        </select>
                      </div>
                      <FormInput
                        placeholder="Due date"
                        type="date"
                        value={newItem.dueDate}
                        onChange={(v) => setNewItem((p) => ({ ...p, dueDate: v }))}
                      />
                      <FormInput
                        placeholder="Notes (optional)"
                        value={newItem.notes}
                        onChange={(v) => setNewItem((p) => ({ ...p, notes: v }))}
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={addChecklistItem}
                        disabled={!newItem.name.trim()}
                        className="px-4 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-40"
                        style={{ background: "var(--admin-accent-blue)" }}
                      >
                        Add
                      </button>
                      <button
                        onClick={() => setShowAddItem(false)}
                        className="px-4 py-1.5 rounded-lg text-xs"
                        style={{ color: "var(--admin-font-tertiary)", border: "1px solid var(--admin-border-default)" }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Checklist grouped by category */}
            {loadingChecklist ? (
              <LoadingRow />
            ) : checklist.length === 0 ? (
              <EmptyState
                icon={<CheckSquare className="h-8 w-8" />}
                message="No checklist items yet. Generate an AI checklist or add items manually."
              />
            ) : (
              <div className="space-y-4">
                {CATEGORY_ORDER.filter((cat) => checklist.some((c) => c.category === cat)).map((cat) => {
                  const items = checklist.filter((c) => c.category === cat);
                  const done = items.filter((c) => c.completed).length;
                  return (
                    <div key={cat} className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span
                          className="text-[10px] uppercase tracking-wider font-bold"
                          style={{ color: "var(--admin-font-tertiary)" }}
                        >
                          {CATEGORY_LABELS[cat]}
                        </span>
                        <span className="text-[10px]" style={{ color: "var(--admin-font-light)" }}>
                          {done}/{items.length}
                        </span>
                      </div>
                      {items.map((item) => (
                        <motion.div
                          key={item.id}
                          layout
                          className="flex items-start gap-3 px-4 py-3 rounded-xl"
                          style={{
                            background: "var(--admin-bg-card)",
                            border: "1px solid var(--admin-border-default)",
                            opacity: item.completed ? 0.6 : 1,
                          }}
                        >
                          <button
                            onClick={() => toggleChecklistItem(item)}
                            disabled={savingItem === item.id}
                            className="mt-0.5 shrink-0 h-4 w-4 rounded flex items-center justify-center transition-colors"
                            style={{
                              background: item.completed ? "var(--admin-accent-green)" : "transparent",
                              border: item.completed ? "none" : "1.5px solid var(--admin-border-default)",
                            }}
                          >
                            {savingItem === item.id ? (
                              <Loader2 className="h-2.5 w-2.5 animate-spin text-white" />
                            ) : item.completed ? (
                              <Check className="h-2.5 w-2.5 text-white" />
                            ) : null}
                          </button>
                          <div className="flex-1 min-w-0">
                            <span
                              className={cn("text-sm", item.completed && "line-through")}
                              style={{ color: "var(--admin-font-primary)" }}
                            >
                              {item.name}
                            </span>
                            <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                              {item.dueDate && (
                                <span className="flex items-center gap-1 text-[11px]" style={{ color: "var(--admin-font-tertiary)" }}>
                                  <Calendar className="h-3 w-3" />
                                  {item.dueDate}
                                </span>
                              )}
                              {item.notes && (
                                <span className="text-[11px]" style={{ color: "var(--admin-font-tertiary)" }}>
                                  {item.notes}
                                </span>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--admin-font-tertiary)" }}>
        {label}
      </span>
      <span className="text-sm font-medium capitalize" style={{ color: "var(--admin-font-primary)" }}>
        {value}
      </span>
    </div>
  );
}

function FormInput({
  placeholder,
  value,
  onChange,
  type = "text",
}: {
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <input
      type={type}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2 rounded-lg text-xs outline-none"
      style={{
        background: "var(--admin-bg-input)",
        border: "1px solid var(--admin-border-default)",
        color: "var(--admin-font-primary)",
      }}
    />
  );
}

function LoadingRow() {
  return (
    <div className="flex items-center justify-center py-10">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );
}

function EmptyState({ icon, message }: { icon: React.ReactNode; message: string }) {
  return (
    <div
      className="flex flex-col items-center justify-center py-12 gap-3 rounded-xl"
      style={{ border: "1px dashed var(--admin-border-default)" }}
    >
      <div style={{ color: "var(--admin-font-light)" }}>{icon}</div>
      <p className="text-xs text-center max-w-xs" style={{ color: "var(--admin-font-tertiary)" }}>
        {message}
      </p>
    </div>
  );
}
