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
      console.error("Failed to fetch transactions:", error);
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
      color: "text-emerald-600",
      bg: "bg-emerald-50",
      border: "border-emerald-100",
      blobColor: "bg-emerald-500",
    },
    {
      label: t("transactions.invoices"),
      value: invoiceCount.toString(),
      icon: Receipt,
      color: "text-blue-600",
      bg: "bg-blue-50",
      border: "border-blue-100",
      blobColor: "bg-blue-500",
    },
    {
      label: t("transactions.lastUsedMethod"),
      value: activeMethod || "N/A",
      icon: CreditCard,
      color: "text-amber-600",
      bg: "bg-amber-50",
      border: "border-amber-100",
      blobColor: "bg-amber-500",
    },
  ];


  return (
    <div className="min-h-screen bg-gray-50/50 p-6 md:p-8 font-sans text-gray-900">
      <div className="max-w-7xl mx-auto space-y-8">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="space-y-1">
          <h1 className="text-4xl font-bold text-gray-900 tracking-tight">
            {t("transactions.title")}
          </h1>
          <p className="text-lg text-gray-500 font-medium">
            {t("transactions.subtitle")}
          </p>
        </div>
        <div>
          <Button
            variant="outline"
            className="h-10 gap-2 rounded-xl bg-white border-gray-200 shadow-sm"
            onClick={handleExportCSV}
            disabled={isExporting}
          >
            <Download className="w-4 h-4" />
            {isExporting ? "Exporting..." : t("transactions.exportCSV")}
          </Button>
        </div>
      </div>

       {/* Stats Grid */}
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
                </div>
                <div className={`rounded-xl ${stat.bg} p-3 ${stat.color} bg-opacity-50`}>
                    <stat.icon className="h-6 w-6" />
                </div>
                </div>
            </div>
            ))}
        </div>

      {/* Filters and Table */}
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
            placeholder={t("transactions.searchPlaceholder")}
            className="pl-9 h-11 bg-white border-gray-200 rounded-xl shadow-sm focus:ring-gray-900 focus:border-gray-900 transition-shadow"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            />
        </div>
      
        {/* Table Card */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition-all duration-300">
          <Table>
            <TableHeader className="bg-gray-50/50">
              <TableRow className="border-gray-50 hover:bg-gray-50/50">
                <TableHead className="py-4 font-semibold text-gray-600 pl-6">Transaction ID</TableHead>
                <TableHead className="py-4 font-semibold text-gray-600">Description</TableHead>
                <TableHead className="py-4 font-semibold text-gray-600">Date</TableHead>
                <TableHead className="py-4 font-semibold text-gray-600">Method</TableHead>
                <TableHead className="py-4 font-semibold text-gray-600">Status</TableHead>
                <TableHead className="py-4 font-semibold text-gray-600 text-right pr-6">Amount</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTransactions.length === 0 ? (
                 <TableRow>
                  <TableCell
                    colSpan={7}
                    className="h-48 text-center text-gray-500"
                  >
                     <div className="flex flex-col items-center justify-center gap-2">
                        <Receipt className="h-8 w-8 text-gray-300" />
                        <p>{t("transactions.noTransactions")}</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
              filteredTransactions.map((trx) => (
                <TableRow
                  key={trx.id}
                  className="group hover:bg-gray-50/50 border-gray-50 transition-colors"
                >
                  <TableCell className="font-medium pl-6 text-gray-900 py-4">
                    {trx.id}
                  </TableCell>
                  <TableCell className="text-gray-600 font-medium py-4">
                    {trx.description}
                  </TableCell>
                  <TableCell className="text-gray-500 py-4">
                    {new Date(trx.date).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </TableCell>
                  <TableCell className="text-gray-500 py-4">
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
                        "font-medium shadow-none border-0",
                        trx.status === "completed" &&
                          "bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
                        trx.status === "pending" &&
                          "bg-amber-50 text-amber-700 hover:bg-amber-100",
                        trx.status === "failed" &&
                          "bg-red-50 text-red-700 hover:bg-red-100"
                      )}
                    >
                      {trx.status.charAt(0).toUpperCase() + trx.status.slice(1)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-bold text-gray-900 pr-6 py-4">
                    {trx.currency === "USD" ? "$" : trx.currency}
                    {trx.amount.toFixed(2)}
                  </TableCell>
                  <TableCell className="py-4">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity"
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
                    {t("common.previous") || "Previous"}
                </Button>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages || isLoading}
                    className="rounded-lg border-gray-200 hover:bg-white hover:text-gray-900 text-gray-500 h-8"
                >
                    {t("common.next") || "Next"}
                </Button>
            </div>
            </div>
        </div>
      </div>
    
      </div>
    </div>
  );
}
