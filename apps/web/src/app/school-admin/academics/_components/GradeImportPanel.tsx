"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api/apiClient";
import { parseGradeCsv } from "@/lib/gradeCsv";
import { Upload, FileText, CheckCircle2, Loader2 } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

// Bulk CSV grade import. Extracted verbatim from the former "Grade Import" tab so
// it can live behind the Gradebook's [Import CSV] button.
export function GradeImportPanel({ onImported }: { onImported?: () => void }) {
  const { t } = useTranslation("school_admin");
  const fileRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const [importing, setImporting] = useState(false);
  const [preview, setPreview] = useState<Array<Record<string, string>> | null>(null);
  const [result, setResult] = useState<{ totalRows: number; validRows: number; invalidRows: number; validationErrors?: Array<{ row: number; errors: string[] }> } | null>(null);
  const [fileName, setFileName] = useState("");

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    setFileName(file.name);
    setResult(null);

    const text = await file.text();
    if (text.split(/\r?\n/).filter(Boolean).length < 2) { toast.error(t("ui.courses.csvNoRows")); return; }
    const rows = parseGradeCsv(text);

    if (rows.length === 0) { toast.error(t("ui.gradeImport.noValidRows")); return; }
    setPreview(rows);
    toast.success(t("ui.gradeImport.parsed", { count: rows.length, file: file.name }));
  };

  const handleImport = async () => {
    if (!preview?.length) return;
    setImporting(true);
    try {
      const res = await apiRequest("/api/v1/school-admin/grades/import", {
        method: "POST", data: { rows: preview, filename: fileName },
      });
      const data = res?.data ?? res;
      setResult(data);
      setPreview(null);
      // Bulk import touches many students — invalidate all StudentGrade-derived caches.
      queryClient.invalidateQueries({ queryKey: ["gradebook"] });
      queryClient.invalidateQueries({ queryKey: ["class-rankings"] });
      queryClient.invalidateQueries({ queryKey: ["graduation-progress"] });
      queryClient.invalidateQueries({ queryKey: ["student-detail"] });
      onImported?.();
      toast.success(t("ui.gradeImport.imported", { imported: data.validRows || 0, failed: data.invalidRows || 0 }));
    } catch { toast.error(t("ui.gradeImport.importFailed")); }
    setImporting(false);
  };

  return (
    <div className="space-y-4">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: "var(--admin-font-primary)" }}>{t("ui.gradeImport.title")}</h2>
          <p style={{ fontSize: 12, color: "var(--admin-font-tertiary)" }}>{t("ui.gradeImport.subtitle")} <code style={{ background: "var(--admin-bg-hover)", padding: "1px 4px", borderRadius: 3 }}>email</code>, <code style={{ background: "var(--admin-bg-hover)", padding: "1px 4px", borderRadius: 3 }}>course_code</code>, <code style={{ background: "var(--admin-bg-hover)", padding: "1px 4px", borderRadius: 3 }}>grade</code></p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input ref={fileRef} type="file" accept=".csv" onChange={handleFileSelect} hidden />
          <button onClick={() => fileRef.current?.click()} style={{
            height: 36, borderRadius: 6, padding: "0 16px", fontSize: 12, fontWeight: 600,
            display: "flex", alignItems: "center", gap: 6,
            background: "#102B47", color: "#fff", border: "none", cursor: "pointer",
          }}>
            <Upload style={{ width: 14, height: 14 }} /> {t("ui.gradeImport.chooseCsv")}
          </button>
        </div>
      </div>

      <div style={{ padding: "12px 16px", borderRadius: 8, background: "var(--admin-bg-hover)", border: "1px solid var(--admin-border-default)" }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--admin-font-tertiary)", textTransform: "uppercase", marginBottom: 6 }}>{t("ui.gradeImport.csvFormat")}</div>
        <code style={{ fontSize: 11, color: "var(--admin-font-secondary)", display: "block", fontFamily: "monospace", lineHeight: 1.8 }}>
          email,course_code,grade,credits,semester<br />
          student@school.edu,MATH101,A,1,Fall 2025
        </code>
        <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)", marginTop: 8 }}>
          {t("ui.gradeImport.optional")} <code>student_id</code>, <code>credits</code>, <code>semester</code>/<code>term</code>. {t("ui.gradeImport.matching")}
        </div>
      </div>

      {preview && (
        <div style={{ borderRadius: 8, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)", overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--admin-border-default)", background: "var(--admin-bg-hover)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <FileText style={{ width: 14, height: 14, color: "var(--admin-accent-blue)" }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>{t("ui.gradeImport.preview", { count: preview.length })}</span>
              <span style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>{t("ui.gradeImport.fromFile", { file: fileName })}</span>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => setPreview(null)} style={{
                height: 30, borderRadius: 6, padding: "0 12px", fontSize: 11, fontWeight: 500,
                background: "var(--admin-bg-card)", border: "1px solid var(--admin-border-default)", color: "var(--admin-font-secondary)", cursor: "pointer",
              }}>{t("common.cancel")}</button>
              <button onClick={handleImport} disabled={importing} style={{
                height: 30, borderRadius: 6, padding: "0 14px", fontSize: 11, fontWeight: 600,
                display: "flex", alignItems: "center", gap: 5,
                background: "#10b981", color: "#fff", border: "none", cursor: "pointer",
                opacity: importing ? 0.7 : 1,
              }}>
                {importing ? <Loader2 style={{ width: 12, height: 12, animation: "spin 1s linear infinite" }} /> : <CheckCircle2 style={{ width: 12, height: 12 }} />}
                {importing ? t("ui.courses.importing") : t("ui.gradeImport.importN", { count: preview.length })}
              </button>
            </div>
          </div>
          <div style={{ maxHeight: 300, overflowY: "auto" }}>
            <Table>
              <TableHeader>
                <TableRow style={{ background: "var(--admin-bg-hover)" }}>
                  {[t("ui.gradeImport.email"), t("ui.gradebook.course"), t("ui.gradebook.grade"), t("ui.courses.credits"), t("ui.gradeImport.semester")].map(h => (
                    <TableHead key={h} style={{ fontSize: 10, fontWeight: 600, color: "var(--admin-font-tertiary)", textTransform: "uppercase" }}>{h}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.slice(0, 50).map((r, i) => (
                  <TableRow key={i} style={{ borderBottom: "1px solid var(--admin-border-default)" }}>
                    <TableCell style={{ fontSize: 12, color: "var(--admin-font-light)" }}>{r.email || r.studentId}</TableCell>
                    <TableCell style={{ fontSize: 12, fontFamily: "monospace", color: "var(--admin-font-primary)" }}>{r.courseCode}</TableCell>
                    <TableCell><Badge style={{ fontSize: 11, background: r.grade?.startsWith("A") ? "rgba(16,185,129,0.1)" : r.grade?.startsWith("B") ? "rgba(59,130,246,0.1)" : r.grade?.startsWith("F") ? "rgba(239,68,68,0.1)" : "rgba(245,158,11,0.1)", color: r.grade?.startsWith("A") ? "#10b981" : r.grade?.startsWith("B") ? "var(--admin-accent-blue)" : r.grade?.startsWith("F") ? "#ef4444" : "#f59e0b", border: "none" }}>{r.grade}</Badge></TableCell>
                    <TableCell style={{ fontSize: 12, color: "var(--admin-font-primary)" }}>{r.credits || "—"}</TableCell>
                    <TableCell style={{ fontSize: 12, color: "var(--admin-font-tertiary)" }}>{r.semester || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {preview.length > 50 && <div style={{ textAlign: "center", padding: 8, fontSize: 11, color: "var(--admin-font-tertiary)" }}>{t("ui.gradeImport.showingFirst50", { total: preview.length })}</div>}
          </div>
        </div>
      )}

      {result && (
        <div style={{ padding: 16, borderRadius: 8, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <CheckCircle2 style={{ width: 16, height: 16, color: "#10b981" }} />
            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--admin-font-primary)" }}>{t("ui.aiImport.importComplete")}</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <div style={{ padding: "10px 12px", borderRadius: 6, background: "var(--admin-bg-hover)", textAlign: "center" }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: "var(--admin-font-primary)" }}>{result.totalRows}</div>
              <div style={{ fontSize: 10, color: "var(--admin-font-tertiary)", textTransform: "uppercase" }}>{t("ui.gradeImport.totalRows")}</div>
            </div>
            <div style={{ padding: "10px 12px", borderRadius: 6, background: "rgba(16,185,129,0.05)", textAlign: "center" }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: "#10b981" }}>{result.validRows}</div>
              <div style={{ fontSize: 10, color: "var(--admin-font-tertiary)", textTransform: "uppercase" }}>{t("ui.gradeImport.importedLabel")}</div>
            </div>
            <div style={{ padding: "10px 12px", borderRadius: 6, background: result.invalidRows ? "rgba(239,68,68,0.05)" : "var(--admin-bg-hover)", textAlign: "center" }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: result.invalidRows ? "#ef4444" : "var(--admin-font-primary)" }}>{result.invalidRows}</div>
              <div style={{ fontSize: 10, color: "var(--admin-font-tertiary)", textTransform: "uppercase" }}>{t("ui.gradeImport.failedLabel")}</div>
            </div>
          </div>
          {result.validationErrors && result.validationErrors.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#ef4444", marginBottom: 4 }}>{t("ui.gradeImport.errors")}</div>
              {result.validationErrors.slice(0, 5).map((e, i: number) => (
                <div key={i} style={{ fontSize: 11, color: "var(--admin-font-tertiary)", padding: "2px 0" }}>
                  {t("ui.gradeImport.rowError", { row: e.row, errors: (e.errors || []).join(", ") })}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
