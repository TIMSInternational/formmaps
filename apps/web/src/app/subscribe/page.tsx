"use client";
import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { SubscriptionPlans } from "@/app/dashboard/subscriptions/_components/SubscriptionPlans";
import { Button } from "@/components/ui/button";

import { motion, AnimatePresence } from "motion/react";
import { CheckCircle2, X } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function SubscribePage() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();

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
          console.error("Payment verification error:", err);
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
        alert(t("payments.cancelledText"));
      }, 500);
    }
  }, [searchParams]);

  return (
    <div className="h-[100dvh] overflow-y-auto w-full bg-gradient-to-br from-indigo-50 via-white to-purple-50 relative">
      {/* Background Decor */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-[20%] -right-[10%] w-[50%] h-[50%] rounded-full bg-purple-200/20 blur-3xl animate-pulse" />
        <div className="absolute top-[40%] -left-[10%] w-[40%] h-[40%] rounded-full bg-blue-200/20 blur-3xl animate-pulse delay-1000" />
      </div>

      <div className="relative z-10 container mx-auto py-8 px-4 md:py-12">
        {/* Success Message Float */}
        <AnimatePresence>
          {showSuccessMessage && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: -20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="fixed top-8 left-1/2 transform -translate-x-1/2 z-50 w-full max-w-md px-4"
            >
              <div className="bg-white/90 backdrop-blur-md shadow-2xl rounded-2xl p-4 border border-green-100 flex items-start gap-4 ring-1 ring-black/5">
                <div className="flex-shrink-0">
                  <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                    <CheckCircle2 className="w-6 h-6 text-green-600" />
                  </div>
                </div>
                <div className="flex-1 pt-1">
                  <h3 className="font-semibold text-gray-900">
                    {t("subscribe.paymentSuccessful")}
                  </h3>
                  <p className="text-sm text-gray-600 mt-1">
                    {t("subscribe.subscriptionActive")}
                  </p>
                </div>
                <button
                  onClick={() => setShowSuccessMessage(false)}
                  className="flex-shrink-0 text-gray-400 hover:text-gray-600 p-1"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Content */}
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mb-10 text-center"
          >
            <h1 className="text-4xl md:text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-600 mb-4 tracking-tight">
              {t("subscribe.upgradeTitle")}
            </h1>
            <p className="text-lg md:text-xl text-gray-600 max-w-2xl mx-auto leading-relaxed">
              {t("subscribe.upgradeSubtitle")}
            </p>
          </motion.div>

          <SubscriptionPlans className="!mt-0" />
        </div>
      </div>
    </div>
  );
}
