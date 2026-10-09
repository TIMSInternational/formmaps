"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAdminAccess } from "@/hooks/useAdminAccess";
import { useAdminTransactions } from "@/hooks/useAdminTransactions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Search, Download, CreditCard, Receipt, Clock, AlertCircle, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTranslation } from "react-i18next";
import { useAdminAnalytics } from "@/hooks/useAdminAnalytics";
import { formatCurrency } from "@/lib/utils";
import { DashboardSkeleton } from "@/components/skeletons/DashboardSkeleton";
import { TableRowsSkeleton } from "@/components/skeletons/TableSkeleton";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { useQueryClient } from "@tanstack/react-query";
import {
  getAllAdminTransactions,
  refundAdminPayment,
  transactionStatusGroup,
  type AdminTransaction,
} from "@/services/adminTransactionsService";

export default function AdminTransactionsPage() {
  const router = useRouter();
  const { isAdmin, loading: authLoading } = useAdminAccess();
  const { t } = useTranslation();
  const { t: tPO } = useTranslation("platform_owner");

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const [refundingId, setRefundingId] = useState<string | null>(null);
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const queryClient = useQueryClient();

  const {
    data,
    isLoading: transactionsLoading,
    error,
  } = useAdminTransactions({
    page,
    limit: 10,
    search: searchTerm,
    status: statusFilter === "all" ? "" : statusFilter,
  });

  const { data: analyticsData } = useAdminAnalytics("month");

  const transactions = data?.items || [];
  const totalPages = data ? Math.ceil(data.total / data.limit) : 1;
  const loading = transactionsLoading;

  // Revenue in currencies other than the platform's is reported apart, never summed into the total.
  const byCurrency = ((analyticsData?.stats as { revenueByCurrency?: Record<string, number> } | undefined)?.revenueByCurrency) || {};
  const others = Object.entries(byCurrency).filter(([c, v]) => c !== "usd" && v > 0);
  const otherCurrencies = others.length
    ? tPO("transactions.otherCurrencies", { amounts: others.map(([c, v]) => formatCurrency(v, c.toUpperCase())).join(", ") })
    : null;

  // Stats Configuration
  const statsCards = [
    {
      label: tPO("transactions.stats.totalRevenue"),
      value: formatCurrency(analyticsData?.stats.totalRevenue || 0),
      // monthlyGrowth.revenue is DOLLARS collected this month, not a percent (it was shown as "+N%").
      growthLabel: tPO("transactions.growth.revenueThisMonth", { amount: formatCurrency(analyticsData?.stats.monthlyGrowth.revenue || 0) }),
      sub: otherCurrencies,
      icon: CreditCard,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
      border: "border-emerald-100",
      blobColor: "bg-emerald-500"
    },
    {
      label: tPO("transactions.stats.totalTransactions"),
      value: data?.total?.toLocaleString() || "0",
      growthLabel: null,
      icon: Receipt,
      color: "text-[var(--admin-accent-blue)]",
      bg: "bg-[var(--admin-accent-blue)]/10",
      border: "border-[var(--admin-accent-blue)]/20",
      blobColor: "bg-[var(--admin-accent-blue)]"
    },
    {
      label: tPO("transactions.stats.activeUsers"),
      value: analyticsData?.stats.totalUsers?.toLocaleString() || "0",
      // a COUNT of new users this month, not a percent
      growthLabel: tPO("transactions.growth.newUsers", { count: analyticsData?.stats.monthlyGrowth.users || 0 }),
      icon: Clock,
      color: "text-amber-600",
      bg: "bg-amber-50",
      border: "border-amber-100",
      blobColor: "bg-amber-500"
    },
    {
      label: tPO("transactions.stats.activeCoaches"),
      value: (analyticsData?.stats as any)?.activeCoaches?.toLocaleString() || "0",
      growthLabel: null,
      icon: AlertCircle,
      color: "text-violet-600",
      bg: "bg-violet-50",
      border: "border-violet-100",
      blobColor: "bg-violet-500"
    }
  ];

  const handleExport = async () => {
    setExporting(true);
    let all: AdminTransaction[];
    let truncated = false;
    try {
      // Every matching transaction, not just the 10 rows on screen.
      const res = await getAllAdminTransactions({ search: searchTerm, status: statusFilter === "all" ? "" : statusFilter });
      all = res.items;
      truncated = res.truncated;
    } catch (err) {
      toast.error((err as Error).message);
      setExporting(false);
      return;
    }
    setExporting(false);
    if (!all.length) {
      toast.error(tPO("transactions.toast.noTransactions"));
      return;
    }
    const headers = ["ID", "Date", "User", "Email", "Amount", "Currency", "Status", "Description"];
    // Quote every cell and neutralize leading =+-@ (CSV formula injection —
    // descriptions are user-influenced text).
    const cell = (v: unknown) => {
      const s = String(v ?? "");
      return `"${(/^[=+\-@\t\r]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
    };
    const rows = all.map((t) => [
      t.id, t.date, t.userName, t.userEmail, (t.amount / 100).toFixed(2), (t.currency || "usd").toUpperCase(), t.status, t.description || ""
    ]);
    const csv = [headers, ...rows].map((r) => r.map(cell).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transactions_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    if (truncated) toast.warning(tPO("transactions.toast.exportTruncated", { count: all.length }));
    else toast.success(tPO("transactions.toast.exportSuccess"));
  };

  // B12: refunds existed only as an API needing a Stripe PaymentIntent id the page never had.
  const handleRefund = async (trx: AdminTransaction) => {
    const ok = await confirm({
      title: tPO("transactions.refund.confirmTitle"),
      description: tPO("transactions.refund.confirmDesc", {
        amount: formatCurrency(trx.amount / 100, (trx.currency || "usd").toUpperCase()),
        user: trx.userName || trx.userEmail,
      }),
      confirmLabel: tPO("transactions.refund.confirmLabel"),
      variant: "destructive",
    });
    if (!ok) return;
    setRefundingId(trx.id);
    try {
      await refundAdminPayment(trx.id);
      toast.success(tPO("transactions.refund.success"));
      await queryClient.invalidateQueries({ queryKey: ["adminTransactions"] });
    } catch (err) {
      const code = ((err as { data?: { code?: string } }).data?.code) || "generic";
      toast.error(tPO(`transactions.refund.errors.${code}`, { defaultValue: tPO("transactions.refund.errors.generic") }));
    } finally {
      setRefundingId(null);
    }
  };

  // Handle admin access check
  useEffect(() => {
    if (!authLoading) {
      if (!isAdmin) {
        toast.error(t("admin.accessDenied"));
        router.push("/login");
      }
    }
  }, [isAdmin, authLoading, router]);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!authLoading && isAdmin) {
        setPage(1);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  if (authLoading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="space-y-8">

        {/* Header & Actions */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="space-y-1">
            <h1 className="text-4xl font-bold tracking-tight text-gray-900">
              {t("admin.transactions.title")}
            </h1>
            <p className="text-lg text-gray-500 font-medium">
              {t("admin.transactions.subtitle")}
            </p>
          </div>

          <Button onClick={handleExport} disabled={exporting} variant="outline" className="h-10 rounded-xl border-gray-200 bg-white text-gray-700 shadow-sm hover:bg-gray-50 transition-all hover:shadow-md gap-2">
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {t("admin.transactions.exportReport")}
          </Button>

        </div>

        {/* Tabs & Search */}
        <div className="space-y-4">
          <Tabs defaultValue="all" value={statusFilter} onValueChange={setStatusFilter} className="w-full">
            <TabsList className="bg-white border border-gray-200 p-1 h-12 rounded-xl w-full md:w-auto justify-start overflow-x-auto">
              <TabsTrigger value="all" className="rounded-lg px-4 h-9 data-[state=active]:bg-gray-100 data-[state=active]:text-gray-900">
                {tPO("transactions.tabs.all")}
              </TabsTrigger>
              <TabsTrigger value="completed" className="rounded-lg px-4 h-9 data-[state=active]:bg-emerald-50 data-[state=active]:text-emerald-700">
                {tPO("transactions.tabs.completed")}
              </TabsTrigger>
              <TabsTrigger value="pending" className="rounded-lg px-4 h-9 data-[state=active]:bg-amber-50 data-[state=active]:text-amber-700">
                {tPO("transactions.tabs.pending")}
              </TabsTrigger>
              <TabsTrigger value="failed" className="rounded-lg px-4 h-9 data-[state=active]:bg-red-50 data-[state=active]:text-red-700">
                {tPO("transactions.tabs.failed")}
              </TabsTrigger>
              <TabsTrigger value="refunded" className="rounded-lg px-4 h-9 data-[state=active]:bg-gray-100 data-[state=active]:text-gray-700">
                {tPO("transactions.tabs.refunded")}
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder={t("admin.transactions.searchPlaceholder")}
              className="pl-9 h-11 bg-white border-gray-200 rounded-xl shadow-sm focus:ring-gray-900 focus:border-gray-900 transition-shadow"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
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
                {stat.growthLabel && (
                  <div style={{ fontSize: 11, fontWeight: 500, color: "var(--admin-accent-green, #10b981)" }}>
                    {stat.growthLabel}
                  </div>
                )}
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

        {/* Transactions Table Card */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition-all duration-300">
          <Table>
            <TableHeader className="bg-gray-50/50">
              <TableRow className="border-gray-50 hover:bg-gray-50/50">
                <TableHead className="py-4 font-semibold text-gray-600 pl-6">{t("admin.transactions.table.id")}</TableHead>
                <TableHead className="py-4 font-semibold text-gray-600">{t("admin.transactions.table.user")}</TableHead>
                <TableHead className="py-4 font-semibold text-gray-600">{t("admin.transactions.table.description")}</TableHead>
                <TableHead className="py-4 font-semibold text-gray-600">{t("admin.transactions.table.amount")}</TableHead>
                <TableHead className="py-4 font-semibold text-gray-600">{t("admin.transactions.table.status")}</TableHead>
                <TableHead className="py-4 font-semibold text-gray-600">{t("admin.transactions.table.date")}</TableHead>
                <TableHead className="py-4 font-semibold text-gray-600">{t("admin.transactions.table.method")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRowsSkeleton columnCount={7} rowCount={5} />
              ) : transactions.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="h-48 text-center text-gray-500"
                  >
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Receipt className="h-8 w-8 text-gray-300" />
                      <p>{t("admin.transactions.noTransactions")}</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                transactions.map((trx) => (
                  <TableRow key={trx.id} className="border-gray-50 hover:bg-gray-50/50 transition-colors">
                    <TableCell className="font-medium text-xs text-gray-500 pl-6 py-4 font-mono">
                      {trx.id.length > 12 ? `${trx.id.substring(0, 12)}...` : trx.id}
                    </TableCell>
                    <TableCell className="py-4">
                      <div className="flex flex-col">
                        <span className="font-semibold text-gray-900">{trx.userName}</span>
                        <span className="text-xs text-gray-400">
                          {t("pages.admin.transactions.userIdShort", { id: trx.userId?.substring(0, 8) || "—" })}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-gray-600 py-4">{trx.description}</TableCell>
                    <TableCell className="font-bold text-gray-900 py-4">
                      {formatCurrency(trx.amount / 100, (trx.currency || "usd").toUpperCase())}
                    </TableCell>
                    <TableCell className="py-4">
                      <Badge
                        data-testid="transaction-status"
                        data-status={trx.status}
                        variant={
                          transactionStatusGroup(trx.status) === "completed"
                            ? "default"
                            : transactionStatusGroup(trx.status) === "pending"
                              ? "secondary"
                              : "destructive"
                        }
                        className={`font-medium shadow-none border-0 ${{
                          completed: "bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
                          pending: "bg-amber-50 text-amber-700 hover:bg-amber-100",
                          refunded: "bg-gray-100 text-gray-700 hover:bg-gray-100",
                          failed: "bg-red-50 text-red-700 hover:bg-red-100",
                        }[transactionStatusGroup(trx.status)]}`}
                      >
                        {t(`admin.transactions.status.${trx.status}`, { defaultValue: trx.status })}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-gray-500 py-4">
                      {new Date(trx.date).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-gray-500 py-4">
                      <div className="flex items-center gap-2">
                        {/* No payment method is recorded on the row — it used to say "Card" for everything. */}
                        <span className="text-sm">{trx.paymentMethodId || tPO("transactions.noMethod")}</span>
                        {trx.status === "succeeded" && !trx.bookingId && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 rounded-lg text-xs"
                            disabled={refundingId === trx.id}
                            onClick={() => handleRefund(trx)}
                          >
                            {refundingId === trx.id ? <Loader2 className="w-3 h-3 animate-spin" /> : tPO("transactions.refund.action")}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {/* Pagination inside Card */}
          <div className="flex items-center justify-between border-t border-gray-100 p-4 bg-gray-50/30">
            <p className="text-sm text-gray-500">
              {tPO("transactions.pagination.showingPage", { page, total: totalPages || 1 })}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1 || loading}
                className="rounded-lg border-gray-200 hover:bg-white hover:text-gray-900 text-gray-500 h-8"
              >
                {t("common.previous")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages || loading}
                className="rounded-lg border-gray-200 hover:bg-white hover:text-gray-900 text-gray-500 h-8"
              >
                {t("common.next")}
              </Button>
            </div>
          </div>
        </div>
        <ConfirmDialog />
    </div>
  );
}
