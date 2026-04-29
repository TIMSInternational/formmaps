"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAdminAccess } from "@/hooks/useAdminAccess";
import { DashboardStats } from "./_components/DashboardStats";
import { RevenueOverviewCard } from "./_components/RevenueOverviewCard";
import { MiniChart } from "@/components/ui/mini-chart";
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

const quickActions = [
  { label: "Users", description: "Manage all platform users", icon: Users, href: "/dashboard/admin/users" },
  { label: "Schools", description: "School management", icon: School, href: "/dashboard/admin/schools" },
  { label: "Coaches", description: "Coach profiles & invites", icon: GraduationCap, href: "/dashboard/admin/coaches" },
  { label: "Courses", description: "Learning content", icon: BookOpen, href: "/dashboard/admin/courses" },
  { label: "Careers", description: "Career database", icon: Briefcase, href: "/dashboard/admin/careers" },
  { label: "360 Questions", description: "Assessment questions", icon: HelpCircle, href: "/dashboard/admin/questions" },
  { label: "Plans", description: "Subscription tiers", icon: CreditCard, href: "/dashboard/admin/plans" },
  { label: "Transactions", description: "Payment history", icon: Receipt, href: "/dashboard/admin/transactions" },
  { label: "Payouts", description: "Coach payouts", icon: Wallet, href: "/dashboard/admin/payouts" },
  { label: "Analytics", description: "Platform metrics", icon: BarChart3, href: "/dashboard/admin/analytics" },
  { label: "Settings", description: "System configuration", icon: Settings, href: "/dashboard/admin/settings" },
];

export default function AdminPage() {
  const router = useRouter();
  const { isAdmin, loading } = useAdminAccess();

  useEffect(() => {
    if (!loading && !isAdmin) {
      router.push("/dashboard");
    }
  }, [isAdmin, loading, router]);

  if (loading) return <DashboardSkeleton />;

  return (
    <div className="space-y-6" style={{ color: "var(--admin-font-primary)" }}>
      {/* Header */}
      <div className="pb-4" style={{ borderBottom: "1px solid var(--admin-border-default)" }}>
        <h1 className="text-[20px] font-semibold tracking-tight" style={{ color: "var(--admin-font-primary)" }}>
          Dashboard
        </h1>
        <p className="text-[13px] mt-0.5" style={{ color: "var(--admin-font-sectionLabel, var(--admin-font-light))" }}>
          Platform overview and quick actions
        </p>
      </div>

      {/* Stats */}
      <DashboardStats />

      {/* Revenue + Weekly Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2">
          <RevenueOverviewCard />
        </div>
        <MiniChart title="Weekly Activity" unit="%" />
      </div>

      {/* Modules Grid */}
      <div>
        <div style={{
          fontSize: 10, fontWeight: 600, textTransform: "uppercase",
          letterSpacing: "0.08em", color: "var(--admin-font-light)", marginBottom: 10,
        }}>
          Modules
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
