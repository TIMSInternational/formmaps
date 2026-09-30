"use client";

import { usePortfolioSummary } from "@/hooks/usePortfolioQueries";
import type { PortfolioItemType } from "@/types/portfolio";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  Trophy,
  FolderKanban,
  Heart,
  Briefcase,
  Award,
  GraduationCap,
  Plus,
} from "lucide-react";
import Link from "next/link";
import { useTranslation } from "react-i18next";

const TYPE_CONFIG: Record<
  PortfolioItemType,
  { label: string; icon: typeof Trophy; color: string }
> = {
  // label = i18n key
  extracurricular: {
    label: "dashboard.portfolioSnapshot.types.extracurricular",
    icon: GraduationCap,
    color: "text-blue-500",
  },
  award: { label: "dashboard.portfolioSnapshot.types.award", icon: Trophy, color: "text-amber-500" },
  project: { label: "dashboard.portfolioSnapshot.types.project", icon: FolderKanban, color: "text-violet-500" },
  volunteer: { label: "dashboard.portfolioSnapshot.types.volunteer", icon: Heart, color: "text-rose-500" },
  work_experience: { label: "dashboard.portfolioSnapshot.types.work_experience", icon: Briefcase, color: "text-emerald-500" },
  certification: { label: "dashboard.portfolioSnapshot.types.certification", icon: Award, color: "text-cyan-500" },
};

export function PortfolioSnapshot({ className }: { className?: string }) {
  const { t } = useTranslation();
  const { data: summary, isLoading } = usePortfolioSummary();

  if (isLoading) {
    return (
      <Card className={cn("p-6", className)}>
        <Skeleton className="h-5 w-28 mb-4" />
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-14 rounded-lg" />
          ))}
        </div>
      </Card>
    );
  }

  const total = summary?.totalItems ?? 0;
  const byType = summary?.byType ?? ({} as Record<PortfolioItemType, number>);
  const volunteerHours = summary?.totalVolunteerHours ?? 0;

  return (
    <Card className={cn("p-6 flex flex-col rounded-2xl border-border", className)}>
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-lg font-semibold text-foreground">{t("dashboard.portfolio")}</h2>
        {total > 0 && (
          <Badge variant="secondary" className="text-xs">
            {total}
          </Badge>
        )}
      </div>

      {total === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center py-6">
          <FolderKanban className="w-10 h-10 text-slate-300 mb-3" />
          <p className="text-sm font-medium text-slate-600">
            {t("dashboard.portfolioSnapshot.empty")}
          </p>
          <Link
            href="/dashboard/portfolio"
            className="inline-flex items-center gap-1 text-sm font-medium text-[var(--admin-accent-blue)] hover:text-[var(--admin-accent-blue)]/80 mt-3"
          >
            <Plus className="w-4 h-4" /> {t("dashboard.portfolioSnapshot.addFirst")}
          </Link>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2.5 flex-1">
            {(Object.keys(TYPE_CONFIG) as PortfolioItemType[]).map((type) => {
              const config = TYPE_CONFIG[type];
              const count = byType[type] ?? 0;
              const Icon = config.icon;
              return (
                <div
                  key={type}
                  className="flex flex-col items-center justify-center gap-1 rounded-lg bg-slate-50 border border-slate-100 p-2.5"
                >
                  <Icon className={cn("w-4 h-4", config.color)} />
                  <span className="text-lg font-bold text-slate-800">
                    {count}
                  </span>
                  <span className="text-[10px] text-slate-500 leading-tight">
                    {t(config.label)}
                  </span>
                </div>
              );
            })}
          </div>

          {volunteerHours > 0 && (
            <div className="mt-3 rounded-lg bg-rose-50 border border-rose-100 px-3 py-2 text-center">
              <span className="text-xs text-rose-700 font-medium">
                {t("dashboard.portfolioSnapshot.volunteerHours", { count: volunteerHours })}
              </span>
            </div>
          )}

          <Link
            href="/dashboard/portfolio"
            className="inline-flex items-center justify-center gap-1 text-xs font-medium text-[var(--admin-accent-blue)] hover:text-[var(--admin-accent-blue)]/80 mt-3"
          >
            <Plus className="w-3.5 h-3.5" /> {t("dashboard.portfolioSnapshot.addToPortfolio")}
          </Link>
        </>
      )}
    </Card>
  );
}
