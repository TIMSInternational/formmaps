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

export default function AdminTransactionsPage() {
  const router = useRouter();
  const { isAdmin, loading: authLoading } = useAdminAccess();
  const { t } = useTranslation();

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);

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

  // Stats Configuration
  const statsCards = [
    {
      label: "Total Revenue",
      value: formatCurrency(analyticsData?.stats.totalRevenue || 0),
      growth: analyticsData?.stats.monthlyGrowth.revenue || 0,
      icon: CreditCard,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
      border: "border-emerald-100",
      blobColor: "bg-emerald-500"
    },
    {
      label: "Total Transactions",
      value: data?.total?.toLocaleString() || "0",
      growth: null,
      icon: Receipt,
      color: "text-blue-600",
      bg: "bg-blue-50",
      border: "border-blue-100",
      blobColor: "bg-blue-500"
    },
    {
      label: "Active Users",
      value: analyticsData?.stats.totalUsers?.toLocaleString() || "0",
      growth: analyticsData?.stats.monthlyGrowth.users || 0,
      icon: Clock,
      color: "text-amber-600",
      bg: "bg-amber-50",
      border: "border-amber-100",
      blobColor: "bg-amber-500"
    },
    {
      label: "Active Coaches",
      value: (analyticsData?.stats as any)?.activeCoaches?.toLocaleString() || "0",
      growth: null,
      icon: AlertCircle,
      color: "text-violet-600",
      bg: "bg-violet-50",
      border: "border-violet-100",
      blobColor: "bg-violet-500"
    }
  ];

  const handleExport = () => {
    if (!transactions.length) {
      toast.error("No transactions to export");
      return;
    }
    const headers = ["ID", "Date", "Amount", "Currency", "Status", "Description"];
    const rows = transactions.map((t: any) => [
      t.id, t.date || t.createdDate, (t.amount / 100).toFixed(2), t.currency || "USD", t.status, t.description || ""
    ]);
    const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transactions_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Transactions exported");
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

          <Button onClick={handleExport} variant="outline" className="h-10 rounded-xl border-gray-200 bg-white text-gray-700 shadow-sm hover:bg-gray-50 transition-all hover:shadow-md gap-2">
            <Download className="w-4 h-4" />
            {t("admin.transactions.exportReport")}
          </Button>

        </div>

        {/* Tabs & Search */}
        <div className="space-y-4">
          <Tabs defaultValue="all" value={statusFilter} onValueChange={setStatusFilter} className="w-full">
            <TabsList className="bg-white border border-gray-200 p-1 h-12 rounded-xl w-full md:w-auto justify-start overflow-x-auto">
              <TabsTrigger value="all" className="rounded-lg px-4 h-9 data-[state=active]:bg-gray-100 data-[state=active]:text-gray-900">
                All
              </TabsTrigger>
              <TabsTrigger value="completed" className="rounded-lg px-4 h-9 data-[state=active]:bg-emerald-50 data-[state=active]:text-emerald-700">
                Completed
              </TabsTrigger>
              <TabsTrigger value="pending" className="rounded-lg px-4 h-9 data-[state=active]:bg-amber-50 data-[state=active]:text-amber-700">
                Pending
              </TabsTrigger>
              <TabsTrigger value="failed" className="rounded-lg px-4 h-9 data-[state=active]:bg-red-50 data-[state=active]:text-red-700">
                Failed
              </TabsTrigger>
              <TabsTrigger value="refunded" className="rounded-lg px-4 h-9 data-[state=active]:bg-gray-100 data-[state=active]:text-gray-700">
                Refunded
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
                {stat.growth !== null && stat.growth !== undefined && (
                  <div style={{
                    display: "flex", alignItems: "center", gap: 2,
                    fontSize: 11, fontWeight: 500,
                    color: Number(stat.growth) >= 0 ? "var(--admin-accent-green, #10b981)" : "var(--admin-accent-red, #ef4444)",
                  }}>
                    {Number(stat.growth) >= 0 ? "+" : ""}{Math.abs(Number(stat.growth)).toFixed(1)}%
                  </div>
                )}
              </div>
              <div style={{ fontSize: 24, fontWeight: 600, color: "var(--admin-font-primary, #ebebeb)", letterSpacing: "-0.02em" }}>
                {stat.value}
              </div>
              <div style={{ fontSize: 12, color: "var(--admin-font-tertiary, #818181)", marginTop: 4 }}>
                {stat.label}
              </div>
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
                          ID: {trx.userId?.substring(0, 8) || "—"}...
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-gray-600 py-4">{trx.description}</TableCell>
                    <TableCell className="font-bold text-gray-900 py-4">
                      ${(trx.amount / 100).toFixed(2)}
                    </TableCell>
                    <TableCell className="py-4">
                      <Badge
                        variant={
                          trx.status === "completed"
                            ? "default"
                            : trx.status === "pending"
                              ? "secondary"
                              : "destructive"
                        }
                        className={`font-medium shadow-none border-0 ${trx.status === "completed"
                          ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                          : trx.status === "pending"
                            ? "bg-amber-50 text-amber-700 hover:bg-amber-100"
                            : "bg-red-50 text-red-700 hover:bg-red-100"
                          }`}
                      >
                        {t(`admin.transactions.status.${trx.status}`)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-gray-500 py-4">
                      {new Date(trx.date).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-gray-500 py-4">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-gray-100 rounded-md">
                          <CreditCard className="w-3.5 h-3.5 text-gray-600" />
                        </div>
                        <span className="text-sm">{trx.paymentMethodId || "Card"}</span>
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
              Showing page <span className="font-semibold text-gray-900">{page}</span> of <span className="font-semibold text-gray-900">{totalPages || 1}</span>
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
    </div>
  );
}
