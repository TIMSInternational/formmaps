"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api/apiClient";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Search, Users, UserCheck, Clock, Plus, Mail, Trash2, X } from "lucide-react";
import { AdminStatCard } from "@/app/admin/_components/AdminStatCard";
import { TableRowsSkeleton } from "@/components/skeletons/TableSkeleton";
import { motion } from "motion/react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

interface ParentRow {
  id: string;
  parentName: string;
  parentEmail: string;
  parentUserId: string | null;
  isAccepted: boolean;
  acceptedAt: string | null;
  createdDate: string;
  students: { id: string; name: string | null; email: string; gradeLevel: string | null }[];
}

interface ParentsResponse {
  success: boolean;
  data: ParentRow[];
  total: number;
  totalPages: number;
  page: number;
  stats: { totalParents: number; linkedStudents: number; pendingInvites: number };
}

function useParents(params: { page: number; limit: number; search: string }) {
  return useQuery<ParentsResponse>({
    queryKey: ["school-admin", "parents", params],
    queryFn: () =>
      apiRequest<ParentsResponse>(
        `/api/v1/school-admin/parents?page=${params.page}&limit=${params.limit}&search=${encodeURIComponent(params.search)}`
      ),
    staleTime: 1000 * 30,
  });
}

export default function ParentsPage() {
  const { t } = useTranslation("school_admin");
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteForm, setInviteForm] = useState({ studentSearch: "", parentEmail: "", parentName: "" });
  const [studentResults, setStudentResults] = useState<{ id: string; name: string; email: string }[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<{ id: string; name: string; email: string } | null>(null);
  const [inviting, setInviting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const { data, isLoading, refetch } = useParents({ page, limit: 20, search: debouncedSearch });

  // Student search for invite form
  useEffect(() => {
    if (!showInvite || !inviteForm.studentSearch) { setStudentResults([]); return; }
    const t = setTimeout(async () => {
      try {
        const res = await apiRequest(`/api/v1/school-admin/students?search=${encodeURIComponent(inviteForm.studentSearch)}&limit=10`);
        setStudentResults(res?.data?.items ?? res?.data ?? []);
      } catch { setStudentResults([]); }
    }, 300);
    return () => clearTimeout(t);
  }, [inviteForm.studentSearch, showInvite]);

  const handleInvite = async () => {
    if (!selectedStudent || !inviteForm.parentEmail.trim()) return;
    setInviting(true);
    try {
      await apiRequest("/api/v1/school-admin/parents/invite", {
        method: "POST",
        data: { studentId: selectedStudent.id, parentEmail: inviteForm.parentEmail.trim(), parentName: inviteForm.parentName.trim() },
      });
      toast.success(t("parents.toast.invited"));
      setShowInvite(false); setInviteForm({ studentSearch: "", parentEmail: "", parentName: "" }); setSelectedStudent(null);
      refetch();
    } catch (err: unknown) { const e = err as { data?: { message?: string } }; toast.error(e?.data?.message || t("parents.toast.inviteFailed")); }
    finally { setInviting(false); }
  };

  const handleResend = async (linkId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await apiRequest(`/api/v1/school-admin/parents/${linkId}/resend`, { method: "POST" });
      toast.success(t("parents.toast.resent"));
    } catch { toast.error(t("parents.toast.resendFailed")); }
  };

  const handleUnlink = async (linkId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await apiRequest(`/api/v1/school-admin/parents/${linkId}`, { method: "DELETE" });
      toast.success(t("parents.toast.unlinked"));
      refetch();
    } catch { toast.error(t("parents.toast.unlinkFailed")); }
  };

  const parents = data?.data || [];
  const totalPages = data?.totalPages || 1;
  const stats = data?.stats;

  const statItems = [
    {
      label: t("parents.stats.totalParents"),
      value: isLoading ? "\u2014" : (stats?.totalParents?.toLocaleString() || "0"),
      icon: Users, trend: 0, sub: t("parents.stats.totalParentsSub"),
    },
    {
      label: t("parents.stats.linkedStudents"),
      value: isLoading ? "\u2014" : (stats?.linkedStudents?.toLocaleString() || "0"),
      icon: UserCheck, trend: 0, sub: t("parents.stats.linkedStudentsSub"),
    },
    {
      label: t("parents.stats.pendingInvites"),
      value: isLoading ? "\u2014" : (stats?.pendingInvites?.toLocaleString() || "0"),
      icon: Clock, trend: 0, sub: t("parents.stats.pendingInvitesSub"),
    },
  ];

  return (
    <div className="space-y-6" style={{ color: "var(--admin-font-primary)" }}>
      {/* Header */}
      <div>
        <h1 className="text-[20px] font-semibold tracking-tight" style={{ color: "var(--admin-font-primary)" }}>
          {t("parents.title")}
        </h1>
        <p className="text-[13px] mt-0.5" style={{ color: "var(--admin-font-light)" }}>
          {t("parents.subtitle")}
        </p>
      </div>

      {/* Invite Parent Form */}
      {showInvite && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
          style={{ borderRadius: 10, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)", padding: 20, overflow: "hidden" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--admin-font-primary)" }}>{t("parents.inviteForm.title")}</span>
            <button onClick={() => setShowInvite(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--admin-font-tertiary)" }}><X style={{ width: 16, height: 16 }} /></button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: "var(--admin-font-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{t("parents.inviteForm.student")}</label>
              {selectedStudent ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 6, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-hover)", marginTop: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: "var(--admin-font-primary)", flex: 1 }}>{selectedStudent.name}</span>
                  <button onClick={() => setSelectedStudent(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--admin-font-tertiary)" }}><X style={{ width: 12, height: 12 }} /></button>
                </div>
              ) : (
                <div style={{ marginTop: 4 }}>
                  <Input placeholder={t("parents.inviteForm.searchStudent")} value={inviteForm.studentSearch} onChange={(e) => setInviteForm(f => ({ ...f, studentSearch: e.target.value }))}
                    className="h-9 text-sm" style={{ background: "var(--admin-bg-hover)", border: "1px solid var(--admin-border-default)", color: "var(--admin-font-primary)" }} />
                  {studentResults.length > 0 && (
                    <div style={{ border: "1px solid var(--admin-border-default)", borderRadius: 6, marginTop: 4, maxHeight: 150, overflowY: "auto", background: "var(--admin-bg-card)" }}>
                      {studentResults.map((s) => (
                        <button key={s.id} onClick={() => { setSelectedStudent(s); setInviteForm(f => ({ ...f, studentSearch: "" })); setStudentResults([]); }}
                          style={{ width: "100%", padding: "6px 10px", border: "none", background: "transparent", cursor: "pointer", textAlign: "left", fontSize: 12, color: "var(--admin-font-primary)", fontFamily: "inherit" }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--admin-bg-hover)"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
                          {s.name} <span style={{ color: "var(--admin-font-tertiary)" }}>· {s.email}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "var(--admin-font-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{t("parents.inviteForm.parentEmail")}</label>
                <Input placeholder={t("parents.inviteForm.parentEmailPlaceholder")} value={inviteForm.parentEmail} onChange={(e) => setInviteForm(f => ({ ...f, parentEmail: e.target.value }))}
                  className="h-9 text-sm mt-1" style={{ background: "var(--admin-bg-hover)", border: "1px solid var(--admin-border-default)", color: "var(--admin-font-primary)" }} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "var(--admin-font-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{t("parents.inviteForm.parentName")}</label>
                <Input placeholder={t("parents.inviteForm.parentNamePlaceholder")} value={inviteForm.parentName} onChange={(e) => setInviteForm(f => ({ ...f, parentName: e.target.value }))}
                  className="h-9 text-sm mt-1" style={{ background: "var(--admin-bg-hover)", border: "1px solid var(--admin-border-default)", color: "var(--admin-font-primary)" }} />
              </div>
            </div>
          </div>
          <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
            <Button onClick={handleInvite} disabled={!selectedStudent || !inviteForm.parentEmail.trim() || inviting}
              className="h-9 rounded-lg text-sm" style={{ background: "var(--admin-accent-blue, #2E9098)", color: "#fff", border: "none" }}>
              <Mail className="w-3.5 h-3.5 mr-2" />{inviting ? t("parents.inviteForm.sending") : t("parents.inviteForm.sendInvitation")}
            </Button>
          </div>
        </motion.div>
      )}

      {/* Search + Invite Button */}
      <div className="flex flex-col sm:flex-row gap-3 w-full">
        <div className="relative w-full md:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: "var(--admin-font-light)" }} />
          <Input
            placeholder={t("parents.searchPlaceholder")}
            className="pl-9 h-9 rounded-lg text-sm"
            style={{ background: "var(--admin-bg-card)", border: "1px solid var(--admin-border-default)", color: "var(--admin-font-primary)" }}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <Button onClick={() => setShowInvite(!showInvite)}
          className="h-9 rounded-lg text-sm" style={{ background: showInvite ? "var(--admin-bg-hover)" : "var(--admin-accent-blue, #2E9098)", color: showInvite ? "var(--admin-font-primary)" : "#fff", border: "1px solid var(--admin-border-default)" }}>
          {showInvite ? <><X className="w-3.5 h-3.5 mr-2" />{t("parents.cancel")}</> : <><Plus className="w-3.5 h-3.5 mr-2" />{t("parents.invite")}</>}
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {statItems.map((item) => (
          <AdminStatCard key={item.label} {...item} />
        ))}
      </div>

      {/* Table */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        style={{
          borderRadius: 8, border: "1px solid var(--admin-border-default)",
          background: "var(--admin-bg-card)", overflow: "hidden",
        }}
      >
        <Table>
          <TableHeader>
            <TableRow style={{ borderBottom: "1px solid var(--admin-border-default)" }}>
              {["parentName", "parentEmail", "linkedStudents", "status", "joinedDate", "actions"].map((h) => (
                <TableHead key={h} className="py-3 px-4" style={{
                  fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em",
                  color: "var(--admin-font-tertiary)", background: "var(--admin-bg-hover)",
                }}>
                  {t(`parents.table.${h}`)}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRowsSkeleton columnCount={6} rowCount={5} />
            ) : parents.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center" style={{ color: "var(--admin-font-light)" }}>
                  <Users className="w-8 h-8 mx-auto mb-2" style={{ opacity: 0.3 }} />
                  <p className="text-sm">{t("parents.noParents")}</p>
                </TableCell>
              </TableRow>
            ) : (
              parents.map((parent) => (
                <TableRow
                  key={parent.id}
                  style={{ borderBottom: "1px solid var(--admin-border-default)", cursor: "pointer" }}
                  className="transition-colors"
                  onClick={() => {
                    if (parent.parentUserId) router.push(`/school-admin/users/${parent.parentUserId}`);
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "var(--admin-bg-hover)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                >
                  <TableCell className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <div style={{
                        width: 30, height: 30, borderRadius: "50%",
                        background: "linear-gradient(135deg, #8b5cf6, #a78bfa)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        color: "#fff", fontSize: 12, fontWeight: 600,
                      }}>
                        {parent.parentName?.charAt(0)?.toUpperCase() || "P"}
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 500, color: "var(--admin-font-primary)" }}>
                        {parent.parentName || t("parents.unnamed")}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="py-3 px-4" style={{ fontSize: 13, color: "var(--admin-font-light)" }}>
                    {parent.parentEmail}
                  </TableCell>
                  <TableCell className="py-3 px-4">
                    <div className="flex flex-wrap gap-1">
                      {parent.students.map((s) => (
                        <Badge
                          key={s.id}
                          variant="outline"
                          className="text-xs"
                          style={{
                            borderColor: "var(--admin-border-default)",
                            color: "var(--admin-font-tertiary)",
                            background: "var(--admin-bg-hover)",
                          }}
                        >
                          {s.name || s.email}{s.gradeLevel ? ` (${s.gradeLevel})` : ""}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="py-3 px-4">
                    <Badge className="text-xs font-medium shadow-none border-0" style={{
                      background: parent.isAccepted ? "rgba(16,185,129,0.1)" : "rgba(234,179,8,0.1)",
                      color: parent.isAccepted ? "#10b981" : "#eab308",
                    }}>
                      {parent.isAccepted ? t("parents.statusActive") : t("parents.statusPending")}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-3 px-4" style={{ fontSize: 12, color: "var(--admin-font-light)" }}>
                    {parent.createdDate ? new Date(parent.createdDate).toLocaleDateString() : "\u2014"}
                  </TableCell>
                  <TableCell className="py-3 px-4">
                    <div style={{ display: "flex", gap: 4 }}>
                      {!parent.isAccepted && (
                        <button onClick={(e) => handleResend(parent.id, e)} title={t("parents.resendInvite")}
                          style={{ width: 28, height: 28, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--admin-bg-hover)", border: "1px solid var(--admin-border-default)", cursor: "pointer", transition: "all 0.15s" }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(59,130,246,0.1)"; e.currentTarget.style.borderColor = "#2E9098"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = "var(--admin-bg-hover)"; e.currentTarget.style.borderColor = "var(--admin-border-default)"; }}>
                          <Mail style={{ width: 12, height: 12, color: "#2E9098" }} />
                        </button>
                      )}
                      <button onClick={(e) => handleUnlink(parent.id, e)} title={t("parents.unlinkParent")}
                        style={{ width: 28, height: 28, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--admin-bg-hover)", border: "1px solid var(--admin-border-default)", cursor: "pointer", transition: "all 0.15s" }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(239,68,68,0.1)"; e.currentTarget.style.borderColor = "#ef4444"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "var(--admin-bg-hover)"; e.currentTarget.style.borderColor = "var(--admin-border-default)"; }}>
                        <Trash2 style={{ width: 12, height: 12, color: "#ef4444" }} />
                      </button>
                    </div>
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
            {t("parents.pagination", { page, total: totalPages })}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1} className="h-7 rounded-md text-xs"
              style={{ borderColor: "var(--admin-border-default)", color: "var(--admin-font-light)" }}>
              {t("parents.previous")}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages} className="h-7 rounded-md text-xs"
              style={{ borderColor: "var(--admin-border-default)", color: "var(--admin-font-light)" }}>
              {t("parents.next")}
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
