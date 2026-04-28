"use client";
import { motion } from "motion/react";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { FAQ } from "./FAQ";
import { LoadingState } from "./LoadingState";
import { useGlobalStore } from "@/store/useGlobalStore";
import StripeCheckout from "@/components/StripeCheckout";
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

interface SubscriptionPlansProps {
  className?: string;
}

export function SubscriptionPlans({ className }: SubscriptionPlansProps) {
  const { user } = useGlobalStore();
  const [subscriptionData, setSubscriptionData] =
    useState<SubscriptionData | null>(null);

  // Use the new hook for subscription status
  const { data: subscriptionStatus, isLoading: statusLoading } =
    useSubscriptionStatus();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processingPayment, setProcessingPayment] = useState<string | null>(
    null
  );

  // Get user ID from global store, fallback to mock for development
  const userId = user.id || "user-123";

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
            : "Failed to load subscription data"
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
            Failed to load subscription plans
          </p>
          <p className="text-sm text-muted-foreground mt-2">{error}</p>
        </div>
        <Button onClick={() => window.location.reload()}>Try Again</Button>
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
                    Active Subscription
                  </h3>
                  <p className="text-emerald-700 text-sm">
                    You are currently on the <span className="font-medium">{currentPlan.name}</span> plan.
                    {subscriptionStatus?.expiryDate && (
                      <span className="opacity-90">
                        {" "}
                        Renews on{" "}
                        {new Date(
                          subscriptionStatus.expiryDate
                        ).toLocaleDateString()}
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <Badge variant="outline" className="text-emerald-700 border-emerald-200 bg-emerald-100/50 px-3 py-1">
                  Active
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
        <Badge variant="secondary" className="px-4 py-1.5 text-sm font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-100">
          Upgrade Your Experience
        </Badge>
        <h2 className="text-4xl md:text-5xl font-bold text-foreground tracking-tight">
          {subscription.name}
        </h2>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
          {subscription.description}
        </p>
      </motion.div>

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
                  ? "border-blue-500 scale-105 z-10"
                  : "border-border"
              )}
            >
              {option.popular && (
                <div className="absolute -top-4 left-0 right-0 flex justify-center">
                  <Badge className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg border-0 px-4 py-1 h-auto text-sm gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 fill-current" />
                    Most Popular
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
                        Save {option.discount}%
                      </Badge>
                    )}
                  </div>
                )}

                <div className="w-full space-y-4">
                  {option.features.map((feature, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <div className="mt-1 bg-blue-50 rounded-full p-1">
                        <Check className="w-3.5 h-3.5 text-blue-600" />
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
                    Current Plan
                  </Button>
                ) : (
                  <StripeCheckout
                    amount={option.price * 100}
                    userId={userId}
                    planId={option.id}
                    productName={`${option.name} - ${option.description}`}
                    onStart={() => setProcessingPayment(option.id)}
                    onSuccess={() => {
                      window.location.reload();
                    }}
                    onError={(error: string) => {
                      alert(`Payment failed: ${error}`);
                      setProcessingPayment(null);
                    }}
                    disabled={processingPayment !== null}
                    className="w-full"
                  >
                    <Button
                      className={cn(
                        "w-full h-12 text-base rounded-xl font-medium transition-all",
                        option.popular
                          ? "bg-blue-600 hover:bg-blue-700 text-white"
                          : "bg-foreground hover:bg-foreground/90 text-white"
                      )}
                      disabled={processingPayment !== null}
                    >
                      {processingPayment === option.id ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Processing...
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

      {/* FAQ Section */}
      <FAQ className="mt-16 max-w-4xl mx-auto" />
    </div>
  );
}
