"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import {
  getCoachBankAccount,
  getCoachPayouts,
  getCoachPayoutSettings,
  getCoachEarnings,
  getCoachEarningsHistory,
  PayoutSettings,
  CoachEarningsStats,
  EarningsHistoryItem,
} from "@/services/coachService";
import { Payout, BankAccount } from "@/types/coach";
import { toast } from "sonner";
import { LinkBankAccountForm } from "./LinkBankAccountForm";
import { ConnectedAccountCard } from "./ConnectedAccountCard";
import { PayoutHistorySection } from "./PayoutHistorySection";
import { EarningsSection } from "./EarningsSection";
import {
  saveBankAccount,
  connectStripe,
  disconnectAccount,
  saveFrequency,
  savePayoutMethod,
} from "./paymentHandlers";

interface StripeAccountInfo {
  connected: boolean;
  accountId?: string;
  email?: string;
  last4?: string | null;
  payoutsEnabled?: boolean;
  onboardingLink?: string;
  requiresOnboarding?: boolean;
}

interface BankAccountFormData {
  accountNumber: string;
  routingNumber: string;
  accountHolderName: string;
  bankName: string;
  accountType: "checking" | "savings";
}

interface PaymentSettingsTabProps {
  bankAccount?: BankAccount | null;
  payouts?: Payout[] | null;
  isLoading?: boolean;
  onBankAccountUpdated?: (bank: BankAccount | null) => void;
  onPayoutsUpdated?: (payouts: Payout[]) => void;
}

const formatCurrency = (value?: number, currency = "USD") =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value ?? 0);

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
  const [bankAccountForm, setBankAccountForm] = useState<BankAccountFormData>({
    accountNumber: "",
    routingNumber: "",
    accountHolderName: "",
    bankName: "",
    accountType: "checking",
  });
  const [stripeAccount, setStripeAccount] =
    useState<StripeAccountInfo | null>(null);
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
  const [payoutTotalPages, setPayoutTotalPages] = useState<
    number | undefined
  >(undefined);
  const [earningsSummary, setEarningsSummary] = useState<CoachEarningsStats | null>(null);
  const [earningsHistory, setEarningsHistory] = useState<EarningsHistoryItem[]>([]);

  useEffect(() => {
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
      const [bankData, payoutsData, payoutSettingsData, earningsData, earningsHistoryData] =
        await Promise.allSettled([
          getCoachBankAccount(),
          getCoachPayouts({
            limit: 10,
            page: payoutPage,
            status:
              payoutStatus === "all"
                ? undefined
                : (payoutStatus as "pending" | "processing" | "completed" | "failed"),
          }),
          getCoachPayoutSettings(),
          getCoachEarnings(),
          getCoachEarningsHistory(),
        ]);

      const bankResult =
        bankData.status === "fulfilled" ? bankData.value : null;
      const payoutsResult =
        payoutsData.status === "fulfilled" ? payoutsData.value : null;
      const settingsResult =
        payoutSettingsData.status === "fulfilled"
          ? payoutSettingsData.value
          : null;
      const earningsResult =
        earningsData.status === "fulfilled" ? earningsData.value : null;
      const earningsHistoryResult =
        earningsHistoryData.status === "fulfilled"
          ? earningsHistoryData.value
          : null;

      // bankResult is { data: BankAccount } | null
      const account: BankAccount | null = bankResult?.data ?? null;

      const payoutItems: Payout[] = payoutsResult?.items ?? [];
      const settings: PayoutSettings | null = settingsResult ?? null;

      const hasBankDetails =
        account &&
        (account.bankName ||
          account.last4 ||
          account.status === "connected");

      const isConnected =
        hasBankDetails ||
        account?.isConnected === true;

      const accountObj: StripeAccountInfo = {
        connected: Boolean(isConnected),
        accountId: account?.id,
        email: account?.email,
        last4: account?.last4 || null,
        payoutsEnabled: Boolean(isConnected),
        onboardingLink: account?.onboardingLink,
        requiresOnboarding: Boolean(account?.requiresOnboarding),
      };

      const computedTotalPages = payoutsResult?.totalPages ??
        (payoutsResult?.total && payoutsResult?.limit
          ? Math.ceil(payoutsResult.total / payoutsResult.limit)
          : undefined);

      setStripeAccount(accountObj);
      if (onBankAccountUpdated) onBankAccountUpdated(account);

      setPayouts(payoutItems);
      setPayoutTotalPages(computedTotalPages);
      if (onPayoutsUpdated) onPayoutsUpdated(payoutItems);

      const frequencyValue = settings?.frequency || "monthly";
      setPayoutFrequency(frequencyValue);

      setPayoutMethod(settings?.method || "stripe");
      setBankName(settings?.bankName || "");
      setAccountHolderName(settings?.accountHolderName || "");
      setBankAccountNumber(settings?.bankAccountNumber || "");
      setBankRoutingNumber(settings?.bankRoutingNumber || "");

      if (account && (account.bankName || account.last4)) {
        const last4 = account.last4 || "";
        setBankAccountForm({
          bankName: account.bankName || "",
          accountHolderName: account.accountHolderName || "",
          accountNumber: last4 ? "****" + last4 : "",
          routingNumber: last4 ? "****\u2022\u2022\u2022\u2022" : "",
          accountType: (account.accountType as "checking" | "savings") || "checking",
        });
      }

      setEarningsSummary(earningsResult ?? null);
      setEarningsHistory(
        Array.isArray(earningsHistoryResult) ? earningsHistoryResult : []
      );
    } catch {
      toast.error("Failed to load payment settings");
    } finally {
      setIsLoading(false);
    }
  }, [payoutPage, payoutStatus]);

  useEffect(() => {
    fetchStripeAccount();
  }, [fetchStripeAccount]);

  const handleSaveBankAccount = async () => {
    setIsSavingBankAccount(true);
    const success = await saveBankAccount(bankAccountForm, setStripeAccount, setBankAccountForm);
    if (!success) setStripeAccount(null);
    setIsSavingBankAccount(false);
  };

  const handleConnectStripe = async () => {
    setIsConnecting(true);
    try {
      await connectStripe(stripeAccount, fetchStripeAccount);
    } catch (error: unknown) {
      const errMsg = (error as Record<string, string>)?.message || "Failed to connect Stripe account";
      toast.error(errMsg);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await disconnectAccount(setStripeAccount, onBankAccountUpdated);
    } catch (error: unknown) {
      const errMsg = (error as Record<string, string>)?.message || "Failed to disconnect Stripe account";
      toast.error(errMsg);
    }
  };

  const handleFrequencyChange = async (value: string) => {
    setIsSavingFrequency(true);
    try {
      await saveFrequency(value, setPayoutFrequency);
    } catch (error: unknown) {
      const errMsg = (error as Record<string, string>)?.message || "Failed to update payout frequency";
      toast.error(errMsg);
    } finally {
      setIsSavingFrequency(false);
    }
  };

  const handleMethodSave = async (forcedMethod = "bank_transfer") => {
    setIsSavingMethod(true);
    try {
      await savePayoutMethod(bankName, accountHolderName, bankAccountNumber, bankRoutingNumber, forcedMethod, {
        setPayoutMethod: (m) => setPayoutMethod(m),
        setBankName,
        setAccountHolderName,
        setBankAccountNumber,
        setBankRoutingNumber,
      });
    } catch (error: unknown) {
      const errMsg = (error as Record<string, string>)?.message || "Failed to update payout method";
      toast.error(errMsg);
    } finally {
      setIsSavingMethod(false);
    }
  };

  if (parentLoading || isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const isAccountConnected = !!(
    stripeAccount?.connected && bankAccountForm.bankName
  );

  return (
    <div className="p-6 sm:p-10 space-y-8">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Payments & Payouts</h2>
        <p className="text-gray-500 font-medium mt-1">
          Manage your Stripe connection and view payout history.
        </p>
      </div>

      {!isAccountConnected ? (
        <LinkBankAccountForm
          bankAccountForm={bankAccountForm}
          onFormChange={setBankAccountForm}
          isConnected={!!stripeAccount?.connected}
          isSaving={isSavingBankAccount}
          onSave={handleSaveBankAccount}
          payoutFrequency={payoutFrequency}
          onFrequencyChange={handleFrequencyChange}
          isSavingFrequency={isSavingFrequency}
        />
      ) : (
        <div className="space-y-6">
          <ConnectedAccountCard
            stripeAccount={stripeAccount!}
            bankAccountForm={bankAccountForm}
            payoutFrequency={payoutFrequency}
            onFrequencyChange={handleFrequencyChange}
            isSavingFrequency={isSavingFrequency}
            bankName={bankName}
            onBankNameChange={setBankName}
            accountHolderName={accountHolderName}
            onAccountHolderNameChange={setAccountHolderName}
            bankAccountNumber={bankAccountNumber}
            onBankAccountNumberChange={setBankAccountNumber}
            bankRoutingNumber={bankRoutingNumber}
            onBankRoutingNumberChange={setBankRoutingNumber}
            isSavingMethod={isSavingMethod}
            onMethodSave={handleMethodSave}
            onDisconnect={handleDisconnect}
          />

          <div className="bg-white border-gray-100 rounded-2xl p-6 border shadow-sm space-y-6">
            <PayoutHistorySection
              payouts={payouts}
              payoutStatus={payoutStatus}
              onPayoutStatusChange={setPayoutStatus}
              payoutPage={payoutPage}
              onPayoutPageChange={setPayoutPage}
              payoutTotalPages={payoutTotalPages}
              isLoading={isLoading}
              onRefresh={fetchStripeAccount}
              formatCurrency={formatCurrency}
            />

            <EarningsSection
              earningsSummary={earningsSummary}
              earningsHistory={earningsHistory}
              formatCurrency={formatCurrency}
            />
          </div>
        </div>
      )}
    </div>
  );
}
