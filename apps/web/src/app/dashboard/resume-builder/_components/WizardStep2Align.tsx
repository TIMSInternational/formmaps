"use client";

import { motion } from "motion/react";
import { ArrowLeft, Check, Loader2 } from "lucide-react";
import type { ExtractedJobData } from "@/types/resume";

interface EnhanceSections {
  summary: boolean;
  skills: boolean;
  experience: boolean;
  projects: boolean;
}

interface WizardStep2AlignProps {
  extractedJob: ExtractedJobData;
  enhanceSections: EnhanceSections;
  onEnhanceSectionsChange: (sections: EnhanceSections) => void;
  selectedKeywords: string[];
  onSelectedKeywordsChange: (keywords: string[]) => void;
  onBack: () => void;
  onTailor: () => void;
  isTailoring: boolean;
}

const SECTION_LABELS: Record<string, string> = {
  summary: "Professional Summary",
  skills: "Skills",
  experience: "Experience",
  projects: "Projects",
};

export function WizardStep2Align({
  extractedJob,
  enhanceSections,
  onEnhanceSectionsChange,
  selectedKeywords,
  onSelectedKeywordsChange,
  onBack,
  onTailor,
  isTailoring,
}: WizardStep2AlignProps) {
  const allKeywords = Array.from(
    new Set([
      ...(extractedJob.requiredSkills || []),
      ...(extractedJob.preferredSkills || []),
      ...(extractedJob.industryKeywords || []),
    ])
  );

  return (
    <motion.div
      key="step-2"
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ duration: 0.25 }}
      className="space-y-6"
    >
      {/* Sections to enhance */}
      <div className="dash-card p-6 space-y-4">
        <h2 className="text-lg font-semibold text-foreground">
          Sections to Enhance
        </h2>
        <p className="text-sm text-muted-foreground">
          Choose which sections of your resume to tailor for this role.
        </p>
        <div className="grid grid-cols-2 gap-3">
          {(Object.keys(enhanceSections) as Array<keyof EnhanceSections>).map(
            (key) => {
              const isSelected = enhanceSections[key];
              return (
                <button
                  key={key}
                  onClick={() =>
                    onEnhanceSectionsChange({
                      ...enhanceSections,
                      [key]: !enhanceSections[key],
                    })
                  }
                  className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm text-left transition-colors ${
                    isSelected
                      ? "border-foreground bg-foreground/5 text-foreground"
                      : "border-border text-muted-foreground hover:border-foreground/20"
                  }`}
                >
                  <div
                    className={`flex items-center justify-center w-5 h-5 rounded border transition-colors ${
                      isSelected
                        ? "bg-foreground border-foreground"
                        : "border-border"
                    }`}
                  >
                    {isSelected && (
                      <Check className="w-3 h-3 text-background" />
                    )}
                  </div>
                  {SECTION_LABELS[key]}
                </button>
              );
            }
          )}
        </div>
      </div>

      {/* Keywords to include */}
      <div className="dash-card p-6 space-y-4">
        <h2 className="text-lg font-semibold text-foreground">
          Keywords to Include
        </h2>
        <p className="text-sm text-muted-foreground">
          Select which keywords from the job posting to weave into your resume.
        </p>
        <div className="flex flex-wrap gap-2">
          {allKeywords.map((kw) => {
            const isSelected = selectedKeywords.includes(kw);
            return (
              <button
                key={kw}
                onClick={() =>
                  onSelectedKeywordsChange(
                    isSelected
                      ? selectedKeywords.filter((k) => k !== kw)
                      : [...selectedKeywords, kw]
                  )
                }
                className={`inline-flex items-center rounded-full border px-3 py-1 text-xs transition-colors ${
                  isSelected
                    ? "border-foreground bg-foreground/5 text-foreground"
                    : "border-border text-muted-foreground hover:border-foreground/20"
                }`}
              >
                {isSelected && <Check className="w-3 h-3 mr-1" />}
                {kw}
              </button>
            );
          })}
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <button
          onClick={onTailor}
          disabled={isTailoring}
          className="inline-flex items-center gap-2 bg-foreground text-background hover:bg-foreground/90 rounded-xl px-6 py-2.5 text-sm font-medium disabled:opacity-50 transition-colors"
        >
          {isTailoring ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Generating...
            </>
          ) : (
            "Generate Tailored Resume"
          )}
        </button>
      </div>
    </motion.div>
  );
}
