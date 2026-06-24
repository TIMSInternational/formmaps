"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import {
  GraduationCap,
  FileText,
  CheckSquare,
  BookOpen,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { apiRequest } from "@/lib/api/apiClient";
import { TrackedApplication } from "@/services/applicationService";
import { Essay, ChecklistItem } from "../_components/types";
import { buildDraftPayload, draftsFromEssays } from "./essay-payload";
import { ApplicationHeader } from "../_components/application-header";
import { OverviewTab } from "../_components/overview-tab";
import { EssaysTab } from "../_components/essays-tab";
import { ChecklistTab } from "../_components/checklist-tab";

// ─── Types ───────────────────────────────────────────────────────────────────

type TabId = "overview" | "essays" | "checklist";

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
        const data = (res as { data: TrackedApplication })?.data ?? res;
        setApp(data as TrackedApplication);
        setNotes((data as TrackedApplication)?.notes ?? "");
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
        const res = await apiRequest<{ data: Essay[] }>(`/api/v1/student/applications/${id}/essays`, { method: "GET" });
        const list: Essay[] = (res as unknown as { data: { data: Essay[] } })?.data?.data ?? (res as { data: Essay[] })?.data ?? [];
        setEssays(list);
        setEssayDrafts(draftsFromEssays(list));
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
        const res = await apiRequest<{ data: ChecklistItem[] }>(`/api/v1/student/applications/${id}/checklist`, { method: "GET" });
        setChecklist((res as { data: ChecklistItem[] })?.data ?? (res as unknown as ChecklistItem[]) ?? []);
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
      const res = await apiRequest<{ data: Essay }>(`/api/v1/student/applications/${id}/essays`, {
        method: "POST",
        data: {
          title: newEssay.title.trim(),
          prompt: newEssay.prompt.trim() || undefined,
          wordLimit: newEssay.wordLimit ? parseInt(newEssay.wordLimit) : undefined,
          dueDate: newEssay.dueDate || undefined,
        },
        showErrorToast: true,
      });
      const created: Essay = (res as { data: Essay })?.data ?? (res as unknown as Essay);
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
      const res = await apiRequest<{ data: Essay }>(`/api/v1/student/applications/${id}/essays/${essayId}`, {
        method: "PUT",
        data: buildDraftPayload(draft),
        showErrorToast: true,
      });
      const updated: Essay = (res as unknown as { data: { data: Essay } })?.data?.data ?? (res as { data: Essay })?.data ?? ({} as Essay);
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
      const res = await apiRequest<{ data: { feedback: string } }>(`/api/v1/student/applications/${id}/essays/${essayId}/ai-review`, {
        method: "POST",
        data: {},
        showErrorToast: true,
      });
      const feedback: string = (res as { data: { feedback: string } })?.data?.feedback ?? (res as unknown as { feedback: string })?.feedback ?? "No feedback returned.";
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
      const res = await apiRequest<{ data: ChecklistItem[] }>(`/api/v1/student/applications/${id}/checklist/generate`, {
        method: "POST",
        showErrorToast: true,
      });
      const list: ChecklistItem[] = (res as { data: ChecklistItem[] })?.data ?? (res as unknown as ChecklistItem[]) ?? [];
      setChecklist(list);
      toast.success("Checklist generated");
    } catch {
      // error toasted
    } finally {
      setGeneratingChecklist(false);
    }
  }, [id]);

  const toggleChecklistItem = useCallback(async (item: ChecklistItem) => {
    const updated = { ...item, isCompleted: !item.isCompleted };
    setChecklist((prev) => prev.map((c) => (c.id === item.id ? updated : c)));
    try {
      setSavingItem(item.id);
      await apiRequest(`/api/v1/student/applications/${id}/checklist/${item.id}`, {
        method: "PUT",
        data: { isCompleted: updated.isCompleted },
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
      const res = await apiRequest<{ data: ChecklistItem }>(`/api/v1/student/applications/${id}/checklist`, {
        method: "POST",
        data: {
          itemName: newItem.name.trim(),
          category: newItem.category,
          dueDate: newItem.dueDate || undefined,
          notes: newItem.notes.trim() || undefined,
        },
        showErrorToast: true,
      });
      const created: ChecklistItem = (res as { data: ChecklistItem })?.data ?? (res as unknown as ChecklistItem);
      setChecklist((prev) => [...prev, created]);
      setNewItem({ name: "", category: "other", dueDate: "", notes: "" });
      setShowAddItem(false);
      toast.success("Item added");
    } catch {
      // error toasted
    }
  }, [id, newItem]);

  // ─── Render ───────────────────────────────────────────────────────────────

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
      <ApplicationHeader app={app} onBack={() => router.push("/dashboard/applications")} />

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
        {activeTab === "overview" && (
          <OverviewTab
            app={app}
            notes={notes}
            notesDirty={notesDirty}
            savingNotes={savingNotes}
            onNotesChange={(v) => { setNotes(v); setNotesDirty(true); }}
            onSaveNotes={saveNotes}
          />
        )}

        {activeTab === "essays" && (
          <EssaysTab
            essays={essays}
            loadingEssays={loadingEssays}
            expandedEssay={expandedEssay}
            essayDrafts={essayDrafts}
            savingEssay={savingEssay}
            reviewingEssay={reviewingEssay}
            aiReviews={aiReviews}
            showAddEssay={showAddEssay}
            newEssay={newEssay}
            onSetExpandedEssay={setExpandedEssay}
            onSetEssayDraft={(eId, value) => setEssayDrafts((prev) => ({ ...prev, [eId]: value }))}
            onSaveEssayDraft={saveEssayDraft}
            onRequestAiReview={requestAiReview}
            onSetShowAddEssay={setShowAddEssay}
            onSetNewEssay={setNewEssay}
            onAddEssay={addEssay}
          />
        )}

        {activeTab === "checklist" && (
          <ChecklistTab
            checklist={checklist}
            loadingChecklist={loadingChecklist}
            generatingChecklist={generatingChecklist}
            savingItem={savingItem}
            showAddItem={showAddItem}
            newItem={newItem}
            onToggleItem={toggleChecklistItem}
            onGenerateChecklist={generateChecklist}
            onSetShowAddItem={setShowAddItem}
            onSetNewItem={setNewItem}
            onAddItem={addChecklistItem}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
