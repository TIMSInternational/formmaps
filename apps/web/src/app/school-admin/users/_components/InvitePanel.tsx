"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  UserPlus, Upload, Users, Trash2, Plus, Loader2, Send, GraduationCap, Shield, UserCheck, BookOpen,
} from "lucide-react";
import { toast } from "sonner";
import { useInviteStudent } from "@/hooks/useSchoolAdmin";
import { linkExistingStudent } from "@/services/schoolAdminService";
import { useInviteStaff } from "@/hooks/useSchoolProfileQueries";

type InviteRole = "student" | "counselor" | "teacher" | "coach" | "staff";

interface InviteRow {
  name: string;
  email: string;
  classLevel?: string;
}

// Labels live in school_admin:ui.invite.roles.<role>.{label,invite,description}.
const roleConfig: Record<InviteRole, { color: string; icon: any }> = {
  student: { color: "var(--admin-accent-blue)", icon: GraduationCap },
  counselor: { color: "#10b981", icon: UserCheck },
  teacher: { color: "var(--admin-accent-blue)", icon: BookOpen },
  coach: { color: "#8b5cf6", icon: Users },
  staff: { color: "#f59e0b", icon: Shield },
};

export function InvitePanel() {
  const { t } = useTranslation("school_admin");
  const router = useRouter();
  const [selectedRole, setSelectedRole] = useState<InviteRole>("student");
  const [pendingLinks, setPendingLinks] = useState<string[]>([]);
  const [rows, setRows] = useState<InviteRow[]>([{ name: "", email: "", classLevel: "Freshman" }]);

  const inviteStudent = useInviteStudent();
  const inviteStaff = useInviteStaff();

  const config = roleConfig[selectedRole];
  const isPending = inviteStudent.isPending || inviteStaff.isPending;

  const addRow = () => {
    setRows([...rows, { name: "", email: "", classLevel: "Freshman" }]);
  };

  const removeRow = (index: number) => {
    if (rows.length === 1) return;
    setRows(rows.filter((_, i) => i !== index));
  };

  const updateRow = (index: number, field: keyof InviteRow, value: string) => {
    const updated = [...rows];
    updated[index] = { ...updated[index], [field]: value };
    setRows(updated);
  };

  const handleInvite = async () => {
    const validRows = rows.filter(r => r.name.trim() && r.email.trim());
    if (validRows.length === 0) {
      toast.error(t("ui.invite.fillOne"));
      return;
    }

    // Validate emails
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    for (const row of validRows) {
      if (!emailRegex.test(row.email)) {
        toast.error(t("ui.invite.invalidEmail", { email: row.email }));
        return;
      }
    }

    let successCount = 0;
    let failCount = 0;
    // Accounts that already exist with no school. They cannot be invited — only
    // adopted — so they are collected and offered as an explicit action rather
    // than being silently counted as sent, which is what used to happen.
    const linkable: string[] = [];
    const problems: string[] = [];

    for (const row of validRows) {
      try {
        if (selectedRole === "student") {
          // A batch endpoint answers 200 even when the row failed, so the ROW is
          // what decides, not the HTTP status.
          const res = await inviteStudent.mutateAsync({ email: row.email, name: row.name });
          if (res.sent) {
            successCount++;
          } else {
            failCount++;
            if (res.code === "ALREADY_ACTIVE" && res.schoolLess) linkable.push(res.email);
            else problems.push(`${row.email}: ${res.message || res.code}`);
          }
        } else {
          await inviteStaff.mutateAsync({ email: row.email, name: row.name, roleName: selectedRole });
          successCount++;
        }
      } catch (err: unknown) {
        failCount++;
        problems.push(`${row.email}: ${err instanceof Error ? err.message : t("ui.invite.failedShort")}`);
      }
    }

    if (successCount > 0) {
      toast.success(t("ui.invite.sent", { count: successCount }));
      setRows([{ name: "", email: "", classLevel: "Freshman" }]);
    }
    for (const p of problems.slice(0, 4)) toast.error(p);
    if (linkable.length > 0) setPendingLinks(linkable);
    if (failCount > 0 && problems.length === 0 && linkable.length === 0) {
      toast.error(t("ui.invite.notSent", { count: failCount }));
    }
  };

  const handleLink = async (email: string) => {
    try {
      const res = await linkExistingStudent(email);
      toast.success(t("ui.invite.linked", { name: res.name || email, school: res.schoolName }));
      setPendingLinks((prev) => prev.filter((e) => e !== email));
    } catch (err: unknown) {
      const body = (err as { data?: { message?: string } })?.data;
      toast.error(body?.message || (err instanceof Error ? err.message : t("ui.invite.linkFailed")));
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--admin-font-primary)", letterSpacing: "-0.01em" }}>
          {t("users.tabs.onboard")}
        </h2>
        <p style={{ fontSize: 13, color: "var(--admin-font-tertiary)", marginTop: 2 }}>
          {t("ui.invite.subtitle")}
        </p>
      </div>

      {/* Accounts that already exist with no school. An invitation cannot move
          them — it does nothing at all — so the only real action is to adopt
          them, offered explicitly here instead of failing silently. */}
      {pendingLinks.length > 0 && (
        <div style={{ border: "1px solid var(--admin-border-default)", borderRadius: 8, padding: 14, background: "var(--admin-bg-card)" }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>
            {pendingLinks.length === 1 ? t("ui.invite.existingOne") : t("ui.invite.existingMany", { count: pendingLinks.length })}
          </p>
          <p style={{ fontSize: 12, color: "var(--admin-font-tertiary)", marginTop: 2 }}>
            {t("ui.invite.existingHelp")}
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
            {pendingLinks.map((email) => (
              <div key={email} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <span style={{ fontSize: 13, color: "var(--admin-font-secondary)" }}>{email}</span>
                <button
                  type="button"
                  onClick={() => handleLink(email)}
                  style={{ fontSize: 12, fontWeight: 600, padding: "6px 12px", borderRadius: 6, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-hover)", color: "var(--admin-font-primary)", cursor: "pointer" }}
                >
                  {t("ui.invite.addToSchool")}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Role Selector */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {(Object.entries(roleConfig) as [InviteRole, typeof roleConfig[InviteRole]][]).map(([role, cfg]) => {
          const isActive = selectedRole === role;
          return (
            <button
              key={role}
              onClick={() => {
                setSelectedRole(role);
                setRows([{ name: "", email: "", classLevel: "Freshman" }]);
              }}
              style={{
                padding: "14px 16px", borderRadius: 8, cursor: "pointer",
                border: isActive ? `2px solid ${cfg.color}` : "1px solid var(--admin-border-default)",
                background: isActive ? `${cfg.color}08` : "var(--admin-bg-card)",
                textAlign: "left",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 6,
                  background: `${cfg.color}15`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <cfg.icon style={{ width: 14, height: 14, color: cfg.color }} />
                </div>
                <span style={{ fontSize: 13, fontWeight: 600, color: isActive ? cfg.color : "var(--admin-font-primary)" }}>
                  {t(`ui.invite.roles.${role}.label`)}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Invite Form */}
      <div style={{
        borderRadius: 8, border: "1px solid var(--admin-border-default)",
        background: "var(--admin-bg-card)", overflow: "hidden",
      }}>
        <div style={{
          padding: "12px 16px", borderBottom: "1px solid var(--admin-border-default)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          background: "var(--admin-bg-hover)", flexWrap: "wrap", gap: 8,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <config.icon style={{ width: 14, height: 14, color: config.color }} />
            <div>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>
                {t(`ui.invite.roles.${selectedRole}.invite`)}
              </span>
              <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>
                {t(`ui.invite.roles.${selectedRole}.description`)}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {selectedRole === "student" && (
              <button
                onClick={() => router.push("/school-admin/users/bulk-onboard")}
                style={{
                  height: 32, borderRadius: 6, padding: "0 12px",
                  fontSize: 11, fontWeight: 600,
                  display: "flex", alignItems: "center", gap: 4,
                  background: "transparent",
                  color: "var(--admin-font-primary)",
                  border: "1px solid var(--admin-border-default)",
                  cursor: "pointer",
                }}
              >
                <Upload style={{ width: 12, height: 12 }} /> {t("ui.invite.csvBulk")}
              </button>
            )}
            <button
              onClick={addRow}
              style={{
                height: 32, borderRadius: 6, padding: "0 12px",
                fontSize: 11, fontWeight: 600,
                display: "flex", alignItems: "center", gap: 4,
                background: "transparent",
                color: config.color,
                border: `1px solid ${config.color}40`,
                cursor: "pointer",
              }}
            >
              <Plus style={{ width: 12, height: 12 }} /> {t("ui.bulkOnboard.upload.addRow")}
            </button>
          </div>
        </div>

        <div style={{ padding: 16 }} className="space-y-3">
          {/* Column Headers */}
          <div style={{ display: "flex", gap: 8, alignItems: "center", paddingBottom: 4 }}>
            <div style={{ flex: 1, fontSize: 10, fontWeight: 600, color: "var(--admin-font-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{t("ui.student360.fullName")}</div>
            <div style={{ flex: 1, fontSize: 10, fontWeight: 600, color: "var(--admin-font-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{t("ui.student360.emailAddress")}</div>
            {selectedRole === "student" && (
              <div style={{ width: 140, fontSize: 10, fontWeight: 600, color: "var(--admin-font-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{t("users.table.grade")}</div>
            )}
            <div style={{ width: 32 }} />
          </div>

          {/* Rows */}
          {rows.map((row, i) => (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <div style={{ flex: 1 }}>
                <Input
                  placeholder={t("ui.invite.namePlaceholder")}
                  value={row.name}
                  onChange={(e) => updateRow(i, "name", e.target.value)}
                  className="h-9 text-xs"
                  style={{ borderRadius: 6, background: "var(--admin-bg-hover)", border: "1px solid var(--admin-border-default)" }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <Input
                  type="email"
                  placeholder="john@school.edu"
                  value={row.email}
                  onChange={(e) => updateRow(i, "email", e.target.value)}
                  className="h-9 text-xs"
                  style={{ borderRadius: 6, background: "var(--admin-bg-hover)", border: "1px solid var(--admin-border-default)" }}
                />
              </div>
              {selectedRole === "student" && (
                <div style={{ width: 140 }}>
                  <Select value={row.classLevel || "Freshman"} onValueChange={(v) => updateRow(i, "classLevel", v)}>
                    <SelectTrigger className="h-9 text-xs" style={{ borderRadius: 6, background: "var(--admin-bg-hover)", border: "1px solid var(--admin-border-default)" }}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Freshman">{t("ui.bulkOnboard.levels.Freshman")}</SelectItem>
                      <SelectItem value="Sophomore">{t("ui.bulkOnboard.levels.Sophomore")}</SelectItem>
                      <SelectItem value="Junior">{t("ui.bulkOnboard.levels.Junior")}</SelectItem>
                      <SelectItem value="Senior">{t("ui.bulkOnboard.levels.Senior")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              <button
                onClick={() => removeRow(i)}
                disabled={rows.length === 1}
                style={{
                  width: 32, height: 32, borderRadius: 6,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: "transparent", border: "none", cursor: rows.length === 1 ? "default" : "pointer",
                  opacity: rows.length === 1 ? 0.3 : 1,
                }}
              >
                <Trash2 style={{ width: 14, height: 14, color: "#ef4444" }} />
              </button>
            </div>
          ))}

          {/* Actions */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 8, borderTop: "1px solid var(--admin-border-default)" }}>
            <span style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>
              {t("ui.invite.rowsFilled", { filled: rows.filter(r => r.name.trim() && r.email.trim()).length, total: rows.length })}
            </span>
            <button
              onClick={handleInvite}
              disabled={isPending || rows.every(r => !r.name.trim() || !r.email.trim())}
              style={{
                height: 36, borderRadius: 6, padding: "0 20px",
                fontSize: 12, fontWeight: 600,
                display: "flex", alignItems: "center", gap: 6,
                background: config.color, color: "#fff",
                border: "none", cursor: "pointer",
                opacity: (isPending || rows.every(r => !r.name.trim() || !r.email.trim())) ? 0.6 : 1,
              }}
            >
              {isPending ? <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> : <Send style={{ width: 14, height: 14 }} />}
              {t("ui.invite.sendN", { count: Math.max(1, rows.filter(r => r.name.trim() && r.email.trim()).length) })}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
