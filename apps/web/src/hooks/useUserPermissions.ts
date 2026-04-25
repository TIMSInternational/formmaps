"use client";

import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api/apiClient";
import { useGlobalStore } from "@/store/useGlobalStore";

interface MeResponse {
  success: boolean;
  data: {
    id: string;
    name: string;
    email: string;
    role: string;
    roleName: string;
    schoolId: string | null;
    permissions: string[];
  };
}

/**
 * Fetches current user's permissions from the backend and syncs to store.
 * Call this once on app init (e.g. in AuthWrapper) to keep permissions fresh.
 */
export function useUserPermissions(options?: { enabled?: boolean }) {
  const { setPermissions, user } = useGlobalStore();

  return useQuery({
    queryKey: ["user", "me", "permissions"],
    queryFn: async () => {
      const res = await apiRequest<MeResponse>("/api/v1/user/me");
      const permissions = res.data?.permissions ?? [];
      setPermissions(permissions);
      return permissions;
    },
    enabled: options?.enabled ?? user.isAuthenticated,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
  });
}
