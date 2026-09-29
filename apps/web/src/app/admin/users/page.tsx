"use client";

import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useRouter } from "next/navigation";
import { useAdminAccess } from "@/hooks/useAdminAccess";
import { apiRequest } from "@/lib/api/apiClient";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { useAdminUsers } from "@/hooks/useAdminUsers";
import { Input } from "@/components/ui/input";
import {
  Search,
  Users,
  TrendingUp,
  UserCheck,
  UserPlus,
} from "lucide-react";
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
import { DashboardSkeleton } from "@/components/skeletons/DashboardSkeleton";
import { Skeleton } from "@/components/ui/skeleton";
import { AddUserDialog } from "./_components/AddUserDialog";
import { InviteUserWizard } from "./_components/invite-wizard/InviteUserWizard";
import { UserDetailDialog } from "./_components/UserDetailDialog";
import { UsersTable, type UserRecord } from "./_components/UsersTable";
import { formatSignedPercent } from "./_components/userStatus";
import { resendUserInvite } from "@/services/adminUsersService";

export default function AdminUsersPage() {
  const router = useRouter();
  const { isAdmin, loading: authLoading } = useAdminAccess();
  const { t } = useTranslation();

  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [selectedUser, setSelectedUser] = useState<UserRecord | null>(null);

  const { data, isLoading: usersLoading, refetch } = useAdminUsers({
    page,
    limit: 10,
    search: searchTerm,
    role: roleFilter === "all" ? "" : roleFilter,
    status: statusFilter === "all" ? "" : statusFilter,
  });

  const { data: analyticsData, isLoading: analyticsLoading } = useAdminAnalytics("month");
  const { data: telemetryData, isLoading: telemetryLoading } = useTelemetryAnalytics("month");
  const statsLoading = analyticsLoading || telemetryLoading;

  const users = (data?.items || []) as UserRecord[];
  const totalPages = data ? Math.ceil(data.total / data.limit) : 1;
  const { confirm, ConfirmDialog } = useConfirmDialog();

  const statsCards = [
    { label: t("admin.users.stats.totalUsers"), value: statsLoading ? null : (analyticsData?.stats.totalUsers.toLocaleString() || "0"), growth: analyticsData?.stats.monthlyGrowth.users || 0, icon: Users },
    { label: t("admin.users.stats.activeUsers"), value: statsLoading ? null : (telemetryData?.metrics?.mau?.toLocaleString() || "0"), growth: telemetryData?.metrics?.newUsers ? (telemetryData.metrics.newUsers / (telemetryData.metrics.mau || 1)) * 100 : 0, icon: UserCheck },
    { label: t("admin.users.stats.newSignups"), value: statsLoading ? null : (telemetryData?.metrics?.newUsers?.toLocaleString() || "0"), growth: null, icon: UserPlus },
    // The sign comes from the number: this used to prefix "+" onto a negative rate ("+-5%").
    { label: t("admin.users.stats.growthRate"), value: statsLoading ? null : formatSignedPercent(analyticsData?.stats.growthRate ?? 0), growth: analyticsData?.stats.growthRate, icon: TrendingUp },
  ];

  const handleDeactivateUser = async (user: UserRecord) => {
    const confirmed = await confirm({
      title: t("admin.users.deactivate.title"),
      description: t("admin.users.deactivate.body", { name: user.name }),
      confirmLabel: t("admin.users.deactivate.cta"),
      cancelLabel: t("common.cancel"),
      variant: "destructive",
    });
    if (!confirmed) return;
    try {
      await apiRequest(`/api/v1/admin/users/${user.id}/status`, {
        method: "PUT",
        data: { isActive: false },
        showErrorToast: false,
      });
      toast.success(t("admin.users.deactivate.done", { name: user.name }));
      refetch();
    } catch {
      toast.error(t("admin.users.deactivate.failed"));
    }
  };

  const handleResendInvite = async (user: UserRecord) => {
    const confirmed = await confirm({
      title: t("admin.users.resend.title"),
      description: t("admin.users.resend.body", { name: user.name, email: user.email }),
      confirmLabel: t("admin.users.resend.cta"),
      cancelLabel: t("common.cancel"),
    });
    if (!confirmed) return;
    try {
      const res = await resendUserInvite(user.id);
      if (res.emailSent === false) {
        toast.warning(t("admin.users.resend.notDelivered", { email: user.email }));
      } else {
        toast.success(t("admin.users.resend.done", { email: user.email }));
      }
      refetch();
    } catch (err) {
      const status = (err as { status?: number }).status;
      toast.error(status === 409 ? t("admin.users.resend.alreadyActive", { name: user.name }) : t("admin.users.resend.failed"));
      if (status === 409) refetch();
    }
  };

  useEffect(() => {
    if (!authLoading && !isAdmin) {
      toast.error(t("admin.accessDenied"));
      router.push("/login");
    }
  }, [isAdmin, authLoading, router, t]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!authLoading && isAdmin) { setPage(1); }
    }, 500);
    return () => clearTimeout(timer);
  }, [searchTerm, authLoading, isAdmin]);

  if (authLoading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="space-y-8">
      {/* Header & Actions */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="space-y-1">
          <h1 className="text-4xl font-bold tracking-tight text-gray-900">{t("admin.users.title")}</h1>
          <p className="text-lg text-gray-500 font-medium">{t("admin.users.subtitle")}</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
          <div className="relative w-full md:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input placeholder={t("admin.users.searchPlaceholder")}
              className="pl-9 h-10 bg-white border-gray-200 rounded-xl shadow-sm focus:ring-gray-900 focus:border-gray-900 transition-shadow"
              value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>

          <div className="flex gap-3">
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-[130px] h-10 bg-white border-gray-200 rounded-xl shadow-sm text-gray-600 font-medium">
                <SelectValue placeholder={t("admin.users.rolePlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("admin.users.roles.all")}</SelectItem>
                <SelectItem value="student">{t("admin.users.roles.student")}</SelectItem>
                <SelectItem value="counselor">{t("admin.users.roles.counselor")}</SelectItem>
                <SelectItem value="school_admin">{t("admin.users.roles.school_admin")}</SelectItem>
                <SelectItem value="teacher">{t("admin.users.roles.teacher")}</SelectItem>
                <SelectItem value="parent">{t("admin.users.roles.parent")}</SelectItem>
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
                <SelectItem value="invited">{t("admin.users.status.invited")}</SelectItem>
                <SelectItem value="expired">{t("admin.users.status.expired")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <InviteUserWizard onInvited={() => refetch()} />
          <AddUserDialog onUserCreated={() => refetch()} />
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {statsCards.map((stat, index) => (
          <div key={index}
            style={{ borderRadius: "var(--admin-radius-lg, 8px)", border: "1px solid var(--admin-border-default, #2a2a2a)", background: "var(--admin-bg-card, #1e1e1e)", padding: 16, transition: "border-color 0.15s" }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--admin-border-hover, #333)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--admin-border-default, #2a2a2a)"; }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
              <div style={{ width: 32, height: 32, borderRadius: 6, background: "var(--admin-bg-icon-box, #2a2a2a)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <stat.icon style={{ width: 16, height: 16, color: "var(--admin-font-tertiary, #818181)" }} />
              </div>
              {stat.growth !== null && stat.growth !== undefined && (
                <div style={{ display: "flex", alignItems: "center", gap: 2, fontSize: 11, fontWeight: 500, color: Number(stat.growth) >= 0 ? "var(--admin-accent-green, #10b981)" : "var(--admin-accent-red, #ef4444)" }}>
                  {/* Math.abs used to drop the minus: a decline read as a red "5.0%". */}
                  {formatSignedPercent(Number(stat.growth))}
                </div>
              )}
            </div>
            <div style={{ fontSize: 24, fontWeight: 600, color: "var(--admin-font-primary, #ebebeb)", letterSpacing: "-0.02em" }}>
              {stat.value ?? <Skeleton className="h-9 w-24" />}
            </div>
            <div style={{ fontSize: 12, color: "var(--admin-font-tertiary, #818181)", marginTop: 4 }}>{stat.label}</div>
            {stat.growth !== null && (
              <div style={{ fontSize: 11, color: "var(--admin-font-light, #555)", marginTop: 4 }}>{t("admin.users.stats.fromLastMonth")}</div>
            )}
          </div>
        ))}
      </div>

      {/* Users Table */}
      <UsersTable users={users} loading={usersLoading} page={page} totalPages={totalPages}
        onPageChange={setPage} onViewProfile={setSelectedUser}
        onResendInvite={handleResendInvite} onDeactivate={handleDeactivateUser} />

      {/* User Detail Dialog */}
      <UserDetailDialog user={selectedUser} onClose={() => setSelectedUser(null)} onDeactivate={handleDeactivateUser}
        onResendInvite={handleResendInvite}
        onChanged={() => { setSelectedUser(null); refetch(); }} />

      <ConfirmDialog />
    </div>
  );
}
