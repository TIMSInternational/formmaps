"use client";

import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Clock } from "lucide-react";
import type { TFunction } from "i18next";

export function getStatusBadge(status: string, t: TFunction) {
  switch (status) {
    case "pending":
      return (
        <span className="text-[9px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider border border-amber-200 bg-amber-50 text-amber-700 inline-flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {t("sessions.status.pending")}
        </span>
      );
    case "confirmed":
      return (
        <span className="text-[9px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider border border-emerald-200 bg-emerald-50 text-emerald-700 inline-flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3" />
          {t("sessions.status.confirmed")}
        </span>
      );
    case "completed":
      return (
        <span className="text-[9px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider border border-blue-200 bg-blue-50 text-blue-700 inline-flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3" />
          {t("sessions.status.completed")}
        </span>
      );
    case "cancelled":
      return (
        <span className="text-[9px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider border border-red-200 bg-red-50 text-red-700 inline-flex items-center gap-1">
          <XCircle className="h-3 w-3" />
          {t("sessions.status.cancelled")}
        </span>
      );
    case "rescheduled":
      return (
        <span className="text-[9px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider border border-amber-200 bg-amber-50 text-amber-700 inline-flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {t("sessions.status.rescheduled")}
        </span>
      );
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

export function getCounselorStatusBadge(status: string) {
  if (status === "confirmed")
    return (
      <span className="text-[9px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider border border-emerald-200 bg-emerald-50 text-emerald-700 inline-flex items-center gap-1">
        <CheckCircle2 className="h-3 w-3" />
        Upcoming
      </span>
    );
  if (status === "completed")
    return (
      <span className="text-[9px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider border border-blue-200 bg-blue-50 text-blue-700 inline-flex items-center gap-1">
        <CheckCircle2 className="h-3 w-3" />
        Completed
      </span>
    );
  if (status === "cancelled")
    return (
      <span className="text-[9px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider border border-red-200 bg-red-50 text-red-700 inline-flex items-center gap-1">
        <XCircle className="h-3 w-3" />
        Cancelled
      </span>
    );
  return <Badge variant="secondary">{status}</Badge>;
}
