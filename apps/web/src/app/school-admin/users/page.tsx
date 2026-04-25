"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Users, UserPlus, Search, Shield, Loader2, ChevronLeft, ChevronRight, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import {
  useSchoolUsers,
  useInviteStaff,
  useUpdateUserRole,
} from "@/hooks/useSchoolProfileQueries";
import type { SchoolRole } from "@/types/assessmentConfig";

const roleColors: Record<SchoolRole, string> = {
  school_admin: "bg-purple-100 text-purple-700 border-purple-200",
  counselor: "bg-teal-100 text-teal-700 border-teal-200",
  staff: "bg-blue-100 text-blue-700 border-blue-200",
  student: "bg-gray-100 text-gray-700 border-gray-200",
};

// Helper to get initials
const getInitials = (name: string) => {
  return name
    .split(" ")
    .map(n => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "?";
};

export default function UsersPage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("");
  const [page, setPage] = useState(1);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"counselor" | "staff">("counselor");

  const { data, isLoading } = useSchoolUsers({
    search: search || undefined,
    role: roleFilter || undefined,
    page,
    limit: 10, // Changed from 20 to 10 for better pagination view
  });

  const invite = useInviteStaff();
  const updateRole = useUpdateUserRole();

  const handleInvite = () => {
    if (!inviteEmail || !inviteName) {
      toast.error(t("schoolAdmin.users.fillRequired", "Name and email are required"));
      return;
    }

    invite.mutate(
      { email: inviteEmail, name: inviteName, role: inviteRole },
      {
        onSuccess: () => {
          toast.success(t("schoolAdmin.users.invited", "Staff member invited"));
          setInviteOpen(false);
          setInviteName("");
          setInviteEmail("");
        },
        onError: () => toast.error(t("schoolAdmin.users.inviteError", "Failed to invite")),
      }
    );
  };

  const handleRoleChange = (userId: string, newRole: string) => {
    updateRole.mutate(
      { userId, role: newRole },
      {
        onSuccess: () => toast.success(t("schoolAdmin.users.roleUpdated", "Role updated")),
        onError: () => toast.error(t("schoolAdmin.users.roleError", "Failed to update role")),
      }
    );
  };

  // Generate page numbers for pagination
  const getPageNumbers = () => {
    if (!data) return [];
    const totalPages = data.totalPages;
    const current = page;
    const pages: (number | string)[] = [];

    // Always show first, last, and pages around current
    for (let i = 1; i <= totalPages; i++) {
      if (
        i === 1 ||
        i === totalPages ||
        (i >= current - 1 && i <= current + 1)
      ) {
        pages.push(i);
      } else if (i === current - 2 || i === current + 2) {
        pages.push("...");
      }
    }

    // Remove duplicate dots
    return pages.filter((item, index) => {
      return item !== "..." || pages[index - 1] !== "...";
    });
  };

  if (isLoading && !data) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-[600px] w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="space-y-1">
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-gray-900">
          {t("schoolAdmin.users.title", "User Management")}
        </h1>
        <p className="text-lg text-gray-500 font-medium max-w-2xl">
          {t("schoolAdmin.users.subtitle", "Manage staff, counselors, and role assignments globally across your institution.")}
        </p>
      </motion.div>

      {/* Toolbar */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
        <div className="flex flex-wrap gap-4 items-center w-full sm:w-auto flex-1">
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder={t("schoolAdmin.users.searchPlaceholder", "Search by name or email...")}
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="pl-10 rounded-xl bg-gray-50 border-transparent focus:bg-white transition-all shadow-none"
            />
          </div>
          <Select value={roleFilter} onValueChange={(v) => { setRoleFilter(v === "all" ? "" : v); setPage(1); }}>
            <SelectTrigger className="w-[160px] rounded-xl bg-gray-50 border-transparent focus:bg-white shadow-none">
              <SelectValue placeholder={t("schoolAdmin.users.allRoles", "All Roles")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("schoolAdmin.users.allRoles", "All Roles")}</SelectItem>
              <SelectItem value="school_admin">{t("schoolAdmin.users.roleAdmin", "Admin")}</SelectItem>
              <SelectItem value="counselor">{t("schoolAdmin.users.roleCounselor", "Counselor")}</SelectItem>
              <SelectItem value="staff">{t("schoolAdmin.users.roleStaff", "Staff")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
          <DialogTrigger asChild>
            <Button className="w-full sm:w-auto bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-700 hover:to-cyan-700 text-white rounded-xl shadow-md hover:shadow-lg transition-all">
              <UserPlus className="h-4 w-4 mr-2" />{t("schoolAdmin.users.invite", "Invite Staff")}
            </Button>
          </DialogTrigger>
          <DialogContent className="rounded-2xl">
            <DialogHeader>
              <DialogTitle className="text-xl">{t("schoolAdmin.users.inviteTitle", "Invite Staff Member")}</DialogTitle>
              <DialogDescription>{t("schoolAdmin.users.inviteDesc", "Send an invitation email to a new staff member to join your institution.")}</DialogDescription>
            </DialogHeader>
            <div className="space-y-5 py-4">
              <div className="space-y-2">
                <Label className="text-gray-700">{t("schoolAdmin.users.name", "Full Name")}</Label>
                <Input className="rounded-xl" placeholder="E.g. Jane Doe" value={inviteName} onChange={(e) => setInviteName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label className="text-gray-700">{t("schoolAdmin.users.email", "Email Address")}</Label>
                <Input className="rounded-xl" placeholder="johndoe@school.edu" type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label className="text-gray-700">{t("schoolAdmin.users.role", "Assign Role")}</Label>
                <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as "counselor" | "staff")}>
                  <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="counselor">{t("schoolAdmin.users.roleCounselor", "Counselor")}</SelectItem>
                    <SelectItem value="staff">{t("schoolAdmin.users.roleStaff", "Staff")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" className="rounded-xl" onClick={() => setInviteOpen(false)}>{t("common.cancel", "Cancel")}</Button>
              <Button onClick={handleInvite} disabled={invite.isPending} className="rounded-xl bg-teal-600 hover:bg-teal-700 text-white">
                {invite.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("schoolAdmin.users.sendInvite", "Send Invitation")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </motion.div>

      {/* Users Table */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
        <Card className="border-0 shadow-lg rounded-2xl overflow-hidden bg-white/50 backdrop-blur-xl">
          <CardHeader className="bg-gradient-to-r from-teal-50/50 to-cyan-50/50 border-b border-gray-100 pb-4">
            <CardTitle className="flex items-center gap-2 text-xl">
              <div className="p-2 bg-white rounded-lg shadow-sm">
                <Users className="h-5 w-5 text-teal-600" />
              </div>
              {t("schoolAdmin.users.listTitle", "Directory")}
              {data && (
                <Badge variant="secondary" className="ml-2 bg-white text-teal-700 shadow-sm border-teal-100">
                  {data.total} {t("common.total", "Total")}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-gray-50/50">
                  <TableRow className="hover:bg-transparent border-gray-100">
                    <TableHead className="font-semibold text-gray-700 w-[250px]">{t("schoolAdmin.users.name", "User")}</TableHead>
                    <TableHead className="font-semibold text-gray-700">{t("schoolAdmin.users.role", "Role")}</TableHead>
                    <TableHead className="font-semibold text-gray-700">{t("schoolAdmin.users.status", "Status")}</TableHead>
                    <TableHead className="font-semibold text-gray-700 text-center">{t("schoolAdmin.users.students", "Students Assigned")}</TableHead>
                    <TableHead className="font-semibold text-gray-700 text-right pr-6">{t("schoolAdmin.users.actions", "Manage Role")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <AnimatePresence mode="popLayout">
                    {data?.data?.map((user) => (
                      <motion.tr
                        key={user.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="group hover:bg-teal-50/30 transition-colors border-gray-50"
                      >
                        <TableCell className="py-4">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 min-w-10 rounded-full bg-gradient-to-br from-teal-100 to-cyan-100 text-teal-700 flex items-center justify-center font-bold shadow-inner">
                              {getInitials(user.name)}
                            </div>
                            <div className="flex flex-col">
                              <span className="font-semibold text-gray-900 line-clamp-1">{user.name}</span>
                              <span className="text-sm text-gray-500 line-clamp-1">{user.email}</span>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`capitalize shadow-sm ${roleColors[user.role] || "bg-gray-100 text-gray-700"}`}>
                            <Shield className="h-3 w-3 mr-1.5 opacity-70" />
                            {user.role.replace("_", " ")}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {user.status === 'active' ? (
                            <div className="flex items-center text-sm font-medium text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full w-fit">
                              <CheckCircle2 className="w-4 h-4 mr-1.5" />
                              Active
                            </div>
                          ) : (
                            <div className="flex items-center text-sm font-medium text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full w-fit capitalize">
                              <Loader2 className="w-4 h-4 mr-1.5" />
                              {user.status}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="inline-flex items-center justify-center h-8 w-8 rounded-full bg-gray-50 text-gray-700 font-medium border border-gray-100">
                            {user.assignedStudentCount ?? "0"}
                          </span>
                        </TableCell>
                        <TableCell className="text-right pr-6">
                          <div className="flex justify-end">
                            <Select
                              value={user.role}
                              onValueChange={(v) => handleRoleChange(user.id, v)}
                            >
                              <SelectTrigger className="w-[140px] h-9 rounded-lg bg-gray-50/50 border-gray-200 group-hover:bg-white transition-colors focus:ring-teal-500">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="school_admin">
                                  <div className="flex items-center"><Shield className="w-4 h-4 mr-2 text-purple-500" />Admin</div>
                                </SelectItem>
                                <SelectItem value="counselor">
                                  <div className="flex items-center"><Shield className="w-4 h-4 mr-2 text-teal-500" />Counselor</div>
                                </SelectItem>
                                <SelectItem value="staff">
                                  <div className="flex items-center"><Shield className="w-4 h-4 mr-2 text-blue-500" />Staff</div>
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </TableCell>
                      </motion.tr>
                    ))}
                  </AnimatePresence>

                  {(!data?.data || data.data.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={5} className="h-64 text-center">
                        <div className="flex flex-col items-center justify-center space-y-3 text-gray-400">
                          <div className="p-4 bg-gray-50 rounded-full">
                            <Users className="h-8 w-8 text-gray-400" />
                          </div>
                          <p className="text-lg font-medium text-gray-900">{t("schoolAdmin.users.empty", "No users found")}</p>
                          <p className="text-sm max-w-sm">{t("schoolAdmin.users.emptyDesc", "Try adjusting your search or role filters to find what you're looking for.")}</p>
                          <Button variant="outline" className="mt-4 rounded-xl" onClick={() => { setSearch(''); setRoleFilter(''); }}>
                            Clear Filters
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>

          {/* Pagination */}
          {data && data.totalPages > 1 && (
            <CardFooter className="flex items-center justify-between border-t border-gray-100 bg-gray-50/30 px-6 py-4">
              <div className="text-sm text-gray-500 flex-1 hidden sm:block">
                Showing <span className="font-medium text-gray-900">{((page - 1) * 10) + (data.data.length > 0 ? 1 : 0)}</span> to <span className="font-medium text-gray-900">{Math.min(page * 10, data.total)}</span> of <span className="font-medium text-gray-900">{data.total}</span> entries
              </div>
              <div className="flex items-center gap-1 w-full justify-center sm:w-auto sm:justify-end">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 rounded-lg"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>

                {getPageNumbers().map((pageNum, idx) => (
                  pageNum === "..." ? (
                    <span key={`dots-${idx}`} className="px-2 text-gray-400">...</span>
                  ) : (
                    <Button
                      key={`page-${pageNum}`}
                      variant={page === pageNum ? "default" : "outline"}
                      size="sm"
                      className={`h-8 w-8 rounded-lg ${page === pageNum ? 'bg-teal-600 hover:bg-teal-700 shadow-sm' : ''}`}
                      onClick={() => setPage(pageNum as number)}
                    >
                      {pageNum}
                    </Button>
                  )
                ))}

                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 rounded-lg"
                  disabled={page >= data.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </CardFooter>
          )}
        </Card>
      </motion.div>
    </div>
  );
}
