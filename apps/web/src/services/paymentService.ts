import { apiRequest } from "@/lib/api/apiClient";

// Payment Interfaces
export interface CreateCheckoutSessionRequest {
  userId: string;
  amount: number; // in cents
  currency: string;
  productName: string;
  successUrl: string;
  cancelUrl: string;
  metadata?: Record<string, string>;
}

export interface CheckoutSessionResponse {
  sessionId: string;
  sessionUrl: string;
}

export interface PaymentStatus {
  status: string;
  paymentStatus?: string;
  amount?: number;
  description?: string;
  createdAt?: string;
  userId?: string;
}

export interface StripeConfig {
  publishableKey: string;
}

/**
 * Get Stripe configuration
 */
export async function getStripeConfig(): Promise<StripeConfig> {
  return apiRequest("/api/stripe/config", {
    method: "GET",
  });
}

/**
 * Create Stripe Checkout Session
 */
export async function createCheckoutSession(
  request: CreateCheckoutSessionRequest
): Promise<CheckoutSessionResponse> {
  return apiRequest("/api/stripe/create-checkout-session", {
    method: "POST",
    data: request,
  });
}

/**
 * Check payment status by session ID
 */
export async function getPaymentStatus(
  sessionId: string
): Promise<PaymentStatus> {
  return apiRequest(`/api/stripe/status/${sessionId}`, {
    method: "GET",
  });
}

/**
 * Get user's payment history
 */
export async function getUserPayments(userId: string): Promise<any[]> {
  return apiRequest(`/api/stripe/user/${userId}`, {
    method: "GET",
  });
}

/**
 * Helper function to redirect to Stripe Checkout
 */
export async function redirectToStripeCheckout(
  amount: number,
  productName: string,
  userId: string,
  metadata?: Record<string, string>
): Promise<void> {
  try {
    // Ensure we have absolute URLs
    const baseUrl = window.location.origin;
    // Success URL now includes metadata hooks if needed, but primarily we rely on webhook
    const successUrl = `${baseUrl}/payment-success?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${baseUrl}/payment-cancelled`;

    console.log("🔗 Payment service URLs:", { successUrl, cancelUrl, baseUrl });

    const request: CreateCheckoutSessionRequest = {
      userId,
      amount,
      currency: "usd",
      productName,
      successUrl,
      cancelUrl,
      metadata,
    };

    const response = await createCheckoutSession(request);

    if (response.sessionUrl) {
      window.location.href = response.sessionUrl;
    } else {
      throw new Error("No session URL received from server");
    }
  } catch (error) {
    console.error("Failed to create checkout session:", error);
    throw error;
  }
}

/**
 * Helper function to format payment amount
 */
export function formatPaymentAmount(amountInCents: number): string {
  return `$${(amountInCents / 100).toFixed(2)}`;
}

/**
 * Helper function to validate payment amount
 */
export function validatePaymentAmount(amount: number): boolean {
  return amount > 0 && amount <= 99999999; // Max $999,999.99
}
