import { apiRequest } from "@/lib/api/apiClient";

export interface SubscriptionStatus {
  hasActiveSubscription: boolean;
  planId: string | null;
  status: "active" | "past_due" | "canceled" | "none";
  expiryDate: string | null;
}

export interface CreateSubscriptionRequest {
  planId: string;
  paymentMethodId?: string;
}

export interface CreateSubscriptionResponse {
  subscriptionId: string;
  planId: string;
  status: string;
  startDate: string;
  nextBillingDate: string;
}

/**
 * Get current subscription status for the user
 */
export async function getSubscriptionStatus(): Promise<SubscriptionStatus> {
  const response = await apiRequest("/api/v1/user/subscription/status", {
    method: "GET",
  });
  return response.data || response;
}

/**
 * Create a new subscription
 */
export async function createSubscription(
  payload: CreateSubscriptionRequest
): Promise<CreateSubscriptionResponse> {
  const response = await apiRequest("/api/v1/subscriptions", {
    method: "POST",
    data: payload,
  });
  return response.data || response;
}
