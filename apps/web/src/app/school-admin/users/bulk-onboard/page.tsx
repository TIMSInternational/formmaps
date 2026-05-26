"use client";

import { useState, useRef, useCallback, useId } from "react";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import {
  Upload,
  FileSpreadsheet,
  Users,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Plus,
  Trash2,
  Download,
  Loader2,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  RotateCcw,
  Eye,
  UserCheck,
  AlertCircle,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// ─── Types ────────────────────────────────────────────────────────────────────

type ClassLevel = "Freshman" | "Sophomore" | "Junior" | "Senior" | "";

interface StudentRow {
  id: string;
  name: string;
  email: string;
  classLevel: ClassLevel;
}

interface PreviewStudent {
  name: string;
  email: string;
  classLevel: string;
  status: "new" | "existing" | "error";
  error?: string;
  counselorName?: string;
}

interface CounselorLoad {
  name: string;
  currentCount: number;
  newCount: number;
}

interface PreviewResult {
  students: PreviewStudent[];
  counselors: CounselorLoad[];
  summary: {
    newCount: number;
    existingCount: number;
    errorCount: number;
    totalCounselors: number;
  };
}

interface OnboardResult {
  created: number;
  linked: number;
  updated: number;
  failed: number;
  results: Array<{ name: string; email: string; status: string; error?: string; classLevel?: string; message?: string }>;
}

// Map API preview response to frontend shape
function mapPreviewResponse(raw: any): PreviewResult {
  const preview = raw.preview || [];
  const validationErrors = raw.validationErrors || [];
  const counselorPreview = raw.counselorPreview || [];
  const summary = raw.summary || {};

  const students: PreviewStudent[] = [
    ...preview.map((p: any) => ({
      name: p.name,
      email: p.email,
      classLevel: p.classLevel,
      status: p.action === "create" || p.action === "link" ? "new" as const : p.action === "error" ? "error" as const : "existing" as const,
      error: p.action === "error" ? p.message : undefined,
      counselorName: p.counselorAssigned,
    })),
    ...validationErrors.map((e: any) => ({
      name: "",
      email: e.email || "",
      classLevel: "",
      status: "error" as const,
      error: (e.errors || []).join("; "),
    })),
  ];

  const counselors: CounselorLoad[] = counselorPreview.map((c: any) => ({
    name: c.name,
    currentCount: c.projectedAssignments - (preview.filter((p: any) => p.counselorAssigned === c.name).length),
    newCount: preview.filter((p: any) => p.counselorAssigned === c.name).length,
  }));

  return {
    students,
    counselors,
    summary: {
      newCount: (summary.wouldCreate || 0) + (summary.wouldLink || 0),
      existingCount: summary.wouldUpdate || 0,
      errorCount: (summary.wouldFail || 0) + (summary.validationErrors || 0),
      totalCounselors: counselorPreview.length,
    },
  };
}

// Map API onboard response to frontend shape
function mapOnboardResponse(raw: any): OnboardResult {
  const summary = raw.summary || {};
  const results = (raw.results || []).map((r: any) => ({
    name: r.name,
    email: r.email,
    classLevel: r.classLevel,
    status: r.status,
    error: r.status === "failed" ? r.message : undefined,
    message: r.message || r.counselorAssigned ? `Counselor: ${r.counselorAssigned}` : undefined,
  }));
  return {
    created: summary.created || 0,
    linked: summary.linked || 0,
    updated: summary.existing || 0,
    failed: summary.failed || 0,
    results,
  };
}

// ─── CSV Helpers ──────────────────────────────────────────────────────────────

function parseCSV(text: string): Array<{ name: string; email: string; classLevel: string }> {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const header = lines[0].toLowerCase();
  const delimiter = header.includes(";") ? ";" : ",";
  const headers = header.split(delimiter).map((h) => h.trim().replace(/"/g, ""));

  const nameIdx = headers.findIndex((h) => h === "name" || h === "student name" || h === "full name");
  const emailIdx = headers.findIndex((h) => h === "email" || h === "student email" || h === "e-mail");
  const classIdx = headers.findIndex(
    (h) => h === "classlevel" || h === "class level" || h === "class" || h === "grade" || h === "year"
  );

  return lines
    .slice(1)
    .filter((l) => l.trim())
    .map((line) => {
      const cols = line.split(delimiter).map((c) => c.trim().replace(/"/g, ""));
      return {
        name: nameIdx >= 0 ? cols[nameIdx] || "" : "",
        email: emailIdx >= 0 ? cols[emailIdx] || "" : "",
        classLevel: classIdx >= 0 ? cols[classIdx] || "" : "",
      };
    });
}

const TEMPLATE_CSV = `name,email,classLevel
John Smith,john.smith@school.edu,Freshman
Jane Doe,jane.doe@school.edu,Sophomore
Alex Johnson,alex.johnson@school.edu,Junior
Maria Garcia,maria.garcia@school.edu,Senior`;

function downloadTemplate() {
  const blob = new Blob([TEMPLATE_CSV], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "student_roster_template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function genId() {
  return Math.random().toString(36).slice(2, 10);
}

// ─── Step Indicator ───────────────────────────────────────────────────────────

const STEPS = ["Upload", "Preview & Validate", "Complete"];

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-0">
      {STEPS.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div key={i} className="flex items-center">
            <div className="flex flex-col items-center gap-1.5">
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 13,
                  fontWeight: 700,
                  transition: "all 0.3s",
                  background: done
                    ? "#10b981"
                    : active
                    ? "linear-gradient(135deg, #14b8a6, #0ea5e9)"
                    : "var(--admin-bg-hover)",
                  border: active
                    ? "2px solid #14b8a6"
                    : done
                    ? "2px solid #10b981"
                    : "2px solid var(--admin-border-default)",
                  color: done || active ? "#fff" : "var(--admin-font-light)",
                  boxShadow: active ? "0 0 0 4px rgba(20,184,166,0.15)" : "none",
                }}
              >
                {done ? <CheckCircle style={{ width: 16, height: 16 }} /> : i + 1}
              </div>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: active ? 600 : 400,
                  color: active
                    ? "var(--admin-font-primary)"
                    : done
                    ? "#10b981"
                    : "var(--admin-font-light)",
                  whiteSpace: "nowrap",
                }}
              >
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                style={{
                  width: 80,
                  height: 2,
                  margin: "0 8px",
                  marginBottom: 20,
                  background: done ? "#10b981" : "var(--admin-border-default)",
                  transition: "background 0.4s",
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Manual Entry Row ─────────────────────────────────────────────────────────

function ManualRow({
  row,
  onChange,
  onRemove,
  index,
}: {
  row: StudentRow;
  onChange: (id: string, field: keyof StudentRow, value: string) => void;
  onRemove: (id: string) => void;
  index: number;
}) {
  const inputStyle: React.CSSProperties = {
    background: "var(--admin-bg-hover)",
    border: "1px solid var(--admin-border-default)",
    borderRadius: 6,
    color: "var(--admin-font-primary)",
    height: 34,
    fontSize: 13,
    padding: "0 10px",
    outline: "none",
    width: "100%",
  };

  return (
    <motion.tr
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -16 }}
      transition={{ duration: 0.2 }}
      style={{ borderBottom: "1px solid var(--admin-border-default)" }}
    >
      <td className="px-3 py-2" style={{ fontSize: 12, color: "var(--admin-font-tertiary)", width: 36 }}>
        {index + 1}
      </td>
      <td className="px-3 py-2">
        <input
          style={inputStyle}
          placeholder="Full name"
          value={row.name}
          onChange={(e) => onChange(row.id, "name", e.target.value)}
        />
      </td>
      <td className="px-3 py-2">
        <input
          style={inputStyle}
          placeholder="student@school.edu"
          value={row.email}
          onChange={(e) => onChange(row.id, "email", e.target.value)}
        />
      </td>
      <td className="px-3 py-2" style={{ minWidth: 150 }}>
        <Select
          value={row.classLevel || "placeholder"}
          onValueChange={(v) => onChange(row.id, "classLevel", v === "placeholder" ? "" : v)}
        >
          <SelectTrigger
            style={{
              ...inputStyle,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <SelectValue placeholder="Class level" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="placeholder" disabled>
              Select class
            </SelectItem>
            <SelectItem value="Freshman">Freshman</SelectItem>
            <SelectItem value="Sophomore">Sophomore</SelectItem>
            <SelectItem value="Junior">Junior</SelectItem>
            <SelectItem value="Senior">Senior</SelectItem>
          </SelectContent>
        </Select>
      </td>
      <td className="px-3 py-2">
        <button
          onClick={() => onRemove(row.id)}
          style={{
            width: 28,
            height: 28,
            borderRadius: 6,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "transparent",
            border: "1px solid var(--admin-border-default)",
            color: "#ef4444",
            cursor: "pointer",
          }}
        >
          <Trash2 style={{ width: 12, height: 12 }} />
        </button>
      </td>
    </motion.tr>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function BulkOnboardPage() {
  const [step, setStep] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
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
  const [expandedResults, setExpandedResults] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const errorRowRef = useRef<HTMLTableRowElement>(null);

  // ── CSV Drop / Pick ──────────────────────────────────────────────────────

  const handleFileRead = useCallback((file: File) => {
    if (!file.name.endsWith(".csv")) {
      toast.error("Please upload a .csv file");
      return;
    }
    file.text().then((text) => {
      const parsed = parseCSV(text);
      if (parsed.length === 0) {
        toast.error("No student rows found in CSV");
        return;
      }
      setCsvStudents(parsed);
      setCsvFileName(file.name);
      toast.success(`Parsed ${parsed.length} students from "${file.name}"`);
    });
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) handleFileRead(file);
    },
    [handleFileRead]
  );

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileRead(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ── Manual rows ──────────────────────────────────────────────────────────

  const addRow = () =>
    setManualRows((r) => [...r, { id: genId(), name: "", email: "", classLevel: "" }]);

  const updateRow = (id: string, field: keyof StudentRow, value: string) =>
    setManualRows((rows) => rows.map((r) => (r.id === id ? { ...r, [field]: value } : r)));

  const removeRow = (id: string) =>
    setManualRows((rows) => rows.filter((r) => r.id !== id));

  // ── Build combined student list ──────────────────────────────────────────

  const buildStudentList = () => {
    const fromCsv = csvStudents;
    const fromManual = manualRows
      .filter((r) => r.name.trim() || r.email.trim())
      .map(({ name, email, classLevel }) => ({ name, email, classLevel }));
    return [...fromCsv, ...fromManual];
  };

  // ── Preview ──────────────────────────────────────────────────────────────

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
      setPreviewResult(mapPreviewResponse(raw));
      setExcludedEmails(new Set());
      setStep(1);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err?.message || "Preview failed");
    } finally {
      setIsPreviewing(false);
    }
  };

  // ── Onboard ──────────────────────────────────────────────────────────────

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
      setOnboardResult(mapOnboardResponse(raw));
      setStep(2);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err?.message || "Onboarding failed");
    } finally {
      setIsOnboarding(false);
    }
  };

  // ── Reset ────────────────────────────────────────────────────────────────

  const handleReset = () => {
    setStep(0);
    setCsvStudents([]);
    setCsvFileName("");
    setManualRows([{ id: genId(), name: "", email: "", classLevel: "" }]);
    setPreviewResult(null);
    setExcludedEmails(new Set());
    setOnboardResult(null);
    setExpandedResults(false);
  };

  // ── Derived ──────────────────────────────────────────────────────────────

  const visibleStudents =
    previewResult?.students.filter((s) => !excludedEmails.has(s.email)) ?? [];
  const readyCount = visibleStudents.filter((s) => s.status === "new").length;
  const existingCount = visibleStudents.filter((s) => s.status === "existing").length;
  const errorCount = previewResult?.students.filter(
    (s) => s.status === "error" && !excludedEmails.has(s.email)
  ).length ?? 0;

  const scrollToErrors = () => errorRowRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });

  // ─── Card wrapper style ──────────────────────────────────────────────────
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

      {/* ── STEP 0: Upload ─────────────────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        {step === 0 && (
          <motion.div
            key="step-upload"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.25 }}
            className="space-y-5"
          >
            {/* Dropzone */}
            <div style={card}>
              <div className="flex items-center justify-between mb-4">
                <h2 style={{ fontSize: 15, fontWeight: 600, color: "var(--admin-font-primary)", display: "flex", alignItems: "center", gap: 8 }}>
                  <FileSpreadsheet style={{ width: 16, height: 16, color: "#14b8a6" }} />
                  CSV Upload
                </h2>
                <button
                  onClick={downloadTemplate}
                  style={{
                    display: "flex", alignItems: "center", gap: 6, height: 30, padding: "0 12px",
                    borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: "pointer",
                    background: "var(--admin-bg-hover)", border: "1px solid var(--admin-border-default)",
                    color: "var(--admin-font-secondary)",
                  }}
                >
                  <Download style={{ width: 13, height: 13 }} />
                  Download Template
                </button>
              </div>

              <input ref={fileInputRef} type="file" accept=".csv" onChange={handleFileInput} hidden />
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: `2px dashed ${isDragging ? "#14b8a6" : csvFileName ? "#10b981" : "var(--admin-border-default)"}`,
                  borderRadius: 10,
                  padding: "40px 24px",
                  textAlign: "center",
                  cursor: "pointer",
                  transition: "all 0.2s",
                  background: isDragging
                    ? "rgba(20,184,166,0.06)"
                    : csvFileName
                    ? "rgba(16,185,129,0.05)"
                    : "var(--admin-bg-hover)",
                }}
              >
                {csvFileName ? (
                  <div className="flex flex-col items-center gap-3">
                    <div style={{ width: 52, height: 52, borderRadius: 12, background: "rgba(16,185,129,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <CheckCircle style={{ width: 26, height: 26, color: "#10b981" }} />
                    </div>
                    <div>
                      <p style={{ fontSize: 14, fontWeight: 600, color: "#10b981" }}>{csvFileName}</p>
                      <p style={{ fontSize: 12, color: "var(--admin-font-tertiary)", marginTop: 2 }}>
                        {csvStudents.length} students parsed — click to replace
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <div
                      style={{
                        width: 60, height: 60, borderRadius: 14,
                        background: isDragging ? "rgba(20,184,166,0.15)" : "var(--admin-bg-card)",
                        border: "1px solid var(--admin-border-default)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        transition: "all 0.2s",
                        boxShadow: isDragging ? "0 0 0 4px rgba(20,184,166,0.12)" : "none",
                      }}
                    >
                      <Upload style={{ width: 26, height: 26, color: isDragging ? "#14b8a6" : "var(--admin-font-light)" }} />
                    </div>
                    <div>
                      <p style={{ fontSize: 15, fontWeight: 600, color: "var(--admin-font-primary)" }}>
                        {isDragging ? "Drop your CSV here" : "Drop your student roster CSV here"}
                      </p>
                      <p style={{ fontSize: 13, color: "var(--admin-font-tertiary)", marginTop: 3 }}>
                        or{" "}
                        <span style={{ color: "#14b8a6", fontWeight: 600 }}>click to browse</span>
                        {" "}— .csv files only
                      </p>
                    </div>
                    <p style={{ fontSize: 11, color: "var(--admin-font-light)", marginTop: 4 }}>
                      Columns: <code style={{ background: "var(--admin-bg-hover)", padding: "1px 5px", borderRadius: 3, fontFamily: "monospace" }}>name</code>,{" "}
                      <code style={{ background: "var(--admin-bg-hover)", padding: "1px 5px", borderRadius: 3, fontFamily: "monospace" }}>email</code>,{" "}
                      <code style={{ background: "var(--admin-bg-hover)", padding: "1px 5px", borderRadius: 3, fontFamily: "monospace" }}>classLevel</code>
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Manual entry */}
            <div style={card}>
              <div className="flex items-center justify-between mb-4">
                <h2 style={{ fontSize: 15, fontWeight: 600, color: "var(--admin-font-primary)", display: "flex", alignItems: "center", gap: 8 }}>
                  <Users style={{ width: 16, height: 16, color: "#14b8a6" }} />
                  Manual Entry
                  {manualRows.filter((r) => r.name || r.email).length > 0 && (
                    <span style={{ fontSize: 11, fontWeight: 600, padding: "1px 7px", borderRadius: 20, background: "rgba(20,184,166,0.12)", color: "#14b8a6" }}>
                      {manualRows.filter((r) => r.name || r.email).length}
                    </span>
                  )}
                </h2>
                <button
                  onClick={addRow}
                  style={{
                    display: "flex", alignItems: "center", gap: 6, height: 30, padding: "0 12px",
                    borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer",
                    background: "#14b8a6", color: "#fff", border: "none",
                  }}
                >
                  <Plus style={{ width: 13, height: 13 }} />
                  Add Row
                </button>
              </div>

              <div style={{ borderRadius: 8, border: "1px solid var(--admin-border-default)", overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "var(--admin-bg-hover)", borderBottom: "1px solid var(--admin-border-default)" }}>
                      {["#", "Name", "Email", "Class Level", ""].map((h) => (
                        <th key={h} style={{ padding: "8px 12px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--admin-font-tertiary)", textAlign: "left" }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <AnimatePresence>
                      {manualRows.map((row, i) => (
                        <ManualRow
                          key={row.id}
                          row={row}
                          index={i}
                          onChange={updateRow}
                          onRemove={removeRow}
                        />
                      ))}
                    </AnimatePresence>
                  </tbody>
                </table>
              </div>

              <button
                onClick={addRow}
                style={{
                  marginTop: 12, width: "100%", height: 34, borderRadius: 6, fontSize: 13, fontWeight: 500,
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6, cursor: "pointer",
                  background: "transparent", border: "1px dashed var(--admin-border-default)", color: "var(--admin-font-light)",
                  transition: "all 0.15s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "#14b8a6";
                  e.currentTarget.style.color = "#14b8a6";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "var(--admin-border-default)";
                  e.currentTarget.style.color = "var(--admin-font-light)";
                }}
              >
                <Plus style={{ width: 14, height: 14 }} /> Add another student
              </button>
            </div>

            {/* Summary + CTA */}
            {(csvStudents.length > 0 || manualRows.some((r) => r.name || r.email)) && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                style={{ ...card, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}
              >
                <div className="flex items-center gap-6">
                  {csvStudents.length > 0 && (
                    <div>
                      <span style={{ fontSize: 22, fontWeight: 700, color: "var(--admin-font-primary)" }}>{csvStudents.length}</span>
                      <span style={{ fontSize: 12, color: "var(--admin-font-tertiary)", marginLeft: 6 }}>from CSV</span>
                    </div>
                  )}
                  {manualRows.filter((r) => r.name || r.email).length > 0 && (
                    <div>
                      <span style={{ fontSize: 22, fontWeight: 700, color: "var(--admin-font-primary)" }}>
                        {manualRows.filter((r) => r.name || r.email).length}
                      </span>
                      <span style={{ fontSize: 12, color: "var(--admin-font-tertiary)", marginLeft: 6 }}>manual entries</span>
                    </div>
                  )}
                  <div>
                    <span style={{ fontSize: 22, fontWeight: 700, color: "#14b8a6" }}>
                      {buildStudentList().length}
                    </span>
                    <span style={{ fontSize: 12, color: "var(--admin-font-tertiary)", marginLeft: 6 }}>total students</span>
                  </div>
                </div>
                <button
                  onClick={handlePreview}
                  disabled={isPreviewing}
                  style={{
                    height: 40, borderRadius: 8, padding: "0 24px", fontSize: 14, fontWeight: 700,
                    display: "flex", alignItems: "center", gap: 8,
                    background: "linear-gradient(135deg, #14b8a6, #0ea5e9)",
                    color: "#fff", border: "none",
                    cursor: isPreviewing ? "wait" : "pointer",
                    opacity: isPreviewing ? 0.8 : 1,
                    boxShadow: "0 2px 12px rgba(14,165,233,0.25)",
                  }}
                >
                  {isPreviewing ? (
                    <Loader2 style={{ width: 16, height: 16, animation: "spin 1s linear infinite" }} />
                  ) : (
                    <Eye style={{ width: 16, height: 16 }} />
                  )}
                  {isPreviewing ? "Validating…" : "Preview & Validate"}
                  {!isPreviewing && <ArrowRight style={{ width: 15, height: 15 }} />}
                </button>
              </motion.div>
            )}
          </motion.div>
        )}

        {/* ── STEP 1: Preview & Validate ──────────────────────────────────────── */}
        {step === 1 && previewResult && (
          <motion.div
            key="step-preview"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.25 }}
            className="space-y-5"
          >
            {/* Summary bar */}
            <div style={{ ...card, padding: "16px 24px" }}>
              <div className="flex flex-wrap items-center gap-4">
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 16px", borderRadius: 8, background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.2)" }}>
                  <CheckCircle style={{ width: 16, height: 16, color: "#10b981" }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#10b981" }}>{readyCount} new</span>
                </div>
                {existingCount > 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 16px", borderRadius: 8, background: "rgba(234,179,8,0.1)", border: "1px solid rgba(234,179,8,0.2)" }}>
                    <AlertTriangle style={{ width: 16, height: 16, color: "#eab308" }} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#eab308" }}>{existingCount} existing</span>
                    <span style={{ fontSize: 11, color: "#a16207" }}>will update grade</span>
                  </div>
                )}
                {errorCount > 0 && (
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 16px", borderRadius: 8, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", cursor: "pointer" }}
                    onClick={scrollToErrors}
                  >
                    <XCircle style={{ width: 16, height: 16, color: "#ef4444" }} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#ef4444" }}>{errorCount} errors</span>
                    <span style={{ fontSize: 11, color: "#b91c1c" }}>click to fix</span>
                  </div>
                )}
                <div style={{ marginLeft: "auto" }}>
                  <button
                    onClick={() => setStep(0)}
                    style={{ display: "flex", alignItems: "center", gap: 6, height: 30, padding: "0 12px", borderRadius: 6, fontSize: 12, cursor: "pointer", background: "var(--admin-bg-hover)", border: "1px solid var(--admin-border-default)", color: "var(--admin-font-secondary)", fontWeight: 500 }}
                  >
                    <RotateCcw style={{ width: 12, height: 12 }} />
                    Edit Upload
                  </button>
                </div>
              </div>
            </div>

            {/* Counselor distribution */}
            {previewResult.counselors && previewResult.counselors.length > 0 && (
              <div style={card}>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--admin-font-primary)", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
                  <UserCheck style={{ width: 15, height: 15, color: "#14b8a6" }} />
                  Counselor Assignment Preview
                  <span style={{ fontSize: 12, color: "var(--admin-font-tertiary)", fontWeight: 400 }}>
                    — distributed across {previewResult.counselors.length} counselor{previewResult.counselors.length !== 1 ? "s" : ""}
                  </span>
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {previewResult.counselors.map((c, i) => (
                    <div
                      key={i}
                      style={{ padding: "12px 14px", borderRadius: 8, background: "var(--admin-bg-hover)", border: "1px solid var(--admin-border-default)" }}
                    >
                      <p style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)", marginBottom: 6 }}>{c.name}</p>
                      <div className="flex items-center gap-2">
                        <span style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>Current:</span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--admin-font-secondary)" }}>{c.currentCount}</span>
                        <ArrowRight style={{ width: 12, height: 12, color: "var(--admin-font-light)" }} />
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#14b8a6" }}>{c.currentCount + c.newCount}</span>
                        {c.newCount > 0 && (
                          <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 12, background: "rgba(20,184,166,0.12)", color: "#14b8a6", fontWeight: 600 }}>
                            +{c.newCount}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Student preview table */}
            <div style={card}>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--admin-font-primary)", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
                <Users style={{ width: 15, height: 15, color: "#14b8a6" }} />
                Student Preview
                <span style={{ fontSize: 12, color: "var(--admin-font-tertiary)", fontWeight: 400 }}>
                  — {previewResult.students.length} total
                </span>
              </h3>
              <div style={{ borderRadius: 8, border: "1px solid var(--admin-border-default)", overflow: "hidden" }}>
                <div style={{ maxHeight: 420, overflowY: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead style={{ position: "sticky", top: 0, zIndex: 2 }}>
                      <tr style={{ background: "var(--admin-bg-hover)", borderBottom: "1px solid var(--admin-border-default)" }}>
                        {["Status", "Name", "Email", "Class Level", "Counselor", ""].map((h) => (
                          <th key={h} style={{ padding: "8px 12px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--admin-font-tertiary)", textAlign: "left", background: "var(--admin-bg-hover)" }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewResult.students.map((s, i) => {
                        const excluded = excludedEmails.has(s.email);
                        const isError = s.status === "error";
                        const isExisting = s.status === "existing";
                        const rowBg = excluded
                          ? "transparent"
                          : isError
                          ? "rgba(239,68,68,0.04)"
                          : isExisting
                          ? "rgba(234,179,8,0.04)"
                          : "rgba(16,185,129,0.03)";
                        const borderColor = excluded
                          ? "var(--admin-border-default)"
                          : isError
                          ? "rgba(239,68,68,0.15)"
                          : isExisting
                          ? "rgba(234,179,8,0.15)"
                          : "rgba(16,185,129,0.12)";

                        return (
                          <tr
                            key={i}
                            ref={isError && !excludedEmails.has(s.email) ? errorRowRef : undefined}
                            style={{
                              borderBottom: `1px solid ${borderColor}`,
                              background: rowBg,
                              opacity: excluded ? 0.4 : 1,
                              transition: "all 0.15s",
                            }}
                          >
                            <td style={{ padding: "10px 12px" }}>
                              {isError ? (
                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                  <XCircle style={{ width: 14, height: 14, color: "#ef4444", flexShrink: 0 }} />
                                  <span style={{ fontSize: 11, color: "#ef4444", fontWeight: 600 }}>Error</span>
                                </div>
                              ) : isExisting ? (
                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                  <AlertTriangle style={{ width: 14, height: 14, color: "#eab308", flexShrink: 0 }} />
                                  <span style={{ fontSize: 11, color: "#eab308", fontWeight: 600 }}>Existing</span>
                                </div>
                              ) : (
                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                  <CheckCircle style={{ width: 14, height: 14, color: "#10b981", flexShrink: 0 }} />
                                  <span style={{ fontSize: 11, color: "#10b981", fontWeight: 600 }}>New</span>
                                </div>
                              )}
                            </td>
                            <td style={{ padding: "10px 12px", fontSize: 13, fontWeight: 500, color: "var(--admin-font-primary)" }}>
                              {s.name || <span style={{ color: "var(--admin-font-light)", fontStyle: "italic" }}>—</span>}
                            </td>
                            <td style={{ padding: "10px 12px", fontSize: 12, color: "var(--admin-font-secondary)", fontFamily: "monospace" }}>
                              {s.email}
                              {isError && s.error && (
                                <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
                                  <AlertCircle style={{ width: 11, height: 11, color: "#ef4444" }} />
                                  <span style={{ fontSize: 11, color: "#ef4444" }}>{s.error}</span>
                                </div>
                              )}
                            </td>
                            <td style={{ padding: "10px 12px" }}>
                              <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 12, background: "var(--admin-bg-hover)", border: "1px solid var(--admin-border-default)", color: "var(--admin-font-secondary)", fontWeight: 500 }}>
                                {s.classLevel || "—"}
                              </span>
                            </td>
                            <td style={{ padding: "10px 12px", fontSize: 12, color: "var(--admin-font-tertiary)" }}>
                              {s.counselorName || "—"}
                            </td>
                            <td style={{ padding: "10px 12px" }}>
                              <button
                                onClick={() =>
                                  setExcludedEmails((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(s.email)) next.delete(s.email);
                                    else next.add(s.email);
                                    return next;
                                  })
                                }
                                title={excluded ? "Include" : "Remove from import"}
                                style={{
                                  width: 26, height: 26, borderRadius: 5, display: "flex", alignItems: "center", justifyContent: "center",
                                  background: "transparent", border: "1px solid var(--admin-border-default)",
                                  color: excluded ? "#10b981" : "#ef4444", cursor: "pointer",
                                }}
                              >
                                {excluded ? <Plus style={{ width: 11, height: 11 }} /> : <XCircle style={{ width: 11, height: 11 }} />}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Onboard CTA */}
            <div style={{ ...card, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
              <div>
                <p style={{ fontSize: 14, fontWeight: 600, color: "var(--admin-font-primary)" }}>
                  Ready to onboard{" "}
                  <span style={{ color: "#14b8a6" }}>{readyCount + existingCount}</span> students
                </p>
                <p style={{ fontSize: 12, color: "var(--admin-font-tertiary)", marginTop: 2 }}>
                  {readyCount} new accounts will be created
                  {existingCount > 0 ? `, ${existingCount} existing will be updated` : ""}
                  {errorCount > 0 ? `, ${errorCount} errors excluded` : ""}
                </p>
              </div>
              <button
                onClick={handleOnboard}
                disabled={isOnboarding || (readyCount + existingCount) === 0}
                style={{
                  height: 44, borderRadius: 8, padding: "0 28px", fontSize: 15, fontWeight: 700,
                  display: "flex", alignItems: "center", gap: 10,
                  background: (readyCount + existingCount) === 0 ? "var(--admin-bg-hover)" : "linear-gradient(135deg, #14b8a6, #0ea5e9)",
                  color: (readyCount + existingCount) === 0 ? "var(--admin-font-light)" : "#fff",
                  border: (readyCount + existingCount) === 0 ? "1px solid var(--admin-border-default)" : "none",
                  cursor: isOnboarding || (readyCount + existingCount) === 0 ? "not-allowed" : "pointer",
                  opacity: isOnboarding ? 0.8 : 1,
                  boxShadow: (readyCount + existingCount) > 0 ? "0 4px 16px rgba(14,165,233,0.3)" : "none",
                  transition: "all 0.2s",
                }}
              >
                {isOnboarding ? (
                  <>
                    <Loader2 style={{ width: 18, height: 18, animation: "spin 1s linear infinite" }} />
                    Onboarding…
                  </>
                ) : (
                  <>
                    <Users style={{ width: 18, height: 18 }} />
                    Onboard {readyCount + existingCount} Students
                  </>
                )}
              </button>
            </div>
          </motion.div>
        )}

        {/* ── STEP 2: Complete ────────────────────────────────────────────────── */}
        {step === 2 && onboardResult && (
          <motion.div
            key="step-complete"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="space-y-5"
          >
            {/* Success hero */}
            <div style={{ ...card, textAlign: "center", padding: "48px 32px" }}>
              <motion.div
                initial={{ scale: 0, rotate: -15 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", stiffness: 260, damping: 20, delay: 0.1 }}
                style={{
                  width: 80, height: 80, borderRadius: "50%",
                  background: "linear-gradient(135deg, rgba(16,185,129,0.15), rgba(20,184,166,0.15))",
                  border: "2px solid rgba(16,185,129,0.3)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  margin: "0 auto 20px",
                  boxShadow: "0 0 40px rgba(16,185,129,0.2)",
                }}
              >
                <CheckCircle style={{ width: 40, height: 40, color: "#10b981" }} />
              </motion.div>
              <motion.h2
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                style={{ fontSize: 26, fontWeight: 800, color: "var(--admin-font-primary)", letterSpacing: "-0.02em", marginBottom: 8 }}
              >
                Onboarding Complete!
              </motion.h2>
              <motion.p
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                style={{ fontSize: 14, color: "var(--admin-font-tertiary)", marginBottom: 28 }}
              >
                Invite emails have been sent to all new students.
              </motion.p>

              {/* Stats grid */}
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35 }}
                className="grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-lg mx-auto"
              >
                {[
                  { label: "Created", value: onboardResult.created, color: "#10b981", bg: "rgba(16,185,129,0.1)" },
                  { label: "Linked", value: onboardResult.linked, color: "#14b8a6", bg: "rgba(20,184,166,0.1)" },
                  { label: "Updated", value: onboardResult.updated, color: "#0ea5e9", bg: "rgba(14,165,233,0.1)" },
                  { label: "Failed", value: onboardResult.failed, color: onboardResult.failed > 0 ? "#ef4444" : "var(--admin-font-tertiary)", bg: onboardResult.failed > 0 ? "rgba(239,68,68,0.1)" : "var(--admin-bg-hover)" },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    style={{ padding: "16px 12px", borderRadius: 10, background: stat.bg, border: `1px solid ${stat.bg}` }}
                  >
                    <div style={{ fontSize: 28, fontWeight: 800, color: stat.color, lineHeight: 1 }}>{stat.value}</div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "var(--admin-font-tertiary)", marginTop: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>{stat.label}</div>
                  </div>
                ))}
              </motion.div>
            </div>

            {/* Expandable results */}
            {onboardResult.results && onboardResult.results.length > 0 && (
              <div style={card}>
                <button
                  onClick={() => setExpandedResults((v) => !v)}
                  style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", background: "none", border: "none", cursor: "pointer", padding: 0 }}
                >
                  <span style={{ fontSize: 14, fontWeight: 600, color: "var(--admin-font-primary)", display: "flex", alignItems: "center", gap: 8 }}>
                    <FileSpreadsheet style={{ width: 15, height: 15, color: "#14b8a6" }} />
                    Per-student results ({onboardResult.results.length})
                  </span>
                  {expandedResults ? (
                    <ChevronUp style={{ width: 16, height: 16, color: "var(--admin-font-light)" }} />
                  ) : (
                    <ChevronDown style={{ width: 16, height: 16, color: "var(--admin-font-light)" }} />
                  )}
                </button>

                <AnimatePresence>
                  {expandedResults && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      style={{ overflow: "hidden" }}
                    >
                      <div style={{ marginTop: 14, borderRadius: 8, border: "1px solid var(--admin-border-default)", overflow: "hidden", maxHeight: 320, overflowY: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse" }}>
                          <thead>
                            <tr style={{ background: "var(--admin-bg-hover)", borderBottom: "1px solid var(--admin-border-default)" }}>
                              {["Name", "Email", "Result"].map((h) => (
                                <th key={h} style={{ padding: "8px 12px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--admin-font-tertiary)", textAlign: "left" }}>
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {onboardResult.results.map((r, i) => (
                              <tr key={i} style={{ borderBottom: "1px solid var(--admin-border-default)" }}>
                                <td style={{ padding: "8px 12px", fontSize: 13, color: "var(--admin-font-primary)", fontWeight: 500 }}>{r.name}</td>
                                <td style={{ padding: "8px 12px", fontSize: 12, color: "var(--admin-font-secondary)", fontFamily: "monospace" }}>{r.email}</td>
                                <td style={{ padding: "8px 12px" }}>
                                  {r.status === "created" || r.status === "linked" || r.status === "updated" ? (
                                    <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 12, background: "rgba(16,185,129,0.1)", color: "#10b981", fontWeight: 600, textTransform: "capitalize" }}>
                                      {r.status}
                                    </span>
                                  ) : (
                                    <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 12, background: "rgba(239,68,68,0.1)", color: "#ef4444", fontWeight: 600 }}>
                                      {r.error || "Failed"}
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 justify-center flex-wrap">
              <a
                href="/school-admin/users"
                style={{
                  height: 42, borderRadius: 8, padding: "0 24px", fontSize: 14, fontWeight: 700,
                  display: "flex", alignItems: "center", gap: 8,
                  background: "linear-gradient(135deg, #14b8a6, #0ea5e9)",
                  color: "#fff", textDecoration: "none",
                  boxShadow: "0 2px 12px rgba(14,165,233,0.25)",
                }}
              >
                <Users style={{ width: 16, height: 16 }} />
                View Students
              </a>
              <button
                onClick={handleReset}
                style={{
                  height: 42, borderRadius: 8, padding: "0 24px", fontSize: 14, fontWeight: 600,
                  display: "flex", alignItems: "center", gap: 8,
                  background: "var(--admin-bg-hover)", border: "1px solid var(--admin-border-default)",
                  color: "var(--admin-font-secondary)", cursor: "pointer",
                }}
              >
                <RotateCcw style={{ width: 15, height: 15 }} />
                Onboard More Students
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
