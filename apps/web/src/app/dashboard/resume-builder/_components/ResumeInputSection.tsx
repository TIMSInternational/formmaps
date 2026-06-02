"use client";

import { Loader2, ClipboardPaste } from "lucide-react";
import Link from "next/link";
import type { Resume } from "@/services/resumeService";

interface ResumeInputSectionProps {
  loadingResumes: boolean;
  userResumes: Resume[];
  selectedResumeId: string | null;
  onSelectedResumeIdChange: (id: string) => void;
  loadingBaseResume: boolean;
  baseResume: Resume | null;
  jobText: string;
  onJobTextChange: (text: string) => void;
  analyzeError: string | null;
  isAnalyzing: boolean;
  hasAnalyzed: boolean;
  onAnalyze: () => void;
}

export function ResumeInputSection({
  loadingResumes,
  userResumes,
  selectedResumeId,
  onSelectedResumeIdChange,
  loadingBaseResume,
  baseResume,
  jobText,
  onJobTextChange,
  analyzeError,
  isAnalyzing,
  hasAnalyzed,
  onAnalyze,
}: ResumeInputSectionProps) {
  return (
    <>
      {/* Resume selector */}
      <div className="dash-card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium text-foreground">
            Base Resume
          </div>
          {!loadingResumes && userResumes.length === 0 && (
            <Link
              href="/dashboard/resumes"
              className="text-xs text-emerald-600 hover:text-emerald-700 font-medium"
            >
              Upload one first
            </Link>
          )}
        </div>
        {loadingResumes ? (
          <div className="h-10 bg-secondary rounded-lg animate-pulse" />
        ) : userResumes.length > 0 ? (
          <select
            value={selectedResumeId || ""}
            onChange={(e) => onSelectedResumeIdChange(e.target.value)}
            className="w-full bg-secondary rounded-lg px-4 py-2.5 text-sm text-foreground border border-border focus:border-foreground/20 outline-none transition-colors"
          >
            {userResumes.map((r) => (
              <option key={r._id} value={r._id}>
                {r.name || "Untitled Resume"} —{" "}
                {r.personal?.fullName || "No name"}
              </option>
            ))}
          </select>
        ) : (
          <p className="text-xs text-muted-foreground">
            No resumes found. Upload a resume first so we can optimize it.
          </p>
        )}
        {loadingBaseResume ? (
          <div className="h-4 bg-secondary rounded animate-pulse w-48" />
        ) : (
          baseResume && (
            <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
              <span>
                {baseResume.experience?.length || 0} experience entries
              </span>
              <span>·</span>
              <span>
                {Object.values(baseResume.skills?.skills || {}).flat()
                  .length || 0}{" "}
                skills
              </span>
              <span>·</span>
              <span>
                {baseResume.education?.length || 0} education entries
              </span>
            </div>
          )
        )}
      </div>

      {/* Job posting input */}
      <div className="dash-card p-5 space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <ClipboardPaste className="w-4 h-4 text-muted-foreground" />
          Job Description
        </div>
        <textarea
          value={jobText}
          onChange={(e) => onJobTextChange(e.target.value)}
          placeholder="Paste the full job description here..."
          rows={5}
          className="w-full bg-secondary rounded-lg px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground resize-y outline-none border border-border focus:border-foreground/20 transition-colors"
        />
        {analyzeError && (
          <p className="text-sm text-destructive">{analyzeError}</p>
        )}
        <div className="flex justify-end">
          <button
            onClick={onAnalyze}
            disabled={!jobText.trim() || isAnalyzing}
            className="inline-flex items-center gap-2 bg-foreground text-background hover:bg-foreground/90 rounded-xl px-5 py-2.5 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Analyzing...
              </>
            ) : hasAnalyzed ? (
              "Re-analyze"
            ) : (
              "Analyze"
            )}
          </button>
        </div>
      </div>
    </>
  );
}
