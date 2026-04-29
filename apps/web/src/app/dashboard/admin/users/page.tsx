"use client";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useRouter } from "next/navigation";
import { useAdminAccess } from "@/hooks/useAdminAccess";
import { useAdminUsers } from "@/hooks/useAdminUsers";
import { createUser } from "@/services/adminUsersService";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  Search,
  Users,
  TrendingUp,
  MoreHorizontal,
  UserCheck,
  UserX,
  Mail,
  Filter,
  Plus,
  UserPlus,
  Loader2,
  Eye,
  Pencil,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { useAdminAnalytics } from "@/hooks/useAdminAnalytics";
import { useTelemetryAnalytics } from "@/hooks/useTelemetryAnalytics";
import { TableRowsSkeleton } from "@/components/skeletons/TableSkeleton";
import { DashboardSkeleton } from "@/components/skeletons/DashboardSkeleton";
import { Skeleton } from "@/components/ui/skeleton";

export default function AdminUsersPage() {
  const router = useRouter();
  const { isAdmin, loading: authLoading } = useAdminAccess();
  const { t } = useTranslation();

  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);

  // Add User Modal State
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newUser, setNewUser] = useState({
    name: "",
    email: "",
    password: "",
    role: "student",
  });

  const {
    data,
    isLoading: usersLoading,
    error,
    refetch,
  } = useAdminUsers({
    page,
    limit: 10, // Reduced from 20 to 10 for cleaner view
    search: searchTerm,
    role: roleFilter === "all" ? "" : roleFilter,
    status: statusFilter === "all" ? "" : statusFilter,
  });

  const { data: analyticsData, isLoading: analyticsLoading } = useAdminAnalytics("month");
  const { data: telemetryData, isLoading: telemetryLoading } = useTelemetryAnalytics("month");

  const statsLoading = analyticsLoading || telemetryLoading;

  const users = data?.items || [];
  const totalPages = data ? Math.ceil(data.total / data.limit) : 1;
  const loading = usersLoading;

  // Stats Configuration
  const statsCards = [
    {
      label: "Total Users",
      value: statsLoading ? <Skeleton className="h-9 w-24" /> : (analyticsData?.stats.totalUsers.toLocaleString() || "0"),
      growth: analyticsData?.stats.monthlyGrowth.users || 0,
      icon: Users,
      color: "text-blue-600",
      bg: "bg-blue-50",
      border: "border-blue-100",
      blobColor: "bg-blue-500"
    },
    {
      label: "Active Users (MAU)",
      value: statsLoading ? <Skeleton className="h-9 w-24" /> : (telemetryData?.metrics.mau.toLocaleString() || "0"),
      growth: telemetryData?.metrics.newUsers ? (telemetryData.metrics.newUsers / (telemetryData.metrics.mau || 1)) * 100 : 0, // Approx growth based on new users
      icon: UserCheck,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
      border: "border-emerald-100",
      blobColor: "bg-emerald-500"
    },
    {
      label: "New Signups",
      value: statsLoading ? <Skeleton className="h-9 w-24" /> : (telemetryData?.metrics.newUsers.toLocaleString() || "0"),
      growth: null, // No historical data readily available for this metric in summary
      icon: UserPlus,
      color: "text-violet-600",
      bg: "bg-violet-50",
      border: "border-violet-100",
      blobColor: "bg-violet-500"
    },
    {
      label: "Growth Rate",
      value: statsLoading ? <Skeleton className="h-9 w-24" /> : `+${analyticsData?.stats.growthRate || 0}%`,
      growth: analyticsData?.stats.growthRate,
      icon: TrendingUp,
      color: "text-amber-600",
      bg: "bg-amber-50",
      border: "border-amber-100",
      blobColor: "bg-amber-500"
    }
  ];

  // Handle Add User Submit
  const handleAddUser = async () => {
    if (!newUser.name || !newUser.email || !newUser.password) {
      toast.error(t('admin.users.fillRequired'));
      return;
    }

    setIsCreating(true);
    try {
      await createUser({
        name: newUser.name,
        email: newUser.email,
        password: newUser.password,
      });
      toast.success(t('admin.users.success'));
      setIsAddUserOpen(false);
      setNewUser({ name: "", email: "", password: "", role: "student" });
      refetch();
    } catch (error: any) {
      toast.error(error.message || t('admin.users.error'));
    } finally {
      setIsCreating(false);
    }
  };

  // Helper for unimplemented features
  const handleAction = (action: string) => {
    toast.info(`${action} - API endpoint required`);
  };

  // Handle admin access check
  useEffect(() => {
    if (!authLoading) {
      if (!isAdmin) {
        toast.error(t("admin.accessDenied"));
        router.push("/dashboard");
      }
    }
  }, [isAdmin, authLoading, router]);

  // Debounce search - reset page when search changes
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!authLoading && isAdmin) {
        setPage(1);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  if (authLoading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="min-h-screen bg-gray-50/50 p-6 md:p-8 font-sans text-gray-900">
      <div className="max-w-7xl mx-auto space-y-8">

        {/* Header & Actions */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="space-y-1">
            <h1 className="text-4xl font-bold tracking-tight text-gray-900">
              {t("admin.users.title")}
            </h1>
            <p className="text-lg text-gray-500 font-medium">
              {t("admin.users.subtitle")}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
            {/* Search */}
            <div className="relative w-full md:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder={t("admin.users.searchPlaceholder")}
                className="pl-9 h-10 bg-white border-gray-200 rounded-xl shadow-sm focus:ring-gray-900 focus:border-gray-900 transition-shadow"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            {/* Filters */}
            <div className="flex gap-3">
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger className="w-[130px] h-10 bg-white border-gray-200 rounded-xl shadow-sm text-gray-600 font-medium">
                  <SelectValue placeholder={t("admin.users.rolePlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("admin.users.roles.all")}</SelectItem>
                  <SelectItem value="student">{t("admin.users.roles.student")}</SelectItem>
                  <SelectItem value="coach">{t("admin.users.roles.coach")}</SelectItem>
                  <SelectItem value="admin">{t("admin.users.roles.admin")}</SelectItem>
                </SelectContent>
              </Select>

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[130px] h-10 bg-white border-gray-200 rounded-xl shadow-sm text-gray-600 font-medium">
                  <SelectValue placeholder={t("admin.users.statusPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("admin.users.status.all")}</SelectItem>
                  <SelectItem value="active">{t("admin.users.status.active")}</SelectItem>
                  <SelectItem value="inactive">{t("admin.users.status.inactive")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Add User Dialog */}
            <Dialog open={isAddUserOpen} onOpenChange={setIsAddUserOpen}>
              <DialogTrigger asChild>
                <Button className="h-10 rounded-xl bg-gray-900 text-white shadow-sm hover:bg-gray-800 transition-all hover:shadow-md">
                  <UserPlus className="mr-2 h-4 w-4" />
                  {t("admin.users.addUser")}
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[425px] rounded-2xl border-gray-100 shadow-2xl p-0 overflow-hidden">
                <div className="bg-gray-50/50 p-6 border-b border-gray-100 flex flex-col items-center text-center">
                  <div className="h-12 w-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mb-4 ring-4 ring-white shadow-sm">
                    <UserPlus className="h-6 w-6" />
                  </div>
                  <DialogTitle className="text-xl font-bold text-gray-900">{t('admin.users.dialogTitle')}</DialogTitle>
                  <DialogDescription className="text-gray-500 mt-1 max-w-[280px]">
                    {t('admin.users.dialogDescription')}
                  </DialogDescription>
                </div>

                <div className="p-6 space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name" className="text-sm font-semibold text-gray-700 ml-1">{t('admin.users.nameLabel')}</Label>
                    <Input
                      id="name"
                      placeholder={t('admin.users.namePlaceholder')}
                      value={newUser.name}
                      onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                      className="h-11 rounded-xl border-gray-200 focus:border-blue-500 focus:ring-blue-100 transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-sm font-semibold text-gray-700 ml-1">Email Address</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder={t('admin.users.emailPlaceholder')}
                      value={newUser.email}
                      onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                      className="h-11 rounded-xl border-gray-200 focus:border-blue-500 focus:ring-blue-100 transition-all"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="role" className="text-sm font-semibold text-gray-700 ml-1">Role</Label>
                      <Select
                        value={newUser.role}
                        onValueChange={(value) => setNewUser({ ...newUser, role: value })}
                      >
                        <SelectTrigger className="h-11 rounded-xl border-gray-200 focus:border-blue-500 focus:ring-blue-100 transition-all text-gray-600">
                          <SelectValue placeholder="Select role" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="student">Student</SelectItem>
                          <SelectItem value="coach">Coach</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="password" className="text-sm font-semibold text-gray-700 ml-1">{t('admin.users.passwordLabel')}</Label>
                      <Input
                        id="password"
                        type="password"
                        placeholder={t('admin.users.passwordPlaceholder')}
                        value={newUser.password}
                        onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                        className="h-11 rounded-xl border-gray-200 focus:border-blue-500 focus:ring-blue-100 transition-all"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-gray-400 px-1">
                    {t('admin.users.passwordHint')}
                  </p>
                </div>

                <DialogFooter className="bg-gray-50/50 p-6 border-t border-gray-100 gap-3 sm:gap-0">
                  <Button
                    variant="outline"
                    onClick={() => setIsAddUserOpen(false)}
                    className="rounded-xl h-11 border-gray-200 hover:bg-white hover:text-gray-900 text-gray-500 bg-white shadow-sm flex-1 sm:flex-none sm:mr-3"
                  >
                    {t('common.cancel')}
                  </Button>
                  <Button
                    onClick={handleAddUser}
                    disabled={isCreating}
                    className="rounded-xl h-11 bg-gray-900 hover:bg-gray-800 text-white shadow-md flex-1 sm:flex-none sm:min-w-[120px]"
                  >
                    {isCreating ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <UserPlus className="mr-2 h-4 w-4" />
                        {t('admin.users.createUser')}
                      </>
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Stats Grid — matching dashboard card design */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {statsCards.map((stat, index) => (
            <div
              key={index}
              style={{
                borderRadius: 8,
                border: "1px solid #2a2a2a",
                background: "#1e1e1e",
                padding: 16,
                transition: "border-color 0.15s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#333"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#2a2a2a"; }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                <div style={{ width: 32, height: 32, borderRadius: 6, background: "#2a2a2a", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <stat.icon style={{ width: 16, height: 16, color: "#818181" }} />
                </div>
                {stat.growth !== null && stat.growth !== undefined && (
                  <div style={{ display: "flex", alignItems: "center", gap: 2, fontSize: 11, fontWeight: 500, color: Number(stat.growth) >= 0 ? "#10b981" : "#ef4444" }}>
                    {Number(stat.growth) >= 0 ? "+" : ""}{Math.abs(Number(stat.growth)).toFixed(1)}%
                  </div>
                )}
              </div>
              <div style={{ fontSize: 24, fontWeight: 600, color: "#ebebeb", letterSpacing: "-0.02em" }}>{stat.value}</div>
              <div style={{ fontSize: 12, color: "#818181", marginTop: 4 }}>{stat.label}</div>
              {stat.growth !== null && (
                <div style={{ fontSize: 11, color: "#555", marginTop: 4 }}>from last month</div>
              )}
            </div>
          ))}
        </div>



        {/* Users Table Card */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition-all duration-300">
          <Table>
            <TableHeader className="bg-gray-50/50">
              <TableRow className="border-gray-50 hover:bg-gray-50/50">
                <TableHead className="py-4 font-semibold text-gray-600 pl-6">{t("admin.users.table.name")}</TableHead>
                <TableHead className="py-4 font-semibold text-gray-600">{t("admin.users.table.email")}</TableHead>
                <TableHead className="py-4 font-semibold text-gray-600">{t("admin.users.table.role")}</TableHead>
                <TableHead className="py-4 font-semibold text-gray-600">{t("admin.users.table.status")}</TableHead>
                <TableHead className="py-4 font-semibold text-gray-600">{t("admin.users.table.subscription")}</TableHead>
                <TableHead className="py-4 font-semibold text-gray-600">{t("admin.users.table.joined")}</TableHead>
                <TableHead className="py-4 font-semibold text-gray-600 text-right pr-6">
                  {t("admin.users.table.actions")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRowsSkeleton columnCount={7} rowCount={5} showActions />
              ) : users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-48 text-center text-gray-500">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <UserX className="h-8 w-8 text-gray-300" />
                      <p>{t("admin.users.noUsersFound")}</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                users.map((user) => (
                  <TableRow key={user.id} className="border-gray-50 hover:bg-gray-50/50 transition-colors">
                    <TableCell className="font-medium text-gray-900 pl-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-600">
                          {user.name.charAt(0).toUpperCase()}
                        </div>
                        {user.name}
                      </div>
                    </TableCell>
                    <TableCell className="text-gray-500 py-4">{user.email}</TableCell>
                    <TableCell className="py-4">
                      <Badge variant="outline" className="capitalize font-medium border-gray-200 text-gray-600 bg-gray-50/50">
                        {user.role}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-4">
                      <Badge
                        variant={user.status === "active" ? "default" : "secondary"}
                        className={`font-medium shadow-none border-0 ${user.status === "active"
                          ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                          }`}
                      >
                        {user.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-4">
                      {user.subscriptionStatus ? (
                        <Badge variant="outline" className="capitalize border-blue-100 text-blue-700 bg-blue-50/50">
                          {user.subscriptionStatus}
                        </Badge>
                      ) : (
                        <span className="text-gray-400 text-sm pl-2">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-gray-500 py-4">
                      {new Date(user.joinedDate).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right pr-6 py-4">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0 hover:bg-gray-100 rounded-full">
                            <span className="sr-only">{t('admin.users.openMenu')}</span>
                            <MoreHorizontal className="h-4 w-4 text-gray-400" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-[160px] rounded-xl border-gray-100 shadow-lg">
                          <DropdownMenuLabel className="text-xs text-gray-400 font-normal">
                            {t("admin.users.dropdown.actions")}
                          </DropdownMenuLabel>
                          <DropdownMenuItem onClick={() => handleAction("View Profile")} className="text-sm font-medium text-gray-700 cursor-pointer">
                            <Eye className="mr-2 h-3.5 w-3.5 text-gray-400" />
                            {t("admin.users.dropdown.viewProfile")}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleAction("Edit Details")} className="text-sm font-medium text-gray-700 cursor-pointer">
                            <Pencil className="mr-2 h-3.5 w-3.5 text-gray-400" />
                            {t("admin.users.dropdown.editDetails")}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator className="bg-gray-50" />
                          <DropdownMenuItem
                            onClick={() => {
                              navigator.clipboard.writeText(user.email);
                              toast.success(t("admin.users.emailCopied"));
                            }}
                            className="text-sm font-medium text-gray-700 cursor-pointer"
                          >
                            <Mail className="mr-2 h-3.5 w-3.5 text-gray-400" />
                            {t("admin.users.dropdown.copyEmail")}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleAction("Deactivate User")} className="text-red-600 focus:text-red-700 focus:bg-red-50 cursor-pointer font-medium">
                            <UserX className="mr-2 h-3.5 w-3.5" />
                            {t("admin.users.dropdown.deactivateUser")}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {/* Pagination inside Card */}
          <div className="flex items-center justify-between border-t border-gray-100 p-4 bg-gray-50/30">
            <p className="text-sm text-gray-500">
              Showing page <span className="font-semibold text-gray-900">{page}</span> of <span className="font-semibold text-gray-900">{totalPages || 1}</span>
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1 || loading}
                className="rounded-lg border-gray-200 hover:bg-white hover:text-gray-900 text-gray-500 h-8"
              >
                {t("common.previous")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages || loading}
                className="rounded-lg border-gray-200 hover:bg-white hover:text-gray-900 text-gray-500 h-8"
              >
                {t("common.next")}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
