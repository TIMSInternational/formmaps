const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "";

/** Questionnaire language. Spanish is the source; the API falls back to it per field when English is missing. */
export type VocationalLang = "es" | "en";

/** `label` is resolved server-side for the requested language; labelEs/labelEn are the stored sources. */
export interface VocationalOption { value: string; labelEs: string; labelEn?: string | null; label?: string }
export interface VocationalQuestionItem {
  number: number; block: string;
  type: "likert" | "ranking" | "multi_select" | "single_select" | "open";
  area: string | null; dimensionKey: string | null;
  /** text and scaleAnchors are already in the requested language. */
  scaleAnchors: string[] | null; options: VocationalOption[] | null; text: string;
}
export interface VocationalForm {
  completed?: boolean; group?: string; instrumentVersion?: string | null;
  evaluatorName?: string; studentName?: string | null; lang?: VocationalLang; questions: VocationalQuestionItem[];
}
export type VocationalSubmitAnswer =
  | { questionNumber: number; type: "likert"; ratingValue: number }
  | { questionNumber: number; type: "ranking"; rankingOrder: { value: string; rank: number }[] }
  | { questionNumber: number; type: "multi_select"; selectedValues: string[] }
  | { questionNumber: number; type: "single_select"; textValue: string }
  | { questionNumber: number; type: "open"; textValue: string };

async function unwrap(res: Response) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.success === false) {
    const err = new Error(body?.message || `Request failed (${res.status})`) as Error & { reason?: string };
    err.reason = body?.reason;
    throw err;
  }
  return body?.data ?? body;
}

export async function getVocationalForm(token: string, lang?: VocationalLang): Promise<VocationalForm> {
  const query = lang ? `?lang=${lang}` : "";
  const res = await fetch(`${API_BASE_URL}/evaluation/vocational/${encodeURIComponent(token)}${query}`, {
    method: "GET", headers: { "Content-Type": "application/json" },
  });
  const data = await unwrap(res);
  return { questions: [], ...data };
}

export async function submitVocationalAnswers(token: string, answers: VocationalSubmitAnswer[]): Promise<{ ok: boolean; count: number }> {
  const res = await fetch(`${API_BASE_URL}/evaluation/vocational/submit`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, answers }),
  });
  return unwrap(res);
}
