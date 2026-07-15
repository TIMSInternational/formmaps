"use client";

import { motion } from "motion/react";
import { Clock, CheckCircle2, XCircle, Calendar, User, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CommunityServiceEntry, CommunityServiceStatus } from "@/types/communityService";
import { formatDateOnly } from "@/lib/dateUtils";

const statusConfig: Record<
  CommunityServiceStatus,
  { icon: typeof CheckCircle2; label: string; color: string; border: string }
> = {
  verified: {
    icon: CheckCircle2,
    label: "Verified",
    color: "text-emerald-600 bg-emerald-50",
    border: "border-emerald-200",
  },
  pending: {
    icon: Clock,
    label: "Pending",
    color: "text-amber-600 bg-amber-50",
    border: "border-amber-200",
  },
  rejected: {
    icon: XCircle,
    label: "Rejected",
    color: "text-red-600 bg-red-50",
    border: "border-red-200",
  },
};

export interface ServiceEntryCardProps {
  entry: CommunityServiceEntry;
  index: number;
  onEdit: (entry: CommunityServiceEntry) => void;
  onDelete: (entryId: string) => void;
  deletingId: string | null;
}

export function ServiceEntryCard({ entry, index, onEdit, onDelete, deletingId }: ServiceEntryCardProps) {
  const sc = statusConfig[entry.status];
  const Icon = sc.icon;
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 + index * 0.03 }}
      className="p-4 rounded-lg border border-border hover:border-foreground/20 transition-colors flex flex-col md:flex-row md:items-start gap-4"
    >
      <div className={`p-2.5 rounded-lg border shrink-0 ${sc.color} ${sc.border}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <h4 className="font-semibold text-foreground text-sm truncate pr-4">{entry.organization}</h4>
          <div className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${sc.color} ${sc.border}`}>
            {sc.label}
          </div>
        </div>

        {entry.description && (
          <p className="text-xs text-muted-foreground mb-2 line-clamp-2">
            {entry.description}
          </p>
        )}

        {entry.status === "rejected" && entry.note && (
          <p className="text-xs text-red-600 mb-2">
            Reason: {entry.note}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1 bg-secondary px-2 py-0.5 rounded-md">
            <Calendar className="h-3 w-3" />
            {formatDateOnly(entry.date)}
          </span>
          <span className="flex items-center gap-1 bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-md">
            <Clock className="h-3 w-3" />
            {entry.hours} hours
          </span>
          {entry.supervisorName && (
            <span className="flex items-center gap-1">
              <User className="h-3 w-3" />
              {entry.supervisorName}
            </span>
          )}
        </div>

        {entry.status === "pending" && (
          <div className="flex items-center gap-2 mt-3">
            <Button
              size="sm"
              variant="outline"
              onClick={() => onEdit(entry)}
              className="h-7 px-3 text-xs border-border"
            >
              <Pencil className="h-3 w-3 mr-1" />
              Edit
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onDelete(entry.id)}
              disabled={deletingId === entry.id}
              className="h-7 px-3 text-xs border-red-200 text-red-600 hover:bg-red-50"
            >
              <Trash2 className="h-3 w-3 mr-1" />
              Delete
            </Button>
          </div>
        )}
      </div>
    </motion.div>
  );
}
