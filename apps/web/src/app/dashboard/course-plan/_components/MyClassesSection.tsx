"use client";

import { Trash2, Loader2 } from "lucide-react";
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
  return (
    <section
      className="rounded-xl p-4"
      style={{ background: "var(--admin-bg-panel)", border: "1px solid var(--admin-border-default)" }}
    >
      <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--admin-font-primary)" }}>
        My Classes ({enrollments.length})
      </h2>
      {enrollments.length === 0 ? (
        <p className="text-sm py-6 text-center" style={{ color: "var(--admin-font-tertiary)" }}>
          No classes planned yet — add some from the catalog below.
        </p>
      ) : (
        <ul className="divide-y" style={{ borderColor: "var(--admin-border-light)" }}>
          {enrollments.map((e) => {
            const course = courseById.get(e.courseId);
            const name = course?.name ?? "Unknown course";
            return (
              <li key={e.id} className="flex items-center justify-between py-2.5 gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: "var(--admin-font-primary)" }}>
                    {name}
                  </p>
                  <p className="text-xs" style={{ color: "var(--admin-font-tertiary)" }}>
                    {course?.code ?? e.courseId} · {course?.credits ?? "—"} credits
                    {e.term ? ` · ${e.term}` : ""} · {e.status}
                  </p>
                </div>
                {e.status === "planned" && (
                  <button
                    type="button"
                    aria-label={`Remove ${name}`}
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
