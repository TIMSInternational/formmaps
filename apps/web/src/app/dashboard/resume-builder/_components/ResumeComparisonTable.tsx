"use client";

import { useMemo } from "react";
import { Check, X, AlertTriangle, ArrowRight } from "lucide-react";
import type { ExtractedJobData } from "@/types/resume";

interface ResumeComparisonTableProps {
  extractedJob: ExtractedJobData;
  userSkills: string[];
  userTitle: string;
  userExpYears: number;
  onContinue: () => void;
}

type MatchStatus = "match" | "mismatch" | "partial";

interface ComparisonRow {
  category: string;
  jobRequires: string;
  yourResume: string;
  status: MatchStatus;
  tags?: { label: string; matched: boolean }[];
}

function StatusIcon({ status }: { status: MatchStatus }) {
  if (status === "match") {
    return (
      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500/15 text-emerald-500">
        <Check className="w-3 h-3" />
      </span>
    );
  }
  if (status === "mismatch") {
    return (
      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-500/15 text-red-500">
        <X className="w-3 h-3" />
      </span>
    );
  }
  return (
    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-500/15 text-amber-500">
      <AlertTriangle className="w-3 h-3" />
    </span>
  );
}

function ScoreGauge({ score }: { score: number }) {
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const filled = (score / 10) * circumference;
  const color =
    score >= 7
      ? "text-emerald-500"
      : score >= 4
        ? "text-amber-500"
        : "text-red-500";
  const label = score >= 7 ? "Good" : score >= 4 ? "Fair" : "Poor";

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="100" height="100" viewBox="0 0 100 100" className="-rotate-90">
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          strokeWidth="6"
          className="stroke-border"
        />
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - filled}
          className={`${color} transition-all duration-700`}
          style={{ stroke: "currentColor" }}
        />
      </svg>
      <div className="absolute flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-foreground">{score.toFixed(1)}</span>
        <span className={`text-xs font-medium ${color}`}>{label}</span>
      </div>
    </div>
  );
}

function computeScore(
  extractedJob: ExtractedJobData,
  userSkills: string[],
  userTitle: string,
  userExpYears: number
): { score: number; rows: ComparisonRow[] } {
  const rows: ComparisonRow[] = [];
  let totalPoints = 0;
  let earnedPoints = 0;

  // 1. Job Title match (weight 2.5)
  const weight1 = 2.5;
  totalPoints += weight1;
  const jobTitleLower = extractedJob.jobTitle.toLowerCase();
  const userTitleLower = userTitle.toLowerCase();
  const titleWords = jobTitleLower.split(/\s+/);
  const titleOverlap = titleWords.filter((w) => userTitleLower.includes(w)).length;
  const titleRatio = titleWords.length > 0 ? titleOverlap / titleWords.length : 0;
  const titleStatus: MatchStatus =
    titleRatio >= 0.6 ? "match" : titleRatio >= 0.3 ? "partial" : "mismatch";
  earnedPoints += titleRatio * weight1;
  rows.push({
    category: "Job Title",
    jobRequires: extractedJob.jobTitle,
    yourResume: userTitle || "Not specified",
    status: titleStatus,
  });

  // 2. Experience Level (weight 2.5)
  const weight2 = 2.5;
  totalPoints += weight2;
  const expMatch = userExpYears > 0;
  const expLevelLower = extractedJob.experienceLevel.toLowerCase();
  const reqYears = parseInt(expLevelLower.match(/(\d+)/)?.[1] || "0", 10);
  const expStatus: MatchStatus =
    !expMatch ? "mismatch" : userExpYears >= reqYears ? "match" : "partial";
  earnedPoints +=
    expStatus === "match" ? weight2 : expStatus === "partial" ? weight2 * 0.5 : 0;
  rows.push({
    category: "Experience Level",
    jobRequires: extractedJob.experienceLevel || "Not specified",
    yourResume: userExpYears > 0 ? `${userExpYears}+ years` : "Not specified",
    status: expStatus,
  });

  // 3. Keywords / Skills (weight 3.5)
  const weight3 = 3.5;
  totalPoints += weight3;
  const allJobKeywords = [
    ...extractedJob.requiredSkills,
    ...extractedJob.industryKeywords,
  ];
  const uniqueKeywords = [...new Set(allJobKeywords.map((k) => k.toLowerCase()))];
  const userSkillsLower = userSkills.map((s) => s.toLowerCase());
  const matchedKeywords = uniqueKeywords.filter((kw) =>
    userSkillsLower.some((us) => us.includes(kw) || kw.includes(us))
  );
  const keywordRatio =
    uniqueKeywords.length > 0 ? matchedKeywords.length / uniqueKeywords.length : 0;
  const keywordStatus: MatchStatus =
    keywordRatio >= 0.6 ? "match" : keywordRatio >= 0.25 ? "partial" : "mismatch";
  earnedPoints += keywordRatio * weight3;

  const keywordTags = uniqueKeywords.map((kw) => ({
    label: allJobKeywords.find((k) => k.toLowerCase() === kw) || kw,
    matched: userSkillsLower.some((us) => us.includes(kw) || kw.includes(us)),
  }));

  rows.push({
    category: "Keywords",
    jobRequires: `${uniqueKeywords.length} keywords`,
    yourResume: `${matchedKeywords.length}/${uniqueKeywords.length} matched`,
    status: keywordStatus,
    tags: keywordTags,
  });

  // 4. Summary alignment (weight 1.5)
  const weight4 = 1.5;
  totalPoints += weight4;
  const hasSummary = userTitle.length > 0; // proxy: if they have a title they likely have a summary
  const summaryStatus: MatchStatus = hasSummary ? "partial" : "mismatch";
  earnedPoints += hasSummary ? weight4 * 0.5 : 0;
  rows.push({
    category: "Summary",
    jobRequires: "Aligned to role",
    yourResume: hasSummary ? "Needs alignment" : "Missing",
    status: summaryStatus,
  });

  const score = Math.round((earnedPoints / totalPoints) * 100) / 10;
  return { score: Math.min(score, 10), rows };
}

export function ResumeComparisonTable({
  extractedJob,
  userSkills,
  userTitle,
  userExpYears,
  onContinue,
}: ResumeComparisonTableProps) {
  const { score, rows } = useMemo(
    () => computeScore(extractedJob, userSkills, userTitle, userExpYears),
    [extractedJob, userSkills, userTitle, userExpYears]
  );

  const matchLabel = score >= 7 ? "Good" : score >= 4 ? "Medium" : "Low";

  return (
    <div className="space-y-6">
      {/* Header + Score */}
      <div className="dash-card p-6">
        <div className="flex items-start justify-between gap-6">
          <div className="flex-1 space-y-3">
            <h2 className="text-lg font-semibold text-foreground">
              Your Resume is a{" "}
              <span
                className={
                  score >= 7
                    ? "text-emerald-500"
                    : score >= 4
                      ? "text-amber-500"
                      : "text-red-500"
                }
              >
                {matchLabel}
              </span>{" "}
              Match
            </h2>
            {score < 6 && (
              <p className="text-sm text-muted-foreground">
                Your resume could use some improvements to better match this
                position. Let us help you align it.
              </p>
            )}
          </div>

          {/* Score gauge */}
          <div className="relative flex items-center justify-center shrink-0">
            <ScoreGauge score={score} />
          </div>
        </div>
      </div>

      {/* Comparison table */}
      <div className="dash-card overflow-hidden">
        {/* Table header */}
        <div className="grid grid-cols-[140px_1fr_1fr] border-b border-border bg-secondary/50 px-5 py-3 text-xs font-medium text-muted-foreground">
          <span>Category</span>
          <span>Job Requires</span>
          <span>Your Resume</span>
        </div>

        {/* Rows */}
        {rows.map((row) => (
          <div
            key={row.category}
            className="grid grid-cols-[140px_1fr_1fr] items-start border-b border-border last:border-b-0 px-5 py-4 gap-2"
          >
            {/* Category */}
            <div className="flex items-center gap-2">
              <StatusIcon status={row.status} />
              <span className="text-sm font-medium text-foreground">
                {row.category}
              </span>
            </div>

            {/* Job requires */}
            <div className="text-sm text-muted-foreground">
              {row.tags ? (
                <div className="flex flex-wrap gap-1.5">
                  {row.tags
                    .filter((t) => !t.matched)
                    .slice(0, 6)
                    .map((t) => (
                      <span
                        key={t.label}
                        className="inline-flex items-center rounded-full border border-red-500/30 bg-red-500/5 px-2 py-0.5 text-xs text-red-500"
                      >
                        {t.label}
                      </span>
                    ))}
                  {row.tags.filter((t) => !t.matched).length > 6 && (
                    <span className="text-xs text-muted-foreground">
                      +{row.tags.filter((t) => !t.matched).length - 6} more
                    </span>
                  )}
                </div>
              ) : (
                row.jobRequires
              )}
            </div>

            {/* Your resume */}
            <div className="text-sm text-foreground">
              {row.tags ? (
                <div className="flex flex-wrap gap-1.5">
                  {row.tags
                    .filter((t) => t.matched)
                    .map((t) => (
                      <span
                        key={t.label}
                        className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/5 px-2 py-0.5 text-xs text-emerald-500"
                      >
                        {t.label}
                      </span>
                    ))}
                  {row.tags.filter((t) => t.matched).length === 0 && (
                    <span className="text-xs text-muted-foreground">None matched</span>
                  )}
                </div>
              ) : (
                row.yourResume
              )}
            </div>
          </div>
        ))}
      </div>

      {/* CTA */}
      <div className="flex justify-end">
        <button
          onClick={onContinue}
          className="inline-flex items-center gap-2 bg-foreground text-background hover:bg-foreground/90 rounded-xl px-6 py-2.5 text-sm font-medium transition-colors"
        >
          Improve My Resume for This Job
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
