"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAdminAccess } from "@/hooks/useAdminAccess";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Search,
  Loader2,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  Wallet,
  DollarSign,
  Filter
} from "lucide-react";
import { DashboardSkeleton } from "@/components/skeletons/DashboardSkeleton";
import { TableRowsSkeleton } from "@/components/skeletons/TableSkeleton";
import { Input } from "@/components/ui/input";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  getAdminPayouts,
  approveAdminPayout,
  rejectAdminPayout,
  AdminPayout,
  getCommissionStats,
  CommissionStatsResponse
} from "@/services/adminPayoutService";
import { PayoutStatus } from "@/types/coach";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency } from "@/lib/utils";
import { useQuery, keepPreviousData } from "@tanstack/react-query";

export default function AdminPayoutsPage() {
  const router = useRouter();
  const { isAdmin, loading: authLoading } = useAdminAccess();
  const { t } = useTranslation();

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [actioningId, setActioningId] = useState<string | null>(null);

  // Fetch Payouts with Pagination
  const { data: payoutsData, isLoading, refetch } = useQuery({
    queryKey: ["adminPayouts", page, statusFilter, searchTerm],
    queryFn: () => getAdminPayouts({
      page,
      limit: 10,
      status: statusFilter === "all" ? undefined : (statusFilter as PayoutStatus),
      // For search, we might need backend support or handling it differently if the API matches
      // Assuming the API generally supports filtering by status and pagination
    }),
    enabled: isAdmin,
    placeholderData: keepPreviousData,
    staleTime: 60000, // 1 minute
  });

  // Fetch Stats
  const { data: statsData } = useQuery({
    queryKey: ["adminPayoutStats"],
    queryFn: () => getCommissionStats(), // Fetches global stats
    enabled: isAdmin,
  });

  const payouts = payoutsData?.items || [];
  const totalPages = payoutsData?.totalPages || 1;

  // Handle Actions
  const handleApprove = async (id: string) => {
    setActioningId(id);
    try {
      await approveAdminPayout(id);
      toast.success(t("admin.payouts.toast.approved", { defaultValue: "Payout approved" }));
      refetch();
    } catch (error: any) {
      toast.error(error?.message || "Failed to approve payout");
    } finally {
      setActioningId(null);
    }
  };

  const handleReject = async (id: string) => {
    const reason = prompt(t("admin.payouts.prompt.reason", { defaultValue: "Enter a reason for rejection" }));
    if (!reason) return;

    setActioningId(id);
    try {
      await rejectAdminPayout(id, reason);
      toast.success(t("admin.payouts.toast.rejected", { defaultValue: "Payout rejected" }));
      refetch();
    } catch (error: any) {
      toast.error(error?.message || "Failed to reject payout");
    } finally {
      setActioningId(null);
    }
  };

  // Auth Guard
  useEffect(() => {
    if (!authLoading && !isAdmin) {
      toast.error(t("admin.accessDenied"));
      router.push("/dashboard");
    }
  }, [isAdmin, authLoading, router]);

  // Debounce Search - Reset Page
  useEffect(() => {
    const timer = setTimeout(() => {
      if (isAdmin) setPage(1);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchTerm, statusFilter]);

  // Computed Stats for Cards (Using API data + fallbacks)
  const statsCards = [
    {
      label: "Total Paid Out",
      value: formatCurrency(statsData?.totalCommission || 0), // Assuming this maps to paid out or similar
      icon: Wallet,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
      border: "border-emerald-100",
      blobColor: "bg-emerald-500"
    },
    {
      label: "Total Payouts",
      value: (statsData?.totalPayouts || 0).toLocaleString(),
      icon: CheckCircle,
      color: "text-blue-600",
      bg: "bg-blue-50",
      border: "border-blue-100",
      blobColor: "bg-blue-500"
    },
    {
      label: "Requests Pending",
      value: payoutsData?.total && statusFilter === 'pending' ? payoutsData.total : "—", // Approximate if filtered
      icon: Clock,
      color: "text-amber-600",
      bg: "bg-amber-50",
      border: "border-amber-100",
      blobColor: "bg-amber-500"
    },
    {
      label: "Failed Requests",
      value: "—", // Placeholder as detailed breakdown might need separate stats endpoint
      icon: XCircle,
      color: "text-red-600",
      bg: "bg-red-50",
      border: "border-red-100",
      blobColor: "bg-red-500"
    }
  ];


  if (authLoading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="min-h-screen bg-gray-50/50 p-6 md:p-8 font-sans text-gray-900">
      <div className="max-w-7xl mx-auto space-y-8">

        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="space-y-1">
            <h1 className="text-4xl font-bold tracking-tight text-gray-900">
              {t("admin.payouts.title")}
            </h1>
            <p className="text-lg text-gray-500 font-medium">
              {t("admin.payouts.subtitle")}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
            {/* Search */}
            <div className="relative w-full md:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder={t("admin.payouts.searchPlaceholder")}
                className="pl-9 h-10 bg-white border-gray-200 rounded-xl shadow-sm focus:ring-gray-900 focus:border-gray-900 transition-shadow"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            {/* Filter */}
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[160px] h-10 bg-white border-gray-200 rounded-xl shadow-sm text-gray-600 font-medium">
                <SelectValue placeholder="Filter by Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="processing">Processing</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={() => refetch()} variant="outline" size="icon" className="h-10 w-10 rounded-xl bg-white border-gray-200 shadow-sm hover:bg-gray-50">
              <Filter className="h-4 w-4 text-gray-500" />
            </Button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
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
                </div>
                <div className={`rounded-xl ${stat.bg} p-3 ${stat.color} bg-opacity-50`}>
                  <stat.icon className="h-6 w-6" />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Payouts Table */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition-all duration-300">
          <Table>
            <TableHeader className="bg-gray-50/50">
              <TableRow className="border-gray-50 hover:bg-gray-50/50">
                <TableHead className="py-4 font-semibold text-gray-600 pl-6">{t("admin.payouts.table.payoutId")}</TableHead>
                <TableHead className="py-4 font-semibold text-gray-600">{t("admin.payouts.table.coach")}</TableHead>
                <TableHead className="py-4 font-semibold text-gray-600">{t("admin.payouts.table.period")}</TableHead>
                <TableHead className="py-4 font-semibold text-gray-600 text-right">{t("admin.payouts.table.amount")}</TableHead>
                <TableHead className="py-4 font-semibold text-gray-600">{t("admin.payouts.table.status")}</TableHead>
                <TableHead className="py-4 font-semibold text-gray-600 text-right pr-6">{t("admin.payouts.table.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRowsSkeleton columnCount={6} rowCount={5} />
              ) : payouts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-48 text-center text-gray-500">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Wallet className="h-8 w-8 text-gray-300" />
                      <p>{t("admin.payouts.noPending")}</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                payouts.map((payout) => {
                  const payoutId = (payout.id || payout.payoutId || "").toString();
                  return (
                    <TableRow key={payoutId || payout.coachId} className="border-gray-50 hover:bg-gray-50/50 transition-colors">
                      <TableCell className="font-medium text-gray-500 pl-6 py-4 text-xs">
                        {payoutId ? payoutId.substring(0, 8) + '...' : "—"}
                      </TableCell>
                      <TableCell className="py-4">
                        <div className="flex flex-col">
                          <span className="font-semibold text-gray-900">{payout.coachName || "Unknown Coach"}</span>
                          <span className="text-xs text-gray-400">{payout.coachEmail}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-gray-600 py-4 text-sm">
                        {payout.periodStart ? (
                          <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3 text-gray-400" />
                            <span>{new Date(payout.periodStart).toLocaleDateString()}</span>
                            {payout.periodEnd && <span> - {new Date(payout.periodEnd).toLocaleDateString()}</span>}
                          </div>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-right font-bold text-gray-900 py-4">
                        {formatCurrency(payout.netAmount ?? payout.amount, payout.currency)}
                      </TableCell>
                      <TableCell className="py-4">
                        <Badge
                          variant="outline"
                          className={`font-medium shadow-none border-0 ${payout.status === 'completed'
                            ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                            : payout.status === 'processing'
                              ? "bg-blue-50 text-blue-700 hover:bg-blue-100"
                              : payout.status === 'failed'
                                ? "bg-red-50 text-red-700 hover:bg-red-100"
                                : "bg-amber-50 text-amber-700 hover:bg-amber-100"
                            }`}
                        >
                          {payout.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right pr-6 py-4">
                        <div className="flex justify-end gap-2">
                          {payout.status === 'pending' && (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 w-8 p-0 rounded-full text-red-500 hover:text-red-700 hover:bg-red-50"
                                disabled={!payoutId || actioningId === payoutId}
                                onClick={() => payoutId && handleReject(payoutId)}
                                title="Reject"
                              >
                                {actioningId === payoutId ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 w-8 p-0 rounded-full text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                                disabled={!payoutId || actioningId === payoutId}
                                onClick={() => payoutId && handleApprove(payoutId)}
                                title="Approve"
                              >
                                {actioningId === payoutId ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>

          {/* Pagination */}
          <div className="flex items-center justify-between border-t border-gray-100 p-4 bg-gray-50/30">
            <p className="text-sm text-gray-500">
              Showing page <span className="font-semibold text-gray-900">{page}</span> of <span className="font-semibold text-gray-900">{totalPages || 1}</span>
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1 || isLoading}
                className="rounded-lg border-gray-200 hover:bg-white hover:text-gray-900 text-gray-500 h-8"
              >
                {t("common.previous")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages || isLoading}
                className="rounded-lg border-gray-200 hover:bg-white hover:text-gray-900 text-gray-500 h-8"
              >
                {t("common.next")}
              </Button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
