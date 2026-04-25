import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { DollarSign, Info } from "lucide-react";
import { useTranslation } from "react-i18next";

interface PricingStepProps {
  data: {
    hourlyRate: number;
    currency?: string;
  };
  onNext: (data: { hourlyRate: number; currency: string }) => void;
  onBack: () => void;
}

const PLATFORM_FEE_PERCENTAGE = 15;

const CURRENCIES = [{ code: "USD", symbol: "$", name: "US Dollar" }];

export function PricingStep({ data, onNext, onBack }: PricingStepProps) {
  const { t } = useTranslation();
  const [hourlyRate, setHourlyRate] = useState(data.hourlyRate || 50);
  const [errors, setErrors] = useState<{ hourlyRate?: string }>({});

  const selectedCurrency = CURRENCIES[0]; // Always USD
  const platformFee = (hourlyRate * PLATFORM_FEE_PERCENTAGE) / 100;
  const yourEarnings = hourlyRate - platformFee;

  const validate = () => {
    const newErrors: { hourlyRate?: string } = {};

    if (!hourlyRate || hourlyRate < 10) {
      newErrors.hourlyRate = t("onboarding.pricing.minRate", "Hourly rate must be at least $10");
    }
    if (hourlyRate > 500) {
      newErrors.hourlyRate = t("onboarding.pricing.maxRate", "Hourly rate cannot exceed $500");
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validate()) {
      onNext({ hourlyRate, currency: "USD" });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="hourlyRate">
            {t("onboarding.pricing.hourlyRate", { symbol: selectedCurrency?.symbol, defaultValue: "Hourly Rate ($)" })}
          </Label>
          <div className="relative">
            <DollarSign className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="hourlyRate"
              type="number"
              min="10"
              max="500"
              step="5"
              value={hourlyRate}
              onChange={(e) => setHourlyRate(Number(e.target.value))}
              aria-invalid={!!errors.hourlyRate}
              aria-describedby={errors.hourlyRate ? "hourlyRate-error" : undefined}
              className="pl-9"
              placeholder="50"
            />
          </div>
          {errors.hourlyRate && (
            <p id="hourlyRate-error" className="text-sm text-red-600" role="alert">{errors.hourlyRate}</p>
          )}
          <p className="text-sm text-muted-foreground">
            {t("onboarding.pricing.hint", { 
              symbol: selectedCurrency?.symbol, 
              min: 10, 
              max: 500, 
              defaultValue: "Set your hourly coaching rate (minimum $10, maximum $500)" 
            })}
          </p>
        </div>

        {/* Earnings Breakdown */}
        <Card className="bg-muted/50 border-dashed">
          <CardContent className="pt-6">
            <div className="flex items-start gap-2 mb-4">
              <Info className="h-4 w-4 text-muted-foreground mt-0.5" aria-hidden="true" />
              <div className="text-sm text-muted-foreground">
                <p className="font-medium text-foreground mb-1">
                  {t("onboarding.pricing.earningsBreakdown", "Earnings Breakdown")}
                </p>
                <p>
                  {t("onboarding.pricing.platformFeeDesc", { 
                    fee: PLATFORM_FEE_PERCENTAGE, 
                    defaultValue: `Our platform charges a ${PLATFORM_FEE_PERCENTAGE}% service fee to cover payment processing, platform maintenance, and support.` 
                  })}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t("onboarding.pricing.clientPays", "Client pays:")}</span>
                <span className="font-medium">
                  {selectedCurrency?.symbol}
                  {hourlyRate.toFixed(2)}/{t("common.hour", "hour")}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">
                  {t("onboarding.pricing.platformFee", { fee: PLATFORM_FEE_PERCENTAGE, defaultValue: `Platform fee (${PLATFORM_FEE_PERCENTAGE}%):` })}
                </span>
                <span className="text-red-600">
                  -{selectedCurrency?.symbol}
                  {platformFee.toFixed(2)}
                </span>
              </div>
              <div className="h-px bg-border my-2" />
              <div className="flex justify-between text-base font-semibold">
                <span>{t("onboarding.pricing.youEarn", "You earn:")}</span>
                <span className="text-green-600">
                  {selectedCurrency?.symbol}
                  {yourEarnings.toFixed(2)}/{t("common.hour", "hour")}
                </span>
              </div>
            </div>

            <div className="mt-4 p-3 bg-background rounded-md border">
              <p className="text-xs text-muted-foreground">
                 {/* This one is tricky with nesting. I'll use Trans or simple interpolation string. Simple string for now. */}
                 {/* <strong>Example:</strong> If you complete 20 hours... */}
                 {t("onboarding.pricing.example", { 
                    count: 20, 
                    amount: `${selectedCurrency?.symbol}${(yourEarnings * 20).toFixed(2)}`,
                    defaultValue: `When coaching 20 hours/month, you'll earn approx. ${selectedCurrency?.symbol}${(yourEarnings * 20).toFixed(2)}/month`
                 })}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={onBack}
          className="flex-1"
        >
          {t("common.back", "Back")}
        </Button>
        <Button type="submit" className="flex-1">
          {t("common.continue", "Continue")}
        </Button>
      </div>
    </form>
  );
}
