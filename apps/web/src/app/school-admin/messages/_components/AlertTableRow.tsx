"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { TableCell, TableRow } from "@/components/ui/table";
import {
  TrendingDown,
  AlertCircle,
  MapPin,
  AlertTriangle,
  Info,
  CheckCircle2,
  Trash2,
} from "lucide-react";
import type { AlertType, AlertPriority } from "@/types/alert";

const priorityBadge: Record<AlertPriority, { bg: string; color: string }> = {
  critical: { bg: "rgba(239,68,68,0.1)", color: "#ef4444" },
  high: { bg: "rgba(245,158,11,0.1)", color: "#f59e0b" },
  medium: { bg: "rgba(234,179,8,0.1)", color: "#eab308" },
  low: { bg: "rgba(59,130,246,0.1)", color: "#065292" },
};

const typeIcons: Record<AlertType, React.ReactNode> = {
  grade_drop: <TrendingDown className="h-3.5 w-3.5" style={{ color: "#ef4444" }} />,
  missing_assessment: <AlertCircle className="h-3.5 w-3.5" style={{ color: "#f59e0b" }} />,
  credit_gap: <MapPin className="h-3.5 w-3.5" style={{ color: "#065292" }} />,
  no_career_path: <AlertTriangle className="h-3.5 w-3.5" style={{ color: "#eab308" }} />,
  inactive: <Info className="h-3.5 w-3.5" style={{ color: "var(--admin-font-tertiary)" }} />,
};

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

interface AlertTableRowProps {
  alert: AlertRecord;
  isSelected: boolean;
  onToggleSelect: (id: string, checked: boolean) => void;
  onMarkRead: (id: string) => void;
  onDismiss: (id: string) => void;
}

export function AlertTableRow({ alert, isSelected, onToggleSelect, onMarkRead, onDismiss }: AlertTableRowProps) {
  const pBadge = priorityBadge[alert.priority as AlertPriority] || priorityBadge.low;

  return (
    <TableRow className="group" style={{ background: isSelected ? "var(--admin-bg-hover)" : undefined }}>
      <TableCell className="pl-4">
        <Checkbox
          checked={isSelected}
          onCheckedChange={(checked) => onToggleSelect(alert.id, checked === true)}
        />
      </TableCell>
      <TableCell>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {typeIcons[alert.type as AlertType] || typeIcons.inactive}
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--admin-font-primary)" }}>{typeLabels[alert.type as AlertType] || "General"}</span>
        </div>
      </TableCell>
      <TableCell>
        {alert.studentName ? (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{
              width: 24, height: 24, borderRadius: 4,
              background: "var(--admin-bg-hover)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 9, fontWeight: 700, color: "var(--admin-font-primary)",
            }}>
              {alert.studentName.substring(0, 2).toUpperCase()}
            </div>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--admin-font-primary)" }}>{alert.studentName}</span>
          </div>
        ) : (
          <span style={{ color: "var(--admin-font-tertiary)", fontSize: 12 }}>{"\u2014"}</span>
        )}
      </TableCell>
      <TableCell>
        <p style={{ fontSize: 12, color: "var(--admin-font-tertiary)", lineHeight: 1.4 }} className="line-clamp-2">{alert.message}</p>
      </TableCell>
      <TableCell>
        <span style={{
          fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 3,
          background: pBadge.bg, color: pBadge.color,
          textTransform: "uppercase", letterSpacing: "0.03em",
        }}>
          {alert.priority}
        </span>
      </TableCell>
      <TableCell>
        {alert.status === "active" ? (
          <span style={{
            fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 3,
            background: "rgba(99,102,241,0.1)", color: "#065292",
          }}>
            Action Req.
          </span>
        ) : (
          <span style={{
            fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 3,
            background: "var(--admin-bg-hover)", color: "var(--admin-font-tertiary)",
            textTransform: "capitalize",
          }}>
            {alert.status}
          </span>
        )}
      </TableCell>
      <TableCell className="text-right pr-4">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 2 }} className="opacity-0 group-hover:opacity-100 transition-opacity">
          {alert.status === "active" && (
            <button
              onClick={() => onMarkRead(alert.id)}
              title="Acknowledge"
              style={{ width: 28, height: 28, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "none", cursor: "pointer", color: "#10b981" }}
            >
              <CheckCircle2 style={{ width: 14, height: 14 }} />
            </button>
          )}
          {alert.status !== "dismissed" && (
            <button
              onClick={() => onDismiss(alert.id)}
              title="Dismiss Alert"
              style={{ width: 28, height: 28, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "none", cursor: "pointer", color: "var(--admin-font-tertiary)" }}
            >
              <Trash2 style={{ width: 14, height: 14 }} />
            </button>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}
