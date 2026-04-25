"use client";
import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  CardElement,
  useStripe,
  useElements
} from "@stripe/react-stripe-js";

// Initialize Stripe
const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

interface PaymentFormProps {
  clientSecret: string;
  amount: number;
  description: string;
  onSuccess: () => void;
  onError: (error: string) => void;
  onCancel: () => void;
}

const PaymentForm: React.FC<PaymentFormProps> = ({
  clientSecret,
  amount,
  description,
  onSuccess,
  onError,
  onCancel
}) => {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setProcessing(true);
    setError(null);

    const cardElement = elements.getElement(CardElement);
    if (!cardElement) {
      setError("Card element not found");
      setProcessing(false);
      return;
    }

    try {
      const { error, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
        payment_method: {
          card: cardElement,
        }
      });

      if (error) {
        setError(error.message || "Payment failed");
        onError(error.message || "Payment failed");
      } else if (paymentIntent && paymentIntent.status === 'succeeded') {
        onSuccess();
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Payment failed";
      setError(errorMessage);
      onError(errorMessage);
    } finally {
      setProcessing(false);
    }
  };

  const { t } = useTranslation();
  const formattedAmount = `$${(amount / 100).toFixed(2)}`;
  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Order Summary */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h3 className="font-semibold text-gray-900 mb-2">{t("payments.orderSummary")}</h3>
        <div className="flex justify-between items-center">
          <span className="text-gray-600">{description}</span>
          <span className="font-semibold text-gray-900">{formattedAmount}</span>
        </div>
      </div>

      {/* Card Element */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {t("payments.cardInformation")}
        </label>
        <div className="border border-gray-300 rounded-lg p-3">
          <CardElement
            options={{
              style: {
                base: {
                  fontSize: '16px',
                  color: '#424770',
                  '::placeholder': {
                    color: '#aab7c4',
                  },
                },
                invalid: {
                  color: '#9e2146',
                },
              },
            }}
          />
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="text-red-600 text-sm bg-red-50 p-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Buttons */}
      <div className="flex space-x-3">
        <button
          type="submit"
          disabled={!stripe || processing}
          className="flex-1 bg-blue-600 text-white py-3 px-4 rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
        >
          {processing ? t("payments.processing") : t("payments.payAmount", { amount: formattedAmount })}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={processing}
          className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-50 disabled:opacity-50 transition-colors"
        >
          {t("common.cancel")}
        </button>
      </div>

      {/* Security Notice */}
      <div className="flex items-center justify-center space-x-2 text-sm text-gray-500">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
        <span>{t("payments.securityNotice")}</span>
      </div>
    </form>
  );
};

interface StripeElementsPaymentProps {
  amount: number;
  userId: string;
  description: string;
  billingOptionId: string;
  onSuccess?: () => void;
  onError?: (error: string) => void;
  onStart?: () => void;
  children?: React.ReactNode;
  className?: string;
  disabled?: boolean;
}

const StripeElementsPayment: React.FC<StripeElementsPaymentProps> = ({
  amount,
  userId,
  description,
  billingOptionId,
  onSuccess,
  onError,
  onStart,
  children,
  className = "",
  disabled = false,
}) => {
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { t } = useTranslation();

  const handleStartPayment = async () => {
    if (disabled) return;
    
    setLoading(true);
    onStart?.();

    try {
      // Create payment intent
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE_URL}/api/stripe/create-payload`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${localStorage.getItem('token')}`,
          },
          body: JSON.stringify({
            userId,
            amount,
            currency: "usd",
            description,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log("Payment Intent response:", data);

      if (data.clientSecret) {
        setClientSecret(data.clientSecret);
        setShowPaymentForm(true);
      } else {
        throw new Error("No client secret received from server");
      }
    } catch (error) {
      console.error("Failed to create payment intent:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to initialize payment";
      onError?.(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handlePaymentSuccess = () => {
    setShowPaymentForm(false);
    onSuccess?.();
  };

  const handlePaymentError = (error: string) => {
    onError?.(error);
  };

  const handleCancel = () => {
    setShowPaymentForm(false);
    setClientSecret(null);
  };

  if (showPaymentForm && clientSecret) {
    const { t } = useTranslation();
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
        <div className="bg-white rounded-2xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
          <div className="p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-6">{t("payments.completePayment")}</h2>
            <Elements stripe={stripePromise}>
              <PaymentForm
                clientSecret={clientSecret}
                amount={amount}
                description={description}
                onSuccess={handlePaymentSuccess}
                onError={handlePaymentError}
                onCancel={handleCancel}
              />
            </Elements>
          </div>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={handleStartPayment}
      disabled={disabled || loading}
      className={className}
    >
      {children || (loading ? t("payments.initializing") : t("payments.payWithCard"))}
    </button>
  );
};

export default StripeElementsPayment;
