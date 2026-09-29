"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useSchoolCourses } from "@/hooks/useCurriculumQueries";
import { useCreateGrade, useUpdateGrade } from "@/hooks/useGradebookQueries";
import type { GradebookGrade } from "@/services/gradebookService";

const GRADE_ORDER = ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "D-", "F"];
const LEVELS = ["regular", "honors", "ap", "ib"] as const;

const inputStyle: React.CSSProperties = {
  height: 36, borderRadius: 6, border: "1px solid var(--admin-border-default)",
  background: "var(--admin-bg-hover)", color: "var(--admin-font-primary)", fontSize: 13, padding: "0 10px", width: "100%",
};
const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: "var(--admin-font-tertiary)", textTransform: "uppercase", marginBottom: 4, display: "block" };

interface Props {
  open: boolean;
  onClose: () => void;
  studentId: string;
  existing?: GradebookGrade | null;
  defaultYear?: string;
}

export function GradeFormDialog({ open, onClose, studentId, existing, defaultYear }: Props) {
  const { t } = useTranslation("school_admin");
  const isEdit = !!existing;
  const { data: coursesData } = useSchoolCourses({ limit: 500 });
  const courses = coursesData?.data ?? [];
  const create = useCreateGrade(studentId);
  const update = useUpdateGrade(studentId);

  const [courseId, setCourseId] = useState("");
  const [grade, setGrade] = useState("A");
  const [credits, setCredits] = useState("1");
  const [semester, setSemester] = useState("");
  const [academicYear, setAcademicYear] = useState("");
  const [courseLevel, setCourseLevel] = useState("regular");

  // Seed the form when (re)opened
  useEffect(() => {
    if (!open) return;
    setCourseId(existing?.courseId ?? "");
    setGrade(existing?.grade ?? "A");
    setCredits(String(existing?.credits ?? 1));
    setSemester(existing?.semester ?? "");
    setAcademicYear(existing?.academicYear ?? defaultYear ?? "");
    setCourseLevel(existing?.courseLevel ?? "regular");
  }, [open, existing, defaultYear]);

  const saving = create.isPending || update.isPending;

  const handleSave = () => {
    const input = {
      grade,
      credits: parseFloat(credits) || 0,
      semester: semester || null,
      academicYear: academicYear || null,
      courseLevel,
    };
    if (isEdit && existing) {
      update.mutate({ gradeId: existing.id, input }, { onSuccess: onClose });
    } else {
      if (!courseId) return;
      create.mutate({ ...input, courseId }, { onSuccess: onClose });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent style={{ background: "var(--admin-bg-card)", border: "1px solid var(--admin-border-default)", maxWidth: 460 }}>
        <DialogHeader>
          <DialogTitle style={{ color: "var(--admin-font-primary)" }}>{isEdit ? t("ui.gradebook.editGrade") : t("ui.gradebook.addGrade")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label style={labelStyle}>{t("ui.gradebook.course")}</label>
            {isEdit ? (
              <div style={{ ...inputStyle, display: "flex", alignItems: "center", color: "var(--admin-font-secondary)" }}>
                {existing?.courseCode || "—"}
              </div>
            ) : (
              <select value={courseId} onChange={(e) => setCourseId(e.target.value)} style={inputStyle}>
                <option value="">{t("ui.gradebook.selectCourse")}</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>{c.code} — {c.name}</option>
                ))}
              </select>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={labelStyle}>{t("ui.gradebook.grade")}</label>
              <select value={grade} onChange={(e) => setGrade(e.target.value)} style={inputStyle}>
                {GRADE_ORDER.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>{t("ui.courses.credits")}</label>
              <input type="number" min={0} step={0.5} value={credits} onChange={(e) => setCredits(e.target.value)} style={inputStyle} />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={labelStyle}>{t("ui.gradebook.academicYear")}</label>
              <input value={academicYear} onChange={(e) => setAcademicYear(e.target.value)} placeholder="2024-2025" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>{t("ui.gradebook.semesterTerm")}</label>
              <input value={semester} onChange={(e) => setSemester(e.target.value)} placeholder={t("ui.gradebook.semesterPlaceholder")} style={inputStyle} />
            </div>
          </div>

          <div>
            <label style={labelStyle}>{t("ui.gradebook.courseLevel")}</label>
            <select value={courseLevel} onChange={(e) => setCourseLevel(e.target.value)} style={inputStyle}>
              {LEVELS.map((l) => <option key={l} value={l}>{t(`ui.gradebook.level.${l}`)}</option>)}
            </select>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
          <button onClick={onClose} style={{ height: 36, borderRadius: 6, padding: "0 16px", fontSize: 13, fontWeight: 500, background: "var(--admin-bg-card)", border: "1px solid var(--admin-border-default)", color: "var(--admin-font-secondary)", cursor: "pointer" }}>{t("common.cancel")}</button>
          <button onClick={handleSave} disabled={saving || (!isEdit && !courseId)} style={{
            height: 36, borderRadius: 6, padding: "0 20px", fontSize: 13, fontWeight: 600,
            background: "#102B47", color: "#fff", border: "none", cursor: "pointer",
            opacity: saving || (!isEdit && !courseId) ? 0.6 : 1,
          }}>{saving ? t("ui.common.saving") : isEdit ? t("ui.common.saveChanges") : t("ui.gradebook.addGrade")}</button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
