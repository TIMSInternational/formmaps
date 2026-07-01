"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Bell, Search, BellOff, ChevronLeft, ChevronRight, Filter, Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  useAlerts, useAlertSummary, useUpdateAlert, useBulkAlertAction,
} from "@/hooks/useAlertQueries";
import type { AlertType, AlertPriority, AlertStatus } from "@/types/alert";
import { AlertsSummaryStats } from "./AlertsSummaryStats";
import { AlertTableRow } from "./AlertTableRow";

const typeLabels: Record<AlertType, string> = {
  grade_drop: "Grade Drop",
  missing_assessment: "Missing Assessment",
  credit_gap: "Credit Gap",
  no_career_path: "No Career Path",
  inactive: "Inactive",
};

interface AlertRecord {
  id: string;
  type: string;
  studentName?: string;
  message?: string;
  priority: string;
  status: string;
}

export default function AlertsPanel() {
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
    limit: 15,
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

  const filteredAlerts: AlertRecord[] = (alerts?.data ?? []).filter(
    (a: AlertRecord) => !search || a.message?.toLowerCase().includes(search.toLowerCase()) || a.studentName?.toLowerCase().includes(search.toLowerCase())
  );

  const toggleSelect = (id: string, checked: boolean) => {
    const newSelected = new Set(selected);
    if (checked) newSelected.add(id); else newSelected.delete(id);
    setSelected(newSelected);
  };

  const toggleSelectAll = (checked: boolean) => {
    const newSelected = new Set(selected);
    if (checked) filteredAlerts.forEach((a) => newSelected.add(a.id));
    else filteredAlerts.forEach((a) => newSelected.delete(a.id));
    setSelected(newSelected);
  };

  const isAllVisibleSelected = filteredAlerts.length > 0 && filteredAlerts.every((a) => selected.has(a.id));

  const getPageNumbers = () => {
    if (!alerts) return [];
    const totalPages = alerts.totalPages;
    const current = page;
    const pages: (number | string)[] = [];
    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= current - 1 && i <= current + 1)) pages.push(i);
      else if (i === current - 2 || i === current + 2) pages.push("...");
    }
    return pages.filter((item, index) => item !== "..." || pages[index - 1] !== "...");
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" style={{ background: "var(--admin-bg-hover)" }} />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-24" style={{ background: "var(--admin-bg-hover)" }} />)}
        </div>
        <Skeleton className="h-[400px]" style={{ background: "var(--admin-bg-hover)" }} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: "var(--admin-font-primary)", letterSpacing: "-0.01em" }}>
          {t("schoolAdmin.alerts.title", "System Alerts")}
        </h1>
        <p style={{ fontSize: 13, color: "var(--admin-font-tertiary)", marginTop: 2 }}>
          {t("schoolAdmin.alerts.subtitle", "Monitor and resolve critical institution-wide events, academic drops, and system notifications.")}
        </p>
      </div>

      {summary && <AlertsSummaryStats summary={summary} />}

      {/* Main Alert Inbox */}
      <div style={{
        borderRadius: 8, border: "1px solid var(--admin-border-default)",
        background: "var(--admin-bg-card)", overflow: "hidden",
        display: "flex", flexDirection: "column", minHeight: 500,
      }}>
        {/* Toolbar */}
        <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--admin-border-default)", background: "var(--admin-bg-hover)" }}>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3" style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Bell style={{ width: 14, height: 14, color: "var(--admin-accent-blue, #2E9098)" }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>Alert Inbox</div>
                <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>Manage and resolve system-detected issues and warnings.</div>
              </div>
            </div>

            {selected.size > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 10px", borderRadius: 6, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.15)" }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "#ef4444" }}>{selected.size} selected</span>
                <button onClick={handleBulkDismiss} disabled={bulk.isPending} style={{
                  height: 28, borderRadius: 5, padding: "0 10px", fontSize: 11, fontWeight: 600,
                  display: "flex", alignItems: "center", gap: 4,
                  background: "#ef4444", color: "#fff", border: "none", cursor: "pointer",
                }}>
                  <Trash2 style={{ width: 12, height: 12 }} /> Dismiss Selected
                </button>
              </div>
            )}
          </div>

          {/* Filter Bar */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: "var(--admin-font-tertiary)" }} />
              <Input placeholder="Search alerts by student or message..." value={search} onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-8 text-xs" style={{ borderRadius: 6, background: "var(--admin-bg-card)", border: "1px solid var(--admin-border-default)" }} />
            </div>
            <div className="flex gap-2 shrink-0 overflow-x-auto">
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-[140px] h-8 text-xs" style={{ borderRadius: 6, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)" }}>
                  <div className="flex items-center gap-1.5"><Filter className="w-3 h-3" style={{ color: "var(--admin-font-tertiary)" }} /> <SelectValue placeholder="Type" /></div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {Object.entries(typeLabels).map(([val, label]) => <SelectItem key={val} value={val}>{label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                <SelectTrigger className="w-[120px] h-8 text-xs" style={{ borderRadius: 6, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)" }}>
                  <SelectValue placeholder="Priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Priorities</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[120px] h-8 text-xs" style={{ borderRadius: 6, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)" }}>
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="acknowledged">Acknowledged</SelectItem>
                  <SelectItem value="dismissed">Dismissed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto flex-1">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12 pl-4" style={{ fontSize: 11 }}>
                  <Checkbox checked={isAllVisibleSelected && filteredAlerts.length > 0} onCheckedChange={(checked) => toggleSelectAll(checked === true)} />
                </TableHead>
                <TableHead className="w-40" style={{ fontSize: 11, fontWeight: 600, color: "var(--admin-font-tertiary)" }}>Category</TableHead>
                <TableHead className="w-40" style={{ fontSize: 11, fontWeight: 600, color: "var(--admin-font-tertiary)" }}>Student</TableHead>
                <TableHead style={{ fontSize: 11, fontWeight: 600, color: "var(--admin-font-tertiary)" }}>Message</TableHead>
                <TableHead className="w-28" style={{ fontSize: 11, fontWeight: 600, color: "var(--admin-font-tertiary)" }}>Priority</TableHead>
                <TableHead className="w-28" style={{ fontSize: 11, fontWeight: 600, color: "var(--admin-font-tertiary)" }}>Status</TableHead>
                <TableHead className="w-20 text-right pr-4" style={{ fontSize: 11, fontWeight: 600, color: "var(--admin-font-tertiary)" }}>Resolve</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAlerts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} style={{ height: 200, textAlign: "center", border: "none" }}>
                    <BellOff style={{ width: 28, height: 28, color: "var(--admin-font-tertiary)", margin: "0 auto 10px", opacity: 0.4 }} />
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--admin-font-primary)", marginBottom: 4 }}>Inbox Zero</div>
                    <div style={{ fontSize: 12, color: "var(--admin-font-tertiary)", maxWidth: 300, margin: "0 auto" }}>
                      {search || typeFilter !== "all" || priorityFilter !== "all" || statusFilter !== "all"
                        ? "No alerts match your current filters."
                        : "There are no active alerts in the system right now."}
                    </div>
                  </TableCell>
                </TableRow>
              ) : filteredAlerts.map((a) => (
                <AlertTableRow
                  key={a.id}
                  alert={a}
                  isSelected={selected.has(a.id)}
                  onToggleSelect={toggleSelect}
                  onMarkRead={handleMarkRead}
                  onDismiss={handleDismiss}
                />
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Pagination Footer */}
        {alerts && alerts.totalPages > 1 && (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            borderTop: "1px solid var(--admin-border-default)",
            padding: "10px 16px", marginTop: "auto", background: "var(--admin-bg-hover)",
          }}>
            <div className="hidden sm:block" style={{ fontSize: 12, color: "var(--admin-font-tertiary)" }}>
              Displaying <span style={{ fontWeight: 600, color: "var(--admin-font-primary)" }}>{((page - 1) * 15) + (alerts.data.length > 0 ? 1 : 0)}</span> {"\u2013"} <span style={{ fontWeight: 600, color: "var(--admin-font-primary)" }}>{Math.min(page * 15, alerts.total)}</span> of <span style={{ fontWeight: 600, color: "var(--admin-font-primary)" }}>{alerts.total}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <button disabled={page <= 1} onClick={() => { setPage((p) => Math.max(1, p - 1)); setSelected(new Set()); }}
                style={{ width: 28, height: 28, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--admin-bg-card)", border: "1px solid var(--admin-border-default)", cursor: "pointer", opacity: page <= 1 ? 0.4 : 1 }}>
                <ChevronLeft style={{ width: 14, height: 14, color: "var(--admin-font-primary)" }} />
              </button>

              {getPageNumbers().map((pageNum, idx) => (
                pageNum === "..." ? (
                  <span key={`dots-${idx}`} style={{ padding: "0 4px", color: "var(--admin-font-tertiary)", fontSize: 12 }}>...</span>
                ) : (
                  <button key={`page-${pageNum}`} onClick={() => { setPage(pageNum as number); setSelected(new Set()); }}
                    style={{
                      width: 28, height: 28, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 11, fontWeight: 600, cursor: "pointer",
                      background: page === pageNum ? "var(--admin-accent-blue, #2E9098)" : "var(--admin-bg-card)",
                      color: page === pageNum ? "#fff" : "var(--admin-font-primary)",
                      border: page === pageNum ? "none" : "1px solid var(--admin-border-default)",
                    }}>
                    {pageNum}
                  </button>
                )
              ))}

              <button disabled={page >= alerts.totalPages} onClick={() => { setPage((p) => Math.min(alerts.totalPages, p + 1)); setSelected(new Set()); }}
                style={{ width: 28, height: 28, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--admin-bg-card)", border: "1px solid var(--admin-border-default)", cursor: "pointer", opacity: page >= alerts.totalPages ? 0.4 : 1 }}>
                <ChevronRight style={{ width: 14, height: 14, color: "var(--admin-font-primary)" }} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
