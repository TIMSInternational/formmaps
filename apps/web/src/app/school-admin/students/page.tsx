"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  UserPlus,
  Search,
  MoreHorizontal,
  Mail,
  Trash2,
  Eye,
  RefreshCw,
  Users,
  Clock,
  UserCheck,
  Filter,
  Beaker,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useStudents, useResendStudentInvite, useRemoveStudent } from "@/hooks/useSchoolAdmin";
import { StudentInviteForm } from "@/components/school-admin/StudentInviteForm";
import { StudentStatus } from "@/types/student";
import { TableRowsSkeleton } from "@/components/skeletons/TableSkeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export default function StudentsPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteName, setDeleteName] = useState("");
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [useMockData, setUseMockData] = useState(false);
  const limit = 10;

  const { data: students, isLoading, refetch } = useStudents({
    page,
    limit,
    search: search || undefined,
    status: statusFilter !== "all" ? statusFilter : undefined,
    sortBy: "createdAt",
    sortOrder: "desc",
  });

  const resendInvite = useResendStudentInvite();
  const removeStudent = useRemoveStudent();

  const handleResendInvite = async (studentId: string, studentName: string) => {
    try {
      await resendInvite.mutateAsync(studentId);
      toast.success(t("schoolAdmin.students.resendSuccess", "Invitation resent successfully"));
    } catch (error) {
      toast.error(t("schoolAdmin.students.resendError", "Failed to resend invitation"));
    }
  };

  const confirmRemoveStudent = (studentId: string, studentName: string) => {
    setDeleteId(studentId);
    setDeleteName(studentName);
    setIsDeleteOpen(true);
  };

  const handleRemoveStudent = async () => {
    if (!deleteId) return;
    try {
      await removeStudent.mutateAsync(deleteId);
      toast.success(t("schoolAdmin.students.removeSuccess", "Student removed successfully"));
      setIsDeleteOpen(false);
      if (students?.data.length === 1 && page > 1) {
        setPage(page - 1);
      } else {
        refetch();
      }
    } catch (error) {
      toast.error(t("schoolAdmin.students.removeError", "Failed to remove student"));
    }
  };

  const handleViewDetails = (studentId: string) => {
    router.push(`/school-admin/students/${studentId}`);
  };

  const getStatusBadge = (status: StudentStatus) => {
    const styles = {
      active: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
      pending: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
      accepted: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
      inactive: { bg: "bg-gray-50", text: "text-gray-700", border: "border-gray-200" },
    };
    return styles[status] || styles.inactive;
  };

  const getInitials = (name: string) => {
    if (!name) return "ST";
    return name.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase();
  };

  const normalizePercent = (value: unknown) => {
    const numericValue = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(numericValue)) return 0;
    return Math.min(100, Math.max(0, numericValue));
  };

  // Pagination helper
  const getPageNumbers = () => {
    if (!students) return [];
    const totalPages = students.totalPages;
    const current = page;
    const pages: (number | string)[] = [];

    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= current - 1 && i <= current + 1)) {
        pages.push(i);
      } else if (i === current - 2 || i === current + 2) {
        pages.push("...");
      }
    }

    return pages.filter((item, index) => item !== "..." || pages[index - 1] !== "...");
  };

  const stats = [
    { label: t("schoolAdmin.stats.totalStudents", "Total Students"), value: students?.total || 0, icon: Users, color: "text-indigo-600", bg: "bg-indigo-50", gradient: "from-indigo-500 to-violet-600" },
    { label: t("schoolAdmin.students.status.pending", "Pending Invites"), value: students?.data?.filter((s: any) => s.status === 'pending').length || 0, icon: Clock, color: "text-amber-600", bg: "bg-amber-50", gradient: "from-amber-400 to-orange-500" },
    { label: t("schoolAdmin.students.status.active", "Active Students"), value: students?.data?.filter((s: any) => s.status === 'active').length || 0, icon: UserCheck, color: "text-emerald-600", bg: "bg-emerald-50", gradient: "from-emerald-400 to-teal-500" },
  ];

  return (
    <div className="min-h-screen space-y-8 max-w-7xl mx-auto pb-12">
      <div className="space-y-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6"
        >
          <div className="space-y-1">
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-gray-900 leading-tight">
              {t("schoolAdmin.students.title", "Student Roster")}
            </h1>
            <p className="text-lg text-gray-500 font-medium max-w-2xl leading-relaxed">
              {t("schoolAdmin.students.subtitle", "Manage all students, track their progress, and send invitations.")}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            {process.env.NODE_ENV === "development" && (
              <div className="flex items-center gap-3 bg-white/60 backdrop-blur-md pl-4 pr-5 py-2.5 rounded-full border border-gray-200/50 shadow-sm shrink-0 hover:shadow-md transition-all duration-300">
                <div className={cn(
                  "flex items-center justify-center p-2 rounded-full transition-colors duration-300",
                  useMockData ? "bg-amber-100 text-amber-600" : "bg-indigo-100 text-indigo-600"
                )}>
                  <Beaker className="w-4 h-4" />
                </div>
                <div className="flex flex-col justify-center">
                  <Label htmlFor="mock-data-toggle" className="font-bold text-[11px] uppercase tracking-wider text-gray-800 cursor-pointer">
                    {useMockData ? "Preview Mode" : "Live Mode"}
                  </Label>
                  <span className="text-[10px] text-gray-500 font-medium leading-none mt-0.5">
                    {useMockData ? "Using mock data" : "Using real data"}
                  </span>
                </div>
                <div className="ml-2 pl-3 border-l h-6 flex items-center">
                  <Switch
                    id="mock-data-toggle"
                    checked={useMockData}
                    onCheckedChange={setUseMockData}
                    className="data-[state=checked]:bg-amber-500"
                  />
                </div>
              </div>
            )}
            <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
              <DialogTrigger asChild>
                <Button className="bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 transition-all duration-300 rounded-xl px-6 h-12 text-sm font-bold tracking-wide border-0">
                  <UserPlus className="mr-2 h-4 w-4" />
                  {t("schoolAdmin.students.inviteButton", "Invite Student")}
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-xl rounded-2xl p-0 overflow-hidden gap-0 border border-gray-200">
                <DialogHeader className="p-6 bg-gradient-to-r from-indigo-50 to-violet-50 border-b border-indigo-100/50">
                  <DialogTitle className="text-xl flex items-center gap-2 font-bold text-gray-900">
                    <div className="p-2 bg-white rounded-xl shadow-sm border border-indigo-100">
                      <UserPlus className="h-5 w-5 text-indigo-600" />
                    </div>
                    {t("schoolAdmin.students.inviteTitle", "Invite Students")}
                  </DialogTitle>
                  <DialogDescription className="text-base text-gray-600 pt-1 font-medium">
                    {t("schoolAdmin.students.inviteDescription", "Send invitations so students can join your school platform.")}
                  </DialogDescription>
                </DialogHeader>
                <div className="p-6 bg-white">
                  <StudentInviteForm onSuccess={() => {
                    setIsInviteOpen(false);
                    refetch();
                  }} />
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </motion.div>

        {/* Quick Stats */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-6"
        >
          {stats.map((stat, i) => (
            <div key={stat.label} className="relative overflow-hidden bg-white/60 backdrop-blur-xl border border-gray-200/50 shadow-lg shadow-gray-200/20 rounded-3xl p-6 group hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1">
              <div className={`absolute -right-6 -top-6 w-32 h-32 rounded-full opacity-10 bg-gradient-to-br ${stat.gradient} group-hover:scale-150 transition-transform duration-700`} />
              <div className="relative z-10 flex items-center gap-5">
                <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center shadow-sm border border-white shrink-0", stat.bg)}>
                  <stat.icon className={cn("w-7 h-7", stat.color)} />
                </div>
                <div>
                  <p className="text-4xl font-black tracking-tight text-gray-900">{stat.value}</p>
                  <p className="text-sm font-bold text-gray-500 uppercase tracking-wider mt-1">{stat.label}</p>
                </div>
              </div>
            </div>
          ))}
        </motion.div>

        {/* Search & Filters */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="sticky top-4 z-20 bg-white/80 backdrop-blur-xl border border-gray-200/50 shadow-sm rounded-2xl p-3 flex flex-col md:flex-row justify-between items-center gap-4"
        >
          <div className="flex items-center gap-2 w-full md:w-auto">
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
              <SelectTrigger className="w-full md:w-[200px] h-11 bg-white border-gray-200 focus:ring-4 focus:ring-indigo-500/10 rounded-xl transition-all font-semibold text-gray-700 shadow-sm">
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-gray-400" />
                  <SelectValue placeholder="Filter by status" />
                </div>
              </SelectTrigger>
              <SelectContent className="rounded-xl border-gray-200">
                <SelectItem value="all">{t("schoolAdmin.students.allStatuses", "All Statuses")}</SelectItem>
                <SelectItem value="active">{t("schoolAdmin.students.status.active", "Active")}</SelectItem>
                <SelectItem value="pending">{t("schoolAdmin.students.status.pending", "Pending")}</SelectItem>
                <SelectItem value="accepted">{t("schoolAdmin.students.status.accepted", "Accepted")}</SelectItem>
                <SelectItem value="inactive">{t("schoolAdmin.students.status.inactive", "Inactive")}</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" className="h-11 w-11 rounded-xl border-gray-200 bg-white shadow-sm hover:bg-gray-50 shrink-0" onClick={() => refetch()} title="Refresh Data">
              <RefreshCw className="h-4 w-4 text-gray-500" />
            </Button>
          </div>

          <div className="relative w-full md:w-96 group">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 group-focus-within:text-indigo-500 transition-colors" />
            <Input
              placeholder={t("schoolAdmin.students.searchPlaceholder", "Search students by name or email...")}
              className="pl-11 h-11 bg-white border-gray-200 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 rounded-xl transition-all shadow-sm"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
        </motion.div>

        {/* Premium Table Container */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white/80 backdrop-blur-xl border border-gray-200/50 rounded-3xl shadow-xl overflow-hidden flex flex-col min-h-[600px]"
        >
          <div className="overflow-x-auto flex-1">
            <Table>
              <TableHeader className="bg-transparent border-b border-gray-100">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="py-5 pl-6 font-semibold text-gray-700">{t("schoolAdmin.students.table.student", "Student Profile")}</TableHead>
                  <TableHead className="font-semibold text-gray-700 w-32">{t("schoolAdmin.students.table.status", "Status")}</TableHead>
                  <TableHead className="font-semibold text-gray-700 w-48">{t("schoolAdmin.students.table.progress", "Progress")}</TableHead>
                  <TableHead className="font-semibold text-gray-700 w-32">{t("schoolAdmin.students.table.avgScore", "Avg. Score")}</TableHead>
                  <TableHead className="font-semibold text-gray-700 w-32">{t("schoolAdmin.students.table.requests", "Requests")}</TableHead>
                  <TableHead className="font-semibold text-gray-700 w-32">{t("schoolAdmin.students.table.lastActive", "Last Active")}</TableHead>
                  <TableHead className="pr-6 text-right font-semibold text-gray-700 w-24">{t("schoolAdmin.students.table.actions", "Actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRowsSkeleton columnCount={7} rowCount={5} showActions />
                ) : !students?.data || students.data.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-64 text-center border-b-0">
                      <div className="flex flex-col items-center justify-center space-y-3">
                        <div className="p-4 bg-gray-50 rounded-full mb-2 border border-gray-100 shadow-inner">
                          <Users className="w-10 h-10 text-gray-300" />
                        </div>
                        <p className="text-xl font-bold text-gray-900">{t("schoolAdmin.students.noStudents", "No students found")}</p>
                        <p className="text-gray-500 font-medium max-w-sm mx-auto">
                          {search || statusFilter !== "all"
                            ? "Try adjusting your search criteria or status filters."
                            : t("schoolAdmin.students.noStudentsDesc", "Start by inviting students to join your school platform.")}
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  students.data.map((student: any) => {
                    const statusStyles = getStatusBadge(student.status as StudentStatus);
                    const progressValue = normalizePercent(student.progress);
                    const averageScoreValue = normalizePercent(student.averageScore);

                    return (
                      <TableRow key={student.id} className="group hover:bg-indigo-50/30 transition-colors border-b border-gray-50 cursor-default">
                        <TableCell className="pl-6 py-4">
                          <div className="flex items-center gap-4">
                            <Avatar className="h-10 w-10 ring-2 ring-white shadow-sm shrink-0">
                              <AvatarFallback className="bg-gradient-to-br from-indigo-100 to-violet-100 text-indigo-700 font-bold border border-indigo-200">
                                {getInitials(student.name)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <p className="font-bold text-gray-900 text-base truncate">{student.name}</p>
                              <p className="text-xs text-gray-500 font-medium truncate">{student.email}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={`${statusStyles.bg} ${statusStyles.text} ${statusStyles.border} shadow-none font-bold capitalize px-2.5 py-0.5 border`}>
                            {String(t(`schoolAdmin.students.status.${student.status}`, student.status.charAt(0).toUpperCase() + student.status.slice(1)))}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="flex-1 max-w-[120px] bg-gray-100 rounded-full h-1.5 overflow-hidden">
                              <div
                                className="bg-indigo-500 h-full rounded-full transition-all duration-500 ease-out"
                                style={{ width: `${progressValue}%` }}
                              />
                            </div>
                            <span className="text-xs font-bold text-gray-600">{Math.round(progressValue)}%</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="bg-gray-100 text-gray-700 font-bold border-none shadow-none">
                            {averageScoreValue.toFixed(1)}%
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {student.pendingRequests && student.pendingRequests > 0 ? (
                            <div className="flex items-center">
                              <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 shadow-sm font-bold flex items-center gap-1.5 w-max">
                                <span className="relative flex h-2 w-2">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                                  <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                                </span>
                                {student.pendingRequests} New
                              </Badge>
                            </div>
                          ) : (
                            <span className="text-gray-400 text-sm font-medium pl-4">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-gray-600 font-medium">
                            {student.lastActive ? new Date(student.lastActive).toLocaleDateString() : <span className="text-gray-400 italic">{t("schoolAdmin.students.neverActive", "Never")}</span>}
                          </span>
                        </TableCell>
                        <TableCell className="text-right pr-6">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 focus-visible:ring-1 focus-visible:ring-indigo-500">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="rounded-xl border border-gray-200 shadow-xl overflow-hidden w-48">
                              <DropdownMenuItem onClick={() => handleViewDetails(student.id)} className="cursor-pointer py-2 focus:bg-indigo-50 text-gray-700 font-medium">
                                <Eye className="mr-2 h-4 w-4 text-indigo-500" />
                                {t("schoolAdmin.students.actions.viewDetails", "Examine Profile")}
                              </DropdownMenuItem>
                              {student.status === 'pending' && (
                                <DropdownMenuItem onClick={() => handleResendInvite(student.id, student.name)} className="cursor-pointer py-2 focus:bg-amber-50 text-gray-700 font-medium">
                                  <Mail className="mr-2 h-4 w-4 text-amber-500" />
                                  {t("schoolAdmin.students.actions.resendInvite", "Resend Invite")}
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem
                                className="text-red-600 focus:text-red-700 focus:bg-red-50 cursor-pointer py-2 font-medium"
                                onSelect={(e) => {
                                  e.preventDefault();
                                  confirmRemoveStudent(student.id, student.name);
                                }}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                {t("schoolAdmin.students.actions.removeStudent", "Expel Student")}
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
          </div>

          {/* Premium Pagination Footer */}
          {students && students.total > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between border-t border-gray-100 bg-gray-50/50 px-6 py-4 mt-auto gap-4">
              <div className="text-sm text-gray-500 text-center sm:text-left">
                Displaying <span className="font-bold text-gray-900">{((page - 1) * limit) + (students.data.length > 0 ? 1 : 0)}</span> – <span className="font-bold text-gray-900">{Math.min(page * limit, students.total)}</span> of <span className="font-bold text-gray-900">{students.total}</span> students
              </div>
              <div className="flex items-center gap-1.5 w-full justify-center sm:w-auto sm:justify-end">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 rounded-xl border-gray-200 bg-white hover:bg-gray-50 shadow-sm"
                  disabled={page <= 1 || isLoading}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="h-4 w-4 text-gray-600" />
                </Button>

                {getPageNumbers().map((pageNum, idx) => (
                  pageNum === "..." ? (
                    <span key={`dots-${idx}`} className="px-3 text-gray-400 font-medium">...</span>
                  ) : (
                    <Button
                      key={`page-${pageNum}`}
                      variant={page === pageNum ? "default" : "outline"}
                      size="sm"
                      className={`h-9 w-9 rounded-xl font-bold shadow-sm ${page === pageNum ? 'bg-indigo-600 hover:bg-indigo-700 text-white border-transparent' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`}
                      onClick={() => setPage(pageNum as number)}
                      disabled={isLoading}
                    >
                      {pageNum}
                    </Button>
                  )
                ))}

                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 rounded-xl border-gray-200 bg-white hover:bg-gray-50 shadow-sm"
                  disabled={page >= students.totalPages || isLoading}
                  onClick={() => setPage((p) => Math.min(students.totalPages, p + 1))}
                >
                  <ChevronRight className="h-4 w-4 text-gray-600" />
                </Button>
              </div>
            </div>
          )}
        </motion.div>

        {/* Delete Modal */}
        <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
          <DialogContent className="sm:max-w-md rounded-2xl p-0 overflow-hidden border-red-100">
            <div className="p-6 bg-red-50 flex items-start gap-4 border-b border-red-100">
              <div className="p-3 bg-white rounded-full shadow-sm">
                <Trash2 className="h-6 w-6 text-red-500" />
              </div>
              <div>
                <DialogTitle className="text-xl font-bold text-red-900">{t("schoolAdmin.students.deleteTitle", "Expel Student")}</DialogTitle>
                <DialogDescription className="text-red-700/80 mt-1 font-medium">
                  {t("schoolAdmin.students.deleteWarning", "This action is permanent and cannot be reversed.")}
                </DialogDescription>
              </div>
            </div>
            <div className="p-6 bg-white space-y-4">
              <p className="text-gray-700">
                Are you absolutely sure you want to completely remove
                <span className="font-bold text-gray-900 mx-1">{deleteName}</span>
                from the institution? All of their records, courses, and data will be permanently wiped.
              </p>
            </div>
            <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
              <DialogClose asChild>
                <Button variant="outline" className="rounded-xl font-semibold border-gray-200 bg-white hover:bg-gray-100">{t("common.cancel", "Cancel")}</Button>
              </DialogClose>
              <Button variant="destructive" onClick={handleRemoveStudent} className="rounded-xl font-bold bg-red-600 hover:bg-red-700 shadow-sm shadow-red-500/20">
                {t("common.delete", "Yes, Expel Student")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
