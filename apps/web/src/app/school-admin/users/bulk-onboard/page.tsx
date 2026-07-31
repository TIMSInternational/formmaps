"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import { StepIndicator } from "./_components/step-indicator";
import { UploadStep } from "./_components/upload-step";
import { PreviewStep } from "./_components/preview-step";
import { CompleteStep } from "./_components/complete-step";
import {
  genId,
  mapPreviewResponse,
  mapOnboardResponse,
} from "./_components/types";
import type { StudentRow, PreviewResult, OnboardResult } from "./_components/types";

export default function BulkOnboardPage() {
  const [step, setStep] = useState(0);
  const [manualRows, setManualRows] = useState<StudentRow[]>([
    { id: genId(), name: "", email: "", classLevel: "" },
  ]);
  const [csvStudents, setCsvStudents] = useState<Array<{ name: string; email: string; classLevel: string }>>([]);
  const [csvFileName, setCsvFileName] = useState("");

  const [previewResult, setPreviewResult] = useState<PreviewResult | null>(null);
  const [excludedEmails, setExcludedEmails] = useState<Set<string>>(new Set());
  const [isPreviewing, setIsPreviewing] = useState(false);

  const [onboardResult, setOnboardResult] = useState<OnboardResult | null>(null);
  const [isOnboarding, setIsOnboarding] = useState(false);

  // Manual rows handlers
  const addRow = () =>
    setManualRows((r) => [...r, { id: genId(), name: "", email: "", classLevel: "" }]);

  const updateRow = (id: string, field: keyof StudentRow, value: string) =>
    setManualRows((rows) => rows.map((r) => (r.id === id ? { ...r, [field]: value } : r)));

  const removeRow = (id: string) =>
    setManualRows((rows) => rows.filter((r) => r.id !== id));

  // Build combined student list
  const buildStudentList = () => {
    const fromManual = manualRows
      .filter((r) => r.name.trim() || r.email.trim())
      .map(({ name, email, classLevel }) => ({ name, email, classLevel }));
    return [...csvStudents, ...fromManual];
  };

  // Preview
  const handlePreview = async () => {
    const students = buildStudentList();
    if (students.length === 0) {
      toast.error("Add at least one student before previewing");
      return;
    }
    setIsPreviewing(true);
    try {
      const { apiRequest } = await import("@/lib/api/apiClient");
      const res = await apiRequest("/api/v1/school-admin/students/bulk-onboard/preview", {
        method: "POST",
        data: { students },
      });
      const raw = res.data ?? res;
      setPreviewResult(mapPreviewResponse(raw as Record<string, unknown>));
      setExcludedEmails(new Set());
      setStep(1);
    } catch (err: unknown) {
      const errObj = err as { response?: { data?: { message?: string } }; message?: string };
      toast.error(errObj?.response?.data?.message || errObj?.message || "Preview failed");
    } finally {
      setIsPreviewing(false);
    }
  };

  // Onboard
  const handleOnboard = async () => {
    if (!previewResult) return;
    const studentsToSend = previewResult.students
      .filter((s) => s.status !== "error" && !excludedEmails.has(s.email))
      .map(({ name, email, classLevel }) => ({ name, email, classLevel }));

    if (studentsToSend.length === 0) {
      toast.error("No valid students to onboard");
      return;
    }
    setIsOnboarding(true);
    try {
      const { apiRequest } = await import("@/lib/api/apiClient");
      const res = await apiRequest("/api/v1/school-admin/students/bulk-onboard", {
        method: "POST",
        data: { students: studentsToSend },
      });
      const raw = res.data ?? res;
      setOnboardResult(mapOnboardResponse(raw as Record<string, unknown>));
      setStep(2);
    } catch (err: unknown) {
      const errObj = err as { response?: { data?: { message?: string } }; message?: string };
      toast.error(errObj?.response?.data?.message || errObj?.message || "Onboarding failed");
    } finally {
      setIsOnboarding(false);
    }
  };

  // Reset
  const handleReset = () => {
    setStep(0);
    setCsvStudents([]);
    setCsvFileName("");
    setManualRows([{ id: genId(), name: "", email: "", classLevel: "" }]);
    setPreviewResult(null);
    setExcludedEmails(new Set());
    setOnboardResult(null);
  };

  const card: React.CSSProperties = {
    background: "var(--admin-bg-card)",
    border: "1px solid var(--admin-border-default)",
    borderRadius: 12,
    padding: 24,
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--admin-font-tertiary)", marginBottom: 4 }}>
          Student Management
        </p>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--admin-font-primary)", letterSpacing: "-0.02em", lineHeight: 1.2 }}>
          Bulk Student Onboarding
        </h1>
        <p style={{ fontSize: 13, color: "var(--admin-font-tertiary)", marginTop: 4 }}>
          Upload a CSV roster or enter students manually, preview, then onboard in one click.
        </p>
      </motion.div>

      {/* Step Indicator */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        style={{ ...card, padding: "20px 28px" }}
      >
        <StepIndicator current={step} />
      </motion.div>

      {/* Steps */}
      <AnimatePresence mode="wait">
        {step === 0 && (
          <UploadStep
            manualRows={manualRows}
            csvStudents={csvStudents}
            setCsvStudents={setCsvStudents}
            csvFileName={csvFileName}
            setCsvFileName={setCsvFileName}
            isPreviewing={isPreviewing}
            onPreview={handlePreview}
            addRow={addRow}
            updateRow={updateRow}
            removeRow={removeRow}
            buildStudentList={buildStudentList}
            card={card}
          />
        )}

        {step === 1 && previewResult && (
          <PreviewStep
            previewResult={previewResult}
            excludedEmails={excludedEmails}
            setExcludedEmails={setExcludedEmails}
            isOnboarding={isOnboarding}
            onOnboard={handleOnboard}
            onBack={() => setStep(0)}
            card={card}
          />
        )}

        {step === 2 && onboardResult && (
          <CompleteStep
            onboardResult={onboardResult}
            onReset={handleReset}
            card={card}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
