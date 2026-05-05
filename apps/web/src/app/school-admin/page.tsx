"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { SchoolAdminStats } from "./_components/SchoolAdminStats";
import {
  Users,
  UserPlus,
  BarChart3,
  FileText,
  ArrowRight,
  TrendingUp,
  Clock,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSchoolAdminStats, useStudents } from "@/hooks/useSchoolAdmin";
import { ErrorBoundary } from "@/components/ErrorBoundary";

export default function SchoolAdminDashboard() {
  const { t } = useTranslation();
  const { data: stats } = useSchoolAdminStats();
  const { data: recentStudents } = useStudents({ limit: 5, sortBy: "createdAt", sortOrder: "desc" });

  const quickActions = [
    {
      title: t("schoolAdmin.quickActions.inviteStudents.title", "Invite Students"),
      description: t("schoolAdmin.quickActions.inviteStudents.desc", "Add new students to your school"),
      icon: UserPlus,
      href: "/school-admin/students",
      color: "text-teal-600",
      bg: "bg-teal-50",
    },
    {
      title: t("schoolAdmin.quickActions.viewAnalytics.title", "View Analytics"),
      description: t("schoolAdmin.quickActions.viewAnalytics.desc", "Track student performance and trends"),
      icon: BarChart3,
      href: "/school-admin/analytics",
      color: "text-violet-600",
      bg: "bg-violet-50",
    },
    {
      title: t("schoolAdmin.quickActions.viewResults.title", "Student Results"),
      description: t("schoolAdmin.quickActions.viewResults.desc", "Review assessments and scores"),
      icon: FileText,
      href: "/school-admin/results",
      color: "text-amber-600",
      bg: "bg-amber-50",
    },
    {
      title: t("schoolAdmin.quickActions.manageStudents.title", "Manage Students"),
      description: t("schoolAdmin.quickActions.manageStudents.desc", "View and manage all students"),
      icon: Users,
      href: "/school-admin/students",
      color: "text-cyan-600",
      bg: "bg-cyan-50",
    },
  ];

  return (
    <ErrorBoundary>
    <div className="space-y-8">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8"
        >
          <div className="space-y-1">
            <h1 className="text-4xl font-bold tracking-tight text-gray-900">
              {t("schoolAdmin.dashboard.title", "School Dashboard")}
            </h1>
            <p className="text-lg text-gray-500 font-medium">
              {t("schoolAdmin.dashboard.subtitle", "Your school at a glance — students, assessments, and activity")}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/school-admin/students">
              <Button className="bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-700 hover:to-cyan-700 text-white shadow-lg hover:shadow-xl transition-all duration-300 rounded-full px-6 h-12 text-sm font-semibold">
                <UserPlus className="mr-2 h-4 w-4" />
                {t("schoolAdmin.dashboard.inviteStudent", "Invite Student")}
              </Button>
            </Link>
          </div>
        </motion.div>

        {/* Stats Grid */}
        <SchoolAdminStats />

        {/* Quick Actions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mb-10"
        >
          <h2 className="text-xl font-bold text-gray-900 mb-6">
            {t("schoolAdmin.dashboard.quickActions", "Quick Actions")}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {quickActions.map((action, index) => (
              <Link key={action.title} href={action.href} className="group block">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 * index }}
                  className="h-full bg-white rounded-2xl border border-gray-100 p-6 transition-all duration-300 hover:shadow-lg hover:border-teal-100 hover:-translate-y-1"
                >
                  <div
                    className={`w-12 h-12 rounded-xl ${action.bg} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}
                  >
                    <action.icon className={`h-6 w-6 ${action.color}`} />
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 mb-2 group-hover:text-teal-600 transition-colors">
                    {action.title}
                  </h3>
                  <p className="text-sm text-gray-500 mb-4 line-clamp-2">
                    {action.description}
                  </p>
                  <div className="flex items-center text-sm font-medium text-gray-400 group-hover:text-teal-600 transition-colors">
                    Go{" "}
                    <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </div>
                </motion.div>
              </Link>
            ))}
          </div>
        </motion.div>

        {/* Recent Activity & Summary */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Students */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-white rounded-2xl border border-gray-100 p-6"
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-gray-900">
                {t("schoolAdmin.dashboard.recentStudents", "Recent Students")}
              </h3>
              <Link href="/school-admin/students" className="text-sm text-teal-600 hover:text-teal-700 font-medium">
                View all
              </Link>
            </div>
            <div className="space-y-4">
              {recentStudents?.data && recentStudents.data.length > 0 ? (
                recentStudents.data.map((student) => (
                  <div key={student.id} className="flex items-center justify-between py-3 border-b border-gray-50 last:border-0">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-teal-400 to-cyan-500 flex items-center justify-center text-white font-medium">
                        {student.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{student.name}</p>
                        <p className="text-sm text-gray-500">{student.email}</p>
                      </div>
                    </div>
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${student.status === 'active' ? 'bg-emerald-100 text-emerald-700' :
                      student.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                        student.status === 'accepted' ? 'bg-blue-100 text-blue-700' :
                          'bg-gray-100 text-gray-700'
                      }`}>
                      {student.status.charAt(0).toUpperCase() + student.status.slice(1)}
                    </span>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <Users className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p className="font-medium">No students yet</p>
                  <p className="text-sm">Invite your first student to get started</p>
                </div>
              )}
            </div>
          </motion.div>

          {/* Performance Summary */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="bg-white rounded-2xl border border-gray-100 p-6"
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-gray-900">
                {t("schoolAdmin.dashboard.performance", "Performance Overview")}
              </h3>
              <Link href="/school-admin/analytics" className="text-sm text-teal-600 hover:text-teal-700 font-medium">
                View details
              </Link>
            </div>
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">Assessments Completed</p>
                    <p className="text-sm text-gray-500">Total completions</p>
                  </div>
                </div>
                <span className="text-2xl font-bold text-gray-900">{stats?.completedAssessments || 0}</span>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center">
                    <TrendingUp className="w-5 h-5 text-violet-600" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">Average Score</p>
                    <p className="text-sm text-gray-500">Across all students</p>
                  </div>
                </div>
                <span className="text-2xl font-bold text-gray-900">{stats?.averageScore?.toFixed(1) || 0}%</span>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
                    <Clock className="w-5 h-5 text-amber-600" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">Pending Invites</p>
                    <p className="text-sm text-gray-500">Awaiting acceptance</p>
                  </div>
                </div>
                <span className="text-2xl font-bold text-gray-900">{stats?.pendingInvites || 0}</span>
              </div>
            </div>
          </motion.div>
        </div>
    </div>
    </ErrorBoundary>
  );
}
