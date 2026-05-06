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

export default function SchoolProfilePage() {
  const { t } = useTranslation();
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
      website: form.website || undefined, timezone: form.timezone || undefined,
      address: { street: form.street, city: form.city, state: form.state, country: form.country, postalCode: form.postalCode },
    }, {
      onSuccess: () => toast.success("Profile updated"),
      onError: () => toast.error("Failed to update profile"),
    });
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error("Max 2MB"); e.target.value = ""; return; }
    uploadLogo.mutate(file, {
      onSuccess: () => toast.success("Logo uploaded"),
      onError: () => toast.error("Failed to upload logo"),
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
            School Profile
          </h1>
          <p style={{ fontSize: 13, color: "var(--admin-font-tertiary)", marginTop: 2 }}>
            Manage your school information and branding
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
          Save Changes
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left Column */}
        <div className="lg:col-span-2 space-y-4">
          {/* Contract Status */}
          {profile && (
            <SectionCard icon={Shield} title="Contract Status" subtitle="Subscription and enrollment info" color="#3b82f6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div style={{ padding: "12px 16px", borderRadius: 8, background: "var(--admin-bg-hover)" }}>
                  <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)", marginBottom: 4 }}>Status</div>
                  <div style={{
                    fontSize: 14, fontWeight: 600,
                    color: profile.status === "active" ? "#10b981" : "#ef4444",
                    textTransform: "capitalize",
                  }}>
                    {profile.status || "—"}
                  </div>
                </div>
                <div style={{ padding: "12px 16px", borderRadius: 8, background: "var(--admin-bg-hover)" }}>
                  <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)", marginBottom: 4 }}>Students</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--admin-font-primary)" }}>
                    {profile.currentStudents || 0} / {profile.maxStudents || "∞"}
                  </div>
                </div>
                <div style={{ padding: "12px 16px", borderRadius: 8, background: "var(--admin-bg-hover)" }}>
                  <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)", marginBottom: 4 }}>Contract</div>
                  <div style={{ fontSize: 12, fontWeight: 500, color: "var(--admin-font-primary)" }}>
                    {profile.contractStart ? new Date(profile.contractStart).toLocaleDateString() : "—"} — {profile.contractEnd ? new Date(profile.contractEnd).toLocaleDateString() : "—"}
                  </div>
                </div>
              </div>
            </SectionCard>
          )}

          {/* Basic Info */}
          <SectionCard icon={Building2} title="Basic Information" subtitle="School name, contact, and website" color="#14b8a6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField label="School Name">
                <Input value={form.name} onChange={(e) => update("name", e.target.value)} style={inputStyle} />
              </FormField>
              <FormField label="Phone">
                <Input value={form.phone} onChange={(e) => update("phone", e.target.value)} style={inputStyle} />
              </FormField>
              <FormField label="Contact Email">
                <Input type="email" value={form.email} onChange={(e) => update("email", e.target.value)} style={inputStyle} />
              </FormField>
              <FormField label="Website">
                <Input value={form.website} onChange={(e) => update("website", e.target.value)} style={inputStyle} />
              </FormField>
              <FormField label="Timezone">
                <Select value={form.timezone || ""} onValueChange={(v) => update("timezone", v)}>
                  <SelectTrigger style={{ ...inputStyle, display: "flex" }}>
                    <SelectValue placeholder="Select timezone" />
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
          <SectionCard icon={MapPin} title="Address" subtitle="Physical location" color="#f59e0b">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <FormField label="Street">
                  <Input value={form.street} onChange={(e) => update("street", e.target.value)} style={inputStyle} />
                </FormField>
              </div>
              <FormField label="City">
                <Input value={form.city} onChange={(e) => update("city", e.target.value)} style={inputStyle} />
              </FormField>
              <FormField label="State / Province">
                <Input value={form.state} onChange={(e) => update("state", e.target.value)} style={inputStyle} />
              </FormField>
              <FormField label="Country">
                <Input value={form.country} onChange={(e) => update("country", e.target.value)} style={inputStyle} />
              </FormField>
              <FormField label="Postal Code">
                <Input value={form.postalCode} onChange={(e) => update("postalCode", e.target.value)} style={inputStyle} />
              </FormField>
            </div>
          </SectionCard>
        </div>

        {/* Right Column */}
        <div className="space-y-4">
          {/* Logo */}
          <SectionCard icon={Upload} title="School Logo" subtitle="Brand identity" color="#8b5cf6">
            <div className="flex flex-col items-center gap-4">
              {profile?.logoUrl ? (
                <img src={profile.logo} alt="Logo" loading="lazy"
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
                <p style={{ fontSize: 11, color: "var(--admin-font-tertiary)", marginTop: 4 }}>PNG, JPG up to 2MB</p>
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
                School Info
              </span>
            </div>
            <div className="space-y-3">
              {[
                { icon: Building2, label: "Name", value: form.name || "—" },
                { icon: Mail, label: "Email", value: form.email || "—" },
                { icon: Phone, label: "Phone", value: form.phone || "—" },
                { icon: Globe, label: "Website", value: form.website || "—" },
                { icon: MapPin, label: "Location", value: [form.city, form.state, form.country].filter(Boolean).join(", ") || "—" },
                { icon: Calendar, label: "Timezone", value: form.timezone?.replace(/_/g, " ") || "—" },
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
