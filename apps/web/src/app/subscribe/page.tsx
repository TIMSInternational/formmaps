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
  gradient: string;
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
      gradient: "from-slate-600 to-slate-800",
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
      gradient: "from-blue-600 to-indigo-600",
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
      gradient: "from-purple-600 to-pink-600",
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
    <div className="min-h-[100dvh] w-full bg-gradient-to-b from-slate-50 via-white to-blue-50/30">
      {/* Success toast */}
      <AnimatePresence>
        {showSuccess && (
          <motion.div
            initial={{ opacity: 0, y: -30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -30 }}
            className="fixed top-6 left-1/2 -translate-x-1/2 z-50"
          >
            <div className="bg-white shadow-2xl rounded-2xl px-6 py-4 border border-green-100 flex items-center gap-3">
              <CheckCircle2 className="w-6 h-6 text-green-600" />
              <div>
                <p className="font-semibold text-gray-900">Payment successful!</p>
                <p className="text-sm text-gray-500">Redirecting to dashboard...</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="max-w-6xl mx-auto px-4 py-16 md:py-24">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-16"
        >
          <Badge className="mb-4 bg-blue-50 text-blue-700 border-blue-100 hover:bg-blue-100 px-4 py-1.5">
            Choose Your Plan
          </Badge>
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 tracking-tight mb-4">
            Invest in Your Future
          </h1>
          <p className="text-lg text-gray-500 max-w-xl mx-auto">
            Unlock AI-powered career tools, assessments, and personalized guidance to accelerate your professional journey.
          </p>
        </motion.div>

        {/* Plans */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 items-start">
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
                    ? "border-blue-200 shadow-lg shadow-blue-100/50 scale-[1.02]"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                {plan.badge && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                    <Badge className={`bg-gradient-to-r ${plan.gradient} text-white border-0 px-4 py-1 shadow-lg`}>
                      <Sparkles className="w-3 h-3 mr-1" />
                      {plan.badge}
                    </Badge>
                  </div>
                )}

                <div className="p-8">
                  {/* Icon + Name */}
                  <div className="flex items-center gap-3 mb-4">
                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${plan.gradient} flex items-center justify-center`}>
                      <Icon className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-gray-900">{plan.name}</h3>
                      <p className="text-sm text-gray-500">{plan.description}</p>
                    </div>
                  </div>

                  {/* Price */}
                  <div className="flex items-baseline gap-1 mb-8">
                    <span className="text-4xl font-bold text-gray-900">${plan.price}</span>
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
                    className="w-full mb-8"
                  >
                    <Button
                      className={`w-full h-12 rounded-xl font-semibold text-base transition-all ${
                        plan.popular
                          ? `bg-gradient-to-r ${plan.gradient} text-white shadow-md hover:shadow-lg hover:opacity-95`
                          : "bg-gray-900 text-white hover:bg-gray-800"
                      }`}
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
                  <div className="space-y-3">
                    {plan.features.map((feature, j) => (
                      <div key={j} className="flex items-start gap-3">
                        <Check className={`w-4 h-4 mt-0.5 flex-shrink-0 ${feature.highlighted ? "text-blue-600" : "text-gray-400"}`} />
                        <span className={`text-sm ${feature.highlighted ? "text-gray-900 font-medium" : "text-gray-600"}`}>
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
          className="text-center text-sm text-gray-400 mt-12"
        >
          Cancel anytime. Secure payments via Stripe.
        </motion.p>
      </div>
    </div>
  );
}
