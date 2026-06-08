"use client";

import { useGlobalStore } from "@/store/useGlobalStore";
import { useDashboardAssessmentSummary } from "@/hooks/useAssessmentQueries";
import { useTimsCareerScoring } from "@/hooks/useTimsQueries";
import { usePortfolioSummary } from "@/hooks/usePortfolioQueries";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import Link from "next/link";
import {
  Brain,
  Compass,
  FolderKanban,
  BookOpen,
  ArrowRight,
} from "lucide-react";
import { useTranslation } from "react-i18next";

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  progress?: number;
  cta: string;
  href: string;
  loading?: boolean;
}

function StatCard({
  icon,
  label,
  value,
  sub,
  progress,
  cta,
  href,
  loading,
}: StatCardProps) {
  if (loading) {
    return (
      <div className="dash-card p-5">
        <Skeleton className="h-4 w-20 mb-4" />
        <Skeleton className="h-8 w-16 mb-2" />
        <Skeleton className="h-2 w-full mb-4" />
        <Skeleton className="h-3 w-24" />
      </div>
    );
  }

  return (
    <Link
      href={href}
      className="dash-card p-5 flex flex-col gap-3 hover:border-foreground/20 transition-colors group"
    >
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">{icon}</span>
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
      </div>

      <div>
        <span className="text-2xl font-bold text-foreground tracking-tighter tabular-nums">
          {value}
        </span>
        {sub && (
          <span className="text-xs text-muted-foreground ml-1.5">{sub}</span>
        )}
      </div>

      {progress != null && (
        <div className="w-full bg-secondary rounded-full h-1.5 overflow-hidden">
          <div
            className="bg-foreground h-full rounded-full transition-all duration-700"
            style={{ width: `${Math.min(progress, 100)}%` }}
          />
        </div>
      )}

      <span className="text-xs font-medium text-muted-foreground group-hover:text-foreground flex items-center gap-1 transition-colors mt-auto">
        {cta}
        <ArrowRight className="w-3 h-3" />
      </span>
    </Link>
  );
}

interface StatCardsProps {
  courseData?: { title?: string; progress?: number } | null;
}

export function StatCards({ courseData }: StatCardsProps) {
  const { t } = useTranslation();
  const { user } = useGlobalStore();

  const { data: assessmentData, isLoading: assessLoading } =
    useDashboardAssessmentSummary(user?.id || "");
  const { data: timsData, isLoading: timsLoading } = useTimsCareerScoring();
  const { data: portfolio, isLoading: portfolioLoading } =
    usePortfolioSummary();

  const careersLocked = timsData?.data?.locked ?? false;
  const careers = timsData?.data?.careers ?? [];
  const topScore = careers.length > 0 ? Math.round(careers[0].totalScore) : 0;

  const completedCount =
    assessmentData?.assessments?.filter(
      (a: { status: string }) => a.status === "completed"
    ).length ?? 0;
  const totalCount = assessmentData?.assessments?.length ?? 3;

  return (
    <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
      <StatCard
        icon={<Brain className="w-4 h-4" />}
        label={t("dashboard.assessments", "Assessments")}
        value={`${completedCount}/${totalCount}`}
        progress={assessmentData?.overallCompletion ?? 0}
        sub={`${assessmentData?.overallCompletion ?? 0}%`}
        cta={
          completedCount === totalCount
            ? t("dashboard.viewResults", "View Results")
            : t("dashboard.continue", "Continue")
        }
        href="/dashboard/assessments"
        loading={assessLoading}
      />
      <StatCard
        icon={<Compass className="w-4 h-4" />}
        label={t("dashboard.careerMatches", "Career Matches")}
        value={careersLocked ? t("dashboard.locked", "Locked") : String(careers.length)}
        sub={!careersLocked && topScore > 0 ? `Top: ${topScore}%` : undefined}
        cta={careersLocked ? t("dashboard.completeAssessments", "Complete assessments") : t("dashboard.explore", "Explore")}
        href="/dashboard/career-paths"
        loading={timsLoading}
      />
      <StatCard
        icon={<FolderKanban className="w-4 h-4" />}
        label={t("dashboard.portfolio", "Portfolio")}
        value={String(portfolio?.totalItems ?? 0)}
        sub={
          (portfolio?.totalVolunteerHours ?? 0) > 0
            ? `${portfolio!.totalVolunteerHours} vol hrs`
            : (portfolio?.totalItems ?? 0) > 0 ? "items" : undefined
        }
        cta={t("dashboard.addItem", "Add item")}
        href="/dashboard/portfolio"
        loading={portfolioLoading}
      />
      <StatCard
        icon={<BookOpen className="w-4 h-4" />}
        label={t("dashboard.courses", "Courses")}
        value={courseData?.title ? "1 active" : "0"}
        progress={courseData?.progress ?? undefined}
        sub={
          courseData?.progress != null ? `${courseData.progress}% done` : undefined
        }
        cta={
          courseData
            ? t("dashboard.resume", "Resume")
            : t("dashboard.browseCourses", "Browse")
        }
        href="/dashboard/learning/courses"
        loading={false}
      />
    </div>
  );
}
