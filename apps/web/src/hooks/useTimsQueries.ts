import { useQuery } from "@tanstack/react-query";
import { useGlobalStore } from "@/store/useGlobalStore";
import { usePCAData } from "@/hooks/usePCAData";
import { useMILData } from "@/hooks/useMILData";
import { scoreCareers } from "@/services/timsService";
import { ScoreCareersRequest } from "@/types/tims";

export const timsKeys = {
  all: ["tims"] as const,
  scores: (userId: string) => [...timsKeys.all, "scores", userId] as const,
  profile: (userId: string) => [...timsKeys.all, "profile", userId] as const,
};

/**
 * Hook to derive 360 profile (interests & motivators) from backend.
 * Falls back to localStorage if backend call fails.
 */
export function useDerived360Profile() {
  const { user } = useGlobalStore();
  const userId = user?.id;

  return useQuery({
    queryKey: timsKeys.profile(userId || ""),
    queryFn: async () => {
      if (!userId) throw new Error("User not found");

      // Call the backend to aggregate all 360° feedback and derive profile
      try {
        const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
        const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "";
        const resp = await fetch(`${API_BASE}/api/v1/assessment/derive-profile/${userId}`, {
          headers: {
            "Content-Type": "application/json",
            ...(token && { Authorization: `Bearer ${token}` }),
          },
        });

        if (resp.ok) {
          const json = await resp.json();
          const data = json.data || json;

          if (data.derivedInterests?.length > 0 || data.derivedMotivators?.length > 0) {
            // Cache for offline use
            localStorage.setItem(
              `tims_profile_${userId}`,
              JSON.stringify({
                derivedInterests: data.derivedInterests,
                derivedMotivators: data.derivedMotivators,
                interestScores: data.interestScores,
                motivatorScores: data.motivatorScores,
                derivedAt: new Date().toISOString(),
              })
            );

            return {
              derivedInterests: data.derivedInterests || [],
              derivedMotivators: data.derivedMotivators || [],
              interestScores: data.interestScores || {},
              motivatorScores: data.motivatorScores || {},
            };
          }
        }
      } catch {
        // API failed, try cache
      }

      // Fallback: localStorage cache from previous derivation
      const cached = localStorage.getItem(`tims_profile_${userId}`);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          return {
            derivedInterests: parsed.derivedInterests || [],
            derivedMotivators: parsed.derivedMotivators || [],
            interestScores: parsed.interestScores || {},
            motivatorScores: parsed.motivatorScores || {},
          };
        } catch { /* ignore */ }
      }

      return {
        derivedInterests: [] as string[],
        derivedMotivators: [] as string[],
        interestScores: {} as Record<string, number>,
        motivatorScores: {} as Record<string, number>,
      };
    },
    enabled: !!userId,
    staleTime: 30 * 60 * 1000,
    retry: 1,
  });
}

/**
 * Main hook for TIMS career scoring.
 * Combines DISC (PCA), MIL, and 360-derived interests/motivators.
 */
export function useTimsCareerScoring() {
  const { user } = useGlobalStore();
  const { pcaData, isCompleted: isPCACompleted } = usePCAData();
  const { getSubtestScores, isCompleted: isMILCompleted } = useMILData();
  const { data: profileData } = useDerived360Profile();

  const userId = user?.id;
  const isEnabled = !!userId && isPCACompleted && isMILCompleted;

  const query = useQuery({
    queryKey: timsKeys.scores(userId || ""),
    queryFn: async () => {
      if (!userId) throw new Error("User not found");

      // 1. DISC scores from PCA — send raw percentages for graduated scoring
      const discScores = {
        d: pcaData?.results?.data?.pcaD1 || 0,
        i: pcaData?.results?.data?.pcaI1 || 0,
        s: pcaData?.results?.data?.pcaS1 || 0,
        c: pcaData?.results?.data?.pcaC1 || 0,
      };

      // 2. MIL scores from completed exams (empty if none)
      const milSubtests = getSubtestScores();
      const milScores = milSubtests.map((sub) => ({
        subtestName: sub.name,
        score: sub.score,
      }));

      // 3. Interests & Motivators from 360 profile (derived via backend)
      const interests = profileData?.derivedInterests || [];
      const motivators = profileData?.derivedMotivators || [];

      const request: ScoreCareersRequest = {
        userId,
        discScores,
        milScores,
        interests,
        motivators,
      };

      return scoreCareers(request);
    },
    enabled: isEnabled,
    staleTime: 60 * 60 * 1000, // 1 hour — backend caches permanently in UserCareerProfile
    gcTime: 2 * 60 * 60 * 1000, // 2 hours
    retry: false, // Don't retry — endpoint may not exist yet
  });

  return {
    ...query,
    isPCACompleted,
    isMILCompleted,
    hasAssessments: isPCACompleted || isMILCompleted,
  };
}
