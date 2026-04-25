"use client";

import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DollarSign, Wallet } from "lucide-react";
import { toast } from "sonner";
import { useGlobalStore } from "@/store/useGlobalStore";

interface PricingSettingsTabProps {
  coachDetails?: any | null;
  isLoading?: boolean;
  onUpdated?: (newData: any) => void;
}

export function PricingSettingsTab({
  coachDetails,
  isLoading: isParentLoading,
  onUpdated,
}: PricingSettingsTabProps) {
  const { user, platformFee, fetchSettings } = useGlobalStore();
  const [hourlyRate, setHourlyRate] = useState<number>(0);
  const currency = "USD";
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    // Fetch platform fee settings
    fetchSettings();
  }, [fetchSettings]);

  useEffect(() => {
    if (coachDetails) {
      setHourlyRate(coachDetails.hourlyRate || 0);
      setIsLoading(false);
      return;
    }

    const fetchPricing = async () => {
      try {
        setIsLoading(true);
        const { getCoachDetails } = await import("@/services/coachService");
        if (user?.id) {
          const data = await getCoachDetails(user.id);
          if (data) {
            setHourlyRate(data.hourlyRate || 0);
            if (onUpdated) onUpdated(data);
          }
        }
      } catch (error) {
      // error handled silently
    } finally {
        setIsLoading(false);
      }
    };

    if (user?.id) {
      fetchPricing();
    }
  }, [user?.id, coachDetails]);

  const handleSave = async () => {
    try {
      setIsSaving(true);
      const { updateCoachProfile } = await import("@/services/coachService");
      const updatedResponse: any = await updateCoachProfile({
        hourlyRate,
        currency,
      });
      // If update returned an updated coach details, notify parent; otherwise re-fetch
      try {
        if (updatedResponse && typeof updatedResponse === "object") {
          if (onUpdated) onUpdated(updatedResponse?.data || updatedResponse);
        } else if (user?.id) {
          const { getCoachDetails } = await import("@/services/coachService");
          const reloaded = await getCoachDetails(user.id);
          if (reloaded && onUpdated) onUpdated(reloaded);
        }
      } catch (e) {
        // swallow: best-effort refresh
      }
      toast.success("Pricing updated successfully");
    } catch (error) {
      toast.error("Failed to update pricing");
    } finally {
      setIsSaving(false);
    }
  };

  // Earnings Breakdown
  const effectiveFee = coachDetails?.platformCommission !== undefined ? coachDetails.platformCommission : platformFee;
  const feeAmount = (hourlyRate * effectiveFee) / 100;
  const yourEarnings = hourlyRate - feeAmount;

  if (isParentLoading || isLoading) {
    return (
      <div className="p-12 text-center text-gray-500">
        Loading pricing settings...
      </div>
    );
  }

  return (
    <div className="space-y-8 p-1">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
        {/* Left Column: Inputs */}
        <div className="space-y-6">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold text-gray-900">Session Pricing</h2>
            <p className="text-sm text-gray-500">
              Set your hourly rate for 1:1 coaching sessions.
            </p>
          </div>

          <Card className="border-gray-200 shadow-sm bg-white">
            <CardContent className="p-6 space-y-6">
              <div className="space-y-3">
                <Label htmlFor="currency" className="text-sm font-medium text-gray-700">Currency</Label>
                <Select value="USD" disabled>
                  <SelectTrigger className="h-11 rounded-lg bg-gray-50/50 border-gray-200">
                    <SelectValue placeholder="Select currency" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD ($)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <Label htmlFor="rate" className="text-sm font-medium text-gray-700">Hourly Rate</Label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <span className="text-gray-500 sm:text-sm">$</span>
                  </div>
                  <Input
                    id="rate"
                    type="number"
                    min="0"
                    step="0.01"
                    className="pl-7 h-11 rounded-lg bg-white border-gray-200 text-lg font-medium"
                    placeholder="0.00"
                    value={hourlyRate}
                    onChange={(e) => setHourlyRate(parseFloat(e.target.value) || 0)}
                  />
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                    <span className="text-gray-500 sm:text-sm">/ hr</span>
                  </div>
                </div>
                <p className="text-xs text-gray-500">
                  Clients will see this price when booking sessions.
                </p>
              </div>
            </CardContent>
          </Card>

          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="w-full sm:w-auto h-11 px-8 rounded-xl font-semibold bg-gray-900 text-white hover:bg-gray-800 shadow-sm"
          >
            {isSaving ? "Saving..." : "Save Changes"}
          </Button>
        </div>

        {/* Right Column: Preview/Breakdown */}
        <div className="space-y-6">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold text-gray-900">Earnings Breakdown</h2>
            <p className="text-sm text-gray-500">
              Breakdown of what you earn per session after fees.
            </p>
          </div>

          <Card className="border-0 shadow-none bg-gray-50/80">
            <CardContent className="p-6 space-y-6">
              <div className="flex items-center justify-between p-4 bg-white rounded-xl border border-gray-100 shadow-sm">
                <div>
                  <p className="text-sm font-medium text-gray-500">Client Pays</p>
                  <p className="text-2xl font-bold text-gray-900">${hourlyRate.toFixed(2)}</p>
                </div>
                <div className="h-10 w-10 bg-gray-100 rounded-full flex items-center justify-center">
                  <DollarSign className="w-5 h-5 text-gray-600" />
                </div>
              </div>

              <div className="relative pl-6 space-y-4 border-l-2 border-dashed border-gray-200 ml-6 pb-2">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-500">Platform Fee ({effectiveFee}%)</span>
                  <span className="font-medium text-red-500">-${feeAmount.toFixed(2)}</span>
                </div>
              </div>

              <div className="flex items-center justify-between p-5 bg-emerald-600 text-white rounded-xl shadow-md shadow-emerald-200">
                <div>
                  <p className="text-sm font-medium text-emerald-100 mb-1">Your Net Earnings</p>
                  <p className="text-3xl font-bold">${yourEarnings.toFixed(2)}</p>
                </div>
                <div className="h-12 w-12 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
                  <Wallet className="w-6 h-6 text-white" />
                </div>
              </div>
              <p className="text-xs text-center text-gray-400">
                Net earnings are transferred to your payout account.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
