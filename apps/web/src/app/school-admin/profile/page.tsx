"use client";

import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Building2, Phone, Mail, Globe, MapPin, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { useSchoolProfile, useUpdateSchoolProfile, useUploadSchoolLogo } from "@/hooks/useSchoolProfileQueries";

export default function SchoolProfilePage() {
  const { t } = useTranslation();
  const { data: profile, isLoading } = useSchoolProfile();
  const updateProfile = useUpdateSchoolProfile();
  const uploadLogo = useUploadSchoolLogo();

  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    website: "",
    street: "",
    city: "",
    state: "",
    country: "",
    postalCode: "",
    timezone: "",
  });

  useEffect(() => {
    if (profile) {
      setForm({
        name: profile.name || "",
        phone: profile.phone || "",
        email: profile.email || "",
        website: profile.website || "",
        street: profile.address?.street || "",
        city: profile.address?.city || "",
        state: profile.address?.state || "",
        country: profile.address?.country || "",
        postalCode: profile.address?.postalCode || "",
        timezone: profile.timezone || "",
      });
    }
  }, [profile]);

  const handleSave = () => {
    updateProfile.mutate(
      {
        name: form.name || undefined,
        phone: form.phone || undefined,
        email: form.email || undefined,
        website: form.website || undefined,
        timezone: form.timezone || undefined,
        address: {
          street: form.street,
          city: form.city,
          state: form.state,
          country: form.country,
          postalCode: form.postalCode,
        },
      },
      {
        onSuccess: () => toast.success(t("schoolAdmin.profile.saved", "Profile updated")),
        onError: () => toast.error(t("schoolAdmin.profile.error", "Failed to update profile")),
      }
    );
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    uploadLogo.mutate(file, {
      onSuccess: () => toast.success(t("schoolAdmin.profile.logoUploaded", "Logo uploaded")),
      onError: () => toast.error(t("schoolAdmin.profile.logoError", "Failed to upload logo")),
    });
  };

  const update = (field: string, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="space-y-1">
        <h1 className="text-4xl font-bold tracking-tight text-gray-900">
          {t("schoolAdmin.profile.title", "School Profile")}
        </h1>
        <p className="text-lg text-gray-500 font-medium">
          {t("schoolAdmin.profile.subtitle", "Manage your school information and branding.")}
        </p>
      </motion.div>

      {/* Contract Status */}
      {profile && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <Card className="border-0 shadow-lg">
            <CardHeader className="bg-gradient-to-r from-teal-50 to-cyan-50 border-b border-gray-100">
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-teal-600" />
                {t("schoolAdmin.profile.contractTitle", "Contract Status")}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-gray-500">{t("schoolAdmin.profile.status", "Status")}:</span>
                <span className={`ml-2 font-semibold capitalize ${profile.status === "active" ? "text-green-600" : "text-red-600"}`}>
                  {profile.status}
                </span>
              </div>
              <div>
                <span className="text-gray-500">{t("schoolAdmin.profile.students", "Students")}:</span>
                <span className="ml-2 font-semibold">{profile.currentStudents}/{profile.maxStudents}</span>
              </div>
              <div>
                <span className="text-gray-500">{t("schoolAdmin.profile.contract", "Contract")}:</span>
                <span className="ml-2 font-semibold">
                  {new Date(profile.contractStart).toLocaleDateString()} — {new Date(profile.contractEnd).toLocaleDateString()}
                </span>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Logo */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <Card className="border-0 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5 text-teal-600" />
              {t("schoolAdmin.profile.logoTitle", "School Logo")}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-6">
            {profile?.logo && (
              <img src={profile.logo} alt="School logo" className="h-20 w-20 rounded-lg object-cover border" />
            )}
            <div>
              <Input type="file" accept="image/*" onChange={handleLogoUpload} className="max-w-xs" />
              <p className="text-xs text-gray-400 mt-1">PNG, JPG up to 2MB</p>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Basic Info */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
        <Card className="border-0 shadow-lg">
          <CardHeader className="bg-gradient-to-r from-teal-50 to-cyan-50 border-b border-gray-100">
            <CardTitle>{t("schoolAdmin.profile.basicInfo", "Basic Information")}</CardTitle>
            <CardDescription>{t("schoolAdmin.profile.basicInfoDesc", "School name, contact, and website")}</CardDescription>
          </CardHeader>
          <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("schoolAdmin.profile.schoolName", "School Name")}</Label>
              <Input value={form.name} onChange={(e) => update("name", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1"><Phone className="h-3 w-3" />{t("schoolAdmin.profile.phone", "Phone")}</Label>
              <Input value={form.phone} onChange={(e) => update("phone", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1"><Mail className="h-3 w-3" />{t("schoolAdmin.profile.email", "Email")}</Label>
              <Input type="email" value={form.email} onChange={(e) => update("email", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1"><Globe className="h-3 w-3" />{t("schoolAdmin.profile.website", "Website")}</Label>
              <Input value={form.website} onChange={(e) => update("website", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{t("schoolAdmin.profile.timezone", "Timezone")}</Label>
              <Input value={form.timezone} onChange={(e) => update("timezone", e.target.value)} placeholder="America/Mexico_City" />
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Address */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <Card className="border-0 shadow-lg">
          <CardHeader className="bg-gradient-to-r from-teal-50 to-cyan-50 border-b border-gray-100">
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-teal-600" />
              {t("schoolAdmin.profile.address", "Address")}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2 md:col-span-2">
              <Label>{t("schoolAdmin.profile.street", "Street")}</Label>
              <Input value={form.street} onChange={(e) => update("street", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{t("schoolAdmin.profile.city", "City")}</Label>
              <Input value={form.city} onChange={(e) => update("city", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{t("schoolAdmin.profile.state", "State")}</Label>
              <Input value={form.state} onChange={(e) => update("state", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{t("schoolAdmin.profile.country", "Country")}</Label>
              <Input value={form.country} onChange={(e) => update("country", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{t("schoolAdmin.profile.postalCode", "Postal Code")}</Label>
              <Input value={form.postalCode} onChange={(e) => update("postalCode", e.target.value)} />
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Save */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 }} className="flex justify-end">
        <Button
          onClick={handleSave}
          disabled={updateProfile.isPending}
          className="bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-700 hover:to-cyan-700 text-white px-8"
        >
          {updateProfile.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t("schoolAdmin.profile.save", "Save Changes")}
        </Button>
      </motion.div>
    </div>
  );
}
