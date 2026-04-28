// PCA Assessment Service — All calls go through backend proxy (no external API keys in frontend)

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

// Backend API Configuration
const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "https://careerproject-eucbddf3h4h0ekfx.canadacentral-01.azurewebsites.net";

// Helper to get auth headers for backend API calls
const getBackendHeaders = () => {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  return {
    "Content-Type": "application/json",
    ...(token && { Authorization: `Bearer ${token}` }),
  };
};

// ===== All calls go through backend proxy at /api/pcaapi/* =====

/**
 * Get PCA Result by userId (via backend proxy — backend resolves PcaCod internally)
 */
export async function getPCAResult(userId: string): Promise<any> {
  const response = await fetch(
    `${API_BASE_URL}/api/pcaapi/get-result`,
    {
      method: "POST",
      headers: getBackendHeaders(),
      body: JSON.stringify({ UserId: userId }),
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to get PCA result: ${response.status}`);
  }

  const json = await response.json();
  return json.data || json;
}

/**
 * Get PCA Competences by userId (via backend proxy)
 */
export async function getPCACompetences(
  userId: string,
  cmpTims: "1" | "0" = "1"
): Promise<any> {
  const response = await fetch(
    `${API_BASE_URL}/api/pcaapi/get-competences`,
    {
      method: "POST",
      headers: getBackendHeaders(),
      body: JSON.stringify({ UserId: userId, CmpTims: cmpTims }),
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to get PCA competences: ${response.status}`);
  }

  const json = await response.json();
  return json.data || json;
}

/**
 * Get PCA vs JCA Analysis / Gap Analysis (via backend proxy)
 */
export async function getPCAVsJCAAnalysis(
  userId: string,
  jcaCodExt: string,
  anlsTip: string = "g"
): Promise<any> {
  const response = await fetch(
    `${API_BASE_URL}/api/pcaapi/get-pca-vs-jca`,
    {
      method: "POST",
      headers: getBackendHeaders(),
      body: JSON.stringify({
        UserId: userId,
        JcaCodExt: jcaCodExt,
        AnlsTip: anlsTip,
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to get PCA vs JCA analysis: ${response.status}`);
  }

  const json = await response.json();
  return json.data || json;
}

// ===== Backend API Functions (already proxied) =====

/**
 * Get PCA Result by UserId (Backend API)
 */
export async function getPCAResultByUserId(
  userId: string,
  language: "english" | "spanish" = "english"
): Promise<any> {
  const langParam = language === "spanish" ? "sp" : "en";
  const response = await fetch(
    `${API_BASE_URL}/api/pcaapi/get-result?lang=${langParam}`,
    {
      method: "POST",
      headers: getBackendHeaders(),
      body: JSON.stringify({ UserId: userId }),
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to get PCA result: ${response.status}`);
  }

  return await response.json();
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
  const response = await fetch(
    `${API_BASE_URL}/api/pcaapi/get-competences?lang=${langParam}`,
    {
      method: "POST",
      headers: getBackendHeaders(),
      body: JSON.stringify({ UserId: userId, CmpTims: cmpTims }),
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to get PCA competences: ${response.status}`);
  }

  return await response.json();
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

    // CoKey determines the assessment language: NXDAPS=Spanish, NXDAPI=English
    const coKey = language === "spanish" ? "NXDAPS" : "NXDAPI";

    const response = await fetch(
      `${API_BASE_URL}/api/pcaapi/add-evaluation?lang=${langParam}`,
      {
        method: "POST",
        headers: getBackendHeaders(),
        body: JSON.stringify({
          UserId: userId,
          CoKey: coKey,
          Permail: userData.permail || userData.UserMail || "",
          ...userData,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to add PCA evaluation: ${response.status}`);
    }

    const result = await response.json();

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
  const response = await fetch(
    `${API_BASE_URL}/api/pcaapi/evaluations?lang=${langParam}`,
    {
      method: "GET",
      headers: getBackendHeaders(),
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to get PCA evaluations: ${response.status}`);
  }

  return await response.json();
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
    const userEvaluation = allEvaluations.data.find(
      (evaluation: any) => evaluation.userId === userId
    );

    if (!userEvaluation) {
      return { status: "not_started" };
    }

    // Check if we've recently tried and failed to get results (avoid 400 spam)
    const cacheKey = `pca_result_checked_${userId}`;
    const lastCheck = typeof window !== "undefined" ? sessionStorage.getItem(cacheKey) : null;
    const now = Date.now();

    // Only try fetching results if we haven't checked in the last 30 seconds
    if (!lastCheck || now - parseInt(lastCheck) > 30000) {
      try {
        const result = await getPCAResultByUserId(userId, language);
        if (result?.data && (result.data.pcaCod || result.data.pcaD1 != null)) {
          if (typeof window !== "undefined") sessionStorage.removeItem(cacheKey);
          return {
            status: "completed",
            pcaCod: userEvaluation.pcaCod,
            hasResults: true,
            lastActivity: userEvaluation.createdAt || new Date().toISOString(),
          };
        }
      } catch {
        // No results yet — cache the failed attempt
      }
      if (typeof window !== "undefined") sessionStorage.setItem(cacheKey, String(now));
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
