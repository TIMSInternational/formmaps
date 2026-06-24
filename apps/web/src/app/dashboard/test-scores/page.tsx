"use client";

import { useState, useEffect, useMemo } from "react";
import { motion } from "motion/react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { QueryStateBoundary } from "@/components/QueryStateBoundary";
import {
  listTestScores,
  addTestScore,
  updateTestScore,
  deleteTestScore,
  getSuperScore,
  TestScore,
  SuperScore,
} from "@/services/testScoreService";

import {
  type FormState,
  emptyForm,
  buildPayload,
  scoreFromRecord,
} from "./_components/score-helpers";
import { ScoreEntryForm } from "./_components/score-entry-form";
import { SuperScoreBanner } from "./_components/super-score-banner";
import { ScoreList } from "./_components/score-list";

export default function TestScoresPage() {
  const [scores, setScores] = useState<TestScore[]>([]);
  const [superScore, setSuperScore] = useState<SuperScore | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<boolean>(false);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  async function fetchAll() {
    setError(false);
    try {
      const [s, ss] = await Promise.all([listTestScores(), getSuperScore()]);
      setScores(s);
      setSuperScore(ss);
    } catch {
      setError(true);
      toast.error("Failed to load test scores");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchAll();
  }, []);

  // Group by test type
  const grouped = useMemo(() => {
    const map: Record<string, TestScore[]> = {};
    for (const s of scores) {
      if (!map[s.testType]) map[s.testType] = [];
      map[s.testType].push(s);
    }
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => {
        if (!a.testDate) return 1;
        if (!b.testDate) return -1;
        return new Date(b.testDate).getTime() - new Date(a.testDate).getTime();
      });
    }
    return map;
  }, [scores]);

  const typeOrder: string[] = ["SAT", "ACT", "AP", "PSAT", "TOEFL", "IB"];
  const groupKeys = [
    ...typeOrder.filter((k) => grouped[k]),
    ...Object.keys(grouped).filter((k) => !typeOrder.includes(k)),
  ];

  // Form helpers
  function patchForm(patch: Partial<FormState>) {
    setForm((prev) => ({ ...prev, ...patch }));
  }

  function openAdd() {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(true);
  }

  function openEdit(score: TestScore) {
    setEditingId(score.id);
    setForm(scoreFromRecord(score));
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
  }

  async function handleSave() {
    const payload = buildPayload(form);
    setSaving(true);
    try {
      if (editingId) {
        await updateTestScore(editingId, payload);
        toast.success("Score updated");
      } else {
        await addTestScore(payload);
        toast.success("Score added");
      }
      closeForm();
      await fetchAll();
    } catch {
      toast.error("Failed to save score");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setDeleting(id);
    try {
      await deleteTestScore(id);
      toast.success("Score deleted");
      await fetchAll();
    } catch {
      toast.error("Failed to delete score");
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row md:items-end justify-between gap-6"
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Academic Profile
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-foreground mb-1">
            Test Scores
          </h1>
          <p className="text-sm text-muted-foreground">
            Track your SAT, ACT, AP, and other standardized test results.
          </p>
        </div>
        <Button
          onClick={openAdd}
          className="bg-foreground text-background hover:bg-foreground/90 shrink-0"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Score
        </Button>
      </motion.div>

      <SuperScoreBanner superScore={superScore} />

      <ScoreEntryForm
        show={showForm}
        form={form}
        editingId={editingId}
        saving={saving}
        onPatchForm={patchForm}
        onClose={closeForm}
        onSave={handleSave}
      />

      <QueryStateBoundary
        isLoading={loading}
        isError={error}
        onRetry={() => { setLoading(true); void fetchAll(); }}
      >
        <ScoreList
          loading={false}
          scores={scores}
          grouped={grouped}
          groupKeys={groupKeys}
          deleting={deleting}
          onEdit={openEdit}
          onDelete={handleDelete}
          onAddClick={openAdd}
        />
      </QueryStateBoundary>
    </div>
  );
}
