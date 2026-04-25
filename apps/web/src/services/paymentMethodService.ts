import { apiRequest } from "@/lib/api/apiClient";

export interface PaymentMethod {
  id: string;
  type: string;
  brand: string;
  last4: string;
  expiryMonth: number;
  expiryYear: number;
  isDefault: boolean;
}

/**
 * Get all saved payment methods for the user
 */
export async function getPaymentMethods(): Promise<PaymentMethod[]> {
  const response = await apiRequest("/api/v1/user/payment-methods", {
    method: "GET",
  });
  return response.data || response;
}

/**
 * Create a new payment method (returns Stripe SetupIntent client secret)
 */
export async function createPaymentMethod(): Promise<{ clientSecret: string }> {
  const response = await apiRequest("/api/v1/user/payment-methods", {
    method: "POST",
  });
  return response.data || response;
}

/**
 * Delete a payment method by ID
 */
export async function deletePaymentMethod(
  paymentMethodId: string
): Promise<void> {
  await apiRequest(`/api/v1/user/payment-methods/${paymentMethodId}`, {
    method: "DELETE",
  });
}

/**
 * Set a payment method as the default for future charges
 */
export async function setDefaultPaymentMethod(
  paymentMethodId: string
): Promise<PaymentMethod> {
  const response = await apiRequest(
    `/api/v1/user/payment-methods/${paymentMethodId}/default`,
    {
      method: "PATCH",
    }
  );
  return response.data || response;
}
