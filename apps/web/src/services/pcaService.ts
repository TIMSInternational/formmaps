// PCA Assessment Service — All calls go through backend proxy (no external API keys in frontend)

import { apiRequest } from "@/lib/api/apiClient";

export interface PCAAssessmentRequest {
  PerNom: string;
  PerApe: string;
  PerNumIde: string;
  PerGen: "M" | "F";
  permail: string;
  JcaCod?: string;
  BillingCenter?: string;
  UserMail: string;
}

export interface PCAAssessmentResponse {
  success: boolean;
  data?: any;
  message?: string;
  assessmentUrl?: string;
  pcaCod?: string;
}

// ===== All calls go through backend proxy at /api/pcaapi/* =====

/**
 * Get PCA Result by userId (via backend proxy — backend resolves PcaCod internally)
 */
export async function getPCAResult(userId: string): Promise<any> {
  try {
    const res = await apiRequest("/api/pcaapi/get-result", {
      method: "POST",
      data: { UserId: userId },
    });
    return res?.data || res;
  } catch (err: any) {
    if (err?.status === 401 || err?.status === 403) return null;
    throw err;
  }
}

/**
 * Get PCA Competences by userId (via backend proxy)
 */
export async function getPCACompetences(
  userId: string,
  cmpTims: "1" | "0" = "1"
): Promise<any> {
  try {
    const res = await apiRequest("/api/pcaapi/get-competences", {
      method: "POST",
      data: { UserId: userId, CmpTims: cmpTims },
    });
    return res?.data || res;
  } catch (err: any) {
    if (err?.status === 401 || err?.status === 403) return null;
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
): Promise<any> {
  try {
    const res = await apiRequest("/api/pcaapi/get-pca-vs-jca", {
      method: "POST",
      data: { UserId: userId, JcaCodExt: jcaCodExt, AnlsTip: anlsTip },
    });
    return res?.data || res;
  } catch (err: any) {
    if (err?.status === 401 || err?.status === 403) return null;
    throw err;
  }
}

/**
 * Get PCA Result by UserId (Backend API)
 */
export async function getPCAResultByUserId(
  userId: string,
  language: "english" | "spanish" = "english"
): Promise<any> {
  const langParam = language === "spanish" ? "sp" : "en";
  try {
    return await apiRequest(`/api/pcaapi/get-result?lang=${langParam}`, {
      method: "POST",
      data: { UserId: userId },
    });
  } catch (err: any) {
    if (err?.status === 401 || err?.status === 403) return null;
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
): Promise<any> {
  const langParam = language === "spanish" ? "sp" : "en";
  try {
    return await apiRequest(`/api/pcaapi/get-competences?lang=${langParam}`, {
      method: "POST",
      data: { UserId: userId, CmpTims: cmpTims },
    });
  } catch (err: any) {
    if (err?.status === 401 || err?.status === 403) return null;
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
    const coKey = language === "spanish" ? "NXDAPS" : "NXDAPI";

    const result = await apiRequest(`/api/pcaapi/add-evaluation?lang=${langParam}`, {
      method: "POST",
      data: {
        UserId: userId,
        CoKey: coKey,
        Permail: userData.permail || userData.UserMail || "",
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
): Promise<any> {
  const langParam = language === "spanish" ? "sp" : "en";
  try {
    return await apiRequest(`/api/pcaapi/evaluations?lang=${langParam}`, {
      method: "GET",
    });
  } catch (err: any) {
    if (err?.status === 401 || err?.status === 403) return null;
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
    const userEvaluation = allEvaluations?.data?.find(
      (evaluation: any) => evaluation.userId === userId
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
              pcaCod: parsed.pcaCod || userEvaluation.pcaCod,
              hasResults: true,
              lastActivity: parsed.lastUpdated || userEvaluation.createdAt || new Date().toISOString(),
            };
          }
        }
      } catch { /* ignore parse errors */ }
    }

    // Try fetching results from TIMS API
    try {
      const result = await getPCAResultByUserId(userId, language);
      if (result?.data && (result.data.pcaCod || result.data.pcaD1 != null)) {
        return {
          status: "completed",
          pcaCod: userEvaluation.pcaCod,
          hasResults: true,
          lastActivity: userEvaluation.createdAt || new Date().toISOString(),
        };
      }
    } catch {
      // TIMS API failed — fall through to in_progress
    }

    return {
      status: "in_progress",
      pcaCod: userEvaluation.pcaCod,
      hasResults: false,
      lastActivity: userEvaluation.createdAt || new Date().toISOString(),
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
