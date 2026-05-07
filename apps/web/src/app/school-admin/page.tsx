"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";
import { motion } from "motion/react";
import {
  Users,
  UserPlus,
  BarChart3,
  FileText,
  BookOpen,
  GraduationCap,
  Calendar,
  Settings,
  Shield,
  ArrowUpRight,
  TrendingUp,
  School,
  ClipboardList,
  Network,
  Database,
  AlertTriangle,
} from "lucide-react";
import { useSchoolAdminStats, useStudents } from "@/hooks/useSchoolAdmin";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AdminStatCard } from "@/app/admin/_components/AdminStatCard";

const quickActions = [
  { label: "Students", description: "Manage all students", icon: Users, href: "/school-admin/students" },
  { label: "Users & Roles", description: "Staff and counselors", icon: UserPlus, href: "/school-admin/users" },
  { label: "Analytics", description: "Student performance", icon: BarChart3, href: "/school-admin/analytics" },
  { label: "Results", description: "Assessment results", icon: FileText, href: "/school-admin/results" },
  { label: "School Profile", description: "School info & branding", icon: School, href: "/school-admin/profile" },
  { label: "Calendar", description: "Academic years & terms", icon: Calendar, href: "/school-admin/calendar" },
  { label: "Curriculum", description: "Framework configuration", icon: BookOpen, href: "/school-admin/curriculum" },
  { label: "Courses", description: "Course catalog", icon: GraduationCap, href: "/school-admin/courses" },
  { label: "Sequences", description: "Course pathways", icon: Network, href: "/school-admin/sequences" },
  { label: "Assessments", description: "Assessment settings", icon: ClipboardList, href: "/school-admin/assessments" },
  { label: "Integrations", description: "iSAMS & data sync", icon: Database, href: "/school-admin/integrations" },
  { label: "Settings", description: "School settings", icon: Settings, href: "/school-admin/settings" },
];

function SchoolQuickStats() {
  const { data: stats } = useSchoolAdminStats();
  const s = stats as any;

  const rows = [
    { label: "Total Students", value: s?.totalStudents?.toLocaleString() || "—", icon: Users, color: "#3b82f6" },
    { label: "Active Counselors", value: s?.totalCounselors?.toLocaleString() || "—", icon: GraduationCap, color: "#8b5cf6" },
    { label: "Pending Requests", value: s?.pendingInvites?.toLocaleString() || "—", icon: UserPlus, color: "#f59e0b" },
    { label: "Total Courses", value: s?.totalCourses?.toLocaleString() || "—", icon: BookOpen, color: "#10b981" },
  ];

  return (
    <div style={{
      borderRadius: 8, border: "1px solid var(--admin-border-default, #2a2a2a)",
      background: "var(--admin-bg-card, #1e1e1e)", padding: 20,
      display: "flex", flexDirection: "column", height: "100%",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 16 }}>
        <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#3b82f6" }} />
        <span style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--admin-font-tertiary, #818181)" }}>
          Quick Stats
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1, justifyContent: "space-between" }}>
        {rows.map((row) => (
          <div key={row.label} style={{
            display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 8,
            background: "var(--admin-bg-hover, #252525)",
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8, background: `${row.color}15`,
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}>
              <row.icon style={{ width: 16, height: 16, color: row.color }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, color: "var(--admin-font-tertiary, #818181)", fontWeight: 500 }}>{row.label}</div>
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "var(--admin-font-primary, #ebebeb)", letterSpacing: "-0.02em" }}>{row.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RecentStudentsCard() {
  const { data: recentStudents } = useStudents({ limit: 20, sortBy: "createdAt", sortOrder: "desc" });
  const allUsers = recentStudents?.data || [];
  const students = allUsers.filter((s: any) => {
    const r = (s.role || s.roleName || "").toLowerCase();
    return r === "student" || r === "students";
  }).slice(0, 5);

  return (
    <div style={{
      borderRadius: 8, border: "1px solid var(--admin-border-default, #2a2a2a)",
      background: "var(--admin-bg-card, #1e1e1e)", padding: 20, height: "100%",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <span style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--admin-font-tertiary, #818181)" }}>
          Recent Students
        </span>
        <Link href="/school-admin/students" style={{ fontSize: 11, color: "var(--admin-font-light, #555)" }}>View all</Link>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {students.length > 0 ? students.map((s: any) => (
          <div key={s.id} style={{
            display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 6,
            background: "var(--admin-bg-hover, #252525)",
          }}>
            <div style={{
              width: 30, height: 30, borderRadius: "50%",
              background: "linear-gradient(135deg, #14b8a6, #06b6d4)",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#fff", fontSize: 12, fontWeight: 600,
            }}>
              {s.name?.charAt(0).toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: "var(--admin-font-primary, #ebebeb)" }}>{s.name}</div>
              <div style={{ fontSize: 11, color: "var(--admin-font-light, #555)" }}>{s.email}</div>
            </div>
            <span style={{
              fontSize: 10, fontWeight: 500, padding: "2px 8px", borderRadius: 4,
              background: "rgba(16,185,129,0.1)", color: "#10b981",
            }}>
              {s.roleName || "student"}
            </span>
          </div>
        )) : (
          <div style={{ textAlign: "center", padding: 24, color: "var(--admin-font-light, #555)" }}>
            <Users style={{ width: 24, height: 24, margin: "0 auto 8px", opacity: 0.4 }} />
            <div style={{ fontSize: 12 }}>No students yet</div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function SchoolAdminDashboard() {
  const { t } = useTranslation();
  const { data: stats } = useSchoolAdminStats();

  const statItems = [
    {
      label: "Total Students",
      value: stats ? (stats.totalStudents?.toLocaleString() || "0") : "—",
      icon: Users,
      trend: 0,
      sub: "enrolled in school",
    },
    {
      label: "Assessments Done",
      value: stats ? (stats.completedAssessments?.toLocaleString() || "0") : "—",
      icon: BookOpen,
      trend: 0,
      sub: "completed assessments",
    },
    {
      label: "Avg. Score",
      value: stats ? `${(stats.averageScore || 0).toFixed(1)}%` : "—",
      icon: TrendingUp,
      trend: 0,
      sub: "across all students",
    },
  ];

  return (
    <ErrorBoundary>
      <div className="space-y-6" style={{ color: "var(--admin-font-primary)" }}>
        {/* Header */}
        <div className="pb-4" style={{ borderBottom: "1px solid var(--admin-border-default)" }}>
          <h1 className="text-[20px] font-semibold tracking-tight" style={{ color: "var(--admin-font-primary)" }}>
            {t("schoolAdmin.dashboard.title", "School Dashboard")}
          </h1>
          <p className="text-[13px] mt-0.5" style={{ color: "var(--admin-font-sectionLabel, var(--admin-font-light))" }}>
            {t("schoolAdmin.dashboard.subtitle", "Your school at a glance — students, courses, and assessments")}
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {statItems.map((item) => (
            <AdminStatCard key={item.label} {...item} />
          ))}
        </div>

        {/* Recent Students + Quick Stats */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div className="lg:col-span-2">
            <RecentStudentsCard />
          </div>
          <SchoolQuickStats />
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
    </ErrorBoundary>
  );
}
