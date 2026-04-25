"use client";
import React, { useState } from "react";
import { getSafeStripeUrls, debugStripeUrls } from "@/utils/debugStripeUrls";
import { createCheckoutSession } from "@/services/subscriptionService";

interface StripeCheckoutProps {
  amount: number; // in cents
  productName: string;
  userId: string;
  planId: string;
  onSuccess?: () => void;
  onError?: (error: string) => void;
  onStart?: () => void;
  children?: React.ReactNode;
  className?: string;
  disabled?: boolean;
}

export default function StripeCheckout({
  amount,
  productName,
  userId,
  planId,
  onSuccess,
  onError,
  onStart,
  children,
  className = "",
  disabled = false,
}: StripeCheckoutProps) {
  const [loading, setLoading] = useState(false);

  const handleCheckout = async () => {
    if (disabled || loading) return;

    setLoading(true);
    onStart?.();

    try {
      // Debug URL configuration
      debugStripeUrls();

      // Use the safe URL utility
      const { successUrl, cancelUrl, baseUrl } = getSafeStripeUrls();

      console.log("🔗 Final Stripe URLs:", { baseUrl, successUrl, cancelUrl });

      // Create checkout session via subscription service
      const data = await createCheckoutSession({
        planId,
        userId,
        amount,
        currency: "usd",
        productName,
        successUrl,
        cancelUrl,
      });

      console.log("Checkout session created:", data);

      if (data.sessionUrl) {
        // Redirect to Stripe Checkout
        window.location.href = data.sessionUrl;
      } else {
        throw new Error("No session URL received from server");
      }
    } catch (error) {
      console.error("Failed to create checkout session:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Failed to initialize payment";
      onError?.(errorMessage);
      setLoading(false);
    }
    // Note: We don't set loading to false on success because we're redirecting
  };

  return (
    <button
      onClick={handleCheckout}
      disabled={disabled || loading}
      className={className}
    >
      {loading ? (
        <div className="flex items-center justify-center space-x-2" role="status">
          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" aria-hidden="true" />
          <span>Redirecting to Stripe...</span>
        </div>
      ) : (
        children || "Pay with Stripe"
      )}
    </button>
  );
}
