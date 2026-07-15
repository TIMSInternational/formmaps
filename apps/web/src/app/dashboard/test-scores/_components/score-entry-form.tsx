"use client";

import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { Plus, Loader2, Star, X } from "lucide-react";
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
import { type FormState, type TestType, TEST_TYPES } from "./score-helpers";

// ── Sub-components ──────────────────────────────────────────────────────────

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

export function DynamicFields({
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
              Computed total: <span className="text-foreground">{satTotal}</span>
            </p>
          )}
        </>
      );

    case "ACT":
      return (
        <>
          <FieldRow>
            <Field label="English (1–36)">
              <Input type="number" min={1} max={36} placeholder="34" className="h-10 bg-secondary border-border" value={form.actEnglish} onChange={(e) => onChange({ actEnglish: e.target.value })} />
            </Field>
            <Field label="Math (1–36)">
              <Input type="number" min={1} max={36} placeholder="32" className="h-10 bg-secondary border-border" value={form.actMath} onChange={(e) => onChange({ actMath: e.target.value })} />
            </Field>
            <Field label="Reading (1–36)">
              <Input type="number" min={1} max={36} placeholder="35" className="h-10 bg-secondary border-border" value={form.actReading} onChange={(e) => onChange({ actReading: e.target.value })} />
            </Field>
            <Field label="Science (1–36)">
              <Input type="number" min={1} max={36} placeholder="33" className="h-10 bg-secondary border-border" value={form.actScience} onChange={(e) => onChange({ actScience: e.target.value })} />
            </Field>
          </FieldRow>
          {actComposite !== null && (
            <p className="text-xs font-semibold text-muted-foreground">
              Computed composite: <span className="text-foreground">{actComposite}</span>
            </p>
          )}
        </>
      );

    case "AP":
      return (
        <FieldRow>
          <Field label="Subject">
            <Input placeholder="e.g. Calculus BC" className="h-10 bg-secondary border-border" value={form.apSubject} onChange={(e) => onChange({ apSubject: e.target.value })} />
          </Field>
          <Field label="Score (1–5)">
            <Select value={form.apScore} onValueChange={(v) => onChange({ apScore: v })}>
              <SelectTrigger className="h-10 bg-secondary border-border">
                <SelectValue placeholder="Select score" />
              </SelectTrigger>
              <SelectContent>
                {[5, 4, 3, 2, 1].map((n) => (
                  <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </FieldRow>
      );

    default:
      return (
        <Field label="Total Score">
          <Input type="number" placeholder="Score" className="h-10 bg-secondary border-border" value={form.totalScore} onChange={(e) => onChange({ totalScore: e.target.value })} />
        </Field>
      );
  }
}

// ── Main Form Component ─────────────────────────────────────────────────────

interface ScoreEntryFormProps {
  show: boolean;
  form: FormState;
  editingId: string | null;
  saving: boolean;
  onPatchForm: (patch: Partial<FormState>) => void;
  onClose: () => void;
  onSave: () => void;
}

export function ScoreEntryForm({
  show,
  form,
  editingId,
  saving,
  onPatchForm,
  onClose,
  onSave,
}: ScoreEntryFormProps) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.28 }}
          className="overflow-hidden"
        >
          <div className="dash-card p-5 space-y-5">
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
                onClick={onClose}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label="Test Type">
                <Select value={form.testType} onValueChange={(v) => onPatchForm({ testType: v as TestType })}>
                  <SelectTrigger className="h-10 bg-secondary border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TEST_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Test Date">
                <Input
                  type="date"
                  className="h-10 bg-secondary border-border"
                  value={form.testDate}
                  onChange={(e) => onPatchForm({ testDate: e.target.value })}
                />
              </Field>

              <Field label="Status">
                <div className="flex items-center gap-3 h-10">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={form.isOfficial}
                      onChange={(e) => onPatchForm({ isOfficial: e.target.checked })}
                      className="w-4 h-4 rounded border-border accent-foreground"
                    />
                    <span className="text-sm text-foreground font-medium">Official score</span>
                  </label>
                </div>
              </Field>
            </div>

            <DynamicFields form={form} onChange={onPatchForm} />

            <div className="flex justify-end gap-3 pt-1">
              <Button variant="ghost" onClick={onClose}>Cancel</Button>
              <Button
                onClick={onSave}
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
  );
}
