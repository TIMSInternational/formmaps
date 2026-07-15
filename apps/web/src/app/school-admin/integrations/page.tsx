"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { motion } from "motion/react";
import { Plug, Database, Globe, Shield, CheckCircle2, XCircle, ArrowRight, Settings } from "lucide-react";

interface Integration {
  id: string; name: string; descKey: string; icon: typeof Plug; status: "connected" | "available" | "coming_soon";
  color: string; href?: string;
}

const INTEGRATIONS: Integration[] = [
  { id: "isams", name: "iSAMS", descKey: "isams", icon: Database, status: "available", color: "#2E9098", href: "/school-admin/integrations/isams" },
  { id: "tims", name: "TIMS PCA", descKey: "tims", icon: Shield, status: "connected", color: "#10b981" },
  { id: "google", name: "Google Workspace", descKey: "google", icon: Globe, status: "coming_soon", color: "#f59e0b" },
  { id: "canvas", name: "Canvas LMS", descKey: "canvas", icon: Database, status: "coming_soon", color: "#ef4444" },
  { id: "powerschool", name: "PowerSchool", descKey: "powerschool", icon: Database, status: "coming_soon", color: "#8b5cf6" },
];

const STATUS_STYLES: Record<string, { key: string; bg: string; color: string }> = {
  connected: { key: "connected", bg: "rgba(16,185,129,0.1)", color: "#10b981" },
  available: { key: "available", bg: "rgba(59,130,246,0.1)", color: "#2E9098" },
  coming_soon: { key: "comingSoon", bg: "rgba(107,114,128,0.1)", color: "#6b7280" },
};

export default function IntegrationsPage() {
  const { t } = useTranslation("school_admin");
  const router = useRouter();

  const connected = INTEGRATIONS.filter(i => i.status === "connected").length;
  const available = INTEGRATIONS.filter(i => i.status === "available").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
        <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.2em", fontWeight: 700, color: "var(--admin-font-light)" }}>{t("integrations.label")}</span>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--admin-font-primary)", marginTop: 4, letterSpacing: "-0.02em" }}>{t("integrations.title")}</h1>
        <p style={{ fontSize: 14, color: "var(--admin-font-tertiary)", marginTop: 4 }}>{t("integrations.subtitle")}</p>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        {[
          { label: t("integrations.stats.connected"), value: connected.toString(), icon: CheckCircle2, color: "#10b981" },
          { label: t("integrations.stats.available"), value: available.toString(), icon: Plug, color: "#2E9098" },
          { label: t("integrations.stats.total"), value: INTEGRATIONS.length.toString(), icon: Settings, color: "#2E9098" },
        ].map((s) => (
          <div key={s.label} style={{ borderRadius: 10, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)", padding: 16 }}>
            <s.icon style={{ width: 16, height: 16, color: s.color, marginBottom: 8 }} />
            <div style={{ fontSize: 22, fontWeight: 600, color: "var(--admin-font-primary)" }}>{s.value}</div>
            <div style={{ fontSize: 12, color: "var(--admin-font-tertiary)", marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
        {INTEGRATIONS.map((integration) => {
          const s = STATUS_STYLES[integration.status];
          return (
            <div key={integration.id}
              onClick={() => integration.href && router.push(integration.href)}
              style={{
                borderRadius: 12, border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)",
                padding: 20, display: "flex", flexDirection: "column", gap: 12,
                cursor: integration.href ? "pointer" : "default", transition: "border-color 0.15s",
              }}
              onMouseEnter={(e) => { if (integration.href) e.currentTarget.style.borderColor = integration.color; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--admin-border-default)"; }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: `${integration.color}15`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <integration.icon style={{ width: 20, height: 20, color: integration.color }} />
                </div>
                <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 4, background: s.bg, color: s.color, textTransform: "uppercase", letterSpacing: "0.04em" }}>{t(`integrations.status.${s.key}`)}</span>
              </div>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--admin-font-primary)", marginBottom: 4 }}>{integration.name}</h3>
                <p style={{ fontSize: 13, color: "var(--admin-font-tertiary)", lineHeight: 1.5 }}>{t(`integrations.providers.${integration.descKey}`)}</p>
              </div>
              {integration.href && (
                <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 600, color: integration.color, marginTop: "auto" }}>
                  {t("integrations.configure")} <ArrowRight style={{ width: 12, height: 12 }} />
                </div>
              )}
            </div>
          );
        })}
      </motion.div>
    </div>
  );
}
