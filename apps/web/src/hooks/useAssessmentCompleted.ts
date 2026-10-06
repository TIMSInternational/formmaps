import { useCallback } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { assessmentKeys } from "@/hooks/useAssessmentQueries";
import { pcaDataKeyPrefix } from "@/hooks/usePCAData";
import { timsKeys } from "@/hooks/useTimsQueries";

/**
 * Every cached read that shows whether an assessment is done: the dashboard progress/summary,
 * the assessments list (LIA, MIL, 360 groups), PCA status and the TIMS scores derived from it.
 *
 * The app-wide staleTime is 5 minutes, so without this a student who finished an assessment
 * went back to the dashboard and still saw "In progress" until a refresh. Active queries
 * refetch now; the rest refetch the next time they mount.
 */
export function invalidateAfterAssessmentCompleted(queryClient: QueryClient): Promise<unknown> {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: assessmentKeys.all }),
    queryClient.invalidateQueries({ queryKey: pcaDataKeyPrefix }),
    queryClient.invalidateQueries({ queryKey: timsKeys.all }),
  ]);
}

/** Call once an assessment's completion has been accepted by the server. */
export function useAssessmentCompleted(): () => Promise<unknown> {
  const queryClient = useQueryClient();
  return useCallback(() => invalidateAfterAssessmentCompleted(queryClient), [queryClient]);
}
