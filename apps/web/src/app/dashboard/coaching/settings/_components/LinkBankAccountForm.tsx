"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, CreditCard } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface BankAccountFormData {
  accountNumber: string;
  routingNumber: string;
  accountHolderName: string;
  bankName: string;
  accountType: "checking" | "savings";
}

interface LinkBankAccountFormProps {
  bankAccountForm: BankAccountFormData;
  onFormChange: (form: BankAccountFormData) => void;
  isConnected: boolean;
  isSaving: boolean;
  onSave: () => void;
  payoutFrequency: string;
  onFrequencyChange: (value: string) => void;
  isSavingFrequency: boolean;
}

export function LinkBankAccountForm({
  bankAccountForm,
  onFormChange,
  isConnected,
  isSaving,
  onSave,
  payoutFrequency,
  onFrequencyChange,
  isSavingFrequency,
}: LinkBankAccountFormProps) {
  const updateField = (field: keyof BankAccountFormData, value: string) => {
    onFormChange({ ...bankAccountForm, [field]: value });
  };

  return (
    <Card>
      <CardContent className="p-8">
        <div className="space-y-6">
          <div className="flex items-start gap-4">
            <div className="h-12 w-12 bg-indigo-100 rounded-xl flex items-center justify-center">
              <CreditCard className="h-6 w-6 text-indigo-600" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">
                Link Bank Account
              </h3>
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
                onChange={(e) => updateField("bankName", e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Account Holder Name <span className="text-red-500">*</span>
              </label>
              <Input
                placeholder="Full name on account"
                value={bankAccountForm.accountHolderName}
                onChange={(e) =>
                  updateField("accountHolderName", e.target.value)
                }
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
                onChange={(e) => updateField("accountNumber", e.target.value)}
                disabled={isConnected}
              />
              {isConnected &&
                bankAccountForm.accountNumber.startsWith("****") && (
                  <p className="text-xs text-gray-500 mt-1">
                    Account ending in{" "}
                    {bankAccountForm.accountNumber.slice(-4)}
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
                onChange={(e) => updateField("routingNumber", e.target.value)}
                disabled={isConnected}
              />
              {isConnected &&
                bankAccountForm.routingNumber.startsWith("****") && (
                  <p className="text-xs text-gray-500 mt-1">
                    Routing ending in{" "}
                    {bankAccountForm.routingNumber.slice(-4)}
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
                  updateField("accountType", value)
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
              onValueChange={onFrequencyChange}
              disabled={isSavingFrequency}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select frequency" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="biweekly">
                  Bi-weekly (1st and 15th)
                </SelectItem>
                <SelectItem value="monthly">
                  Monthly (1st of month)
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-500 mt-1">
              How often you want to receive payouts
            </p>
          </div>

          <div className="flex justify-end pt-4">
            <Button
              onClick={onSave}
              disabled={isSaving || isConnected}
              className="bg-indigo-600 hover:bg-indigo-700"
            >
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : isConnected ? (
                "Bank Account Saved"
              ) : (
                "Save Bank Account"
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
