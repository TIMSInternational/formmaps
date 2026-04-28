"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";
import {
  Brain,
  BookOpen,
  FileText,
  Users,
  ChevronRight,
} from "lucide-react";

const actions = [
  {
    key: "assessment",
    icon: Brain,
    labelKey: "dashboard.startAssessment",
    fallback: "Start Assessment",
    href: "/dashboard/assessments",
    color: "text-indigo-600 bg-indigo-50",
  },
  {
    key: "courses",
    icon: BookOpen,
    labelKey: "dashboard.startCourse",
    fallback: "Browse Courses",
    href: "/dashboard/learning/courses",
    color: "text-emerald-600 bg-emerald-50",
  },
  {
    key: "resume",
    icon: FileText,
    labelKey: "dashboard.buildResume",
    fallback: "Build Resume",
    href: "/dashboard/resumes",
    color: "text-violet-600 bg-violet-50",
  },
  {
    key: "coach",
    icon: Users,
    labelKey: "dashboard.scheduleCoaching",
    fallback: "Book Coach",
    href: "/dashboard/book-coach",
    color: "text-amber-600 bg-amber-50",
  },
];

export function QuickActions() {
  const { t } = useTranslation();

  return (
    <div className="dash-card p-4">
      <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3 px-1">
        {t("dashboard.quickActions", "Quick Actions")}
      </h3>
      <div className="grid grid-cols-2 gap-2">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <Link
              key={action.key}
              href={action.href}
              className="flex flex-col items-center gap-2 p-3 rounded-xl border border-border hover:border-foreground/20 hover:bg-secondary transition-all group text-center"
            >
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${action.color}`}>
                <Icon className="w-4 h-4" />
              </div>
              <span className="text-xs font-medium text-foreground leading-tight">
                {t(action.labelKey, action.fallback)}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
