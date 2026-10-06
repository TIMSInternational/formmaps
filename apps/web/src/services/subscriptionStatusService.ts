import { apiRequest } from "@/lib/api/apiClient";

export interface SubscriptionStatus {
  hasActiveSubscription: boolean;
  planId: string | null;
  status: "active" | "trialing" | "past_due" | "canceled" | "cancelled" | "none";
  expiryDate: string | null;
  /** Cancelled but access retained until expiryDate ("Cancels on" vs "Renews on"). */
  cancelAtPeriodEnd?: boolean;
  isSchoolStudent?: boolean;
  /** Whole platform (any subscription, incl. trial) — #429. */
  hasFullPlatform?: boolean;
  /** Full results / reports / downloads — only after a real charge (D4). */
  hasPaidAccess?: boolean;
  scope?: "full_platform" | "assessments_and_reports" | null;
}

export interface ResultsPreview {
  personalityType: string | null;
  topCareerFamilies: string[];
  completed: { pca: boolean; lia: boolean; personality: boolean; vocational360: boolean };
  resultsLocked: boolean;
}

/** The free results preview (type, top-3 family names, completed ✓ — no scores). */
export async function getResultsPreview(): Promise<ResultsPreview> {
  const response = await apiRequest("/api/v1/entitlement/results-preview", { method: "GET" });
  return response.data || response;
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  price: number;
  interval: string;
  features: string[];
  isActive: boolean | null;
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

// NOTE: createSubscription (POST /api/v1/subscriptions) removed — that endpoint
// never existed. Subscriptions are created via Stripe Checkout
// (subscriptionService.createCheckoutSession) and confirmed by webhook.
