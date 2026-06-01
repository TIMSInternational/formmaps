"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api/apiClient";
import { Settings, Save, Trophy, Loader2, BarChart3, Upload, FileText, CheckCircle2, AlertTriangle, Download, ChevronLeft, ChevronRight } from "lucide-react";
import { getGpaConfig, updateGpaConfig, computeClassRanks, GpaConfig } from "@/services/transcriptService";
import { AdminTabBar } from "../../_components/AdminTabBar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

const DEFAULT_MAP_4: Record<string, number> = {
  "A+": 4.0, "A": 4.0, "A-": 3.7, "B+": 3.3, "B": 3.0, "B-": 2.7,
  "C+": 2.3, "C": 2.0, "C-": 1.7, "D+": 1.3, "D": 1.0, "D-": 0.7, "F": 0.0,
};
const DEFAULT_MAP_5: Record<string, number> = {
  "A+": 5.0, "A": 5.0, "A-": 4.7, "B+": 4.3, "B": 4.0, "B-": 3.7,
  "C+": 3.3, "C": 3.0, "C-": 2.7, "D+": 2.3, "D": 2.0, "D-": 1.7, "F": 0.0,
};
const DEFAULT_BONUSES: Record<string, number> = { HONORS: 0.5, AP: 1.0, IB: 1.0 };
const GRADE_ORDER = ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "D-", "F"];

// ─── GRADE IMPORT TAB ───
function GradeImportTab() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [preview, setPreview] = useState<any[] | null>(null);
  const [result, setResult] = useState<any>(null);
  const [fileName, setFileName] = useState("");

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    setFileName(file.name);
    setResult(null);

    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) { toast.error("CSV has no data rows"); return; }

    const headers = lines[0].split(",").map(h => h.trim().toLowerCase());
    const col = (name: string) => headers.indexOf(name);

    // Parse rows
    const rows: any[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cells: string[] = []; let inQ = false, cell = "";
      for (const ch of lines[i]) { if (ch === '"') inQ = !inQ; else if (ch === ',' && !inQ) { cells.push(cell.trim()); cell = ""; } else cell += ch; }
      cells.push(cell.trim());

      const email = col("email") >= 0 ? cells[col("email")] : (col("student_email") >= 0 ? cells[col("student_email")] : "");
      const studentId = col("student_id") >= 0 ? cells[col("student_id")] : (col("studentid") >= 0 ? cells[col("studentid")] : "");
      const courseCode = col("course_code") >= 0 ? cells[col("course_code")] : (col("coursecode") >= 0 ? cells[col("coursecode")] : (col("course") >= 0 ? cells[col("course")] : ""));
      const grade = col("grade") >= 0 ? cells[col("grade")] : "";
      const credits = col("credits") >= 0 ? cells[col("credits")] : "";
      const semester = col("semester") >= 0 ? cells[col("semester")] : (col("term") >= 0 ? cells[col("term")] : "");

      if (!grade || (!email && !studentId)) continue;
      rows.push({ email, studentId, courseCode, grade, credits, semester, status: "completed" });
    }

    if (rows.length === 0) { toast.error("No valid grade rows found. Need columns: email/student_id, course_code, grade"); return; }
    setPreview(rows);
    toast.success(`Parsed ${rows.length} grade records from ${file.name}`);
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
      toast.success(`Imported ${data.validRows || 0} grades, ${data.invalidRows || 0} failed`);
    } catch { toast.error("Import failed"); }
    setImporting(false);
  };

  return (
    <div className="space-y-4">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: "var(--admin-font-primary)" }}>Import Grades</h2>
          <p style={{ fontSize: 12, color: "var(--admin-font-tertiary)" }}>Upload a CSV file with student grades. Required columns: <code style={{ background: "var(--admin-bg-hover)", padding: "1px 4px", borderRadius: 3 }}>email</code>, <code style={{ background: "var(--admin-bg-hover)", padding: "1px 4px", borderRadius: 3 }}>course_code</code>, <code style={{ background: "var(--admin-bg-hover)", padding: "1px 4px", borderRadius: 3 }}>grade</code></p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input ref={fileRef} type="file" accept=".csv" onChange={handleFileSelect} hidden />
          <button onClick={() => fileRef.current?.click()} style={{
            height: 36, borderRadius: 6, padding: "0 16px", fontSize: 12, fontWeight: 600,
            display: "flex", alignItems: "center", gap: 6,
            background: "#3b82f6", color: "#fff", border: "none", cursor: "pointer",
          }}>
            <Upload style={{ width: 14, height: 14 }} /> Upload CSV
          </button>
        </div>
      </div>

      {/* CSV Format Help */}
      <div style={{ padding: "12px 16px", borderRadius: 8, background: "var(--admin-bg-hover)", border: "1px solid var(--admin-border-default)" }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--admin-font-tertiary)", textTransform: "uppercase", marginBottom: 6 }}>CSV Format</div>
        <code style={{ fontSize: 11, color: "var(--admin-font-secondary)", display: "block", fontFamily: "monospace", lineHeight: 1.8 }}>
          email,course_code,grade,credits,semester<br />
          test.student@formmaps.dev,MATH101,A,1,Fall 2025<br />
          test.student@formmaps.dev,ENG101,B+,1,Fall 2025
        </code>
        <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)", marginTop: 8 }}>
          Optional columns: <code>student_id</code>, <code>credits</code>, <code>semester</code>/<code>term</code>. Students are matched by email, courses by code.
        </div>
      </div>

      {/* Preview */}
      {preview && (
        <div style={{ borderRadius: 8, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)", overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--admin-border-default)", background: "var(--admin-bg-hover)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <FileText style={{ width: 14, height: 14, color: "#3b82f6" }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>Preview: {preview.length} records</span>
              <span style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>from {fileName}</span>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => setPreview(null)} style={{
                height: 30, borderRadius: 6, padding: "0 12px", fontSize: 11, fontWeight: 500,
                background: "var(--admin-bg-card)", border: "1px solid var(--admin-border-default)", color: "var(--admin-font-secondary)", cursor: "pointer",
              }}>Cancel</button>
              <button onClick={handleImport} disabled={importing} style={{
                height: 30, borderRadius: 6, padding: "0 14px", fontSize: 11, fontWeight: 600,
                display: "flex", alignItems: "center", gap: 5,
                background: "#10b981", color: "#fff", border: "none", cursor: "pointer",
                opacity: importing ? 0.7 : 1,
              }}>
                {importing ? <Loader2 style={{ width: 12, height: 12, animation: "spin 1s linear infinite" }} /> : <CheckCircle2 style={{ width: 12, height: 12 }} />}
                {importing ? "Importing..." : `Import ${preview.length} Grades`}
              </button>
            </div>
          </div>
          <div style={{ maxHeight: 300, overflowY: "auto" }}>
            <Table>
              <TableHeader>
                <TableRow style={{ background: "var(--admin-bg-hover)" }}>
                  {["Email", "Course", "Grade", "Credits", "Semester"].map(h => (
                    <TableHead key={h} style={{ fontSize: 10, fontWeight: 600, color: "var(--admin-font-tertiary)", textTransform: "uppercase" }}>{h}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.slice(0, 50).map((r, i) => (
                  <TableRow key={i} style={{ borderBottom: "1px solid var(--admin-border-default)" }}>
                    <TableCell style={{ fontSize: 12, color: "var(--admin-font-light)" }}>{r.email || r.studentId}</TableCell>
                    <TableCell style={{ fontSize: 12, fontFamily: "monospace", color: "var(--admin-font-primary)" }}>{r.courseCode}</TableCell>
                    <TableCell><Badge style={{ fontSize: 11, background: r.grade?.startsWith("A") ? "rgba(16,185,129,0.1)" : r.grade?.startsWith("B") ? "rgba(59,130,246,0.1)" : r.grade?.startsWith("F") ? "rgba(239,68,68,0.1)" : "rgba(245,158,11,0.1)", color: r.grade?.startsWith("A") ? "#10b981" : r.grade?.startsWith("B") ? "#3b82f6" : r.grade?.startsWith("F") ? "#ef4444" : "#f59e0b", border: "none" }}>{r.grade}</Badge></TableCell>
                    <TableCell style={{ fontSize: 12, color: "var(--admin-font-primary)" }}>{r.credits || "—"}</TableCell>
                    <TableCell style={{ fontSize: 12, color: "var(--admin-font-tertiary)" }}>{r.semester || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {preview.length > 50 && <div style={{ textAlign: "center", padding: 8, fontSize: 11, color: "var(--admin-font-tertiary)" }}>Showing first 50 of {preview.length} rows</div>}
          </div>
        </div>
      )}

      {/* Import Result */}
      {result && (
        <div style={{ padding: 16, borderRadius: 8, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <CheckCircle2 style={{ width: 16, height: 16, color: "#10b981" }} />
            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--admin-font-primary)" }}>Import Complete</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <div style={{ padding: "10px 12px", borderRadius: 6, background: "var(--admin-bg-hover)", textAlign: "center" }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: "var(--admin-font-primary)" }}>{result.totalRows}</div>
              <div style={{ fontSize: 10, color: "var(--admin-font-tertiary)", textTransform: "uppercase" }}>Total Rows</div>
            </div>
            <div style={{ padding: "10px 12px", borderRadius: 6, background: "rgba(16,185,129,0.05)", textAlign: "center" }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: "#10b981" }}>{result.validRows}</div>
              <div style={{ fontSize: 10, color: "var(--admin-font-tertiary)", textTransform: "uppercase" }}>Imported</div>
            </div>
            <div style={{ padding: "10px 12px", borderRadius: 6, background: result.invalidRows ? "rgba(239,68,68,0.05)" : "var(--admin-bg-hover)", textAlign: "center" }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: result.invalidRows ? "#ef4444" : "var(--admin-font-primary)" }}>{result.invalidRows}</div>
              <div style={{ fontSize: 10, color: "var(--admin-font-tertiary)", textTransform: "uppercase" }}>Failed</div>
            </div>
          </div>
          {result.validationErrors?.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#ef4444", marginBottom: 4 }}>Errors:</div>
              {result.validationErrors.slice(0, 5).map((e: any, i: number) => (
                <div key={i} style={{ fontSize: 11, color: "var(--admin-font-tertiary)", padding: "2px 0" }}>
                  Row {e.row}: {(e.errors || []).join(", ")}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!preview && !result && (
        <div style={{ textAlign: "center", padding: 48 }}>
          <Upload style={{ width: 40, height: 40, color: "var(--admin-font-light)", margin: "0 auto 16px", opacity: 0.3 }} />
          <p style={{ fontSize: 13, color: "var(--admin-font-tertiary)" }}>Upload a CSV file to import student grades. Grades feed into GPA calculations, class rankings, and graduation tracking.</p>
        </div>
      )}
    </div>
  );
}

// ─── CLASS RANKINGS TAB ───
function ClassRankingsTab() {
  const [computing, setComputing] = useState(false);
  const queryClient = useQueryClient();

  const { data: rankData, isLoading } = useQuery({
    queryKey: ["class-rankings"],
    queryFn: async () => {
      const res = await apiRequest("/api/v1/school-admin/class-ranks");
      return res?.data ?? res;
    },
    staleTime: 1000 * 60 * 5,
    retry: false,
  });

  const handleCompute = async () => {
    setComputing(true);
    try {
      await computeClassRanks();
      toast.success("Class ranks computed");
      queryClient.invalidateQueries({ queryKey: ["class-rankings"] });
    } catch { toast.error("Failed to compute ranks"); }
    setComputing(false);
  };

  const students = Array.isArray(rankData) ? rankData : rankData?.rankings || rankData?.data || [];

  return (
    <div className="space-y-4">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: "var(--admin-font-primary)" }}>Class Rankings</h2>
          <p style={{ fontSize: 12, color: "var(--admin-font-tertiary)" }}>Student GPA rankings based on your grading configuration</p>
        </div>
        <button onClick={handleCompute} disabled={computing} style={{
          height: 36, borderRadius: 6, padding: "0 16px", fontSize: 12, fontWeight: 600,
          display: "flex", alignItems: "center", gap: 6,
          background: "#8b5cf6", color: "#fff", border: "none", cursor: "pointer",
          opacity: computing ? 0.7 : 1,
        }}>
          {computing ? <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> : <Trophy style={{ width: 14, height: 14 }} />}
          {computing ? "Computing..." : "Compute Ranks"}
        </button>
      </div>

      {isLoading ? (
        <Skeleton className="h-[300px]" style={{ background: "var(--admin-bg-hover)" }} />
      ) : students.length === 0 ? (
        <div style={{ textAlign: "center", padding: 48 }}>
          <Trophy style={{ width: 40, height: 40, color: "var(--admin-font-light)", margin: "0 auto 16px", opacity: 0.3 }} />
          <p style={{ fontSize: 13, color: "var(--admin-font-tertiary)" }}>No rankings yet. Import grades first, then click "Compute Ranks".</p>
        </div>
      ) : (
        <div style={{ borderRadius: 8, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)", overflow: "hidden" }}>
          <Table>
            <TableHeader>
              <TableRow style={{ borderBottom: "1px solid var(--admin-border-default)" }}>
                {["Rank", "Student", "Grade", "GPA", "Weighted GPA", "Percentile"].map(h => (
                  <TableHead key={h} className="py-3 px-4" style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--admin-font-tertiary)", background: "var(--admin-bg-hover)" }}>{h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {students.map((s: any, i: number) => {
                const gpa = s.gpa ?? s.unweightedGpa ?? 0;
                const wgpa = s.weightedGpa ?? gpa;
                const pct = s.percentile ?? 0;
                return (
                  <TableRow key={s.studentId || i} style={{ borderBottom: "1px solid var(--admin-border-default)" }}>
                    <TableCell className="py-3 px-4">
                      <span style={{ fontSize: 14, fontWeight: 700, color: i < 3 ? "#f59e0b" : "var(--admin-font-primary)" }}>#{s.rank || i + 1}</span>
                    </TableCell>
                    <TableCell className="py-3 px-4">
                      <span style={{ fontSize: 13, fontWeight: 500, color: "var(--admin-font-primary)" }}>{s.studentName || s.name || "—"}</span>
                    </TableCell>
                    <TableCell className="py-3 px-4" style={{ fontSize: 13, color: "var(--admin-font-light)" }}>
                      {s.gradeLevel ? `Gr. ${s.gradeLevel}` : "—"}
                    </TableCell>
                    <TableCell className="py-3 px-4">
                      <span style={{ fontSize: 14, fontWeight: 600, color: "var(--admin-font-primary)" }}>{Number(gpa).toFixed(2)}</span>
                    </TableCell>
                    <TableCell className="py-3 px-4">
                      <span style={{ fontSize: 14, fontWeight: 600, color: wgpa > gpa ? "#8b5cf6" : "var(--admin-font-primary)" }}>{Number(wgpa).toFixed(2)}</span>
                    </TableCell>
                    <TableCell className="py-3 px-4">
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ flex: 1, height: 6, borderRadius: 3, background: "var(--admin-bg-hover)", overflow: "hidden", maxWidth: 80 }}>
                          <div style={{ height: "100%", borderRadius: 3, width: `${pct}%`, background: pct >= 90 ? "#10b981" : pct >= 75 ? "#3b82f6" : pct >= 50 ? "#f59e0b" : "#ef4444" }} />
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 600, color: "var(--admin-font-tertiary)" }}>{pct}%</span>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// ─── GPA CONFIG TAB (existing, simplified) ───
function GpaConfigTab() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [scale, setScale] = useState<4 | 5>(4);
  const [gradeMap, setGradeMap] = useState<Record<string, number>>({ ...DEFAULT_MAP_4 });
  const [bonuses, setBonuses] = useState<Record<string, number>>({ ...DEFAULT_BONUSES });

  useEffect(() => {
    (async () => {
      try {
        const config = await getGpaConfig();
        if (config) {
          const s = config.scale === 5 ? 5 : 4;
          setScale(s);
          setGradeMap(Object.keys(config.unweightedMap).length > 0 ? { ...config.unweightedMap } : s === 5 ? { ...DEFAULT_MAP_5 } : { ...DEFAULT_MAP_4 });
          setBonuses(Object.keys(config.weightBonuses).length > 0 ? { ...config.weightBonuses } : { ...DEFAULT_BONUSES });
        }
      } catch {} finally { setLoading(false); }
    })();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateGpaConfig({ scale, unweightedMap: gradeMap, weightBonuses: bonuses } as Partial<GpaConfig>);
      toast.success("GPA configuration saved");
    } catch { toast.error("Failed to save"); }
    setSaving(false);
  };

  if (loading) return <div style={{ textAlign: "center", padding: 48 }}><Loader2 className="h-5 w-5 animate-spin mx-auto" style={{ color: "var(--admin-font-tertiary)" }} /></div>;

  return (
    <div className="space-y-5">
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button onClick={handleSave} disabled={saving} style={{
          height: 36, borderRadius: 6, padding: "0 14px", fontSize: 12, fontWeight: 600,
          display: "flex", alignItems: "center", gap: 6,
          background: "var(--admin-accent-blue, #3b82f6)", color: "#fff", border: "none", cursor: "pointer",
          opacity: saving ? 0.6 : 1,
        }}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? "Saving..." : "Save Configuration"}
        </button>
      </div>

      {/* Scale + Grade Map */}
      <div style={{ borderRadius: 8, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)", overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--admin-border-default)", display: "flex", alignItems: "center", gap: 8, background: "var(--admin-bg-hover)" }}>
          <Settings className="h-4 w-4" style={{ color: "#3b82f6" }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>Grading Scale</div>
            <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>Set point values for each letter grade</div>
          </div>
        </div>
        <div style={{ padding: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--admin-font-secondary)" }}>Scale:</span>
            {([4, 5] as const).map(s => (
              <label key={s} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13, color: scale === s ? "var(--admin-font-primary)" : "var(--admin-font-tertiary)", fontWeight: scale === s ? 600 : 400 }}>
                <input type="radio" checked={scale === s} onChange={() => { setScale(s); setGradeMap(s === 5 ? { ...DEFAULT_MAP_5 } : { ...DEFAULT_MAP_4 }); }}
                  style={{ accentColor: "#3b82f6", width: 15, height: 15 }} />
                {s}.0
              </label>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))", gap: 6 }}>
            {GRADE_ORDER.map(letter => (
              <div key={letter} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, width: 28, color: letter === "F" ? "#ef4444" : letter.startsWith("A") ? "#10b981" : letter.startsWith("B") ? "#3b82f6" : letter.startsWith("C") ? "#f59e0b" : "var(--admin-font-secondary)" }}>{letter}</span>
                <input type="number" min={0} max={scale} step={0.1} value={gradeMap[letter] ?? 0}
                  onChange={(e) => setGradeMap(prev => ({ ...prev, [letter]: parseFloat(e.target.value) || 0 }))}
                  style={{ width: 60, height: 28, borderRadius: 4, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-hover)", color: "var(--admin-font-primary)", fontSize: 12, padding: "0 6px" }} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bonuses */}
      <div style={{ borderRadius: 8, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)", overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--admin-border-default)", display: "flex", alignItems: "center", gap: 8, background: "var(--admin-bg-hover)" }}>
          <Trophy className="h-4 w-4" style={{ color: "#3b82f6" }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>Weight Bonuses</div>
            <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>Extra points for Honors/AP/IB courses</div>
          </div>
        </div>
        <div style={{ padding: 16, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          {[
            { key: "HONORS", label: "Honors", color: "#8b5cf6" },
            { key: "AP", label: "AP", color: "#3b82f6" },
            { key: "IB", label: "IB", color: "#10b981" },
          ].map(({ key, label, color }) => (
            <div key={key} style={{ padding: 12, borderRadius: 8, background: "var(--admin-bg-hover)", border: "1px solid var(--admin-border-default)" }}>
              <div style={{ fontSize: 12, fontWeight: 600, color, marginBottom: 8 }}>{label}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ fontSize: 12, color: "var(--admin-font-tertiary)" }}>+</span>
                <input type="number" min={0} max={2} step={0.1} value={bonuses[key] ?? 0}
                  onChange={(e) => setBonuses(prev => ({ ...prev, [key]: parseFloat(e.target.value) || 0 }))}
                  style={{ width: 60, height: 30, borderRadius: 4, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)", color: "var(--admin-font-primary)", fontSize: 13, fontWeight: 600, padding: "0 8px" }} />
                <span style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>pts</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── MAIN PANEL ───
export function GpaPanel() {
  const [activeTab, setActiveTab] = useState("import");

  return (
    <div className="space-y-6">
      <AdminTabBar
        tabs={[
          { key: "import", label: "Grade Import", icon: Upload },
          { key: "config", label: "GPA Configuration", icon: Settings },
          { key: "rankings", label: "Class Rankings", icon: Trophy },
        ]}
        activeTab={activeTab}
        onChange={setActiveTab}
      />

      {activeTab === "import" && <GradeImportTab />}
      {activeTab === "config" && <GpaConfigTab />}
      {activeTab === "rankings" && <ClassRankingsTab />}
    </div>
  );
}
