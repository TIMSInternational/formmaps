"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
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
import { Bell, Search, CheckCheck, Eye, AlertTriangle, Info, AlertCircle, Users, ShieldAlert, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  useAlerts,
  useAlertSummary,
  useUpdateAlert,
  useBulkAlertAction,
} from "@/hooks/useAlertQueries";
import type { AlertType, AlertPriority, AlertStatus } from "@/types/alert";

const priorityColors: Record<AlertPriority, string> = {
  critical: "bg-red-100 text-red-700",
  high: "bg-orange-100 text-orange-700",
  medium: "bg-yellow-100 text-yellow-700",
  low: "bg-blue-100 text-blue-700",
};

const typeIcons: Record<AlertType, React.ReactNode> = {
  grade_drop: <AlertTriangle className="h-4 w-4 text-red-500" />,
  missing_assessment: <AlertCircle className="h-4 w-4 text-orange-500" />,
  credit_gap: <Info className="h-4 w-4 text-blue-500" />,
  no_career_path: <AlertTriangle className="h-4 w-4 text-yellow-500" />,
  inactive: <Info className="h-4 w-4 text-muted-foreground" />,
};

export default function AlertsPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);

  const { data: alerts, isLoading } = useAlerts({
    type: (typeFilter || undefined) as AlertType | undefined,
    priority: (priorityFilter || undefined) as AlertPriority | undefined,
    status: (statusFilter || undefined) as AlertStatus | undefined,
    page,
    limit: 20,
  });
  const { data: summary } = useAlertSummary();
  const updateAlert = useUpdateAlert();
  const bulk = useBulkAlertAction();

  const handleDismiss = (alertId: string) => {
    updateAlert.mutate(
      { alertId, payload: { status: "dismissed" } },
      { onSuccess: () => toast.success("Alert dismissed") }
    );
  };

  const handleRead = (alertId: string) => {
    updateAlert.mutate(
      { alertId, payload: { status: "acknowledged" } },
    );
  };

  const handleBulkDismiss = () => {
    if (selected.length === 0) return;
    bulk.mutate(
      { alertIds: selected, action: "dismiss" },
      { onSuccess: (r) => { toast.success(`Dismissed ${r.affected} alerts`); setSelected([]); } }
    );
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]);
  };

  if (isLoading) {
    return (<div className="space-y-6"><Skeleton className="h-10 w-64" /><Skeleton className="h-[500px] w-full" /></div>);
  }

  return (
    <div className="space-y-8">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="space-y-1">
        <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-muted-foreground">Monitoring</p>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
          {t("schoolAdmin.alerts.title", "Alerts")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("schoolAdmin.alerts.subtitle", "Monitor academic risks, deadlines, and system notifications.")}
        </p>
      </motion.div>

      {/* Summary Cards */}
      {summary && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {[
              { label: "Total", value: summary.total ?? 0, icon: Bell, iconColor: "text-indigo-500", iconBg: "bg-indigo-500/10" },
              { label: "Critical", value: summary.byPriority?.critical ?? 0, icon: ShieldAlert, iconColor: "text-red-500", iconBg: "bg-red-500/10" },
              { label: "High", value: summary.byPriority?.high ?? 0, icon: AlertTriangle, iconColor: "text-orange-500", iconBg: "bg-orange-500/10" },
              { label: "New", value: summary.newSinceLastLogin ?? 0, icon: Sparkles, iconColor: "text-blue-500", iconBg: "bg-blue-500/10" },
              { label: "Low", value: summary.byPriority?.low ?? 0, icon: Info, iconColor: "text-emerald-500", iconBg: "bg-emerald-500/10" },
            ].map((stat, i) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + i * 0.05 }}
                className="dash-card p-5"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className={`h-9 w-9 rounded-lg ${stat.iconBg} flex items-center justify-center`}>
                    <stat.icon className={`h-4 w-4 ${stat.iconColor}`} strokeWidth={1.8} />
                  </div>
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{stat.label}</span>
                </div>
                <p className="text-2xl font-bold text-foreground tracking-tight">{stat.value}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Toolbar */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search alerts..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="pl-10" />
        </div>
        <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v === "all" ? "" : v); setPage(1); }}>
          <SelectTrigger className="w-[170px]"><SelectValue placeholder="All Types" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="grade_drop">Grade Drop</SelectItem>
            <SelectItem value="missing_assessment">Missing Assessment</SelectItem>
            <SelectItem value="credit_gap">Credit Gap</SelectItem>
            <SelectItem value="no_career_path">No Career Path</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
        <Select value={priorityFilter} onValueChange={(v) => { setPriorityFilter(v === "all" ? "" : v); setPage(1); }}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="All Priority" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priority</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>
        {selected.length > 0 && (
          <Button variant="outline" onClick={handleBulkDismiss} disabled={bulk.isPending}>
            <CheckCheck className="h-4 w-4 mr-1" />Dismiss ({selected.length})
          </Button>
        )}
      </motion.div>

      {/* Alerts Table */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <div className="dash-card overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--border)] flex items-center gap-2">
            <Bell className="h-4 w-4 text-indigo-500" />
            <span className="text-sm font-semibold text-foreground">Alerts</span>
            {alerts && <Badge variant="secondary">{alerts.total}</Badge>}
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"></TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Student</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {alerts?.data?.map((a) => (
                <TableRow
                  key={a.id}
                  className={`${selected.includes(a.id) ? "bg-[var(--admin-bg-hover,rgba(0,0,0,0.04))]" : ""}`}
                  onClick={() => handleRead(a.id)}
                >
                  <TableCell>
                    <input type="checkbox" checked={selected.includes(a.id)} onChange={() => toggleSelect(a.id)} className="rounded border-gray-300" onClick={(e) => e.stopPropagation()} />
                  </TableCell>
                  <TableCell>{typeIcons[a.type] || <Info className="h-4 w-4" />}</TableCell>
                  <TableCell className="max-w-[250px]">
                    <p className="font-medium text-sm truncate text-foreground">{a.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{a.message}</p>
                  </TableCell>
                  <TableCell className="text-sm text-foreground">
                    {a.studentId ? (
                      <span
                        className="cursor-pointer hover:text-blue-600 transition-colors"
                        onClick={(e) => { e.stopPropagation(); router.push(`/counselor/students/${a.studentId}`); }}
                      >
                        {a.studentName || "—"}
                      </span>
                    ) : (
                      a.studentName || "—"
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge className={priorityColors[a.priority]}>{a.priority}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={a.status === "active" ? "default" : "secondary"}>{a.status}</Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{new Date(a.createdAt).toLocaleDateString()}</TableCell>
                  <TableCell>
                    {a.status !== "dismissed" && (
                      <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); handleDismiss(a.id); }}>
                        <Eye className="h-3 w-3 mr-1" />Dismiss
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {(!alerts?.data || alerts.data.length === 0) && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-12">No alerts found</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </motion.div>

      {alerts && alerts.totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
          <span className="text-sm text-muted-foreground self-center">{page} / {alerts.totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= alerts.totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      )}
    </div>
  );
}
