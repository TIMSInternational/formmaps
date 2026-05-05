"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Settings,
  Users,
  BarChart3,
  FileText,
  Mail,
  Plus,
  Eye,
  ChevronRight,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Search,
  Beaker,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { useEvaluationData } from "@/hooks/useEvaluationData";
import dynamic from "next/dynamic";
import type { EvaluationSession } from "@/services/evaluationService";

const EvaluationConfiguration = dynamic(() => import("@/components/evaluation/EvaluationConfiguration"), { ssr: false });
const EvaluatorManagement = dynamic(() => import("@/components/evaluation/EvaluatorManagement"), { ssr: false });
const EvaluationReport = dynamic(() => import("@/components/evaluation/EvaluationReport"), { ssr: false });
const EvaluationAnalytics = dynamic(() => import("@/components/evaluation/EvaluationAnalytics"), { ssr: false });
const EvaluationInvitations = dynamic(() => import("@/components/evaluation/EvaluationInvitations"), { ssr: false });

type ViewMode = "list" | "configure" | "manage-evaluators" | "invitations" | "report" | "analytics";

const statusMeta: Record<string, { icon: any; color: string; label: string }> = {
  completed: { icon: CheckCircle2, color: "var(--admin-accent-green, #10b981)", label: "Completed" },
  active: { icon: Clock, color: "var(--admin-accent-blue, #3b82f6)", label: "Active" },
  draft: { icon: AlertTriangle, color: "var(--admin-font-tertiary)", label: "Draft" },
  pending: { icon: Clock, color: "var(--admin-accent-amber, #f59e0b)", label: "Pending" },
};

export default function EvaluationsPage() {
  const { t } = useTranslation();
  const { sessions, currentSession, progress, loading, loadSession } = useEvaluationData();

  const selectSession = (id: string) => {
    const session = sessions.find((s: EvaluationSession) => s.id === id);
    if (session) loadSession(id);
  };

  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [search, setSearch] = useState("");
  const [useMockData, setUseMockData] = useState(false);

  const filteredSessions = (sessions || []).filter(
    (s: EvaluationSession) =>
      !search || (s.evaluatedPersonName || s.title || "").toLowerCase().includes(search.toLowerCase())
  );

  const totalSessions = sessions?.length || 0;
  const activeSessions = sessions?.filter((s: EvaluationSession) => s.status === "active").length || 0;
  const completedSessions = sessions?.filter((s: EvaluationSession) => s.status === "completed").length || 0;
  const responseRate = progress?.responseRate || 0;

  // Sub-views with back button
  const backButton = (
    <button
      onClick={() => setViewMode("list")}
      style={{
        height: 32, borderRadius: 6, padding: "0 12px",
        fontSize: 12, fontWeight: 600,
        display: "flex", alignItems: "center", gap: 4,
        background: "transparent", color: "var(--admin-font-primary)",
        border: "1px solid var(--admin-border-default)", cursor: "pointer",
      }}
    >
      <ChevronRight style={{ width: 14, height: 14, transform: "rotate(180deg)" }} />
      Back
    </button>
  );

  if (viewMode === "configure") {
    return <div className="space-y-4">{backButton}<EvaluationConfiguration onSave={async () => setViewMode("list")} onCancel={() => setViewMode("list")} /></div>;
  }
  if (viewMode === "manage-evaluators" && currentSession) {
    return <div className="space-y-4">{backButton}<EvaluatorManagement sessionId={currentSession.id} evaluators={currentSession.evaluators || []} onEvaluatorsUpdated={() => {}} onSendInvitations={() => setViewMode("invitations")} /></div>;
  }
  if (viewMode === "invitations" && currentSession) {
    return <div className="space-y-4">{backButton}<EvaluationInvitations sessionId={currentSession.id} onBack={() => setViewMode("list")} /></div>;
  }
  if (viewMode === "report" && currentSession) {
    return <div className="space-y-4">{backButton}<EvaluationReport sessionId={currentSession.id} onBack={() => setViewMode("list")} /></div>;
  }
  if (viewMode === "analytics" && currentSession) {
    return <div className="space-y-4">{backButton}<EvaluationAnalytics sessionId={currentSession.id} onBack={() => setViewMode("list")} /></div>;
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" style={{ background: "var(--admin-bg-hover)" }} />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-24" style={{ background: "var(--admin-bg-hover)" }} />)}
        </div>
        <Skeleton className="h-[400px]" style={{ background: "var(--admin-bg-hover)" }} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: "var(--admin-font-primary)", letterSpacing: "-0.01em" }}>
            360° Evaluations
          </h1>
          <p style={{ fontSize: 13, color: "var(--admin-font-tertiary)", marginTop: 2 }}>
            Manage student evaluation sessions, invitations, and reports
          </p>
        </div>
        <div className="flex items-center gap-2">
          {process.env.NODE_ENV === "development" && (
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "6px 12px", borderRadius: 6,
              border: "1px solid var(--admin-border-default)",
              background: "var(--admin-bg-card)",
            }}>
              <Beaker style={{ width: 14, height: 14, color: useMockData ? "#f59e0b" : "var(--admin-font-tertiary)" }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: "var(--admin-font-secondary)" }}>
                {useMockData ? "Preview" : "Live"}
              </span>
              <Switch checked={useMockData} onCheckedChange={setUseMockData} />
            </div>
          )}
          <button
            onClick={() => setViewMode("configure")}
            style={{
              height: 36, borderRadius: 6, padding: "0 14px",
              fontSize: 12, fontWeight: 600,
              display: "flex", alignItems: "center", gap: 6,
              background: "var(--admin-accent-blue, #3b82f6)", color: "#fff",
              border: "none", cursor: "pointer",
            }}
          >
            <Plus style={{ width: 14, height: 14 }} /> New Session
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Sessions", value: totalSessions, icon: FileText, color: "#6366f1" },
          { label: "Active", value: activeSessions, icon: Clock, color: "#3b82f6" },
          { label: "Completed", value: completedSessions, icon: CheckCircle2, color: "#10b981" },
          { label: "Response Rate", value: `${responseRate}%`, icon: BarChart3, color: "#8b5cf6" },
        ].map((stat) => (
          <div key={stat.label} style={{
            borderRadius: 8, border: "1px solid var(--admin-border-default)",
            background: "var(--admin-bg-card)", padding: 16,
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: `${stat.color}15`,
              display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 10,
            }}>
              <stat.icon style={{ width: 16, height: 16, color: stat.color }} />
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, color: "var(--admin-font-primary)", letterSpacing: "-0.02em" }}>
              {stat.value}
            </div>
            <div style={{ fontSize: 10, fontWeight: 600, color: "var(--admin-font-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", marginTop: 2 }}>
              {stat.label}
            </div>
          </div>
        ))}
      </div>

      {/* Sessions List */}
      <div style={{
        borderRadius: 8, border: "1px solid var(--admin-border-default)",
        background: "var(--admin-bg-card)", overflow: "hidden",
      }}>
        {/* Card Header */}
        <div style={{
          padding: "12px 16px",
          borderBottom: "1px solid var(--admin-border-default)",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
          background: "var(--admin-bg-hover)",
          flexWrap: "wrap",
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>
            Evaluation Sessions
          </div>
          <div className="relative" style={{ width: 260 }}>
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: "var(--admin-font-tertiary)" }} />
            <Input
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-8 text-xs"
              style={{ borderRadius: 6, background: "var(--admin-bg-card)", border: "1px solid var(--admin-border-default)" }}
            />
          </div>
        </div>

        {/* Session Rows */}
        <div>
          {filteredSessions.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px 16px" }}>
              <FileText style={{ width: 32, height: 32, color: "var(--admin-font-tertiary)", margin: "0 auto 12px", opacity: 0.4 }} />
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--admin-font-primary)", marginBottom: 4 }}>No Sessions Found</div>
              <div style={{ fontSize: 12, color: "var(--admin-font-tertiary)", maxWidth: 300, margin: "0 auto" }}>
                {search ? "Try adjusting your search." : "Create a new evaluation session to get started."}
              </div>
            </div>
          ) : (
            filteredSessions.map((session: EvaluationSession) => {
              const meta = statusMeta[session.status] || statusMeta.draft;
              const StatusIcon = meta.icon;
              return (
                <div
                  key={session.id}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
                    padding: "12px 16px",
                    borderBottom: "1px solid var(--admin-border-default)",
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "var(--admin-bg-hover)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
                    <StatusIcon style={{ width: 16, height: 16, color: meta.color, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {session.evaluatedPersonName || session.title || "Unnamed Session"}
                        </span>
                        <span style={{
                          fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 3,
                          background: `${meta.color}15`, color: meta.color,
                        }}>
                          {meta.label}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)", marginTop: 2 }}>
                        {session.evaluators?.length || 0} evaluators
                        {session.createdAt ? ` · ${new Date(session.createdAt).toLocaleDateString()}` : ""}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 2, flexShrink: 0 }}>
                    {[
                      { icon: Users, title: "Manage Evaluators", view: "manage-evaluators" as ViewMode },
                      { icon: Mail, title: "Send Invitations", view: "invitations" as ViewMode },
                      { icon: Eye, title: "View Report", view: "report" as ViewMode },
                      { icon: BarChart3, title: "Analytics", view: "analytics" as ViewMode },
                    ].map(({ icon: Icon, title, view }) => (
                      <button
                        key={view}
                        title={title}
                        onClick={() => { selectSession(session.id); setViewMode(view); }}
                        style={{
                          width: 30, height: 30, borderRadius: 4,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          background: "transparent", border: "none",
                          color: "var(--admin-font-tertiary)", cursor: "pointer",
                          transition: "color 0.1s",
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = "var(--admin-font-primary)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = "var(--admin-font-tertiary)"; }}
                      >
                        <Icon style={{ width: 14, height: 14 }} />
                      </button>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
