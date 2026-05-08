"use client";

import { useState, useEffect } from "react";
import {} from "@/components/ui/card";
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
  Download,
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
      // API returns { history: [...] } (already unwrapped by service)
      const historyData = Array.isArray((historyResponse as any)?.history)
        ? (historyResponse as any).history
        : Array.isArray(historyResponse)
          ? historyResponse
          : Array.isArray((historyResponse as any)?.data?.history)
            ? (historyResponse as any).data.history
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
      label: "Total Earnings",
      value: `$${earningsStats?.totalEarnings?.toLocaleString() || "0"}`,
      icon: TrendingUp,
      iconBg: "bg-emerald-500/10",
      iconColor: "text-emerald-500",
      subtext: `${(earningsStats as any)?.totalSessions || 0} completed sessions`,
    },
    {
      label: "This Month",
      value: `$${(earningsStats as any)?.monthlyEarnings?.toLocaleString() || "0"}`,
      icon: Clock,
      iconBg: "bg-amber-500/10",
      iconColor: "text-amber-500",
      subtext: `Commission: ${commissionRate}%`,
    },
    {
      label: "Sessions Completed",
      value: (earningsStats as any)?.totalSessions?.toLocaleString() || "0",
      icon: DollarSign,
      iconBg: "bg-blue-500/10",
      iconColor: "text-blue-500",
      subtext: `Currency: ${(earningsStats as any)?.currency || "USD"}`,
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
            className="gap-2"
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

        {/* Transaction History */}
        <div className="dash-card overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--border)] flex justify-between items-center">
            <span className="text-sm font-semibold text-foreground">Transaction History</span>
            <Button variant="outline" size="sm" className="h-8 gap-2 rounded-lg">
              <Download className="w-3.5 h-3.5" />
              Export
            </Button>
          </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-6">Date</TableHead>
                    <TableHead>Student</TableHead>
                    <TableHead className="text-right">Gross</TableHead>
                    <TableHead className="text-right">Fee ({commissionRate}%)</TableHead>
                    <TableHead className="text-right">Net</TableHead>
                    <TableHead className="pr-6">Currency</TableHead>
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
                    paginatedHistory.map((item: any, index) => {
                      const gross = item.amountGross ?? item.amount ?? 0;
                      const dateStr = item.date ? new Date(item.date).toLocaleDateString() : "—";
                      return (
                        <TableRow key={item.id || index} className="hover:bg-[var(--admin-bg-hover,rgba(0,0,0,0.04))] transition-colors">
                          <TableCell className="font-medium text-foreground pl-6">{dateStr}</TableCell>
                          <TableCell className="text-muted-foreground">{item.studentName || item.description || "—"}</TableCell>
                          <TableCell className="text-right font-medium text-foreground">${gross.toFixed(2)}</TableCell>
                          <TableCell className="text-right text-red-500 font-medium">-${calculateFee(gross).toFixed(2)}</TableCell>
                          <TableCell className="text-right font-bold text-emerald-600">${calculateNet(gross).toFixed(2)}</TableCell>
                          <TableCell className="pr-6 text-muted-foreground">{item.currency || "USD"}</TableCell>
                        </TableRow>
                      );
                    }))}
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
  );
}

function LoadingState() {
  return (
    <div className="space-y-8">
      <Skeleton className="h-10 w-1/3" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <Skeleton className="h-96" />
    </div>
  );
}
