"use client";

import { useState, useEffect } from "react";
import {
  Card,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DollarSign,
  TrendingUp,
  Clock,
  ArrowRight,
  Download,
  Filter,
} from "lucide-react";
import {
  getCoachEarnings,
  getCoachEarningsHistory,
  getCoachProfile,
  CoachEarningsStats,
  EarningsHistoryItem,
} from "@/services/coachService";
import { toast } from "sonner";
import { format } from "date-fns";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

export default function EarningsPage() {
  const { t } = useTranslation();
  const [earningsStats, setEarningsStats] = useState<CoachEarningsStats | null>(
    null
  );
  const [earningsHistory, setEarningsHistory] = useState<EarningsHistoryItem[]>(
    []
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");
  const [commissionRate, setCommissionRate] = useState<number>(20); // Default 20% fallback
  const [isExporting, setIsExporting] = useState(false);

  // Pagination State
  const [page, setPage] = useState(1);
  const limit = 10;

  useEffect(() => {
    fetchEarningsData();
  }, []);

  const fetchEarningsData = async () => {
    try {
      const [statsResponse, historyResponse, profileResponse] = await Promise.all([
        getCoachEarnings(),
        getCoachEarningsHistory(),
        getCoachProfile(),
      ]);
      setEarningsStats(statsResponse);
      if (profileResponse?.platformCommission !== undefined) {
        setCommissionRate(profileResponse.platformCommission);
      }
      const historyData = Array.isArray(historyResponse)
        ? historyResponse
        : Array.isArray((historyResponse as any)?.data)
          ? (historyResponse as any).data
          : [];
      setEarningsHistory(historyData);
      setError(null);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to load earnings data";
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const calculateNet = (gross: number) => {
    return gross * (1 - commissionRate / 100);
  };

  const calculateFee = (gross: number) => {
    return gross * (commissionRate / 100);
  };

  // Modern Stats Cards Data
  const statsCards = [
    {
      label: "Total Earnings (Net)",
      value: `$${earningsStats?.totalEarnings?.toLocaleString() || "0"}`,
      icon: TrendingUp,
      iconBg: "bg-emerald-500/10",
      iconColor: "text-emerald-500",
      subtext: "+12% from last month",
    },
    {
      label: "Pending Payout",
      value: `$${earningsStats?.pendingPayout?.toLocaleString() || "0"}`,
      icon: Clock,
      iconBg: "bg-amber-500/10",
      iconColor: "text-amber-500",
      subtext: "Next payout: Apr 1st",
    },
    {
      label: "Last Payout",
      value: `$${earningsStats?.lastPayoutAmount?.toLocaleString() || "0"}`,
      icon: DollarSign,
      iconBg: "bg-blue-500/10",
      iconColor: "text-blue-500",
      subtext: `Paid on ${earningsStats?.lastPayoutDate || "N/A"}`,
    },
  ];

  if (isLoading) {
    return <LoadingState />;
  }

  if (error || !earningsStats) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground">
            Error loading earnings data
          </h1>
          <p className="text-muted-foreground mt-2">{error || "Please try again later"}</p>
          <Button onClick={() => window.location.reload()} className="mt-4">
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  // Pagination Logic
  const totalPages = Math.ceil(earningsHistory.length / limit);
  const paginatedHistory = earningsHistory.slice((page - 1) * limit, page * limit);



  const handleExport = async () => {
    try {
      setIsExporting(true);
      const { exportCoachEarnings } = await import("@/services/coachService");
      await exportCoachEarnings("csv");
      toast.success("Earnings report exported successfully");
    } catch (error) {
      toast.error("Failed to export earnings report");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-8">

        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-muted-foreground">Financials</p>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">
              {t("coaching.earnings.title")}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t("coaching.earnings.subtitle")}
            </p>
            <div className="flex items-center gap-2 mt-2">
              <Badge variant="secondary" className="bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-200">
                Platform Commission: {commissionRate}%
              </Badge>
            </div>
          </div>
          <Button
            variant="outline"
            className="h-10 gap-2 rounded-xl"
            onClick={handleExport}
            disabled={isExporting}
          >
            <Download className="w-4 h-4" />
            {isExporting ? "Exporting..." : "Export Report"}
          </Button>
        </div>

        {/* Premium Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {statsCards.map((stat, index) => (
            <div key={index} className="dash-card p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className={`h-9 w-9 rounded-lg ${stat.iconBg} flex items-center justify-center`}>
                  <stat.icon className={`h-4 w-4 ${stat.iconColor}`} strokeWidth={1.8} />
                </div>
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{stat.label}</span>
              </div>
              <p className="text-2xl font-bold text-foreground tracking-tight">{stat.value}</p>
              <p className="text-[11px] text-muted-foreground mt-1">{stat.subtext}</p>
            </div>
          ))}
        </div>

        {/* Breakdown Section */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-foreground">Transaction History</h2>
            <div className="flex gap-2">
              {/* Tabs could go here if needed, keeping it clean for now */}
            </div>
          </div>

          <div className="dash-card overflow-hidden">
            {/* Header with Filter */}
            <div className="p-4 border-b border-[var(--border)] flex justify-between items-center">
              <div className="relative w-full max-w-sm">
                {/* Search placeholder if needed */}
              </div>
              <Button variant="outline" size="sm" className="h-8 gap-2 rounded-lg">
                <Filter className="w-3.5 h-3.5" />
                Filter
              </Button>
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-[var(--border)] hover:bg-transparent">
                    <TableHead className="py-4 font-semibold text-muted-foreground pl-6 w-[140px]">Date</TableHead>
                    <TableHead className="py-4 font-semibold text-muted-foreground">Description</TableHead>
                    <TableHead className="py-4 font-semibold text-muted-foreground text-right">Gross Amount</TableHead>
                    <TableHead className="py-4 font-semibold text-muted-foreground text-right">Platform Fee</TableHead>
                    <TableHead className="py-4 font-semibold text-emerald-600 text-right">Net Earning</TableHead>
                    <TableHead className="py-4 font-semibold text-muted-foreground pr-6 w-[120px]">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedHistory.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-48 text-center text-muted-foreground">
                        No transactions found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedHistory.map((item, index) => (
                      <TableRow
                        key={index}
                        className="group hover:bg-muted/30 transition-colors"
                      >
                        <TableCell className="font-medium text-foreground pl-6 py-4">
                          {item.date}
                        </TableCell>
                        <TableCell className="text-muted-foreground font-medium py-4">
                          {item.description}
                        </TableCell>
                        <TableCell className="text-right font-medium text-foreground py-4">
                          ${item.amountGross?.toFixed(2) || "0.00"}
                        </TableCell>
                        <TableCell className="text-right text-red-500 font-medium py-4">
                          -${calculateFee(item.amountGross || 0).toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right font-bold text-emerald-600 py-4">
                          ${calculateNet(item.amountGross || 0).toFixed(2)}
                        </TableCell>
                        <TableCell className="pr-6 py-4">
                          <Badge
                            variant="secondary"
                            className={cn(
                              "font-medium shadow-none border-0",
                              item.status === "completed"
                                ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                : item.status === "pending"
                                  ? "bg-amber-50 text-amber-700 hover:bg-amber-100"
                                  : "bg-red-50 text-red-700 hover:bg-red-100"
                            )}
                          >
                            {item.status === "completed"
                              ? "Paid"
                              : item.status === "pending"
                                ? "Pending"
                                : "Cancelled"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    )))}
                </TableBody>
              </Table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-[var(--border)] p-4">
                <p className="text-sm text-muted-foreground">
                  Showing page <span className="font-semibold text-foreground">{page}</span> of <span className="font-semibold text-foreground">{totalPages || 1}</span>
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="rounded-lg h-8"
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="rounded-lg h-8"
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-8">
        <Skeleton className="h-10 w-1/3 rounded-xl" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-40 rounded-3xl" />
          ))}
        </div>
        <Skeleton className="h-96 rounded-3xl" />
    </div>
  );
}
