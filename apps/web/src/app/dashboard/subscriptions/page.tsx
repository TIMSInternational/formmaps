"use client";
import { useState } from "react";
import { motion } from "motion/react";
import { Check, Sparkles, Zap, Crown, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useGlobalStore } from "@/store/useGlobalStore";
import { useSubscriptionStatus } from "@/hooks/useSubscription";
import StripeCheckout from "@/components/StripeCheckout";

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
  gradient: string;
}

const plans: Plan[] = [
  {
    id: "starter",
    name: "Starter",
    description: "Begin your career journey",
    price: 9.99,
    period: "month",
    icon: Zap,
    gradient: "from-slate-600 to-slate-800",
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
    gradient: "from-blue-600 to-indigo-600",
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

export default function SubscriptionsPage() {
  const { user } = useGlobalStore();
  const { data: subStatus } = useSubscriptionStatus();
  const [processingPlan, setProcessingPlan] = useState<string | null>(null);
  const userId = user.id || "";
  const hasActive = subStatus?.hasActiveSubscription;

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Subscriptions</h1>
        <p className="text-gray-500 mt-1">Manage your plan and billing</p>
      </div>

      {/* Active subscription banner */}
      {hasActive && (
        <Card className="bg-emerald-50/50 border-emerald-200">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-emerald-900">Active Subscription</p>
              <p className="text-sm text-emerald-700">
                You have full access to the platform.
                {subStatus?.expiryDate && (
                  <span> Renews {new Date(subStatus.expiryDate).toLocaleDateString()}</span>
                )}
              </p>
            </div>
            <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">Active</Badge>
          </CardContent>
        </Card>
      )}

      {/* Plans */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
        {plans.map((plan, i) => {
          const Icon = plan.icon;
          return (
            <motion.div
              key={plan.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              className={`relative rounded-2xl border bg-white transition-all hover:shadow-lg ${
                plan.popular
                  ? "border-blue-200 shadow-md"
                  : "border-gray-200"
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className={`bg-gradient-to-r ${plan.gradient} text-white border-0 px-3 py-0.5 shadow`}>
                    <Sparkles className="w-3 h-3 mr-1" /> Most Popular
                  </Badge>
                </div>
              )}

              <div className="p-6">
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${plan.gradient} flex items-center justify-center`}>
                    <Icon className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900">{plan.name}</h3>
                    <p className="text-xs text-gray-500">{plan.description}</p>
                  </div>
                </div>

                <div className="flex items-baseline gap-1 mb-6">
                  <span className="text-3xl font-bold text-gray-900">${plan.price}</span>
                  <span className="text-gray-400 text-sm">/{plan.period}</span>
                </div>

                {hasActive ? (
                  <Button variant="outline" disabled className="w-full mb-6 rounded-xl h-10">
                    Current Plan
                  </Button>
                ) : (
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
                    className="w-full mb-6"
                  >
                    <Button
                      className={`w-full h-10 rounded-xl font-semibold ${
                        plan.popular
                          ? `bg-gradient-to-r ${plan.gradient} text-white`
                          : "bg-gray-900 text-white hover:bg-gray-800"
                      }`}
                      disabled={processingPlan !== null}
                    >
                      {processingPlan === plan.id ? (
                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Processing...</>
                      ) : (
                        `Get ${plan.name}`
                      )}
                    </Button>
                  </StripeCheckout>
                )}

                <div className="space-y-2.5">
                  {plan.features.map((f, j) => (
                    <div key={j} className="flex items-start gap-2.5">
                      <Check className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${f.highlighted ? "text-blue-600" : "text-gray-400"}`} />
                      <span className={`text-sm ${f.highlighted ? "text-gray-900 font-medium" : "text-gray-600"}`}>
                        {f.text}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
