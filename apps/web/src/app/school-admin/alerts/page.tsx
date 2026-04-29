"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Bell,
  Search,
  Eye,
  AlertTriangle,
  Info,
  AlertCircle,
  BellOff,
  TrendingDown,
  BookOpen,
  MapPin,
  ChevronLeft,
  ChevronRight,
  Filter,
  Trash2,
  CheckCircle2
} from "lucide-react";
import { toast } from "sonner";
import {
  useAlerts,
  useAlertSummary,
  useUpdateAlert,
  useBulkAlertAction,
} from "@/hooks/useAlertQueries";
import type { AlertType, AlertPriority, AlertStatus } from "@/types/alert";

const priorityColors: Record<AlertPriority, { bg: string, text: string, border: string }> = {
  critical: { bg: "bg-red-50", text: "text-red-700", border: "border-red-200" },
  high: { bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-200" },
  medium: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
  low: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
};

const typeIcons: Record<AlertType, React.ReactNode> = {
  grade_drop: <TrendingDown className="h-4 w-4 text-red-500" />,
  missing_assessment: <AlertCircle className="h-4 w-4 text-orange-500" />,
  credit_gap: <MapPin className="h-4 w-4 text-blue-500" />,
  no_career_path: <AlertTriangle className="h-4 w-4 text-amber-500" />,
  inactive: <Info className="h-4 w-4 text-gray-500" />,
};

const typeLabels: Record<AlertType, string> = {
  grade_drop: "Grade Drop",
  missing_assessment: "Missing Assessment",
  credit_gap: "Credit Gap",
  no_career_path: "No Career Path",
  inactive: "Inactive",
};

export default function SchoolAdminAlertsPage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data: alerts, isLoading } = useAlerts({
    type: (typeFilter !== "all" ? typeFilter : undefined) as AlertType | undefined,
    priority: (priorityFilter !== "all" ? priorityFilter : undefined) as AlertPriority | undefined,
    status: (statusFilter !== "all" ? statusFilter : undefined) as AlertStatus | undefined,
    page,
    limit: 15, // Reduced limit slightly to fit nicely on one page
  });
  const { data: summary } = useAlertSummary();
  const updateAlert = useUpdateAlert();
  const bulk = useBulkAlertAction();

  const handleDismiss = (alertId: string) => {
    updateAlert.mutate(
      { alertId, payload: { status: "dismissed" } },
      {
        onSuccess: () => toast.success(t("schoolAdmin.alerts.dismissed", "Alert dismissed successfully.")),
        onError: () => toast.error(t("schoolAdmin.alerts.dismissError", "Failed to dismiss alert.")),
      }
    );
  };

  const handleMarkRead = (alertId: string) => {
    updateAlert.mutate(
      { alertId, payload: { status: "acknowledged" } },
      { onSuccess: () => toast.success(t("schoolAdmin.alerts.markedRead", "Alert marked as acknowledged.")) }
    );
  };

  const handleBulkDismiss = () => {
    if (selected.size === 0) return;
    bulk.mutate(
      { alertIds: Array.from(selected), action: "dismiss" },
      {
        onSuccess: () => {
          toast.success(t("schoolAdmin.alerts.bulkDismissed", `${selected.size} alerts dismissed successfully.`));
          setSelected(new Set());
        },
        onError: () => toast.error(t("schoolAdmin.alerts.bulkError", "Bulk dismissal failed. Please try again.")),
      }
    );
  };

  const filteredAlerts = (alerts?.data ?? []).filter(
    (a: any) => !search || a.message?.toLowerCase().includes(search.toLowerCase()) || a.studentName?.toLowerCase().includes(search.toLowerCase())
  );

  const toggleSelect = (id: string, checked: boolean) => {
    const newSelected = new Set(selected);
    if (checked) newSelected.add(id);
    else newSelected.delete(id);
    setSelected(newSelected);
  };

  const toggleSelectAll = (checked: boolean) => {
    if (checked) {
      const newSelected = new Set(selected);
      filteredAlerts.forEach((a: any) => newSelected.add(a.id));
      setSelected(newSelected);
    } else {
      const newSelected = new Set(selected);
      filteredAlerts.forEach((a: any) => newSelected.delete(a.id));
      setSelected(newSelected);
    }
  };

  const isAllVisibleSelected = filteredAlerts.length > 0 && filteredAlerts.every((a: any) => selected.has(a.id));
  const isSomeVisibleSelected = filteredAlerts.some((a: any) => selected.has(a.id));

  // Pagination helper
  const getPageNumbers = () => {
    if (!alerts) return [];
    const totalPages = alerts.totalPages;
    const current = page;
    const pages: (number | string)[] = [];

    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= current - 1 && i <= current + 1)) {
        pages.push(i);
      } else if (i === current - 2 || i === current + 2) {
        pages.push("...");
      }
    }

    return pages.filter((item, index) => item !== "..." || pages[index - 1] !== "...");
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-24 w-full rounded-3xl" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-32 rounded-3xl" />)}
        </div>
        <Skeleton className="h-[600px] w-full rounded-3xl" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="space-y-1">
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-gray-900">
          {t("schoolAdmin.alerts.title", "System Alerts")}
        </h1>
        <p className="text-lg text-gray-500 font-medium max-w-2xl">
          {t("schoolAdmin.alerts.subtitle", "Monitor and resolve critical institution-wide events, academic drops, and system notifications.")}
        </p>
      </motion.div>

      {/* Summary Stats */}
      {summary && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 lg:gap-6">
            <Card className="border-0 shadow-lg bg-white/60 backdrop-blur-xl rounded-3xl overflow-hidden group hover:shadow-xl transition-all duration-300">
              <CardContent className="p-6 relative">
                <div className="absolute -right-4 -top-4 w-24 h-24 bg-gray-50 rounded-full opacity-50 group-hover:scale-150 transition-transform duration-500" />
                <div className="relative z-10">
                  <div className="w-12 h-12 bg-white rounded-2xl shadow-sm border border-gray-100 flex items-center justify-center mb-4">
                    <Bell className="h-6 w-6 text-gray-600" />
                  </div>
                  <p className="text-4xl font-black text-gray-900 tracking-tight">{summary.total ?? 0}</p>
                  <p className="text-sm font-bold text-gray-500 uppercase tracking-wider mt-1">Total Alerts</p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg bg-gradient-to-br from-red-500 to-rose-600 rounded-3xl overflow-hidden text-white group hover:shadow-xl transition-all duration-300">
              <CardContent className="p-6 relative">
                <div className="absolute -right-4 -top-4 w-24 h-24 bg-white/10 rounded-full opacity-50 group-hover:scale-150 transition-transform duration-500" />
                <div className="relative z-10">
                  <div className="w-12 h-12 bg-white/20 backdrop-blur-md rounded-2xl shadow-inner border border-white/20 flex items-center justify-center mb-4">
                    <AlertTriangle className="h-6 w-6 text-white" />
                  </div>
                  <p className="text-4xl font-black tracking-tight">{summary.byPriority?.critical ?? 0}</p>
                  <p className="text-sm font-bold text-red-100 uppercase tracking-wider mt-1">Critical Priority</p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg bg-gradient-to-br from-amber-400 to-orange-500 rounded-3xl overflow-hidden text-white group hover:shadow-xl transition-all duration-300">
              <CardContent className="p-6 relative">
                <div className="absolute -right-4 -top-4 w-24 h-24 bg-white/10 rounded-full opacity-50 group-hover:scale-150 transition-transform duration-500" />
                <div className="relative z-10">
                  <div className="w-12 h-12 bg-white/20 backdrop-blur-md rounded-2xl shadow-inner border border-white/20 flex items-center justify-center mb-4">
                    <AlertCircle className="h-6 w-6 text-white" />
                  </div>
                  <p className="text-4xl font-black tracking-tight">{summary.byPriority?.high ?? 0}</p>
                  <p className="text-sm font-bold text-amber-100 uppercase tracking-wider mt-1">High Priority</p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg bg-gradient-to-br from-indigo-500 to-violet-600 rounded-3xl overflow-hidden text-white group hover:shadow-xl transition-all duration-300">
              <CardContent className="p-6 relative">
                <div className="absolute -right-4 -top-4 w-24 h-24 bg-white/10 rounded-full opacity-50 group-hover:scale-150 transition-transform duration-500" />
                <div className="relative z-10">
                  <div className="w-12 h-12 bg-white/20 backdrop-blur-md rounded-2xl shadow-inner border border-white/20 flex items-center justify-center mb-4">
                    <CheckCircle2 className="h-6 w-6 text-white" />
                  </div>
                  <p className="text-4xl font-black tracking-tight">{summary.newSinceLastLogin ?? 0}</p>
                  <p className="text-sm font-bold text-indigo-100 uppercase tracking-wider mt-1">New Since Login</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </motion.div>
      )}

      {/* Main Alert Inbox */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
        <Card className="border-0 shadow-xl rounded-3xl bg-white/80 backdrop-blur-xl overflow-hidden flex flex-col min-h-[600px]">
          <CardHeader className="bg-gradient-to-r from-gray-50/80 to-white py-5 px-6 border-b border-gray-100 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <CardTitle className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  <div className="p-2 bg-white rounded-xl shadow-sm border border-gray-100">
                    <Bell className="h-5 w-5 text-gray-600" />
                  </div>
                  Alert Inbox
                </CardTitle>
                <CardDescription className="text-sm mt-1">
                  Manage and quickly resolve system-detected issues and warnings.
                </CardDescription>
              </div>

              {selected.size > 0 && (
                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex items-center gap-3 bg-red-50 px-4 py-2 rounded-2xl border border-red-100">
                  <span className="text-sm font-bold text-red-700">{selected.size} selected</span>
                  <Button
                    size="sm"
                    onClick={handleBulkDismiss}
                    disabled={bulk.isPending}
                    className="bg-red-600 hover:bg-red-700 text-white rounded-xl shadow-sm h-8"
                  >
                    <Trash2 className="h-4 w-4 mr-1.5" />
                    Dismiss Selected
                  </Button>
                </motion.div>
              )}
            </div>

            {/* Filter Bar */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search alerts by student or message..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-11 rounded-xl bg-white border-gray-200 focus:bg-white focus:border-indigo-400 shadow-sm transition-all h-10"
                />
              </div>
              <div className="flex gap-2 shrink-0 overflow-x-auto pb-1 sm:pb-0">
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="w-[160px] h-10 rounded-xl border-gray-200 bg-white shadow-sm font-medium text-gray-600">
                    <div className="flex items-center gap-2"><Filter className="w-3.5 h-3.5 text-gray-400" /> <SelectValue placeholder="Type" /></div>
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    <SelectItem value="all">All Types</SelectItem>
                    {Object.entries(typeLabels).map(([val, label]) => (
                      <SelectItem key={val} value={val}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                  <SelectTrigger className="w-[140px] h-10 rounded-xl border-gray-200 bg-white shadow-sm font-medium text-gray-600">
                    <SelectValue placeholder="Priority" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    <SelectItem value="all">All Priorities</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[140px] h-10 rounded-xl border-gray-200 bg-white shadow-sm font-medium text-gray-600">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="acknowledged">Acknowledged</SelectItem>
                    <SelectItem value="dismissed">Dismissed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0 flex-1 flex flex-col">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-transparent border-b border-gray-100">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-14 pl-6 py-4">
                      <Checkbox
                        checked={isAllVisibleSelected && filteredAlerts.length > 0}
                        onCheckedChange={(checked) => toggleSelectAll(checked === true)}
                        className={`rounded border-gray-300 data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600 ${isSomeVisibleSelected && !isAllVisibleSelected ? "bg-indigo-50 border-indigo-300" : ""}`}
                      />
                    </TableHead>
                    <TableHead className="font-semibold text-gray-700 w-48">Alert Category</TableHead>
                    <TableHead className="font-semibold text-gray-700 w-48">Student Profile</TableHead>
                    <TableHead className="font-semibold text-gray-700 max-w-sm">Detailed Message</TableHead>
                    <TableHead className="font-semibold text-gray-700 w-32">Priority</TableHead>
                    <TableHead className="font-semibold text-gray-700 w-32">Status</TableHead>
                    <TableHead className="text-right font-semibold text-gray-700 pr-6 w-24">Resolve</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAlerts.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-64 text-center border-b-0">
                        <div className="flex flex-col items-center justify-center space-y-3">
                          <div className="p-4 bg-gray-50 rounded-full mb-2">
                            <BellOff className="h-10 w-10 text-gray-300" />
                          </div>
                          <p className="text-lg font-bold text-gray-900">Inbox Zero</p>
                          <p className="text-sm text-gray-500 max-w-sm mx-auto">
                            {search || typeFilter !== 'all' || priorityFilter !== 'all' || statusFilter !== 'all'
                              ? "No alerts match your current filtration criteria."
                              : "There are perfectly zero active alerts in the system right now!"}
                          </p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : filteredAlerts.map((a: any) => {
                    const pColor = priorityColors[a.priority as AlertPriority] || priorityColors.low;
                    return (
                      <TableRow key={a.id} className={`group transition-colors border-b border-gray-50 ${selected.has(a.id) ? "bg-indigo-50/30" : "hover:bg-gray-50/50"}`}>
                        <TableCell className="pl-6">
                          <Checkbox
                            checked={selected.has(a.id)}
                            onCheckedChange={(checked) => toggleSelect(a.id, checked === true)}
                            className="rounded border-gray-300 data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600"
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2.5">
                            <div className="p-1.5 bg-white rounded-lg shadow-sm border border-gray-100 shrink-0">
                              {typeIcons[a.type as AlertType] || typeIcons.inactive}
                            </div>
                            <span className="text-sm font-bold text-gray-700">{typeLabels[a.type as AlertType] || "General"}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {a.studentName ? (
                            <div className="flex items-center gap-2">
                              <Avatar className="h-8 w-8 rounded-lg outline outline-1 outline-gray-200">
                                <AvatarFallback className="bg-gray-100 text-gray-600 text-xs font-bold rounded-lg">{a.studentName.substring(0, 2).toUpperCase()}</AvatarFallback>
                              </Avatar>
                              <span className="font-bold text-gray-900 text-sm">{a.studentName}</span>
                            </div>
                          ) : (
                            <span className="text-gray-400 font-medium text-sm">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <p className="text-sm text-gray-600 font-medium line-clamp-2 pr-4">{a.message}</p>
                        </TableCell>
                        <TableCell>
                          <Badge className={`${pColor.bg} ${pColor.text} ${pColor.border} border shadow-none font-bold uppercase tracking-wider text-[10px] px-2 py-0.5 w-min`}>
                            {a.priority}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {a.status === "active" ? (
                            <Badge className="bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-none font-bold capitalize px-2.5 py-0.5 hover:bg-indigo-50">
                              Action Req.
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="bg-gray-100 text-gray-600 font-bold capitalize border-none shadow-none px-2.5 py-0.5 hover:bg-gray-100">
                              {a.status}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right pr-6 py-2">
                          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {a.status === "active" && (
                              <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700" onClick={() => handleMarkRead(a.id)} title="Acknowledge">
                                <CheckCircle2 className="h-4 w-4" />
                              </Button>
                            )}
                            {a.status !== "dismissed" && (
                              <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50" onClick={() => handleDismiss(a.id)} title="Dismiss Alert">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Pagination Footer */}
            {alerts && alerts.totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50/30 px-6 py-4 mt-auto">
                <div className="text-sm text-gray-500 hidden sm:block">
                  Displaying <span className="font-medium text-gray-900">{((page - 1) * 15) + (alerts.data.length > 0 ? 1 : 0)}</span> – <span className="font-medium text-gray-900">{Math.min(page * 15, alerts.total)}</span> of <span className="font-medium text-gray-900">{alerts.total}</span> alerts
                </div>
                <div className="flex items-center gap-1 w-full justify-center sm:w-auto sm:justify-end">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 rounded-lg border-gray-200 bg-white"
                    disabled={page <= 1}
                    onClick={() => { setPage((p) => Math.max(1, p - 1)); setSelected(new Set()); }}
                  >
                    <ChevronLeft className="h-4 w-4 text-gray-600" />
                  </Button>

                  {getPageNumbers().map((pageNum, idx) => (
                    pageNum === "..." ? (
                      <span key={`dots-${idx}`} className="px-2 text-gray-400">...</span>
                    ) : (
                      <Button
                        key={`page-${pageNum}`}
                        variant={page === pageNum ? "default" : "outline"}
                        size="sm"
                        className={`h-8 w-8 rounded-lg ${page === pageNum ? 'bg-indigo-600 hover:bg-indigo-700 shadow-sm text-white border-transparent' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`}
                        onClick={() => { setPage(pageNum as number); setSelected(new Set()); }}
                      >
                        {pageNum}
                      </Button>
                    )
                  ))}

                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 rounded-lg border-gray-200 bg-white"
                    disabled={page >= alerts.totalPages}
                    onClick={() => { setPage((p) => Math.min(alerts.totalPages, p + 1)); setSelected(new Set()); }}
                  >
                    <ChevronRight className="h-4 w-4 text-gray-600" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
