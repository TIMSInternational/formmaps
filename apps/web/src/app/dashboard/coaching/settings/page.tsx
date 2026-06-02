"use client";

import { useState, useEffect } from "react";
import {
  getCoachProfile,
  getAvailability,
  getCoachBankAccount,
  getCoachPayouts,
} from "@/services/coachService";
import type { Coach, Availability, BankAccount, Payout } from "@/types/coach";
import { useGlobalStore } from "@/store/useGlobalStore";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PricingSettingsTab } from "./_components/PricingSettingsTab";
import { AvailabilitySettingsTab } from "./_components/AvailabilitySettingsTab";
import { PaymentSettingsTab } from "./_components/PaymentSettingsTab";
import { BillingSettingsTab } from "./_components/BillingSettingsTab";
import { useTranslation } from "react-i18next";

export default function CoachSettingsPage() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState("pricing");
  const [coachDetails, setCoachDetails] = useState<Coach | null>(null);
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [bankAccount, setBankAccount] = useState<BankAccount | null>(null);
  const [payouts, setPayouts] = useState<Payout[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const { user } = useGlobalStore();

  useEffect(() => {
    const preloadSettings = async () => {
      try {
        setIsLoading(true);
        if (!user?.id) return;
        const [detailsRes, availabilityRes, bankRes, payoutsRes] =
          await Promise.all([
            getCoachProfile(),
            getAvailability(),
            getCoachBankAccount(),
            getCoachPayouts(),
          ]);

        // Normalize — services already unwrap, but handle both shapes defensively
        setCoachDetails(detailsRes || null);
        setAvailability(availabilityRes || null);
        const bankData = (bankRes as { data?: BankAccount })?.data ?? bankRes as BankAccount;
        setBankAccount(bankData || null);

        const payoutItems = payoutsRes?.items ?? [];
        setPayouts(Array.isArray(payoutItems) ? payoutItems : []);
      } catch (e) {
      // error handled silently
    } finally {
        setIsLoading(false);
      }
    };
    // only preload once user is set
    if (user?.id) preloadSettings();
  }, []);

  return (
    <div className="space-y-8">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-muted-foreground">Configuration</p>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">
              Settings
            </h1>
            <p className="text-sm text-muted-foreground">
              Manage your coaching profile, pricing, availability, and payments.
            </p>
          </div>
        </div>

        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="space-y-6"
        >
          <div className="border-b border-[var(--border)]">
            <TabsList className="bg-transparent h-auto p-0 gap-8">
              <TabsTrigger 
                value="pricing" 
                className="rounded-none border-b-2 border-transparent px-2 py-3 data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none font-medium text-muted-foreground hover:text-foreground transition-all"
              >
                Pricing
              </TabsTrigger>
              <TabsTrigger 
                value="availability" 
                className="rounded-none border-b-2 border-transparent px-2 py-3 data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none font-medium text-muted-foreground hover:text-foreground transition-all"
              >
                Availability
              </TabsTrigger>
              <TabsTrigger 
                value="payments" 
                className="rounded-none border-b-2 border-transparent px-2 py-3 data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none font-medium text-muted-foreground hover:text-foreground transition-all"
              >
                Payments
              </TabsTrigger>
              <TabsTrigger 
                value="billing" 
                className="rounded-none border-b-2 border-transparent px-2 py-3 data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none font-medium text-muted-foreground hover:text-foreground transition-all"
              >
                Billing
              </TabsTrigger>
            </TabsList>
          </div>

            <TabsContent value="pricing" className="m-0 focus-visible:ring-0 focus-visible:outline-none">
              <PricingSettingsTab
                coachDetails={coachDetails}
                isLoading={isLoading}
                onUpdated={(newData: Partial<Coach>) =>
                  setCoachDetails((prev) => ({ ...prev, ...newData } as Coach))
                }
              />
            </TabsContent>

            <TabsContent value="availability" className="m-0 focus-visible:ring-0 focus-visible:outline-none">
              <AvailabilitySettingsTab
                availability={availability}
                isLoading={isLoading}
                onUpdated={(newData: Partial<Availability>) =>
                  setAvailability((prev) => ({ ...prev, ...newData } as Availability))
                }
              />
            </TabsContent>

            <TabsContent value="payments" className="m-0 focus-visible:ring-0 focus-visible:outline-none">
              <PaymentSettingsTab
                bankAccount={bankAccount}
                payouts={payouts}
                isLoading={isLoading}
                onBankAccountUpdated={(bank: BankAccount | null) => setBankAccount(bank)}
                onPayoutsUpdated={(p) => setPayouts(p)}
              />
            </TabsContent>

            <TabsContent value="billing" className="m-0 focus-visible:ring-0 focus-visible:outline-none">
              <BillingSettingsTab
                billingCurrent={null}
                billingHistory={null}
                isLoading={isLoading}
              />
            </TabsContent>
        </Tabs>
    </div>
  );
}
