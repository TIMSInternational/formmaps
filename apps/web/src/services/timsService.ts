import { apiRequest } from "@/lib/api/apiClient";
import { ScoreCareersRequest, ScoreCareersResponse } from "@/types/tims";

/**
 * Scores and ranks careers based on the user's assessment profile.
 * 
 * @param request The user's assessment scores (DISC, MIL) and derived interests/motivators
 * @returns A ranked list of careers with detailed fit breakdowns and bridging info
 */
export async function scoreCareers(request: ScoreCareersRequest): Promise<ScoreCareersResponse> {
  return apiRequest<ScoreCareersResponse>("api/v1/careers/score", {
    method: "POST",
    data: request,
  });
}

// Placeholder for future deriveProfile implementation
/*
export async function deriveProfile(request: DeriveProfileRequest) {
  // TODO: Implement when backend logic is ready or user enables this flow
}
*/
