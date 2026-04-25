import { useQuery } from "@tanstack/react-query";
import { useGlobalStore } from "@/store/useGlobalStore";
import { usePCAData } from "@/hooks/usePCAData";
import { useMILData } from "@/hooks/useMILData";
import { scoreCareers } from "@/services/timsService";
import { ScoreCareersRequest } from "@/types/tims";

export const timsKeys = {
  all: ["tims"] as const,
  scores: (userId: string) => [...timsKeys.all, "scores", userId] as const,
};

export function useTimsCareerScoring() {
  const { user } = useGlobalStore();
  const { pcaData, isCompleted: isPCACompleted } = usePCAData();
  const { getSubtestScores, isCompleted: isMILCompleted } = useMILData();

  const userId = user?.id;

  // Always fire the API call when user is logged in.
  // The backend returns its full career catalog with scores;
  // missing assessment data just means scores are based on whatever is available.
  const isEnabled = !!userId;

  const query = useQuery({
    queryKey: timsKeys.scores(userId || ""),
    queryFn: async () => {
      if (!userId) throw new Error("User not found");

      // 1. Prepare DISC scores from PCA data (zeros if not yet completed)
      const discScores = {
        d: pcaData?.results?.data?.pcaD1 || 0,
        i: pcaData?.results?.data?.pcaI1 || 0,
        s: pcaData?.results?.data?.pcaS1 || 0,
        c: pcaData?.results?.data?.pcaC1 || 0,
      };

      // 2. Prepare MIL scores (empty array if not completed)
      const milSubtests = getSubtestScores();
      const milScores = milSubtests.map((sub) => ({
        subtestName: sub.name,
        score: sub.score,
      }));

      // 3. Prepare Interests & Motivators from localStorage
      // TODO: Connect to derive-profile once enabled
      let interests: string[] = [];
      let motivators: string[] = [];

      try {
        const storedProfile = localStorage.getItem(`tims_profile_${userId}`);
        if (storedProfile) {
          const parsed = JSON.parse(storedProfile);
          interests = parsed.derivedInterests || [];
          motivators = parsed.derivedMotivators || [];
        }
      } catch (e) {
        console.warn("Failed to read stored TIMS profile", e);
      }

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
    staleTime: 10 * 60 * 1000, // 10 minutes
    retry: 1,
  });

  return {
    ...query,
    isPCACompleted,
    isMILCompleted,
    hasAssessments: isPCACompleted || isMILCompleted,
  };
}
