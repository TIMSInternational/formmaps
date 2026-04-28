"use client";

import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Check, X, Sparkles, TrendingUp } from "lucide-react";
import type { ExtractedJobData, TailoredResume } from "@/types/resume";

export interface AcceptedChanges {
  summary: string;
  experience: Array<{
    company: string;
    title: string;
    descriptions: string[];
  }>;
  skills: string[];
}

interface AITailorPanelProps {
  extractedJob: ExtractedJobData;
  tailoredResume: TailoredResume;
  onAccept: (accepted: AcceptedChanges) => void;
  onDownloadPDF?: (accepted: AcceptedChanges) => void;
}

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 80
      ? "text-emerald-600 bg-emerald-500/10"
      : score >= 60
        ? "text-amber-600 bg-amber-500/10"
        : "text-red-600 bg-red-500/10";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-sm font-semibold ${color}`}
    >
      <TrendingUp className="h-3.5 w-3.5" />
      ATS Score: {score}
    </span>
  );
}

function SectionToggle({
  label,
  enabled,
  onToggle,
}: {
  label: string;
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
        enabled
          ? "bg-foreground text-background"
          : "bg-foreground/5 text-muted-foreground hover:bg-foreground/10"
      }`}
    >
      {enabled ? (
        <Check className="h-3 w-3" />
      ) : (
        <X className="h-3 w-3" />
      )}
      {label}
    </button>
  );
}

export function AITailorPanel({
  extractedJob,
  tailoredResume,
  onAccept,
  onDownloadPDF,
}: AITailorPanelProps) {
  const [acceptSummary, setAcceptSummary] = useState(true);
  const [acceptExperience, setAcceptExperience] = useState(true);
  const [acceptSkills, setAcceptSkills] = useState(true);

  const totalChanges = tailoredResume.changes.length;

  const handleAccept = useCallback(() => {
    onAccept({
      summary: acceptSummary ? tailoredResume.tailoredSummary : "",
      experience: acceptExperience ? tailoredResume.tailoredExperience : [],
      skills: acceptSkills ? tailoredResume.tailoredSkills : [],
    });
  }, [
    acceptSummary,
    acceptExperience,
    acceptSkills,
    tailoredResume,
    onAccept,
  ]);

  return (
    <div className="space-y-5">
      {/* Header Stats */}
      <motion.div
        className="dash-card p-4"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-foreground/5">
              <Sparkles className="h-4 w-4 text-foreground" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">
                AI Tailoring Complete
              </p>
              <p className="text-xs text-muted-foreground">
                {totalChanges} change{totalChanges !== 1 ? "s" : ""} suggested
                to match this role
              </p>
            </div>
          </div>
          <ScoreBadge score={tailoredResume.atsScore} />
        </div>
      </motion.div>

      {/* Summary Section */}
      {tailoredResume.tailoredSummary && (
        <motion.div
          className="dash-card p-5"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.05 }}
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Professional Summary
            </h3>
            <SectionToggle
              label="Use AI"
              enabled={acceptSummary}
              onToggle={() => setAcceptSummary((v) => !v)}
            />
          </div>

          <p
            className={`text-sm leading-relaxed ${
              acceptSummary ? "text-foreground" : "text-muted-foreground line-through"
            }`}
          >
            {tailoredResume.tailoredSummary}
          </p>

          {tailoredResume.changes.length > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              Changes: {tailoredResume.changes[0]}
            </p>
          )}
        </motion.div>
      )}

      {/* Experience Section */}
      {tailoredResume.tailoredExperience.length > 0 && (
        <motion.div
          className="space-y-3"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Experience
            </h3>
            <SectionToggle
              label="Use AI"
              enabled={acceptExperience}
              onToggle={() => setAcceptExperience((v) => !v)}
            />
          </div>

          {tailoredResume.tailoredExperience.map((exp, idx) => (
            <div
              key={`${exp.company}-${exp.title}-${idx}`}
              className={`dash-card p-5 transition-opacity ${
                !acceptExperience ? "opacity-50" : ""
              }`}
            >
              <p className="text-sm font-semibold text-foreground">
                {exp.title}{" "}
                <span className="font-normal text-muted-foreground">
                  at {exp.company}
                </span>
              </p>

              <ul className="mt-2.5 space-y-1.5">
                {exp.descriptions.map((desc, dIdx) => (
                  <li
                    key={dIdx}
                    className="flex items-start gap-2 text-sm text-foreground"
                  >
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-foreground/40" />
                    <span>{desc}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </motion.div>
      )}

      {/* Skills Section */}
      {tailoredResume.tailoredSkills.length > 0 && (
        <motion.div
          className="dash-card p-5"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.15 }}
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Skills
            </h3>
            <SectionToggle
              label="Use AI"
              enabled={acceptSkills}
              onToggle={() => setAcceptSkills((v) => !v)}
            />
          </div>

          <div
            className={`flex flex-wrap gap-2 ${
              !acceptSkills ? "opacity-50" : ""
            }`}
          >
            {tailoredResume.tailoredSkills.map((skill) => (
              <span
                key={skill}
                className="inline-flex items-center rounded-lg bg-foreground/5 px-2.5 py-1 text-xs font-medium text-foreground"
              >
                {skill}
              </span>
            ))}
          </div>

          {/* Show how many skills were added from job requirements */}
          {extractedJob.requiredSkills.length > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              +{" "}
              {
                tailoredResume.tailoredSkills.filter((s) =>
                  extractedJob.requiredSkills
                    .map((r) => r.toLowerCase())
                    .includes(s.toLowerCase())
                ).length
              }{" "}
              skills aligned with job requirements
            </p>
          )}
        </motion.div>
      )}

      {/* Accept Button */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.2 }}
        className="flex flex-col sm:flex-row gap-3"
      >
        {onDownloadPDF && (
          <button
            type="button"
            onClick={() => {
              onDownloadPDF({
                summary: acceptSummary ? tailoredResume.tailoredSummary : "",
                experience: acceptExperience ? tailoredResume.tailoredExperience : [],
                skills: acceptSkills ? tailoredResume.tailoredSkills : [],
              });
            }}
            className="flex-1 bg-secondary text-foreground hover:bg-border rounded-xl px-6 py-3 text-sm font-semibold transition-colors border border-border"
          >
            Download PDF
          </button>
        )}
        <button
          type="button"
          onClick={handleAccept}
          className="flex-1 bg-foreground text-background hover:bg-foreground/90 rounded-xl px-6 py-3 text-sm font-semibold transition-colors"
        >
          Create Resume with Changes
        </button>
      </motion.div>
    </div>
  );
}
