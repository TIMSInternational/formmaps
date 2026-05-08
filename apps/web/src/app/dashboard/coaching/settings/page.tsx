"use client";

import { useState, useEffect } from "react";
import {
  getCoachProfile,
  getAvailability,
  getCoachBankAccount,
  getCoachPayouts,
} from "@/services/coachService";
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
  const [coachDetails, setCoachDetails] = useState<any | null>(null);
  const [availability, setAvailability] = useState<any | null>(null);
  const [bankAccount, setBankAccount] = useState<any | null>(null);
  const [payouts, setPayouts] = useState<any[] | null>(null);
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

        // Normalize — services return different shapes
        setCoachDetails((detailsRes as any)?.data || (detailsRes as any) || null);
        setAvailability((availabilityRes as any)?.data || (availabilityRes as any) || null);
        setBankAccount((bankRes as any)?.data || (bankRes as any) || null);

        const payoutsData = (payoutsRes as any);
        const payoutItems =
          payoutsData?.items ||
          payoutsData?.data?.items ||
          payoutsData?.data ||
          payoutsData ||
          [];
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
                onUpdated={(newData: any) =>
                  setCoachDetails((prev: any) => ({ ...prev, ...(newData || {}) }))
                }
              />
            </TabsContent>

            <TabsContent value="availability" className="m-0 focus-visible:ring-0 focus-visible:outline-none">
              <AvailabilitySettingsTab
                availability={availability}
                isLoading={isLoading}
                onUpdated={(newData: any) =>
                  setAvailability((prev: any) => ({ ...prev, ...(newData || {}) }))
                }
              />
            </TabsContent>

            <TabsContent value="payments" className="m-0 focus-visible:ring-0 focus-visible:outline-none">
              <PaymentSettingsTab
                bankAccount={bankAccount}
                payouts={payouts}
                isLoading={isLoading}
                onBankAccountUpdated={(bank: any) => setBankAccount(bank)}
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
