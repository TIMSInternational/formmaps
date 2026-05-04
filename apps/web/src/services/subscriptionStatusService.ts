import { apiRequest } from "@/lib/api/apiClient";

export interface SubscriptionStatus {
  hasActiveSubscription: boolean;
  planId: string | null;
  status: "active" | "past_due" | "canceled" | "cancelled" | "none";
  expiryDate: string | null;
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  price: number;
  interval: string;
  features: string[];
  isActive: boolean | null;
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
 * Fetch all available subscription plans from backend
 */
export async function getSubscriptionPlans(): Promise<SubscriptionPlan[]> {
  const response = await apiRequest("/api/subscriptionplan", {
    method: "GET",
  });
  const plans = response.data || response;
  // Only return active plans
  return Array.isArray(plans) ? plans.filter((p: SubscriptionPlan) => p.isActive !== false) : [];
}

/**
 * Cancel the user's active subscription
 */
export async function cancelSubscription(): Promise<{ success: boolean; message: string }> {
  const response = await apiRequest("/api/stripe/cancel-subscription", {
    method: "POST",
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
