"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Users,
  TrendingDown,
  ChevronRight,
  Bell,
  Radar,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api/apiClient";
import { useCounselorDashboard, useCounselorPendingChangeRequests } from "@/hooks/useCounselorDashboard";
import { useMyCounselorStudents } from "@/hooks/useSchoolProfileQueries";
import { getMyCounselorSessions } from "@/services/counselorSessionService";
import type { CounselorSession } from "@/services/counselorSessionService";

import { DashboardStatCards } from "./_components/DashboardStatCards";
import { AIBriefingCard } from "./_components/AIBriefingCard";
import { UpcomingSessions } from "./_components/UpcomingSessions";
import { AssessmentPipeline } from "./_components/AssessmentPipeline";
import { DashboardRightPanel } from "./_components/DashboardRightPanel";
import { RecentNotes } from "./_components/RecentNotes";

interface ChangeRequestItem {
  id: string;
  studentId: string;
  studentName: string;
  courseName: string;
  gradeLevel: number;
  semester: string;
  action: string;
  studentNote?: string;
}

interface FollowUpItem {
  id: string;
  studentName: string;
  content: string;
  followUpDate: string;
}

interface NoteItem {
  id: string;
  studentName: string;
  type: string;
  content: string;
  createdAt: string;
}

interface BriefingResponse { data?: { briefing?: string; urgentActions?: { title: string; description: string; impact: string }[] } }

export default function CounselorDashboardPage() {
  const { t } = useTranslation();
  const [rightTab, setRightTab] = useState<"followups" | "requests">("followups");
  const [upcomingSessions, setUpcomingSessions] = useState<CounselorSession[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);

  useEffect(() => {
    getMyCounselorSessions({ status: "confirmed", limit: 3 })
      .then(res => setUpcomingSessions(res.data))
      .catch((err) => console.error("Failed to load counselor sessions:", err))
      .finally(() => setLoadingSessions(false));
  }, []);

  const { data: briefingData, isLoading: briefingLoading, refetch: refetchBriefing, dataUpdatedAt: briefingUpdatedAt } = useQuery({
    queryKey: ["counselor-ai-briefing"],
    queryFn: () => apiRequest<BriefingResponse>("/api/v1/counselor/ai-briefing"),
    staleTime: 10 * 60 * 1000,
  });

  const { data: dashData, isLoading: dashLoading } = useCounselorDashboard();
  const { data: studentsData, isLoading: studentsLoading } =
    useMyCounselorStudents({ limit: 50 });
  const { data: changeRequestsData, isLoading: crLoading } =
    useCounselorPendingChangeRequests();

  const studentsObj = studentsData as Record<string, unknown> | undefined;
  const dashObj = dashData as Record<string, unknown> | undefined;
  const crObj = changeRequestsData as Record<string, unknown> | undefined;

  const totalStudents =
    (studentsObj?.total as number | undefined) ?? (dashObj?.assignedCount as number | undefined) ?? 0;
  const pendingFollowUps = (dashObj?.followUps as number | undefined) ?? 0;
  const overdueFollowUps = (dashObj?.overdueFollowUps as number | undefined) ?? 0;

  const changeRequests: ChangeRequestItem[] = (Array.isArray(crObj?.data) ? crObj.data : []) as ChangeRequestItem[];
  const pendingCRCount = (crObj?.total as number | undefined) ?? changeRequests.length;

  const isLoading = dashLoading || studentsLoading;

  const followUpsList: FollowUpItem[] = (Array.isArray(dashObj?.pendingFollowUpsList) ? dashObj.pendingFollowUpsList : []) as FollowUpItem[];
  const recentNotes: NoteItem[] = (Array.isArray(dashObj?.recentNotes) ? dashObj.recentNotes : []) as NoteItem[];

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
        <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-muted-foreground">
          {t("counselor.dashboard.badge", "Counselor")}
        </p>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground mt-1">
          {t("counselor.dashboard.title", "Counselor Overview")}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t("counselor.dashboard.summary", "Your caseload summary and upcoming actions.")}
        </p>
      </motion.div>

      <DashboardStatCards
        totalStudents={totalStudents}
        pendingFollowUps={pendingFollowUps}
        overdueFollowUps={overdueFollowUps}
        pendingCRCount={pendingCRCount}
        isLoading={isLoading}
        dashLoading={dashLoading}
        crLoading={crLoading}
        onRequestsClick={() => setRightTab("requests")}
      />

      {/* Quick Actions */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="grid grid-cols-2 md:grid-cols-4 gap-3"
      >
        {[
          { label: t("counselor.dashboard.myStudents", "My Students"), href: "/counselor/students", icon: Users, color: "text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border-indigo-100" },
          { label: t("counselor.dashboard.academicGaps", "Academic Gaps"), href: "/counselor/academic-gaps", icon: TrendingDown, color: "text-orange-600 bg-orange-50 hover:bg-orange-100 border-orange-100" },
          { label: t("counselor.dashboard.evaluations360", "360° Evaluations"), href: "/counselor/evaluations", icon: Radar, color: "text-purple-600 bg-purple-50 hover:bg-purple-100 border-purple-100" },
          { label: t("counselor.dashboard.alerts", "Alerts"), href: "/counselor/alerts", icon: Bell, color: "text-red-600 bg-red-50 hover:bg-red-100 border-red-100" },
        ].map((item) => (
          <Link key={item.href} href={item.href}>
            <Card className={`border cursor-pointer transition-all hover:shadow-md ${item.color}`}>
              <CardContent className="pt-4 pb-4 flex items-center gap-3">
                <item.icon className="h-5 w-5 shrink-0" />
                <span className="text-sm font-semibold">{item.label}</span>
                <ChevronRight className="h-4 w-4 ml-auto opacity-60" />
              </CardContent>
            </Card>
          </Link>
        ))}
      </motion.div>

      <AIBriefingCard
        briefing={briefingData?.data?.briefing}
        urgentActions={briefingData?.data?.urgentActions}
        isLoading={briefingLoading}
        updatedAt={briefingUpdatedAt}
        onRefresh={() => refetchBriefing()}
      />

      <UpcomingSessions sessions={upcomingSessions} isLoading={loadingSessions} />

      {/* Students + Right Panel */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="grid grid-cols-1 lg:grid-cols-3 gap-6"
      >
        <div className="lg:col-span-2">
          <AssessmentPipeline />
        </div>
        <div>
          <DashboardRightPanel
            rightTab={rightTab}
            setRightTab={setRightTab}
            pendingFollowUps={pendingFollowUps}
            pendingCRCount={pendingCRCount}
            followUpsList={followUpsList}
            changeRequests={changeRequests}
            dashLoading={dashLoading}
            crLoading={crLoading}
          />
        </div>
      </motion.div>

      <RecentNotes notes={recentNotes} />
    </div>
  );
}
