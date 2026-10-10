/**
 * Course CSV parsing for the Courses tab import. audit 2026-10-09 D11: rows with a blank department used to be created
 * anyway (the Add-course form requires one), and failures were only a count. Each rejected row now carries its CSV line
 * number and reason so the admin can fix the file.
 */
export interface CourseCsvRow {
  code: string;
  name: string;
  department: string;
  credits: number;
  gradeLevels: number[];
  description?: string;
  maxEnrollment: number | null;
  isHonors: boolean;
}

export type CourseCsvReason = "missingCode" | "missingName" | "missingDepartment";

export interface CourseCsvParse {
  rows: { line: number; course: CourseCsvRow }[];
  rejected: { line: number; reason: CourseCsvReason }[];
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let inQ = false, cell = "";
  for (const ch of line) {
    if (ch === '"') inQ = !inQ;
    else if (ch === "," && !inQ) { out.push(cell.trim()); cell = ""; }
    else cell += ch;
  }
  out.push(cell.trim());
  return out;
}

export function parseCourseCsv(text: string): CourseCsvParse {
  const lines = text.split(/\r?\n/);
  const headerIdx = lines.findIndex((l) => l.trim() !== "");
  const result: CourseCsvParse = { rows: [], rejected: [] };
  if (headerIdx < 0) return result;
  const headers = splitCsvLine(lines[headerIdx]).map((h) => h.replace(/^"|"$/g, "").trim().toLowerCase());
  const pick = (row: string[], ...names: string[]) => {
    for (const n of names) { const i = headers.indexOf(n); if (i >= 0) return row[i] ?? ""; }
    return "";
  };
  for (let i = headerIdx + 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const line = i + 1; // 1-based line number in the file, as a spreadsheet shows it
    const row = splitCsvLine(lines[i]);
    const code = pick(row, "code"), name = pick(row, "name"), department = pick(row, "department");
    if (!code) { result.rejected.push({ line, reason: "missingCode" }); continue; }
    if (!name) { result.rejected.push({ line, reason: "missingName" }); continue; }
    if (!department) { result.rejected.push({ line, reason: "missingDepartment" }); continue; }
    const maxRaw = pick(row, "max_enrollment", "maxenrollment", "capacity");
    const gradesRaw = pick(row, "grade_levels", "gradelevels", "grades") || "9";
    const gradeLevels = gradesRaw.split(/[;|]/).map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n) && n >= 6 && n <= 12);
    const description = pick(row, "description");
    result.rows.push({
      line,
      course: {
        code, name, department,
        credits: parseFloat(pick(row, "credits") || "1") || 1,
        gradeLevels: gradeLevels.length ? gradeLevels : [9],
        description: description || undefined,
        maxEnrollment: maxRaw ? parseInt(maxRaw, 10) || null : null,
        isHonors: ["true", "yes", "1", "x", "honors"].includes(pick(row, "honors", "ishonors", "is_honors").toLowerCase()),
      },
    });
  }
  return result;
}
