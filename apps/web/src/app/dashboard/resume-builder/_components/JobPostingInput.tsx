"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Loader2,
  MapPin,
  Building,
  Briefcase,
  CheckCircle,
} from "lucide-react";
import type { ExtractedJobData } from "@/types/resume";
import { extractJobPosting } from "@/services/resumeService";

interface JobPostingInputProps {
  onAnalyzed: (data: ExtractedJobData) => void;
  onSkip: () => void;
  purpose: string;
}

export function JobPostingInput({
  onAnalyzed,
  onSkip,
  purpose,
}: JobPostingInputProps) {
  const [text, setText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extracted, setExtracted] = useState<ExtractedJobData | null>(null);
  const [showForm, setShowForm] = useState(true);

  async function handleAnalyze() {
    if (!text.trim()) return;

    setIsLoading(true);
    setError(null);

    try {
      const data = await extractJobPosting(text, purpose);
      setExtracted(data);
      setShowForm(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to analyze job posting"
      );
    } finally {
      setIsLoading(false);
    }
  }

  function handleEdit() {
    setShowForm(true);
    setExtracted(null);
  }

  function handleContinue() {
    if (extracted) {
      onAnalyzed(extracted);
    }
  }

  return (
    <div className="w-full max-w-2xl mx-auto">
      <motion.div
        className="text-center mb-8"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <h2 className="text-xl font-semibold text-foreground">
          Paste the job posting
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          We will extract the key requirements to tailor your resume
        </p>
      </motion.div>

      <AnimatePresence mode="wait">
        {showForm ? (
          <motion.div
            key="form"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.25 }}
            className="space-y-4"
          >
            <div className="dash-card p-5">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Paste the job description here..."
                className="w-full min-h-[200px] bg-transparent text-sm text-foreground placeholder:text-muted-foreground resize-y outline-none"
              />
            </div>

            {error && (
              <p className="text-sm text-destructive text-center">{error}</p>
            )}

            <div className="flex items-center justify-between">
              <button
                onClick={onSkip}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>

              <button
                onClick={handleAnalyze}
                disabled={!text.trim() || isLoading}
                className="bg-foreground text-background hover:bg-foreground/90 rounded-xl px-5 py-2.5 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  "Analyze"
                )}
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="result"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.25 }}
            className="space-y-4"
          >
            {extracted && (
              <div className="dash-card p-5 space-y-4">
                {/* Header info */}
                <div className="space-y-2">
                  <h3 className="text-base font-semibold text-foreground">
                    {extracted.jobTitle}
                  </h3>
                  <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                    {extracted.company && (
                      <span className="flex items-center gap-1">
                        <Building className="w-3.5 h-3.5" />
                        {extracted.company}
                      </span>
                    )}
                    {extracted.location && (
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5" />
                        {extracted.location}
                      </span>
                    )}
                    {extracted.employmentType && (
                      <span className="flex items-center gap-1">
                        <Briefcase className="w-3.5 h-3.5" />
                        {extracted.employmentType}
                      </span>
                    )}
                  </div>
                </div>

                {/* Required skills */}
                {extracted.requiredSkills.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">
                      Required Skills
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {extracted.requiredSkills.map((skill) => (
                        <span
                          key={skill}
                          className="inline-flex items-center rounded-full border border-border px-2.5 py-0.5 text-xs text-foreground"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Key qualifications */}
                {extracted.requiredQualifications.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">
                      Key Qualifications
                    </p>
                    <ul className="space-y-1">
                      {extracted.requiredQualifications.map((qual, i) => (
                        <li
                          key={i}
                          className="flex items-start gap-2 text-sm text-foreground"
                        >
                          <CheckCircle className="w-3.5 h-3.5 mt-0.5 text-muted-foreground shrink-0" />
                          {qual}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center justify-between">
              <button
                onClick={handleEdit}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Edit
              </button>

              <button
                onClick={handleContinue}
                className="bg-foreground text-background hover:bg-foreground/90 rounded-xl px-5 py-2.5 text-sm font-medium transition-colors"
              >
                Looks good — Continue
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
