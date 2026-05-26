"use client";

import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useRouter, useSearchParams } from "next/navigation";
import { useStudents, useSchoolAdminStats } from "@/hooks/useSchoolAdmin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Search, Users, UserPlus, MoreHorizontal, UserCheck, Eye, Mail, TrendingUp, BookOpen, Upload, Shield, UserCog,
} from "lucide-react";
import { toast } from "sonner";
import { TableRowsSkeleton } from "@/components/skeletons/TableSkeleton";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminStatCard } from "@/app/admin/_components/AdminStatCard";
import { AdminTabBar } from "../_components/AdminTabBar";
import dynamic from "next/dynamic";
const StaffPanel = dynamic(() => import("./_components/StaffPanel").then(m => ({ default: m.StaffPanel })));
const CounselorAssignPanel = dynamic(() => import("./_components/CounselorAssignPanel").then(m => ({ default: m.CounselorAssignPanel })));
const InvitePanel = dynamic(() => import("./_components/InvitePanel").then(m => ({ default: m.InvitePanel })));

export default function StudentsPage() {
  const [activeTab, setActiveTab] = useState("roster");
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab && ["roster", "onboard", "staff", "counselors"].includes(tab)) setActiveTab(tab);
  }, [searchParams]);

  const handleTabChange = (key: string) => {
    setActiveTab(key);
    const url = key === "roster" ? "/school-admin/users" : `/school-admin/users?tab=${key}`;
    router.replace(url, { scroll: false });
  };
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [page, setPage] = useState(1);

  const { data: stats, isLoading: statsLoading } = useSchoolAdminStats();
  const { data, isLoading: studentsLoading } = useStudents({
    page,
    limit: 10,
    search: searchTerm,
    status: roleFilter === "all" ? undefined : roleFilter,
  });

  const students = data?.data || [];
  const totalPages = data?.totalPages || 1;

  useEffect(() => {
    const timer = setTimeout(() => setPage(1), 500);
    return () => clearTimeout(timer);
  }, [searchTerm, roleFilter]);

  const statItems = [
    {
      label: "Total Students",
      value: statsLoading ? "—" : (stats?.totalStudents?.toLocaleString() || "0"),
      icon: Users, trend: 0, sub: "enrolled in school",
    },
    {
      label: "Active Students",
      value: statsLoading ? "—" : (stats?.activeStudents?.toLocaleString() || "0"),
      icon: UserCheck, trend: 0, sub: "currently active",
    },
    {
      label: "Assessments Done",
      value: statsLoading ? "—" : (stats?.completedAssessments?.toLocaleString() || "0"),
      icon: BookOpen, trend: 0, sub: "completed assessments",
    },
    {
      label: "Avg. Score",
      value: statsLoading ? "—" : `${(stats?.averageScore || 0).toFixed(1)}%`,
      icon: TrendingUp, trend: 0, sub: "across all students",
    },
  ];

  return (
    <div className="space-y-6" style={{ color: "var(--admin-font-primary)" }}>
      {/* Header */}
      <div>
        <h1 className="text-[20px] font-semibold tracking-tight" style={{ color: "var(--admin-font-primary)" }}>
          Users
        </h1>
        <p className="text-[13px] mt-0.5" style={{ color: "var(--admin-font-light)" }}>
          Manage students, counselors, coaches, and staff at your school
        </p>
      </div>

      {/* Tab Bar */}
      <AdminTabBar
        tabs={[
          { key: "roster", label: "Roster", icon: Users, count: stats?.totalStudents },
          { key: "onboard", label: "Invite & Onboard", icon: Upload },
          { key: "staff", label: "Staff & Roles", icon: Shield },
          { key: "counselors", label: "Counselor Assignments", icon: UserCog },
        ]}
        activeTab={activeTab}
        onChange={handleTabChange}
      />

      {activeTab === "staff" ? (
        <StaffPanel />
      ) : activeTab === "counselors" ? (
        <CounselorAssignPanel />
      ) : activeTab === "onboard" ? (
        <InvitePanel />
      ) : (
      <>
      {/* Roster Tab Content */}
      <div className="flex flex-col sm:flex-row gap-3 w-full">
        <div className="relative w-full md:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: "var(--admin-font-light)" }} />
          <Input placeholder="Search students..." className="pl-9 h-9 rounded-lg text-sm"
            style={{ background: "var(--admin-bg-card)", border: "1px solid var(--admin-border-default)", color: "var(--admin-font-primary)" }}
            value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-[130px] h-9 rounded-lg text-sm"
            style={{ background: "var(--admin-bg-card)", border: "1px solid var(--admin-border-default)", color: "var(--admin-font-primary)" }}>
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
        <Button className="h-9 rounded-lg text-sm" style={{ background: "var(--admin-accent-green, #10b981)", color: "#fff" }}
          onClick={() => router.push("/school-admin/users?invite=true")}>
          <UserPlus className="mr-2 h-4 w-4" /> Invite Student
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {statItems.map((item) => (
          <AdminStatCard key={item.label} {...item} />
        ))}
      </div>

      {/* Table */}
      <div style={{
        borderRadius: 8, border: "1px solid var(--admin-border-default)",
        background: "var(--admin-bg-card)", overflow: "hidden",
      }}>
        <Table>
          <TableHeader>
            <TableRow style={{ borderBottom: "1px solid var(--admin-border-default)" }}>
              {["Name", "Email", "Role", "Grade", "Status", "Joined", "Actions"].map((h) => (
                <TableHead key={h} className="py-3 px-4" style={{
                  fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em",
                  color: "var(--admin-font-tertiary)", background: "var(--admin-bg-hover)",
                }}>
                  {h}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {studentsLoading ? (
              <TableRowsSkeleton columnCount={7} rowCount={5} />
            ) : students.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center" style={{ color: "var(--admin-font-light)" }}>
                  <Users className="w-8 h-8 mx-auto mb-2" style={{ opacity: 0.3 }} />
                  <p className="text-sm">No students found</p>
                </TableCell>
              </TableRow>
            ) : (
              students.map((student: any) => (
                <TableRow key={student.id} style={{ borderBottom: "1px solid var(--admin-border-default)", cursor: "pointer" }}
                  className="transition-colors"
                  onClick={() => router.push(`/school-admin/users/${student.id}`)}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "var(--admin-bg-hover)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                >
                  <TableCell className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <div style={{
                        width: 30, height: 30, borderRadius: "50%",
                        background: "linear-gradient(135deg, #14b8a6, #06b6d4)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        color: "#fff", fontSize: 12, fontWeight: 600,
                      }}>
                        {student.name?.charAt(0).toUpperCase()}
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 500, color: "var(--admin-font-primary)" }}>
                        {student.name}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="py-3 px-4" style={{ fontSize: 13, color: "var(--admin-font-light)" }}>
                    {student.email}
                  </TableCell>
                  <TableCell className="py-3 px-4">
                    <Badge variant="outline" className="capitalize text-xs" style={{
                      borderColor: "var(--admin-border-default)", color: "var(--admin-font-tertiary)",
                      background: "var(--admin-bg-hover)",
                    }}>
                      {student.roleName || "student"}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-3 px-4" style={{ fontSize: 13, color: "var(--admin-font-light)" }}>
                    {student.gradeLevel || "—"}
                  </TableCell>
                  <TableCell className="py-3 px-4">
                    <Badge className="text-xs font-medium shadow-none border-0" style={{
                      background: student.status === "active" ? "rgba(16,185,129,0.1)" : "rgba(107,114,128,0.1)",
                      color: student.status === "active" ? "#10b981" : "#6b7280",
                    }}>
                      {student.status || "active"}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-3 px-4" style={{ fontSize: 12, color: "var(--admin-font-light)" }}>
                    {student.createdDate ? new Date(student.createdDate).toLocaleDateString() : "—"}
                  </TableCell>
                  <TableCell className="py-3 px-4">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-7 w-7 p-0 rounded-full"
                          style={{ color: "var(--admin-font-light)" }}
                          onClick={(e) => e.stopPropagation()}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-[150px]">
                        <DropdownMenuLabel className="text-xs" style={{ color: "var(--admin-font-light)" }}>Actions</DropdownMenuLabel>
                        <DropdownMenuItem className="text-sm cursor-pointer"
                          onClick={() => router.push(`/school-admin/users/${student.id}`)}>
                          <Eye className="mr-2 h-3.5 w-3.5" /> View Profile
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-sm cursor-pointer"
                          onClick={() => { navigator.clipboard.writeText(student.email); toast.success("Email copied"); }}>
                          <Mail className="mr-2 h-3.5 w-3.5" /> Copy Email
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {/* Pagination */}
        <div className="flex items-center justify-between p-3" style={{
          borderTop: "1px solid var(--admin-border-default)", background: "var(--admin-bg-hover)",
        }}>
          <p className="text-xs" style={{ color: "var(--admin-font-light)" }}>
            Page <span style={{ fontWeight: 600, color: "var(--admin-font-primary)" }}>{page}</span> of{" "}
            <span style={{ fontWeight: 600, color: "var(--admin-font-primary)" }}>{totalPages}</span>
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1} className="h-7 rounded-md text-xs"
              style={{ borderColor: "var(--admin-border-default)", color: "var(--admin-font-light)" }}>
              Previous
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages} className="h-7 rounded-md text-xs"
              style={{ borderColor: "var(--admin-border-default)", color: "var(--admin-font-light)" }}>
              Next
            </Button>
          </div>
        </div>
      </div>
      </>
      )}
    </div>
  );
}
