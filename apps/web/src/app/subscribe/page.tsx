"use client";
import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { Check, CheckCircle2, X, Sparkles, Zap, Crown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OneTimeReportCard } from "@/components/independent-student/OneTimeReportCard";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "react-i18next";
import { useGlobalStore } from "@/store/useGlobalStore";
import StripeCheckout from "@/components/StripeCheckout";
import { useSubscriptionStatus } from "@/hooks/useSubscription";
import { LegalConsent } from "@/components/legal/LegalConsent";
import { LegalFooter } from "@/components/legal/LegalFooter";
import {
  EMPTY_LEGAL_CONSENT,
  buildLegalConsentPayload,
  isLegalConsentValid,
  type LegalConsentValues,
} from "@/lib/legal/consent";

interface PlanFeature {
  text: string;
  highlighted?: boolean;
}

interface Plan {
  id: string;
  name: string;
  description: string;
  price: number;
  period: string;
  icon: typeof Zap;
  features: PlanFeature[];
  popular?: boolean;
  ctaText: string;
  badge?: string;
}

export default function SubscribePage() {
  const { t } = useTranslation();
  const { user } = useGlobalStore();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showSuccess, setShowSuccess] = useState(false);
  const [processingPlan, setProcessingPlan] = useState<string | null>(null);
  const { data: subStatus, refetch: refetchSub } = useSubscriptionStatus({
    staleTime: 0, // Always refetch on the subscribe page — never trust cached "no subscription"
  });

  const userId = user.id || "";
  // Auto-renewal / trial / refund acknowledgement — required before any plan's checkout starts.
  // The store has no DOB here, so the parent box is not shown on this page: minors already confirmed
  // parent/guardian permission at signup. Pass isMinor / isParentPurchaser once the paid-entry flow knows them.
  const [legalConsent, setLegalConsent] = useState<LegalConsentValues>(EMPTY_LEGAL_CONSENT);
  const consentValid = isLegalConsentValid("checkout-subscription", legalConsent);

  // If user already has an active subscription, redirect to dashboard
  useEffect(() => {
    // A one-time purchase (#429) is not the full platform — let them upgrade here.
    if (subStatus && (subStatus.hasFullPlatform ?? subStatus.hasActiveSubscription)) {
      router.push("/dashboard");
    }
  }, [subStatus, router]);

  useEffect(() => {
    const success = searchParams.get("success");
    const sessionId = searchParams.get("session_id");

    if (success === "true" && sessionId) {
      // Invalidate stale subscription cache immediately
      refetchSub();
      setShowSuccess(true);
      setTimeout(() => {
        setShowSuccess(false);
        router.push("/dashboard");
      }, 3000);

      const url = new URL(window.location.href);
      url.searchParams.delete("success");
      url.searchParams.delete("session_id");
      window.history.replaceState({}, "", url.toString());
    }
  }, [searchParams, router, refetchSub]);

  const featureList = (planId: string): PlanFeature[] => {
    const texts = t(`subscribe.plans.${planId}.features`, { returnObjects: true });
    return Array.isArray(texts) ? texts.map((text) => ({ text: String(text) })) : [];
  };
  const highlight = (features: PlanFeature[], indexes: number[]): PlanFeature[] =>
    features.map((f, idx) => (indexes.includes(idx) ? { ...f, highlighted: true } : f));

  const plans: Plan[] = [
    {
      id: "starter",
      name: t("subscribe.plans.starter.name"),
      description: t("subscribe.plans.starter.description"),
      price: 9.99,
      period: t("subscribe.perMonth"),
      icon: Zap,
      ctaText: t("subscribe.plans.starter.ctaText"),
      features: featureList("starter"),
    },
    {
      id: "pro",
      name: t("subscribe.plans.pro.name"),
      description: t("subscribe.plans.pro.description"),
      price: 29.99,
      period: t("subscribe.perMonth"),
      icon: Sparkles,
      popular: true,
      badge: t("subscribe.plans.pro.badge"),
      ctaText: t("subscribe.plans.pro.ctaText"),
      // "360° Evaluation system" and "Full career matching" are highlighted
      features: highlight(featureList("pro"), [1, 2]),
    },
    {
      id: "premium",
      name: t("subscribe.plans.premium.name"),
      description: t("subscribe.plans.premium.description"),
      price: 49.99,
      period: t("subscribe.perMonth"),
      icon: Crown,
      ctaText: t("subscribe.plans.premium.ctaText"),
      // "Unlimited coaching sessions" and "AI career narrative reports" are highlighted
      features: highlight(featureList("premium"), [1, 2]),
    },
  ];

  return (
    <div className="min-h-[100dvh] w-full bg-gradient-to-b from-[#f5f8fc] to-white">
      {/* Success toast */}
      <AnimatePresence>
        {showSuccess && (
          <motion.div
            initial={{ opacity: 0, y: -30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -30 }}
            className="fixed top-6 left-1/2 -translate-x-1/2 z-50"
          >
            <div className="bg-white shadow-2xl rounded-2xl px-6 py-4 border border-[#059669]/20 flex items-center gap-3">
              <CheckCircle2 className="w-6 h-6" style={{ color: "#059669" }} />
              <div>
                <p className="font-semibold" style={{ color: "#102B47" }}>{t("subscribe.successToastTitle")}</p>
                <p className="text-sm text-gray-500">{t("subscribe.successToastText")}</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="max-w-6xl mx-auto px-4 py-8 md:py-10">
        {/* Brand mark */}
        <div className="flex items-center justify-center gap-2 mb-5">
          <img src="/fm-icon.png" alt="FormMaps" className="h-8 w-auto" />
          <div className="flex items-center">
            <span className="text-lg font-bold tracking-tight" style={{ color: "#102B47" }}>FORM</span>
            <span className="text-lg font-bold tracking-tight" style={{ color: "var(--admin-accent-blue)" }}>MAPS</span>
          </div>
        </div>

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <Badge className="mb-3 border-0 px-4 py-1.5 font-semibold" style={{ background: "rgba(46,144,152,0.1)", color: "var(--admin-accent-blue)" }}>
            {t("subscribe.chooseBadge")}
          </Badge>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-2" style={{ color: "#102B47" }}>
            {t("subscribe.heading")}
          </h1>
          <p className="text-base text-gray-500 max-w-xl mx-auto">
            {t("subscribe.subheading")}
          </p>
          <p className="text-sm font-semibold mt-2" style={{ color: "var(--admin-accent-blue)" }}>
            {t("subscribe.trialNote")}
          </p>
        </motion.div>

        {/* Required legal acknowledgement (covers every plan below) */}
        <div className="max-w-2xl mx-auto mb-8 rounded-xl border border-gray-200 bg-white p-4" data-testid="subscribe-legal-consent">
          <LegalConsent
            variant="checkout-subscription"
            values={legalConsent}
            onChange={setLegalConsent}
          />
        </div>

        {/* Plans */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 lg:gap-6 items-start">
          {plans.map((plan, i) => {
            const Icon = plan.icon;
            return (
              <motion.div
                key={plan.id}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                className={`relative rounded-2xl border bg-white transition-all duration-300 hover:shadow-xl ${
                  plan.popular
                    ? "shadow-lg scale-[1.02]"
                    : "border-gray-200 hover:border-gray-300"
                }`}
                style={plan.popular ? { borderColor: "var(--admin-accent-blue)", boxShadow: "0 10px 30px rgba(46,144,152,0.15)" } : undefined}
              >
                {plan.badge && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                    <Badge className="text-white border-0 px-4 py-1 shadow-lg" style={{ background: "#102B47" }}>
                      <Sparkles className="w-3 h-3 mr-1" />
                      {plan.badge}
                    </Badge>
                  </div>
                )}

                <div className="p-6">
                  {/* Icon + Name */}
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "#102B47" }}>
                      <Icon className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold" style={{ color: "#102B47" }}>{plan.name}</h3>
                      <p className="text-sm text-gray-500">{plan.description}</p>
                    </div>
                  </div>

                  {/* Price */}
                  <div className="flex items-baseline gap-1 mb-4">
                    <span className="text-3xl font-bold" style={{ color: "#102B47" }}>${plan.price}</span>
                    <span className="text-gray-400 font-medium">/{plan.period}</span>
                  </div>

                  {/* CTA */}
                  <StripeCheckout
                    amount={plan.price * 100}
                    userId={userId}
                    planId={plan.id}
                    productName={`${plan.name} Plan`}
                    legalConsent={buildLegalConsentPayload("checkout-subscription", legalConsent)}
                    onStart={() => setProcessingPlan(plan.id)}
                    onSuccess={() => window.location.reload()}
                    onError={(error: string) => {
                      alert(t("pages.subscribe.paymentFailed", { error }));
                      setProcessingPlan(null);
                    }}
                    disabled={processingPlan !== null || !consentValid}
                    className="w-full mb-5"
                  >
                    <Button
                      className="w-full h-11 rounded-xl font-semibold text-base transition-all shadow-sm hover:shadow-md"
                      style={
                        plan.popular
                          ? { background: "#102B47", color: "#fff" }
                          : { background: "#fff", color: "var(--admin-accent-blue)", border: "1px solid var(--admin-accent-blue)" }
                      }
                      disabled={processingPlan !== null || !consentValid}
                    >
                      {processingPlan === plan.id ? (
                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> {t("subscribe.processing")}</>
                      ) : (
                        plan.ctaText
                      )}
                    </Button>
                  </StripeCheckout>

                  {/* Features */}
                  <div className="space-y-2">
                    {plan.features.map((feature, j) => (
                      <div key={j} className="flex items-start gap-3">
                        <Check className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: feature.highlighted ? "var(--admin-accent-blue)" : "#9ca3af" }} />
                        <span className={`text-sm ${feature.highlighted ? "font-medium" : ""}`} style={{ color: feature.highlighted ? "#102B47" : "#4b5563" }}>
                          {feature.text}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* One-time $150 report (D1/D2, #243) */}
        <div className="mt-6">
          <OneTimeReportCard
            userId={userId}
            disabled={processingPlan !== null}
            onStart={() => setProcessingPlan("one_time")}
            onError={(error: string) => {
              alert(t("pages.subscribe.paymentFailed", { error }));
              setProcessingPlan(null);
            }}
          />
        </div>

        {/* Bottom note */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-center text-sm text-gray-400 mt-8"
        >
          {t("subscribe.bottomNote")}
        </motion.p>
        <LegalFooter className="mt-6" />
      </div>
    </div>
  );
}
