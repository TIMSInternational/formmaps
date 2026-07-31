"use client";

import { Check } from "lucide-react";

const STEPS = [
  { label: "See Your Difference" },
  { label: "Align Your Resume" },
  { label: "Review Your New Resume" },
] as const;

export function StepProgressBar({ current }: { current: number }) {
  return (
    <div className="flex items-center justify-center gap-0">
      {STEPS.map((s, i) => {
        const stepNum = i + 1;
        const isCompleted = stepNum < current;
        const isActive = stepNum === current;

        return (
          <div key={s.label} className="flex items-center">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium transition-colors ${
                  isCompleted
                    ? "bg-emerald-500 text-white"
                    : isActive
                      ? "bg-foreground text-background"
                      : "bg-secondary text-muted-foreground"
                }`}
              >
                {isCompleted ? <Check className="w-4 h-4" /> : stepNum}
              </div>
              <span
                className={`text-xs whitespace-nowrap ${
                  isActive
                    ? "text-foreground font-medium"
                    : "text-muted-foreground"
                }`}
              >
                {s.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={`w-16 sm:w-24 h-px mx-3 mb-5 ${
                  stepNum < current
                    ? "bg-emerald-500"
                    : "border-t border-dashed border-border"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
