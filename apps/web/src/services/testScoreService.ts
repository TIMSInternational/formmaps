import { apiRequest } from "@/lib/api/apiClient";

export interface TestScore {
  id: string;
  testType: string;
  testDate: string | null;
  satTotal: number | null;
  satMath: number | null;
  satReading: number | null;
  actComposite: number | null;
  actEnglish: number | null;
  actMath: number | null;
  actReading: number | null;
  actScience: number | null;
  apSubject: string | null;
  apScore: number | null;
  totalScore: number | null;
  subScores: Record<string, unknown> | null;
  isSuperScore: boolean;
  isOfficial: boolean;
  createdDate: string;
}

export interface SuperScore {
  sat: { math: number; reading: number; total: number } | null;
  act: { english: number; math: number; reading: number; science: number; composite: number } | null;
}

export async function listTestScores(testType?: string): Promise<TestScore[]> {
  const params = testType ? `?testType=${testType}` : "";
  const res = await apiRequest(`/api/v1/test-scores${params}`, { method: "GET" });
  return res?.data ?? res ?? [];
}

export async function addTestScore(data: Partial<TestScore>): Promise<TestScore> {
  const res = await apiRequest("/api/v1/test-scores", { method: "POST", data });
  return res?.data ?? res;
}

export async function updateTestScore(id: string, data: Partial<TestScore>): Promise<TestScore> {
  const res = await apiRequest(`/api/v1/test-scores/${id}`, { method: "PUT", data });
  return res?.data ?? res;
}

export async function deleteTestScore(id: string): Promise<void> {
  await apiRequest(`/api/v1/test-scores/${id}`, { method: "DELETE" });
}

export async function getSuperScore(): Promise<SuperScore> {
  const res = await apiRequest("/api/v1/test-scores/superscore", { method: "GET" });
  return res?.data ?? res;
}

export async function getStudentTestScores(studentId: string): Promise<TestScore[]> {
  const res = await apiRequest(`/api/v1/test-scores/students/${studentId}/test-scores`, { method: "GET" });
  return res?.data ?? res ?? [];
}
