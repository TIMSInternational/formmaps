"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAdminAccess } from "@/hooks/useAdminAccess";
import { DashboardStats } from "./_components/DashboardStats";
import { AdminPageHeader } from "./_components/AdminPageHeader";
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
  { label: "Users", description: "Manage all platform users", icon: Users, href: "/dashboard/admin/users", count: null },
  { label: "Schools", description: "School management", icon: School, href: "/dashboard/admin/schools", count: null },
  { label: "Coaches", description: "Coach profiles & invites", icon: GraduationCap, href: "/dashboard/admin/coaches", count: null },
  { label: "Courses", description: "Learning content", icon: BookOpen, href: "/dashboard/admin/courses", count: null },
  { label: "Careers", description: "Career database", icon: Briefcase, href: "/dashboard/admin/careers", count: null },
  { label: "360° Questions", description: "Assessment questions", icon: HelpCircle, href: "/dashboard/admin/questions", count: null },
  { label: "Plans", description: "Subscription tiers", icon: CreditCard, href: "/dashboard/admin/plans", count: null },
  { label: "Transactions", description: "Payment history", icon: Receipt, href: "/dashboard/admin/transactions", count: null },
  { label: "Payouts", description: "Coach payouts", icon: Wallet, href: "/dashboard/admin/payouts", count: null },
  { label: "Analytics", description: "Platform metrics", icon: BarChart3, href: "/dashboard/admin/analytics", count: null },
  { label: "Settings", description: "System configuration", icon: Settings, href: "/dashboard/admin/settings", count: null },
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
    <div className="space-y-6">
      <AdminPageHeader
        title="Dashboard"
        subtitle="Platform overview and quick actions"
      />

      {/* Stats */}
      <DashboardStats />

      {/* Quick Actions Grid */}
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8a8a8e] mb-3">
          Modules
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
          {quickActions.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="group flex items-start gap-3 p-3 rounded-lg border border-[#e4e4e7] dark:border-[#2a2a2a] bg-white dark:bg-[#1a1a1a] hover:bg-[#fafafa] dark:hover:bg-[#222] hover:border-[#d0d0d3] transition-all"
            >
              <div className="w-8 h-8 rounded-md bg-[#f4f4f5] dark:bg-[#2a2a2a] flex items-center justify-center shrink-0 group-hover:bg-[#ebebed]">
                <action.icon className="w-4 h-4 text-[#666] dark:text-[#999]" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  <span className="text-[13px] font-medium text-[#141414] dark:text-white">{action.label}</span>
                  <ArrowUpRight className="w-3 h-3 text-[#8a8a8e] opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <span className="text-[11px] text-[#8a8a8e] line-clamp-1">{action.description}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
