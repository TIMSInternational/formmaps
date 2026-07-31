"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, CheckCircle, ExternalLink } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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

interface ConnectedAccountCardProps {
  stripeAccount: StripeAccountInfo;
  bankAccountForm: BankAccountFormData;
  payoutFrequency: string;
  onFrequencyChange: (value: string) => void;
  isSavingFrequency: boolean;
  bankName: string;
  onBankNameChange: (value: string) => void;
  accountHolderName: string;
  onAccountHolderNameChange: (value: string) => void;
  bankAccountNumber: string;
  onBankAccountNumberChange: (value: string) => void;
  bankRoutingNumber: string;
  onBankRoutingNumberChange: (value: string) => void;
  isSavingMethod: boolean;
  onMethodSave: (method: string) => void;
  onDisconnect: () => void;
}

export function ConnectedAccountCard({
  stripeAccount,
  bankAccountForm,
  payoutFrequency,
  onFrequencyChange,
  isSavingFrequency,
  bankName,
  onBankNameChange,
  accountHolderName,
  onAccountHolderNameChange,
  bankAccountNumber,
  onBankAccountNumberChange,
  bankRoutingNumber,
  onBankRoutingNumberChange,
  isSavingMethod,
  onMethodSave,
  onDisconnect,
}: ConnectedAccountCardProps) {
  return (
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
                onClick={onDisconnect}
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
          <h3 className="text-lg font-bold text-gray-900">
            Payout Preferences
          </h3>
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
                onValueChange={onFrequencyChange}
                disabled={isSavingFrequency}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select frequency" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="biweekly">
                    Bi-weekly (Every 2 weeks)
                  </SelectItem>
                  <SelectItem value="monthly">
                    Monthly (1st of month)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="font-medium text-gray-900">
                  Bank Details <span className="text-red-500">*</span>
                </p>
                <Badge
                  variant="outline"
                  className="bg-gray-50 text-gray-600 border-gray-200"
                >
                  Bank Transfer
                </Badge>
              </div>
              <p className="text-sm text-gray-500 mb-4">
                Your earnings will be transferred to this bank account.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-500 uppercase">
                    Bank Name
                  </label>
                  <Input
                    placeholder="Bank name"
                    value={bankName}
                    onChange={(e) => onBankNameChange(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-500 uppercase">
                    Account Holder
                  </label>
                  <Input
                    placeholder="Account holder name"
                    value={accountHolderName}
                    onChange={(e) => onAccountHolderNameChange(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-500 uppercase">
                    Account Number
                  </label>
                  <Input
                    placeholder="Account number"
                    value={bankAccountNumber}
                    onChange={(e) => onBankAccountNumberChange(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-500 uppercase">
                    Routing Number
                  </label>
                  <Input
                    placeholder="Routing number"
                    value={bankRoutingNumber}
                    onChange={(e) => onBankRoutingNumberChange(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="flex justify-end pt-2">
                <Button
                  size="sm"
                  onClick={() => onMethodSave("bank_transfer")}
                  disabled={
                    isSavingMethod ||
                    !bankName ||
                    !accountHolderName ||
                    !bankAccountNumber ||
                    !bankRoutingNumber
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
      </div>
    </div>
  );
}
