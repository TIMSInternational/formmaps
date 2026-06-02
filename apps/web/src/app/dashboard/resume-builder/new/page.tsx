"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import { useGlobalStore } from "@/store/useGlobalStore";
import {
  extractJobPosting,
  tailorResume,
  getAllResumes,
  getResumeById,
  type Resume,
} from "@/services/resumeService";
import { ResumeComparisonTable } from "../_components/ResumeComparisonTable";
import { ResumeInputSection } from "../_components/ResumeInputSection";
import { StepProgressBar } from "../_components/StepProgressBar";
import { WizardStep2Align } from "../_components/WizardStep2Align";
import {
  WizardStep3Review,
  type ChangeDecision,
} from "../_components/WizardStep3Review";
import {
  downloadTailoredPDF,
  createTailoredResume,
  initDecisions,
  buildResumeDataForAI,
  computeOriginalScore,
} from "../_components/resumeActions";
import type { ExtractedJobData, TailoredResume } from "@/types/resume";

/* ------------------------------------------------------------------ */
/*  Main page                                                          */
/* ------------------------------------------------------------------ */

export default function NewResumePage() {
  const router = useRouter();
  const { user } = useGlobalStore();

  const [userResumes, setUserResumes] = useState<Resume[]>([]);
  const [selectedResumeId, setSelectedResumeId] = useState<string | null>(null);
  const [loadingResumes, setLoadingResumes] = useState(true);
  const [baseResume, setBaseResume] = useState<Resume | null>(null);
  const [loadingBaseResume, setLoadingBaseResume] = useState(false);
  const [jobText, setJobText] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [extractedJob, setExtractedJob] = useState<ExtractedJobData | null>(
    null
  );
  const [step, setStep] = useState(1);
  const [tailoredResume, setTailoredResume] = useState<TailoredResume | null>(
    null
  );
  const [isTailoring, setIsTailoring] = useState(false);
  const [enhanceSections, setEnhanceSections] = useState({
    summary: true,
    skills: true,
    experience: true,
    projects: false,
  });
  const [selectedKeywords, setSelectedKeywords] = useState<string[]>([]);
  const [decisions, setDecisions] = useState<ChangeDecision[]>([]);
  const [aiChatLoading, setAiChatLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    getAllResumes()
      .then((resumes) => {
        setUserResumes(resumes);
        if (resumes.length > 0) setSelectedResumeId(resumes[0]._id);
      })
      .catch(() => {})
      .finally(() => setLoadingResumes(false));
  }, []);

  useEffect(() => {
    if (!selectedResumeId) {
      setBaseResume(null);
      return;
    }
    setLoadingBaseResume(true);
    getResumeById(selectedResumeId)
      .then((full) => setBaseResume(full))
      .catch(() => setBaseResume(null))
      .finally(() => setLoadingBaseResume(false));
  }, [selectedResumeId]);

  const resumeDataForAI = buildResumeDataForAI(baseResume, user);
  const hasAnalyzed = extractedJob !== null;
  const originalScore = hasAnalyzed
    ? computeOriginalScore(resumeDataForAI, extractedJob)
    : 0;
  const tailoredScore = tailoredResume
    ? Math.min(tailoredResume.atsScore / 10, 10)
    : 0;

  /* ---- Analyze job posting ---- */
  async function handleAnalyze() {
    if (!jobText.trim()) return;
    setIsAnalyzing(true);
    setAnalyzeError(null);
    try {
      const data = await extractJobPosting(jobText, "job_application");
      setExtractedJob(data);
      setStep(1);
      setSelectedKeywords(
        Array.from(
          new Set([
            ...(data.requiredSkills || []),
            ...(data.industryKeywords || []),
          ])
        )
      );
    } catch (err) {
      setAnalyzeError(
        err instanceof Error ? err.message : "Failed to analyze job posting"
      );
    } finally {
      setIsAnalyzing(false);
    }
  }

  /* ---- Tailor resume ---- */
  async function handleTailor() {
    if (!extractedJob) return;
    setIsTailoring(true);
    setStep(3);
    try {
      const result = await tailorResume({
        purpose: "job_application",
        jobPostingText: jobText,
        extractedRequirements: extractedJob,
        currentResume: resumeDataForAI,
      });
      setTailoredResume(result);
      setDecisions(
        initDecisions(result, baseResume?.experience?.length || 0)
      );
    } catch {
      setAnalyzeError("Tailoring failed. Please try again.");
      setStep(2);
    } finally {
      setIsTailoring(false);
    }
  }

  const handleToggleDecision = useCallback(
    (section: string, index?: number) => {
      setDecisions((prev) =>
        prev.map((d) =>
          d.section === section && d.index === index
            ? { ...d, accepted: !d.accepted }
            : d
        )
      );
    },
    []
  );

  const handleAIChatSend = useCallback(
    async (instruction: string) => {
      if (!extractedJob || !tailoredResume) return;
      setAiChatLoading(true);
      try {
        const result = await tailorResume({
          purpose: "job_application",
          jobPostingText: `${jobText}\n\nADDITIONAL INSTRUCTION: ${instruction}`,
          extractedRequirements: extractedJob,
          currentResume: resumeDataForAI,
        });
        setTailoredResume(result);
        setDecisions(
          initDecisions(result, baseResume?.experience?.length || 0)
        );
      } catch {
        // silently fail, keep existing
      } finally {
        setAiChatLoading(false);
      }
    },
    [extractedJob, tailoredResume, jobText, resumeDataForAI]
  );

  const handleDownloadPDF = useCallback(async () => {
    if (!tailoredResume || !baseResume) return;
    try {
      await downloadTailoredPDF(tailoredResume, baseResume, decisions);
    } catch {
      // silently fail
    }
  }, [tailoredResume, baseResume, decisions]);

  const handleCreateAndEdit = useCallback(async () => {
    if (!tailoredResume || !baseResume || creating) return;
    setCreating(true);
    try {
      await createTailoredResume(
        tailoredResume,
        baseResume,
        decisions,
        extractedJob,
        user
      );
      router.push("/dashboard/resumes");
    } catch (err: unknown) {
      const errObj = err as Record<string, unknown> | null;
      const errData =
        (errObj?.data as Record<string, string>) ||
        ((errObj?.response as Record<string, unknown>)?.data as Record<
          string,
          string
        >);
      const msg =
        errData?.errorMessage ||
        errData?.message ||
        (err instanceof Error ? err.message : "Failed to create resume");
      setAnalyzeError(msg);
      setCreating(false);
    }
  }, [tailoredResume, baseResume, decisions, extractedJob, creating, router]);

  return (
    <div className="min-h-[calc(100vh-4rem)] px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <motion.div
        className="max-w-5xl mx-auto mb-8"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Link
          href="/dashboard/resumes"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          My Resumes
        </Link>
        <h1 className="text-2xl font-semibold text-foreground">
          AI Resume Builder
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Paste a job posting to generate a tailored resume
        </p>
      </motion.div>

      {/* Base resume selector + Job posting input */}
      <div
        className={`${step === 3 && tailoredResume ? "max-w-5xl" : "max-w-3xl"} mx-auto mb-8 space-y-4`}
      >
        {step < 3 && (
          <ResumeInputSection
            loadingResumes={loadingResumes}
            userResumes={userResumes}
            selectedResumeId={selectedResumeId}
            onSelectedResumeIdChange={setSelectedResumeId}
            loadingBaseResume={loadingBaseResume}
            baseResume={baseResume}
            jobText={jobText}
            onJobTextChange={setJobText}
            analyzeError={analyzeError}
            isAnalyzing={isAnalyzing}
            hasAnalyzed={hasAnalyzed}
            onAnalyze={handleAnalyze}
          />
        )}
      </div>

      {/* Wizard (only after analysis) */}
      {hasAnalyzed && (
        <div
          className={`${step === 3 && tailoredResume ? "max-w-5xl" : "max-w-3xl"} mx-auto`}
        >
          <div className="mb-8">
            <StepProgressBar current={step} />
          </div>

          <AnimatePresence mode="wait">
            {step === 1 && (
              <motion.div
                key="step-1"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.25 }}
              >
                <ResumeComparisonTable
                  extractedJob={extractedJob!}
                  userSkills={
                    Array.isArray(resumeDataForAI.skills)
                      ? resumeDataForAI.skills
                      : []
                  }
                  userTitle={resumeDataForAI.experience?.[0]?.jobTitle || ""}
                  userExpYears={resumeDataForAI.experience?.length || 0}
                  onContinue={() => setStep(2)}
                />
              </motion.div>
            )}

            {step === 2 && (
              <WizardStep2Align
                extractedJob={extractedJob!}
                enhanceSections={enhanceSections}
                onEnhanceSectionsChange={setEnhanceSections}
                selectedKeywords={selectedKeywords}
                onSelectedKeywordsChange={setSelectedKeywords}
                onBack={() => setStep(1)}
                onTailor={handleTailor}
                isTailoring={isTailoring}
              />
            )}

            {step === 3 && (
              <WizardStep3Review
                isTailoring={isTailoring}
                tailoredResume={tailoredResume}
                baseResume={baseResume}
                decisions={decisions}
                originalScore={originalScore}
                tailoredScore={tailoredScore}
                aiChatLoading={aiChatLoading}
                creating={creating}
                onToggleDecision={handleToggleDecision}
                onAIChatSend={handleAIChatSend}
                onDownloadPDF={handleDownloadPDF}
                onCreateAndEdit={handleCreateAndEdit}
                onBack={() => setStep(2)}
              />
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Creating overlay */}
      {creating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-sm">
          <motion.div
            className="text-center space-y-3"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <Loader2 className="h-7 w-7 animate-spin text-foreground mx-auto" />
            <p className="text-sm font-semibold text-foreground">
              Creating your resume...
            </p>
          </motion.div>
        </div>
      )}
    </div>
  );
}
