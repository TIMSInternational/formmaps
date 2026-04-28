import { apiRequest } from "@/lib/api/apiClient";
import { ScoreCareersRequest, ScoreCareersResponse } from "@/types/tims";

/**
 * Scores and ranks careers based on the user's assessment profile.
 */
export async function scoreCareers(request: ScoreCareersRequest): Promise<ScoreCareersResponse> {
  return apiRequest<ScoreCareersResponse>("api/v1/careers/score", {
    method: "POST",
    data: request,
  });
}

/**
 * Derive interests and motivators from 360 assessment answers.
 * Calls POST /api/v1/assessment/derive-profile.
 */
export async function deriveProfile(
  userId: string,
  answers: Record<string, number>
): Promise<{
  derivedInterests: string[];
  derivedMotivators: string[];
  interestScores: Record<string, number>;
  motivatorScores: Record<string, number>;
}> {
  const response = await apiRequest<any>("api/v1/assessment/derive-profile", {
    method: "POST",
    data: { userId, answers },
  });
  const data = response.data || response;
  return {
    derivedInterests: data.derivedInterests || [],
    derivedMotivators: data.derivedMotivators || [],
    interestScores: data.interestScores || {},
    motivatorScores: data.motivatorScores || {},
  };
}
