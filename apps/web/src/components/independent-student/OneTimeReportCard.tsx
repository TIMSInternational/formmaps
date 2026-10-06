"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FileText, Loader2 } from "lucide-react";
import StripeCheckout from "@/components/StripeCheckout";
import { Button } from "@/components/ui/button";
import { CheckoutConsent } from "./CheckoutConsent";

/** Catalog key the API maps to the $150 USD one-time purchase (formmaps-platform#440). */
export const ONE_TIME_PLAN_ID = "one_time";
export const ONE_TIME_PRICE_USD = 150;

/**
 * The one-time $150 report (D1/D2, #243): take the assessments, get all the
 * results, download the reports — nothing else, no expiry. The price shown is
 * display only; the API charges its own catalog price.
 */
export function OneTimeReportCard({ userId, disabled, onStart, onError }: {
  userId: string;
  disabled?: boolean;
  onStart?: () => void;
  onError?: (error: string) => void;
}) {
  const { t } = useTranslation();
  const [consented, setConsented] = useState(false);
  const [processing, setProcessing] = useState(false);
  const features = t("independentStudent.oneTime.features", { returnObjects: true });
  const list = Array.isArray(features) ? (features as string[]) : [];
  const blocked = disabled || processing || !consented;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm md:flex md:items-center md:gap-8" data-testid="one-time-card">
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1">
          <FileText className="w-5 h-5" style={{ color: "var(--admin-accent-blue)" }} />
          <h3 className="text-lg font-bold" style={{ color: "#102B47" }}>{t("independentStudent.oneTime.name")}</h3>
        </div>
        <p className="text-sm text-gray-600 mb-3">{t("independentStudent.oneTime.description")}</p>
        <ul className="text-sm text-gray-700 space-y-1 mb-2">
          {list.map((f) => <li key={f}>• {f}</li>)}
        </ul>
        <p className="text-xs text-gray-500">{t("independentStudent.oneTime.notIncluded")}</p>
      </div>
      <div className="mt-4 md:mt-0 md:w-64 space-y-3">
        <div className="flex items-baseline gap-1">
          <span className="text-3xl font-bold" style={{ color: "#102B47" }}>${ONE_TIME_PRICE_USD}</span>
          <span className="text-gray-400 font-medium">{t("independentStudent.oneTime.period")}</span>
        </div>
        <CheckoutConsent variant="checkout-one-time" onValidityChange={setConsented} />
        <StripeCheckout
          amount={ONE_TIME_PRICE_USD * 100}
          userId={userId}
          planId={ONE_TIME_PLAN_ID}
          productName={t("independentStudent.oneTime.name")}
          onStart={() => { setProcessing(true); onStart?.(); }}
          onError={(e: string) => { setProcessing(false); onError?.(e); }}
          disabled={blocked}
          className="w-full"
        >
          <Button className="w-full h-11 rounded-xl font-semibold" style={{ background: "#102B47", color: "#fff" }} disabled={blocked}>
            {processing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> {t("subscribe.processing")}</> : t("independentStudent.oneTime.cta")}
          </Button>
        </StripeCheckout>
      </div>
    </div>
  );
}
