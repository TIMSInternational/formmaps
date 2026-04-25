// PCA Assessment Service for Nexa Developments API

export interface PCAAssessmentRequest {
  CoKey: string;
  PerNom: string;
  PerApe: string;
  PerNumIde: string;
  PerGen: "M" | "F";
  permail: string;
  JcaCod?: string;
  BillingCenter?: string;
  UserMail: string;
}

export interface PCAAuthRequest {
  CoKey: string;
}

export interface PCAResultRequest {
  CoKey: string;
  PcaCod: string;
}

export interface PCACompetencesRequest {
  CoKey: string;
  PcaCod: string;
  CmpTims: string; // "1" for tims, "0" for Org
}

export interface PCAVsJCARequest {
  CoKey: string;
  PcaCod: string;
  JcaCodExt: string;
  AnlsTip: string;
}

export interface PCAAssessmentResponse {
  success: boolean;
  data?: any;
  message?: string;
  assessmentUrl?: string;
  pcaCod?: string;
}

export interface PCAAPIResponse {
  PcaCod: string;
  PcaLink: string;
}

// Nexa Developments API Configuration
const NEXA_API_BASE_URL = "https://timshr.com/core/api";
const NEXA_COKEY = "REDACTED_PCA_COKEY"; // Nexa Developments CoKey

// Backend API Configuration
const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "https://careerproject-eucbddf3h4h0ekfx.canadacentral-01.azurewebsites.net";

/**
 * Authenticate with Nexa Developments API
 */
export async function authenticateNexaAPI(): Promise<any> {
  try {
    const response = await fetch(`${NEXA_API_BASE_URL}/login/authenticate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        CoKey: NEXA_COKEY,
      }),
    });

    if (!response.ok) {
      throw new Error(`Authentication failed: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error("Nexa API Authentication Error:", error);
    throw error;
  }
}

/**
 * Add PCA Assessment (Spanish)
 */
export async function addPCAAssessmentSpanish(
  userData: Omit<PCAAssessmentRequest, "CoKey">
): Promise<PCAAssessmentResponse> {
  try {
    const response = await fetch(`${NEXA_API_BASE_URL}/surveys/add`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        CoKey: "NXDAPS", // Spanish PCA format
        ...userData,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to add PCA assessment: ${response.status}`);
    }

    const data: PCAAPIResponse = await response.json();
    return {
      success: true,
      data,
      assessmentUrl: data.PcaLink,
      pcaCod: data.PcaCod,
    };
  } catch (error) {
    console.error("Add PCA Assessment Error:", error);
    return {
      success: false,
      message:
        error instanceof Error ? error.message : "Failed to add PCA assessment",
    };
  }
}

/**
 * Add PCA Assessment (English)
 */
export async function addPCAAssessmentEnglish(
  userData: Omit<PCAAssessmentRequest, "CoKey">
): Promise<PCAAssessmentResponse> {
  try {
    const response = await fetch(`${NEXA_API_BASE_URL}/surveys/add`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        CoKey: "NXDAPI", // English PCA format
        ...userData,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to add PCA assessment: ${response.status}`);
    }

    const data: PCAAPIResponse = await response.json();
    return {
      success: true,
      data,
      assessmentUrl: data.PcaLink,
      pcaCod: data.PcaCod,
    };
  } catch (error) {
    console.error("Add PCA Assessment Error:", error);
    return {
      success: false,
      message:
        error instanceof Error ? error.message : "Failed to add PCA assessment",
    };
  }
}

/**
 * Get PCA Result
 */
export async function getPCAResult(pcaCod: string): Promise<any> {
  try {
    const response = await fetch(`${NEXA_API_BASE_URL}/Pca/GetPcaResult`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        CoKey: NEXA_COKEY,
        PcaCod: pcaCod,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to get PCA result: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error("Get PCA Result Error:", error);
    throw error;
  }
}

/**
 * Get PCA Competences
 */
export async function getPCACompetences(
  pcaCod: string,
  cmpTims: "1" | "0" = "1"
): Promise<any> {
  try {
    const response = await fetch(
      `${NEXA_API_BASE_URL}/Pca/GetCompetencesResult`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          CoKey: NEXA_COKEY,
          PcaCod: pcaCod,
          CmpTims: cmpTims,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to get PCA competences: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error("Get PCA Competences Error:", error);
    throw error;
  }
}

/**
 * Get PCA vs JCA Analysis (Gap Analysis)
 */
export async function getPCAVsJCAAnalysis(
  pcaCod: string,
  jcaCodExt: string,
  anlsTip: string = "g"
): Promise<any> {
  try {
    const response = await fetch(`${NEXA_API_BASE_URL}/Pca/GetPcaVsJcaResult`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        CoKey: NEXA_COKEY,
        PcaCod: pcaCod,
        JcaCodExt: jcaCodExt,
        AnlsTip: anlsTip,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to get PCA vs JCA analysis: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error("Get PCA vs JCA Analysis Error:", error);
    throw error;
  }
}

// ===== Backend API Functions =====

/**
 * Get PCA Result by UserId (Backend API)
 */
export async function getPCAResultByUserId(
  userId: string,
  language: "english" | "spanish" = "english"
): Promise<any> {
  try {
    const langParam = language === "spanish" ? "sp" : "en";
    const response = await fetch(
      `${API_BASE_URL}/api/pcaapi/get-result?lang=${langParam}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          UserId: userId,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to get PCA result: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error("Get PCA Result by UserId Error:", error);
    throw error;
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
  try {
    const langParam = language === "spanish" ? "sp" : "en";
    const response = await fetch(
      `${API_BASE_URL}/api/pcaapi/get-competences?lang=${langParam}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          UserId: userId,
          CmpTims: cmpTims,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to get PCA competences: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error("Get PCA Competences by UserId Error:", error);
    throw error;
  }
}

/**
 * Add PCA Evaluation (Backend API)
 */
export async function addPCAEvaluation(
  userId: string,
  userData: Omit<PCAAssessmentRequest, "CoKey">,
  language: "spanish" | "english" = "spanish"
): Promise<PCAAssessmentResponse> {
  try {
    const coKey = language === "spanish" ? "NXDAPS" : "NXDAPI";
    const langParam = language === "spanish" ? "sp" : "en";

    const response = await fetch(
      `${API_BASE_URL}/api/pcaapi/add-evaluation?lang=${langParam}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          UserId: userId,
          CoKey: coKey,
          ...userData,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to add PCA evaluation: ${response.status}`);
    }

    const result = await response.json();

    if (result.success && result.data) {
      // Extract surveyLink from the response data
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
    console.error("Add PCA Evaluation Error:", error);
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
  try {
    const langParam = language === "spanish" ? "sp" : "en";
    const response = await fetch(
      `${API_BASE_URL}/api/pcaapi/evaluations?lang=${langParam}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to get PCA evaluations: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error("Get All PCA Evaluations Error:", error);
    throw error;
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
    // First, check if user has any PCA evaluations
    const allEvaluations = await getAllPCAEvaluations(language);
    console.log("All PCA Evaluations:", allEvaluations);
    console.log("User ID:", userId);
    const userEvaluation = allEvaluations.data.find(
      (evaluation: any) => evaluation.userId === userId
    );
    console.log("User Evaluation:", userEvaluation);

    if (!userEvaluation) {
      return { status: "not_started" };
    }

    // User has a PCA evaluation, check if they have results
    try {
      const result = await getPCAResultByUserId(userId, language);
      if (result && Object.keys(result).length > 0) {
        return {
          status: "completed",
          pcaCod: userEvaluation.pcaCod,
          hasResults: true,
          lastActivity: userEvaluation.createdAt || new Date().toISOString(),
        };
      }
    } catch (error) {
      // No results yet, but evaluation exists
      console.log("PCA evaluation exists but no results yet:", error);
    }

    return {
      status: "in_progress",
      pcaCod: userEvaluation.pcaCod,
      hasResults: false,
      lastActivity: userEvaluation.createdAt || new Date().toISOString(),
    };
  } catch (error) {
    console.error("Check PCA Status Error:", error);
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
