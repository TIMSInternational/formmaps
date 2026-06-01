"use client";

import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Plus,
  Trophy,
  Calendar,
  CheckCircle2,
  Edit2,
  Trash2,
  Loader2,
  BookOpen,
  Star,
  X,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  listTestScores,
  addTestScore,
  updateTestScore,
  deleteTestScore,
  getSuperScore,
  TestScore,
  SuperScore,
} from "@/services/testScoreService";
import { format } from "date-fns";

// ─── Types ─────────────────────────────────────────────────────────────────

type TestType = "SAT" | "ACT" | "AP" | "PSAT" | "TOEFL" | "IB";

interface FormState {
  testType: TestType;
  testDate: string;
  isOfficial: boolean;
  // SAT
  satMath: string;
  satReading: string;
  // ACT
  actEnglish: string;
  actMath: string;
  actReading: string;
  actScience: string;
  // AP
  apSubject: string;
  apScore: string;
  // generic
  totalScore: string;
}

const emptyForm: FormState = {
  testType: "SAT",
  testDate: "",
  isOfficial: true,
  satMath: "",
  satReading: "",
  actEnglish: "",
  actMath: "",
  actReading: "",
  actScience: "",
  apSubject: "",
  apScore: "",
  totalScore: "",
};

// ─── Config ─────────────────────────────────────────────────────────────────

const TEST_TYPES: { value: TestType; label: string }[] = [
  { value: "SAT", label: "SAT" },
  { value: "ACT", label: "ACT" },
  { value: "AP", label: "AP Exam" },
  { value: "PSAT", label: "PSAT" },
  { value: "TOEFL", label: "TOEFL" },
  { value: "IB", label: "IB Exam" },
];

const TYPE_COLOR: Record<string, { bg: string; text: string; border: string; icon: string }> = {
  SAT:   { bg: "bg-blue-50",   text: "text-blue-700",   border: "border-blue-200",   icon: "bg-blue-100" },
  ACT:   { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200", icon: "bg-purple-100" },
  AP:    { bg: "bg-amber-50",  text: "text-amber-700",  border: "border-amber-200",  icon: "bg-amber-100" },
  PSAT:  { bg: "bg-cyan-50",   text: "text-cyan-700",   border: "border-cyan-200",   icon: "bg-cyan-100" },
  TOEFL: { bg: "bg-emerald-50",text: "text-emerald-700",border: "border-emerald-200",icon: "bg-emerald-100" },
  IB:    { bg: "bg-rose-50",   text: "text-rose-700",   border: "border-rose-200",   icon: "bg-rose-100" },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function scoreLabel(score: TestScore): string {
  switch (score.testType) {
    case "SAT":
      if (score.satTotal) return `${score.satTotal}`;
      if (score.satMath && score.satReading) return `${score.satMath + score.satReading}`;
      return "—";
    case "ACT":
      return score.actComposite ? `${score.actComposite}` : "—";
    case "AP":
      return score.apScore ? `${score.apScore}/5` : "—";
    default:
      return score.totalScore ? `${score.totalScore}` : "—";
  }
}

function scoreSubLabel(score: TestScore): string | null {
  switch (score.testType) {
    case "SAT":
      if (score.satMath && score.satReading)
        return `Math ${score.satMath} · Reading ${score.satReading}`;
      return null;
    case "ACT":
      if (score.actEnglish && score.actMath && score.actReading && score.actScience)
        return `Eng ${score.actEnglish} · Math ${score.actMath} · Read ${score.actReading} · Sci ${score.actScience}`;
      return null;
    case "AP":
      return score.apSubject ?? null;
    default:
      return null;
  }
}

function buildPayload(form: FormState): Partial<TestScore> {
  const base: Partial<TestScore> = {
    testType: form.testType,
    testDate: form.testDate || null,
    isOfficial: form.isOfficial,
  };

  switch (form.testType) {
    case "SAT": {
      const math = form.satMath ? Number(form.satMath) : null;
      const reading = form.satReading ? Number(form.satReading) : null;
      return {
        ...base,
        satMath: math,
        satReading: reading,
        satTotal: math && reading ? math + reading : null,
      };
    }
    case "ACT": {
      const e = form.actEnglish ? Number(form.actEnglish) : null;
      const m = form.actMath ? Number(form.actMath) : null;
      const r = form.actReading ? Number(form.actReading) : null;
      const s = form.actScience ? Number(form.actScience) : null;
      let composite: number | null = null;
      if (e && m && r && s) {
        composite = Math.round((e + m + r + s) / 4);
      }
      return { ...base, actEnglish: e, actMath: m, actReading: r, actScience: s, actComposite: composite };
    }
    case "AP":
      return {
        ...base,
        apSubject: form.apSubject || null,
        apScore: form.apScore ? Number(form.apScore) : null,
      };
    default:
      return { ...base, totalScore: form.totalScore ? Number(form.totalScore) : null };
  }
}

function scoreFromRecord(score: TestScore): FormState {
  return {
    testType: (score.testType as TestType) ?? "SAT",
    testDate: score.testDate ? score.testDate.split("T")[0] : "",
    isOfficial: score.isOfficial,
    satMath: score.satMath?.toString() ?? "",
    satReading: score.satReading?.toString() ?? "",
    actEnglish: score.actEnglish?.toString() ?? "",
    actMath: score.actMath?.toString() ?? "",
    actReading: score.actReading?.toString() ?? "",
    actScience: score.actScience?.toString() ?? "",
    apSubject: score.apSubject ?? "",
    apScore: score.apScore?.toString() ?? "",
    totalScore: score.totalScore?.toString() ?? "",
  };
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function FieldRow({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

function DynamicFields({
  form,
  onChange,
}: {
  form: FormState;
  onChange: (patch: Partial<FormState>) => void;
}) {
  const satTotal =
    form.satMath && form.satReading
      ? Number(form.satMath) + Number(form.satReading)
      : null;

  const actComposite =
    form.actEnglish && form.actMath && form.actReading && form.actScience
      ? Math.round(
          (Number(form.actEnglish) +
            Number(form.actMath) +
            Number(form.actReading) +
            Number(form.actScience)) /
            4
        )
      : null;

  switch (form.testType) {
    case "SAT":
      return (
        <>
          <FieldRow>
            <Field label="SAT Math (200–800)">
              <Input
                type="number"
                min={200}
                max={800}
                step={10}
                placeholder="760"
                className="h-10 bg-secondary border-border"
                value={form.satMath}
                onChange={(e) => onChange({ satMath: e.target.value })}
              />
            </Field>
            <Field label="SAT Reading & Writing (200–800)">
              <Input
                type="number"
                min={200}
                max={800}
                step={10}
                placeholder="740"
                className="h-10 bg-secondary border-border"
                value={form.satReading}
                onChange={(e) => onChange({ satReading: e.target.value })}
              />
            </Field>
          </FieldRow>
          {satTotal !== null && (
            <p className="text-xs font-semibold text-muted-foreground">
              Computed total:{" "}
              <span className="text-foreground">{satTotal}</span>
            </p>
          )}
        </>
      );

    case "ACT":
      return (
        <>
          <FieldRow>
            <Field label="English (1–36)">
              <Input
                type="number"
                min={1}
                max={36}
                placeholder="34"
                className="h-10 bg-secondary border-border"
                value={form.actEnglish}
                onChange={(e) => onChange({ actEnglish: e.target.value })}
              />
            </Field>
            <Field label="Math (1–36)">
              <Input
                type="number"
                min={1}
                max={36}
                placeholder="32"
                className="h-10 bg-secondary border-border"
                value={form.actMath}
                onChange={(e) => onChange({ actMath: e.target.value })}
              />
            </Field>
            <Field label="Reading (1–36)">
              <Input
                type="number"
                min={1}
                max={36}
                placeholder="35"
                className="h-10 bg-secondary border-border"
                value={form.actReading}
                onChange={(e) => onChange({ actReading: e.target.value })}
              />
            </Field>
            <Field label="Science (1–36)">
              <Input
                type="number"
                min={1}
                max={36}
                placeholder="33"
                className="h-10 bg-secondary border-border"
                value={form.actScience}
                onChange={(e) => onChange({ actScience: e.target.value })}
              />
            </Field>
          </FieldRow>
          {actComposite !== null && (
            <p className="text-xs font-semibold text-muted-foreground">
              Computed composite:{" "}
              <span className="text-foreground">{actComposite}</span>
            </p>
          )}
        </>
      );

    case "AP":
      return (
        <FieldRow>
          <Field label="Subject">
            <Input
              placeholder="e.g. Calculus BC"
              className="h-10 bg-secondary border-border"
              value={form.apSubject}
              onChange={(e) => onChange({ apSubject: e.target.value })}
            />
          </Field>
          <Field label="Score (1–5)">
            <Select
              value={form.apScore}
              onValueChange={(v) => onChange({ apScore: v })}
            >
              <SelectTrigger className="h-10 bg-secondary border-border">
                <SelectValue placeholder="Select score" />
              </SelectTrigger>
              <SelectContent>
                {[5, 4, 3, 2, 1].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </FieldRow>
      );

    default:
      return (
        <Field label="Total Score">
          <Input
            type="number"
            placeholder="Score"
            className="h-10 bg-secondary border-border"
            value={form.totalScore}
            onChange={(e) => onChange({ totalScore: e.target.value })}
          />
        </Field>
      );
  }
}

// ─── Score Card ──────────────────────────────────────────────────────────────

function ScoreCard({
  score,
  index,
  onEdit,
  onDelete,
  deleting,
}: {
  score: TestScore;
  index: number;
  onEdit: (score: TestScore) => void;
  onDelete: (id: string) => void;
  deleting: string | null;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const colors = TYPE_COLOR[score.testType] ?? TYPE_COLOR["SAT"];
  const main = scoreLabel(score);
  const sub = scoreSubLabel(score);

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.04 + index * 0.03 }}
      className="p-4 rounded-xl border border-border hover:border-foreground/20 transition-colors flex flex-col sm:flex-row sm:items-center gap-4"
    >
      {/* Icon */}
      <div
        className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${colors.icon}`}
      >
        <BookOpen className={`w-5 h-5 ${colors.text}`} />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold border ${colors.bg} ${colors.text} ${colors.border}`}
          >
            {score.testType}
          </span>
          {score.isOfficial && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <CheckCircle2 className="w-3 h-3" />
              Official
            </span>
          )}
          {score.testDate && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded-md">
              <Calendar className="h-3 w-3" />
              {format(new Date(score.testDate), "MMM d, yyyy")}
            </span>
          )}
        </div>

        <div className="flex items-baseline gap-2">
          <span className="text-xl font-bold text-foreground">{main}</span>
          {sub && (
            <span className="text-xs text-muted-foreground truncate">{sub}</span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 shrink-0">
        {confirmDelete ? (
          <AnimatePresence mode="wait">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5"
            >
              <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
              <span className="text-xs font-semibold text-red-700">Delete?</span>
              <button
                onClick={() => {
                  setConfirmDelete(false);
                  onDelete(score.id);
                }}
                disabled={deleting === score.id}
                className="text-xs font-bold text-red-700 hover:text-red-900 disabled:opacity-50"
              >
                {deleting === score.id ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  "Yes"
                )}
              </button>
              <span className="text-red-300">·</span>
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-xs font-bold text-muted-foreground hover:text-foreground"
              >
                No
              </button>
            </motion.div>
          </AnimatePresence>
        ) : (
          <>
            <button
              onClick={() => onEdit(score)}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              title="Edit"
            >
              <Edit2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => setConfirmDelete(true)}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors"
              title="Delete"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </>
        )}
      </div>
    </motion.div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function TestScoresPage() {
  const [scores, setScores] = useState<TestScore[]>([]);
  const [superScore, setSuperScore] = useState<SuperScore | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  // Load data
  async function fetchAll() {
    try {
      const [s, ss] = await Promise.all([listTestScores(), getSuperScore()]);
      setScores(s);
      setSuperScore(ss);
    } catch {
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
    // Sort within each group: most recent first
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

      {/* SuperScore Banner */}
      {(superScore?.sat || superScore?.act) && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="dash-card p-5"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
              <Trophy className="w-4 h-4 text-amber-600" />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-foreground">SuperScore</h3>
              <p className="text-xs text-muted-foreground">
                Best section scores combined across all attempts
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {superScore.sat && (
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-blue-600 mb-2">
                  SAT SuperScore
                </p>
                <p className="text-3xl font-bold text-blue-800 mb-1">
                  {superScore.sat.total}
                </p>
                <p className="text-xs text-blue-600">
                  Math {superScore.sat.math} · Reading {superScore.sat.reading}
                </p>
              </div>
            )}
            {superScore.act && (
              <div className="rounded-xl border border-purple-200 bg-purple-50 p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-purple-600 mb-2">
                  ACT SuperScore
                </p>
                <p className="text-3xl font-bold text-purple-800 mb-1">
                  {superScore.act.composite}
                </p>
                <p className="text-xs text-purple-600">
                  Eng {superScore.act.english} · Math {superScore.act.math} · Read{" "}
                  {superScore.act.reading} · Sci {superScore.act.science}
                </p>
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* Add / Edit Form */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.28 }}
            className="overflow-hidden"
          >
            <div className="dash-card p-5 space-y-5">
              {/* Form header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-secondary border border-border flex items-center justify-center">
                    <Star className="h-4 w-4 text-foreground" />
                  </div>
                  <h3 className="font-semibold text-sm text-foreground">
                    {editingId ? "Edit Score" : "Add New Score"}
                  </h3>
                </div>
                <button
                  onClick={closeForm}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Test type + date + official row */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Field label="Test Type">
                  <Select
                    value={form.testType}
                    onValueChange={(v) =>
                      patchForm({ testType: v as TestType })
                    }
                  >
                    <SelectTrigger className="h-10 bg-secondary border-border">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TEST_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                <Field label="Test Date">
                  <Input
                    type="date"
                    className="h-10 bg-secondary border-border"
                    value={form.testDate}
                    onChange={(e) => patchForm({ testDate: e.target.value })}
                  />
                </Field>

                <Field label="Status">
                  <div className="flex items-center gap-3 h-10">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={form.isOfficial}
                        onChange={(e) => patchForm({ isOfficial: e.target.checked })}
                        className="w-4 h-4 rounded border-border accent-foreground"
                      />
                      <span className="text-sm text-foreground font-medium">
                        Official score
                      </span>
                    </label>
                  </div>
                </Field>
              </div>

              {/* Dynamic score fields */}
              <DynamicFields form={form} onChange={patchForm} />

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-1">
                <Button variant="ghost" onClick={closeForm}>
                  Cancel
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={saving}
                  className="bg-foreground text-background hover:bg-foreground/90 px-6"
                >
                  {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {editingId ? "Save Changes" : "Add Score"}
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Score List */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="space-y-6"
      >
        {loading ? (
          <div className="dash-card p-10 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : scores.length === 0 ? (
          <div className="dash-card p-10 text-center border border-dashed border-border">
            <div className="w-12 h-12 bg-secondary rounded-lg flex items-center justify-center mx-auto mb-3">
              <BookOpen className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-semibold text-foreground">
              No test scores yet
            </p>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
              Add your SAT, ACT, AP, or other exam results to build your
              academic profile.
            </p>
            <Button
              variant="outline"
              onClick={openAdd}
              className="mt-4 border border-border text-foreground hover:bg-secondary text-xs"
            >
              Add your first score
            </Button>
          </div>
        ) : (
          groupKeys.map((type, gi) => {
            const group = grouped[type];
            const colors = TYPE_COLOR[type] ?? TYPE_COLOR["SAT"];
            return (
              <motion.div
                key={type}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 + gi * 0.04 }}
                className="dash-card p-5"
              >
                {/* Group header */}
                <div className="flex items-center gap-3 mb-4">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center ${colors.icon}`}
                  >
                    <BookOpen className={`w-4 h-4 ${colors.text}`} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm text-foreground">
                      {type === "AP" ? "AP Exams" : type}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {group.length} {group.length === 1 ? "result" : "results"}
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  {group.map((score, i) => (
                    <ScoreCard
                      key={score.id}
                      score={score}
                      index={i}
                      onEdit={openEdit}
                      onDelete={handleDelete}
                      deleting={deleting}
                    />
                  ))}
                </div>
              </motion.div>
            );
          })
        )}
      </motion.div>
    </div>
  );
}
