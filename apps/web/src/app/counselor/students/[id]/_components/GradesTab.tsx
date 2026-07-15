"use client";

import { useTranslation } from "react-i18next";
import { Award, BookOpen } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import type { StudentGpa, TranscriptData } from "@/services/transcriptService";

interface TranscriptCourse {
  id: string;
  courseCode?: string | null;
  courseLevel?: string | null;
  credits?: number | null;
  grade?: string | null;
  status?: string;
}

interface GradesTabProps {
  gpaData: StudentGpa | null | undefined;
  transcriptData: TranscriptData | null | undefined;
}

export function GradesTab({ gpaData, transcriptData }: GradesTabProps) {
  const { t } = useTranslation("counselor");

  return (
    <TabsContent value="grades" className="mt-6 space-y-5">
      {/* GPA Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Award className="h-4 w-4 text-amber-600" />
            {t("grades.gpaSummary", "GPA Summary")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {gpaData ? (
            <div className="space-y-3">
              <div className="flex gap-8">
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{t("grades.weightedGpa", "Weighted GPA")}</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">
                    {gpaData.gpaWeighted?.toFixed(2) ?? "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{t("grades.unweightedGpa", "Unweighted GPA")}</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">
                    {gpaData.gpaUnweighted?.toFixed(2) ?? "—"}
                  </p>
                </div>
                {gpaData.classRank && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{t("grades.classRank", "Class Rank")}</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">
                      #{gpaData.classRank}{" "}
                      <span className="text-sm text-gray-400 font-normal">/ {gpaData.classSize}</span>
                    </p>
                  </div>
                )}
              </div>
              <p className="text-xs text-gray-400">
                {t("grades.totalCredits", "Total Credits:")} {gpaData.totalCredits}
                {gpaData.computedAt && ` | ${t("grades.lastComputed", "Last computed:")} ${format(new Date(gpaData.computedAt), "MMM d, yyyy")}`}
              </p>
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center py-6">{t("grades.noGpaData", "No GPA data computed yet.")}</p>
          )}
        </CardContent>
      </Card>

      {/* Transcript / Grades Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BookOpen className="h-4 w-4 text-indigo-600" />
            {t("grades.transcript", "Transcript")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {transcriptData?.byYear && Object.keys(transcriptData.byYear).length > 0 ? (
            <div className="space-y-5">
              {Object.entries(transcriptData.byYear)
                .sort(([a], [b]) => b.localeCompare(a))
                .map(([year, courses]) => (
                  <div key={year}>
                    <h4 className="text-sm font-semibold text-gray-900 mb-2 pb-1 border-b border-gray-100">
                      {year}
                    </h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-xs text-gray-500 uppercase">
                            <th className="text-left py-1.5 pr-3 font-medium">{t("grades.colCode", "Code")}</th>
                            <th className="text-left py-1.5 pr-3 font-medium">{t("grades.colCourse", "Course")}</th>
                            <th className="text-center py-1.5 pr-3 font-medium">{t("grades.colCredits", "Credits")}</th>
                            <th className="text-center py-1.5 pr-3 font-medium">{t("grades.colGrade", "Grade")}</th>
                            <th className="text-center py-1.5 font-medium">{t("grades.colStatus", "Status")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(courses as TranscriptCourse[]).map((c) => (
                            <tr key={c.id} className="border-t border-gray-50">
                              <td className="py-1.5 pr-3 text-gray-600 font-medium">{c.courseCode || "N/A"}</td>
                              <td className="py-1.5 pr-3 text-gray-700">{c.courseLevel || "Regular"}</td>
                              <td className="py-1.5 pr-3 text-center text-gray-500">{Number(c.credits ?? 0)}</td>
                              <td className={cn(
                                "py-1.5 pr-3 text-center font-semibold",
                                c.grade === "A" || c.grade === "A+" || c.grade === "A-" ? "text-emerald-600" :
                                c.grade === "B" || c.grade === "B+" || c.grade === "B-" ? "text-blue-600" :
                                c.grade === "F" ? "text-red-600" : "text-gray-700"
                              )}>
                                {c.grade || (c.status === "in_progress" ? "IP" : "—")}
                              </td>
                              <td className="py-1.5 text-center">
                                <Badge variant="secondary" className={cn(
                                  "text-xs capitalize",
                                  c.status === "completed" ? "bg-emerald-100 text-emerald-700" :
                                  c.status === "in_progress" ? "bg-amber-100 text-amber-700" :
                                  "bg-gray-100 text-gray-600"
                                )}>
                                  {c.status?.replace("_", " ") || "enrolled"}
                                </Badge>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center py-8">
              {t("grades.noTranscript", "No transcript data available for this student.")}
            </p>
          )}
        </CardContent>
      </Card>
    </TabsContent>
  );
}
