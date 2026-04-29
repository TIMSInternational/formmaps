"use client";

import { useState, useEffect } from "react";
import { SchoolInviteForm } from "@/components/admin/SchoolInviteForm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Plus,
  School as SchoolIcon,
  Users,
  UserCheck,
  Clock,
  Search,
  MoreHorizontal,
  Pencil,
  Mail,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { School, SchoolStats } from "@/types/school";
import {
  getSchools,
  getSchoolStats,
  resendSchoolInvite,
  updateSchool,
} from "@/services/schoolService";
import { SchoolEditForm } from "@/components/admin/SchoolEditForm";
import { formatDate, cn } from "@/lib/utils";
import { toast } from "sonner";

export default function SchoolsPage() {
  const { t } = useTranslation();
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [selectedSchool, setSelectedSchool] = useState<School | null>(null);
  const [stats, setStats] = useState<SchoolStats>({
    totalSchools: 0,
    activeSchools: 0,
    pendingInvites: 0,
    totalStudents: 0,
  });
  const [schools, setSchools] = useState<School[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const limit = 10;

  const handleInviteSuccess = (newSchool: School) => {
    setSchools((prev) => [newSchool, ...prev]);
    setStats((prev) => ({
      ...prev,
      totalSchools: prev.totalSchools + 1,
      pendingInvites: prev.pendingInvites + 1,
    }));
    setIsInviteOpen(false);
    setPage(1);
  };

  const handleResendInvite = async (school: School) => {
    try {
      await resendSchoolInvite(school.id);
      toast.success(
        t("admin.schools.resendSuccess", {
          name: school.name,
          defaultValue: `Invitation resent to ${school.name}`,
        }),
      );
    } catch (error) {
      toast.error(
        t("admin.schools.resendError", "Failed to resend invitation"),
      );
    }
  };

  const handleEditSchool = (school: School) => {
    setSelectedSchool(school);
    setIsEditOpen(true);
  };

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [statsData, schoolsData] = await Promise.all([
        getSchoolStats(),
        getSchools({ search, page, limit }),
      ]);
      setStats(statsData);
      setSchools(schoolsData.data);
      setTotalPages(schoolsData.totalPages);
    } catch (error) {
      // error handled silently
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [search, page]);

  useEffect(() => {
    setPage(1);
  }, [search]);

  const statsData = [
    {
      label: t("admin.schools.totalSchools", "Total Schools"),
      value: isLoading ? "..." : stats.totalSchools.toString(),
      icon: SchoolIcon,
      color: "text-blue-600",
      bg: "bg-blue-50/50",
      border: "border-blue-100",
    },
    {
      label: t("admin.schools.active", "Active Schools"),
      value: isLoading ? "..." : stats.activeSchools.toString(),
      icon: UserCheck,
      color: "text-green-600",
      bg: "bg-green-50/50",
      border: "border-green-100",
    },
    {
      label: t("admin.schools.pending", "Pending Invites"),
      value: isLoading ? "..." : stats.pendingInvites.toString(),
      icon: Clock,
      color: "text-orange-600",
      bg: "bg-orange-50/50",
      border: "border-orange-100",
    },
    {
      label: t("admin.schools.totalStudents", "Total Students"),
      value: isLoading ? "..." : stats.totalStudents.toString(),
      icon: Users,
      color: "text-purple-600",
      bg: "bg-purple-50/50",
      border: "border-purple-100",
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50/50 p-6 md:p-8 space-y-10 font-sans">
      {/* Header Section */}
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="space-y-1">
            <h1 className="text-4xl font-bold tracking-tight text-gray-900">
              {t("admin.schools.title", "Schools Management")}
            </h1>
            <p className="text-lg text-gray-500 font-medium">
              {t(
                "admin.schools.subtitle",
                "Manage school partnerships and student access.",
              )}
            </p>
          </div>

          <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
            <DialogTrigger asChild>
              <Button className="bg-gray-900 text-white hover:bg-black shadow-xl hover:shadow-2xl transition-all duration-300 rounded-full px-6 h-12 text-sm font-semibold tracking-wide">
                <Plus className="mr-2 h-4 w-4" />
                {t("admin.schools.inviteButton", "Invite School")}
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-xl rounded-2xl p-0 overflow-hidden gap-0">
              <DialogHeader className="p-6 bg-gray-50/50 border-b border-gray-100">
                <DialogTitle className="text-xl flex items-center gap-2">
                  <div className="p-2 bg-white rounded-lg border border-gray-100 shadow-sm">
                    <SchoolIcon className="h-5 w-5 text-gray-900" />
                  </div>
                  {t("admin.schools.inviteTitle", "Invite School")}
                </DialogTitle>
                <DialogDescription className="text-base pt-1">
                  {t(
                    "admin.schools.inviteDescription",
                    "Send an invitation to a school administrator.",
                  )}
                </DialogDescription>
              </DialogHeader>
              <div className="p-6">
                <SchoolInviteForm onSuccess={handleInviteSuccess} />
              </div>
            </DialogContent>
          </Dialog>

          {/* Edit School Dialog */}
          <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
            <DialogContent className="sm:max-w-xl rounded-2xl p-0 overflow-hidden gap-0">
              <DialogHeader className="p-6 bg-gray-50/50 border-b border-gray-100">
                <DialogTitle className="text-xl flex items-center gap-2">
                  <div className="p-2 bg-white rounded-lg border border-gray-100 shadow-sm">
                    <Pencil className="h-5 w-5 text-gray-900" />
                  </div>
                  {t("admin.schools.editTitle", "Edit School")}
                </DialogTitle>
                <DialogDescription className="text-base pt-1">
                  {t("admin.schools.editDescription", "Update school details.")}
                </DialogDescription>
              </DialogHeader>
              <div className="p-6">
                {selectedSchool && (
                  <SchoolEditForm
                    school={selectedSchool}
                    onSuccess={(updatedSchool) => {
                      setSchools((prev) =>
                        prev.map((s) =>
                          s.id === updatedSchool.id ? updatedSchool : s,
                        ),
                      );
                      setIsEditOpen(false);
                      setSelectedSchool(null);
                    }}
                  />
                )}
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Stats Grid — dashboard card style */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {statsData.map((stat, index) => (
            <div key={index} style={{ borderRadius: 8, border: "1px solid #2a2a2a", background: "#1e1e1e", padding: 16, transition: "border-color 0.15s" }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#333"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#2a2a2a"; }}>
              <div style={{ width: 32, height: 32, borderRadius: 6, background: "#2a2a2a", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
                <stat.icon style={{ width: 16, height: 16, color: "#818181" }} />
              </div>
              <div style={{ fontSize: 24, fontWeight: 600, color: "#ebebeb", letterSpacing: "-0.02em" }}>{stat.value}</div>
              <div style={{ fontSize: 12, color: "#818181", marginTop: 4 }}>{stat.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Search & Filter */}
        <div className="flex items-center gap-4 bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search schools..."
              className="pl-10"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50/50">
                <TableHead>Name</TableHead>
                <TableHead>Admin</TableHead>
                <TableHead>Students</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Contract End</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center">
                    <div className="flex justify-center items-center gap-2">
                      <Clock className="animate-spin h-5 w-5 text-gray-400" />
                      <span className="text-gray-500">Loading schools...</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : schools.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="h-24 text-center text-gray-500"
                  >
                    No schools found. Invite one to get started!
                  </TableCell>
                </TableRow>
              ) : (
                schools.map((school) => (
                  <TableRow
                    key={school.id}
                    className="hover:bg-gray-50/50 transition-colors"
                  >
                    <TableCell className="font-medium">{school.name}</TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span>{school.adminEmail}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-full bg-gray-100 rounded-full h-2 max-w-[100px]">
                          <div
                            className="bg-blue-600 h-2 rounded-full"
                            style={{
                              width: `${Math.min(((school.studentCount || 0) / school.maxStudents) * 100, 100)}%`,
                            }}
                          />
                        </div>
                        <span className="text-xs text-gray-500">
                          {school.studentCount || 0} / {school.maxStudents}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "px-2.5 py-0.5 rounded-full text-xs font-medium",
                          school.status === "active"
                            ? "bg-green-100 text-green-700"
                            : school.status === "invited"
                              ? "bg-blue-100 text-blue-700"
                              : "bg-gray-100 text-gray-700",
                        )}
                      >
                        {school.status.charAt(0).toUpperCase() +
                          school.status.slice(1)}
                      </span>
                    </TableCell>
                    <TableCell>
                      {school.contractEnd
                        ? formatDate(school.contractEnd)
                        : "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => handleEditSchool(school)}
                          >
                            <Pencil className="mr-2 h-4 w-4" />
                            {t("common.edit", "Edit")}
                          </DropdownMenuItem>
                          {(school.status === "invited" ||
                            school.status === "pending") && (
                            <DropdownMenuItem
                              onClick={() => handleResendInvite(school)}
                            >
                              <Mail className="mr-2 h-4 w-4" />
                              {t("admin.schools.resendInvite", "Resend Invite")}
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination Controls */}
        <div className="flex items-center justify-end space-x-2 p-4 border-t border-gray-100 bg-white rounded-b-xl -mt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1 || isLoading}
          >
            {t("common.previous", "Previous")}
          </Button>
          <div className="text-sm text-gray-500">
            Page {page} of {totalPages || 1}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= (totalPages || 1) || isLoading}
          >
            {t("common.next", "Next")}
          </Button>
        </div>
      </div>
    </div>
  );
}
