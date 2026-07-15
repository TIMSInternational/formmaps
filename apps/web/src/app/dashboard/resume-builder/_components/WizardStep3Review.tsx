"use client";

import { motion } from "motion/react";
import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  Check,
  Download,
} from "lucide-react";
import { ResumePreviewWithHighlights } from "./ResumePreviewWithHighlights";
import { ScoreGauge } from "./ScoreGauge";
import { AIChatInput } from "./AIChatInput";
import type { TailoredResume } from "@/types/resume";
import type { Resume } from "@/services/resumeService";

export interface ChangeDecision {
  section: string;
  index?: number;
  accepted: boolean;
}

interface WizardStep3ReviewProps {
  isTailoring: boolean;
  tailoredResume: TailoredResume | null;
  baseResume: Resume | null;
  decisions: ChangeDecision[];
  originalScore: number;
  tailoredScore: number;
  aiChatLoading: boolean;
  creating: boolean;
  onToggleDecision: (section: string, index?: number) => void;
  onAIChatSend: (instruction: string) => Promise<void>;
  onDownloadPDF: () => Promise<void>;
  onCreateAndEdit: () => Promise<void>;
  onBack: () => void;
}

export function WizardStep3Review({
  isTailoring,
  tailoredResume,
  baseResume,
  decisions,
  originalScore,
  tailoredScore,
  aiChatLoading,
  creating,
  onToggleDecision,
  onAIChatSend,
  onDownloadPDF,
  onCreateAndEdit,
  onBack,
}: WizardStep3ReviewProps) {
  return (
    <motion.div
      key="step-3"
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ duration: 0.25 }}
      className="space-y-6"
    >
      {isTailoring || !tailoredResume ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-foreground" />
          <div className="text-center">
            <p className="text-sm font-semibold text-foreground">
              Tailoring your resume...
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Analyzing the job posting and optimizing your content
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* Main layout: Preview + Sidebar */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
            {/* Left: Resume preview with highlights */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-foreground">
                  Resume Preview
                </h2>
                <span className="text-[10px] text-muted-foreground">
                  Click highlighted text to accept/reject changes
                </span>
              </div>
              <ResumePreviewWithHighlights
                originalResume={baseResume!}
                tailoredResume={tailoredResume}
                decisions={decisions}
                onToggleDecision={onToggleDecision}
              />
            </div>

            {/* Right: Score + Changes + AI suggestions */}
            <div className="space-y-4">
              {/* Score comparison */}
              <div className="dash-card p-5">
                <div className="flex items-center gap-4">
                  <ScoreGauge score={tailoredScore} size={100} />
                  <div className="flex-1 space-y-1.5">
                    <p className="text-sm font-semibold text-foreground">
                      Score: {originalScore.toFixed(1)} →{" "}
                      {tailoredScore.toFixed(1)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {tailoredScore > originalScore
                        ? `Your score improved by ${(tailoredScore - originalScore).toFixed(1)} points`
                        : "Your resume has been optimized for this role"}
                    </p>
                  </div>
                </div>
              </div>

              {/* Changes list */}
              <div className="dash-card p-5 space-y-3">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  What Changed
                </h3>
                <ul className="space-y-2">
                  {tailoredResume.changes.map((change, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 text-xs text-foreground"
                    >
                      <Check className="w-3 h-3 mt-0.5 text-emerald-500 shrink-0" />
                      {change}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Decision summary */}
              <DecisionSummary
                baseResume={baseResume}
                decisions={decisions}
                onToggleDecision={onToggleDecision}
              />
            </div>
          </div>

          {/* AI Chat Input */}
          <div className="dash-card p-5">
            <AIChatInput onSend={onAIChatSend} isLoading={aiChatLoading} />
          </div>

          {/* Bottom navigation */}
          <div className="flex items-center justify-between pt-2">
            <button
              onClick={onBack}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
            <div className="flex items-center gap-3">
              <button
                onClick={onDownloadPDF}
                className="inline-flex items-center gap-2 bg-secondary text-foreground hover:bg-border rounded-xl px-5 py-2.5 text-sm font-medium border border-border transition-colors"
              >
                <Download className="w-4 h-4" />
                Download Resume
              </button>
              <button
                onClick={onCreateAndEdit}
                disabled={creating}
                className="inline-flex items-center gap-2 bg-foreground text-background hover:bg-foreground/90 rounded-xl px-5 py-2.5 text-sm font-medium disabled:opacity-50 transition-colors"
              >
                {creating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    Create & Edit
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        </>
      )}
    </motion.div>
  );
}

/* ---- Decision summary sub-component ---- */
function DecisionSummary({
  baseResume,
  decisions,
  onToggleDecision,
}: {
  baseResume: Resume | null;
  decisions: ChangeDecision[];
  onToggleDecision: (section: string, index?: number) => void;
}) {
  const items = [
    { label: "Summary", section: "summary" },
    { label: "Skills", section: "skills" },
    ...(baseResume?.experience || []).map((exp, i) => ({
      label: `${exp.title} at ${exp.company}`,
      section: "experience",
      index: i,
    })),
  ];

  return (
    <div className="dash-card p-5 space-y-2">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        Your Decisions
      </h3>
      <div className="space-y-1.5">
        {items.map((item) => {
          const d = decisions.find(
            (d) =>
              d.section === item.section &&
              d.index === ("index" in item ? item.index : undefined)
          );
          const accepted = d?.accepted ?? true;
          return (
            <button
              key={`${item.section}-${"index" in item ? item.index : ""}`}
              onClick={() =>
                onToggleDecision(
                  item.section,
                  "index" in item ? item.index : undefined
                )
              }
              className={`w-full flex items-center gap-2 text-xs rounded-lg px-3 py-2 transition-colors ${
                accepted
                  ? "bg-emerald-500/5 text-emerald-700"
                  : "bg-red-500/5 text-red-600"
              }`}
            >
              {accepted ? (
                <Check className="w-3 h-3 shrink-0" />
              ) : (
                <span className="w-3 h-3 shrink-0 text-center font-bold">
                  ✕
                </span>
              )}
              <span className="truncate text-left">{item.label}</span>
              <span className="ml-auto text-[10px] opacity-70">
                {accepted ? "Accepted" : "Rejected"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
