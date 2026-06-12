"use client";

import { Globe, Star } from "lucide-react";
import Link from "next/link";
import { useSupplementalCourses } from "@/hooks/useGraduationPlanQueries";

// Global (Coursera-style) courses recommended for the student's goal —
// especially the categories the school catalog can't cover.
export function SupplementalRail({ enabled }: { enabled: boolean }) {
  const { data: courses, isLoading } = useSupplementalCourses(enabled);

  if (!enabled || isLoading || !courses || courses.length === 0) return null;

  return (
    <section
      id="supplemental-rail"
      className="rounded-xl p-4 bg-[var(--admin-bg-panel)] border border-[var(--admin-border-default)]"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-[#065292]" />
          <h2 className="text-sm font-semibold text-[var(--admin-font-primary)]">
            Go beyond your school
          </h2>
        </div>
        <Link
          href="/dashboard/learning"
          className="text-xs font-medium text-[#065292] hover:underline"
        >
          Browse the Learning Hub →
        </Link>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {courses.map((c) => (
          <Link
            key={c.id}
            href="/dashboard/learning"
            className="shrink-0 w-56 rounded-lg border border-[var(--admin-border-default)] p-3 hover:bg-[var(--admin-bg-hover)] transition-colors"
          >
            <p className="text-xs font-semibold truncate text-[var(--admin-font-primary)]">
              {c.title}
            </p>
            <p className="text-[10px] mt-0.5 text-[var(--admin-font-tertiary)]">
              {[c.provider, c.category].filter(Boolean).join(" · ") || "Online course"}
              {c.rating != null && (
                <span className="inline-flex items-center gap-0.5 ml-1">
                  <Star className="h-2.5 w-2.5 fill-current text-[#d97706]" />
                  {Number(c.rating).toFixed(1)}
                </span>
              )}
            </p>
            {c.fillsGap && (
              <span className="inline-block mt-1.5 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-[#FFD600] text-[#111111]">
                Fills: {c.fillsGap} gap
              </span>
            )}
            <p className="text-[10px] mt-1.5 leading-snug text-[var(--admin-font-secondary)] line-clamp-2">
              {c.reason}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}
