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
      console.error("Failed to fetch earnings data:", error);
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
      color: "text-emerald-600",
      bg: "bg-emerald-50",
      border: "border-emerald-100",
      blobColor: "bg-emerald-500",
      subtext: "+12% from last month",
      subtextColor: "text-emerald-600"
    },
    {
      label: "Pending Payout",
      value: `$${earningsStats?.pendingPayout?.toLocaleString() || "0"}`,
      icon: Clock,
      color: "text-amber-600",
      bg: "bg-amber-50",
      border: "border-amber-100",
      blobColor: "bg-amber-500",
      subtext: "Next payout: Apr 1st",
      subtextColor: "text-amber-600"
    },
    {
      label: "Last Payout",
      value: `$${earningsStats?.lastPayoutAmount?.toLocaleString() || "0"}`,
      icon: DollarSign,
      color: "text-blue-600",
      bg: "bg-blue-50",
      border: "border-blue-100",
      blobColor: "bg-blue-500",
      subtext: `Paid on ${earningsStats?.lastPayoutDate || "N/A"}`,
      subtextColor: "text-blue-600"
    },
  ];

  if (isLoading) {
    return <LoadingState />;
  }

  if (error || !earningsStats) {
    return (
      <div className="min-h-screen bg-gray-50/50 p-6 md:p-8 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">
            Error loading earnings data
          </h1>
          <p className="text-gray-500 mt-2">{error || "Please try again later"}</p>
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
      console.error("Export failed:", error);
      toast.error("Failed to export earnings report");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50/50 p-6 md:p-8 font-sans text-gray-900">
      <div className="max-w-7xl mx-auto space-y-8">

        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="space-y-1">
            <h1 className="text-4xl font-bold text-gray-900 tracking-tight">
              {t("coaching.earnings.title")}
            </h1>
            <p className="text-lg text-gray-500 font-medium">
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
            className="h-10 gap-2 rounded-xl bg-white border-gray-200 shadow-sm"
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
            <div
              key={index}
              className={`group relative overflow-hidden rounded-2xl border ${stat.border} bg-white p-6 transition-all duration-300 hover:shadow-lg hover:-translate-y-1`}
            >
              <div
                className={`absolute right-0 top-0 h-24 w-24 translate-x-8 translate-y--8 rounded-full ${stat.blobColor} opacity-5 blur-2xl transition-transform duration-500 group-hover:scale-150`}
              />

              <div className="relative flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">{stat.label}</p>
                  <h3 className="mt-2 text-3xl font-bold tracking-tight text-gray-900">
                    {stat.value}
                  </h3>
                  <p className={`text-sm mt-3 font-medium ${stat.subtextColor} flex items-center gap-1.5`}>
                    {stat.icon === TrendingUp && <TrendingUp className="w-3.5 h-3.5" />}
                    {stat.subtext}
                  </p>
                </div>
                <div className={`rounded-xl ${stat.bg} p-3 ${stat.color} bg-opacity-50`}>
                  <stat.icon className="h-6 w-6" />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Breakdown Section */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900">Transaction History</h2>
            <div className="flex gap-2">
              {/* Tabs could go here if needed, keeping it clean for now */}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition-all duration-300">
            {/* Header with Filter */}
            <div className="p-4 border-b border-gray-100 bg-gray-50/30 flex justify-between items-center">
              <div className="relative w-full max-w-sm">
                {/* Search placeholder if needed */}
              </div>
              <Button variant="outline" size="sm" className="h-8 gap-2 rounded-lg bg-white">
                <Filter className="w-3.5 h-3.5" />
                Filter
              </Button>
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-gray-50/50">
                  <TableRow className="border-gray-50 hover:bg-gray-50/50">
                    <TableHead className="py-4 font-semibold text-gray-600 pl-6 w-[140px]">Date</TableHead>
                    <TableHead className="py-4 font-semibold text-gray-600">Description</TableHead>
                    <TableHead className="py-4 font-semibold text-gray-600 text-right">Gross Amount</TableHead>
                    <TableHead className="py-4 font-semibold text-gray-600 text-right">Platform Fee</TableHead>
                    <TableHead className="py-4 font-semibold text-emerald-600 text-right">Net Earning</TableHead>
                    <TableHead className="py-4 font-semibold text-gray-600 pr-6 w-[120px]">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedHistory.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-48 text-center text-gray-500">
                        No transactions found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedHistory.map((item, index) => (
                      <TableRow
                        key={index}
                        className="group hover:bg-gray-50/50 border-gray-50 transition-colors"
                      >
                        <TableCell className="font-medium text-gray-900 pl-6 py-4">
                          {item.date}
                        </TableCell>
                        <TableCell className="text-gray-600 font-medium py-4">
                          {item.description}
                        </TableCell>
                        <TableCell className="text-right font-medium text-gray-900 py-4">
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
              <div className="flex items-center justify-between border-t border-gray-100 p-4 bg-gray-50/30">
                <p className="text-sm text-gray-500">
                  Showing page <span className="font-semibold text-gray-900">{page}</span> of <span className="font-semibold text-gray-900">{totalPages || 1}</span>
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="rounded-lg border-gray-200 hover:bg-white hover:text-gray-900 text-gray-500 h-8"
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="rounded-lg border-gray-200 hover:bg-white hover:text-gray-900 text-gray-500 h-8"
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="min-h-screen bg-gray-50/50 p-6 md:p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <Skeleton className="h-10 w-1/3 rounded-xl" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-40 rounded-3xl" />
          ))}
        </div>
        <Skeleton className="h-96 rounded-3xl" />
      </div>
    </div>
  );
}
