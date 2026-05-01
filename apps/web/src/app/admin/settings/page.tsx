"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
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

// Mock Data Type - In real app, this comes from API
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

  // Mock Fetch
  useEffect(() => {
    if (!authLoading && isAdmin) {
      // Simulate API call
      setTimeout(() => setLoading(false), 800);
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
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1500));
    toast.success("Settings updated successfully");
    setSaving(false);
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
              Platform Settings
            </h1>
            <p className="text-lg text-gray-500 font-medium">
              Manage global configuration, payments, and security protocols
            </p>
          </div>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="hidden md:flex bg-gray-900 hover:bg-gray-800 text-white rounded-xl shadow-sm px-6 h-12"
          >
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save Changes
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* Left Column (General & Legal) */}
          <div className="space-y-8 lg:col-span-2">

            {/* General Settings */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 md:p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2.5 bg-blue-50 rounded-xl text-blue-600">
                  <Globe className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">General Information</h2>
                  <p className="text-sm text-gray-500">Basic platform details and branding</p>
                </div>
              </div>

              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label className="text-gray-700 font-medium">Site Name</Label>
                    <Input
                      value={settings.general.siteName}
                      onChange={(e) => updateSetting('general', 'siteName', e.target.value)}
                      className="h-11 rounded-xl border-gray-200 focus:ring-blue-100 focus:border-blue-500"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-gray-700 font-medium">Support Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input
                        type="email"
                        value={settings.general.supportEmail}
                        onChange={(e) => updateSetting('general', 'supportEmail', e.target.value)}
                        className="h-11 pl-9 rounded-xl border-gray-200 focus:ring-blue-100 focus:border-blue-500"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-100">
                  <div className="space-y-0.5">
                    <Label className="text-base font-semibold text-gray-900">Maintenance Mode</Label>
                    <p className="text-sm text-gray-500">Temporarily disable access for all users except admins</p>
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
                  <h2 className="text-xl font-bold text-gray-900">Legal & Support</h2>
                  <p className="text-sm text-gray-500">External links and policy configs</p>
                </div>
              </div>

              <div className="space-y-5">
                <div className="space-y-2">
                  <Label className="text-gray-700 font-medium">Privacy Policy URL</Label>
                  <Input
                    value={settings.legal.privacyUrl}
                    onChange={(e) => updateSetting('legal', 'privacyUrl', e.target.value)}
                    className="h-11 rounded-xl border-gray-200 focus:ring-slate-100 focus:border-slate-500"
                    placeholder="https://..."
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-gray-700 font-medium">Terms of Service URL</Label>
                  <Input
                    value={settings.legal.termsUrl}
                    onChange={(e) => updateSetting('legal', 'termsUrl', e.target.value)}
                    className="h-11 rounded-xl border-gray-200 focus:ring-slate-100 focus:border-slate-500"
                    placeholder="https://..."
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-gray-700 font-medium">Help Center URL</Label>
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
                  <h2 className="text-xl font-bold text-gray-900">Finance</h2>
                  <p className="text-sm text-gray-500">Fees & Payouts</p>
                </div>
              </div>

              <div className="space-y-5">
                <div className="space-y-2">
                  <Label className="text-gray-700">Platform Fee (%)</Label>
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
                  <p className="text-xs text-gray-500">Percentage taken from every transaction</p>
                </div>

                <Separator />

                <div className="space-y-2">
                  <Label className="text-gray-700">Currency</Label>
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
                  <Label className="text-gray-700">Payout Schedule</Label>
                  <Select
                    value={settings.finance.payoutSchedule}
                    onValueChange={(v) => updateSetting('finance', 'payoutSchedule', v)}
                  >
                    <SelectTrigger className="h-11 rounded-xl border-gray-200 bg-gray-50/50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="biweekly">Bi-Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
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
                  <h2 className="text-xl font-bold text-gray-900">Security</h2>
                  <p className="text-sm text-gray-500">Access controls</p>
                </div>
              </div>

              <div className="space-y-6">
                <div className="space-y-2">
                  <Label className="text-gray-700">Session Timeout (Minutes)</Label>
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
                  <h2 className="text-xl font-bold text-gray-900">System</h2>
                  <p className="text-sm text-gray-500">Storage & Limits</p>
                </div>
              </div>

              <div className="space-y-6">
                <div className="space-y-2">
                  <Label className="text-gray-700">Max Upload Size (MB)</Label>
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
                  <p className="text-xs text-gray-500">Limit for user file uploads</p>
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
