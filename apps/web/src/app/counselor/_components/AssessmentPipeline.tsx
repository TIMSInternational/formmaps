"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, Filter, Check, Minus } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api/apiClient";
import { useTranslation } from "react-i18next";

interface PipelineStudent {
  id: string;
  name: string;
  gradeLevel?: number;
  pcaExams?: Record<string, string>;
  milStatus?: string;
  eval360Status?: string;
}

export function AssessmentPipeline() {
  const router = useRouter();
  const { t } = useTranslation("counselor");
  const [pipelineGrade, setPipelineGrade] = useState<string>("");
  const [incompleteOnly, setIncompleteOnly] = useState(false);

  const { data: pipelineData, isLoading: pipelineLoading } = useQuery({
    queryKey: ["counselor-assessment-pipeline", pipelineGrade, incompleteOnly],
    queryFn: () => {
      const params = new URLSearchParams();
      if (pipelineGrade) params.set("grade", pipelineGrade);
      if (incompleteOnly) params.set("incompleteOnly", "true");
      const qs = params.toString();
      return apiRequest<{ data?: PipelineStudent[] }>(`/api/v1/counselor/assessment-pipeline${qs ? `?${qs}` : ""}`);
    },
    staleTime: 5 * 60 * 1000,
  });

  const students = (pipelineData?.data ?? []) as PipelineStudent[];
  const examKeys = ["PatternRecognition", "VerbalReasoning", "WorkingMemory", "NumericVelocity", "VisualRotation"] as const;

  return (
    <Card className="dash-card h-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base text-foreground">
            <Users className="h-4 w-4 text-indigo-600" />
            {t("pipeline.title", "Assessment Pipeline")}
          </CardTitle>
          <Link href="/counselor/students">
            <Button variant="ghost" size="sm" className="text-xs text-indigo-600 hover:bg-indigo-50">
              {t("pipeline.viewAll", "View All Students →")}
            </Button>
          </Link>
        </div>
        <div className="flex items-center gap-2 mt-2">
          <div className="relative flex-1">
            <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <select
              value={pipelineGrade}
              onChange={(e) => setPipelineGrade(e.target.value)}
              className="w-full pl-8 pr-3 h-8 text-xs border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300"
            >
              <option value="">{t("pipeline.allGrades", "All Grades")}</option>
              {[7, 8, 9, 10, 11, 12].map((g) => (
                <option key={g} value={String(g)}>{t("pipeline.grade", { n: g }, `Grade ${g}`)}</option>
              ))}
            </select>
          </div>
          <Button
            variant={incompleteOnly ? "default" : "outline"}
            size="sm"
            className={`h-8 text-xs ${incompleteOnly ? "bg-indigo-600 hover:bg-indigo-700 text-white" : ""}`}
            onClick={() => setIncompleteOnly(!incompleteOnly)}
          >
            {t("pipeline.incompleteOnly", "Incomplete Only")}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {pipelineLoading ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : !students.length ? (
          <div className="text-center py-12">
            <Users className="h-10 w-10 text-gray-200 mx-auto mb-2" />
            <p className="text-gray-400 text-sm">{t("pipeline.noStudents", "No students found.")}</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-gray-50 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <th className="pl-5 py-2.5 pr-2">{t("pipeline.colStudent", "Student")}</th>
                    <th className="px-2 py-2.5 w-14">{t("pipeline.colGrade", "Grade")}</th>
                    <th className="px-1.5 py-2.5 text-center w-12" title={t("assessments.examPattern", "Pattern Recognition")}>{t("pipeline.colPattern", "Pattern")}</th>
                    <th className="px-1.5 py-2.5 text-center w-12" title={t("assessments.examVerbal", "Verbal Reasoning")}>{t("pipeline.colVerbal", "Verbal")}</th>
                    <th className="px-1.5 py-2.5 text-center w-12" title={t("assessments.examMemory", "Working Memory")}>{t("pipeline.colMemory", "Memory")}</th>
                    <th className="px-1.5 py-2.5 text-center w-14" title={t("assessments.examNumeric", "Numeric Velocity")}>{t("pipeline.colNumeric", "Numeric")}</th>
                    <th className="px-1.5 py-2.5 text-center w-14" title={t("assessments.examRotation", "Visual Rotation")}>{t("pipeline.colRotation", "Rotation")}</th>
                    <th className="px-1.5 py-2.5 text-center w-10">{t("pipeline.colMil", "MIL")}</th>
                    <th className="px-1.5 py-2.5 text-center w-10 pr-5">{t("pipeline.col360", "360°")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {students.slice(0, 10).map((s) => {
                    const pca: Record<string, string> = s.pcaExams ?? {};
                    return (
                      <tr
                        key={s.id}
                        className="hover:bg-indigo-50/40 cursor-pointer transition-colors"
                        onClick={() => router.push(`/counselor/students/${s.id}`)}
                      >
                        <td className="pl-5 py-2 pr-2">
                          <div className="flex items-center gap-2">
                            <Avatar className="h-6 w-6">
                              <AvatarFallback className="text-[9px] bg-indigo-100 text-indigo-700 font-bold">
                                {s.name?.slice(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-[13px] font-medium text-foreground truncate max-w-[140px]">{s.name}</span>
                          </div>
                        </td>
                        <td className="px-2 py-2">
                          <span className="text-[12px] text-muted-foreground">{s.gradeLevel ? `Gr ${s.gradeLevel}` : "\u2014"}</span>
                        </td>
                        {examKeys.map((key) => {
                          const status = pca[key] ?? "not_started";
                          return (
                            <td key={key} className="px-1.5 py-2 text-center">
                              {status === "completed" ? (
                                <Check className="h-3.5 w-3.5 text-green-600 mx-auto" />
                              ) : status === "in_progress" ? (
                                <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-400 mx-auto" />
                              ) : (
                                <Minus className="h-3.5 w-3.5 text-gray-300 mx-auto" />
                              )}
                            </td>
                          );
                        })}
                        <td className="px-1.5 py-2 text-center">
                          {s.milStatus === "completed" ? (
                            <Check className="h-3.5 w-3.5 text-green-600 mx-auto" />
                          ) : s.milStatus === "in_progress" ? (
                            <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-400 mx-auto" />
                          ) : (
                            <Minus className="h-3.5 w-3.5 text-gray-300 mx-auto" />
                          )}
                        </td>
                        <td className="px-1.5 py-2 text-center pr-5">
                          {s.eval360Status === "completed" ? (
                            <Check className="h-3.5 w-3.5 text-green-600 mx-auto" />
                          ) : s.eval360Status === "in_progress" ? (
                            <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-400 mx-auto" />
                          ) : (
                            <Minus className="h-3.5 w-3.5 text-gray-300 mx-auto" />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {students.length > 10 && (
              <div className="px-5 py-3 border-t border-gray-100">
                <Link href="/counselor/students" className="text-xs font-medium text-indigo-600 hover:text-indigo-700">
                  {t("pipeline.viewAll", "View All Students →")}
                </Link>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
