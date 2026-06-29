"use client";

import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Building2, Phone, Mail, Globe, MapPin, Loader2, Save, Upload, Shield, Calendar,
} from "lucide-react";
import { toast } from "sonner";
import { useSchoolProfile, useUpdateSchoolProfile, useUploadSchoolLogo } from "@/hooks/useSchoolProfileQueries";
import { Skeleton } from "@/components/ui/skeleton";

function SectionCard({ icon: Icon, title, subtitle, color, children }: {
  icon: any; title: string; subtitle: string; color: string; children: React.ReactNode;
}) {
  return (
    <div style={{
      borderRadius: 8, border: "1px solid var(--admin-border-default)",
      background: "var(--admin-bg-card)", overflow: "hidden",
    }}>
      <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--admin-border-default)", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 8, background: `${color}15`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Icon style={{ width: 18, height: 18, color }} />
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--admin-font-primary)" }}>{title}</div>
          <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>{subtitle}</div>
        </div>
      </div>
      <div style={{ padding: 20 }}>{children}</div>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <Label style={{ fontSize: 12, fontWeight: 500, color: "var(--admin-font-tertiary)" }}>{label}</Label>
      {children}
    </div>
  );
}

export default function ProfilePanel() {
  const { t } = useTranslation("school_admin");
  const { data: profile, isLoading } = useSchoolProfile();
  const updateProfile = useUpdateSchoolProfile();
  const uploadLogo = useUploadSchoolLogo();

  const [form, setForm] = useState({
    name: "", phone: "", email: "", website: "",
    street: "", city: "", state: "", country: "", postalCode: "", timezone: "",
  });

  useEffect(() => {
    if (profile) {
      setForm({
        name: profile.name || "", phone: profile.phone || "",
        email: profile.email || "", website: profile.website || "",
        street: profile.address?.street || "", city: profile.address?.city || "",
        state: profile.address?.state || "", country: profile.address?.country || "",
        postalCode: profile.address?.postalCode || "", timezone: profile.timezone || "",
      });
    }
  }, [profile]);

  const handleSave = () => {
    updateProfile.mutate({
      name: form.name || undefined, phone: form.phone || undefined,
      email: form.email, website: form.website || undefined, timezone: form.timezone || undefined,
      address: { street: form.street, city: form.city, state: form.state, country: form.country, postalCode: form.postalCode },
    }, {
      onSuccess: () => toast.success(t("settings.profilePanel.updated")),
      onError: () => toast.error(t("settings.profilePanel.updateFailed")),
    });
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error(t("settings.profilePanel.maxSize")); e.target.value = ""; return; }
    uploadLogo.mutate(file, {
      onSuccess: () => toast.success(t("settings.profilePanel.logoUploaded")),
      onError: () => toast.error(t("settings.profilePanel.logoUploadFailed")),
    });
  };

  const update = (field: string, value: string) => setForm((prev) => ({ ...prev, [field]: value }));

  const inputStyle: React.CSSProperties = {
    background: "var(--admin-bg-hover)", border: "1px solid var(--admin-border-default)",
    borderRadius: 6, color: "var(--admin-font-primary)", height: 36, fontSize: 13,
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" style={{ background: "var(--admin-bg-hover)" }} />
        <Skeleton className="h-[300px] w-full" style={{ background: "var(--admin-bg-hover)" }} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: "var(--admin-font-primary)", letterSpacing: "-0.01em" }}>
            {t("settings.profilePanel.title")}
          </h1>
          <p style={{ fontSize: 13, color: "var(--admin-font-tertiary)", marginTop: 2 }}>
            {t("settings.profilePanel.subtitle")}
          </p>
        </div>
        <button onClick={handleSave} disabled={updateProfile.isPending}
          style={{
            height: 36, borderRadius: 6, padding: "0 20px", fontSize: 13, fontWeight: 600,
            display: "flex", alignItems: "center", gap: 8,
            background: "var(--admin-accent-green, #10b981)", color: "#fff",
            border: "none", cursor: updateProfile.isPending ? "wait" : "pointer",
            opacity: updateProfile.isPending ? 0.7 : 1,
          }}>
          {updateProfile.isPending ? <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> : <Save style={{ width: 14, height: 14 }} />}
          {t("settings.profilePanel.saveChanges")}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left Column */}
        <div className="lg:col-span-2 space-y-4">
          {/* Contract Status */}
          {profile && (
            <SectionCard icon={Shield} title={t("settings.profilePanel.contractStatus")} subtitle={t("settings.profilePanel.contractStatusSub")} color="#065292">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div style={{ padding: "12px 16px", borderRadius: 8, background: "var(--admin-bg-hover)" }}>
                  <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)", marginBottom: 4 }}>{t("settings.profilePanel.status")}</div>
                  <div style={{
                    fontSize: 14, fontWeight: 600,
                    color: profile.status === "active" ? "#10b981" : "#ef4444",
                    textTransform: "capitalize",
                  }}>
                    {profile.status || "\u2014"}
                  </div>
                </div>
                <div style={{ padding: "12px 16px", borderRadius: 8, background: "var(--admin-bg-hover)" }}>
                  <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)", marginBottom: 4 }}>{t("settings.profilePanel.students")}</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--admin-font-primary)" }}>
                    {profile.currentStudents || 0} / {profile.maxStudents || "\u221e"}
                  </div>
                </div>
                <div style={{ padding: "12px 16px", borderRadius: 8, background: "var(--admin-bg-hover)" }}>
                  <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)", marginBottom: 4 }}>{t("settings.profilePanel.contract")}</div>
                  <div style={{ fontSize: 12, fontWeight: 500, color: "var(--admin-font-primary)" }}>
                    {profile.contractStart ? new Date(profile.contractStart).toLocaleDateString() : "\u2014"} \u2014 {profile.contractEnd ? new Date(profile.contractEnd).toLocaleDateString() : "\u2014"}
                  </div>
                </div>
              </div>
            </SectionCard>
          )}

          {/* Basic Info */}
          <SectionCard icon={Building2} title={t("settings.profilePanel.basicInfo")} subtitle={t("settings.profilePanel.basicInfoSub")} color="#14b8a6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField label={t("settings.profilePanel.schoolName")}>
                <Input value={form.name} onChange={(e) => update("name", e.target.value)} style={inputStyle} />
              </FormField>
              <FormField label={t("settings.profilePanel.phone")}>
                <Input value={form.phone} onChange={(e) => update("phone", e.target.value)} style={inputStyle} />
              </FormField>
              <FormField label={t("settings.profilePanel.contactEmail")}>
                <Input type="email" value={form.email} onChange={(e) => update("email", e.target.value)} style={inputStyle} />
              </FormField>
              <FormField label={t("settings.profilePanel.website")}>
                <Input value={form.website} onChange={(e) => update("website", e.target.value)} style={inputStyle} />
              </FormField>
              <FormField label={t("settings.profilePanel.timezone")}>
                <Select value={form.timezone || ""} onValueChange={(v) => update("timezone", v)}>
                  <SelectTrigger style={{ ...inputStyle, display: "flex" }}>
                    <SelectValue placeholder={t("settings.profilePanel.selectTimezone")} />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    {["America/New_York","America/Chicago","America/Denver","America/Los_Angeles","America/Mexico_City","America/Bogota","America/Lima","America/Sao_Paulo","America/Buenos_Aires","America/Santiago","Europe/London","Europe/Paris","Europe/Berlin","Europe/Madrid","Asia/Dubai","Asia/Kolkata","Asia/Singapore","Asia/Tokyo","Australia/Sydney","UTC"].map((tz) => (
                      <SelectItem key={tz} value={tz}>{tz.replace(/_/g, " ")}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
            </div>
          </SectionCard>

          {/* Address */}
          <SectionCard icon={MapPin} title={t("settings.profilePanel.address")} subtitle={t("settings.profilePanel.addressSub")} color="#f59e0b">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <FormField label={t("settings.profilePanel.street")}>
                  <Input value={form.street} onChange={(e) => update("street", e.target.value)} style={inputStyle} />
                </FormField>
              </div>
              <FormField label={t("settings.profilePanel.city")}>
                <Input value={form.city} onChange={(e) => update("city", e.target.value)} style={inputStyle} />
              </FormField>
              <FormField label={t("settings.profilePanel.stateProvince")}>
                <Input value={form.state} onChange={(e) => update("state", e.target.value)} style={inputStyle} />
              </FormField>
              <FormField label={t("settings.profilePanel.country")}>
                <Input value={form.country} onChange={(e) => update("country", e.target.value)} style={inputStyle} />
              </FormField>
              <FormField label={t("settings.profilePanel.postalCode")}>
                <Input value={form.postalCode} onChange={(e) => update("postalCode", e.target.value)} style={inputStyle} />
              </FormField>
            </div>
          </SectionCard>
        </div>

        {/* Right Column */}
        <div className="space-y-4">
          {/* Logo */}
          <SectionCard icon={Upload} title={t("settings.profilePanel.logo")} subtitle={t("settings.profilePanel.logoSub")} color="#8b5cf6">
            <div className="flex flex-col items-center gap-4">
              {(profile?.logoUrl || profile?.logo) ? (
                <img src={profile.logoUrl || profile.logo || ""} alt="Logo" loading="lazy"
                  style={{ width: 80, height: 80, borderRadius: 12, objectFit: "cover", border: "1px solid var(--admin-border-default)" }} />
              ) : (
                <div style={{
                  width: 80, height: 80, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center",
                  background: "var(--admin-bg-hover)", border: "1px dashed var(--admin-border-default)",
                }}>
                  <Building2 style={{ width: 28, height: 28, color: "var(--admin-font-tertiary)", opacity: 0.4 }} />
                </div>
              )}
              <div style={{ width: "100%" }}>
                <Input type="file" accept="image/*" onChange={handleLogoUpload}
                  style={{ ...inputStyle, padding: "6px 8px", height: "auto" }} />
                <p style={{ fontSize: 11, color: "var(--admin-font-tertiary)", marginTop: 4 }}>{t("settings.profilePanel.logoFormats")}</p>
              </div>
            </div>
          </SectionCard>

          {/* Quick Info */}
          <div style={{
            borderRadius: 8, border: "1px solid var(--admin-border-default)",
            background: "var(--admin-bg-card)", padding: 20,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 16 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#14b8a6" }} />
              <span style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--admin-font-tertiary)" }}>
                {t("settings.profilePanel.schoolInfo")}
              </span>
            </div>
            <div className="space-y-3">
              {[
                { icon: Building2, label: t("settings.profilePanel.name"), value: form.name || "\u2014" },
                { icon: Mail, label: t("settings.profilePanel.email"), value: form.email || "\u2014" },
                { icon: Phone, label: t("settings.profilePanel.phone"), value: form.phone || "\u2014" },
                { icon: Globe, label: t("settings.profilePanel.website"), value: form.website || "\u2014" },
                { icon: MapPin, label: t("settings.profilePanel.location"), value: [form.city, form.state, form.country].filter(Boolean).join(", ") || "\u2014" },
                { icon: Calendar, label: t("settings.profilePanel.timezone"), value: form.timezone?.replace(/_/g, " ") || "\u2014" },
              ].map((row) => (
                <div key={row.label} style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 6,
                  background: "var(--admin-bg-hover)",
                }}>
                  <row.icon style={{ width: 14, height: 14, color: "var(--admin-font-tertiary)", flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 10, color: "var(--admin-font-tertiary)" }}>{row.label}</div>
                    <div style={{ fontSize: 12, fontWeight: 500, color: "var(--admin-font-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {row.value}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
