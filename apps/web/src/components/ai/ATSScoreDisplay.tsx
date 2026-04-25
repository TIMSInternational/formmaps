/**
 * ATSScoreDisplay Component
 *
 * Displays ATS (Applicant Tracking System) score and optimization metrics.
 * Shows score percentage, word count, and detected keywords.
 */

"use client";

import { CheckCircle2, AlertCircle, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

export interface ATSScoreDisplayProps {
  score: number;
  wordCount?: number;
  keywordsIncluded?: string[];
  maxWordCount?: number;
  className?: string;
  missingKeywords?: string[];
  onAddSuggestion?: (keyword: string) => void;
}

export function ATSScoreDisplay({
  score,
  wordCount,
  keywordsIncluded,
  maxWordCount = 150,
  className,
  missingKeywords,
  onAddSuggestion,
}: ATSScoreDisplayProps) {
  const { t } = useTranslation();

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-600";
    if (score >= 60) return "text-yellow-600";
    return "text-orange-600";
  };

  const getScoreBgColor = (score: number) => {
    if (score >= 80) return "bg-green-100 border-green-300";
    if (score >= 60) return "bg-yellow-100 border-yellow-300";
    return "bg-orange-100 border-orange-300";
  };

  const getScoreLabel = (score: number) => {
    if (score >= 80) return t("ai.ats.excellent", "Excellent");
    if (score >= 60) return t("ai.ats.good", "Good");
    return t("ai.ats.needsImprovement", "Needs Improvement");
  };

  const getWordCountStatus = (current?: number, max?: number) => {
    if (!current || !max) return "neutral";
    if (current < max * 0.7) return "short";
    if (current <= max) return "good";
    return "long";
  };

  const wordCountStatus = getWordCountStatus(wordCount, maxWordCount);

  return (
    <div className={cn("space-y-4", className)}>
      {/* ATS Score */}
      <div className={cn("p-4 rounded-lg border", getScoreBgColor(score))}>
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-gray-900">
              {t("ai.ats.compatibilityScore", "ATS Compatibility Score")}
            </h3>
            <p className="text-xs text-gray-600">
              {t("ai.ats.scoreDesc", "How well this content will be parsed by applicant tracking systems")}
            </p>
          </div>
          <div className="flex items-center gap-2" role="status" aria-label={t("ai.ats.scoreAria", { score, label: getScoreLabel(score), defaultValue: `Score: ${score} percent - ${getScoreLabel(score)}` })}>
            {score >= 80 ? (
              <CheckCircle2 className={cn("w-5 h-5", getScoreColor(score))} aria-hidden="true" />
            ) : score >= 60 ? (
              <AlertCircle className={cn("w-5 h-5", getScoreColor(score))} aria-hidden="true" />
            ) : (
              <AlertCircle className={cn("w-5 h-5", getScoreColor(score))} aria-hidden="true" />
            )}
            <span className={cn("text-2xl font-bold", getScoreColor(score))} aria-hidden="true">
              {score}%
            </span>
          </div>
        </div>
        <p className="text-xs text-gray-700 mt-2" aria-hidden="true">{getScoreLabel(score)}</p>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 gap-3">
        {/* Word Count */}
        {wordCount !== undefined && (
          <div
            className={cn(
              "p-3 rounded-lg border transition-colors",
              wordCountStatus === "good"
                ? "bg-green-50 border-green-200"
                : wordCountStatus === "short"
                ? "bg-yellow-50 border-yellow-200"
                : "bg-orange-50 border-orange-200"
            )}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-gray-700">
                {t("ai.ats.wordCount", "Word Count")}
              </span>
              {wordCountStatus === "good" && (
                <CheckCircle2 className="w-4 h-4 text-green-600" aria-hidden="true" />
              )}
            </div>
            <p className="text-sm font-semibold text-gray-900">
              {wordCount}
              {maxWordCount && (
                <span className="text-xs font-normal text-gray-600">
                  /{maxWordCount}
                </span>
              )}
            </p>
            <p className="text-xs text-gray-600 mt-1">
              {wordCountStatus === "good"
                ? t("ai.ats.perfectLength", "Perfect length")
                : wordCountStatus === "short"
                ? t("ai.ats.tooShort", "Could be longer")
                : t("ai.ats.tooLong", "Consider shortening")}
            </p>
          </div>
        )}

        {/* Keywords Count */}
        {keywordsIncluded && keywordsIncluded.length > 0 && (
          <div className="p-3 rounded-lg border border-blue-200 bg-blue-50">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-gray-700">
                {t("ai.ats.keywords", "Keywords")}
              </span>
              <Zap className="w-4 h-4 text-blue-600" aria-hidden="true" />
            </div>
            <p className="text-sm font-semibold text-gray-900">
              {keywordsIncluded.length}
            </p>
            <p className="text-xs text-gray-600 mt-1">
              {t("ai.ats.keywordsDetected", "Industry keywords detected")}
            </p>
          </div>
        )}
      </div>

      {/* Keywords List */}
      {keywordsIncluded && keywordsIncluded.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-gray-700">
            {t("ai.ats.detectedKeywords", "Detected Keywords")}
          </h4>
          <div className="flex flex-wrap gap-2">
            {keywordsIncluded.slice(0, 8).map((keyword, idx) => (
              <span
                key={idx}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700 border border-blue-300"
              >
                <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
                {keyword}
              </span>
            ))}
            {keywordsIncluded.length > 8 && (
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700 border border-gray-300">
                {t("ai.ats.moreKeywords", { count: keywordsIncluded.length - 8, defaultValue: `+${keywordsIncluded.length - 8} more` })}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Missing Keywords */}
      {missingKeywords && missingKeywords.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-gray-700">
            {t("ai.ats.missingKeywords", "Missing Keywords")}
          </h4>
          <p className="text-xs text-gray-600">
            {t("ai.ats.missingKeywordsDesc", "Keywords present in the job description but not in the generated content.")}
          </p>
          <div className="flex flex-wrap gap-2 mt-2">
            {missingKeywords.slice(0, 12).map((keyword, idx) => (
              <button
                key={idx}
                onClick={() => onAddSuggestion?.(keyword)}
                className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700 border border-red-200 hover:bg-red-200 transition-colors"
                type="button"
                aria-label={t("ai.ats.addKeyword", { keyword, defaultValue: `Add '${keyword}' to context` })}
              >
                <AlertCircle className="w-3 h-3" aria-hidden="true" />
                {t("ai.ats.add", { keyword, defaultValue: `Add '${keyword}'` })}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Optimization Tips */}
      <div className="p-3 rounded-lg border border-blue-200 bg-blue-50/50">
        <p className="text-xs text-gray-700">
          <strong>{t("ai.ats.proTipTitle", "💡 Pro tip:")}</strong> {t("ai.ats.proTipDesc", "Use simple formatting and avoid images in your resume. Most ATS systems work best with plain text.")}
        </p>
      </div>
    </div>
  );
}
