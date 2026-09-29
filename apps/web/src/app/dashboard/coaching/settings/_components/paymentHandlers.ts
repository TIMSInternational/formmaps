import {
  linkCoachBankAccount,
  updateCoachPayoutSettings,
  PayoutSettings,
} from "@/services/coachService";
import { BankAccount } from "@/types/coach";
import { toast } from "sonner";
import i18n from "@/lib/i18n";

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

export async function saveBankAccount(
  bankAccountForm: BankAccountFormData,
  setStripeAccount: (a: StripeAccountInfo) => void,
  setBankAccountForm: (fn: (prev: BankAccountFormData) => BankAccountFormData) => void
): Promise<boolean> {
  if (
    !bankAccountForm.accountNumber ||
    !bankAccountForm.routingNumber ||
    !bankAccountForm.accountHolderName ||
    !bankAccountForm.bankName
  ) {
    toast.error(i18n.t("studentUi.coaching.bank.fillAllAccountFields"));
    return false;
  }

  // Optimistic update
  setStripeAccount({
    connected: true,
    accountId: "temp_id",
    email: undefined,
    last4: bankAccountForm.accountNumber.slice(-4),
    payoutsEnabled: true,
    onboardingLink: undefined,
    requiresOnboarding: false,
  });

  try {
    const response = await linkCoachBankAccount({
      provider: "manual",
      accountType: bankAccountForm.accountType,
      accountHolderName: bankAccountForm.accountHolderName,
      bankName: bankAccountForm.bankName,
      accountNumber: bankAccountForm.accountNumber,
      routingNumber: bankAccountForm.routingNumber,
    });

    toast.success(response.message || i18n.t("studentUi.coaching.bank.linkedSuccess"));
    setBankAccountForm((prev) => ({
      ...prev,
      accountNumber: "****" + prev.accountNumber.slice(-4),
      routingNumber: "****" + prev.routingNumber.slice(-4),
    }));
    return true;
  } catch (error: unknown) {
    setStripeAccount({ connected: false });
    const errMsg =
      (error as Record<string, string>)?.message ||
      i18n.t("studentUi.coaching.bank.saveFailed");
    toast.error(errMsg);
    return false;
  }
}

export async function connectStripe(
  stripeAccount: StripeAccountInfo | null,
  fetchStripeAccount: () => void
): Promise<void> {
  if (stripeAccount?.onboardingLink) {
    window.location.href = stripeAccount.onboardingLink;
    return;
  }

  const response = await linkCoachBankAccount({
    provider: "stripe",
    accountType: "checking",
    accountHolderName: "",
    bankName: "",
  });

  if (response.onboardingUrl) {
    window.location.href = response.onboardingUrl;
    return;
  }

  toast.success(response.message || i18n.t("studentUi.coaching.bank.linkedSuccess"));
  fetchStripeAccount();
}

export async function disconnectAccount(
  setStripeAccount: (a: StripeAccountInfo) => void,
  onBankAccountUpdated?: (bank: BankAccount | null) => void
): Promise<void> {
  if (!confirm(i18n.t("studentUi.coaching.bank.confirmDisconnectStripe")))
    return;

  const { updateCoachProfile } = await import("@/services/coachService");
  await updateCoachProfile(
    { bankAccount: null } as unknown as Parameters<typeof updateCoachProfile>[0]
  );
  setStripeAccount({ connected: false });
  if (onBankAccountUpdated) onBankAccountUpdated(null);
  toast.success(i18n.t("studentUi.coaching.bank.stripeDisconnected"));
}

export async function saveFrequency(
  value: string,
  setPayoutFrequency: (f: string) => void
): Promise<void> {
  const updated = await updateCoachPayoutSettings({
    frequency: value as PayoutSettings["frequency"],
  });
  setPayoutFrequency(updated?.frequency || value);
  toast.success(
    i18n.t("studentUi.coaching.payouts.frequencyUpdated", {
      frequency: i18n.t(`studentUi.coaching.payouts.frequency.${value}`, { defaultValue: value }),
    })
  );
}

export async function savePayoutMethod(
  bankName: string,
  accountHolderName: string,
  bankAccountNumber: string,
  bankRoutingNumber: string,
  forcedMethod: string,
  setters: {
    setPayoutMethod: (m: PayoutSettings["method"]) => void;
    setBankName: (v: string) => void;
    setAccountHolderName: (v: string) => void;
    setBankAccountNumber: (v: string) => void;
    setBankRoutingNumber: (v: string) => void;
  }
): Promise<void> {
  if (!bankName || !accountHolderName || !bankAccountNumber || !bankRoutingNumber) {
    toast.error(i18n.t("studentUi.coaching.bank.fillAllDetails"));
    return;
  }

  const updated = await updateCoachPayoutSettings({
    method: forcedMethod as PayoutSettings["method"],
    bankName: bankName || undefined,
    accountHolderName: accountHolderName || undefined,
    bankAccountNumber: bankAccountNumber || undefined,
    bankRoutingNumber: bankRoutingNumber || undefined,
  });

  setters.setPayoutMethod(updated?.method || "stripe");
  setters.setBankName(updated?.bankName || bankName);
  setters.setAccountHolderName(updated?.accountHolderName || accountHolderName);
  setters.setBankAccountNumber(updated?.bankAccountNumber || bankAccountNumber);
  setters.setBankRoutingNumber(updated?.bankRoutingNumber || bankRoutingNumber);
  toast.success(i18n.t("studentUi.coaching.payouts.methodUpdated"));
}
