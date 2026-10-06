"use client";
import { motion } from "motion/react";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { FAQ } from "./FAQ";
import { LoadingState } from "./LoadingState";
import { useGlobalStore } from "@/store/useGlobalStore";
import StripeCheckout from "@/components/StripeCheckout";
import { OneTimeReportCard } from "@/components/independent-student/OneTimeReportCard";
import { LegalConsent } from "@/components/legal/LegalConsent";
import {
  EMPTY_LEGAL_CONSENT,
  buildLegalConsentPayload,
  isLegalConsentValid,
  type LegalConsentValues,
} from "@/lib/legal/consent";
import * as subscriptionService from "@/services/subscriptionService";
import { useSubscriptionStatus } from "@/hooks/useSubscription";
import type {
  SubscriptionData,
} from "@/services/subscriptionService";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, Loader2, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";

interface SubscriptionPlansProps {
  className?: string;
}

export function SubscriptionPlans({ className }: SubscriptionPlansProps) {
  const { t, i18n } = useTranslation();
  const { user } = useGlobalStore();
  const [subscriptionData, setSubscriptionData] =
    useState<SubscriptionData | null>(null);

  // Use the new hook for subscription status
  const { data: subscriptionStatus, isLoading: statusLoading } =
    useSubscriptionStatus();

  const [loading, setLoading] = useState(true);
  const [legalConsent, setLegalConsent] = useState<LegalConsentValues>(EMPTY_LEGAL_CONSENT);
  const subscriptionConsent = isLegalConsentValid("checkout-subscription", legalConsent);
  const [error, setError] = useState<string | null>(null);
  const [processingPayment, setProcessingPayment] = useState<string | null>(
    null
  );

  // Real authenticated user id; never a mock — checkout must not run for a
  // missing user (the server authorizes via the session token regardless).
  const userId = user.id || "";

  // Load subscription plans
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const plans = await subscriptionService.fetchSubscriptionPlans();
        setSubscriptionData(plans);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : t("studentUi.subscriptions.loadDataFailed")
        );
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  // Show loading state
  if (loading || statusLoading) {
    return <LoadingState />;
  }

  // Show error state
  if (error || !subscriptionData) {
    return (
      <div className="text-center py-12">
        <div className="text-red-600 mb-4">
          <svg
            className="w-12 h-12 mx-auto mb-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <p className="text-lg font-semibold">
            {t("studentUi.subscriptions.loadPlansFailed")}
          </p>
          <p className="text-sm text-muted-foreground mt-2">{error}</p>
        </div>
        <Button onClick={() => window.location.reload()}>{t("common.tryAgain")}</Button>
      </div>
    );
  }

  const { subscription, billingOptions } = subscriptionData;

  const hasActiveSubscription = subscriptionStatus?.hasActiveSubscription;

  const currentPlan =
    hasActiveSubscription && subscriptionStatus?.planId
      ? subscriptionService.findSubscriptionPlanById(
        subscriptionStatus.planId,
        billingOptions
      )
      : null;

  return (
    <div className={cn("space-y-12", className)}>
      {/* Current Subscription Status */}
      {hasActiveSubscription && currentPlan && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Card className="bg-emerald-50/50 border-emerald-200 shadow-sm">
            <CardContent className="p-6 flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="h-10 w-10 bg-emerald-100 rounded-full flex items-center justify-center">
                  <Check className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-emerald-900 text-lg">
                    {t("studentUi.subscriptions.active.title")}
                  </h3>
                  <p className="text-emerald-700 text-sm">
                    {t("studentUi.subscriptions.active.onPlanPrefix")} <span className="font-medium">{currentPlan.name}</span>{t("studentUi.subscriptions.active.onPlanSuffix")}
                    {subscriptionStatus?.expiryDate && (
                      <span className="opacity-90">
                        {" "}
                        {t("studentUi.subscriptions.active.renewsOn", {
                          date: new Date(subscriptionStatus.expiryDate).toLocaleDateString(i18n.language),
                        })}
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <Badge variant="outline" className="text-emerald-700 border-emerald-200 bg-emerald-100/50 px-3 py-1">
                  {t("studentUi.subscriptions.active.badge")}
                </Badge>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Subscription Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center space-y-4"
      >
        <Badge variant="secondary" className="px-4 py-1.5 text-sm font-medium bg-[var(--admin-accent-blue)]/10 text-[var(--admin-accent-blue)] hover:bg-[var(--admin-accent-blue)]/20 border-[var(--admin-accent-blue)]/20">
          {t("studentUi.subscriptions.upgradeBadge")}
        </Badge>
        <h2 className="text-4xl md:text-5xl font-bold text-foreground tracking-tight">
          {subscription.name}
        </h2>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
          {subscription.description}
        </p>
      </motion.div>

      {/* Checkout consent (#243) — subscription checkout stays disabled until given */}
      <div className="max-w-xl mx-auto mb-6">
        <LegalConsent variant="checkout-subscription" values={legalConsent} onChange={setLegalConsent} />
      </div>

      {/* Billing Options Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-7xl mx-auto">
        {billingOptions.map((option, index) => (
          <motion.div
            key={option.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="flex"
          >
            <Card
              className={cn(
                "flex flex-col w-full relative transition-all duration-300 hover:border-foreground/20",
                option.popular
                  ? "border-[var(--admin-accent-blue)] scale-105 z-10"
                  : "border-border"
              )}
            >
              {option.popular && (
                <div className="absolute -top-4 left-0 right-0 flex justify-center">
                  <Badge className="bg-gradient-to-r from-[var(--admin-accent-blue)] to-[#102B47] text-white shadow-lg border-0 px-4 py-1 h-auto text-sm gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 fill-current" />
                    {t("studentUi.subscriptions.mostPopular")}
                  </Badge>
                </div>
              )}

              <CardHeader className="text-center pb-8 pt-8">
                <CardTitle className="text-2xl font-bold text-foreground">
                  {option.name}
                </CardTitle>
                <CardDescription className="text-base mt-2">
                  {option.description}
                </CardDescription>
              </CardHeader>

              <CardContent className="flex-1 flex flex-col items-center">
                <div className="mb-8 flex items-baseline justify-center">
                  <span className="text-5xl font-bold tracking-tight text-foreground">
                    ${option.price}
                  </span>
                  <span className="text-muted-foreground ml-2 font-medium">/{option.period}</span>
                </div>

                {option.originalPrice && (
                  <div className="mb-6 -mt-4 text-center">
                    <span className="text-sm text-muted-foreground line-through mr-2">
                      ${option.originalPrice}
                    </span>
                    {option.discount && (
                      <Badge variant="outline" className="text-emerald-600 border-emerald-200 bg-emerald-50 text-xs">
                        {t("studentUi.subscriptions.save", { discount: option.discount })}
                      </Badge>
                    )}
                  </div>
                )}

                <div className="w-full space-y-4">
                  {option.features.map((feature, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <div className="mt-1 bg-[var(--admin-accent-blue)]/10 rounded-full p-1">
                        <Check className="w-3.5 h-3.5 text-[var(--admin-accent-blue)]" />
                      </div>
                      <span className="text-muted-foreground text-sm leading-relaxed">
                        {feature}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>

              <CardFooter className="pt-8 pb-8">
                {hasActiveSubscription && currentPlan?.id === option.id ? (
                  <Button disabled variant="secondary" className="w-full h-12 text-base rounded-xl font-medium">
                    {t("studentUi.subscriptions.currentPlan")}
                  </Button>
                ) : (
                  <StripeCheckout
                    amount={option.price * 100}
                    userId={userId}
                    planId={option.id}
                    legalConsent={buildLegalConsentPayload("checkout-subscription", legalConsent)}
                    productName={`${option.name} - ${option.description}`}
                    onStart={() => setProcessingPayment(option.id)}
                    onSuccess={() => {
                      window.location.reload();
                    }}
                    onError={(error: string) => {
                      alert(t("studentUi.subscriptions.paymentFailed", { error }));
                      setProcessingPayment(null);
                    }}
                    disabled={processingPayment !== null || !subscriptionConsent}
                    className="w-full"
                  >
                    <Button
                      className={cn(
                        "w-full h-12 text-base rounded-xl font-medium transition-all",
                        option.popular
                          ? "bg-[var(--admin-accent-blue)] hover:bg-[var(--admin-accent-blue)]/90 text-white"
                          : "bg-foreground hover:bg-foreground/90 text-white"
                      )}
                      disabled={processingPayment !== null || !subscriptionConsent}
                    >
                      {processingPayment === option.id ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          {t("studentUi.subscriptions.processing")}
                        </>
                      ) : (
                        option.ctaText
                      )}
                    </Button>
                  </StripeCheckout>
                )}
              </CardFooter>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* One-time $150 report (D1/D2, #243) — not offered on top of a live subscription */}
      {!hasActiveSubscription && (
        <div className="mt-10 max-w-5xl mx-auto">
          <OneTimeReportCard
            userId={userId}
            onError={(error: string) => alert(t("studentUi.subscriptions.paymentFailed", { error }))}
          />
        </div>
      )}

      {/* FAQ Section */}
      <FAQ className="mt-16 max-w-4xl mx-auto" />
    </div>
  );
}
