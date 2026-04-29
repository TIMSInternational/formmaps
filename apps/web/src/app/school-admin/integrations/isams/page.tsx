"use client";

import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { saveIsamsConfig, getIsamsStatus, triggerIsamsSync } from "@/services/isamsService";
import { useSchoolAdminAccess } from "@/hooks/useSchoolAdminAccess";

export default function ISAMSIntegrationPage() {
  const { t } = useTranslation();
  const { schoolId } = useSchoolAdminAccess();
  const [endpoint, setEndpoint] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    if (!schoolId) return toast.error(t("schoolAdmin.integrations.noSchool", "Missing school context"));
    setLoading(true);
    try {
      await saveIsamsConfig(schoolId, { endpoint, apiKey });
      toast.success(t("schoolAdmin.integrations.saved", "Configuration saved"));
    } catch (err: any) {
      toast.error(err?.message || t("schoolAdmin.integrations.saveError", "Save failed"));
    } finally {
      setLoading(false);
    }
  };

  const handleTest = async () => {
    if (!schoolId) return toast.error(t("schoolAdmin.integrations.noSchool", "Missing school context"));
    setLoading(true);
    try {
      const status = await getIsamsStatus(schoolId);
      toast.success(t("schoolAdmin.integrations.status", { status: status.connected ? "Connected" : "Disconnected" }));
    } catch (err: any) {
      toast.error(err?.message || t("schoolAdmin.integrations.testError", "Test failed"));
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    if (!schoolId) return toast.error(t("schoolAdmin.integrations.noSchool", "Missing school context"));
    setLoading(true);
    try {
      await triggerIsamsSync(schoolId);
      toast.success(t("schoolAdmin.integrations.syncStarted", "Sync started"));
    } catch (err: any) {
      toast.error(err?.message || t("schoolAdmin.integrations.syncError", "Sync failed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border rounded p-4">
        <h3 className="text-lg font-semibold">{t("schoolAdmin.integrations.isams.title", "iSAMS Integration")}</h3>
        <p className="text-sm text-gray-500">{t("schoolAdmin.integrations.isams.desc", "Configure SIS connection for roster & grades sync")}</p>

        <div className="mt-4 grid grid-cols-1 gap-3">
          <label className="text-sm text-gray-700">{t("schoolAdmin.integrations.isams.endpoint", "iSAMS Endpoint")}</label>
          <Input value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="https://api.isams.example" />

          <label className="text-sm text-gray-700">{t("schoolAdmin.integrations.isams.apiKey", "API Key / Client Secret")}</label>
          <Input value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="********" type="password" />

          <div className="flex gap-2 pt-2">
            <Button onClick={handleTest} disabled={loading}>{t("common.test", "Test Connection")}</Button>
            <Button onClick={handleSave} disabled={loading}>{t("common.save", "Save")}</Button>
            <Button variant="ghost" onClick={handleSync} disabled={loading}>{t("schoolAdmin.integrations.isams.syncNow", "Trigger Sync")}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
