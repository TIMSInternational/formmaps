import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getSubscriptionStatus,
  getSubscriptionPlans,
  createSubscription,
  type SubscriptionStatus,
  type SubscriptionPlan,
  type CreateSubscriptionRequest,
  type CreateSubscriptionResponse,
} from "@/services/subscriptionStatusService";

/**
 * Hook to fetch current subscription status
 */
export function useSubscriptionStatus(
  options?: Omit<
    import("@tanstack/react-query").UseQueryOptions<SubscriptionStatus, Error>,
    "queryKey" | "queryFn"
  >
) {
  return useQuery<SubscriptionStatus, Error>({
    queryKey: ["subscriptionStatus"],
    queryFn: getSubscriptionStatus,
    staleTime: 5 * 60 * 1000,
    ...options,
  });
}

/**
 * Hook to fetch available subscription plans from the backend
 */
export function useSubscriptionPlans() {
  return useQuery<SubscriptionPlan[], Error>({
    queryKey: ["subscriptionPlans"],
    queryFn: getSubscriptionPlans,
    staleTime: 10 * 60 * 1000,
  });
}

/**
 * Hook to create a new subscription
 */
export function useCreateSubscription() {
  const queryClient = useQueryClient();

  return useMutation<
    CreateSubscriptionResponse,
    Error,
    CreateSubscriptionRequest
  >({
    mutationFn: createSubscription,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subscriptionStatus"] });
    },
  });
}

/**
 * Check if the user is a school student (subscription provided by school)
 */
export function useIsSchoolStudent() {
  const { data } = useSubscriptionStatus();
  return data?.planId === "school";
}
