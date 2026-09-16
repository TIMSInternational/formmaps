"use client";

import { Check } from "lucide-react";

interface StepIndicatorProps {
  /** Zero-based index of the step currently being shown. */
  current: number;
  labels: string[];
}

/**
 * Light-themed sibling of the bulk-onboard stepper. Kept local to this wizard
 * rather than imported across route folders, and rather than refactoring the
 * bulk-onboard one, which is on a different surface with a dark palette.
 */
export function StepIndicator({ current, labels }: StepIndicatorProps) {
  return (
    <ol className="flex items-center justify-center gap-0" aria-label="Progress">
      {labels.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={label} className="flex items-center">
            <div className="flex flex-col items-center gap-1.5">
              <span
                aria-current={active ? "step" : undefined}
                className={[
                  "flex h-8 w-8 items-center justify-center rounded-full text-[13px] font-bold transition-all",
                  done
                    ? "bg-[#2E9098] text-white"
                    : active
                      ? "bg-[#2E9098] text-white ring-4 ring-[#2E9098]/15"
                      : "bg-gray-100 text-gray-400 ring-1 ring-gray-200",
                ].join(" ")}
              >
                {done ? <Check className="h-4 w-4" aria-hidden="true" /> : i + 1}
              </span>
              <span
                className={[
                  "whitespace-nowrap text-[11px]",
                  active ? "font-semibold text-gray-900" : done ? "text-[#2E9098]" : "text-gray-400",
                ].join(" ")}
              >
                {label}
              </span>
            </div>
            {i < labels.length - 1 && (
              <span
                aria-hidden="true"
                className={[
                  "mb-5 mx-2 h-0.5 w-10 transition-colors sm:w-14",
                  done ? "bg-[#2E9098]" : "bg-gray-200",
                ].join(" ")}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
