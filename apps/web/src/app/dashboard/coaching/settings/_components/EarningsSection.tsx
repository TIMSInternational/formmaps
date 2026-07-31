"use client";

import { Card, CardContent } from "@/components/ui/card";
import type {
  CoachEarningsStats,
  EarningsHistoryItem,
} from "@/services/coachService";

interface EarningsSectionProps {
  earningsSummary: CoachEarningsStats | null;
  earningsHistory: EarningsHistoryItem[];
  formatCurrency: (value?: number, currency?: string) => string;
}

export function EarningsSection({
  earningsSummary,
  earningsHistory,
  formatCurrency,
}: EarningsSectionProps) {
  return (
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
              key={idx}
              className="flex items-center justify-between bg-white border border-gray-100 rounded-xl px-4 py-3 shadow-sm"
            >
              <div>
                <p className="font-semibold text-gray-900">
                  {item.description || "Session"}
                </p>
                <p className="text-sm text-gray-500">{item.date || ""}</p>
              </div>
              <div className="text-right">
                <p className="font-semibold text-gray-900">
                  {formatCurrency(item.amountNet ?? item.amountGross)}
                </p>
                {typeof item.platformFee === "number" && (
                  <p className="text-xs text-gray-500">
                    Platform fee: {formatCurrency(item.platformFee)}
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
  );
}
