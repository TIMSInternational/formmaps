"use client";

import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Search, Users, UserPlus, Shield, Mail, Loader2, Send, UserX, Calendar, AtSign, BadgeCheck,
} from "lucide-react";
import { toast } from "sonner";
import { useSchoolUsers, useInviteStaff } from "@/hooks/useSchoolProfileQueries";
import { apiRequest } from "@/lib/api/apiClient";
import { TableRowsSkeleton } from "@/components/skeletons/TableSkeleton";
import { AdminStatCard } from "@/app/admin/_components/AdminStatCard";

export function StaffPanel() {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState({ name: "", email: "", role: "counselor" });
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const { data, isLoading, refetch } = useSchoolUsers({
    page, limit: 10, search: searchTerm,
    role: roleFilter === "all" ? undefined : roleFilter,
  });
  const inviteStaff = useInviteStaff();

  const users = data?.data || [];
  const totalPages = data?.totalPages || 1;

  useEffect(() => {
    const t = setTimeout(() => setPage(1), 500);
    return () => clearTimeout(t);
  }, [searchTerm, roleFilter]);

  const handleInvite = async () => {
    if (!inviteForm.name || !inviteForm.email) { toast.error("Name and email required"); return; }
    try {
      const result = await inviteStaff.mutateAsync({ name: inviteForm.name, email: inviteForm.email, role: inviteForm.role as "counselor" | "staff" }) as { emailSent?: boolean };
      if (result?.emailSent === false) {
        toast.error("Account created, but the invitation email could not be sent. Check the address, then use Resend.");
      } else {
        toast.success("Invitation sent");
      }
      setIsInviteOpen(false);
      setInviteForm({ name: "", email: "", role: "counselor" });
      refetch();
    } catch (err: any) { toast.error(err.message || "Failed to invite"); }
  };

  const handleResendInvite = async (userId: string) => {
    setActionLoading("resend");
    try {
      const res = await apiRequest(`/api/v1/school-admin/students/${userId}/resend-invite`, { method: "POST" });
      if (res?.data?.emailSent === false) {
        toast.error("Could not send the invitation email. Verify the address is correct.");
      } else {
        toast.success("Invitation resent");
      }
    } catch { toast.error("Failed to resend invitation"); }
    setActionLoading(null);
  };

  const handleDeactivate = async (userId: string) => {
    setActionLoading("deactivate");
    try {
      await apiRequest(`/api/v1/school-admin/students/${userId}`, { method: "DELETE" });
      toast.success("User deactivated");
      setSelectedUser(null);
      refetch();
    } catch { toast.error("Failed to deactivate user"); }
    setActionLoading(null);
  };

  // Count by role
  const roleCounts = users.reduce((acc: any, u: any) => {
    const r = (u.roleName || u.role || "other").toLowerCase();
    acc[r] = (acc[r] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const roleColor = (role: string) => {
    const r = role.toLowerCase().replace(/_/g, " ");
    if (r.includes("admin")) return { bg: "rgba(139,92,246,0.1)", color: "#8b5cf6" };
    if (r.includes("counselor")) return { bg: "rgba(59,130,246,0.1)", color: "#2E9098" };
    if (r.includes("coach")) return { bg: "rgba(245,158,11,0.1)", color: "#f59e0b" };
    return { bg: "rgba(107,114,128,0.1)", color: "#6b7280" };
  };

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3 w-full">
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
          <div className="relative w-full md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: "var(--admin-font-light)" }} />
            <Input placeholder="Search users..." className="pl-9 h-9 rounded-lg text-sm"
              style={{ background: "var(--admin-bg-card)", border: "1px solid var(--admin-border-default)", color: "var(--admin-font-primary)" }}
              value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>

          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-[130px] h-9 rounded-lg text-sm"
              style={{ background: "var(--admin-bg-card)", border: "1px solid var(--admin-border-default)", color: "var(--admin-font-primary)" }}>
              <SelectValue placeholder="All Roles" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Roles</SelectItem>
              <SelectItem value="counselor">Counselor</SelectItem>
              <SelectItem value="staff">Staff</SelectItem>
              <SelectItem value="school_admin">Admin</SelectItem>
            </SelectContent>
          </Select>

          <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
            <DialogTrigger asChild>
              <button style={{
                height: 36, borderRadius: 6, padding: "0 16px", fontSize: 13, fontWeight: 600,
                display: "flex", alignItems: "center", gap: 6,
                background: "var(--admin-accent-green, #10b981)", color: "#fff",
                border: "none", cursor: "pointer",
              }}>
                <UserPlus style={{ width: 14, height: 14 }} /> Invite Staff
              </button>
            </DialogTrigger>
            <DialogContent style={{ background: "var(--admin-bg-card)", border: "1px solid var(--admin-border-default)", color: "var(--admin-font-primary)" }}>
              <DialogHeader>
                <DialogTitle style={{ color: "var(--admin-font-primary)" }}>Invite Staff Member</DialogTitle>
                <DialogDescription style={{ color: "var(--admin-font-tertiary)" }}>
                  Send an invitation to a counselor or staff member
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label style={{ fontSize: 12, color: "var(--admin-font-tertiary)" }}>Full Name</Label>
                  <Input value={inviteForm.name} onChange={(e) => setInviteForm({ ...inviteForm, name: e.target.value })}
                    style={{ background: "var(--admin-bg-hover)", border: "1px solid var(--admin-border-default)", color: "var(--admin-font-primary)", height: 36 }} />
                </div>
                <div className="space-y-2">
                  <Label style={{ fontSize: 12, color: "var(--admin-font-tertiary)" }}>Email</Label>
                  <Input type="email" value={inviteForm.email} onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                    style={{ background: "var(--admin-bg-hover)", border: "1px solid var(--admin-border-default)", color: "var(--admin-font-primary)", height: 36 }} />
                </div>
                <div className="space-y-2">
                  <Label style={{ fontSize: 12, color: "var(--admin-font-tertiary)" }}>Role</Label>
                  <Select value={inviteForm.role} onValueChange={(v) => setInviteForm({ ...inviteForm, role: v })}>
                    <SelectTrigger style={{ background: "var(--admin-bg-hover)", border: "1px solid var(--admin-border-default)", color: "var(--admin-font-primary)", height: 36 }}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="counselor">Counselor</SelectItem>
                      <SelectItem value="coach">Coach</SelectItem>
                      <SelectItem value="staff">Staff</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsInviteOpen(false)}
                  style={{ borderColor: "var(--admin-border-default)", color: "var(--admin-font-light)" }}>Cancel</Button>
                <button onClick={handleInvite} disabled={inviteStaff.isPending}
                  style={{
                    height: 36, borderRadius: 6, padding: "0 20px", fontSize: 13, fontWeight: 600,
                    background: "var(--admin-accent-green, #10b981)", color: "#fff", border: "none", cursor: "pointer",
                  }}>
                  {inviteStaff.isPending ? <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> : "Send Invite"}
                </button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <AdminStatCard label="Total Users" value={String(data?.total || 0)} icon={Users} sub="in school" trend={0} />
        <AdminStatCard label="Counselors" value={String(roleCounts["counselor"] || 0)} icon={Shield} sub="active staff" trend={0} />
        <AdminStatCard label="Students" value={String(roleCounts["student"] || 0)} icon={UserPlus} sub="enrolled" trend={0} />
      </div>

      {/* Table */}
      <div style={{
        borderRadius: 8, border: "1px solid var(--admin-border-default)",
        background: "var(--admin-bg-card)", overflow: "hidden",
      }}>
        <Table>
          <TableHeader>
            <TableRow style={{ borderBottom: "1px solid var(--admin-border-default)" }}>
              {["Name", "Email", "Role", "Grade", "Status", "Joined"].map((h) => (
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
            {isLoading ? (
              <TableRowsSkeleton columnCount={6} rowCount={5} />
            ) : users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center" style={{ color: "var(--admin-font-light)" }}>
                  <Users className="w-8 h-8 mx-auto mb-2" style={{ opacity: 0.3 }} />
                  <p className="text-sm">No users found</p>
                </TableCell>
              </TableRow>
            ) : (
              users.map((user: any) => {
                const role = (user.roleName || user.role || "student").replace(/_/g, " ");
                const rc = roleColor(role);
                return (
                  <TableRow key={user.id} style={{ borderBottom: "1px solid var(--admin-border-default)", cursor: "pointer" }}
                    className="transition-colors"
                    onClick={() => setSelectedUser(user)}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "var(--admin-bg-hover)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
                    <TableCell className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div style={{
                          width: 30, height: 30, borderRadius: "50%",
                          background: "linear-gradient(135deg, #14b8a6, #06b6d4)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          color: "#fff", fontSize: 12, fontWeight: 600,
                        }}>
                          {user.name?.charAt(0).toUpperCase()}
                        </div>
                        <span style={{ fontSize: 13, fontWeight: 500, color: "var(--admin-font-primary)" }}>{user.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="py-3 px-4" style={{ fontSize: 13, color: "var(--admin-font-light)" }}>{user.email}</TableCell>
                    <TableCell className="py-3 px-4">
                      <Badge variant="outline" className="capitalize text-xs" style={{
                        borderColor: rc.color, color: rc.color, background: rc.bg, border: "none",
                      }}>
                        <Shield className="h-3 w-3 mr-1 opacity-60" />
                        {role}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-3 px-4" style={{ fontSize: 13, color: "var(--admin-font-light)" }}>
                      {user.gradeLevel || "—"}
                    </TableCell>
                    <TableCell className="py-3 px-4">
                      <Badge className="text-xs font-medium shadow-none border-0" style={{
                        background: (user.status || "active") === "active" ? "rgba(16,185,129,0.1)" : "rgba(107,114,128,0.1)",
                        color: (user.status || "active") === "active" ? "#10b981" : "#6b7280",
                      }}>
                        {user.status || "active"}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-3 px-4" style={{ fontSize: 12, color: "var(--admin-font-light)" }}>
                      {user.createdDate ? new Date(user.createdDate).toLocaleDateString() : user.joinedAt ? new Date(user.joinedAt).toLocaleDateString() : "—"}
                    </TableCell>
                  </TableRow>
                );
              })
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
              style={{ borderColor: "var(--admin-border-default)", color: "var(--admin-font-light)" }}>Previous</Button>
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages} className="h-7 rounded-md text-xs"
              style={{ borderColor: "var(--admin-border-default)", color: "var(--admin-font-light)" }}>Next</Button>
          </div>
        </div>
      </div>

      {/* User Detail Dialog */}
      <Dialog open={!!selectedUser} onOpenChange={(open) => { if (!open) setSelectedUser(null); }}>
        <DialogContent style={{ background: "var(--admin-bg-card)", border: "1px solid var(--admin-border-default)", color: "var(--admin-font-primary)", maxWidth: 440 }}>
          {selectedUser && (() => {
            const role = (selectedUser.roleName || selectedUser.role || "student").replace(/_/g, " ");
            const rc = roleColor(role);
            const isActive = (selectedUser.status || "active") === "active";
            return (
              <>
                <DialogHeader>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
                    <div style={{
                      width: 44, height: 44, borderRadius: "50%",
                      background: "linear-gradient(135deg, #14b8a6, #06b6d4)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      color: "#fff", fontSize: 16, fontWeight: 700,
                    }}>
                      {selectedUser.name?.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <DialogTitle style={{ color: "var(--admin-font-primary)", fontSize: 16, marginBottom: 2 }}>
                        {selectedUser.name}
                      </DialogTitle>
                      <Badge variant="outline" className="capitalize text-xs" style={{
                        borderColor: rc.color, color: rc.color, background: rc.bg, border: "none",
                      }}>
                        {role}
                      </Badge>
                    </div>
                  </div>
                </DialogHeader>

                {/* Info rows */}
                <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "8px 0" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <AtSign style={{ width: 14, height: 14, color: "var(--admin-font-tertiary)", flexShrink: 0 }} />
                    <span style={{ fontSize: 13, color: "var(--admin-font-primary)" }}>{selectedUser.email}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <BadgeCheck style={{ width: 14, height: 14, color: isActive ? "#10b981" : "#6b7280", flexShrink: 0 }} />
                    <span style={{ fontSize: 13, color: isActive ? "#10b981" : "#6b7280", fontWeight: 500 }}>
                      {isActive ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <Calendar style={{ width: 14, height: 14, color: "var(--admin-font-tertiary)", flexShrink: 0 }} />
                    <span style={{ fontSize: 13, color: "var(--admin-font-light)" }}>
                      Joined {selectedUser.createdDate ? new Date(selectedUser.createdDate).toLocaleDateString() : selectedUser.joinedAt ? new Date(selectedUser.joinedAt).toLocaleDateString() : "—"}
                    </span>
                  </div>
                  {selectedUser.gradeLevel && (
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <Users style={{ width: 14, height: 14, color: "var(--admin-font-tertiary)", flexShrink: 0 }} />
                      <span style={{ fontSize: 13, color: "var(--admin-font-light)" }}>Grade {selectedUser.gradeLevel}</span>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div style={{
                  borderTop: "1px solid var(--admin-border-default)", paddingTop: 16, marginTop: 8,
                  display: "flex", flexDirection: "column", gap: 8,
                }}>
                  <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--admin-font-tertiary)", marginBottom: 2 }}>
                    Actions
                  </div>

                  <button
                    onClick={() => { navigator.clipboard.writeText(selectedUser.email); toast.success("Email copied to clipboard"); }}
                    style={{
                      display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
                      borderRadius: 6, border: "1px solid var(--admin-border-default)",
                      background: "var(--admin-bg-card)", cursor: "pointer",
                      fontSize: 13, fontWeight: 500, color: "var(--admin-font-primary)",
                      width: "100%", textAlign: "left",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "var(--admin-bg-hover)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "var(--admin-bg-card)"; }}
                  >
                    <Mail style={{ width: 14, height: 14, color: "var(--admin-font-tertiary)" }} />
                    Copy Email
                  </button>

                  <button
                    onClick={() => handleResendInvite(selectedUser.id)}
                    disabled={actionLoading === "resend"}
                    style={{
                      display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
                      borderRadius: 6, border: "1px solid var(--admin-border-default)",
                      background: "var(--admin-bg-card)", cursor: "pointer",
                      fontSize: 13, fontWeight: 500, color: "var(--admin-font-primary)",
                      width: "100%", textAlign: "left",
                      opacity: actionLoading === "resend" ? 0.6 : 1,
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "var(--admin-bg-hover)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "var(--admin-bg-card)"; }}
                  >
                    {actionLoading === "resend"
                      ? <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite", color: "var(--admin-font-tertiary)" }} />
                      : <Send style={{ width: 14, height: 14, color: "var(--admin-font-tertiary)" }} />}
                    Resend Invitation
                  </button>

                  {isActive && (
                    <button
                      onClick={() => {
                        if (confirm(`Deactivate ${selectedUser.name}? They will lose access to the platform.`)) {
                          handleDeactivate(selectedUser.id);
                        }
                      }}
                      disabled={actionLoading === "deactivate"}
                      style={{
                        display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
                        borderRadius: 6, border: "1px solid rgba(239,68,68,0.2)",
                        background: "rgba(239,68,68,0.05)", cursor: "pointer",
                        fontSize: 13, fontWeight: 500, color: "#ef4444",
                        width: "100%", textAlign: "left",
                        opacity: actionLoading === "deactivate" ? 0.6 : 1,
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(239,68,68,0.1)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(239,68,68,0.05)"; }}
                    >
                      {actionLoading === "deactivate"
                        ? <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} />
                        : <UserX style={{ width: 14, height: 14 }} />}
                      Deactivate User
                    </button>
                  )}
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
