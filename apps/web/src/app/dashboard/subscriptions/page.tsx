"use client";
import { useState } from "react";
import { Check, Sparkles, Zap, Crown, Loader2, CheckCircle2, ArrowLeft, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useGlobalStore } from "@/store/useGlobalStore";
import { useSubscriptionStatus, useSubscriptionPlans } from "@/hooks/useSubscription";
import StripeCheckout from "@/components/StripeCheckout";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { SubscriptionPlan } from "@/services/subscriptionStatusService";

// Fallback plans used only if backend returns nothing
const FALLBACK_PLANS = [
  {
    id: "starter",
    name: "Starter",
    price: 9.99,
    interval: "monthly",
    features: [
      "PCA & MIL Assessments",
      "Career matching (top 10)",
      "Basic resume builder",
      "Course catalog access",
      "Email support",
    ],
    isActive: true,
  },
  {
    id: "pro",
    name: "Pro",
    price: 29.99,
    interval: "monthly",
    features: [
      "Everything in Starter",
      "360° Evaluation system",
      "Full career matching (370+ careers)",
      "AI-powered resume builder",
      "University recommendations",
      "Course plan builder",
      "Portfolio builder",
      "1 coaching session / month",
      "Priority support",
    ],
    isActive: true,
  },
  {
    id: "premium",
    name: "Premium",
    price: 49.99,
    interval: "monthly",
    features: [
      "Everything in Pro",
      "Unlimited coaching sessions",
      "AI career narrative reports",
      "Counselor session booking",
      "Community service tracking",
      "Senior project support",
      "Certification tracking",
      "Dedicated support",
    ],
    isActive: true,
  },
];

const PLAN_STYLES: Record<string, { icon: typeof Zap; gradient: string; popular?: boolean }> = {
  starter: { icon: Zap, gradient: "from-slate-600 to-slate-800" },
  pro: { icon: Sparkles, gradient: "from-blue-600 to-indigo-600", popular: true },
  premium: { icon: Crown, gradient: "from-purple-600 to-pink-600" },
};

const DEFAULT_STYLE = { icon: Zap, gradient: "from-slate-600 to-slate-800" };

function getPlanStyle(planId: string) {
  return PLAN_STYLES[planId.toLowerCase()] || DEFAULT_STYLE;
}

export default function SubscriptionsPage() {
  const { user } = useGlobalStore();
  const router = useRouter();
  const { data: subStatus, isLoading: statusLoading } = useSubscriptionStatus();
  const { data: backendPlans, isLoading: plansLoading } = useSubscriptionPlans();
  const [processingPlan, setProcessingPlan] = useState<string | null>(null);
  const userId = user.id || "";

  // Redirect school students away from this page
  if (subStatus?.planId === "school") {
    router.replace("/dashboard");
    return null;
  }

  const isLoading = statusLoading || plansLoading;
  const plans: SubscriptionPlan[] = backendPlans?.length ? backendPlans : FALLBACK_PLANS;
  const hasActive = subStatus?.hasActiveSubscription;
  const currentPlanId = subStatus?.planId;
  const interval = plans[0]?.interval === "yearly" ? "year" : "month";

  if (isLoading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "50vh", gap: 8 }}>
        <Loader2 style={{ width: 20, height: 20, animation: "spin 1s linear infinite", color: "var(--admin-font-tertiary)" }} />
        <span style={{ fontSize: 13, color: "var(--admin-font-tertiary)" }}>Loading plans...</span>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 960, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <Link
          href="/dashboard"
          style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            fontSize: 12, fontWeight: 500, color: "var(--admin-font-tertiary)",
            textDecoration: "none", marginBottom: 8,
          }}
        >
          <ArrowLeft style={{ width: 12, height: 12 }} />
          Dashboard
        </Link>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: "var(--admin-font-primary)", marginTop: 4 }}>
          Subscriptions
        </h1>
        <p style={{ fontSize: 13, color: "var(--admin-font-tertiary)", marginTop: 4 }}>
          Manage your plan and billing
        </p>
      </div>

      {/* Active subscription banner */}
      {hasActive && currentPlanId && (
        <div style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "14px 16px", borderRadius: 8, marginBottom: 20,
          background: "var(--admin-bg-card)", border: "1px solid var(--admin-border-default)",
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: "50%",
            background: "var(--admin-accent-bg-green)", border: "1px solid var(--admin-accent-border-green)",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <CheckCircle2 style={{ width: 18, height: 18, color: "var(--admin-accent-green)" }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--admin-font-primary)" }}>
              Active Subscription
            </div>
            <div style={{ fontSize: 12, color: "var(--admin-font-tertiary)", marginTop: 2 }}>
              You&apos;re on the <strong style={{ color: "var(--admin-font-primary)" }}>
                {plans.find(p => p.id === currentPlanId)?.name || currentPlanId}
              </strong> plan.
              {subStatus?.expiryDate && (
                <> Renews {new Date(subStatus.expiryDate).toLocaleDateString()}</>
              )}
            </div>
          </div>
          <Badge style={{
            background: "var(--admin-accent-bg-green)",
            color: "var(--admin-accent-green)",
            border: "1px solid var(--admin-accent-border-green)",
            fontSize: 11, fontWeight: 600,
          }}>
            Active
          </Badge>
        </div>
      )}

      {/* No subscription warning */}
      {!hasActive && subStatus && (
        <div style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "14px 16px", borderRadius: 8, marginBottom: 20,
          background: "var(--admin-accent-bg-amber)", border: "1px solid var(--admin-accent-border-amber)",
        }}>
          <AlertCircle style={{ width: 18, height: 18, color: "var(--admin-accent-amber)", flexShrink: 0 }} />
          <div style={{ fontSize: 13, color: "var(--admin-font-secondary)" }}>
            You don&apos;t have an active subscription. Choose a plan below to get started.
          </div>
        </div>
      )}

      {/* Plans Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
        {plans.map((plan) => {
          const style = getPlanStyle(plan.id || plan.name);
          const Icon = style.icon;
          const isCurrentPlan = currentPlanId === plan.id;

          return (
            <div
              key={plan.id}
              style={{
                position: "relative",
                background: "var(--admin-bg-card)",
                border: `1px solid ${isCurrentPlan ? "var(--admin-accent-green)" : style.popular ? "var(--admin-accent-blue)" : "var(--admin-border-default)"}`,
                borderRadius: 8,
                overflow: "hidden",
              }}
            >
              {/* Popular badge */}
              {style.popular && !isCurrentPlan && (
                <div style={{
                  position: "absolute", top: -1, left: "50%", transform: "translateX(-50%)",
                  padding: "3px 12px", borderRadius: "0 0 6px 6px",
                  background: "var(--admin-accent-blue)", color: "#fff",
                  fontSize: 10, fontWeight: 600, letterSpacing: "0.03em",
                }}>
                  Most Popular
                </div>
              )}

              {/* Current plan badge */}
              {isCurrentPlan && (
                <div style={{
                  position: "absolute", top: -1, left: "50%", transform: "translateX(-50%)",
                  padding: "3px 12px", borderRadius: "0 0 6px 6px",
                  background: "var(--admin-accent-green)", color: "#fff",
                  fontSize: 10, fontWeight: 600, letterSpacing: "0.03em",
                }}>
                  Current Plan
                </div>
              )}

              <div style={{ padding: 20 }}>
                {/* Plan header */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, marginTop: style.popular || isCurrentPlan ? 8 : 0 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: 6,
                    background: `linear-gradient(135deg, var(--admin-accent-blue), var(--admin-accent-purple, #8b5cf6))`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <Icon style={{ width: 16, height: 16, color: "#fff" }} />
                  </div>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: "var(--admin-font-primary)" }}>{plan.name}</div>
                  </div>
                </div>

                {/* Price */}
                <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 16 }}>
                  <span style={{ fontSize: 28, fontWeight: 700, color: "var(--admin-font-primary)" }}>
                    ${plan.price}
                  </span>
                  <span style={{ fontSize: 13, color: "var(--admin-font-tertiary)" }}>
                    /{plan.interval === "yearly" ? "year" : "month"}
                  </span>
                </div>

                {/* CTA button */}
                {isCurrentPlan ? (
                  <div style={{
                    width: "100%", height: 36, borderRadius: 6, marginBottom: 16,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: "var(--admin-bg-card-hover)", color: "var(--admin-font-tertiary)",
                    fontSize: 13, fontWeight: 500, border: "1px solid var(--admin-border-default)",
                  }}>
                    <CheckCircle2 style={{ width: 14, height: 14, marginRight: 6, color: "var(--admin-accent-green)" }} />
                    Current Plan
                  </div>
                ) : hasActive ? (
                  <button
                    onClick={() => router.push("/subscribe")}
                    style={{
                      width: "100%", height: 36, borderRadius: 6, marginBottom: 16,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      background: "transparent", color: "var(--admin-font-secondary)",
                      fontSize: 13, fontWeight: 500, border: "1px solid var(--admin-border-default)",
                      cursor: "pointer",
                    }}
                  >
                    Switch Plan
                  </button>
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
                    className="w-full"
                  >
                    <button
                      disabled={processingPlan !== null}
                      style={{
                        width: "100%", height: 36, borderRadius: 6, marginBottom: 16,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        background: style.popular ? "var(--admin-accent-blue)" : "var(--admin-font-primary)",
                        color: "#fff", fontSize: 13, fontWeight: 600,
                        border: "none", cursor: processingPlan ? "not-allowed" : "pointer",
                        opacity: processingPlan !== null ? 0.5 : 1,
                      }}
                    >
                      {processingPlan === plan.id ? (
                        <><Loader2 style={{ width: 14, height: 14, marginRight: 6, animation: "spin 1s linear infinite" }} /> Processing...</>
                      ) : (
                        `Get ${plan.name}`
                      )}
                    </button>
                  </StripeCheckout>
                )}

                {/* Features */}
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {plan.features.map((feature, j) => (
                    <div key={j} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                      <Check style={{
                        width: 14, height: 14, marginTop: 1, flexShrink: 0,
                        color: "var(--admin-accent-green)",
                      }} />
                      <span style={{ fontSize: 13, color: "var(--admin-font-secondary)" }}>
                        {feature}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
