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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";

export default function AdminPayoutsPage() {
  const router = useRouter();
  const { isAdmin, loading: authLoading } = useAdminAccess();
  const { t } = useTranslation();
  const { t: tPO } = useTranslation("platform_owner");

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const { confirm, ConfirmDialog } = useConfirmDialog();

  // Fetch Payouts with Pagination
  const { data: payoutsData, isLoading, refetch } = useQuery({
    queryKey: ["adminPayouts", page, statusFilter, searchTerm],
    queryFn: () => getAdminPayouts({
      page,
      limit: 10,
      status: statusFilter === "all" ? undefined : (statusFilter as PayoutStatus),
      search: searchTerm,
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
  const currency = statsData?.currency || "USD";

  // Handle Actions
  // "Approve" only ever flipped the status — FormMaps sends no money. Say so, and confirm first.
  const handleApprove = async (payout: AdminPayout, id: string) => {
    const ok = await confirm({
      title: tPO("payouts.markPaid.confirmTitle"),
      description: tPO("payouts.markPaid.confirmDesc", {
        coach: payout.coachName || payout.coachEmail || "",
        amount: formatCurrency(Number(payout.amount) || 0, payout.currency || "USD"),
      }),
      confirmLabel: tPO("payouts.markPaid.confirmLabel"),
    });
    if (!ok) return;
    setActioningId(id);
    try {
      await approveAdminPayout(id);
      toast.success(tPO("payouts.markPaid.success"));
      refetch();
    } catch (error: any) {
      toast.error(error?.message || t("pages.admin.payouts.approveFailed"));
    } finally {
      setActioningId(null);
    }
  };

  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const openRejectDialog = (id: string) => {
    setRejectId(id);
    setRejectReason("");
    setRejectDialogOpen(true);
  };

  const handleReject = async () => {
    if (!rejectId || !rejectReason.trim()) return;

    setRejectDialogOpen(false);
    setActioningId(rejectId);
    try {
      await rejectAdminPayout(rejectId, rejectReason.trim());
      toast.success(t("admin.payouts.toast.rejected", { defaultValue: "Payout rejected" }));
      refetch();
    } catch (error: any) {
      toast.error(error?.message || t("pages.admin.payouts.rejectFailed"));
    } finally {
      setActioningId(null);
      setRejectId(null);
    }
  };

  // Auth Guard
  useEffect(() => {
    if (!authLoading && !isAdmin) {
      toast.error(t("admin.accessDenied"));
      router.push("/login");
    }
  }, [isAdmin, authLoading, router]);

  // Debounce Search - Reset Page
  useEffect(() => {
    const timer = setTimeout(() => {
      if (isAdmin) setPage(1);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchTerm, statusFilter]);

  // Stat cards from the commission aggregates (they used to show the commission as "paid out" and the
  // paid-out amount as a count).
  const statsCards = [
    {
      label: tPO("payouts.stats.totalPaidOut"),
      value: formatCurrency(statsData?.totalPayouts || 0, currency),
      icon: Wallet,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
      border: "border-emerald-100",
      blobColor: "bg-emerald-500"
    },
    {
      label: tPO("payouts.stats.paidOutCount"),
      value: (statsData?.completedCount || 0).toLocaleString(),
      icon: CheckCircle,
      color: "text-[var(--admin-accent-blue)]",
      bg: "bg-[var(--admin-accent-blue)]/10",
      border: "border-blue-100",
      blobColor: "bg-[var(--admin-accent-blue)]"
    },
    {
      label: tPO("payouts.stats.pendingPayouts"),
      value: formatCurrency(statsData?.pendingAmount || 0, currency),
      sub: tPO("payouts.stats.pendingCount", { count: statsData?.pendingCount || 0 }),
      icon: Clock,
      color: "text-amber-600",
      bg: "bg-amber-50",
      border: "border-amber-100",
      blobColor: "bg-amber-500"
    },
    {
      label: tPO("payouts.stats.commissionEarned"),
      value: formatCurrency(statsData?.totalCommission || 0, currency),
      icon: XCircle,
      color: "text-violet-600",
      bg: "bg-violet-50",
      border: "border-violet-100",
      blobColor: "bg-violet-500"
    }
  ];


  if (authLoading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="space-y-8">

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
                <SelectValue placeholder={tPO("payouts.filter.placeholder")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{tPO("payouts.filter.allStatuses")}</SelectItem>
                <SelectItem value="pending">{tPO("payouts.filter.pending")}</SelectItem>
                <SelectItem value="approved">{tPO("payouts.filter.approved")}</SelectItem>
                <SelectItem value="processing">{tPO("payouts.filter.processing")}</SelectItem>
                <SelectItem value="completed">{tPO("payouts.filter.completed")}</SelectItem>
                <SelectItem value="rejected">{tPO("payouts.filter.rejected")}</SelectItem>
                <SelectItem value="failed">{tPO("payouts.filter.failed")}</SelectItem>
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
              style={{
                borderRadius: "var(--admin-radius-lg, 8px)",
                border: "1px solid var(--admin-border-default, #2a2a2a)",
                background: "var(--admin-bg-card, #1e1e1e)",
                padding: 16,
                transition: "border-color 0.15s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--admin-border-hover, #333)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--admin-border-default, #2a2a2a)"; }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 6,
                  background: "var(--admin-bg-icon-box, #2a2a2a)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <stat.icon style={{ width: 16, height: 16, color: "var(--admin-font-tertiary, #818181)" }} />
                </div>
              </div>
              <div style={{ fontSize: 24, fontWeight: 600, color: "var(--admin-font-primary, #ebebeb)", letterSpacing: "-0.02em" }}>
                {stat.value}
              </div>
              <div style={{ fontSize: 12, color: "var(--admin-font-tertiary, #818181)", marginTop: 4 }}>
                {stat.label}
              </div>
              {"sub" in stat && stat.sub && (
                <div style={{ fontSize: 11, color: "var(--admin-font-tertiary, #818181)", marginTop: 2 }}>{stat.sub}</div>
              )}
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
                          {tPO(`payouts.status.${payout.status}`, { defaultValue: payout.status })}
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
                                onClick={() => payoutId && openRejectDialog(payoutId)}
                                title={t("admin.payouts.actions.reject")}
                              >
                                {actioningId === payoutId ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 w-8 p-0 rounded-full text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                                disabled={!payoutId || actioningId === payoutId}
                                onClick={() => payoutId && handleApprove(payout, payoutId)}
                                title={tPO("payouts.markPaid.action")}
                                aria-label={tPO("payouts.markPaid.action")}
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
              {tPO("payouts.pagination.showingPage", { page, total: totalPages || 1 })}
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

      {/* Rejection Reason Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{tPO("payouts.rejectDialog.title")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Textarea
              placeholder={tPO("payouts.rejectDialog.reasonPlaceholder")}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
              {tPO("payouts.rejectDialog.cancelButton")}
            </Button>
            <Button
              variant="destructive"
              disabled={!rejectReason.trim()}
              onClick={handleReject}
            >
              {tPO("payouts.rejectDialog.rejectButton")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog />
    </div>
  );
}
