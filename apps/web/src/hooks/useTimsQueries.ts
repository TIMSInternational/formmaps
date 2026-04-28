import { useQuery } from "@tanstack/react-query";
import { useGlobalStore } from "@/store/useGlobalStore";
import { usePCAData } from "@/hooks/usePCAData";
import { useMILData } from "@/hooks/useMILData";
import { scoreCareers, deriveProfile } from "@/services/timsService";
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

      // Try to load 360 answers from localStorage (saved after completing 360 assessment)
      const storedAnswers = localStorage.getItem(`tims_360_answers_${userId}`);

      if (storedAnswers) {
        try {
          const answers = JSON.parse(storedAnswers) as Record<string, number>;
          const result = await deriveProfile(userId, answers);

          // Cache the derived profile in localStorage for offline use
          localStorage.setItem(
            `tims_profile_${userId}`,
            JSON.stringify({
              derivedInterests: result.derivedInterests,
              derivedMotivators: result.derivedMotivators,
              interestScores: result.interestScores,
              motivatorScores: result.motivatorScores,
              derivedAt: new Date().toISOString(),
            })
          );

          return result;
        } catch {
          // Fall through to localStorage cache
        }
      }

      // Fallback: try localStorage cache from previous derivation
      const cached = localStorage.getItem(`tims_profile_${userId}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        return {
          derivedInterests: parsed.derivedInterests || [],
          derivedMotivators: parsed.derivedMotivators || [],
          interestScores: parsed.interestScores || {},
          motivatorScores: parsed.motivatorScores || {},
        };
      }

      return {
        derivedInterests: [] as string[],
        derivedMotivators: [] as string[],
        interestScores: {} as Record<string, number>,
        motivatorScores: {} as Record<string, number>,
      };
    },
    enabled: !!userId,
    staleTime: 30 * 60 * 1000, // 30 minutes — profile doesn't change often
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
  const isEnabled = !!userId;

  const query = useQuery({
    queryKey: timsKeys.scores(userId || ""),
    queryFn: async () => {
      if (!userId) throw new Error("User not found");

      // 1. DISC scores from PCA (zeros if not yet completed)
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
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });

  return {
    ...query,
    isPCACompleted,
    isMILCompleted,
    hasAssessments: isPCACompleted || isMILCompleted,
  };
}
