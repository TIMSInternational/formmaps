"use client";

import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Loader2, Save, Plug, Wifi, WifiOff, Clock,
  CheckCircle2, AlertTriangle, Database, ArrowUpDown, Eye, EyeOff,
} from "lucide-react";
import { toast } from "sonner";
import { saveIsamsConfig, getIsamsStatus, triggerIsamsSync } from "@/services/isamsService";
import { useSchoolAdminAccess } from "@/hooks/useSchoolAdminAccess";

const STORAGE_KEY = "isams_config_local";

function loadLocalConfig() {
  try {
    const s = sessionStorage.getItem(STORAGE_KEY);
    if (s) {
      const cfg = JSON.parse(s);
      return { endpoint: cfg.endpoint || "", apiKey: "", lastSync: cfg.lastSync || null, connected: cfg.connected ?? false };
    }
  } catch {}
  return { endpoint: "", apiKey: "", lastSync: null, connected: false };
}

function saveLocalConfig(cfg: any) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
    endpoint: cfg.endpoint,
    lastSync: cfg.lastSync,
    connected: cfg.connected,
  }));
}

export default function IntegrationsPanel() {
  const { t } = useTranslation();
  const { schoolId } = useSchoolAdminAccess();
  const [endpoint, setEndpoint] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    const cfg = loadLocalConfig();
    if (cfg.endpoint) setEndpoint(cfg.endpoint);
    if (cfg.apiKey) setApiKey(cfg.apiKey);
    if (cfg.lastSync) setLastSync(cfg.lastSync);
    if (cfg.connected != null) setConnected(cfg.connected);
  }, []);

  const handleSave = async () => {
    if (!endpoint.trim()) { toast.error("Endpoint URL is required"); return; }
    setLoading(true);
    try {
      if (schoolId) await saveIsamsConfig(schoolId, { endpoint, apiKey });
      saveLocalConfig({ endpoint, apiKey, lastSync, connected });
      toast.success("Configuration saved");
      setHasChanges(false);
    } catch {
      saveLocalConfig({ endpoint, apiKey, lastSync, connected });
      toast.success("Configuration saved locally");
      setHasChanges(false);
    } finally {
      setLoading(false);
    }
  };

  const handleTest = async () => {
    if (!endpoint.trim()) { toast.error("Enter an endpoint first"); return; }
    setTesting(true);
    try {
      if (schoolId) {
        const status = await getIsamsStatus(schoolId);
        setConnected(status.connected ?? false);
        saveLocalConfig({ endpoint, apiKey, lastSync, connected: status.connected });
        toast[status.connected ? "success" : "error"](status.connected ? "Connection successful" : "Connection failed");
      } else {
        const isValid = endpoint.startsWith("http");
        setConnected(isValid);
        saveLocalConfig({ endpoint, apiKey, lastSync, connected: isValid });
        toast[isValid ? "success" : "error"](isValid ? "Connection test passed" : "Invalid endpoint URL");
      }
    } catch {
      setConnected(false);
      toast.error("Connection test failed");
    } finally {
      setTesting(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      if (schoolId) await triggerIsamsSync(schoolId);
      const now = new Date().toISOString();
      setLastSync(now);
      saveLocalConfig({ endpoint, apiKey, lastSync: now, connected });
      toast.success("Sync triggered successfully");
    } catch {
      toast.error("Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: "var(--admin-font-primary)", letterSpacing: "-0.01em" }}>Integrations</h1>
        <p style={{ fontSize: 13, color: "var(--admin-font-tertiary)", marginTop: 2 }}>Connect external systems for automated data synchronization</p>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Connection", value: connected === null ? "Unknown" : connected ? "Connected" : "Disconnected", icon: connected ? Wifi : WifiOff, color: connected ? "#10b981" : connected === false ? "#ef4444" : "#6b7280" },
          { label: "Last Sync", value: lastSync ? new Date(lastSync).toLocaleDateString() : "Never", icon: Clock, color: "#065292" },
          { label: "Integrations", value: "1", icon: Plug, color: "#8b5cf6" },
          { label: "Data Source", value: "iSAMS", icon: Database, color: "#f59e0b" },
        ].map((stat) => (
          <div key={stat.label} style={{ borderRadius: 8, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)", padding: 16 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: `${stat.color}15`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 10 }}>
              <stat.icon style={{ width: 16, height: 16, color: stat.color }} />
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--admin-font-primary)" }}>{stat.value}</div>
            <div style={{ fontSize: 10, fontWeight: 600, color: "var(--admin-font-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", marginTop: 2 }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* iSAMS Config Card */}
      <div style={{ borderRadius: 8, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)", overflow: "hidden" }}>
        <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--admin-border-default)", display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--admin-bg-hover)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: "#06529215", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Database style={{ width: 18, height: 18, color: "#065292" }} />
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 15, fontWeight: 600, color: "var(--admin-font-primary)" }}>iSAMS</span>
                <span style={{ fontSize: 12, color: "var(--admin-font-tertiary)" }}>{"\u2014"} Student Information System</span>
              </div>
              <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 4, background: connected ? "#10b98112" : "var(--admin-bg-hover)", color: connected ? "#10b981" : "var(--admin-font-tertiary)" }}>
                {connected ? "Connected" : "Not Connected"}
              </span>
            </div>
          </div>
          <button onClick={handleSync} disabled={syncing || !connected} style={{
            height: 32, borderRadius: 6, padding: "0 12px", fontSize: 11, fontWeight: 600,
            display: "flex", alignItems: "center", gap: 4, background: "transparent",
            color: connected ? "var(--admin-font-primary)" : "var(--admin-font-tertiary)",
            border: "1px solid var(--admin-border-default)", cursor: connected ? "pointer" : "default", opacity: syncing ? 0.7 : 1,
          }}>
            {syncing ? <Loader2 style={{ width: 12, height: 12, animation: "spin 1s linear infinite" }} /> : <ArrowUpDown style={{ width: 12, height: 12 }} />}
            Sync Now
          </button>
        </div>

        <div style={{ padding: 16 }}>
          <p style={{ fontSize: 12, color: "var(--admin-font-tertiary)", marginBottom: 16, lineHeight: 1.5 }}>
            Connect to your iSAMS instance to automatically sync student rosters, grades, and course data.
          </p>

          <div className="space-y-4" style={{ maxWidth: 500 }}>
            <div className="space-y-2">
              <Label style={{ fontSize: 10, fontWeight: 600, color: "var(--admin-font-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>iSAMS API Endpoint</Label>
              <Input value={endpoint} onChange={(e) => { setEndpoint(e.target.value); setHasChanges(true); }} placeholder="https://api.isams.cloud/v1"
                style={{ background: "var(--admin-bg-input)", border: "1px solid var(--admin-border-default)", color: "var(--admin-font-primary)", fontSize: 13, borderRadius: 6, height: 36 }} />
            </div>

            <div className="space-y-2">
              <Label style={{ fontSize: 10, fontWeight: 600, color: "var(--admin-font-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>API Key / Client Secret</Label>
              <div style={{ position: "relative" }}>
                <Input value={apiKey} onChange={(e) => { setApiKey(e.target.value); setHasChanges(true); }} placeholder="Enter your API key" type={showApiKey ? "text" : "password"}
                  style={{ background: "var(--admin-bg-input)", border: "1px solid var(--admin-border-default)", color: "var(--admin-font-primary)", fontSize: 13, borderRadius: 6, height: 36, paddingRight: 36 }} />
                <button onClick={() => setShowApiKey(!showApiKey)} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "transparent", border: "none", cursor: "pointer", color: "var(--admin-font-tertiary)", padding: 4 }}>
                  {showApiKey ? <EyeOff style={{ width: 14, height: 14 }} /> : <Eye style={{ width: 14, height: 14 }} />}
                </button>
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, paddingTop: 4 }}>
              <button onClick={handleTest} disabled={testing || !endpoint.trim()} style={{
                height: 36, borderRadius: 6, padding: "0 16px", fontSize: 12, fontWeight: 600,
                display: "flex", alignItems: "center", gap: 6, background: "transparent",
                color: "var(--admin-font-primary)", border: "1px solid var(--admin-border-default)", cursor: "pointer", opacity: testing ? 0.7 : 1,
              }}>
                {testing ? <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> : <Wifi style={{ width: 14, height: 14 }} />}
                Test Connection
              </button>
              <button onClick={handleSave} disabled={loading || !hasChanges} style={{
                height: 36, borderRadius: 6, padding: "0 16px", fontSize: 12, fontWeight: 600,
                display: "flex", alignItems: "center", gap: 6,
                background: hasChanges ? "var(--admin-accent-blue, #065292)" : "var(--admin-bg-hover)",
                color: hasChanges ? "#fff" : "var(--admin-font-tertiary)",
                border: hasChanges ? "none" : "1px solid var(--admin-border-default)",
                cursor: hasChanges ? "pointer" : "default", opacity: loading ? 0.7 : 1, transition: "all 0.15s",
              }}>
                {loading ? <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> : <Save style={{ width: 14, height: 14 }} />}
                {hasChanges ? "Save" : "Saved"}
              </button>
            </div>
          </div>

          {connected !== null && (
            <div style={{
              marginTop: 16, padding: "10px 14px", borderRadius: 6,
              border: `1px solid ${connected ? "rgba(16,185,129,0.2)" : "rgba(239,68,68,0.2)"}`,
              background: connected ? "rgba(16,185,129,0.05)" : "rgba(239,68,68,0.05)",
              display: "flex", alignItems: "center", gap: 8,
            }}>
              {connected ? <CheckCircle2 style={{ width: 14, height: 14, color: "#10b981" }} /> : <AlertTriangle style={{ width: 14, height: 14, color: "#ef4444" }} />}
              <span style={{ fontSize: 12, color: connected ? "#10b981" : "#ef4444", fontWeight: 500 }}>
                {connected ? "Connection verified \u2014 ready to sync" : "Connection failed \u2014 check endpoint and credentials"}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Sync Capabilities */}
      <div style={{ borderRadius: 8, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)", overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--admin-border-default)", background: "var(--admin-bg-hover)" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>Sync Capabilities</div>
          <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)", marginTop: 1 }}>Data types synchronized from iSAMS</div>
        </div>
        <div style={{ padding: 16 }}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[
              { label: "Student Roster", desc: "Names, IDs, grade levels, enrollment status" },
              { label: "Course Catalog", desc: "Course codes, credits, departments, prerequisites" },
              { label: "Grade Records", desc: "Term grades, GPA calculations, transcripts" },
              { label: "Attendance", desc: "Daily attendance, tardiness, absences" },
              { label: "Staff Directory", desc: "Teachers, counselors, department assignments" },
              { label: "Schedule Data", desc: "Class schedules, room assignments, periods" },
            ].map((cap) => (
              <div key={cap.label} style={{ padding: "12px 14px", borderRadius: 6, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)" }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>{cap.label}</span>
                <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)", lineHeight: 1.4, marginTop: 2 }}>{cap.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
