"use client";

import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, Download, Receipt, Wallet } from "lucide-react";
import { toast } from "sonner";
import { TableRowsSkeleton } from "@/components/skeletons/TableSkeleton";
import { Skeleton } from "@/components/ui/skeleton";

interface BillingPeriod {
  period?: string;
  totalRevenue?: number;
  totalBookings?: number;
  platformFeeAmount?: number;
  dueDate?: string;
  status?: string;
}

interface BillingHistoryItem {
  id: string;
  period: string;
  totalRevenue: number;
  platformFeeAmount: number;
  status: string;
}

interface BillingSettingsTabProps {
  billingCurrent?: BillingPeriod | null;
  billingHistory?: BillingHistoryItem[] | null;
  isLoading?: boolean;
}

export function BillingSettingsTab({
  billingCurrent,
  billingHistory: billingHistoryProp,
  isLoading: parentLoading,
}: BillingSettingsTabProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [currentPeriod, setCurrentPeriod] = useState<BillingPeriod | null>(null);
  const [billingHistory, setBillingHistory] = useState<BillingHistoryItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    // Initial load logic can use props if provided (assuming structure matches)
    // But for pagination we generally want to fetch fresh
    fetchBillingData(1);
  }, []);

  const fetchBillingData = async (pageToFetch: number) => {
    try {
      setIsLoading(true);
      const { getCoachBilling } = await import("@/services/coachService");
      const data = await getCoachBilling({ page: pageToFetch, limit: 10 });

      setCurrentPeriod(data?.currentPeriod || null);

      // Handle the new paginated structure
      const historyData = data?.billingHistory;
      if (historyData && typeof historyData === 'object' && 'items' in historyData) {
        setBillingHistory(historyData.items || []);
        setTotalPages(historyData.totalPages || 1);
        setPage(historyData.page || pageToFetch);
      } else if (Array.isArray(historyData)) {
        // Fallback for array response
        setBillingHistory(historyData);
        setTotalPages(1);
        setPage(1);
      } else {
        setBillingHistory([]);
      }

    } catch (error) {
      toast.error("Failed to load billing data");
    } finally {
      setIsLoading(false);
    }
  };

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setPage(newPage);
      fetchBillingData(newPage);
    }
  };

  const downloadInvoice = async (billingId: string) => {
    try {
      toast.info("Invoice download starting...");
      const { downloadInvoice } = await import("@/services/coachService");
      await downloadInvoice(billingId);
      toast.success("Invoice downloaded");
    } catch (error) {
      toast.error("Failed to download invoice");
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "paid":
        return "bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-emerald-200";
      case "pending":
        return "bg-amber-100 text-amber-700 hover:bg-amber-100 border-amber-200";
      case "overdue":
        return "bg-red-100 text-red-700 hover:bg-red-100 border-red-200";
      default:
        return "bg-gray-100 text-gray-700 hover:bg-gray-100 border-gray-200";
    }
  };

  if (parentLoading && !currentPeriod) {
    return <div className="p-12 text-center text-gray-500">Loading billing data...</div>;
  }

  return (
    <div className="space-y-10 pt-2">

      {/* 1. Current Billing Period Summary */}
      <section className="space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start gap-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900 leading-tight">Current Billing Period</h2>
            <p className="text-sm text-gray-500 mt-1">
              Overview of your bookings and fees for the current cycle.
            </p>
          </div>
          {currentPeriod?.period && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-full shadow-sm">
              <Skeleton className="w-2 h-2 rounded-full" variant="circle" />
              <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Cycle:</span>
              <span className="text-sm font-semibold text-gray-900">{currentPeriod.period}</span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Total Revenue Card */}
          <Card className="border-gray-200 shadow-sm hover:shadow-md transition-shadow duration-200">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-medium text-gray-500">Total Revenue</p>
                <div className="h-8 w-8 bg-gray-50 border border-gray-100 rounded-lg flex items-center justify-center">
                  <Wallet className="h-4 w-4 text-gray-600" />
                </div>
              </div>
              <div>
                <p className="text-3xl font-bold text-gray-900 tracking-tight">${currentPeriod?.totalRevenue?.toFixed(2) || "0.00"}</p>
                <p className="text-xs text-gray-500 mt-1 font-medium">{currentPeriod?.totalBookings || 0} bookings processed</p>
              </div>
            </CardContent>
          </Card>

          {/* Platform Fees Card */}
          <Card className="border-gray-200 shadow-sm relative overflow-hidden hover:shadow-md transition-shadow duration-200">
            <div className="absolute top-0 right-0 w-24 h-24 bg-red-50 rounded-full -mr-10 -mt-10 opacity-50" />
            <CardContent className="p-6 relative z-10">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-medium text-gray-500">Platform Fees</p>
                <Badge variant="outline" className="border-red-200 text-red-700 bg-red-50/50">15% Fee</Badge>
              </div>
              <div>
                <p className="text-3xl font-bold text-gray-900 tracking-tight">${currentPeriod?.platformFeeAmount?.toFixed(2) || "0.00"}</p>
                <p className="text-xs text-gray-500 mt-1 font-medium">Deducted automatically</p>
              </div>
            </CardContent>
          </Card>

          {/* Next Invoice Card */}
          <Card className="border-gray-200 shadow-sm bg-gray-50/30 hover:shadow-md transition-shadow duration-200">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-medium text-gray-500">Next Invoice</p>
                <Receipt className="h-4 w-4 text-gray-400" />
              </div>
              <div>
                <div className="flex items-baseline gap-2 flex-wrap">
                  <p className="text-xl font-bold text-gray-900">{currentPeriod?.dueDate || "N/A"}</p>
                  {currentPeriod?.status && (
                    <Badge variant="secondary" className={`${getStatusColor(currentPeriod.status)}`}>
                      {currentPeriod.status}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-2 font-medium">Auto-generated on due date</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* 2. Billing History Table */}
      <section className="space-y-6 pt-2">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900 leading-tight">Invoice History</h2>
            <p className="text-sm text-gray-500 mt-1">
              Download past invoices and statements.
            </p>
          </div>
        </div>

        <div className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm ring-1 ring-gray-950/5">
          <Table>
            <TableHeader className="bg-gray-50/50 border-b border-gray-100">
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[30%] pl-6 font-semibold text-gray-600 text-xs uppercase tracking-wider h-12">Period</TableHead>
                <TableHead className="w-[20%] font-semibold text-gray-600 text-xs uppercase tracking-wider h-12">Revenue</TableHead>
                <TableHead className="w-[20%] font-semibold text-gray-600 text-xs uppercase tracking-wider h-12">Fees</TableHead>
                <TableHead className="w-[15%] font-semibold text-gray-600 text-xs uppercase tracking-wider h-12">Status</TableHead>
                <TableHead className="w-[15%] pr-6 text-right font-semibold text-gray-600 text-xs uppercase tracking-wider h-12">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRowsSkeleton columnCount={5} rowCount={5} showActions />
              ) : billingHistory.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-48 text-center text-gray-500">
                    <div className="flex flex-col items-center justify-center p-6">
                      <div className="h-12 w-12 bg-gray-50 rounded-full flex items-center justify-center mb-3">
                        <Receipt className="h-6 w-6 text-gray-300" />
                      </div>
                      <p className="font-medium text-gray-900">No invoices found</p>
                      <p className="text-sm">Invoices will appear here once generated.</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                billingHistory.map((bill) => (
                  <TableRow key={bill.id} className="group hover:bg-gray-50/60 transition-colors border-b border-gray-50 last:border-0 cursor-default">
                    <TableCell className="pl-6 py-4 font-medium text-gray-900">{bill.period}</TableCell>
                    <TableCell className="font-medium text-gray-600">${bill.totalRevenue.toFixed(2)}</TableCell>
                    <TableCell className="font-medium text-red-600">-${bill.platformFeeAmount.toFixed(2)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`font-medium border ${getStatusColor(bill.status)}`}>
                        {bill.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right pr-6">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => downloadInvoice(bill.id)}
                        className="h-8 w-8 p-0 rounded-lg border-gray-200 text-gray-500 hover:text-gray-900 hover:bg-white hover:shadow-sm"
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {/* Pagination Controls */}
          {billingHistory.length > 0 && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50/30">
              <p className="text-sm text-gray-500">
                Showing page <span className="font-medium text-gray-900">{page}</span> of <span className="font-medium text-gray-900">{totalPages}</span>
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(page - 1)}
                  disabled={page <= 1 || isLoading}
                  className="h-8 px-3 text-xs font-medium border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-50"
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(page + 1)}
                  disabled={page >= totalPages || isLoading}
                  className="h-8 px-3 text-xs font-medium border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-50"
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
