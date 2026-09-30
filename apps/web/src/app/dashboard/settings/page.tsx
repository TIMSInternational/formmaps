"use client";

import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { useGlobalStore } from "@/store/useGlobalStore";
import { useAdminTheme } from "@/contexts/AdminThemeContext";
import {
  User,
  Bell,
  Sun,
  Moon,
  Monitor,
  Globe,
  Shield,
  Lock,
  Loader2,
  Settings,
} from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { getUserSettings, updateUserSettings } from "@/services/userService";
import { apiRequest } from "@/lib/api/apiClient";
import { useSetLanguage, applyLanguage } from "@/lib/i18n/useSetLanguage";
import { useTranslation } from "react-i18next";

/* ------------------------------------------------------------------ */
/*  Section card wrapper                                               */
/* ------------------------------------------------------------------ */

function SectionCard({
  icon: Icon,
  title,
  subtitle,
  children,
  delay = 0,
}: {
  icon: React.ElementType;
  title: string;
  subtitle: string;
  children: React.ReactNode;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
      style={{
        borderRadius: 8,
        border: "1px solid var(--admin-border-default)",
        background: "var(--admin-bg-card)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "12px 16px",
          borderBottom: "1px solid var(--admin-border-default)",
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: "var(--admin-bg-hover)",
        }}
      >
        <Icon className="h-4 w-4" style={{ color: "var(--admin-accent-blue)" }} />
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>
            {title}
          </div>
          <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>
            {subtitle}
          </div>
        </div>
      </div>
      <div style={{ padding: 16 }}>{children}</div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Toggle row                                                         */
/* ------------------------------------------------------------------ */

function ToggleRow({
  id,
  label,
  description,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div
      className="flex items-center justify-between gap-4"
      style={{
        padding: "10px 0",
        borderBottom: "1px solid var(--admin-border-default)",
      }}
    >
      <div>
        <Label
          htmlFor={id}
          style={{ fontSize: 13, fontWeight: 500, color: "var(--admin-font-primary)", cursor: "pointer" }}
        >
          {label}
        </Label>
        <p style={{ fontSize: 11, color: "var(--admin-font-tertiary)", marginTop: 2 }}>
          {description}
        </p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Theme option button                                                */
/* ------------------------------------------------------------------ */

function ThemeOption({
  icon: Icon,
  label,
  value,
  active,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
        padding: "14px 12px",
        borderRadius: 8,
        border: active
          ? "2px solid var(--admin-accent-blue)"
          : "1px solid var(--admin-border-default)",
        background: active ? "rgba(46,144,152,0.06)" : "var(--admin-bg-card)",
        cursor: "pointer",
        transition: "all 0.15s ease",
      }}
    >
      <Icon
        className="h-5 w-5"
        style={{ color: active ? "var(--admin-accent-blue)" : "var(--admin-font-tertiary)" }}
      />
      <span
        style={{
          fontSize: 12,
          fontWeight: active ? 600 : 400,
          color: active ? "var(--admin-accent-blue)" : "var(--admin-font-primary)",
        }}
      >
        {label}
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Main page                                                          */
/* ------------------------------------------------------------------ */

export default function StudentSettingsPage() {
  const user = useGlobalStore((s) => s.user);
  const { mode, setMode } = useAdminTheme();
  const setLanguage = useSetLanguage();
  const { t } = useTranslation();

  const [isLoading, setIsLoading] = useState(true);

  // Notification preferences (client-only for now)
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [pushNotifications, setPushNotifications] = useState(true);
  const [sessionReminders, setSessionReminders] = useState(true);
  const [weeklyDigest, setWeeklyDigest] = useState(false);

  // Language preference (local display state only — actual changes go via setLanguage hook)
  const [language, setLocalLanguage] = useState<"en" | "es">("en");

  // Privacy settings
  const [profileVisible, setProfileVisible] = useState(true);
  const [shareProgress, setShareProgress] = useState(true);
  const [allowAnalytics, setAllowAnalytics] = useState(true);

  const [saving, setSaving] = useState(false);

  // Change password
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  const handleChangePassword = async () => {
    if (newPassword !== confirmNewPassword) {
      toast.error(t("auth.validation.passwordsMatch"));
      return;
    }
    setChangingPassword(true);
    try {
      await apiRequest("/authapi/change-password", {
        method: "PUT",
        data: { email: user.email, password: newPassword, oldPassword: currentPassword },
      });
      toast.success(t("dashboard.settings.security.passwordChanged"));
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("dashboard.settings.security.passwordChangeFailed"));
    } finally {
      setChangingPassword(false);
    }
  };

  // Load saved settings from the backend (null until first save).
  // On load, hydrate the i18n/store via the shared hook so the UI
  // immediately reflects the persisted language preference.
  useEffect(() => {
    let cancelled = false;
    getUserSettings()
      .then((settings) => {
        if (cancelled || !settings) return;
        setEmailNotifications(settings.emailNotifications);
        setPushNotifications(settings.pushNotifications);
        setSessionReminders(settings.bookingNotifications);
        setWeeklyDigest(settings.marketingEmails);
        // Normalise to "en"|"es" — backend may return either code or legacy words.
        const lang: "en" | "es" =
          settings.language === "es" || settings.language === "spanish" ? "es" : "en";
        setLocalLanguage(lang);
        // Hydrate i18next + global store (skip PUT — value came FROM the DB).
        applyLanguage(lang);
        setProfileVisible(settings.profileVisible);
        setShareProgress(settings.shareProgress);
        setAllowAnalytics(settings.allowAnalytics);
      })
      .catch(() => {}) // keep defaults on error
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateUserSettings({
        emailNotifications,
        pushNotifications,
        bookingNotifications: sessionReminders,
        marketingEmails: weeklyDigest,
        language,  // already "en"|"es" from local state
        profileVisible,
        shareProgress,
        allowAnalytics,
      });
      toast.success(t("dashboard.settings.saved"));
    } catch {
      toast.error(t("dashboard.settings.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  /* ---- Loading state ---- */
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-6 w-32" style={{ background: "var(--admin-bg-hover)" }} />
          <Skeleton className="h-4 w-56 mt-2" style={{ background: "var(--admin-bg-hover)" }} />
        </div>
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-40 w-full rounded-lg" style={{ background: "var(--admin-bg-hover)" }} />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6" style={{ maxWidth: 720 }}>
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
        <div className="flex items-center gap-2">
          <Settings className="h-5 w-5" style={{ color: "var(--admin-accent-blue)" }} />
          <h1 style={{ fontSize: 20, fontWeight: 600, color: "var(--admin-font-primary)", letterSpacing: "-0.01em" }}>
            {t("nav.settings")}
          </h1>
        </div>
        <p style={{ fontSize: 13, color: "var(--admin-font-tertiary)", marginTop: 2 }}>
          {t("dashboard.settings.subtitle")}
        </p>
      </motion.div>

      {/* ---- Profile ---- */}
      <SectionCard icon={User} title={t("nav.profile")} subtitle={t("dashboard.settings.profile.subtitle")} delay={0.05}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>{t("dashboard.settings.profile.name")}</Label>
            <p style={{ fontSize: 14, fontWeight: 500, color: "var(--admin-font-primary)", marginTop: 2 }}>
              {user.name || t("dashboard.settings.profile.notSet")}
            </p>
          </div>
          <div>
            <Label style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>{t("dashboard.settings.profile.email")}</Label>
            <p style={{ fontSize: 14, fontWeight: 500, color: "var(--admin-font-primary)", marginTop: 2 }}>
              {user.email || t("dashboard.settings.profile.notSet")}
            </p>
          </div>
          <div>
            <Label style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>{t("dashboard.settings.profile.role")}</Label>
            <p
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "var(--admin-accent-blue)",
                marginTop: 2,
                textTransform: "capitalize",
              }}
            >
              {user.role
                ? t(`dashboard.role.${user.role.toLowerCase().replace(/[\s_-]/g, "")}`, { defaultValue: user.role })
                : t("dashboard.role.student")}
            </p>
          </div>
        </div>
      </SectionCard>

      {/* ---- Notifications ---- */}
      <SectionCard icon={Bell} title={t("nav.notifications")} subtitle={t("dashboard.settings.notifications.subtitle")} delay={0.1}>
        <div className="space-y-0">
          <ToggleRow
            id="email-notif"
            label={t("dashboard.settings.notifications.email.label")}
            description={t("dashboard.settings.notifications.email.description")}
            checked={emailNotifications}
            onChange={setEmailNotifications}
          />
          <ToggleRow
            id="push-notif"
            label={t("dashboard.settings.notifications.push.label")}
            description={t("dashboard.settings.notifications.push.description")}
            checked={pushNotifications}
            onChange={setPushNotifications}
          />
          <ToggleRow
            id="session-reminders"
            label={t("dashboard.settings.notifications.sessionReminders.label")}
            description={t("dashboard.settings.notifications.sessionReminders.description")}
            checked={sessionReminders}
            onChange={setSessionReminders}
          />
          <ToggleRow
            id="weekly-digest"
            label={t("dashboard.settings.notifications.weeklyDigest.label")}
            description={t("dashboard.settings.notifications.weeklyDigest.description")}
            checked={weeklyDigest}
            onChange={setWeeklyDigest}
          />
        </div>
      </SectionCard>

      {/* ---- Theme ---- */}
      <SectionCard icon={Sun} title={t("shell.theme")} subtitle={t("dashboard.settings.theme.subtitle")} delay={0.15}>
        <div className="flex gap-3">
          <ThemeOption icon={Sun} label={t("shell.themeLight")} value="light" active={mode === "light"} onClick={() => setMode("light")} />
          <ThemeOption icon={Moon} label={t("shell.themeDark")} value="dark" active={mode === "dark"} onClick={() => setMode("dark")} />
          <ThemeOption icon={Monitor} label={t("shell.themeSystem")} value="system" active={mode === "system"} onClick={() => setMode("system")} />
        </div>
      </SectionCard>

      {/* ---- Language ---- */}
      <SectionCard icon={Globe} title={t("dashboard.settings.language.title")} subtitle={t("dashboard.settings.language.subtitle")} delay={0.2}>
        <div className="flex flex-wrap gap-2">
          {([
            { value: "en", label: "English" },
            { value: "es", label: "Español" },
          ] as const).map((lang) => (
            <button
              key={lang.value}
              type="button"
              onClick={() => {
                setLocalLanguage(lang.value);
                setLanguage(lang.value).catch(() => {});
              }}
              style={{
                padding: "8px 16px",
                borderRadius: 6,
                fontSize: 13,
                fontWeight: language === lang.value ? 600 : 400,
                border: language === lang.value
                  ? "2px solid var(--admin-accent-blue)"
                  : "1px solid var(--admin-border-default)",
                background: language === lang.value ? "rgba(46,144,152,0.06)" : "transparent",
                color: language === lang.value
                  ? "var(--admin-accent-blue)"
                  : "var(--admin-font-primary)",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              {lang.label}
            </button>
          ))}
        </div>
      </SectionCard>

      {/* ---- Privacy ---- */}
      <SectionCard icon={Shield} title={t("dashboard.settings.privacy.title")} subtitle={t("dashboard.settings.privacy.subtitle")} delay={0.25}>
        <div className="space-y-0">
          <ToggleRow
            id="profile-visible"
            label={t("dashboard.settings.privacy.profileVisibility.label")}
            description={t("dashboard.settings.privacy.profileVisibility.description")}
            checked={profileVisible}
            onChange={setProfileVisible}
          />
          <ToggleRow
            id="share-progress"
            label={t("dashboard.settings.privacy.shareProgress.label")}
            description={t("dashboard.settings.privacy.shareProgress.description")}
            checked={shareProgress}
            onChange={setShareProgress}
          />
          <ToggleRow
            id="allow-analytics"
            label={t("dashboard.settings.privacy.usageAnalytics.label")}
            description={t("dashboard.settings.privacy.usageAnalytics.description")}
            checked={allowAnalytics}
            onChange={setAllowAnalytics}
          />
        </div>
      </SectionCard>

      {/* ---- Security: change password ---- */}
      <SectionCard icon={Lock} title={t("dashboard.settings.security.title")} subtitle={t("dashboard.settings.security.subtitle")} delay={0.28}>
        <div className="space-y-4 max-w-md">
          <div className="space-y-1.5">
            <Label htmlFor="current-password">{t("dashboard.settings.security.currentPassword")}</Label>
            <input
              id="current-password"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              className="w-full h-9 rounded-md px-3 text-sm outline-none"
              style={{ background: "var(--admin-bg-hover)", border: "1px solid var(--admin-border-default)", color: "var(--admin-font-primary)" }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-password">{t("dashboard.settings.security.newPassword")}</Label>
            <input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              className="w-full h-9 rounded-md px-3 text-sm outline-none"
              style={{ background: "var(--admin-bg-hover)", border: "1px solid var(--admin-border-default)", color: "var(--admin-font-primary)" }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm-new-password">{t("dashboard.settings.security.confirmNewPassword")}</Label>
            <input
              id="confirm-new-password"
              type="password"
              value={confirmNewPassword}
              onChange={(e) => setConfirmNewPassword(e.target.value)}
              autoComplete="new-password"
              className="w-full h-9 rounded-md px-3 text-sm outline-none"
              style={{ background: "var(--admin-bg-hover)", border: "1px solid var(--admin-border-default)", color: "var(--admin-font-primary)" }}
            />
          </div>
          <button
            type="button"
            onClick={handleChangePassword}
            disabled={changingPassword || !currentPassword || !newPassword || !confirmNewPassword}
            style={{
              height: 34,
              borderRadius: 6,
              padding: "0 16px",
              fontSize: 13,
              fontWeight: 600,
              background: "var(--admin-accent-blue)",
              color: "#fff",
              border: "none",
              cursor: changingPassword ? "not-allowed" : "pointer",
              opacity: changingPassword || !currentPassword || !newPassword || !confirmNewPassword ? 0.6 : 1,
            }}
          >
            {changingPassword
              ? t("dashboard.settings.security.changing")
              : t("dashboard.settings.security.changePassword")}
          </button>
        </div>
      </SectionCard>

      {/* ---- Save button ---- */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="flex justify-end"
        style={{ paddingBottom: 24 }}
      >
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          style={{
            height: 38,
            borderRadius: 6,
            padding: "0 20px",
            fontSize: 13,
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: "var(--admin-accent-blue)",
            color: "#fff",
            border: "none",
            cursor: saving ? "not-allowed" : "pointer",
            opacity: saving ? 0.6 : 1,
            transition: "opacity 0.15s ease",
          }}
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("dashboard.settings.saving")}
            </>
          ) : (
            t("dashboard.settings.save")
          )}
        </button>
      </motion.div>
    </div>
  );
}
