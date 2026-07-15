"use client";

import { useTranslation } from "react-i18next";
import { Award, BookOpen, Clock, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

const ASSESSMENT_COLORS: Record<string, string> = {
  completed: "bg-emerald-100 text-emerald-700",
  in_progress: "bg-amber-100 text-amber-700",
  not_started: "bg-gray-100 text-gray-500",
};

interface StudentStatCardsProps {
  student: {
    gpa?: number;
    creditProgress?: { earned: number; required: number; percentage: number };
    lastActive?: string;
    assessmentStatus?: Record<string, string>;
  };
}

export function StudentStatCards({ student }: StudentStatCardsProps) {
  const { t } = useTranslation("counselor");
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-gray-600">{t("statCards.gpa", "GPA")}</CardTitle>
          <Award className="h-4 w-4 text-amber-600" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{student.gpa ? student.gpa.toFixed(2) : "\u2014"}</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-gray-600">{t("statCards.credits", "Credits")}</CardTitle>
          <BookOpen className="h-4 w-4 text-indigo-600" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {student.creditProgress?.earned ?? "\u2014"}/{student.creditProgress?.required ?? "\u2014"}
          </div>
          {student.creditProgress && (
            <Progress
              value={student.creditProgress.percentage}
              className="h-1.5 mt-2"
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-gray-600">{t("statCards.lastActive", "Last Active")}</CardTitle>
          <Clock className="h-4 w-4 text-[#2E9098]" />
        </CardHeader>
        <CardContent>
          <div className="text-lg font-bold">
            {student.lastActive
              ? format(new Date(student.lastActive), "MMM d")
              : t("statCards.never", "Never")}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-gray-600">{t("statCards.assessments", "Assessments")}</CardTitle>
          <TrendingUp className="h-4 w-4 text-teal-600" />
        </CardHeader>
        <CardContent>
          <div className="flex gap-1 flex-wrap pt-1">
            {student.assessmentStatus
              ? Object.entries(student.assessmentStatus).map(([type, status]) => (
                  <Badge
                    key={type}
                    variant="secondary"
                    className={cn(
                      "text-xs capitalize",
                      ASSESSMENT_COLORS[status as string] || "bg-gray-100 text-gray-600"
                    )}
                  >
                    {type}
                  </Badge>
                ))
              : <span className="text-sm text-gray-400">{"\u2014"}</span>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
