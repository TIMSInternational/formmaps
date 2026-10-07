import { apiClient, apiRequest, actingSchoolFetchHeaders } from "@/lib/api/apiClient";

export type RecordLang = "es" | "en";

export type StudentRecordReportKey = "career_informe" | "pca_pca" | "pca_gd" | "pca_coaching";
export type StudentRecordAssessmentKey =
  | "lia" | "mil" | "personality" | "eval360" | "vocational360" | "pca" | "integrated" | "careerfit";
export type StudentRecordStatus = "not_started" | "in_progress" | "completed";

export interface StudentRecordReport {
  key: StudentRecordReportKey;
  title: string;
  available: boolean;
  reason: string | null;
  pcaCod?: string | null;
}

export interface StudentRecordSummaryItem {
  label: string;
  value: string | number;
}

export interface StudentRecordAssessment {
  key: StudentRecordAssessmentKey;
  title: string;
  status: StudentRecordStatus;
  completedAt: string | null;
  summary: StudentRecordSummaryItem[];
  answers: { available: boolean; reason: string | null; count: number };
}

export interface StudentRecord {
  student: { id: string; name: string; email: string; gradeLevel?: string | null; schoolName?: string | null };
  generatedAt: string;
  reports: StudentRecordReport[];
  assessments: StudentRecordAssessment[];
}

export interface AnswerRow {
  n: number | string;
  question: string;
  options: string[] | null;
  answer: string | null;
  correctAnswer: string | null;
  isCorrect: boolean | null;
  comment: string | null;
  meta: string | null;
}

export interface AnswerSection {
  title: string;
  subtitle: string | null;
  rows: AnswerRow[];
}

export interface AssessmentAnswers {
  key: StudentRecordAssessmentKey;
  title: string;
  completedAt: string | null;
  sections: AnswerSection[];
}

type Envelope<T> = { success?: boolean; data: T };

const base = (userId: string) => `/api/v1/student-record/${encodeURIComponent(userId)}`;

export async function getStudentRecord(userId: string, lang: RecordLang): Promise<StudentRecord> {
  const res = await apiRequest<Envelope<StudentRecord>>(`${base(userId)}?lang=${lang}`, { method: "GET" });
  return res.data;
}

export async function getAssessmentAnswers(
  userId: string,
  key: StudentRecordAssessmentKey,
  lang: RecordLang,
): Promise<AssessmentAnswers> {
  const res = await apiRequest<Envelope<AssessmentAnswers>>(
    `${base(userId)}/answers/${encodeURIComponent(key)}?lang=${lang}`,
    { method: "GET" },
  );
  return res.data;
}

/**
 * PDFs go through the same axios client as the other report downloads (careerInformeService, pcaImageService):
 * it adds the Bearer fallback and cookies. The acting-school header is also set explicitly so a Super Admin's
 * download always targets the school of the page it was started from.
 */
async function getPdfBlob(url: string): Promise<Blob> {
  const response = await apiClient.request<Blob>({
    url,
    method: "GET",
    responseType: "blob",
    headers: actingSchoolFetchHeaders(),
  });
  return response.data;
}

export function getAssessmentAnswersPdfBlob(userId: string, key: StudentRecordAssessmentKey, lang: RecordLang): Promise<Blob> {
  return getPdfBlob(`${base(userId)}/answers/${encodeURIComponent(key)}/pdf?lang=${lang}`);
}

export function getStudentRecordPdfBlob(userId: string, lang: RecordLang): Promise<Blob> {
  return getPdfBlob(`${base(userId)}/pdf?lang=${lang}`);
}

/** Save a Blob as a file in the browser. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
