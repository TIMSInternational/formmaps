"use client";
import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslation } from "react-i18next";
// Sidebar and TopNav are provided by the parent dashboard layout; removed local instances
import { SubscriptionPlans } from "./_components/SubscriptionPlans";

export default function SubscriptionsPage() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  // Sidebar state is handled by the parent dashboard layout
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);

  // Check for success/cancelled parameters from Stripe redirect
  useEffect(() => {
    const success = searchParams.get("success");
    const cancelled = searchParams.get("cancelled");
    const sessionId = searchParams.get("session_id");

    if (success === "true" && sessionId) {
      // Verify payment with backend
      fetch(
        `${process.env.NEXT_PUBLIC_API_BASE_URL}/api/stripe/status/${sessionId}`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
        }
      )
        .then((res) => res.json())
        .then((data) => {
          if (data.status === "succeeded" || data.paymentStatus === "paid") {
            setShowSuccessMessage(true);
            // Hide success message after 8 seconds
            setTimeout(() => setShowSuccessMessage(false), 8000);
          }
        })
        .catch((err) => {
          // Still show success message as user was redirected from Stripe
          setShowSuccessMessage(true);
          setTimeout(() => setShowSuccessMessage(false), 8000);
        });

      // Clear URL parameters after showing message
      const url = new URL(window.location.href);
      url.searchParams.delete("success");
      url.searchParams.delete("payment_intent");
      url.searchParams.delete("session_id");
      window.history.replaceState({}, "", url.toString());
    } else if (cancelled === "true") {
      // Clear URL parameters
      const url = new URL(window.location.href);
      url.searchParams.delete("cancelled");
      window.history.replaceState({}, "", url.toString());

      // Show cancelled message briefly
      setTimeout(() => {
        alert("Payment was cancelled. You can try again anytime.");
      }, 500);
    }
  }, [searchParams]);

  return (
    <div className="min-h-screen bg-gray-50/50 p-6 md:p-8 font-sans text-gray-900">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Success Message */}
        {showSuccessMessage && (
          <div className="mb-6 bg-emerald-50 border border-emerald-200 rounded-xl p-4 shadow-sm animate-in fade-in slide-in-from-top-4 duration-500">
            <div className="flex items-center space-x-3">
              <div className="flex-shrink-0">
                <svg
                  className="w-6 h-6 text-emerald-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-medium text-emerald-800">
                  Payment Successful!
                </h3>
                <p className="text-sm text-emerald-700 mt-1">
                  Your subscription has been activated. You now have access to
                  all premium features.
                </p>
              </div>
              <button
                onClick={() => setShowSuccessMessage(false)}
                className="flex-shrink-0 text-emerald-400 hover:text-emerald-600 ml-auto"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="space-y-1">
            <h1 className="text-4xl font-bold text-gray-900 tracking-tight">
              {t("subscriptions.title")}
            </h1>
            <p className="text-lg text-gray-500 font-medium">
              {t("subscriptions.subtitle")}
            </p>
          </div>
        </div>

        {/* Subscription Plans */}
        <div className="bg-white/50 backdrop-blur-sm rounded-3xl p-1 md:p-2 border border-blue-100/50 shadow-sm">
             <SubscriptionPlans />
        </div>
      </div>
    </div>
  );
}
