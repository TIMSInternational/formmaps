"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { useAdminAccess } from "@/hooks/useAdminAccess";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { DashboardSkeleton } from "@/components/skeletons/DashboardSkeleton";
import {
  Loader2,
  Shield,
  CreditCard,
  Globe,
  Save,
  Mail,
  HardDrive,
  FileText,
  HelpCircle,
  AlertTriangle
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { apiRequest } from "@/lib/api/apiClient";
interface AdminSettings {
  general: {
    siteName: string;
    supportEmail: string;
    maintenanceMode: boolean;
  };
  finance: {
    platformFeePercent: number;
    currency: string;
    payoutSchedule: string;
  };
  security: {
    sessionTimeoutMinutes: number;
  };
  system: {
    maxUploadSizeMB: number;
  };
  legal: {
    privacyUrl: string;
    termsUrl: string;
    helpUrl: string;
  };
}

export default function AdminSettingsPage() {
  const router = useRouter();
  const { isAdmin, loading: authLoading } = useAdminAccess();
  const { t } = useTranslation("platform_owner");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<AdminSettings>({
    general: { siteName: "TimCare", supportEmail: "support@timcare.com", maintenanceMode: false },
    finance: { platformFeePercent: 15, currency: "USD", payoutSchedule: "monthly" },
    security: { sessionTimeoutMinutes: 60 },
    system: { maxUploadSizeMB: 10 },
    legal: {
      privacyUrl: "https://timcare.com/privacy",
      termsUrl: "https://timcare.com/terms",
      helpUrl: "https://help.timcare.com"
    },
  });

  // Fetch settings from backend
  useEffect(() => {
    if (!authLoading && isAdmin) {
      (async () => {
        try {
          const data = await apiRequest("/api/v1/admin/settings", { method: "GET" });
          const s = data?.data ?? data;
          if (s) setSettings((prev) => ({ ...prev, ...s }));
        } catch {
          // Use defaults on first run (settings may not exist yet)
        } finally {
          setLoading(false);
        }
      })();
    }
  }, [authLoading, isAdmin]);

  // Handle access
  useEffect(() => {
    if (!authLoading && !isAdmin) {
      router.push("/login");
    }
  }, [isAdmin, authLoading, router]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiRequest("/api/v1/admin/settings", {
        method: "PUT",
        data: settings,
      });
      toast.success(t("settings.toast.savedSuccess"));
    } catch (error: any) {
      toast.error(error?.message || t("settings.toast.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const updateSetting = (section: keyof AdminSettings, key: string, value: any) => {
    setSettings(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [key]: value
      }
    }));
  };

  if (authLoading || loading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="space-y-8">

        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="space-y-1">
            <h1 className="text-4xl font-bold tracking-tight text-gray-900">
              {t("settings.title")}
            </h1>
            <p className="text-lg text-gray-500 font-medium">
              {t("settings.subtitle")}
            </p>
          </div>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="hidden md:flex bg-gray-900 hover:bg-gray-800 text-white rounded-xl shadow-sm px-6 h-12"
          >
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            {t("settings.saveButton")}
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* Left Column (General & Legal) */}
          <div className="space-y-8 lg:col-span-2">

            {/* General Settings */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 md:p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2.5 bg-[#2E9098]/10 rounded-xl text-[#2E9098]">
                  <Globe className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">{t("settings.general.sectionTitle")}</h2>
                  <p className="text-sm text-gray-500">{t("settings.general.sectionDesc")}</p>
                </div>
              </div>

              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label className="text-gray-700 font-medium">{t("settings.general.siteName")}</Label>
                    <Input
                      value={settings.general.siteName}
                      onChange={(e) => updateSetting('general', 'siteName', e.target.value)}
                      className="h-11 rounded-xl border-gray-200 focus:ring-[#2E9098]/20 focus:border-[#2E9098]"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-gray-700 font-medium">{t("settings.general.supportEmail")}</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input
                        type="email"
                        value={settings.general.supportEmail}
                        onChange={(e) => updateSetting('general', 'supportEmail', e.target.value)}
                        className="h-11 pl-9 rounded-xl border-gray-200 focus:ring-[#2E9098]/20 focus:border-[#2E9098]"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-100">
                  <div className="space-y-0.5">
                    <Label className="text-base font-semibold text-gray-900">{t("settings.general.maintenanceMode")}</Label>
                    <p className="text-sm text-gray-500">{t("settings.general.maintenanceModeDesc")}</p>
                  </div>
                  <Switch
                    checked={settings.general.maintenanceMode}
                    onCheckedChange={(c) => updateSetting('general', 'maintenanceMode', c)}
                  />
                </div>
              </div>
            </div>

            {/* Legal & Support */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 md:p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2.5 bg-slate-50 rounded-xl text-slate-600">
                  <FileText className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">{t("settings.legal.sectionTitle")}</h2>
                  <p className="text-sm text-gray-500">{t("settings.legal.sectionDesc")}</p>
                </div>
              </div>

              <div className="space-y-5">
                <div className="space-y-2">
                  <Label className="text-gray-700 font-medium">{t("settings.legal.privacyUrl")}</Label>
                  <Input
                    value={settings.legal.privacyUrl}
                    onChange={(e) => updateSetting('legal', 'privacyUrl', e.target.value)}
                    className="h-11 rounded-xl border-gray-200 focus:ring-slate-100 focus:border-slate-500"
                    placeholder="https://..."
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-gray-700 font-medium">{t("settings.legal.termsUrl")}</Label>
                  <Input
                    value={settings.legal.termsUrl}
                    onChange={(e) => updateSetting('legal', 'termsUrl', e.target.value)}
                    className="h-11 rounded-xl border-gray-200 focus:ring-slate-100 focus:border-slate-500"
                    placeholder="https://..."
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-gray-700 font-medium">{t("settings.legal.helpUrl")}</Label>
                    <HelpCircle className="h-4 w-4 text-gray-400" />
                  </div>
                  <Input
                    value={settings.legal.helpUrl}
                    onChange={(e) => updateSetting('legal', 'helpUrl', e.target.value)}
                    className="h-11 rounded-xl border-gray-200 focus:ring-slate-100 focus:border-slate-500"
                    placeholder="https://..."
                  />
                </div>
              </div>
            </div>

          </div>

          {/* Right Column (Finance, Security, System) */}
          <div className="space-y-8">

            {/* Finance */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2.5 bg-emerald-50 rounded-xl text-emerald-600">
                  <CreditCard className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">{t("settings.finance.sectionTitle")}</h2>
                  <p className="text-sm text-gray-500">{t("settings.finance.sectionDesc")}</p>
                </div>
              </div>

              <div className="space-y-5">
                <div className="space-y-2">
                  <Label className="text-gray-700">{t("settings.finance.platformFee")}</Label>
                  <div className="relative">
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      value={settings.finance.platformFeePercent}
                      onChange={(e) => updateSetting('finance', 'platformFeePercent', Number(e.target.value))}
                      className="h-11 rounded-xl border-gray-200 focus:ring-emerald-100 focus:border-emerald-500 pr-8"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 font-medium">%</span>
                  </div>
                  <p className="text-xs text-gray-500">{t("settings.finance.platformFeeDesc")}</p>
                </div>

                <Separator />

                <div className="space-y-2">
                  <Label className="text-gray-700">{t("settings.finance.currency")}</Label>
                  <Select
                    value={settings.finance.currency}
                    onValueChange={(v) => updateSetting('finance', 'currency', v)}
                  >
                    <SelectTrigger className="h-11 rounded-xl border-gray-200 bg-gray-50/50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">USD ($)</SelectItem>
                      <SelectItem value="EUR">EUR (€)</SelectItem>
                      <SelectItem value="GBP">GBP (£)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-gray-700">{t("settings.finance.payoutSchedule")}</Label>
                  <Select
                    value={settings.finance.payoutSchedule}
                    onValueChange={(v) => updateSetting('finance', 'payoutSchedule', v)}
                  >
                    <SelectTrigger className="h-11 rounded-xl border-gray-200 bg-gray-50/50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="weekly">{t("settings.finance.scheduleWeekly")}</SelectItem>
                      <SelectItem value="biweekly">{t("settings.finance.scheduleBiweekly")}</SelectItem>
                      <SelectItem value="monthly">{t("settings.finance.scheduleMonthly")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Security */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2.5 bg-rose-50 rounded-xl text-rose-600">
                  <Shield className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">{t("settings.security.sectionTitle")}</h2>
                  <p className="text-sm text-gray-500">{t("settings.security.sectionDesc")}</p>
                </div>
              </div>

              <div className="space-y-6">
                <div className="space-y-2">
                  <Label className="text-gray-700">{t("settings.security.sessionTimeout")}</Label>
                  <Input
                    type="number"
                    min="1"
                    value={settings.security.sessionTimeoutMinutes}
                    onChange={(e) => updateSetting('security', 'sessionTimeoutMinutes', Number(e.target.value))}
                    className="h-11 rounded-xl border-gray-200 focus:ring-rose-100 focus:border-rose-500"
                  />
                </div>
              </div>
            </div>

            {/* System */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2.5 bg-indigo-50 rounded-xl text-indigo-600">
                  <HardDrive className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">{t("settings.system.sectionTitle")}</h2>
                  <p className="text-sm text-gray-500">{t("settings.system.sectionDesc")}</p>
                </div>
              </div>

              <div className="space-y-6">
                <div className="space-y-2">
                  <Label className="text-gray-700">{t("settings.system.maxUpload")}</Label>
                  <div className="relative">
                    <Input
                      type="number"
                      min="1"
                      max="500"
                      value={settings.system.maxUploadSizeMB}
                      onChange={(e) => updateSetting('system', 'maxUploadSizeMB', Number(e.target.value))}
                      className="h-11 rounded-xl border-gray-200 focus:ring-indigo-100 focus:border-indigo-500 pr-12"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 font-medium">MB</span>
                  </div>
                  <p className="text-xs text-gray-500">{t("settings.system.maxUploadDesc")}</p>
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* Mobile Save Button */}
        <div className="md:hidden fixed bottom-6 right-6">
          <Button
            onClick={handleSave}
            disabled={saving}
            size="lg"
            className="rounded-full h-14 w-14 p-0 bg-gray-900 shadow-lg"
          >
            {saving ? <Loader2 className="h-6 w-6 animate-spin" /> : <Save className="h-6 w-6" />}
          </Button>
        </div>

    </div>
  );
}
