"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Payout } from "@/types/coach";

interface PayoutHistorySectionProps {
  payouts: Payout[];
  payoutStatus: string;
  onPayoutStatusChange: (status: string) => void;
  payoutPage: number;
  onPayoutPageChange: (page: number) => void;
  payoutTotalPages: number | undefined;
  isLoading: boolean;
  onRefresh: () => void;
  formatCurrency: (value?: number, currency?: string) => string;
}

export function PayoutHistorySection({
  payouts,
  payoutStatus,
  onPayoutStatusChange,
  payoutPage,
  onPayoutPageChange,
  payoutTotalPages,
  isLoading,
  onRefresh,
  formatCurrency,
}: PayoutHistorySectionProps) {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-bold text-gray-900">Payout History</h3>
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Select
            value={payoutStatus}
            onValueChange={(value) => {
              onPayoutPageChange(1);
              onPayoutStatusChange(value);
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
            onClick={onRefresh}
            disabled={isLoading}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Refresh"
            )}
          </Button>
          <div className="text-sm text-gray-600">
            Page {payoutPage}{" "}
            {payoutTotalPages ? `of ${payoutTotalPages}` : ""}
          </div>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              disabled={payoutPage <= 1}
              onClick={() => onPayoutPageChange(Math.max(1, payoutPage - 1))}
            >
              Prev
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={
                payoutTotalPages ? payoutPage >= payoutTotalPages : false
              }
              onClick={() => onPayoutPageChange(payoutPage + 1)}
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
                  {formatCurrency(
                    payout.netAmount ?? payout.amount,
                    payout.currency
                  )}
                </p>
                <p className="text-sm text-gray-500">
                  {payout.periodStart || "\u2014"}
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
  );
}
