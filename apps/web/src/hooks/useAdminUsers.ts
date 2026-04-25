import { useQuery, keepPreviousData } from "@tanstack/react-query";
import {
  getAdminUsers,
  AdminUsersResponse,
  AdminUsersFilters,
} from "@/services/adminUsersService";

/**
 * Hook to fetch admin users list with pagination and filtering
 */
export function useAdminUsers(filters: AdminUsersFilters = {}) {
  const page = filters.page || 1;
  const limit = filters.limit || 20;

  return useQuery<AdminUsersResponse>({
    queryKey: ["adminUsers", { page, limit, ...filters }],
    queryFn: () => getAdminUsers(filters),
    placeholderData: keepPreviousData,
    staleTime: 1 * 60 * 1000, // 1 minute
  });
}
