"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useQuery, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { ClipboardCheck, RotateCcw, FileText } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminTabBar } from "../_components/AdminTabBar";
import { EvaluationsPanel } from "./_components/EvaluationsPanel";
import { ResultsPanel } from "./_components/ResultsPanel";
import { InsightsCard } from "./_components/InsightsCard";
import { ScheduleGrid } from "./_components/ScheduleGrid";
import { PipelineTable } from "./_components/PipelineTable";
import type { ScheduleSaveItem } from "./_components/ScheduleGrid";
import {
  getSchedules, saveSchedules, getPipeline, sendReminders,
  setup360, getInsights,
} from "@/services/assessmentCommandService";

export default function AssessmentCommandCenter() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("command-center");

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab === "evaluations" || tab === "results" || tab === "command-center") setActiveTab(tab);
  }, [searchParams]);

  const handleTabChange = (key: string) => {
    setActiveTab(key);
    const url = key === "command-center" ? "/school-admin/assessments" : `/school-admin/assessments?tab=${key}`;
    router.replace(url, { scroll: false });
  };

  // Queries
  // Gate-sensitive: completion can change off-page (students finishing) or via setup360
  // below, so always re-evaluate the 100% gate on mount rather than trust a stale cache.
  // (Cheap — the server caches the narrative 7 days; a 100% school returns it without a new AI call.)
  const insightsQuery = useQuery({ queryKey: ["assessment-insights"], queryFn: () => getInsights(), staleTime: 0, refetchOnMount: "always" });
  const schedulesQuery = useQuery({ queryKey: ["assessment-schedules"], queryFn: getSchedules, staleTime: 1000 * 60 * 5 });
  const pipelineQuery = useQuery({ queryKey: ["assessment-pipeline"], queryFn: () => getPipeline(), staleTime: 1000 * 60 * 2 });

  // Mutations
  const refreshInsights = useMutation({
    mutationFn: () => getInsights(true),
    onSuccess: () => {
      insightsQuery.refetch();
      toast.success("Insights refreshed");
    },
    onError: () => toast.error("Failed to refresh insights"),
  });

  const saveSchedulesMut = useMutation({
    mutationFn: (s: ScheduleSaveItem[]) => saveSchedules(s),
    onSuccess: () => { schedulesQuery.refetch(); toast.success("Schedule saved"); },
    onError: () => toast.error("Failed to save schedule"),
  });

  const remindersMut = useMutation({
    mutationFn: ({ ids, types }: { ids: string[]; types: string[] }) => sendReminders(ids, types),
    onSuccess: (data: { sent: number; failed: number }) => {
      toast.success(`Reminders sent to ${data.sent} student${data.sent !== 1 ? "s" : ""}`);
      if (data.failed > 0) toast.warning(`${data.failed} email(s) failed`);
    },
    onError: () => toast.error("Failed to send reminders"),
  });

  const setup360Mut = useMutation({
    mutationFn: (ids: string[]) => setup360(ids),
    onSuccess: (data: { created: number; emailsSent: number; skipped: number }) => {
      toast.success(`360 setup complete: ${data.created} groups created, ${data.emailsSent} invites sent`);
      if (data.skipped > 0) toast.info(`${data.skipped} already existed`);
      pipelineQuery.refetch();
      // New 360 groups can drop students below allDone → re-evaluate the insights gate.
      insightsQuery.refetch();
    },
    onError: () => toast.error("Failed to setup 360 evaluations"),
  });

  const isLoading = insightsQuery.isLoading || schedulesQuery.isLoading || pipelineQuery.isLoading;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" style={{ background: "var(--admin-bg-hover)" }} />
        <Skeleton className="h-[120px]" style={{ background: "var(--admin-bg-hover)" }} />
        <Skeleton className="h-[200px]" style={{ background: "var(--admin-bg-hover)" }} />
        <Skeleton className="h-[400px]" style={{ background: "var(--admin-bg-hover)" }} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: "var(--admin-font-primary)", letterSpacing: "-0.01em" }}>
          Assessment Command Center
        </h1>
        <p style={{ fontSize: 13, color: "var(--admin-font-tertiary)", marginTop: 2 }}>
          Schedule assessments, track student progress, send reminders, and view AI-powered insights
        </p>
      </div>

      <AdminTabBar
        tabs={[
          { key: "command-center", label: "Command Center", icon: ClipboardCheck },
          { key: "evaluations", label: "360 Evaluations", icon: RotateCcw },
          { key: "results", label: "Results & Reports", icon: FileText },
        ]}
        activeTab={activeTab}
        onChange={handleTabChange}
      />

      {activeTab === "command-center" && (
        <>
          <InsightsCard
            insights={insightsQuery.data}
            onRefresh={() => refreshInsights.mutate()}
            isRefreshing={refreshInsights.isPending}
          />
          <ScheduleGrid
            schedules={schedulesQuery.data || []}
            onSave={s => saveSchedulesMut.mutate(s)}
            isSaving={saveSchedulesMut.isPending}
          />
          <PipelineTable
            pipeline={pipelineQuery.data || []}
            onSendReminders={(ids, types) => remindersMut.mutate({ ids, types })}
            onSetup360={ids => setup360Mut.mutate(ids)}
            isSendingReminders={remindersMut.isPending}
            isSettingUp360={setup360Mut.isPending}
          />
        </>
      )}

      {activeTab === "evaluations" && <EvaluationsPanel />}
      {activeTab === "results" && <ResultsPanel />}
    </div>
  );
}
