"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "motion/react";
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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useEvaluationData } from "@/hooks/useEvaluationData";
import dynamic from "next/dynamic";
import type { EvaluationSession } from "@/services/evaluationService";

// Dynamically import heavy evaluation components
const EvaluationConfiguration = dynamic(
  () => import("@/components/evaluation/EvaluationConfiguration"),
  { ssr: false }
);
const EvaluatorManagement = dynamic(
  () => import("@/components/evaluation/EvaluatorManagement"),
  { ssr: false }
);
const EvaluationReport = dynamic(
  () => import("@/components/evaluation/EvaluationReport"),
  { ssr: false }
);
const EvaluationAnalytics = dynamic(
  () => import("@/components/evaluation/EvaluationAnalytics"),
  { ssr: false }
);
const EvaluationInvitations = dynamic(
  () => import("@/components/evaluation/EvaluationInvitations"),
  { ssr: false }
);

type ViewMode =
  | "list"
  | "configure"
  | "manage-evaluators"
  | "invitations"
  | "report"
  | "analytics";

export default function EvaluationsPage() {
  const { t } = useTranslation();
  const {
    sessions,
    currentSession,
    progress,
    loading,
    loadSession,
  } = useEvaluationData();

  // Helper to select a session by ID
  const selectSession = (id: string) => {
    const session = sessions.find((s: EvaluationSession) => s.id === id);
    if (session) loadSession(id);
  };

  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [search, setSearch] = useState("");
  const [useMockData, setUseMockData] = useState(false);

  // Filter sessions by search
  const filteredSessions = (sessions || []).filter(
    (s: EvaluationSession) =>
      !search ||
      (s.evaluatedPersonName || s.title || "").toLowerCase().includes(search.toLowerCase())
  );

  // Stats
  const totalSessions = sessions?.length || 0;
  const activeSessions = sessions?.filter(
    (s: EvaluationSession) => s.status === "active"
  ).length || 0;
  const completedSessions = sessions?.filter(
    (s: EvaluationSession) => s.status === "completed"
  ).length || 0;
  const responseRate = progress?.responseRate || 0;

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
      case "active":
        return <Clock className="h-4 w-4 text-blue-500" />;
      default:
        return <AlertTriangle className="h-4 w-4 text-amber-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      completed: "bg-emerald-100 text-emerald-700",
      active: "bg-blue-100 text-blue-700",
      draft: "bg-gray-100 text-gray-700",
      pending: "bg-amber-100 text-amber-700",
    };
    return (
      <Badge variant="secondary" className={styles[status] || styles.draft}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  // If we're viewing a sub-component
  if (viewMode === "configure") {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => setViewMode("list")}>
          ← {t("common.back", "Back")}
        </Button>
        <EvaluationConfiguration
          onSave={async () => setViewMode("list")}
          onCancel={() => setViewMode("list")}
        />
      </div>
    );
  }

  if (viewMode === "manage-evaluators" && currentSession) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => setViewMode("list")}>
          ← {t("common.back", "Back")}
        </Button>
        <EvaluatorManagement
          sessionId={currentSession.id}
          evaluators={currentSession.evaluators || []}
          onEvaluatorsUpdated={() => { }}
          onSendInvitations={() => setViewMode("invitations")}
        />
      </div>
    );
  }

  if (viewMode === "invitations" && currentSession) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => setViewMode("list")}>
          ← {t("common.back", "Back")}
        </Button>
        <EvaluationInvitations
          sessionId={currentSession.id}
          onBack={() => setViewMode("list")}
        />
      </div>
    );
  }

  if (viewMode === "report" && currentSession) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => setViewMode("list")}>
          ← {t("common.back", "Back")}
        </Button>
        <EvaluationReport
          sessionId={currentSession.id}
          onBack={() => setViewMode("list")}
        />
      </div>
    );
  }

  if (viewMode === "analytics" && currentSession) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => setViewMode("list")}>
          ← {t("common.back", "Back")}
        </Button>
        <EvaluationAnalytics
          sessionId={currentSession.id}
          onBack={() => setViewMode("list")}
        />
      </div>
    );
  }

  // Main list view
  return (
    <div className="min-h-screen bg-gray-50/50 p-6 md:p-8 space-y-10 font-sans">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col md:flex-row md:items-start justify-between gap-4"
        >
          <div className="space-y-2">
            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-gray-900 leading-tight">
              {t("schoolAdmin.evaluations.title", "360° Evaluations")}
            </h1>
            <p className="text-lg text-gray-500 font-medium max-w-2xl leading-relaxed">
              {t(
                "schoolAdmin.evaluations.subtitle",
                "Manage student evaluation sessions, invitations, and reports"
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 shrink-0">
            {process.env.NODE_ENV === "development" && (
              <div className="flex items-center gap-3 bg-white/60 backdrop-blur-md pl-4 pr-5 py-3 rounded-full border border-gray-200 shadow-sm shrink-0 hover:shadow-md transition-all duration-300">
                <div className={cn(
                  "flex items-center justify-center p-2 rounded-full transition-colors duration-300",
                  useMockData ? "bg-amber-100 text-amber-600" : "bg-teal-100 text-teal-600"
                )}>
                  <Beaker className="w-4 h-4" />
                </div>
                <div className="flex flex-col justify-center">
                  <Label htmlFor="mock-data-toggle" className="font-bold text-[11px] uppercase tracking-wider text-gray-800 cursor-pointer">
                    {useMockData ? "Preview Mode" : "Live Mode"}
                  </Label>
                  <span className="text-[10px] text-gray-500 font-medium leading-none mt-0.5">
                    {useMockData ? "Using mock data" : "Using real data"}
                  </span>
                </div>
                <div className="ml-2 pl-3 border-l h-6 flex items-center">
                  <Switch
                    id="mock-data-toggle"
                    checked={useMockData}
                    onCheckedChange={setUseMockData}
                    className="data-[state=checked]:bg-amber-500"
                  />
                </div>
              </div>
            )}
            <Button
              onClick={() => setViewMode("configure")}
              className="bg-teal-600 hover:bg-teal-700 shadow-sm transition-all duration-300"
            >
              <Plus className="h-4 w-4 mr-2" />
              {t("schoolAdmin.evaluations.newSession", "New Evaluation Session")}
            </Button>
          </div>
        </motion.div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <Card className="border-0 shadow-sm">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-indigo-100 rounded-lg">
                    <FileText className="h-5 w-5 text-indigo-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">
                      {t("schoolAdmin.evaluations.totalSessions", "Total Sessions")}
                    </p>
                    <p className="text-2xl font-bold">{totalSessions}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
            <Card className="border-0 shadow-sm">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <Clock className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">
                      {t("schoolAdmin.evaluations.active", "Active")}
                    </p>
                    <p className="text-2xl font-bold">{activeSessions}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <Card className="border-0 shadow-sm">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-100 rounded-lg">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">
                      {t("schoolAdmin.evaluations.completed", "Completed")}
                    </p>
                    <p className="text-2xl font-bold">{completedSessions}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
            <Card className="border-0 shadow-sm">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-purple-100 rounded-lg">
                    <BarChart3 className="h-5 w-5 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">
                      {t("schoolAdmin.evaluations.responseRate", "Response Rate")}
                    </p>
                    <p className="text-2xl font-bold">{responseRate}%</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Sessions List */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <Card className="border-0 shadow-md overflow-hidden">
            <CardHeader>
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <CardTitle>
                  {t("schoolAdmin.evaluations.sessions", "Evaluation Sessions")}
                </CardTitle>
                <div className="relative w-full md:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder={t("common.search", "Search...")}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-12 text-gray-500">
                  {t("common.loading", "Loading...")}
                </div>
              ) : filteredSessions.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  {t(
                    "schoolAdmin.evaluations.noSessions",
                    "No evaluation sessions found. Create one to get started."
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredSessions.map((session: EvaluationSession) => (
                    <div
                      key={session.id}
                      className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        {getStatusIcon(session.status)}
                        <div className="min-w-0">
                          <p className="font-medium text-gray-900 truncate">
                            {session.evaluatedPersonName || session.title ||
                              t("schoolAdmin.evaluations.unnamed", "Unnamed Session")}
                          </p>
                          <p className="text-sm text-gray-500">
                            {t("schoolAdmin.evaluations.evaluators", "Evaluators")}:{" "}
                            {session.evaluators?.length || 0} •{" "}
                            {session.createdAt
                              ? new Date(session.createdAt).toLocaleDateString()
                              : ""}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {getStatusBadge(session.status)}

                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            title={t("schoolAdmin.evaluations.manageEvaluators", "Manage Evaluators")}
                            onClick={() => {
                              selectSession(session.id);
                              setViewMode("manage-evaluators");
                            }}
                          >
                            <Users className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            title={t("schoolAdmin.evaluations.sendInvitations", "Send Invitations")}
                            onClick={() => {
                              selectSession(session.id);
                              setViewMode("invitations");
                            }}
                          >
                            <Mail className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            title={t("schoolAdmin.evaluations.viewReport", "View Report")}
                            onClick={() => {
                              selectSession(session.id);
                              setViewMode("report");
                            }}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            title={t("schoolAdmin.evaluations.analytics", "Analytics")}
                            onClick={() => {
                              selectSession(session.id);
                              setViewMode("analytics");
                            }}
                          >
                            <BarChart3 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
