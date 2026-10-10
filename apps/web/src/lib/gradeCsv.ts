/**
 * Grade CSV → the `rows` POST /api/v1/school-admin/grades/import expects (it takes parsed JSON, never a file).
 * Shared by the Gradebook importer and the Results "Import grades" dialog — the dialog used to upload the
 * file as multipart, which the API always answered with 400 (audit 2026-10-09 C4).
 * Columns (case-insensitive): email|student_email, student_id|studentid, course_code|coursecode|course,
 * grade, credits, semester|term. A row needs a grade and an email or student id.
 */
export type GradeCsvRow = Record<"email" | "studentId" | "courseCode" | "grade" | "credits" | "semester" | "status", string>;

export function parseGradeCsv(text: string): GradeCsvRow[] {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.trim().toLowerCase());
  const col = (...names: string[]) => names.map(n => headers.indexOf(n)).find(i => i >= 0) ?? -1;
  const at = (cells: string[], i: number) => (i >= 0 ? cells[i] ?? "" : "");
  const idx = {
    email: col("email", "student_email"),
    studentId: col("student_id", "studentid"),
    courseCode: col("course_code", "coursecode", "course"),
    grade: col("grade"),
    credits: col("credits"),
    semester: col("semester", "term"),
  };

  const rows: GradeCsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells: string[] = []; let inQ = false, cell = "";
    for (const ch of lines[i]) { if (ch === '"') inQ = !inQ; else if (ch === "," && !inQ) { cells.push(cell.trim()); cell = ""; } else cell += ch; }
    cells.push(cell.trim());
    const row: GradeCsvRow = {
      email: at(cells, idx.email), studentId: at(cells, idx.studentId), courseCode: at(cells, idx.courseCode),
      grade: at(cells, idx.grade), credits: at(cells, idx.credits), semester: at(cells, idx.semester), status: "completed",
    };
    if (!row.grade || (!row.email && !row.studentId)) continue;
    rows.push(row);
  }
  return rows;
}
