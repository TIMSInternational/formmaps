"use client";

import { Trash2, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { SchoolCourse, PlanEnrollment } from "./types";

interface MyClassesSectionProps {
  enrollments: PlanEnrollment[];
  courseById: Map<string, SchoolCourse>;
  onRemove: (enrollment: PlanEnrollment, name: string) => void;
  busyId: string | null;
}

export function MyClassesSection({
  enrollments,
  courseById,
  onRemove,
  busyId,
}: MyClassesSectionProps) {
  const { t } = useTranslation();
  return (
    <section
      className="rounded-xl p-4"
      style={{ background: "var(--admin-bg-panel)", border: "1px solid var(--admin-border-default)" }}
    >
      <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--admin-font-primary)" }}>
        {t("studentUi.coursePlan.myClasses.title", { count: enrollments.length })}
      </h2>
      {enrollments.length === 0 ? (
        <p className="text-sm py-6 text-center" style={{ color: "var(--admin-font-tertiary)" }}>
          {t("studentUi.coursePlan.myClasses.empty")}
        </p>
      ) : (
        <ul className="divide-y" style={{ borderColor: "var(--admin-border-light)" }}>
          {enrollments.map((e) => {
            const course = courseById.get(e.courseId);
            const name = course?.name ?? t("studentUi.coursePlan.myClasses.unknownCourse");
            return (
              <li key={e.id} className="flex items-center justify-between py-2.5 gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: "var(--admin-font-primary)" }}>
                    {name}
                  </p>
                  <p className="text-xs" style={{ color: "var(--admin-font-tertiary)" }}>
                    {course?.code ?? e.courseId} · {t("coursePlan.catalog.credits", { credits: course?.credits ?? "—" })}
                    {e.term ? ` · ${t(`coursePlan.catalog.terms.${e.term}`, { defaultValue: e.term })}` : ""} ·{" "}
                    {t(`studentUi.coursePlan.enrollmentStatus.${e.status}`, { defaultValue: e.status })}
                  </p>
                </div>
                {e.status === "planned" && (
                  <button
                    type="button"
                    aria-label={t("studentUi.coursePlan.myClasses.removeAria", { name })}
                    disabled={busyId === e.courseId}
                    onClick={() => onRemove(e, name)}
                    className="shrink-0 p-2 rounded-md transition-colors hover:bg-red-50"
                    style={{ color: "#dc2626" }}
                  >
                    {busyId === e.courseId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
