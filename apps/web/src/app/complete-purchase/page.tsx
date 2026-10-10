"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { useGlobalStore } from "@/store/useGlobalStore";
import { useSubscriptionStatus } from "@/hooks/useSubscription";
import { ResultsPreviewCard } from "@/components/independent-student/ResultsPreviewCard";
import { safeReturnTo } from "@/lib/independentStudent";

/**
 * "Complete your purchase" — where a student without a covering school lands
 * (paywall ON) when they open a part of the platform their entitlement doesn't
 * include (#429). Unpaid: they can still take every assessment and see the
 * free preview. One-time purchasers: upgrade to a subscription for the rest.
 * The API enforces the same split with 402s.
 */
export default function CompletePurchasePage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { logout } = useGlobalStore();
  const { data: status, refetch, isFetching } = useSubscriptionStatus({ staleTime: 0 });

  // Full platform (webhook landed) → straight in. A one-time purchase is NOT
  // the full platform, so it stays here to see the upgrade option (no loop).
  const hasFullPlatform = status ? (status.hasFullPlatform ?? status.hasActiveSubscription) : false;
  const isOneTime = !!status?.hasPaidAccess && !hasFullPlatform;
  useEffect(() => {
    // audit 2026-10-09 C18: back to the page whose 402 sent them here (apiClient appends ?returnTo=).
    // Read from window, not useSearchParams, so this statically-rendered page needs no Suspense boundary.
    if (hasFullPlatform) router.replace(safeReturnTo(new URLSearchParams(window.location.search).get("returnTo")) ?? "/dashboard");
  }, [hasFullPlatform, router]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          {t(isOneTime ? "independentStudent.completePurchase.upgradeTitle" : "independentStudent.completePurchase.title")}
        </h1>
        <p className="text-gray-600 mb-2">
          {t(isOneTime ? "independentStudent.completePurchase.upgradeBody" : "independentStudent.completePurchase.body")}
        </p>
        <p className="text-gray-500 text-sm mb-6">{t("independentStudent.completePurchase.minors")}</p>

        <div className="mb-6"><ResultsPreviewCard /></div>

        <div className="space-y-3">
          <Link
            href="/dashboard/assessments"
            className="block w-full border border-[var(--admin-accent-blue)] text-[var(--admin-accent-blue)] py-3 px-4 rounded-lg font-semibold hover:bg-gray-50 transition-colors"
          >
            {t(isOneTime ? "independentStudent.completePurchase.goToResults" : "independentStudent.completePurchase.takeAssessments")}
          </Link>
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
