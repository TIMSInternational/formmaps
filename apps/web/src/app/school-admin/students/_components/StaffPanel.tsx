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
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Search, Users, UserPlus, MoreHorizontal, Shield, Mail, Eye, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { useSchoolUsers, useInviteStaff } from "@/hooks/useSchoolProfileQueries";
import { TableRowsSkeleton } from "@/components/skeletons/TableSkeleton";
import { AdminStatCard } from "@/app/admin/_components/AdminStatCard";

export function StaffPanel() {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState({ name: "", email: "", role: "counselor" });

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
      await inviteStaff.mutateAsync({ name: inviteForm.name, email: inviteForm.email, role: inviteForm.role as "counselor" | "staff" });
      toast.success("Invitation sent");
      setIsInviteOpen(false);
      setInviteForm({ name: "", email: "", role: "counselor" });
      refetch();
    } catch (err: any) { toast.error(err.message || "Failed to invite"); }
  };

  // Count by role
  const roleCounts = users.reduce((acc: any, u: any) => {
    const r = (u.roleName || u.role || "other").toLowerCase();
    acc[r] = (acc[r] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

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
            {isLoading ? (
              <TableRowsSkeleton columnCount={7} rowCount={5} />
            ) : users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center" style={{ color: "var(--admin-font-light)" }}>
                  <Users className="w-8 h-8 mx-auto mb-2" style={{ opacity: 0.3 }} />
                  <p className="text-sm">No users found</p>
                </TableCell>
              </TableRow>
            ) : (
              users.map((user: any) => {
                const role = (user.roleName || user.role || "student").replace(/_/g, " ");
                return (
                  <TableRow key={user.id} style={{ borderBottom: "1px solid var(--admin-border-default)" }}
                    className="transition-colors"
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
                        borderColor: "var(--admin-border-default)", color: "var(--admin-font-tertiary)", background: "var(--admin-bg-hover)",
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
                    <TableCell className="py-3 px-4">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-7 w-7 p-0 rounded-full" style={{ color: "var(--admin-font-light)" }}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-[150px]">
                          <DropdownMenuLabel className="text-xs" style={{ color: "var(--admin-font-light)" }}>Actions</DropdownMenuLabel>
                          <DropdownMenuItem className="text-sm cursor-pointer">
                            <Eye className="mr-2 h-3.5 w-3.5" /> View
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-sm cursor-pointer"
                            onClick={() => { navigator.clipboard.writeText(user.email); toast.success("Email copied"); }}>
                            <Mail className="mr-2 h-3.5 w-3.5" /> Copy Email
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
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
    </div>
  );
}
