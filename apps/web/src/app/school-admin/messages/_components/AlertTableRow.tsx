"use client";

import { useTranslation } from "react-i18next";
import { localizeAlert } from "@/lib/localizeAlert";
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
  low: { bg: "rgba(59,130,246,0.1)", color: "var(--admin-accent-blue)" },
};

const typeIcons: Record<AlertType, React.ReactNode> = {
  low_gpa: <TrendingDown className="h-3.5 w-3.5" style={{ color: "#ef4444" }} />,
  credit_deficit: <MapPin className="h-3.5 w-3.5" style={{ color: "var(--admin-accent-blue)" }} />,
  stalled_assessments: <AlertCircle className="h-3.5 w-3.5" style={{ color: "#f59e0b" }} />,
  overdue_followup: <AlertTriangle className="h-3.5 w-3.5" style={{ color: "#eab308" }} />,
};
const fallbackIcon = <Info className="h-3.5 w-3.5" style={{ color: "var(--admin-font-tertiary)" }} />;

const typeLabelKeys: Record<AlertType, string> = {
  low_gpa: "ui.alerts.type.low_gpa",
  credit_deficit: "ui.alerts.type.credit_deficit",
  stalled_assessments: "ui.alerts.type.stalled_assessments",
  overdue_followup: "ui.alerts.type.overdue_followup",
};

interface AlertRecord {
  id: string;
  type: string;
  studentName?: string;
  title?: string | null;
  message?: string;
  /** Generated alerts: translation key + params (see lib/localizeAlert.ts). */
  details?: unknown;
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
  const { t, i18n } = useTranslation("school_admin");
  const { message } = localizeAlert(alert, t, i18n?.language || "en");
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
          {typeIcons[alert.type as AlertType] || fallbackIcon}
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--admin-font-primary)" }}>{typeLabelKeys[alert.type as AlertType] ? t(typeLabelKeys[alert.type as AlertType]) : t("ui.alerts.type.general")}</span>
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
        <p style={{ fontSize: 12, color: "var(--admin-font-tertiary)", lineHeight: 1.4 }} className="line-clamp-2">{message}</p>
      </TableCell>
      <TableCell>
        <span style={{
          fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 3,
          background: pBadge.bg, color: pBadge.color,
          textTransform: "uppercase", letterSpacing: "0.03em",
        }}>
          {t(`ui.alerts.priority.${alert.priority}`, { defaultValue: alert.priority })}
        </span>
      </TableCell>
      <TableCell>
        {alert.status === "active" ? (
          <span style={{
            fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 3,
            background: "rgba(99,102,241,0.1)", color: "var(--admin-accent-blue)",
          }}>
            {t("ui.alerts.actionRequired")}
          </span>
        ) : (
          <span style={{
            fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 3,
            background: "var(--admin-bg-hover)", color: "var(--admin-font-tertiary)",
            textTransform: "capitalize",
          }}>
            {t(`ui.alerts.status.${alert.status}`, { defaultValue: alert.status })}
          </span>
        )}
      </TableCell>
      <TableCell className="text-right pr-4">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 2 }} className="opacity-0 group-hover:opacity-100 transition-opacity">
          {alert.status === "active" && (
            <button
              onClick={() => onMarkRead(alert.id)}
              title={t("ui.alerts.acknowledge")}
              style={{ width: 28, height: 28, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "none", cursor: "pointer", color: "#10b981" }}
            >
              <CheckCircle2 style={{ width: 14, height: 14 }} />
            </button>
          )}
          {alert.status !== "dismissed" && (
            <button
              onClick={() => onDismiss(alert.id)}
              title={t("ui.alerts.dismissAlert")}
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
