"use client";

import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import {
  Upload,
  FileSpreadsheet,
  Users,
  CheckCircle,
  Plus,
  Download,
  Loader2,
  ArrowRight,
  Eye,
} from "lucide-react";
import { ManualRow } from "./manual-row";
import { parseCSV, downloadTemplate } from "./types";
import type { StudentRow } from "./types";

interface UploadStepProps {
  manualRows: StudentRow[];
  csvStudents: Array<{ name: string; email: string; classLevel: string }>;
  setCsvStudents: React.Dispatch<React.SetStateAction<Array<{ name: string; email: string; classLevel: string }>>>;
  csvFileName: string;
  setCsvFileName: React.Dispatch<React.SetStateAction<string>>;
  isPreviewing: boolean;
  onPreview: () => void;
  addRow: () => void;
  updateRow: (id: string, field: keyof StudentRow, value: string) => void;
  removeRow: (id: string) => void;
  buildStudentList: () => Array<{ name: string; email: string; classLevel: string }>;
  card: React.CSSProperties;
}

export function UploadStep({
  manualRows,
  csvStudents,
  setCsvStudents,
  csvFileName,
  setCsvFileName,
  isPreviewing,
  onPreview,
  addRow,
  updateRow,
  removeRow,
  buildStudentList,
  card,
}: UploadStepProps) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
  }, [setCsvStudents, setCsvFileName]);

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

  return (
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
                  {csvStudents.length} students parsed &mdash; click to replace
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
                  {" "}&mdash; .csv files only
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
            onClick={onPreview}
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
            {isPreviewing ? "Validating\u2026" : "Preview & Validate"}
            {!isPreviewing && <ArrowRight style={{ width: 15, height: 15 }} />}
          </button>
        </motion.div>
      )}
    </motion.div>
  );
}
