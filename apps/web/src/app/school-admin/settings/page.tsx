"use client";

import { useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import dynamic from "next/dynamic";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Settings,
  User,
  Lock,
  School,
  Calendar,
  Users,
  Loader2,
  Beaker,
  Building2,
  CalendarDays,
  Plug,
} from "lucide-react";
import { toast } from "sonner";
import { useSchoolSettings } from "@/hooks/useSchoolAdmin";
import { updateAdminProfile, changePassword } from "@/services/schoolAdminService";
import { AdminTabBar } from "@/app/school-admin/_components/AdminTabBar";

const ProfilePanel = dynamic(() => import("./_components/ProfilePanel"));
const CalendarPanel = dynamic(() => import("./_components/CalendarPanel"));
const IntegrationsPanel = dynamic(() => import("./_components/IntegrationsPanel"));

const TABS = [
  { key: "general", label: "General", icon: Settings },
  { key: "profile", label: "School Profile", icon: Building2 },
  { key: "calendar", label: "Calendar", icon: CalendarDays },
  { key: "integrations", label: "Integrations", icon: Plug },
] as const;

function GeneralSettings() {
  const { t } = useTranslation();
  const { data: settings, isLoading, refetch } = useSchoolSettings();

  // Profile form
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [profileLoading, setProfileLoading] = useState(false);
  const [useMockData, setUseMockData] = useState(false);

  // Password form
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);

  const handleUpdateProfile = async () => {
    if (!name && !phone) {
      toast.error(t("schoolAdmin.settings.profile.fillRequired", "Please fill in at least one field"));
      return;
    }
    setProfileLoading(true);
    try {
      await updateAdminProfile({ name: name || undefined, phone: phone || undefined });
      toast.success(t("schoolAdmin.settings.profile.success", "Profile updated successfully"));
      refetch();
    } catch (error) {
      toast.error(t("schoolAdmin.settings.profile.error", "Failed to update profile"));
    } finally {
      setProfileLoading(false);
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword) {
      toast.error(t("schoolAdmin.settings.password.fillRequired", "Please fill in all password fields"));
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error(t("schoolAdmin.settings.password.mismatch", "New passwords do not match"));
      return;
    }
    if (newPassword.length < 8) {
      toast.error(t("schoolAdmin.settings.password.minLength", "Password must be at least 8 characters"));
      return;
    }
    setPasswordLoading(true);
    try {
      await changePassword({ currentPassword, newPassword });
      toast.success(t("schoolAdmin.settings.password.success", "Password changed successfully"));
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error) {
      toast.error(t("schoolAdmin.settings.password.error", "Failed to change password"));
    } finally {
      setPasswordLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: "var(--admin-font-primary)", letterSpacing: "-0.01em" }}>
            {t("schoolAdmin.settings.title", "Settings")}
          </h1>
          <p style={{ fontSize: 13, color: "var(--admin-font-tertiary)", marginTop: 2 }}>
            {t("schoolAdmin.settings.subtitle", "Manage your account and school settings.")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          {process.env.NODE_ENV === "development" && (
            <div className="flex items-center gap-3 px-4 py-2 rounded-lg shrink-0" style={{ border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)" }}>
              <Beaker className="w-4 h-4" style={{ color: useMockData ? "#f59e0b" : "var(--admin-accent-green, #10b981)" }} />
              <div className="flex flex-col justify-center">
                <Label htmlFor="mock-data-toggle" style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--admin-font-primary)", cursor: "pointer" }}>
                  {useMockData ? "Preview Mode" : "Live Mode"}
                </Label>
                <span style={{ fontSize: 10, color: "var(--admin-font-tertiary)", marginTop: 1 }}>
                  {useMockData ? "Using mock data" : "Using real data"}
                </span>
              </div>
              <div className="ml-2 pl-3 flex items-center" style={{ borderLeft: "1px solid var(--admin-border-default)", height: 24 }}>
                <Switch
                  id="mock-data-toggle"
                  checked={useMockData}
                  onCheckedChange={setUseMockData}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* School Info Card */}
      <div style={{
        borderRadius: 8,
        border: "1px solid var(--admin-border-default)",
        background: "var(--admin-bg-card)",
        overflow: "hidden",
      }}>
        <div style={{
          padding: "12px 16px",
          borderBottom: "1px solid var(--admin-border-default)",
          display: "flex", alignItems: "center", gap: 8,
          background: "var(--admin-bg-hover)",
        }}>
          <School className="h-4 w-4" style={{ color: "var(--admin-accent-blue, #3b82f6)" }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>
              {t("schoolAdmin.settings.schoolInfo.title", "School Information")}
            </div>
            <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>
              {t("schoolAdmin.settings.schoolInfo.subtitle", "Your school details and contract information")}
            </div>
          </div>
        </div>
        <div style={{ padding: "16px" }}>
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <Skeleton className="h-4 w-24" style={{ background: "var(--admin-bg-hover)" }} />
                <Skeleton className="h-7 w-48" style={{ background: "var(--admin-bg-hover)" }} />
                <Skeleton className="h-4 w-24" style={{ background: "var(--admin-bg-hover)" }} />
                <Skeleton className="h-7 w-64" style={{ background: "var(--admin-bg-hover)" }} />
              </div>
              <div className="space-y-4">
                <Skeleton className="h-10 w-full" style={{ background: "var(--admin-bg-hover)" }} />
                <Skeleton className="h-10 w-full" style={{ background: "var(--admin-bg-hover)" }} />
              </div>
            </div>
          ) : settings ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <Label style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>{t("schoolAdmin.settings.schoolInfo.name", "School Name")}</Label>
                  <p style={{ fontSize: 14, fontWeight: 500, color: "var(--admin-font-primary)", marginTop: 2 }}>{settings.school.name}</p>
                </div>
                <div>
                  <Label style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>{t("schoolAdmin.settings.schoolInfo.adminEmail", "Admin Email")}</Label>
                  <p style={{ fontSize: 14, fontWeight: 500, color: "var(--admin-font-primary)", marginTop: 2 }}>{settings.admin.email}</p>
                </div>
              </div>
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div style={{
                    width: 36, height: 36, borderRadius: 8,
                    background: "rgba(59,130,246,0.1)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <Users className="w-4 h-4" style={{ color: "var(--admin-accent-blue, #3b82f6)" }} />
                  </div>
                  <div>
                    <p style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>{t("schoolAdmin.settings.schoolInfo.maxStudents", "Student Capacity")}</p>
                    <p style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>
                      {settings.school.currentStudents} / {settings.school.maxStudents}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div style={{
                    width: 36, height: 36, borderRadius: 8,
                    background: "rgba(139,92,246,0.1)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <Calendar className="w-4 h-4" style={{ color: "#8b5cf6" }} />
                  </div>
                  <div>
                    <p style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>{t("schoolAdmin.settings.schoolInfo.contractPeriod", "Contract Period")}</p>
                    <p style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>
                      {settings.school.contractStart} - {settings.school.contractEnd}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <p style={{ textAlign: "center", padding: "24px 0", color: "var(--admin-font-tertiary)", fontSize: 13 }}>
              {t("schoolAdmin.settings.schoolInfo.loadError", "Unable to load school info")}
            </p>
          )}
        </div>
      </div>

      {/* Profile Settings */}
      <div style={{
        borderRadius: 8,
        border: "1px solid var(--admin-border-default)",
        background: "var(--admin-bg-card)",
        overflow: "hidden",
      }}>
        <div style={{
          padding: "12px 16px",
          borderBottom: "1px solid var(--admin-border-default)",
          display: "flex", alignItems: "center", gap: 8,
          background: "var(--admin-bg-hover)",
        }}>
          <User className="h-4 w-4" style={{ color: "var(--admin-accent-blue, #3b82f6)" }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>
              {t("schoolAdmin.settings.profile.title", "Profile Settings")}
            </div>
            <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>
              {t("schoolAdmin.settings.profile.subtitle", "Update your profile information")}
            </div>
          </div>
        </div>
        <div style={{ padding: "16px" }} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name" style={{ fontSize: 12, color: "var(--admin-font-tertiary)" }}>{t("schoolAdmin.settings.profile.name", "Name")}</Label>
              <Input
                id="name"
                placeholder={settings?.admin.name || t("schoolAdmin.settings.profile.namePlaceholder", "Your name")}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone" style={{ fontSize: 12, color: "var(--admin-font-tertiary)" }}>{t("schoolAdmin.settings.profile.phone", "Phone")}</Label>
              <Input
                id="phone"
                placeholder={t("schoolAdmin.settings.profile.phonePlaceholder", "+1 234 567 8900")}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
          </div>
          <button
            onClick={handleUpdateProfile}
            disabled={profileLoading}
            style={{
              height: 36, borderRadius: 6, padding: "0 14px",
              fontSize: 12, fontWeight: 600,
              display: "flex", alignItems: "center", gap: 6,
              background: "var(--admin-accent-blue, #3b82f6)", color: "#fff",
              border: "none", cursor: "pointer",
              opacity: profileLoading ? 0.6 : 1,
            }}
          >
            {profileLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("schoolAdmin.settings.profile.updating", "Saving...")}
              </>
            ) : (
              t("schoolAdmin.settings.profile.update", "Update Profile")
            )}
          </button>
        </div>
      </div>

      {/* Password Settings */}
      <div style={{
        borderRadius: 8,
        border: "1px solid var(--admin-border-default)",
        background: "var(--admin-bg-card)",
        overflow: "hidden",
      }}>
        <div style={{
          padding: "12px 16px",
          borderBottom: "1px solid var(--admin-border-default)",
          display: "flex", alignItems: "center", gap: 8,
          background: "var(--admin-bg-hover)",
        }}>
          <Lock className="h-4 w-4" style={{ color: "var(--admin-accent-blue, #3b82f6)" }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>
              {t("schoolAdmin.settings.password.title", "Change Password")}
            </div>
            <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>
              {t("schoolAdmin.settings.password.subtitle", "Keep your account secure by using a strong password")}
            </div>
          </div>
        </div>
        <div style={{ padding: "16px" }} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="currentPassword" style={{ fontSize: 12, color: "var(--admin-font-tertiary)" }}>{t("schoolAdmin.settings.password.current", "Current Password")}</Label>
            <Input
              id="currentPassword"
              type="password"
              placeholder={t("schoolAdmin.settings.password.currentPlaceholder", "Enter current password")}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="newPassword" style={{ fontSize: 12, color: "var(--admin-font-tertiary)" }}>{t("schoolAdmin.settings.password.new", "New Password")}</Label>
              <Input
                id="newPassword"
                type="password"
                placeholder={t("schoolAdmin.settings.password.newPlaceholder", "Enter new password")}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword" style={{ fontSize: 12, color: "var(--admin-font-tertiary)" }}>{t("schoolAdmin.settings.password.confirm", "Confirm New Password")}</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder={t("schoolAdmin.settings.password.confirmPlaceholder", "Confirm new password")}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
          </div>
          <button
            onClick={handleChangePassword}
            disabled={passwordLoading}
            style={{
              height: 36, borderRadius: 6, padding: "0 14px",
              fontSize: 12, fontWeight: 600,
              display: "flex", alignItems: "center", gap: 6,
              background: "transparent",
              color: "var(--admin-font-primary)",
              border: "1px solid var(--admin-border-default)",
              cursor: "pointer",
              opacity: passwordLoading ? 0.6 : 1,
            }}
          >
            {passwordLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("schoolAdmin.settings.password.changing", "Changing...")}
              </>
            ) : (
              t("schoolAdmin.settings.password.change", "Change Password")
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialTab = searchParams.get("tab") || "general";
  const [activeTab, setActiveTab] = useState(initialTab);

  const handleTabChange = (key: string) => {
    setActiveTab(key);
    const url = key === "general" ? "/school-admin/settings" : `/school-admin/settings?tab=${key}`;
    router.replace(url, { scroll: false });
  };

  return (
    <div>
      <AdminTabBar tabs={[...TABS]} activeTab={activeTab} onChange={handleTabChange} />
      {activeTab === "general" && <GeneralSettings />}
      {activeTab === "profile" && <ProfilePanel />}
      {activeTab === "calendar" && <CalendarPanel />}
      {activeTab === "integrations" && <IntegrationsPanel />}
    </div>
  );
}
