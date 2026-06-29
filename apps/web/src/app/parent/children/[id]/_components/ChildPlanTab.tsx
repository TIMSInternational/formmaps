"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { GraduationCap, Target, ChevronDown, ChevronRight, BookOpen } from "lucide-react";
import { TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useChildCoursePlan } from "@/hooks/useGraduationPlanQueries";

interface ChildPlanTabProps {
  studentId: string;
}

// Read-only compact view of the child's graduation goal + approved plan.
// Deliberately NOT the SequenceBuilder — parents get a summary, not an editor.
export function ChildPlanTab({ studentId }: ChildPlanTabProps) {
  const { t } = useTranslation("parent");
  const { data, isLoading } = useChildCoursePlan(studentId);
  // Grades default open — parents should see the plan at a glance.
  const [closedGrades, setClosedGrades] = useState<number[]>([]);

  const itemsByGrade = useMemo(() => {
    const grouped = new Map<number, Array<{ courseCode: string; courseName: string; credits: number; gradeLevel: number; term: string | null }>>();
    for (const item of data?.approvedPlan?.items ?? []) {
      const list = grouped.get(item.gradeLevel) ?? [];
      list.push(item);
      grouped.set(item.gradeLevel, list);
    }
    return [...grouped.entries()].sort(([a], [b]) => a - b);
  }, [data?.approvedPlan?.items]);

  const statusCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of data?.currentCourses ?? []) {
      counts.set(c.status, (counts.get(c.status) ?? 0) + 1);
    }
    return [...counts.entries()];
  }, [data?.currentCourses]);

  const toggleGrade = (g: number) =>
    setClosedGrades((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]));
  const isGradeOpen = (g: number) => !closedGrades.includes(g);

  return (
    <TabsContent value="course-plan" className="mt-4 space-y-4">
      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-16" />
          <Skeleton className="h-24" />
        </div>
      ) : (
        <>
          {/* Goal */}
          <div className="dash-card p-4 flex items-center gap-3">
            <Target className="h-4 w-4 text-[#065292] shrink-0" />
            {data?.target ? (
              <p className="text-sm text-foreground">
                <span className="font-semibold">{t("plan.goal")}:</span>{" "}
                {[data.target.universityName, data.target.major].filter(Boolean).join(" · ")}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t("plan.noGoal")}
              </p>
            )}
          </div>

          {/* Current courses */}
          <div className="dash-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <BookOpen className="h-4 w-4 text-[#065292]" />
              <h3 className="text-sm font-semibold text-foreground">
                {t("plan.thisYear")}
              </h3>
            </div>
            {data?.currentCourses && data.currentCourses.length > 0 ? (
              <p className="text-sm text-muted-foreground">
                {data.currentCourses.length}{" "}
                {data.currentCourses.length === 1
                  ? t("plan.courseThisYear")
                  : t("plan.coursesThisYear")}
                {statusCounts.length > 0 &&
                  ` — ${statusCounts.map(([s, n]) => `${n} ${s.replace("_", " ")}`).join(", ")}`}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t("plan.noCourses")}
              </p>
            )}
          </div>

          {/* Approved multi-year plan */}
          <div className="dash-card p-4">
            <div className="flex items-center gap-2 mb-3">
              <GraduationCap className="h-4 w-4 text-[#065292]" />
              <h3 className="text-sm font-semibold text-foreground">
                {t("plan.approvedPlan")}
              </h3>
              {data?.approvedPlan?.approvedAt && (
                <span className="text-xs text-muted-foreground">
                  {t("plan.approvedOn")}{" "}
                  {new Date(data.approvedPlan.approvedAt).toLocaleDateString()}
                </span>
              )}
            </div>
            {itemsByGrade.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("plan.noApprovedPlan")}
              </p>
            ) : (
              <div className="space-y-2">
                {itemsByGrade.map(([grade, items]) => (
                  <div key={grade} className="rounded-lg border border-[var(--border)] overflow-hidden">
                    <button
                      type="button"
                      onClick={() => toggleGrade(grade)}
                      className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-muted/50"
                    >
                      <span className="font-medium text-foreground flex items-center gap-1.5">
                        {isGradeOpen(grade) ? (
                          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                        {t("plan.grade")} {grade}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {items.length} {items.length === 1 ? t("plan.course") : t("plan.courses")}
                      </span>
                    </button>
                    {isGradeOpen(grade) && (
                      <ul className="divide-y divide-[var(--border)] border-t border-[var(--border)]">
                        {items.map((item) => (
                          <li
                            key={`${item.courseCode}-${item.term}`}
                            className="flex items-center justify-between px-3 py-2 text-sm"
                          >
                            <span className="text-foreground truncate">{item.courseName}</span>
                            <span className="text-xs text-muted-foreground shrink-0 ml-3">
                              {item.courseCode} · {item.credits} cr{item.term ? ` · ${item.term}` : ""}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </TabsContent>
  );
}
