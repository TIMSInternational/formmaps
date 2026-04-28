"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Download,
  ArrowRight,
  Zap,
  Lightbulb,
  TrendingUp,
} from "lucide-react";
import type { ExtractedJobData, TailoredResume } from "@/types/resume";

interface ReviewResumeStepProps {
  tailoredResume: TailoredResume;
  extractedJob: ExtractedJobData;
  previousScore: number;
  onBack: () => void;
  onDownload: () => void;
  onCreateResume: () => void;
}

/* ---------- Score Gauge (SVG circle) ---------- */
function ScoreGauge({ score }: { score: number }) {
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;
  const color =
    score > 75
      ? "text-emerald-500"
      : score >= 50
        ? "text-amber-500"
        : "text-red-500";
  const strokeColor =
    score > 75
      ? "stroke-emerald-500"
      : score >= 50
        ? "stroke-amber-500"
        : "stroke-red-500";
  const label =
    score > 75 ? "Great" : score >= 50 ? "Fair" : "Needs Work";

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative">
        <svg width="100" height="100" viewBox="0 0 100 100">
          {/* Background circle */}
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth="6"
            className="text-border"
          />
          {/* Progress arc */}
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            strokeWidth="6"
            strokeLinecap="round"
            className={strokeColor}
            strokeDasharray={circumference}
            strokeDashoffset={circumference - progress}
            transform="rotate(-90 50 50)"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-xl font-bold ${color}`}>{score}</span>
          <span className="text-[10px] text-muted-foreground">{label}</span>
        </div>
      </div>
    </div>
  );
}

/* ---------- Resume HTML Preview ---------- */
function ResumePreviewHTML({
  tailoredResume,
}: {
  tailoredResume: TailoredResume;
}) {
  return (
    <div className="aspect-[8.5/11] w-full overflow-y-auto rounded-lg border border-border bg-white p-8">
      {/* Name */}
      <div className="text-center mb-4">
        <h1 className="text-sm font-bold text-gray-900 uppercase tracking-wide">
          Your Name
        </h1>
        <p className="text-[10px] text-gray-500 mt-0.5">
          email@example.com | (000) 000-0000 | City, State
        </p>
      </div>

      {/* Summary */}
      {tailoredResume.tailoredSummary && (
        <div className="mb-3">
          <h2 className="text-[10px] font-bold text-gray-900 uppercase tracking-wider border-b border-gray-300 pb-0.5 mb-1.5">
            Summary
          </h2>
          <p className="text-[9px] leading-relaxed text-gray-700">
            {tailoredResume.tailoredSummary}
          </p>
        </div>
      )}

      {/* Experience */}
      {tailoredResume.tailoredExperience.length > 0 && (
        <div className="mb-3">
          <h2 className="text-[10px] font-bold text-gray-900 uppercase tracking-wider border-b border-gray-300 pb-0.5 mb-1.5">
            Relevant Experience
          </h2>
          <div className="space-y-2">
            {tailoredResume.tailoredExperience.map((exp, idx) => (
              <div key={`${exp.company}-${idx}`}>
                <div className="flex items-baseline justify-between">
                  <p className="text-[9px] font-semibold text-gray-900">
                    {exp.title}
                  </p>
                  <p className="text-[8px] text-gray-500">{exp.company}</p>
                </div>
                <ul className="mt-0.5 space-y-0.5">
                  {exp.descriptions.map((desc, dIdx) => (
                    <li
                      key={dIdx}
                      className="text-[9px] text-gray-700 pl-2 relative before:content-[''] before:absolute before:left-0 before:top-[5px] before:h-[3px] before:w-[3px] before:rounded-full before:bg-gray-400"
                    >
                      {desc}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Skills */}
      {tailoredResume.tailoredSkills.length > 0 && (
        <div className="mb-3">
          <h2 className="text-[10px] font-bold text-gray-900 uppercase tracking-wider border-b border-gray-300 pb-0.5 mb-1.5">
            Technical Skills
          </h2>
          <p className="text-[9px] text-gray-700 leading-relaxed">
            {tailoredResume.tailoredSkills.join(" | ")}
          </p>
        </div>
      )}

      {/* Education placeholder */}
      <div>
        <h2 className="text-[10px] font-bold text-gray-900 uppercase tracking-wider border-b border-gray-300 pb-0.5 mb-1.5">
          Education
        </h2>
        <p className="text-[9px] text-gray-500 italic">
          Education section will be carried over from your current resume.
        </p>
      </div>
    </div>
  );
}

/* ---------- AI Suggestion Buttons ---------- */
const aiSuggestions = [
  {
    label: "Use stronger action verbs for experience",
    icon: Zap,
  },
  {
    label: "Shorten my summary to be more concise",
    icon: Lightbulb,
  },
  {
    label: "Remove skills not related to this job",
    icon: TrendingUp,
  },
];

/* ---------- Main Component ---------- */
export function ReviewResumeStep({
  tailoredResume,
  extractedJob,
  previousScore,
  onBack,
  onDownload,
  onCreateResume,
}: ReviewResumeStepProps) {
  const newScore = tailoredResume.atsScore;

  const scoreDelta = useMemo(
    () => newScore - previousScore,
    [newScore, previousScore]
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        {/* Left — Resume Preview */}
        <motion.div
          className="dash-card p-4"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          {/* Top toolbar */}
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xs font-medium text-muted-foreground">
              Preview
            </span>
            <span className="ml-auto text-[10px] text-muted-foreground">
              Tailored for{" "}
              <span className="font-semibold text-foreground">
                {extractedJob.jobTitle}
              </span>
              {extractedJob.company ? ` at ${extractedJob.company}` : ""}
            </span>
          </div>

          <ResumePreviewHTML tailoredResume={tailoredResume} />
        </motion.div>

        {/* Right — Score + Changes + Suggestions */}
        <div className="space-y-4">
          {/* Score Card */}
          <motion.div
            className="dash-card p-5"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.05 }}
          >
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
              Score Improvement
            </h3>
            <ScoreGauge score={newScore} />

            <div className="mt-4 text-center">
              <p className="text-xs text-muted-foreground">
                Your score jumped from{" "}
                <span className="font-semibold text-foreground">
                  {previousScore}
                </span>{" "}
                to{" "}
                <span className="font-semibold text-emerald-600">
                  {newScore}
                </span>
              </p>
              {scoreDelta > 0 && (
                <span className="inline-flex items-center gap-1 mt-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-600">
                  <TrendingUp className="h-3 w-3" />+{scoreDelta} points
                </span>
              )}
            </div>
          </motion.div>

          {/* Changes List */}
          {tailoredResume.changes.length > 0 && (
            <motion.div
              className="dash-card p-5"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.1 }}
            >
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                What Changed
              </h3>
              <ul className="space-y-2">
                {tailoredResume.changes.map((change, idx) => (
                  <li
                    key={idx}
                    className="flex items-start gap-2 text-xs text-foreground"
                  >
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                    <span>{change}</span>
                  </li>
                ))}
              </ul>
            </motion.div>
          )}

          {/* AI Suggestions */}
          <motion.div
            className="dash-card p-5"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.15 }}
          >
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              AI Suggestions
            </h3>
            <div className="space-y-2">
              {aiSuggestions.map((suggestion) => {
                const Icon = suggestion.icon;
                return (
                  <button
                    key={suggestion.label}
                    type="button"
                    className="w-full flex items-center gap-2.5 rounded-lg border border-border bg-secondary px-3 py-2.5 text-left text-xs font-medium text-foreground hover:bg-secondary/80 transition-colors"
                  >
                    <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    {suggestion.label}
                  </button>
                );
              })}
            </div>
          </motion.div>
        </div>
      </div>

      {/* Bottom Actions */}
      <motion.div
        className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-border"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.2 }}
      >
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onDownload}
            className="flex items-center gap-2 rounded-xl border border-border bg-secondary px-5 py-2.5 text-sm font-medium text-foreground hover:bg-secondary/80 transition-colors"
          >
            <Download className="h-4 w-4" />
            Download Resume
          </button>
          <button
            type="button"
            onClick={onCreateResume}
            className="flex items-center gap-2 rounded-xl bg-emerald-500 px-6 py-2.5 text-sm font-semibold text-white hover:bg-emerald-600 transition-colors"
          >
            Create & Edit
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </motion.div>
    </div>
  );
}
