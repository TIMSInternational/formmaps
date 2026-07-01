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
  Download, CheckSquare, X,
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
  const { t } = useTranslation("school_admin");
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab && ["roster", "onboard", "staff", "counselors"].includes(tab)) setActiveTab(tab);
    // The "Invite Student" button (and ?invite=true links) open the onboard/invite panel.
    else if (searchParams.get("invite") === "true") setActiveTab("onboard");
  }, [searchParams]);

  const handleTabChange = (key: string) => {
    setActiveTab(key);
    const url = key === "roster" ? "/school-admin/users" : `/school-admin/users?tab=${key}`;
    router.replace(url, { scroll: false });
  };
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  };
  const toggleAll = () => {
    if (selected.size === students.length) setSelected(new Set());
    else setSelected(new Set(students.map((s: any) => s.id)));
  };
  const clearSelection = () => setSelected(new Set());

  const handleBulkCopyEmails = () => {
    const emails = students.filter((s: any) => selected.has(s.id)).map((s: any) => s.email).join(", ");
    navigator.clipboard.writeText(emails);
    toast.success(t("users.emailCopied", { count: selected.size }));
  };

  const handleBulkExportCSV = () => {
    const rows = students.filter((s: any) => selected.has(s.id));
    const headers = [t("users.table.name"), t("users.table.email"), t("users.table.role"), t("users.table.grade"), t("users.table.status"), t("users.table.joined")];
    const csv = [headers.join(","), ...rows.map((s: any) => [
      `"${s.name || ""}"`, s.email || "", s.roleName || "student", s.gradeLevel || "",
      s.status || "active", s.createdDate ? new Date(s.createdDate).toLocaleDateString() : "",
    ].join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `students-export-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    toast.success(t("users.exportedStudents", { count: rows.length }));
  };

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
      label: t("users.stats.totalStudents"),
      value: statsLoading ? "—" : (stats?.totalStudents?.toLocaleString() || "0"),
      icon: Users, trend: 0, sub: t("users.stats.totalStudentsSub"),
    },
    {
      label: t("users.stats.activeStudents"),
      value: statsLoading ? "—" : (stats?.activeStudents?.toLocaleString() || "0"),
      icon: UserCheck, trend: 0, sub: t("users.stats.activeStudentsSub"),
    },
    {
      label: t("users.stats.assessmentsDone"),
      value: statsLoading ? "—" : (stats?.completedAssessments?.toLocaleString() || "0"),
      icon: BookOpen, trend: 0, sub: t("users.stats.assessmentsDoneSub"),
    },
    {
      label: t("users.stats.avgScore"),
      value: statsLoading ? "—" : `${(stats?.averageScore || 0).toFixed(1)}%`,
      icon: TrendingUp, trend: 0, sub: t("users.stats.avgScoreSub"),
    },
  ];

  return (
    <div className="space-y-6" style={{ color: "var(--admin-font-primary)" }}>
      {/* Header */}
      <div>
        <h1 className="text-[20px] font-semibold tracking-tight" style={{ color: "var(--admin-font-primary)" }}>
          {t("users.title")}
        </h1>
        <p className="text-[13px] mt-0.5" style={{ color: "var(--admin-font-light)" }}>
          {t("users.subtitle")}
        </p>
      </div>

      {/* Tab Bar */}
      <AdminTabBar
        tabs={[
          { key: "roster", label: t("users.tabs.roster"), icon: Users, count: stats?.totalStudents },
          { key: "onboard", label: t("users.tabs.onboard"), icon: Upload },
          { key: "staff", label: t("users.tabs.staff"), icon: Shield },
          { key: "counselors", label: t("users.tabs.counselors"), icon: UserCog },
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
          <Input placeholder={t("users.searchPlaceholder")} className="pl-9 h-9 rounded-lg text-sm"
            style={{ background: "var(--admin-bg-card)", border: "1px solid var(--admin-border-default)", color: "var(--admin-font-primary)" }}
            value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-[130px] h-9 rounded-lg text-sm"
            style={{ background: "var(--admin-bg-card)", border: "1px solid var(--admin-border-default)", color: "var(--admin-font-primary)" }}>
            <SelectValue placeholder={t("users.filter.allStatus")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("users.filter.allStatus")}</SelectItem>
            <SelectItem value="active">{t("users.filter.active")}</SelectItem>
            <SelectItem value="pending">{t("users.filter.pending")}</SelectItem>
            <SelectItem value="inactive">{t("users.filter.inactive")}</SelectItem>
          </SelectContent>
        </Select>
        <Button className="h-9 rounded-lg text-sm" style={{ background: "var(--admin-accent-green, #10b981)", color: "#fff" }}
          onClick={() => router.push("/school-admin/users?invite=true")}>
          <UserPlus className="mr-2 h-4 w-4" /> {t("users.inviteStudent")}
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {statItems.map((item) => (
          <AdminStatCard key={item.label} {...item} />
        ))}
      </div>

      {/* Bulk Action Bar */}
      {selected.size > 0 && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
          padding: "10px 16px", borderRadius: 8,
          background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.2)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <CheckSquare style={{ width: 16, height: 16, color: "#2E9098" }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: "#2E9098" }}>{t("users.bulk.selected", { count: selected.size })}</span>
            <button onClick={clearSelection} style={{ background: "none", border: "none", cursor: "pointer", padding: 2 }}>
              <X style={{ width: 14, height: 14, color: "var(--admin-font-tertiary)" }} />
            </button>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={handleBulkCopyEmails} style={{
              height: 30, borderRadius: 6, padding: "0 12px", fontSize: 11, fontWeight: 600,
              display: "flex", alignItems: "center", gap: 5,
              background: "var(--admin-bg-card)", border: "1px solid var(--admin-border-default)",
              color: "var(--admin-font-primary)", cursor: "pointer",
            }}>
              <Mail style={{ width: 12, height: 12 }} /> {t("users.bulk.copyEmails")}
            </button>
            <button onClick={handleBulkExportCSV} style={{
              height: 30, borderRadius: 6, padding: "0 12px", fontSize: 11, fontWeight: 600,
              display: "flex", alignItems: "center", gap: 5,
              background: "#102B47", border: "none",
              color: "#fff", cursor: "pointer",
            }}>
              <Download style={{ width: 12, height: 12 }} /> {t("users.bulk.exportCsv")}
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div style={{
        borderRadius: 8, border: "1px solid var(--admin-border-default)",
        background: "var(--admin-bg-card)", overflow: "hidden",
      }}>
        <Table>
          <TableHeader>
            <TableRow style={{ borderBottom: "1px solid var(--admin-border-default)" }}>
              <TableHead className="py-3 px-2 w-10" style={{ background: "var(--admin-bg-hover)" }}>
                <input type="checkbox" checked={students.length > 0 && selected.size === students.length}
                  onChange={toggleAll} style={{ width: 15, height: 15, accentColor: "#102B47", cursor: "pointer" }} />
              </TableHead>
              {[t("users.table.name"), t("users.table.email"), t("users.table.role"), t("users.table.grade"), t("users.table.status"), t("users.table.joined"), t("users.table.actions")].map((h) => (
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
              <TableRowsSkeleton columnCount={8} rowCount={5} />
            ) : students.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-32 text-center" style={{ color: "var(--admin-font-light)" }}>
                  <Users className="w-8 h-8 mx-auto mb-2" style={{ opacity: 0.3 }} />
                  <p className="text-sm">{t("users.noStudents")}</p>
                </TableCell>
              </TableRow>
            ) : (
              students.map((student: any) => (
                <TableRow key={student.id} style={{
                  borderBottom: "1px solid var(--admin-border-default)", cursor: "pointer",
                  background: selected.has(student.id) ? "rgba(59,130,246,0.04)" : "transparent",
                }}
                  className="transition-colors"
                  onClick={() => router.push(`/school-admin/users/${student.id}`)}
                  onMouseEnter={(e) => { if (!selected.has(student.id)) e.currentTarget.style.background = "var(--admin-bg-hover)"; }}
                  onMouseLeave={(e) => { if (!selected.has(student.id)) e.currentTarget.style.background = "transparent"; }}
                >
                  <TableCell className="py-3 px-2 w-10">
                    <input type="checkbox" checked={selected.has(student.id)}
                      onChange={() => {}} onClick={(e) => toggleSelect(student.id, e)}
                      style={{ width: 15, height: 15, accentColor: "#102B47", cursor: "pointer" }} />
                  </TableCell>
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
                      {student.status || t("users.filter.active")}
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
                        <DropdownMenuLabel className="text-xs" style={{ color: "var(--admin-font-light)" }}>{t("users.table.actions")}</DropdownMenuLabel>
                        <DropdownMenuItem className="text-sm cursor-pointer"
                          onClick={() => router.push(`/school-admin/users/${student.id}`)}>
                          <Eye className="mr-2 h-3.5 w-3.5" /> {t("users.actions.viewProfile")}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-sm cursor-pointer"
                          onClick={() => { navigator.clipboard.writeText(student.email); toast.success(t("users.actions.emailCopied")); }}>
                          <Mail className="mr-2 h-3.5 w-3.5" /> {t("users.actions.copyEmail")}
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
