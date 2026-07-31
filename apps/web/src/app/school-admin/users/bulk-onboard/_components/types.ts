export type ClassLevel = "Freshman" | "Sophomore" | "Junior" | "Senior" | "";

export interface StudentRow {
  id: string;
  name: string;
  email: string;
  classLevel: ClassLevel;
}

export interface PreviewStudent {
  name: string;
  email: string;
  classLevel: string;
  status: "new" | "existing" | "error";
  error?: string;
  counselorName?: string;
}

export interface CounselorLoad {
  name: string;
  currentCount: number;
  newCount: number;
}

export interface PreviewResult {
  students: PreviewStudent[];
  counselors: CounselorLoad[];
  summary: {
    newCount: number;
    existingCount: number;
    errorCount: number;
    totalCounselors: number;
  };
}

export interface OnboardResult {
  created: number;
  linked: number;
  updated: number;
  failed: number;
  results: Array<{ name: string; email: string; status: string; error?: string; classLevel?: string; message?: string }>;
}

// Map API preview response to frontend shape
export function mapPreviewResponse(raw: Record<string, unknown>): PreviewResult {
  const preview = (raw.preview || []) as Array<Record<string, unknown>>;
  const validationErrors = (raw.validationErrors || []) as Array<Record<string, unknown>>;
  const counselorPreview = (raw.counselorPreview || []) as Array<Record<string, unknown>>;
  const summary = (raw.summary || {}) as Record<string, number>;

  const students: PreviewStudent[] = [
    ...preview.map((p) => ({
      name: String(p.name ?? ""),
      email: String(p.email ?? ""),
      classLevel: String(p.classLevel ?? ""),
      status: (p.action === "create" || p.action === "link" ? "new" : p.action === "error" ? "error" : "existing") as PreviewStudent["status"],
      error: p.action === "error" ? String(p.message ?? "") : undefined,
      counselorName: p.counselorAssigned ? String(p.counselorAssigned) : undefined,
    })),
    ...validationErrors.map((e) => ({
      name: "",
      email: String(e.email ?? ""),
      classLevel: "",
      status: "error" as const,
      error: ((e.errors || []) as string[]).join("; "),
    })),
  ];

  const counselors: CounselorLoad[] = counselorPreview.map((c) => ({
    name: String(c.name ?? ""),
    currentCount: Number(c.projectedAssignments ?? 0) - preview.filter((p) => p.counselorAssigned === c.name).length,
    newCount: preview.filter((p) => p.counselorAssigned === c.name).length,
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
export function mapOnboardResponse(raw: Record<string, unknown>): OnboardResult {
  const summary = (raw.summary || {}) as Record<string, number>;
  const rawResults = (raw.results || []) as Array<Record<string, unknown>>;
  const results = rawResults.map((r) => ({
    name: String(r.name ?? ""),
    email: String(r.email ?? ""),
    classLevel: r.classLevel ? String(r.classLevel) : undefined,
    status: String(r.status ?? ""),
    error: r.status === "failed" ? String(r.message ?? "") : undefined,
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

// CSV helpers
export function parseCSV(text: string): Array<{ name: string; email: string; classLevel: string }> {
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

export function downloadTemplate() {
  const blob = new Blob([TEMPLATE_CSV], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "student_roster_template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export function genId() {
  return Math.random().toString(36).slice(2, 10);
}
