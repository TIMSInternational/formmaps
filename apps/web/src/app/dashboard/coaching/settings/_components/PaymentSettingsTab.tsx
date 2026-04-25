"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, CreditCard, CheckCircle, ExternalLink } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getCoachBankAccount,
  getCoachPayouts,
  linkCoachBankAccount,
  getCoachPayoutSettings,
  updateCoachPayoutSettings,
  getCoachEarnings,
  getCoachEarningsHistory,
  PayoutSettings,
} from "@/services/coachService";
import { Payout } from "@/types/coach";
import { toast } from "sonner";

interface PaymentSettingsTabProps {
  bankAccount?: any | null;
  payouts?: any[] | null;
  isLoading?: boolean;
  onBankAccountUpdated?: (bank: any | null) => void;
  onPayoutsUpdated?: (payouts: any[]) => void;
}

export function PaymentSettingsTab({
  bankAccount: parentBankAccount,
  payouts: parentPayouts,
  isLoading: parentLoading,
  onBankAccountUpdated,
  onPayoutsUpdated,
}: PaymentSettingsTabProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSavingFrequency, setIsSavingFrequency] = useState(false);
  const [isSavingMethod, setIsSavingMethod] = useState(false);
  const [isSavingBankAccount, setIsSavingBankAccount] = useState(false);
  const [bankAccountForm, setBankAccountForm] = useState({
    accountNumber: "",
    routingNumber: "",
    accountHolderName: "",
    bankName: "",
    accountType: "checking" as "checking" | "savings",
  });
  const [stripeAccount, setStripeAccount] = useState<{
    connected: boolean;
    accountId?: string;
    email?: string;
    last4?: string | null;
    payoutsEnabled?: boolean;
    onboardingLink?: string;
    requiresOnboarding?: boolean;
  } | null>(null);
  const [payoutFrequency, setPayoutFrequency] = useState("monthly");
  const [payoutMethod, setPayoutMethod] = useState<
    PayoutSettings["method"] | ""
  >("");
  const [bankName, setBankName] = useState("");
  const [accountHolderName, setAccountHolderName] = useState("");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [bankRoutingNumber, setBankRoutingNumber] = useState("");
  const [payouts, setPayouts] = useState<Payout[]>(parentPayouts || []);
  const [payoutStatus, setPayoutStatus] = useState<string>("all");
  const [payoutPage, setPayoutPage] = useState(1);
  const [payoutTotalPages, setPayoutTotalPages] = useState<number | undefined>(
    undefined
  );
  const [earningsSummary, setEarningsSummary] = useState<any | null>(null);
  const [earningsHistory, setEarningsHistory] = useState<any[]>([]);

  // Only use parent props as initial values on first mount
  // Don't continuously sync - let component manage its own state
  useEffect(() => {
    // Skip if we already have data from fetchStripeAccount
    if (stripeAccount) return;
    
    if (parentBankAccount) {
      setStripeAccount({
        connected: !!(
          parentBankAccount &&
          (parentBankAccount.status === "connected" ||
            parentBankAccount.isConnected)
        ),
        accountId: parentBankAccount?.id,
        email: parentBankAccount?.email,
        last4: parentBankAccount?.last4,
        payoutsEnabled:
          parentBankAccount?.status === "connected" ||
          parentBankAccount?.isConnected,
        onboardingLink: parentBankAccount?.onboardingLink,
        requiresOnboarding: parentBankAccount?.requiresOnboarding,
      });
    }

    if (parentPayouts && payouts.length === 0) {
      setPayouts(parentPayouts as Payout[]);
    }
  }, []); // Only run once on mount

  const fetchStripeAccount = useCallback(async () => {
    setIsLoading(true);
    try {
      // Fetch data with individual error handling to prevent one failure from blocking everything
      const [
        bankData,
        payoutsData,
        payoutSettingsData,
        earningsData,
        earningsHistoryData,
      ] = await Promise.allSettled([
        getCoachBankAccount(),
        getCoachPayouts({ 
          limit: 10, 
          page: payoutPage, 
          status: payoutStatus === "all" ? undefined : payoutStatus as any 
        }),
        getCoachPayoutSettings(),
        getCoachEarnings(),
        getCoachEarningsHistory(),
      ])

      // Extract successful results
      const bankResult = bankData.status === 'fulfilled' ? bankData.value : null;
      const payoutsResult = payoutsData.status === 'fulfilled' ? payoutsData.value : null;
      const settingsResult = payoutSettingsData.status === 'fulfilled' ? payoutSettingsData.value : null;
      const earningsResult = earningsData.status === 'fulfilled' ? earningsData.value : null;
      const earningsHistoryResult = earningsHistoryData.status === 'fulfilled' ? earningsHistoryData.value : null;

      // Log failed requests for debugging
      if (bankData.status === 'rejected') console.warn('Bank account fetch failed:', bankData.reason);
      if (payoutsData.status === 'rejected') console.warn('Payouts fetch failed:', payoutsData.reason);
      if (payoutSettingsData.status === 'rejected') console.warn('Payout settings fetch failed:', payoutSettingsData.reason);
      if (earningsData.status === 'rejected') console.warn('Earnings fetch failed:', earningsData.reason);
      if (earningsHistoryData.status === 'rejected') console.warn('Earnings history fetch failed:', earningsHistoryData.reason);

      // Handle both {data: {...}} and direct response formats
      const account = (bankResult as any)?.data?.data ?? (bankResult as any)?.data ?? bankResult;
      console.log('Parsed account data:', account);
      
      const payoutItems: Payout[] = Array.isArray(payoutsResult?.items)
        ? payoutsResult.items
        : (payoutsResult as any)?.data || [];
      const settings: PayoutSettings | null =
        (settingsResult as any)?.data || (settingsResult as any) || null;

      // Check multiple possible field names for connection status
      // Prioritize checking if actual bank details exist (more reliable than API boolean)
      const hasBankDetails = account && (
        account.bankName || account.BankName || 
        account.last4 || account.Last4 ||
        account.status === "connected"
      );
      
      const isConnected = 
        hasBankDetails ||  // Bank details exist = connected
        account?.IsConnected === true || 
        account?.isConnected === true || 
        account?.connected === true;
      
      // API may return PascalCase or camelCase fields, map both
      const accountObj = {
        connected: Boolean(isConnected),
        accountId: account?.Id || account?.id,
        email: account?.Email || account?.email,
        last4: account?.Last4 || account?.last4 || null,
        payoutsEnabled: Boolean(isConnected),
        onboardingLink: account?.OnboardingLink || account?.onboardingLink,
        requiresOnboarding: Boolean(account?.RequiresOnboarding || account?.requiresOnboarding),
      };
      console.log('Final account object:', accountObj);

      const computedTotalPages =
        (payoutsResult as any)?.totalPages ??
        (payoutsResult as any)?.meta?.totalPages ??
        ((payoutsResult as any)?.total && (payoutsResult as any)?.limit
          ? Math.ceil((payoutsResult as any).total / (payoutsResult as any).limit)
          : undefined);

      setStripeAccount(accountObj);
      console.log('✅ Set stripeAccount:', accountObj);
      if (onBankAccountUpdated) onBankAccountUpdated(accountObj);

      setPayouts(payoutItems || []);
      setPayoutTotalPages(computedTotalPages);
      if (onPayoutsUpdated) onPayoutsUpdated(payoutItems || []);

      // Payout frequency can come from settings OR bank account data
      const frequencyValue = 
        settings?.frequency || 
        account?.payoutFrequency || 
        account?.PayoutFrequency || 
        "monthly";
      setPayoutFrequency(frequencyValue);
      
      setPayoutMethod(settings?.method || "stripe");
      setBankName(settings?.bankName || "");
      setAccountHolderName(settings?.accountHolderName || "");
      setBankAccountNumber(settings?.bankAccountNumber || "");
      setBankRoutingNumber(settings?.bankRoutingNumber || "");

      // Pre-populate bank account form with existing data
      if (account && (account.bankName || account.BankName || account.last4 || account.Last4)) {
        const last4 = account.last4 || account.Last4 || "";
        const routingLast4 = account.routingLast4 || account.RoutingLast4 || "";
        
        const formData = {
          bankName: account.bankName || account.BankName || "",
          accountHolderName: account.accountHolderName || account.AccountHolderName || "",
          // Show masked account number if last4 exists
          accountNumber: last4 ? "****" + last4 : "",
          // Show masked routing number if available, or placeholder if connected
          routingNumber: routingLast4 ? "****" + routingLast4 : (last4 ? "****••••" : ""),
          accountType: (account.accountType || account.AccountType || "checking") as "checking" | "savings",
        };
        setBankAccountForm(formData);
        console.log('✅ Set bankAccountForm:', formData);
      } else {
        console.log('⚠️ NOT setting bankAccountForm - no account data');
      }

      setEarningsSummary((earningsResult as any)?.data || earningsResult || null);
      const earningsHistoryItems =
        (earningsHistoryResult as any)?.data || (earningsHistoryResult as any) || [];
      setEarningsHistory(Array.isArray(earningsHistoryItems) ? earningsHistoryItems : []);
    } catch (error) {
      console.error("Error in fetchStripeAccount:", error);
      toast.error("Failed to load payment settings");
    } finally {
      setIsLoading(false);
    }
  }, [payoutPage, payoutStatus]); // Removed callback props from dependencies

  useEffect(() => {
    fetchStripeAccount();
  }, [fetchStripeAccount]);

  const handleSaveBankAccount = async () => {
    // Validate form
    if (!bankAccountForm.accountNumber || !bankAccountForm.routingNumber || 
        !bankAccountForm.accountHolderName || !bankAccountForm.bankName) {
      toast.error("Please fill in all bank account fields");
      return;
    }

    setIsSavingBankAccount(true);
    
    // Optimistic update - show connected immediately
    const optimisticAccount = {
      connected: true,
      accountId: "temp_id",
      email: undefined,
      last4: bankAccountForm.accountNumber.slice(-4),
      payoutsEnabled: true,
      onboardingLink: undefined,
      requiresOnboarding: false,
    };
    setStripeAccount(optimisticAccount);
    
    try {
      const response = await linkCoachBankAccount({
        provider: "manual",
        accountType: bankAccountForm.accountType,
        accountHolderName: bankAccountForm.accountHolderName,
        bankName: bankAccountForm.bankName,
        accountNumber: bankAccountForm.accountNumber,
        routingNumber: bankAccountForm.routingNumber,
      });

      console.log('Bank account save response:', response);
      toast.success(response.message || "Bank account linked successfully");
      
      // Mask sensitive info after successful save
      setBankAccountForm(prev => ({
        ...prev,
        accountNumber: "****" + prev.accountNumber.slice(-4),
        routingNumber: "****" + prev.routingNumber.slice(-4),
      }));
    } catch (error: any) {
      // Revert optimistic update on error
      setStripeAccount(null);
      console.error("Bank account save error:", error);
      toast.error(error?.message || "Failed to save bank account");
    } finally {
      setIsSavingBankAccount(false);
    }
  };

  const handleConnectStripe = async () => {
    setIsConnecting(true);
    try {
      // Check if we already have an onboarding link from GET request
      if (stripeAccount?.onboardingLink) {
        // Redirect directly to the onboarding link
        window.location.href = stripeAccount.onboardingLink;
        return;
      }

      // Otherwise, call POST endpoint to generate link
      const response = await linkCoachBankAccount({
        provider: "stripe",
        accountType: "checking",
        accountHolderName: "", // Will be filled during Stripe onboarding
        bankName: "", // Will be filled during Stripe onboarding
      });

      if (response.onboardingUrl) {
        // Redirect to Stripe Connect onboarding
        window.location.href = response.onboardingUrl;
        return;
      }

      toast.success(response.message || "Bank account linked successfully");
      fetchStripeAccount(); // Refresh account status
    } catch (error: any) {
      console.error("Stripe connection error:", error);
      toast.error(error.message || "Failed to connect Stripe account");
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm("Are you sure you want to disconnect your Stripe account?"))
      return;

    try {
      setStripeAccount({ connected: false });
      if (onBankAccountUpdated) onBankAccountUpdated(null);
      toast.success("Stripe account disconnected");
    } catch (error) {
      toast.error("Failed to disconnect Stripe account");
    }
  };

  const handleFrequencyChange = async (value: string) => {
    setIsSavingFrequency(true);
    try {
      const updated = await updateCoachPayoutSettings({
        frequency: value as PayoutSettings["frequency"],
      });
      setPayoutFrequency(updated?.frequency || value);
      toast.success(`Payout frequency updated to ${value}`);
    } catch (error: any) {
      toast.error(error?.message || "Failed to update payout frequency");
    } finally {
      setIsSavingFrequency(false);
    }
  };

  const handleMethodSave = async (forcedMethod: string = "bank_transfer") => {
    // Validate bank transfer fields
    if (!bankName || !accountHolderName || !bankAccountNumber || !bankRoutingNumber) {
        toast.error("Please fill in all bank details");
        return;
    }

    setIsSavingMethod(true);
    try {
      const updated = await updateCoachPayoutSettings({
        method: (forcedMethod as PayoutSettings["method"]),
        bankName: bankName || undefined,
        accountHolderName: accountHolderName || undefined,
        bankAccountNumber: bankAccountNumber || undefined,
        bankRoutingNumber: bankRoutingNumber || undefined,
      });

      setPayoutMethod(updated?.method || payoutMethod || "stripe");
      setBankName(updated?.bankName || bankName);
      setAccountHolderName(updated?.accountHolderName || accountHolderName);
      setBankAccountNumber(updated?.bankAccountNumber || bankAccountNumber);
      setBankRoutingNumber(updated?.bankRoutingNumber || bankRoutingNumber);
      toast.success("Payout method updated");
    } catch (error: any) {
      toast.error(error?.message || "Failed to update payout method");
    } finally {
      setIsSavingMethod(false);
    }
  };

  const formatCurrency = (value?: number, currency = "USD") =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value ?? 0);

  if (parentLoading || isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  // Debug: Log current state values
  console.log('🔍 RENDER CHECK:', {
    'stripeAccount?.connected': stripeAccount?.connected,
    'bankAccountForm.bankName': bankAccountForm.bankName,
    'showForm': !(stripeAccount?.connected && bankAccountForm.bankName),
    'stripeAccount': stripeAccount,
    'bankAccountForm': bankAccountForm
  });

  return (
    <div className="p-6 sm:p-10 space-y-8">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Payments & Payouts</h2>
        <p className="text-gray-500 font-medium mt-1">
          Manage your Stripe connection and view payout history.
        </p>
      </div>

      {!(stripeAccount?.connected && bankAccountForm.bankName) ? (
        <Card>
          <CardContent className="p-8">
            <div className="space-y-6">
              <div className="flex items-start gap-4">
                <div className="h-12 w-12 bg-indigo-100 rounded-xl flex items-center justify-center">
                  <CreditCard className="h-6 w-6 text-indigo-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Link Bank Account</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    Enter your bank account details to receive coaching payments.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Bank Name <span className="text-red-500">*</span>
                  </label>
                  <Input
                    placeholder="e.g., Chase Bank"
                    value={bankAccountForm.bankName}
                    onChange={(e) => setBankAccountForm(prev => ({ ...prev, bankName: e.target.value }))}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Account Holder Name <span className="text-red-500">*</span>
                  </label>
                  <Input
                    placeholder="Full name on account"
                    value={bankAccountForm.accountHolderName}
                    onChange={(e) => setBankAccountForm(prev => ({ ...prev, accountHolderName: e.target.value }))}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Account Number <span className="text-red-500">*</span>
                  </label>
                  <Input
                    type="text"
                    placeholder="Account number"
                    value={bankAccountForm.accountNumber}
                    onChange={(e) => setBankAccountForm(prev => ({ ...prev, accountNumber: e.target.value }))}
                    disabled={stripeAccount?.connected}
                  />
                  {stripeAccount?.connected && bankAccountForm.accountNumber.startsWith("****") && (
                    <p className="text-xs text-gray-500 mt-1">
                      Account ending in {bankAccountForm.accountNumber.slice(-4)}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Routing Number <span className="text-red-500">*</span>
                  </label>
                  <Input
                    type="text"
                    placeholder="9-digit routing number"
                    value={bankAccountForm.routingNumber}
                    onChange={(e) => setBankAccountForm(prev => ({ ...prev, routingNumber: e.target.value }))}
                    disabled={stripeAccount?.connected}
                  />
                  {stripeAccount?.connected && bankAccountForm.routingNumber.startsWith("****") && (
                    <p className="text-xs text-gray-500 mt-1">
                      Routing ending in {bankAccountForm.routingNumber.slice(-4)}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Account Type <span className="text-red-500">*</span>
                  </label>
                  <Select
                    value={bankAccountForm.accountType}
                    onValueChange={(value: "checking" | "savings") => 
                      setBankAccountForm(prev => ({ ...prev, accountType: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="checking">Checking</SelectItem>
                      <SelectItem value="savings">Savings</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="border-t pt-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Payout Frequency
                </label>
                <Select
                  value={payoutFrequency}
                  onValueChange={handleFrequencyChange}
                  disabled={isSavingFrequency}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select frequency" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="biweekly">
                      Bi-weekly (1st and 15th)
                    </SelectItem>
                    <SelectItem value="monthly">Monthly (1st of month)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500 mt-1">
                  How often you want to receive payouts
                </p>
              </div>

              <div className="flex justify-end pt-4">
                <Button
                  onClick={handleSaveBankAccount}
                  disabled={isSavingBankAccount || stripeAccount?.connected}
                  className="bg-indigo-600 hover:bg-indigo-700"
                >
                  {isSavingBankAccount ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : stripeAccount?.connected ? (
                    "Bank Account Saved"
                  ) : (
                    "Save Bank Account"
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          <div className="bg-emerald-50/50 border border-emerald-100 rounded-2xl p-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-100/50 rounded-full -mr-16 -mt-16" />
            <div className="flex items-start gap-4 relative z-10">
              <div className="h-12 w-12 bg-white rounded-xl shadow-sm flex items-center justify-center text-emerald-600">
                <CheckCircle className="h-6 w-6" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-gray-900">
                  Bank Account Connected
                </h3>
                <p className="text-gray-600 text-sm mt-1">
                  Your account is ready to receive payouts.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
                  {bankAccountForm.bankName && (
                    <div className="bg-white p-3 rounded-xl border border-emerald-100/50 shadow-sm">
                      <span className="text-xs font-bold text-gray-400 uppercase">
                        Bank Name
                      </span>
                      <p className="font-semibold text-gray-900 truncate">
                        {bankAccountForm.bankName}
                      </p>
                    </div>
                  )}
                  {bankAccountForm.accountHolderName && (
                    <div className="bg-white p-3 rounded-xl border border-emerald-100/50 shadow-sm">
                      <span className="text-xs font-bold text-gray-400 uppercase">
                        Account Holder
                      </span>
                      <p className="font-semibold text-gray-900 truncate">
                        {bankAccountForm.accountHolderName}
                      </p>
                    </div>
                  )}
                  {stripeAccount.email && (
                    <div className="bg-white p-3 rounded-xl border border-emerald-100/50 shadow-sm">
                      <span className="text-xs font-bold text-gray-400 uppercase">
                        Account Email
                      </span>
                      <p className="font-semibold text-gray-900 truncate">
                        {stripeAccount.email}
                      </p>
                    </div>
                  )}
                  <div className="bg-white p-3 rounded-xl border border-emerald-100/50 shadow-sm">
                    <span className="text-xs font-bold text-gray-400 uppercase">
                      Bank Account
                    </span>
                    <p className="font-semibold text-gray-900">
                      ****{stripeAccount.last4}
                    </p>
                  </div>
                </div>

                <div className="flex gap-3 mt-6">
                  <Button
                    variant="outline"
                    size="sm"
                    asChild
                    className="bg-white hover:bg-gray-50 border-gray-200"
                  >
                    <a
                      href="https://dashboard.stripe.com"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="mr-2 h-4 w-4" />
                      View Dashboard
                    </a>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleDisconnect}
                    className="text-red-500 hover:text-red-600 hover:bg-red-50"
                  >
                    Disconnect
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white border-gray-100 rounded-2xl p-6 border shadow-sm space-y-6">
            <div className="space-y-4">
              <h3 className="text-lg font-bold text-gray-900">Payout Preferences</h3>
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div>
                  <p className="font-medium text-gray-900">Payout Frequency</p>
                  <p className="text-sm text-gray-500">
                    Choose how often you want to receive your earnings.
                  </p>
                </div>
                <div className="w-full sm:w-[200px]">
                  <Select
                    value={payoutFrequency}
                    onValueChange={handleFrequencyChange}
                    disabled={isSavingFrequency}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select frequency" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="biweekly">
                        Bi-weekly (Every 2 weeks)
                      </SelectItem>
                      <SelectItem value="monthly">Monthly (1st of month)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                     <p className="font-medium text-gray-900">Bank Details <span className="text-red-500">*</span></p>
                     <Badge variant="outline" className="bg-gray-50 text-gray-600 border-gray-200">Bank Transfer</Badge>
                  </div>
                  <p className="text-sm text-gray-500 mb-4">
                    Your earnings will be transferred to this bank account.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                       <label className="text-xs font-medium text-gray-500 uppercase">Bank Name</label>
                       <Input
                         placeholder="Bank name"
                         value={bankName}
                         onChange={(e) => setBankName(e.target.value)}
                         required
                       />
                    </div>
                    <div className="space-y-1">
                       <label className="text-xs font-medium text-gray-500 uppercase">Account Holder</label>
                       <Input
                         placeholder="Account holder name"
                         value={accountHolderName}
                         onChange={(e) => setAccountHolderName(e.target.value)}
                         required
                       />
                    </div>
                    <div className="space-y-1">
                       <label className="text-xs font-medium text-gray-500 uppercase">Account Number</label>
                       <Input
                         placeholder="Account number"
                         value={bankAccountNumber}
                         onChange={(e) => setBankAccountNumber(e.target.value)}
                         required
                       />
                    </div>
                    <div className="space-y-1">
                       <label className="text-xs font-medium text-gray-500 uppercase">Routing Number</label>
                       <Input
                         placeholder="Routing number"
                         value={bankRoutingNumber}
                         onChange={(e) => setBankRoutingNumber(e.target.value)}
                         required
                       />
                    </div>
                  </div>
                  <div className="flex justify-end pt-2">
                    <Button
                      size="sm"
                      onClick={() => handleMethodSave("bank_transfer")}
                      disabled={
                        isSavingMethod ||
                        !bankName || !accountHolderName || !bankAccountNumber || !bankRoutingNumber
                      }
                      className="bg-gray-900 text-white hover:bg-gray-800"
                    >
                      {isSavingMethod ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          Saving...
                        </>
                      ) : (
                        "Save Bank Details"
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-lg font-bold text-gray-900">Payout History</h3>
              <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <Select
                    value={payoutStatus}
                    onValueChange={(value) => {
                      setPayoutPage(1);
                      setPayoutStatus(value);
                    }}
                  >
                    <SelectTrigger className="w-[200px]">
                      <SelectValue placeholder="Filter by status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="processing">Processing</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="failed">Failed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fetchStripeAccount()}
                    disabled={isLoading}
                  >
                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Refresh"}
                  </Button>
                  <div className="text-sm text-gray-600">
                    Page {payoutPage} {payoutTotalPages ? `of ${payoutTotalPages}` : ""}
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={payoutPage <= 1}
                      onClick={() => {
                        setPayoutPage((p) => Math.max(1, p - 1));
                      }}
                    >
                      Prev
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={payoutTotalPages ? payoutPage >= payoutTotalPages : false}
                      onClick={() => {
                        setPayoutPage((p) => p + 1);
                      }}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </div>

              {!payouts || payouts.length === 0 ? (
                <div className="bg-gray-50 rounded-2xl p-8 text-center border border-gray-100 border-dashed">
                  <p className="text-gray-500 font-medium">
                    No payouts yet. Complete sessions to start earning!
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {payouts.map((payout) => (
                    <div
                      key={payout.id || payout.periodStart}
                      className="flex items-center justify-between bg-white border border-gray-100 rounded-xl px-4 py-3 shadow-sm"
                    >
                      <div>
                        <p className="font-semibold text-gray-900">
                          {formatCurrency(payout.netAmount ?? payout.amount, payout.currency)}
                        </p>
                        <p className="text-sm text-gray-500">
                          {payout.periodStart || "—"}
                          {payout.periodEnd ? ` - ${payout.periodEnd}` : ""}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className="border-gray-200 text-gray-700 bg-gray-50"
                      >
                        {payout.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-4">
              <h3 className="text-lg font-bold text-gray-900">Earnings</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card className="border-gray-100 shadow-sm">
                  <CardContent className="pt-4">
                    <p className="text-sm text-gray-500">Total earnings</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {formatCurrency(earningsSummary?.totalEarnings)}
                    </p>
                  </CardContent>
                </Card>
                <Card className="border-gray-100 shadow-sm">
                  <CardContent className="pt-4">
                    <p className="text-sm text-gray-500">Pending payout</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {formatCurrency(earningsSummary?.pendingPayout)}
                    </p>
                  </CardContent>
                </Card>
                <Card className="border-gray-100 shadow-sm">
                  <CardContent className="pt-4">
                    <p className="text-sm text-gray-500">Last payout</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {formatCurrency(earningsSummary?.lastPayoutAmount)}
                    </p>
                    <p className="text-xs text-gray-500">
                      {earningsSummary?.lastPayoutDate || "N/A"}
                    </p>
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-semibold text-gray-700">Recent earnings</p>
                {earningsHistory && earningsHistory.length > 0 ? (
                  earningsHistory.slice(0, 5).map((item, idx) => (
                    <div
                      key={item.id || idx}
                      className="flex items-center justify-between bg-white border border-gray-100 rounded-xl px-4 py-3 shadow-sm"
                    >
                      <div>
                        <p className="font-semibold text-gray-900">{item.description || "Session"}</p>
                        <p className="text-sm text-gray-500">{item.date || ""}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-gray-900">
                          {formatCurrency(item.amountNet ?? item.amountGross ?? item.amount, item.currency)}
                        </p>
                        {typeof item.platformFee === "number" && (
                          <p className="text-xs text-gray-500">
                            Platform fee: {formatCurrency(item.platformFee, item.currency)}
                          </p>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="bg-gray-50 rounded-2xl p-6 text-center border border-gray-100 border-dashed text-sm text-gray-500">
                    No earnings history yet.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
