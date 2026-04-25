import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { getAllCoachesAdmin, CoachesResponse } from "@/services/coachService";

interface UseAdminCoachesParams {
  page?: number;
  limit?: number;
  search?: string;
}

export function useAdminCoaches(params: UseAdminCoachesParams = {}) {
  const page = params.page || 1;
  const limit = params.limit || 10;

  return useQuery<CoachesResponse>({
    queryKey: ["adminCoaches", { page, limit, search: params.search }],
    queryFn: () => getAllCoachesAdmin({ page, limit, search: params.search }),
    placeholderData: keepPreviousData,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
