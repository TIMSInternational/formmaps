"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { useGlobalStore } from "@/store/useGlobalStore";
import { useSubscriptionStatus } from "@/hooks/useSubscription";

/**
 * "Complete your purchase" — where a student with no school lands while the
 * independent-student paywall is on and they have no entitlement yet
 * (formmaps-platform#399). The account exists; only the purchase is missing
 * (e.g. they closed Stripe Checkout). Nothing else in the app is reachable
 * from here — the API answers 402 PAYMENT_REQUIRED to everything except the
 * sign-in / status / checkout surface.
 */
export default function CompletePurchasePage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { logout } = useGlobalStore();
  const { data: status, refetch, isFetching } = useSubscriptionStatus({ staleTime: 0 });

  // Paid (webhook landed) → straight in.
  useEffect(() => {
    if (status?.hasActiveSubscription) router.replace("/dashboard");
  }, [status?.hasActiveSubscription, router]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">{t("independentStudent.completePurchase.title")}</h1>
        <p className="text-gray-600 mb-2">{t("independentStudent.completePurchase.body")}</p>
        <p className="text-gray-500 text-sm mb-6">{t("independentStudent.completePurchase.minors")}</p>

        <div className="space-y-3">
          <Link
            href="/subscribe"
            className="block w-full bg-[var(--admin-accent-blue)] text-white py-3 px-4 rounded-lg font-semibold hover:bg-[#256F76] transition-colors"
          >
            {t("independentStudent.completePurchase.choosePlan")}
          </Link>
          <button
            type="button"
            onClick={() => { void refetch(); }}
            disabled={isFetching}
            className="w-full border border-gray-300 text-gray-700 py-3 px-4 rounded-lg font-semibold hover:bg-gray-50 transition-colors disabled:opacity-60"
          >
            {isFetching ? t("independentStudent.completePurchase.checking") : t("independentStudent.completePurchase.alreadyPaid")}
          </button>
          <button
            type="button"
            onClick={() => { logout(); router.push("/login"); }}
            className="w-full text-gray-500 py-2 text-sm hover:text-gray-700"
          >
            {t("independentStudent.completePurchase.signOut")}
          </button>
        </div>
      </div>
    </div>
  );
}
