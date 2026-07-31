"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
import { useInviteStaff } from "@/hooks/useSchoolProfileQueries";

type InviteRole = "student" | "counselor" | "teacher" | "coach" | "staff";

interface InviteRow {
  name: string;
  email: string;
  classLevel?: string;
}

const roleConfig: Record<InviteRole, { label: string; color: string; icon: any; description: string }> = {
  student: { label: "Students", color: "#2E9098", icon: GraduationCap, description: "Invite students individually or use CSV bulk onboard for larger groups." },
  counselor: { label: "Counselors", color: "#10b981", icon: UserCheck, description: "Invite counselors who will be assigned student caseloads." },
  teacher: { label: "Teachers", color: "#2E9098", icon: BookOpen, description: "Invite teachers to complete 360° evaluations and respond to recommendation requests." },
  coach: { label: "Coaches", color: "#8b5cf6", icon: Users, description: "Invite career coaches to guide students through their career journey." },
  staff: { label: "Staff", color: "#f59e0b", icon: Shield, description: "Invite administrative staff members to help manage your school." },
};

export function InvitePanel() {
  const router = useRouter();
  const [selectedRole, setSelectedRole] = useState<InviteRole>("student");
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
      toast.error("Please fill in at least one name and email.");
      return;
    }

    // Validate emails
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    for (const row of validRows) {
      if (!emailRegex.test(row.email)) {
        toast.error(`Invalid email: ${row.email}`);
        return;
      }
    }

    let successCount = 0;
    let failCount = 0;

    for (const row of validRows) {
      try {
        if (selectedRole === "student") {
          await inviteStudent.mutateAsync({ email: row.email, name: row.name });
        } else {
          await inviteStaff.mutateAsync({ email: row.email, name: row.name, role: selectedRole });
        }
        successCount++;
      } catch (err: any) {
        failCount++;
        console.error(`Failed to invite ${row.email}:`, err);
      }
    }

    if (successCount > 0) {
      toast.success(`${successCount} invitation${successCount > 1 ? "s" : ""} sent successfully.`);
      setRows([{ name: "", email: "", classLevel: "Freshman" }]);
    }
    if (failCount > 0) {
      toast.error(`${failCount} invitation${failCount > 1 ? "s" : ""} failed. Check for duplicates.`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--admin-font-primary)", letterSpacing: "-0.01em" }}>
          Invite & Onboard
        </h2>
        <p style={{ fontSize: 13, color: "var(--admin-font-tertiary)", marginTop: 2 }}>
          Invite students, counselors, coaches, or staff members to your school.
        </p>
      </div>

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
                  {cfg.label}
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
                Invite {config.label}
              </span>
              <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>
                {config.description}
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
                <Upload style={{ width: 12, height: 12 }} /> CSV Bulk Onboard
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
              <Plus style={{ width: 12, height: 12 }} /> Add Row
            </button>
          </div>
        </div>

        <div style={{ padding: 16 }} className="space-y-3">
          {/* Column Headers */}
          <div style={{ display: "flex", gap: 8, alignItems: "center", paddingBottom: 4 }}>
            <div style={{ flex: 1, fontSize: 10, fontWeight: 600, color: "var(--admin-font-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Full Name</div>
            <div style={{ flex: 1, fontSize: 10, fontWeight: 600, color: "var(--admin-font-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Email Address</div>
            {selectedRole === "student" && (
              <div style={{ width: 140, fontSize: 10, fontWeight: 600, color: "var(--admin-font-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Grade</div>
            )}
            <div style={{ width: 32 }} />
          </div>

          {/* Rows */}
          {rows.map((row, i) => (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <div style={{ flex: 1 }}>
                <Input
                  placeholder="John Smith"
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
                      <SelectItem value="Freshman">Freshman (9)</SelectItem>
                      <SelectItem value="Sophomore">Sophomore (10)</SelectItem>
                      <SelectItem value="Junior">Junior (11)</SelectItem>
                      <SelectItem value="Senior">Senior (12)</SelectItem>
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
              {rows.filter(r => r.name.trim() && r.email.trim()).length} of {rows.length} rows filled
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
              Send {rows.filter(r => r.name.trim() && r.email.trim()).length > 1 ? `${rows.filter(r => r.name.trim() && r.email.trim()).length} Invitations` : "Invitation"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
