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
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();
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
                {t("studentUi.coaching.bank.linkTitle")}
              </h3>
              <p className="text-sm text-gray-600 mt-1">
                {t("studentUi.coaching.bank.linkDescription")}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t("studentUi.coaching.bank.bankName")} <span className="text-red-500">*</span>
              </label>
              <Input
                placeholder={t("studentUi.coaching.bank.bankNameExample")}
                value={bankAccountForm.bankName}
                onChange={(e) => updateField("bankName", e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t("studentUi.coaching.bank.accountHolderName")} <span className="text-red-500">*</span>
              </label>
              <Input
                placeholder={t("studentUi.coaching.bank.fullNameOnAccount")}
                value={bankAccountForm.accountHolderName}
                onChange={(e) =>
                  updateField("accountHolderName", e.target.value)
                }
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t("studentUi.coaching.bank.accountNumber")} <span className="text-red-500">*</span>
              </label>
              <Input
                type="text"
                placeholder={t("studentUi.coaching.bank.accountNumberPlaceholder")}
                value={bankAccountForm.accountNumber}
                onChange={(e) => updateField("accountNumber", e.target.value)}
                disabled={isConnected}
              />
              {isConnected &&
                bankAccountForm.accountNumber.startsWith("****") && (
                  <p className="text-xs text-gray-500 mt-1">
                    {t("studentUi.coaching.bank.accountEndingIn", { last4: bankAccountForm.accountNumber.slice(-4) })}
                  </p>
                )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t("studentUi.coaching.bank.routingNumber")} <span className="text-red-500">*</span>
              </label>
              <Input
                type="text"
                placeholder={t("studentUi.coaching.bank.routingNumberNineDigit")}
                value={bankAccountForm.routingNumber}
                onChange={(e) => updateField("routingNumber", e.target.value)}
                disabled={isConnected}
              />
              {isConnected &&
                bankAccountForm.routingNumber.startsWith("****") && (
                  <p className="text-xs text-gray-500 mt-1">
                    {t("studentUi.coaching.bank.routingEndingIn", { last4: bankAccountForm.routingNumber.slice(-4) })}
                  </p>
                )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t("studentUi.coaching.bank.accountType")} <span className="text-red-500">*</span>
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
                  <SelectItem value="checking">{t("studentUi.coaching.bank.checking")}</SelectItem>
                  <SelectItem value="savings">{t("studentUi.coaching.bank.savings")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="border-t pt-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t("studentUi.coaching.bank.payoutFrequency")}
            </label>
            <Select
              value={payoutFrequency}
              onValueChange={onFrequencyChange}
              disabled={isSavingFrequency}
            >
              <SelectTrigger>
                <SelectValue placeholder={t("studentUi.coaching.bank.selectFrequency")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="biweekly">
                  {t("studentUi.coaching.bank.frequencyTwiceMonthly")}
                </SelectItem>
                <SelectItem value="monthly">
                  {t("studentUi.coaching.bank.frequencyMonthly")}
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-500 mt-1">
              {t("studentUi.coaching.bank.payoutFrequencyShortHint")}
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
                  {t("common.saving")}
                </>
              ) : isConnected ? (
                t("studentUi.coaching.bank.accountSaved")
              ) : (
                t("studentUi.coaching.bank.saveAccount")
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
