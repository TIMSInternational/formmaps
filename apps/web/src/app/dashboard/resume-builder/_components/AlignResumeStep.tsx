"use client";

import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import {
  FileText,
  Wrench,
  Briefcase,
  FolderKanban,
  Info,
  Check,
  Plus,
  X,
  ArrowLeft,
  ArrowRight,
} from "lucide-react";
import type { ExtractedJobData } from "@/types/resume";

export interface AlignConfig {
  enhanceSummary: boolean;
  enhanceSkills: boolean;
  enhanceExperience: boolean;
  enhanceProjects: boolean;
  experienceMode: "quick" | "full";
  additionalKeywords: string[];
}

interface AlignResumeStepProps {
  extractedJob: ExtractedJobData;
  onGenerate: (config: AlignConfig) => void;
  onBack: () => void;
}

const sectionOptions = [
  {
    key: "enhanceSummary" as const,
    label: "Summary",
    icon: FileText,
    tooltip: "Rewrite your professional summary to match this role",
  },
  {
    key: "enhanceSkills" as const,
    label: "Skills",
    icon: Wrench,
    tooltip: "Add missing skills and reorder to match job requirements",
  },
  {
    key: "enhanceExperience" as const,
    label: "Work Experience",
    icon: Briefcase,
    tooltip: "Rephrase bullet points with relevant keywords",
  },
  {
    key: "enhanceProjects" as const,
    label: "Projects",
    icon: FolderKanban,
    tooltip: "Highlight projects relevant to this position",
  },
];

export function AlignResumeStep({
  extractedJob,
  onGenerate,
  onBack,
}: AlignResumeStepProps) {
  const [config, setConfig] = useState<AlignConfig>({
    enhanceSummary: false,
    enhanceSkills: true,
    enhanceExperience: true,
    enhanceProjects: true,
    experienceMode: "quick",
    additionalKeywords: [],
  });

  const [selectedKeywords, setSelectedKeywords] = useState<Set<string>>(
    new Set()
  );
  const [customInput, setCustomInput] = useState("");
  const [hoveredTooltip, setHoveredTooltip] = useState<string | null>(null);

  // All "missing" keywords from job posting
  const missingKeywords = [
    ...extractedJob.requiredSkills,
    ...extractedJob.preferredSkills,
    ...extractedJob.industryKeywords,
  ].filter(
    (kw, idx, arr) => arr.findIndex((k) => k.toLowerCase() === kw.toLowerCase()) === idx
  );

  const toggleSection = useCallback(
    (key: "enhanceSummary" | "enhanceSkills" | "enhanceExperience" | "enhanceProjects") => {
      setConfig((prev) => ({ ...prev, [key]: !prev[key] }));
    },
    []
  );

  const toggleKeyword = useCallback((keyword: string) => {
    setSelectedKeywords((prev) => {
      const next = new Set(prev);
      if (next.has(keyword)) {
        next.delete(keyword);
      } else {
        next.add(keyword);
      }
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedKeywords((prev) => {
      if (prev.size === missingKeywords.length) {
        return new Set();
      }
      return new Set(missingKeywords);
    });
  }, [missingKeywords]);

  const addCustomKeyword = useCallback(() => {
    const trimmed = customInput.trim();
    if (!trimmed) return;
    if (
      !missingKeywords.some((k) => k.toLowerCase() === trimmed.toLowerCase()) &&
      !config.additionalKeywords.some(
        (k) => k.toLowerCase() === trimmed.toLowerCase()
      )
    ) {
      setConfig((prev) => ({
        ...prev,
        additionalKeywords: [...prev.additionalKeywords, trimmed],
      }));
      setSelectedKeywords((prev) => new Set([...prev, trimmed]));
    }
    setCustomInput("");
  }, [customInput, missingKeywords, config.additionalKeywords]);

  const removeCustomKeyword = useCallback((keyword: string) => {
    setConfig((prev) => ({
      ...prev,
      additionalKeywords: prev.additionalKeywords.filter((k) => k !== keyword),
    }));
    setSelectedKeywords((prev) => {
      const next = new Set(prev);
      next.delete(keyword);
      return next;
    });
  }, []);

  const handleGenerate = useCallback(() => {
    onGenerate({
      ...config,
      additionalKeywords: [...selectedKeywords],
    });
  }, [config, selectedKeywords, onGenerate]);

  const allKeywords = [...missingKeywords, ...config.additionalKeywords];
  const hasAnySectionSelected =
    config.enhanceSummary ||
    config.enhanceSkills ||
    config.enhanceExperience ||
    config.enhanceProjects;

  return (
    <div className="space-y-6">
      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Column 1 — Sections */}
        <motion.div
          className="dash-card p-5"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <h3 className="text-sm font-semibold text-foreground mb-1">
            1. Choose sections to enhance
          </h3>
          <p className="text-xs text-muted-foreground mb-4">
            Select which parts of your resume to tailor for this role.
          </p>

          <div className="space-y-2.5">
            {sectionOptions.map((section) => {
              const isActive = config[section.key];
              const Icon = section.icon;

              return (
                <div key={section.key}>
                  <button
                    type="button"
                    onClick={() => toggleSection(section.key)}
                    className={`w-full flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors ${
                      isActive
                        ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10"
                        : "border-border bg-secondary hover:bg-secondary/80"
                    }`}
                  >
                    <div
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
                        isActive
                          ? "border-emerald-500 bg-emerald-500 text-white"
                          : "border-border bg-background"
                      }`}
                    >
                      {isActive && <Check className="h-3 w-3" />}
                    </div>
                    <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-sm font-medium text-foreground flex-1">
                      {section.label}
                    </span>
                    <div
                      className="relative"
                      onMouseEnter={() => setHoveredTooltip(section.key)}
                      onMouseLeave={() => setHoveredTooltip(null)}
                    >
                      <Info className="h-3.5 w-3.5 text-muted-foreground" />
                      {hoveredTooltip === section.key && (
                        <div className="absolute right-0 bottom-full mb-2 w-52 rounded-lg border border-border bg-background p-2.5 text-xs text-muted-foreground z-10">
                          {section.tooltip}
                        </div>
                      )}
                    </div>
                  </button>

                  {/* Experience sub-options */}
                  {section.key === "enhanceExperience" && isActive && (
                    <motion.div
                      className="ml-12 mt-2 space-y-1.5"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      transition={{ duration: 0.2 }}
                    >
                      <label className="flex items-center gap-2.5 cursor-pointer">
                        <div
                          className={`flex h-4 w-4 items-center justify-center rounded-full border transition-colors ${
                            config.experienceMode === "quick"
                              ? "border-emerald-500 bg-emerald-500"
                              : "border-border"
                          }`}
                        >
                          {config.experienceMode === "quick" && (
                            <div className="h-1.5 w-1.5 rounded-full bg-white" />
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setConfig((prev) => ({
                              ...prev,
                              experienceMode: "quick",
                            }))
                          }
                          className="text-xs text-foreground text-left"
                        >
                          Quick Edit{" "}
                          <span className="text-muted-foreground">
                            (First 2 key experiences)
                          </span>
                        </button>
                      </label>
                      <label className="flex items-center gap-2.5 cursor-pointer">
                        <div
                          className={`flex h-4 w-4 items-center justify-center rounded-full border transition-colors ${
                            config.experienceMode === "full"
                              ? "border-emerald-500 bg-emerald-500"
                              : "border-border"
                          }`}
                        >
                          {config.experienceMode === "full" && (
                            <div className="h-1.5 w-1.5 rounded-full bg-white" />
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setConfig((prev) => ({
                              ...prev,
                              experienceMode: "full",
                            }))
                          }
                          className="text-xs text-foreground text-left"
                        >
                          Full Edit{" "}
                          <span className="text-muted-foreground">
                            (All experiences, longer processing)
                          </span>
                        </button>
                      </label>
                    </motion.div>
                  )}
                </div>
              );
            })}
          </div>
        </motion.div>

        {/* Column 2 — Keywords */}
        <motion.div
          className="dash-card p-5"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.05 }}
        >
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-semibold text-foreground">
              2. Add missing keywords
            </h3>
            <span className="text-xs text-muted-foreground">
              {selectedKeywords.size}/{allKeywords.length}
            </span>
          </div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs text-muted-foreground">
              Keywords from the job posting not found in your resume.
            </p>
            <button
              type="button"
              onClick={toggleSelectAll}
              className="text-xs font-medium text-emerald-600 hover:text-emerald-700 transition-colors"
            >
              {selectedKeywords.size === allKeywords.length
                ? "Deselect all"
                : "Select all"}
            </button>
          </div>

          {/* Keyword checkboxes */}
          <div className="space-y-1.5 max-h-[280px] overflow-y-auto pr-1">
            {allKeywords.map((keyword) => {
              const isSelected = selectedKeywords.has(keyword);
              const isCustom = config.additionalKeywords.includes(keyword);

              return (
                <div
                  key={keyword}
                  className="flex items-center gap-2.5 group"
                >
                  <button
                    type="button"
                    onClick={() => toggleKeyword(keyword)}
                    className={`flex-1 flex items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors ${
                      isSelected
                        ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10"
                        : "border-border bg-secondary hover:bg-secondary/80"
                    }`}
                  >
                    <div
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                        isSelected
                          ? "border-emerald-500 bg-emerald-500 text-white"
                          : "border-border bg-background"
                      }`}
                    >
                      {isSelected && <Check className="h-2.5 w-2.5" />}
                    </div>
                    <span className="text-xs font-medium text-foreground">
                      {keyword}
                    </span>
                  </button>
                  {isCustom && (
                    <button
                      type="button"
                      onClick={() => removeCustomKeyword(keyword)}
                      className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-red-500 transition-all"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              );
            })}

            {allKeywords.length === 0 && (
              <p className="text-xs text-muted-foreground py-4 text-center">
                No keywords extracted from the job posting.
              </p>
            )}
          </div>

          {/* Add custom keyword */}
          <div className="mt-4 flex gap-2">
            <input
              type="text"
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addCustomKeyword();
                }
              }}
              placeholder="Add keyword..."
              className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
            />
            <button
              type="button"
              onClick={addCustomKeyword}
              disabled={!customInput.trim()}
              className="flex items-center gap-1 rounded-lg border border-border bg-secondary px-3 py-2 text-xs font-medium text-foreground hover:bg-secondary/80 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Plus className="h-3 w-3" />
              Add
            </button>
          </div>
        </motion.div>
      </div>

      {/* Bottom Actions */}
      <motion.div
        className="flex items-center justify-between pt-4 border-t border-border"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
      >
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={!hasAnySectionSelected}
          className="flex items-center gap-2 rounded-xl bg-emerald-500 px-6 py-2.5 text-sm font-semibold text-white hover:bg-emerald-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Generate My New Resume
          <ArrowRight className="h-4 w-4" />
        </button>
      </motion.div>
    </div>
  );
}
