"use client";
import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { Check, CheckCircle2, X, Sparkles, Zap, Crown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "react-i18next";
import { useGlobalStore } from "@/store/useGlobalStore";
import StripeCheckout from "@/components/StripeCheckout";
import { useSubscriptionStatus } from "@/hooks/useSubscription";

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

  // If user already has an active subscription, redirect to dashboard
  useEffect(() => {
    if (subStatus?.hasActiveSubscription) {
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

  const plans: Plan[] = [
    {
      id: "starter",
      name: "Starter",
      description: "Begin your career journey",
      price: 9.99,
      period: "month",
      icon: Zap,
      ctaText: "Get Started",
      features: [
        { text: "PCA & MIL Assessments" },
        { text: "Career matching (top 10)" },
        { text: "Basic resume builder" },
        { text: "Course catalog access" },
        { text: "Email support" },
      ],
    },
    {
      id: "pro",
      name: "Pro",
      description: "Full platform access",
      price: 29.99,
      period: "month",
      icon: Sparkles,
      popular: true,
      badge: "Most Popular",
      ctaText: "Start Pro",
      features: [
        { text: "Everything in Starter" },
        { text: "360° Evaluation system", highlighted: true },
        { text: "Full career matching (370+ careers)", highlighted: true },
        { text: "AI-powered resume builder" },
        { text: "University recommendations" },
        { text: "Course plan builder" },
        { text: "Portfolio builder" },
        { text: "1 coaching session / month" },
        { text: "Priority support" },
      ],
    },
    {
      id: "premium",
      name: "Premium",
      description: "Everything unlimited",
      price: 49.99,
      period: "month",
      icon: Crown,
      ctaText: "Go Premium",
      features: [
        { text: "Everything in Pro" },
        { text: "Unlimited coaching sessions", highlighted: true },
        { text: "AI career narrative reports", highlighted: true },
        { text: "Counselor session booking" },
        { text: "Community service tracking" },
        { text: "Senior project support" },
        { text: "Certification tracking" },
        { text: "Dedicated support" },
      ],
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
                <p className="font-semibold" style={{ color: "#102B47" }}>Payment successful!</p>
                <p className="text-sm text-gray-500">Redirecting to dashboard...</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="max-w-6xl mx-auto px-4 py-8 md:py-10">
        {/* Brand mark */}
        <div className="flex items-center justify-center gap-2 mb-5">
          <img src="/fm-icon.png" alt="FormMaps" className="w-8 h-8" />
          <div className="flex items-center">
            <span className="text-lg font-bold tracking-tight" style={{ color: "#102B47" }}>FORM</span>
            <span className="text-lg font-bold tracking-tight" style={{ color: "#2E9098" }}>MAPS</span>
          </div>
        </div>

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <Badge className="mb-3 border-0 px-4 py-1.5 font-semibold" style={{ background: "rgba(46,144,152,0.1)", color: "#2E9098" }}>
            Choose Your Plan
          </Badge>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-2" style={{ color: "#102B47" }}>
            Invest in Your Future
          </h1>
          <p className="text-base text-gray-500 max-w-xl mx-auto">
            Unlock AI-powered career tools, assessments, and personalized guidance to accelerate your professional journey.
          </p>
          <p className="text-sm font-semibold mt-2" style={{ color: "#2E9098" }}>
            Start with a 7-day free trial. No charge until your trial ends.
          </p>
        </motion.div>

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
                style={plan.popular ? { borderColor: "#2E9098", boxShadow: "0 10px 30px rgba(46,144,152,0.15)" } : undefined}
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
                    onStart={() => setProcessingPlan(plan.id)}
                    onSuccess={() => window.location.reload()}
                    onError={(error: string) => {
                      alert(`Payment failed: ${error}`);
                      setProcessingPlan(null);
                    }}
                    disabled={processingPlan !== null}
                    className="w-full mb-5"
                  >
                    <Button
                      className="w-full h-11 rounded-xl font-semibold text-base transition-all shadow-sm hover:shadow-md"
                      style={
                        plan.popular
                          ? { background: "#102B47", color: "#fff" }
                          : { background: "#fff", color: "#2E9098", border: "1px solid #2E9098" }
                      }
                      disabled={processingPlan !== null}
                    >
                      {processingPlan === plan.id ? (
                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Processing...</>
                      ) : (
                        plan.ctaText
                      )}
                    </Button>
                  </StripeCheckout>

                  {/* Features */}
                  <div className="space-y-2">
                    {plan.features.map((feature, j) => (
                      <div key={j} className="flex items-start gap-3">
                        <Check className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: feature.highlighted ? "#2E9098" : "#9ca3af" }} />
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

        {/* Bottom note */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-center text-sm text-gray-400 mt-8"
        >
          Cancel anytime. Secure payments via Stripe.
        </motion.p>
      </div>
    </div>
  );
}
