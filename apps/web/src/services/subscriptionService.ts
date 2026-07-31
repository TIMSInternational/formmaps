import { apiRequest } from "@/lib/api/apiClient";

// Subscription Plan Interfaces
export interface SubscriptionPlan {
  id: string;
  name: string;
  description: string;
  price: number;
  originalPrice?: number;
  period: string;
  popular: boolean;
  ctaText: string;
  additionalInfo?: string;
  discount?: number;
  features: string[];
  stripeProductId?: string;
  stripePriceId?: string;
}

export interface SubscriptionData {
  subscription: {
    name: string;
    description: string;
    icon: string;
    features: string[];
  };
  billingOptions: SubscriptionPlan[];
  features: FeatureComparison[];
}

export interface FeatureComparison {
  name: string;
  availability: {
    [billingId: string]: boolean | string;
  };
}

// User Subscription Interfaces
// Default subscription data (fallback)
const defaultSubscriptionData: SubscriptionData = {
  subscription: {
    name: "UNIV.365 Premium",
    description: "Complete access to accelerate your career journey",
    icon: "🎓",
    features: [
      "Complete Platform Access",
      "Advanced Career Analytics",
      "Priority Support",
      "Career Mentorship Program",
      "Unlimited Skill Assessments",
      "Advanced Job Matching Algorithm",
      "Resume Builder Pro",
      "Interview Preparation Tools",
      "Resource Library Access",
      "Community & Networking",
    ],
  },
  billingOptions: [
    {
      id: "one-time",
      name: "One-Time Payment",
      description: "Download PDF Document, limited information",
      price: 15,
      period: "one-time",
      popular: false,
      ctaText: "Buy Now",
      additionalInfo: "Single purchase",
      features: [
        "Download PDF Document",
        "Limited Information Access",
        "Basic Career Guidance",
        "Email Support",
      ],
    },
    {
      id: "monthly",
      name: "Monthly Subscription",
      description: "Complete access to the platform",
      price: 29,
      period: "month",
      popular: true,
      ctaText: "Start Monthly",
      additionalInfo: "7-day free trial",
      features: [
        "Everything in One-Time",
        "Complete Platform Access",
        "Advanced Analytics",
        "Priority Support",
        "Career Mentorship",
        "Skill Assessments",
        "Job Matching Algorithm",
        "Resume Builder Pro",
        "Interview Preparation",
      ],
    },
    {
      id: "yearly",
      name: "Yearly Subscription",
      description: "Complete access with significant savings",
      price: 279,
      originalPrice: 348,
      period: "year",
      popular: false,
      ctaText: "Start Yearly",
      additionalInfo: "Save $69 per year",
      discount: 20,
      features: [
        "Everything in Monthly",
        "Priority Customer Support",
        "Advanced Reporting",
        "Early Access to New Features",
        "Dedicated Account Manager",
        "Custom Training Sessions",
      ],
    },
  ],
  features: [
    {
      name: "PDF Downloads",
      availability: { "one-time": true, monthly: true, yearly: true },
    },
    {
      name: "Career Analytics",
      availability: { "one-time": false, monthly: true, yearly: true },
    },
    {
      name: "Priority Support",
      availability: { "one-time": false, monthly: true, yearly: true },
    },
    {
      name: "Mentorship Program",
      availability: { "one-time": false, monthly: true, yearly: true },
    },
    {
      name: "Advanced Reporting",
      availability: { "one-time": false, monthly: false, yearly: true },
    },
    {
      name: "Early Access Features",
      availability: { "one-time": false, monthly: false, yearly: true },
    },
    {
      name: "Dedicated Account Manager",
      availability: { "one-time": false, monthly: false, yearly: true },
    },
    {
      name: "Skill Assessments",
      availability: {
        "one-time": "Limited",
        monthly: "Unlimited",
        yearly: "Unlimited",
      },
    },
    {
      name: "Job Matching",
      availability: {
        "one-time": "Basic",
        monthly: "Advanced",
        yearly: "Advanced",
      },
    },
    {
      name: "Resume Templates",
      availability: {
        "one-time": "3 templates",
        monthly: "50+ templates",
        yearly: "50+ templates",
      },
    },
  ],
};

// Helper Functions

/**
 * Enhance plan data with UI-specific fields based on plan characteristics
 */
interface RawPlan {
  id?: string;
  _id?: string;
  name?: string;
  description?: string;
  price?: number;
  interval?: string;
  features?: string[];
  stripeProductId?: string;
  stripePriceId?: string;
}

function enhancePlanWithUIFields(plan: RawPlan) {
  const interval = plan.interval || "month";
  const price = plan.price || 0;

  // Default enhancements
  let enhancements = {
    popular: false,
    ctaText: "Subscribe",
    additionalInfo: "",
    discount: undefined as number | undefined,
    originalPrice: undefined as number | undefined,
    description: "",
  };

  // Enhance based on interval type
  if (interval === "one_time" || interval === "one-time") {
    enhancements = {
      popular: false,
      ctaText: "Buy Now",
      additionalInfo: "Single purchase",
      discount: undefined,
      originalPrice: undefined,
      description: "Download PDF Document, limited information",
    };
  } else if (interval === "month" || interval === "monthly") {
    enhancements = {
      popular: true,
      ctaText: "Start Monthly",
      additionalInfo: "7-day free trial",
      discount: undefined,
      originalPrice: undefined,
      description: "Complete access to the platform",
    };
  } else if (interval === "year" || interval === "yearly") {
    // Calculate savings if price suggests yearly plan
    const monthlyEquivalent = Math.round((price / 12) * 1.2); // Assume 20% discount
    enhancements = {
      popular: false,
      ctaText: "Start Yearly",
      additionalInfo: `Save $${monthlyEquivalent * 12 - price} per year`,
      discount: 20,
      originalPrice: monthlyEquivalent * 12,
      description: "Complete access with significant savings",
    };
  }

  return enhancements;
}

// API Functions

/**
 * Create a Stripe checkout session for a subscription plan
 */
export interface CheckoutSessionPayload {
  planId: string;
  userId: string;
  amount: number;
  currency: string;
  productName: string;
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutSessionResponse {
  sessionUrl: string;
  sessionId: string;
}

export async function createCheckoutSession(
  payload: CheckoutSessionPayload
): Promise<CheckoutSessionResponse> {
  const response = await apiRequest<{ success: boolean; data: CheckoutSessionResponse }>(
    "/api/stripe/create-checkout-session",
    {
      method: "POST",
      data: payload,
    }
  );
  // API envelope is {success, data:{sessionId, sessionUrl}} — unwrap it.
  return (response?.data ?? response) as CheckoutSessionResponse;
}

/**
 * Open the Stripe Customer Portal (manage payment method, invoices, cancel).
 * Returns the portal URL to redirect the user to.
 */
export async function openBillingPortal(): Promise<string> {
  const response = await apiRequest<{ success: boolean; data: { url: string } }>(
    "/api/stripe/billing-portal",
    { method: "POST" }
  );
  return (response?.data ?? response)?.url ?? "";
}

/**
 * Fetch subscription plans from API (with fallback to default data)
 */
export async function fetchSubscriptionPlans(): Promise<SubscriptionData> {
  try {

    // Use the actual API endpoint from the Postman collection
    const response = await apiRequest("/api/subscriptionplan", {
      method: "GET",
    });

    // Handle the API response format: {data: [...], message: "...", success: true}
    const plans = response?.data || response;

    // Transform API response to match our interface
    if (plans && Array.isArray(plans)) {
      if (plans.length > 0) {

        const transformedData: SubscriptionData = {
          subscription: defaultSubscriptionData.subscription,
          billingOptions: plans.map((plan: RawPlan) => {

            // Enhance plan data with UI-specific fields based on interval
            const enhancedPlan = enhancePlanWithUIFields(plan);

            return {
              id: plan.id || plan._id || "",
              name: plan.name || "",
              description: plan.description || enhancedPlan.description,
              price: plan.price || 0,
              originalPrice: enhancedPlan.originalPrice,
              period: plan.interval || "month",
              popular: enhancedPlan.popular,
              ctaText: enhancedPlan.ctaText,
              additionalInfo: enhancedPlan.additionalInfo,
              discount: enhancedPlan.discount,
              features: plan.features || [],
              stripeProductId: plan.stripeProductId,
              stripePriceId: plan.stripePriceId,
            };
          }),
          features: defaultSubscriptionData.features,
        };

        return transformedData;
      } else {
        return {
          subscription: defaultSubscriptionData.subscription,
          billingOptions: [],
          features: defaultSubscriptionData.features,
        };
      }
    }

    return {
      subscription: defaultSubscriptionData.subscription,
      billingOptions: [],
      features: defaultSubscriptionData.features,
    };
  } catch (error) {
    throw error;
  }
}

/**
 * Create a new subscription plan (admin only)
 */
export async function createSubscriptionPlan(payload: {
  name: string;
  price: number;
  interval: string;
  features: string[];
  description?: string;
}): Promise<Record<string, unknown>> {
  return apiRequest<Record<string, unknown>>("/api/subscriptionplan", {
    method: "POST",
    data: payload,
  });
}

/**
 * Update a subscription plan (admin only)
 */
export async function updateSubscriptionPlan(
  planId: string,
  payload: {
    name?: string;
    price?: number;
    interval?: string;
    features?: string[];
    description?: string;
    isActive?: boolean;
  }
): Promise<Record<string, unknown>> {
  return apiRequest<Record<string, unknown>>(`/api/subscriptionplan/${planId}`, {
    method: "PUT",
    data: payload,
  });
}

/**
 * Delete (deactivate) a subscription plan (admin only)
 */
export async function deleteSubscriptionPlan(planId: string): Promise<Record<string, unknown>> {
  return apiRequest<Record<string, unknown>>(`/api/subscriptionplan/${planId}`, {
    method: "DELETE",
  });
}

/**
 * Get a specific subscription plan by ID
 */
export async function getSubscriptionPlanById(planId: string): Promise<Record<string, unknown>> {
  return apiRequest<Record<string, unknown>>(`/api/subscriptionplan/${planId}`, {
    method: "GET",
  });
}

// NOTE: the old createSubscription/getUserSubscription/updateSubscription/
// cancelSubscription/getUserSubscriptionHistory functions called /api/subscriptions*
// endpoints that never existed on this backend — removed. Subscriptions are
// managed via Stripe Checkout (createCheckoutSession), the Customer Portal
// (openBillingPortal), and /api/stripe/cancel-subscription (subscriptionStatusService).

/**
 * Helper function to find subscription plan by ID from a local array
 */
export function findSubscriptionPlanById(
  planId: string,
  plans: SubscriptionPlan[]
): SubscriptionPlan | null {
  return plans.find((plan) => plan.id === planId) || null;
}
