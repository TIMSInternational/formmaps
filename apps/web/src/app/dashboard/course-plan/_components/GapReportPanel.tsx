"use client";

import { AlertTriangle } from "lucide-react";
import type { GraduationPlanGap } from "@/types/graduationPlan";

interface GapReportPanelProps {
  gaps: GraduationPlanGap[];
  warnings?: string[];
  /** show the link into the supplemental rail (student page only) */
  linkToSupplemental?: boolean;
}

// Honesty surface: what the school catalog can't cover. Never hidden, never
// padded with invented courses.
export function GapReportPanel({ gaps, warnings = [], linkToSupplemental }: GapReportPanelProps) {
  if (gaps.length === 0 && warnings.length === 0) return null;
  return (
    <section className="rounded-xl p-4 border border-amber-300 bg-amber-50">
      <div className="flex items-center gap-2 mb-2">
        <AlertTriangle className="h-4 w-4 text-[#d97706]" />
        <h2 className="text-sm font-semibold text-gray-900">
          What your school can&apos;t cover
        </h2>
      </div>
      {gaps.length > 0 && (
        <ul className="space-y-2">
          {gaps.map((gap) => (
            <li key={gap.category} className="rounded-lg bg-white border border-amber-200 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-gray-900">{gap.category}</span>
                <span className="text-[10px] font-medium text-[#d97706]">
                  {gap.missingCredits} cr missing
                </span>
              </div>
              <p className="text-[11px] text-gray-500 mt-0.5">{gap.reason}</p>
            </li>
          ))}
        </ul>
      )}
      {warnings.length > 0 && (
        <ul className="mt-2 space-y-1">
          {warnings.map((w) => (
            <li key={w} className="text-[11px] text-gray-600">
              · {w}
            </li>
          ))}
        </ul>
      )}
      {linkToSupplemental && gaps.length > 0 && (
        <a
          href="#supplemental-rail"
          className="inline-block mt-3 text-xs font-semibold text-[#065292] hover:underline"
        >
          See online courses that fill these gaps ↓
        </a>
      )}
    </section>
  );
}
