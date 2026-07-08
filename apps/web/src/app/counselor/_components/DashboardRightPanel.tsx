"use client";

import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CalendarClock, Send, Clock,
  Loader2, CheckCircle2, XCircle,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useReviewChangeRequest } from "@/hooks/useCoursePlanQueries";

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

interface DashboardRightPanelProps {
  rightTab: "followups" | "requests";
  setRightTab: (tab: "followups" | "requests") => void;
  pendingFollowUps: number;
  pendingCRCount: number;
  followUpsList: FollowUpItem[];
  changeRequests: ChangeRequestItem[];
  dashLoading: boolean;
  crLoading: boolean;
}

function ChangeRequestCard({ req }: { req: ChangeRequestItem }) {
  const { t } = useTranslation("counselor");
  const router = useRouter();
  const review = useReviewChangeRequest(req.studentId);

  const handleReview = (status: "approved" | "rejected") => {
    review.mutate({ requestId: req.id, payload: { status } });
  };

  return (
    <div className="p-3 bg-orange-50/60 border border-orange-100 rounded-lg space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-gray-800 truncate">{req.studentName}</p>
          <p className="text-xs text-gray-700 font-medium truncate">
            {req.courseName}
            <span className="text-gray-400 font-normal ml-1">· Gr.{req.gradeLevel} {req.semester}</span>
          </p>
          {req.studentNote && (
            <p className="text-[10px] text-gray-500 italic line-clamp-1 mt-0.5">
              &quot;{req.studentNote}&quot;
            </p>
          )}
        </div>
        <Badge className={`text-[10px] shrink-0 ${req.action === "add" ? "bg-blue-100 text-blue-700" : "bg-red-100 text-red-700"}`}>
          {req.action}
        </Badge>
      </div>
      <div className="flex gap-2">
        <Button size="sm" className="h-7 flex-1 text-xs bg-green-600 hover:bg-green-700 text-white gap-1" disabled={review.isPending} onClick={() => handleReview("approved")}>
          {review.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
          {t("coursePlan.approve", "Approve")}
        </Button>
        <Button size="sm" variant="outline" className="h-7 flex-1 text-xs text-red-600 border-red-200 hover:bg-red-50 gap-1" disabled={review.isPending} onClick={() => handleReview("rejected")}>
          <XCircle className="h-3 w-3" />
          {t("coursePlan.reject", "Reject")}
        </Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs text-gray-500 hover:text-indigo-600 px-2" onClick={() => router.push(`/counselor/students/${req.studentId}`)}>
          {t("common:common.view", "View")}
        </Button>
      </div>
    </div>
  );
}

export function DashboardRightPanel({
  rightTab,
  setRightTab,
  pendingFollowUps,
  pendingCRCount,
  followUpsList,
  changeRequests,
  dashLoading,
  crLoading,
}: DashboardRightPanelProps) {
  const { t } = useTranslation("counselor");

  return (
    <Card className="dash-card h-full">
      <CardHeader className="pb-0">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setRightTab("followups")}
            className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-1.5 px-2 rounded-md transition-all ${
              rightTab === "followups" ? "bg-white shadow-sm text-[#FFD23F]" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <Clock className="h-3.5 w-3.5" />
            {t("dashboard.followUps", "Follow-ups")}
            {pendingFollowUps > 0 && (
              <span className="bg-[#FFD23F] text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                {pendingFollowUps}
              </span>
            )}
          </button>
          <button
            onClick={() => setRightTab("requests")}
            className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-1.5 px-2 rounded-md transition-all ${
              rightTab === "requests" ? "bg-white shadow-sm text-orange-700" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <Send className="h-3.5 w-3.5" />
            {t("dashboard.requests", "Requests")}
            {pendingCRCount > 0 && (
              <span className="bg-orange-500 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                {pendingCRCount > 9 ? "9+" : pendingCRCount}
              </span>
            )}
          </button>
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        {rightTab === "followups" && (
          dashLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : followUpsList.length > 0 ? (
            <div className="space-y-3">
              {followUpsList.map((item) => (
                <div key={item.id} className="flex items-start gap-3 p-3 bg-[#FFD23F]/10 border border-[#FFD23F]/20 rounded-lg">
                  <CalendarClock className="h-4 w-4 text-[#FFD23F] mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-gray-800 truncate">{item.studentName}</p>
                    <p className="text-xs text-gray-600 line-clamp-1">{item.content}</p>
                    <p className="text-[10px] text-[#FFD23F] mt-0.5">
                      {"\uD83D\uDCC5"} {item.followUpDate}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <CalendarClock className="h-9 w-9 text-gray-200 mx-auto mb-2" />
              <p className="text-sm text-gray-400">{t("dashboard.noFollowUps", "No upcoming follow-ups")}</p>
              <p className="text-xs text-gray-300 mt-1">
                {t("dashboard.followUpHint", "Set a follow-up date on a counselor note to see it here")}
              </p>
            </div>
          )
        )}

        {rightTab === "requests" && (
          crLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : changeRequests.length > 0 ? (
            <div className="space-y-3">
              {changeRequests.map((req) => (
                <ChangeRequestCard key={req.id} req={req} />
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <Send className="h-9 w-9 text-gray-200 mx-auto mb-2" />
              <p className="text-sm text-gray-400">{t("dashboard.noRequests", "No pending requests")}</p>
              <p className="text-xs text-gray-300 mt-1">
                {t("dashboard.requestsHint", "Student course change requests will appear here")}
              </p>
            </div>
          )
        )}
      </CardContent>
    </Card>
  );
}
