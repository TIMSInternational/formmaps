"use client";

import { motion } from "motion/react";

export interface ReportStudent {
  id: string;
  name: string;
  email: string;
  gradeLevel?: number;
  status?: string;
}

export function ScoreBar({ label, value, max = 100, color }: { label: string; value: number; max?: number; color: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className="text-xs font-semibold" style={{ color }}>{value}{max === 100 ? "%" : `/${max}`}</span>
      </div>
      <div style={{ height: 8, borderRadius: 4, background: "var(--admin-bg-hover, hsl(var(--muted)))", overflow: "hidden" }}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          style={{ height: "100%", borderRadius: 4, background: color }}
        />
      </div>
    </div>
  );
}

export function StudentInfoHeader({ student, icon: Icon, iconColor, subtitle }: {
  student: ReportStudent; icon: React.ElementType; iconColor: string; subtitle: string;
}) {
  return (
    <div className="p-5 border-b bg-muted/30">
      <div className="flex items-center gap-3">
        <Icon className="h-5 w-5" style={{ color: iconColor }} />
        <div className="flex-1">
          <div className="text-base font-bold">{student.name}</div>
          <div className="text-xs text-muted-foreground">{subtitle}</div>
        </div>
      </div>
      <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
        <span>{student.email}</span>
        {student.gradeLevel && <span>Grade {student.gradeLevel}</span>}
      </div>
    </div>
  );
}
