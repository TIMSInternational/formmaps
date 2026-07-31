"use client";
import React, { useState } from "react";
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
      const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
      const successUrl = `${baseUrl}/payment-success?session_id={CHECKOUT_SESSION_ID}`;
      const cancelUrl = `${baseUrl}/payment-cancelled`;

      const data = await createCheckoutSession({
        planId,
        userId,
        amount,
        currency: "usd",
        productName,
        successUrl,
        cancelUrl,
      });

      if (data.sessionUrl) {
        window.location.href = data.sessionUrl;
      } else {
        throw new Error("No session URL received from server");
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to initialize payment";
      onError?.(errorMessage);
      setLoading(false);
    }
  };

  return (
    <div
      onClick={handleCheckout}
      role="button"
      tabIndex={disabled || loading ? -1 : 0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleCheckout(); }}
      className={`${className} ${disabled || loading ? "pointer-events-none opacity-60" : "cursor-pointer"}`}
      aria-disabled={disabled || loading}
    >
      {loading ? (
        <div className="flex items-center justify-center space-x-2 py-3" role="status">
          <div className="w-4 h-4 border-2 border-[#2E9098] border-t-transparent rounded-full animate-spin" aria-hidden="true" />
          <span className="text-sm text-gray-600">Redirecting to Stripe...</span>
        </div>
      ) : (
        children || "Pay with Stripe"
      )}
    </div>
  );
}
