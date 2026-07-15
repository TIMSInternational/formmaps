"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { useAdminAccess } from "@/hooks/useAdminAccess";
import { DashboardStats } from "./_components/DashboardStats";
import { RevenueOverviewCard } from "./_components/RevenueOverviewCard";
import { QuickStatsCard } from "./_components/QuickStatsCard";
import { DashboardSkeleton } from "@/components/skeletons/DashboardSkeleton";
import {
  Users,
  GraduationCap,
  Settings,
  BookOpen,
  CreditCard,
  Briefcase,
  HelpCircle,
  BarChart3,
  School,
  Receipt,
  Wallet,
  ArrowUpRight,
} from "lucide-react";
import Link from "next/link";

export default function AdminPage() {
  const router = useRouter();
  const { isAdmin, loading } = useAdminAccess();
  const { t } = useTranslation("platform_owner");

  const quickActions = [
    { label: t("dashboard.modules.users.label"), description: t("dashboard.modules.users.description"), icon: Users, href: "/admin/users" },
    { label: t("dashboard.modules.schools.label"), description: t("dashboard.modules.schools.description"), icon: School, href: "/admin/schools" },
    { label: t("dashboard.modules.coaches.label"), description: t("dashboard.modules.coaches.description"), icon: GraduationCap, href: "/admin/coaches" },
    { label: t("dashboard.modules.courses.label"), description: t("dashboard.modules.courses.description"), icon: BookOpen, href: "/admin/courses" },
    { label: t("dashboard.modules.careers.label"), description: t("dashboard.modules.careers.description"), icon: Briefcase, href: "/admin/careers" },
    { label: t("dashboard.modules.questions.label"), description: t("dashboard.modules.questions.description"), icon: HelpCircle, href: "/admin/questions" },
    { label: t("dashboard.modules.plans.label"), description: t("dashboard.modules.plans.description"), icon: CreditCard, href: "/admin/plans" },
    { label: t("dashboard.modules.transactions.label"), description: t("dashboard.modules.transactions.description"), icon: Receipt, href: "/admin/transactions" },
    { label: t("dashboard.modules.payouts.label"), description: t("dashboard.modules.payouts.description"), icon: Wallet, href: "/admin/payouts" },
    { label: t("dashboard.modules.analytics.label"), description: t("dashboard.modules.analytics.description"), icon: BarChart3, href: "/admin/analytics" },
    { label: t("dashboard.modules.settings.label"), description: t("dashboard.modules.settings.description"), icon: Settings, href: "/admin/settings" },
  ];

  useEffect(() => {
    if (!loading && !isAdmin) {
      router.push("/login");
    }
  }, [isAdmin, loading, router]);

  if (loading) return <DashboardSkeleton />;

  return (
    <div className="space-y-6" style={{ color: "var(--admin-font-primary)" }}>
      {/* Header */}
      <div className="pb-4" style={{ borderBottom: "1px solid var(--admin-border-default)" }}>
        <h1 className="text-[20px] font-semibold tracking-tight" style={{ color: "var(--admin-font-primary)" }}>
          {t("dashboard.title")}
        </h1>
        <p className="text-[13px] mt-0.5" style={{ color: "var(--admin-font-sectionLabel, var(--admin-font-light))" }}>
          {t("dashboard.subtitle")}
        </p>
      </div>

      {/* Stats */}
      <DashboardStats />

      {/* Revenue + Weekly Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2">
          <RevenueOverviewCard />
        </div>
        <QuickStatsCard />
      </div>

      {/* Modules Grid */}
      <div>
        <div style={{
          fontSize: 10, fontWeight: 600, textTransform: "uppercase",
          letterSpacing: "0.08em", color: "var(--admin-font-light)", marginBottom: 10,
        }}>
          {t("dashboard.modulesLabel")}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
          {quickActions.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="group flex items-start gap-3 p-3 rounded-lg transition-all"
              style={{
                border: "1px solid var(--admin-border-default)",
                background: "var(--admin-bg-card)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--admin-bg-card-hover)";
                e.currentTarget.style.borderColor = "var(--admin-border-hover)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "var(--admin-bg-card)";
                e.currentTarget.style.borderColor = "var(--admin-border-default)";
              }}
            >
              <div
                className="w-8 h-8 rounded-md flex items-center justify-center shrink-0"
                style={{ background: "var(--admin-bg-icon-box)" }}
              >
                <action.icon className="w-4 h-4" style={{ color: "var(--admin-font-tertiary)" }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  <span className="text-[13px] font-medium" style={{ color: "var(--admin-font-primary)" }}>
                    {action.label}
                  </span>
                  <ArrowUpRight
                    className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ color: "var(--admin-font-light)" }}
                  />
                </div>
                <span className="text-[11px] line-clamp-1" style={{ color: "var(--admin-font-light)" }}>
                  {action.description}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
