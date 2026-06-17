"use client";
import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/apiClient";

export default function PaymentSuccess() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<
    "loading" | "success" | "failed" | "error"
  >("loading");
  const [paymentDetails, setPaymentDetails] = useState<any>(null);

  useEffect(() => {
    const sessionId = searchParams.get("session_id");

    if (sessionId) {
      // Verify payment via the app's API client. apiClient uses the correct
      // (relative, proxied) base URL and attaches the auth token/cookie — a raw
      // fetch to `${NEXT_PUBLIC_API_BASE_URL}/api/...` broke in prod because that
      // env var is intentionally empty (Next proxies relative /api paths), so the
      // URL became "undefined/api/..." → 404 → the verification error.
      apiClient
        .get(`/api/stripe/status/${sessionId}`)
        .then((res) => {
          // Backend envelope: { success, data: { status, amount, currency } }.
          const d = res.data?.data ?? res.data ?? {};
          if (d.status === "succeeded" || d.status === "paid" || d.paymentStatus === "paid") {
            setStatus("success");
            setPaymentDetails(d);
            // Force subscription cache to show active — invalidation alone won't work
            // because the AuthWrapper's subscription observer is disabled on this page
            // (isProtectedRoute = false), so invalidation can't trigger a refetch.
            // Setting the data directly ensures the cache has the right value when
            // the observer re-enables on /dashboard.
            queryClient.setQueryData(["subscriptionStatus"], {
              hasActiveSubscription: true,
              planId: d.planId || "paid",
              status: "active",
              expiryDate: null,
            });
          } else {
            setStatus("failed");
          }
        })
        .catch(() => {
          setStatus("error");
        });
    } else {
      setStatus("error");
    }
  }, [searchParams, queryClient]);

  const handleContinue = () => {
    // If it was a booking payment (we can guess by description or metadata if available, but for now generic check)
    // Actually, we can check searchParams if we add more context, but simplest is:
    // If successful, users likely want to see their sessions or subscriptions.

    // Better: Check description or amount to differentiate
    if (
      paymentDetails?.description?.toLowerCase().includes("coaching session")
    ) {
      router.push("/dashboard/my-sessions");
      return;
    }

    router.push("/dashboard");
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#f5f8fc] to-white flex flex-col items-center justify-center p-4">
      {/* Brand mark */}
      <div className="flex items-center justify-center gap-2 mb-6">
        <img src="/logo-icon.svg" alt="FormMaps" className="w-8 h-8" />
        <div className="flex items-center">
          <span className="text-lg font-bold tracking-tight" style={{ color: "#111111" }}>FORM</span>
          <span className="text-lg font-bold tracking-tight" style={{ color: "#065292" }}>MAPS</span>
        </div>
      </div>

      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8" style={{ border: "1px solid rgba(6,82,146,0.1)" }}>
        {status === "loading" && (
          <div className="text-center">
            <div className="w-16 h-16 border-4 rounded-full animate-spin mx-auto mb-4" style={{ borderColor: "rgba(6,82,146,0.2)", borderTopColor: "#065292" }}></div>
            <h2 className="text-xl font-semibold mb-2" style={{ color: "#111111" }}>
              {t("payments.verifying")}
            </h2>
            <p className="text-gray-500">{t("payments.pleaseWait")}</p>
          </div>
        )}

        {status === "success" && (
          <div className="text-center">
            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: "rgba(5,150,105,0.12)" }}>
              <svg
                className="w-8 h-8"
                style={{ color: "#059669" }}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h2 className="text-2xl font-bold mb-2" style={{ color: "#111111" }}>
              {t("payments.successTitle")}
            </h2>
            <p className="text-gray-500 mb-6">
              {paymentDetails?.description
                ?.toLowerCase()
                .includes("coaching session")
                ? t("payments.successSession")
                : t("payments.successSubscription")}
            </p>

            {paymentDetails && (
              <div className="rounded-lg p-4 mb-6 text-left" style={{ background: "#f5f8fc", border: "1px solid rgba(6,82,146,0.1)" }}>
                <h3 className="font-semibold mb-2" style={{ color: "#111111" }}>
                  {t("payments.details")}
                </h3>
                {paymentDetails.amount > 0 ? (
                  <p className="text-sm text-gray-600">
                    <strong>{t("payments.amount")}</strong> $
                    {(paymentDetails.amount / 100).toFixed(2)}
                  </p>
                ) : (
                  // amount is 0 for a subscription started on its free trial — no
                  // charge today. (Guard with `> 0`: `{0 && ...}` would render a bare "0".)
                  <p className="text-sm text-gray-600">{t("payments.freeTrial")}</p>
                )}
                {paymentDetails.description && (
                  <p className="text-sm text-gray-600">
                    <strong>{t("payments.description")}</strong>{" "}
                    {paymentDetails.description}
                  </p>
                )}
                {paymentDetails.createdAt && (
                  <p className="text-sm text-gray-600">
                    <strong>{t("payments.date")}</strong>{" "}
                    {new Date(paymentDetails.createdAt).toLocaleDateString()}
                  </p>
                )}
              </div>
            )}

            <button
              onClick={handleContinue}
              className="w-full text-white py-3 px-4 rounded-xl font-semibold transition-colors hover:opacity-95"
              style={{ background: "#065292" }}
            >
              {paymentDetails?.description
                ?.toLowerCase()
                .includes("coaching session")
                ? t("payments.viewMySessions")
                : t("payments.continueToDashboard")}
            </button>
          </div>
        )}

        {status === "failed" && (
          <div className="text-center">
            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: "rgba(220,38,38,0.1)" }}>
              <svg
                className="w-8 h-8"
                style={{ color: "#dc2626" }}
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
            </div>
            <h2 className="text-2xl font-bold mb-2" style={{ color: "#111111" }}>
              {t("payments.failedTitle")}
            </h2>
            <p className="text-gray-500 mb-6">{t("payments.failedText")}</p>
            <div className="space-y-3">
              <Link
                href={
                  paymentDetails?.description
                    ?.toLowerCase()
                    .includes("coaching session")
                    ? "/dashboard/my-sessions"
                    : "/dashboard/subscriptions"
                }
                className="block w-full text-white py-3 px-4 rounded-xl font-semibold transition-colors hover:opacity-95 text-center"
                style={{ background: "#065292" }}
              >
                {t("payments.tryAgain")}
              </Link>
              <button
                onClick={handleContinue}
                className="w-full py-3 px-4 rounded-xl font-semibold transition-colors hover:bg-gray-50"
                style={{ border: "1px solid #065292", color: "#065292" }}
              >
                {t("payments.backToDashboard")}
              </button>
            </div>
          </div>
        )}

        {status === "error" && (
          <div className="text-center">
            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: "rgba(217,119,6,0.12)" }}>
              <svg
                className="w-8 h-8"
                style={{ color: "#d97706" }}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
                />
              </svg>
            </div>
            <h2 className="text-2xl font-bold mb-2" style={{ color: "#111111" }}>
              {t("payments.errorTitle")}
            </h2>
            <p className="text-gray-500 mb-6">{t("payments.errorText")}</p>
            <button
              onClick={handleContinue}
              className="w-full text-white py-3 px-4 rounded-xl font-semibold transition-colors hover:opacity-95"
              style={{ background: "#065292" }}
            >
              {t("payments.continueToDashboard")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
