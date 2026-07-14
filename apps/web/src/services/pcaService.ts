// PCA Assessment Service — All calls go through backend proxy (no external API keys in frontend)

import { apiRequest } from "@/lib/api/apiClient";
import type { LockdownViolation } from "@/components/proctoring/types";

/**
 * Flush proctoring violations for an authed PCA exam session. Best-effort —
 * never throws into the exam flow. Requires a PCAExamSession id (the internal
 * PCA exam-engine runner; the external TIMS survey iframe has no such id).
 */
export async function savePCAViolations(
  sessionId: string,
  violations: LockdownViolation[]
): Promise<void> {
  if (!violations.length) return;
  try {
    await apiRequest(`/api/pcaexam/session/${sessionId}/violations`, {
      method: "POST",
      data: { violations },
    });
  } catch {
    /* best-effort: proctoring must never break the exam */
  }
}

export interface PCAAssessmentRequest {
  PerNom: string;
  PerApe: string;
  PerNumIde: string;
  PerGen: "M" | "F";
  PerMail: string;
  JcaCod?: string;
  BillingCenter?: string;
}

export interface PCAAssessmentResponse {
  success: boolean;
  data?: Record<string, unknown>;
  message?: string;
  assessmentUrl?: string;
  pcaCod?: string;
}

interface ApiError extends Error {
  status?: number;
}

// ===== All calls go through backend proxy at /api/pcaapi/* =====

/**
 * Get PCA Result by userId (via backend proxy — backend resolves PcaCod internally)
 */
export async function getPCAResult(userId: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await apiRequest<Record<string, unknown>>("/api/pcaapi/get-result", {
      method: "POST",
      data: { UserId: userId },
    });
    return (res?.data || res) as Record<string, unknown>;
  } catch (err: unknown) {
    const apiErr = err as ApiError;
    if (apiErr?.status === 401 || apiErr?.status === 403) return null;
    throw err;
  }
}

/**
 * Get PCA Competences by userId (via backend proxy)
 */
export async function getPCACompetences(
  userId: string,
  cmpTims: "1" | "0" = "1"
): Promise<Record<string, unknown> | null> {
  try {
    const res = await apiRequest<Record<string, unknown>>("/api/pcaapi/get-competences", {
      method: "POST",
      data: { UserId: userId, CmpTims: cmpTims },
    });
    return (res?.data || res) as Record<string, unknown>;
  } catch (err: unknown) {
    const apiErr = err as ApiError;
    if (apiErr?.status === 401 || apiErr?.status === 403) return null;
    throw err;
  }
}

/**
 * Get PCA vs JCA Analysis / Gap Analysis (via backend proxy)
 */
export async function getPCAVsJCAAnalysis(
  userId: string,
  jcaCodExt: string,
  anlsTip: string = "g"
): Promise<Record<string, unknown> | null> {
  try {
    const res = await apiRequest<Record<string, unknown>>("/api/pcaapi/get-pca-vs-jca", {
      method: "POST",
      data: { UserId: userId, JcaCodExt: jcaCodExt, AnlsTip: anlsTip },
    });
    return (res?.data || res) as Record<string, unknown>;
  } catch (err: unknown) {
    const apiErr = err as ApiError;
    if (apiErr?.status === 401 || apiErr?.status === 403) return null;
    throw err;
  }
}

/**
 * Get PCA Result by UserId (Backend API)
 */
export async function getPCAResultByUserId(
  userId: string,
  language: "english" | "spanish" = "english"
): Promise<Record<string, unknown> | null> {
  const langParam = language === "spanish" ? "sp" : "en";
  try {
    return await apiRequest<Record<string, unknown>>(`/api/pcaapi/get-result?lang=${langParam}`, {
      method: "POST",
      data: { UserId: userId },
    });
  } catch (err: unknown) {
    const apiErr = err as ApiError;
    if (apiErr?.status === 401 || apiErr?.status === 403) return null;
    throw err;
  }
}

/**
 * Get PCA Competences by UserId (Backend API)
 */
export async function getPCACompetencesByUserId(
  userId: string,
  cmpTims: "1" | "0" = "1",
  language: "english" | "spanish" = "english"
): Promise<Record<string, unknown> | null> {
  const langParam = language === "spanish" ? "sp" : "en";
  try {
    return await apiRequest<Record<string, unknown>>(`/api/pcaapi/get-competences?lang=${langParam}`, {
      method: "POST",
      data: { UserId: userId, CmpTims: cmpTims },
    });
  } catch (err: unknown) {
    const apiErr = err as ApiError;
    if (apiErr?.status === 401 || apiErr?.status === 403) return null;
    throw err;
  }
}

/**
 * Add PCA Evaluation (Backend API)
 */
export async function addPCAEvaluation(
  userId: string,
  userData: Omit<PCAAssessmentRequest, never>,
  language: "spanish" | "english" = "spanish"
): Promise<PCAAssessmentResponse> {
  try {
    const langParam = language === "spanish" ? "sp" : "en";

    // NOTE: do not send CoRegCod here — the backend derives the TIMS region/language
    // from the ?lang= query param (sp -> es-co, en -> en) as the single source of truth.
    const result = await apiRequest(`/api/pcaapi/add-evaluation?lang=${langParam}`, {
      method: "POST",
      data: {
        UserId: userId,
        PcaTip: "A",
        ...userData,
      },
    });

    if (result.success && result.data) {
      const surveyLink = result.data.surveyLink?.trim().replace(/`/g, "") || "";
      return {
        success: true,
        data: result.data,
        assessmentUrl: surveyLink,
        pcaCod: result.data.PcaCod || result.data.pcaCod,
        message: "PCA evaluation created successfully",
      };
    } else {
      return {
        success: false,
        message: result.message || "Failed to add PCA evaluation",
      };
    }
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error ? error.message : "Failed to add PCA evaluation",
    };
  }
}

/**
 * Get All PCA Evaluations (Backend API)
 */
export async function getAllPCAEvaluations(
  language: "english" | "spanish" = "english"
): Promise<Record<string, unknown> | null> {
  const langParam = language === "spanish" ? "sp" : "en";
  try {
    return await apiRequest<Record<string, unknown>>(`/api/pcaapi/evaluations?lang=${langParam}`, {
      method: "GET",
    });
  } catch (err: unknown) {
    const apiErr = err as ApiError;
    if (apiErr?.status === 401 || apiErr?.status === 403) return null;
    throw err;
  }
}

/**
 * Check PCA Status by UserId
 */
export async function checkPCAStatus(
  userId: string,
  language: "english" | "spanish" = "english"
): Promise<{
  status: "not_started" | "in_progress" | "completed";
  pcaCod?: string;
  hasResults?: boolean;
  lastActivity?: string;
}> {
  try {
    const allEvaluations = await getAllPCAEvaluations(language);
    const evaluationData = allEvaluations?.data as Array<Record<string, unknown>> | undefined;
    const userEvaluation = evaluationData?.find(
      (evaluation: Record<string, unknown>) => evaluation.userId === userId
    );

    if (!userEvaluation) {
      return { status: "not_started" };
    }

    // Check localStorage cache first (maintained by usePCAData hook)
    if (typeof window !== "undefined") {
      try {
        const cached = localStorage.getItem(`pcaData_${userId}`);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed.isCompleted) {
            return {
              status: "completed",
              pcaCod: (parsed.pcaCod || userEvaluation.pcaCod) as string | undefined,
              hasResults: true,
              lastActivity: (parsed.lastUpdated || userEvaluation.createdAt || new Date().toISOString()) as string,
            };
          }
        }
      } catch { /* ignore parse errors */ }
    }

    // Try fetching results from TIMS API
    try {
      const result = await getPCAResultByUserId(userId, language);
      const resultData = result?.data as Record<string, unknown> | undefined;
      if (resultData && (resultData.pcaCod || resultData.pcaD1 != null)) {
        return {
          status: "completed",
          pcaCod: userEvaluation.pcaCod as string | undefined,
          hasResults: true,
          lastActivity: (userEvaluation.createdAt as string) || new Date().toISOString(),
        };
      }
    } catch {
      // TIMS API failed — fall through to in_progress
    }

    return {
      status: "in_progress",
      pcaCod: userEvaluation.pcaCod as string | undefined,
      hasResults: false,
      lastActivity: (userEvaluation.createdAt as string) || new Date().toISOString(),
    };
  } catch {
    return { status: "not_started" };
  }
}

/**
 * Available JCA Codes for Gap Analysis
 */
export const JCA_CODES = {
  GTCML: "Gerente Comercial",
  ASCML: "Asesor Comercial",
  GEFCR: "Gerente Financiero",
} as const;

export const JCA_CODES_ENGLISH = {
  GTCML: "Commercial Manager",
  ASCML: "Commercial Advisor",
  GEFCR: "Financial Manager",
} as const;

export type JCACode = keyof typeof JCA_CODES;
