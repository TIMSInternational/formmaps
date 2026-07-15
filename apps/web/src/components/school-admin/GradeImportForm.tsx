"use client";

import React, { useState } from "react";
import Papa from "papaparse";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { useSchoolAdminAccess } from "@/hooks/useSchoolAdminAccess";
import { useGradeImport } from "@/hooks/useGradeImport";
import ImportJobStatusPanel from "@/components/school-admin/ImportJobStatusPanel";

interface Props {
  onClose?: () => void;
}

const REQUIRED_COLUMNS = [
  "student_id",
  "student_email",
  "course_code",
  "semester",
  "grade",
  "credits",
  "status",
];

export default function GradeImportForm({ onClose }: Props) {
  const { t } = useTranslation();
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [isPreview, setIsPreview] = useState(false);
  const [importJobId, setImportJobId] = useState<string | null>(null);
  const { schoolId } = useSchoolAdminAccess();
  const mutation = useGradeImport();

  const validateParsed = (data: any[]) => {
    const errs: string[] = [];
    if (!data || data.length === 0) {
      errs.push(t("schoolAdmin.gradeImport.emptyFile", "CSV is empty"));
      return errs;
    }

    const header = Object.keys(data[0]).map((h) => h.trim().toLowerCase());
    for (const col of REQUIRED_COLUMNS) {
      if (!header.includes(col)) {
        errs.push(`Missing required column: ${col}`);
      }
    }

    data.forEach((r, i) => {
      if (!r.student_id && !r.student_email) errs.push(`Row ${i + 1}: missing student_id or student_email`);
      if (!r.course_code) errs.push(`Row ${i + 1}: missing course_code`);
      // basic grade validation
      if (r.grade && typeof r.grade === "string" && r.grade.length > 3) errs.push(`Row ${i + 1}: invalid grade value`);
    });

    return errs;
  };

  const handleFile = (f: File | null) => {
    setFile(f);
    setRows([]);
    setErrors([]);
    setIsPreview(false);

    if (!f) return;

    Papa.parse(f, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const parsed = results.data as any[];
        const validation = validateParsed(parsed);
        setRows(parsed);
        setErrors(validation);
        setIsPreview(true);
      },
      error: (err) => {
        setErrors([err.message]);
        setIsPreview(false);
      },
    });
  };

  const handleConfirm = async () => {
    if (!file) return toast.error(t("schoolAdmin.gradeImport.noFile", "No file selected"));
    if (!schoolId) return toast.error(t("schoolAdmin.gradeImport.noSchool", "School context missing"));
    try {
      const result = await mutation.mutateAsync({ file, schoolId });
      const jobId = (result as any)?.jobId;
      if (jobId) {
        setImportJobId(jobId);
        toast.success(t("schoolAdmin.gradeImport.uploadSuccess", "Import started — tracking progress below"));
      } else {
        toast.success(t("schoolAdmin.gradeImport.uploadSuccess", "Import started"));
        onClose?.();
      }
    } catch (err: any) {
      toast.error(err?.message || t("schoolAdmin.gradeImport.uploadError", "Import failed"));
    }
  };

  return (
    <div className="space-y-4 p-4">
      <div>
        <p className="text-sm text-gray-600">
          {t(
            "schoolAdmin.gradeImport.helpText",
            "Upload a CSV with columns: student_id, student_email, course_code, semester, grade, credits, status"
          )}
        </p>
      </div>

      <div className="flex items-center gap-3">
        <input
          data-testid="grade-csv-input"
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => handleFile(e.target.files ? e.target.files[0] : null)}
        />
        <Button onClick={() => handleFile(file)} disabled={!file}>
          {t("schoolAdmin.gradeImport.parse", "Preview")}
        </Button>
      </div>

      {isPreview && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600">{t("schoolAdmin.gradeImport.preview", "Preview")}</p>
            <div className="text-sm text-gray-500">{rows.length} rows</div>
          </div>

          {errors.length > 0 && (
            <div className="p-3 rounded bg-rose-50 text-rose-700 border border-rose-100">
              <strong>{t("schoolAdmin.gradeImport.errors", "Validation errors:")}</strong>
              <ul className="list-disc ml-5 mt-2 text-sm">
                {errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="overflow-x-auto max-h-64 border rounded">
            <table className="w-full text-sm table-auto">
              <thead className="bg-gray-50">
                <tr>
                  {Object.keys(rows[0] || {}).slice(0, 8).map((col) => (
                    <th key={col} className="p-2 text-left font-medium">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 10).map((r, idx) => (
                  <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                    {Object.values(r).slice(0, 8).map((v, j) => (
                      <td key={j} className="p-2 text-xs text-gray-700">
                        {String(v)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>{t("common.cancel", "Cancel")}</Button>
            <Button disabled={errors.length > 0 || rows.length === 0 || mutation.isPending} onClick={handleConfirm}>
              {mutation.isPending ? "Uploading..." : t("schoolAdmin.gradeImport.confirmImport", "Start Import")}
            </Button>
          </div>
        </div>
      )}

      {importJobId && (
        <ImportJobStatusPanel
          type="grades"
          jobId={importJobId}
          onDone={onClose}
        />
      )}
    </div>
  );
}
