"use client";

import React, { useState, useEffect } from "react";
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
import { Input } from "@/components/ui/input";
import {
  Download,
  Search,
  ArrowUpRight,
  Receipt,
  MoreHorizontal,
  CreditCard,
  Calendar,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  getUserTransactions,
  Transaction,
} from "@/services/transactionService";
import { useExportTransactions } from "@/hooks/useTransactionDashboard";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { motion } from "motion/react";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 120, damping: 18 } },
};

export default function TransactionsPage() {
  const { t } = useTranslation();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 10;

  const { mutate: exportTransactions, isPending: isExporting } =
    useExportTransactions();

  useEffect(() => {
    fetchTransactions();
  }, [page]);

  const fetchTransactions = async () => {
    setIsLoading(true);
    try {
      const response = await getUserTransactions({ page, limit });
      setTransactions(response.items);
      setTotal(response.total);
    } catch (error) {
      toast.error(t("transactions.fetchFailed"));
    } finally {
      setIsLoading(false);
    }
  };

  const filteredTransactions = transactions.filter((trx) => {
    const matchesSearch =
      trx.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      trx.id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus =
      statusFilter === "all" ? true : trx.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const totalPages = Math.ceil(total / limit);

  const handleExportCSV = () => {
    exportTransactions(
      { format: "csv" },
      {
        onSuccess: () => {
          toast.success(
            t("transactions.exportSuccess") ||
              "Transactions exported successfully"
          );
        },
        onError: () => {
          toast.error(
            t("transactions.exportFailed") || "Failed to export transactions"
          );
        },
      }
    );
  };

  // Calculate stats
  const totalSpent = transactions
    .filter((t) => t.status === "completed")
    .reduce((acc, curr) => acc + curr.amount, 0);

  const invoiceCount = transactions.filter(
    (t) => t.status === "completed"
  ).length;

  const activeMethod =
    transactions.length > 0 ? transactions[0].method : "No active method";

  const statsCards = [
    {
      label: t("transactions.totalSpent"),
      value: `$${totalSpent.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
      icon: ArrowUpRight,
      accentColor: "text-emerald-600",
      accentBg: "bg-emerald-500/10",
    },
    {
      label: t("transactions.invoices"),
      value: invoiceCount.toString(),
      icon: Receipt,
      accentColor: "text-blue-600",
      accentBg: "bg-blue-500/10",
    },
    {
      label: t("transactions.lastUsedMethod"),
      value: activeMethod || "N/A",
      icon: CreditCard,
      accentColor: "text-amber-600",
      accentBg: "bg-amber-500/10",
    },
  ];

  return (
    <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-muted-foreground">
              Billing
            </p>
            <h1 className="text-3xl font-bold text-foreground tracking-tight">
              {t("transactions.title")}
            </h1>
            <p className="text-muted-foreground">
              {t("transactions.subtitle")}
            </p>
          </div>
          <Button
            className="bg-foreground text-background hover:bg-foreground/90 rounded-xl h-10 gap-2"
            onClick={handleExportCSV}
            disabled={isExporting}
          >
            <Download className="w-4 h-4" />
            {isExporting ? "Exporting..." : t("transactions.exportCSV")}
          </Button>
        </div>

        {/* Stats Row */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-1 md:grid-cols-3 gap-6"
        >
          {statsCards.map((stat, index) => (
            <motion.div key={index} variants={itemVariants}>
              <div className="dash-card p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">{stat.label}</p>
                    <h3 className="mt-2 text-3xl font-bold tracking-tight text-foreground">
                      {stat.value}
                    </h3>
                  </div>
                  <div className={cn("rounded-xl p-3", stat.accentBg, stat.accentColor)}>
                    <stat.icon className="h-5 w-5" />
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* Filters */}
        <div className="space-y-4">
          <Tabs defaultValue="all" value={statusFilter} onValueChange={setStatusFilter} className="w-full">
            <TabsList className="bg-card border border-border p-1 h-12 rounded-xl w-full md:w-auto justify-start overflow-x-auto">
              <TabsTrigger value="all" className="rounded-lg px-4 h-9 data-[state=active]:bg-secondary data-[state=active]:text-foreground">
                All
              </TabsTrigger>
              <TabsTrigger value="completed" className="rounded-lg px-4 h-9 data-[state=active]:bg-emerald-500/10 data-[state=active]:text-emerald-600">
                Completed
              </TabsTrigger>
              <TabsTrigger value="pending" className="rounded-lg px-4 h-9 data-[state=active]:bg-amber-500/10 data-[state=active]:text-amber-600">
                Pending
              </TabsTrigger>
              <TabsTrigger value="failed" className="rounded-lg px-4 h-9 data-[state=active]:bg-red-500/10 data-[state=active]:text-red-600">
                Failed
              </TabsTrigger>
              <TabsTrigger value="refunded" className="rounded-lg px-4 h-9 data-[state=active]:bg-secondary data-[state=active]:text-muted-foreground">
                Refunded
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t("transactions.searchPlaceholder")}
              className="pl-9 h-11 bg-card border-border rounded-xl"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Table */}
          <div className="dash-card p-0 overflow-hidden">
            <Table>
              <TableHeader className="bg-secondary">
                <TableRow className="border-border hover:bg-secondary">
                  <TableHead className="py-4 font-semibold text-muted-foreground pl-6">Transaction ID</TableHead>
                  <TableHead className="py-4 font-semibold text-muted-foreground">Description</TableHead>
                  <TableHead className="py-4 font-semibold text-muted-foreground">Date</TableHead>
                  <TableHead className="py-4 font-semibold text-muted-foreground">Method</TableHead>
                  <TableHead className="py-4 font-semibold text-muted-foreground">Status</TableHead>
                  <TableHead className="py-4 font-semibold text-muted-foreground text-right pr-6">Amount</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTransactions.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="h-48 text-center text-muted-foreground"
                    >
                      <div className="flex flex-col items-center justify-center gap-2">
                        <Receipt className="h-8 w-8 text-muted-foreground" />
                        <p>{t("transactions.noTransactions")}</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                filteredTransactions.map((trx) => (
                  <TableRow
                    key={trx.id}
                    className="group hover:bg-secondary border-border transition-colors"
                  >
                    <TableCell className="font-medium pl-6 text-foreground py-4">
                      {trx.id}
                    </TableCell>
                    <TableCell className="text-muted-foreground font-medium py-4">
                      {trx.description}
                    </TableCell>
                    <TableCell className="text-muted-foreground py-4">
                      {new Date(trx.date).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </TableCell>
                    <TableCell className="text-muted-foreground py-4">
                      <div className="flex items-center gap-2">
                        {trx.method &&
                        (trx.method.includes("Visa") ||
                        trx.method.includes("Mastercard")) ? (
                        <CreditCard className="w-3.5 h-3.5" />
                        ) : (
                        <Receipt className="w-3.5 h-3.5" />
                        )}
                        {trx.method || "N/A"}
                      </div>
                    </TableCell>
                    <TableCell className="py-4">
                      <Badge
                        variant="secondary"
                        className={cn(
                          "font-medium border-0",
                          trx.status === "completed" &&
                            "bg-emerald-500/10 text-emerald-600",
                          trx.status === "pending" &&
                            "bg-amber-500/10 text-amber-600",
                          trx.status === "failed" &&
                            "bg-red-500/10 text-red-600"
                        )}
                      >
                        {trx.status.charAt(0).toUpperCase() + trx.status.slice(1)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-bold text-foreground pr-6 py-4">
                      {trx.currency === "USD" ? "$" : trx.currency}
                      {trx.amount.toFixed(2)}
                    </TableCell>
                    <TableCell className="py-4">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="rounded-xl">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuItem>View Details</DropdownMenuItem>
                          <DropdownMenuItem>Download Invoice</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-red-600">
                            Report Issue
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                )))}
              </TableBody>
            </Table>

            {/* Pagination */}
            <div className="flex items-center justify-between border-t border-border p-4 bg-secondary">
              <p className="text-sm text-muted-foreground">
                Showing page <span className="font-semibold text-foreground">{page}</span> of <span className="font-semibold text-foreground">{totalPages || 1}</span>
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1 || isLoading}
                  className="rounded-lg border-border h-8 text-muted-foreground"
                >
                  {t("common.previous") || "Previous"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages || isLoading}
                  className="rounded-lg border-border h-8 text-muted-foreground"
                >
                  {t("common.next") || "Next"}
                </Button>
              </div>
            </div>
          </div>
        </div>
    </div>
  );
}
