"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAdminAccess } from "@/hooks/useAdminAccess";
import { DashboardStats } from "./_components/DashboardStats";
import { DashboardSkeleton } from "@/components/skeletons/DashboardSkeleton";
import {
  Users,
  GraduationCap,
  Settings,
  FileText,
  ArrowRight,
  CreditCard,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";

export default function AdminPage() {
  const router = useRouter();
  const { isAdmin, loading } = useAdminAccess();
  const { t } = useTranslation();

  // Handle admin access check
  useEffect(() => {
    if (!loading) {
      if (!isAdmin) {
        alert(t("admin.accessDenied"));
        router.push("/dashboard");
        return;
      }
    }
  }, [isAdmin, loading, router]);

  if (loading) {
    return (
      <DashboardSkeleton />

    );
  }

  const quickActions = [
    {
      titleKey: "admin.quickActions.manageCoaches.title",
      descriptionKey: "admin.quickActions.manageCoaches.description",
      title: "Manage Coaches",
      description: "Invite, approve, and manage coach profiles.",
      icon: Users,
      href: "/dashboard/admin/coaches",
      color: "text-blue-600",
      bg: "bg-blue-50",
    },
    {
      titleKey: "admin.quickActions.courseManagement.title",
      descriptionKey: "admin.quickActions.courseManagement.description",
      title: "Course Management",
      description: "Create and update learning courses.",
      icon: GraduationCap,
      href: "/dashboard/admin/courses",
      color: "text-purple-600",
      bg: "bg-purple-50",
    },
    {
      titleKey: "admin.quickActions.questions.title",
      descriptionKey: "admin.quickActions.questions.description",
      title: "360° Questions",
      description: "Configure feedback questions.",
      icon: FileText,
      href: "/dashboard/admin/questions",
      color: "text-orange-600",
      bg: "bg-orange-50",
    },
    {
      titleKey: "admin.quickActions.plans.title",
      descriptionKey: "admin.quickActions.plans.description",
      title: "Subscription Plans",
      description: "Manage pricing tiers and billing.",
      icon: CreditCard,
      href: "/dashboard/admin/plans",
      color: "text-emerald-600",
      bg: "bg-emerald-50",
    },
    {
      titleKey: "admin.quickActions.settings.title",
      descriptionKey: "admin.quickActions.settings.description",
      title: "System Settings",
      description: "Global platform configuration.",
      icon: Settings,
      href: "/dashboard/admin/settings",
      color: "text-gray-600",
      bg: "bg-gray-50",
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50/50 p-6 md:p-8 space-y-10 font-sans">
      {/* Header Section */}
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8">
          <div className="space-y-1">
            <h1 className="text-4xl font-bold tracking-tight text-gray-900">
              {t("admin.title")}
            </h1>
            <p className="text-lg text-gray-500 font-medium">
              {t("admin.subtitle")}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500 bg-white px-3 py-1 rounded-full border border-gray-200 shadow-sm">
              {t("admin.lastUpdated", { when: "Just now" })}
            </span>
          </div>
        </div>

        {/* Stats Grid */}
        <DashboardStats />

        {/* Quick Actions */}
        <div className="mb-10">
          <h2 className="text-xl font-bold text-gray-900 mb-6">
            {t("admin.quickActionsTitle")}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {quickActions.map((action) => (
              <Link
                key={action.title}
                href={action.href}
                className="group block"
              >
                <div className="h-full bg-white rounded-2xl border border-gray-100 p-6 transition-all duration-300 hover:shadow-lg hover:border-blue-100 hover:-translate-y-1">
                  <div
                    className={`w-12 h-12 rounded-xl ${action.bg} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}
                  >
                    <action.icon className={`h-6 w-6 ${action.color}`} />
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 mb-2 group-hover:text-blue-600 transition-colors">
                    {t(action.titleKey || action.title)}
                  </h3>
                  <p className="text-sm text-gray-500 mb-4 line-clamp-2">
                    {t(action.descriptionKey || action.description)}
                  </p>
                  <div className="flex items-center text-sm font-medium text-gray-400 group-hover:text-blue-600 transition-colors">
                    Access{" "}
                    <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
