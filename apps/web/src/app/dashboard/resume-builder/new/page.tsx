"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  Check,
  ClipboardPaste,
  Download,
  Edit3,
} from "lucide-react";
import Link from "next/link";
import { useGlobalStore } from "@/store/useGlobalStore";
import {
  extractJobPosting,
  tailorResume,
  getAllResumes,
  getResumeById,
  createResume,
  type Resume,
} from "@/services/resumeService";
import { apiRequest } from "@/lib/api/apiClient";
import { ResumeComparisonTable } from "../_components/ResumeComparisonTable";
import { ResumePreviewWithHighlights } from "../_components/ResumePreviewWithHighlights";
import { ScoreGauge } from "../_components/ScoreGauge";
import { AIChatInput } from "../_components/AIChatInput";
import type { ExtractedJobData, TailoredResume } from "@/types/resume";
import { useEffect } from "react";

/* ------------------------------------------------------------------ */
/*  Step progress bar                                                   */
/* ------------------------------------------------------------------ */

const STEPS = [
  { label: "See Your Difference" },
  { label: "Align Your Resume" },
  { label: "Review Your New Resume" },
] as const;

function StepProgressBar({ current }: { current: number }) {
  return (
    <div className="flex items-center justify-center gap-0">
      {STEPS.map((s, i) => {
        const stepNum = i + 1;
        const isCompleted = stepNum < current;
        const isActive = stepNum === current;

        return (
          <div key={s.label} className="flex items-center">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium transition-colors ${
                  isCompleted
                    ? "bg-emerald-500 text-white"
                    : isActive
                      ? "bg-foreground text-background"
                      : "bg-secondary text-muted-foreground"
                }`}
              >
                {isCompleted ? <Check className="w-4 h-4" /> : stepNum}
              </div>
              <span
                className={`text-xs whitespace-nowrap ${
                  isActive
                    ? "text-foreground font-medium"
                    : "text-muted-foreground"
                }`}
              >
                {s.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={`w-16 sm:w-24 h-px mx-3 mb-5 ${
                  stepNum < current
                    ? "bg-emerald-500"
                    : "border-t border-dashed border-border"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Change decision helpers                                             */
/* ------------------------------------------------------------------ */

interface ChangeDecision {
  section: string;
  index?: number;
  accepted: boolean;
}

function initDecisions(tailored: TailoredResume, originalExpCount: number): ChangeDecision[] {
  const d: ChangeDecision[] = [
    { section: "summary", accepted: true },
    { section: "skills", accepted: true },
  ];
  // Use the max of original and tailored experience count
  const count = Math.max(originalExpCount, tailored.tailoredExperience.length);
  for (let i = 0; i < count; i++) {
    d.push({ section: "experience", index: i, accepted: true });
  }
  return d;
}

/* ------------------------------------------------------------------ */
/*  Main page                                                          */
/* ------------------------------------------------------------------ */

export default function NewResumePage() {
  const router = useRouter();
  const { user } = useGlobalStore();

  // User's existing resumes (list view - skeleton data)
  const [userResumes, setUserResumes] = useState<Resume[]>([]);
  const [selectedResumeId, setSelectedResumeId] = useState<string | null>(null);
  const [loadingResumes, setLoadingResumes] = useState(true);

  // Full base resume (fetched individually with all data)
  const [baseResume, setBaseResume] = useState<Resume | null>(null);
  const [loadingBaseResume, setLoadingBaseResume] = useState(false);

  // Job input
  const [jobText, setJobText] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);

  // Wizard state
  const [extractedJob, setExtractedJob] = useState<ExtractedJobData | null>(null);
  const [step, setStep] = useState(1);
  const [tailoredResume, setTailoredResume] = useState<TailoredResume | null>(null);
  const [isTailoring, setIsTailoring] = useState(false);

  // Step 2 selections
  const [enhanceSections, setEnhanceSections] = useState({
    summary: true,
    skills: true,
    experience: true,
    projects: false,
  });
  const [selectedKeywords, setSelectedKeywords] = useState<string[]>([]);

  // Step 3: Change decisions & AI chat
  const [decisions, setDecisions] = useState<ChangeDecision[]>([]);
  const [aiChatLoading, setAiChatLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  // Load user's existing resumes on mount
  useEffect(() => {
    getAllResumes()
      .then((resumes) => {
        setUserResumes(resumes);
        if (resumes.length > 0) {
          setSelectedResumeId(resumes[0]._id);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingResumes(false));
  }, []);

  // Fetch full resume data when selection changes
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

  // Build resume data object for comparison & tailoring
  const resumeDataForAI = baseResume
    ? {
        personalInfo: {
          fullName: baseResume.personal?.fullName || user?.name || "",
          email: baseResume.personal?.email || user?.email || "",
          phone: baseResume.personal?.phone || "",
          location: baseResume.personal?.location || "",
          summary: baseResume.summary || "",
        },
        experience: (baseResume.experience || []).map((exp) => ({
          jobTitle: exp.title || "",
          company: exp.company || "",
          location: exp.location || "",
          startDate: exp.startDate || "",
          endDate: exp.endDate || "",
          description: exp.descriptions || [],
        })),
        education: (baseResume.education || []).map((edu) => ({
          degree: edu.degree || "",
          institution: edu.institution || "",
          location: edu.location || "",
          graduationDate: edu.endDate || "",
        })),
        skills: Object.values(baseResume.skills?.skills || {}).flat(),
      }
    : {
        personalInfo: {
          fullName: user?.name || "",
          email: user?.email || "",
          summary: "",
        },
        experience: [],
        education: [],
        skills: [],
      };

  const hasAnalyzed = extractedJob !== null;

  // Compute original score for before/after display
  const originalScore = hasAnalyzed
    ? (() => {
        const skills = Array.isArray(resumeDataForAI.skills) ? resumeDataForAI.skills : [];
        const allJobKw = [
          ...(extractedJob?.requiredSkills || []),
          ...(extractedJob?.industryKeywords || []),
        ];
        const unique = [...new Set(allJobKw.map((k) => k.toLowerCase()))];
        const matched = unique.filter((kw) =>
          skills.some((s) => s.toLowerCase().includes(kw) || kw.includes(s.toLowerCase()))
        );
        const kwRatio = unique.length > 0 ? matched.length / unique.length : 0;
        return Math.round(kwRatio * 70 + 10) / 10; // rough 0-10 scale
      })()
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
      const allKeywords = Array.from(
        new Set([...(data.requiredSkills || []), ...(data.industryKeywords || [])])
      );
      setSelectedKeywords(allKeywords);
    } catch (err) {
      setAnalyzeError(
        err instanceof Error ? err.message : "Failed to analyze job posting"
      );
    } finally {
      setIsAnalyzing(false);
    }
  }

  /* ---- Step 2 → Step 3: Tailor resume ---- */
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
      setDecisions(initDecisions(result, baseResume?.experience?.length || 0));
    } catch (err) {
      setAnalyzeError("Tailoring failed. Please try again.");
      setStep(2);
    } finally {
      setIsTailoring(false);
    }
  }

  /* ---- Toggle a change decision ---- */
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

  /* ---- AI Chat: re-tailor with instruction ---- */
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
        setDecisions(initDecisions(result, baseResume?.experience?.length || 0));
      } catch {
        // silently fail, keep existing
      } finally {
        setAiChatLoading(false);
      }
    },
    [extractedJob, tailoredResume, jobText, resumeDataForAI]
  );

  /* ---- Download PDF ---- */
  const handleDownloadPDF = useCallback(async () => {
    if (!tailoredResume || !baseResume) return;
    try {
      const { pdf } = await import("@react-pdf/renderer");
      const { createPDFDocument } = await import(
        "../_components/PDFTemplateRenderer"
      );

      const summaryAccepted = decisions.find((d) => d.section === "summary")?.accepted ?? true;
      const skillsAccepted = decisions.find((d) => d.section === "skills")?.accepted ?? true;

      const pdfData = {
        template: "classic",
        personalInfo: {
          fullName: baseResume.personal?.fullName || "",
          email: baseResume.personal?.email || "",
          phone: baseResume.personal?.phone || "",
          location: baseResume.personal?.location || "",
          linkedin: baseResume.personal?.linkedIn || "",
          website: baseResume.personal?.website || "",
          summary: summaryAccepted
            ? tailoredResume.tailoredSummary
            : baseResume.summary || "",
        },
        experience: tailoredResume.tailoredExperience.map((exp, i) => {
          const accepted = decisions.find((d) => d.section === "experience" && d.index === i)?.accepted ?? true;
          const orig = baseResume.experience?.[i];
          return {
            id: crypto.randomUUID(),
            jobTitle: accepted ? exp.title : (orig?.title || exp.title),
            company: exp.company,
            location: orig?.location || "",
            startDate: orig?.startDate || "",
            endDate: orig?.endDate || "",
            current: false,
            description: accepted ? exp.descriptions : (orig?.descriptions || exp.descriptions),
          };
        }),
        education: (baseResume.education || []).map((edu) => ({
          id: crypto.randomUUID(),
          degree: edu.degree,
          institution: edu.institution,
          location: edu.location,
          graduationDate: edu.endDate,
        })),
        skills: (skillsAccepted
          ? tailoredResume.tailoredSkills
          : Object.values(baseResume.skills?.skills || {}).flat()
        ).map((name) => ({
          id: crypto.randomUUID(),
          name,
          category: "technical" as const,
          level: "intermediate" as const,
        })),
        dynamicSections: [],
        customFields: [],
        careerField: "",
      };

      const pdfDoc = createPDFDocument(pdfData);
      const blob = await pdf(pdfDoc).toBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${baseResume.personal?.fullName || "resume"}_tailored.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch {
      // silently fail
    }
  }, [tailoredResume, baseResume, decisions]);

  /* ---- Create & Edit: save tailored resume to API then open in builder ---- */
  const handleCreateAndEdit = useCallback(async () => {
    if (!tailoredResume || !baseResume || creating) return;
    setCreating(true);
    try {
      const summaryAccepted = decisions.find((d) => d.section === "summary")?.accepted ?? true;
      const skillsAccepted = decisions.find((d) => d.section === "skills")?.accepted ?? true;

      // Match tailored experience to original by company
      const getTailoredExp = (origCompany: string, origIndex: number) => {
        return tailoredResume.tailoredExperience?.find(
          (t) => t.company.toLowerCase().includes(origCompany.toLowerCase().split(" ")[0])
        ) || tailoredResume.tailoredExperience?.[origIndex] || null;
      };

      const resumeName = `${extractedJob?.jobTitle || "Tailored"}${extractedJob?.company ? ` - ${extractedJob.company}` : ""}`.slice(0, 200);

      // Merge original experience with tailored — keep all original entries
      const mergedExperience = (baseResume.experience || []).map((orig, i) => {
        const tailored = getTailoredExp(orig.company, i);
        const accepted = decisions.find((d) => d.section === "experience" && d.index === i)?.accepted ?? true;
        const bullets = accepted && tailored ? tailored.descriptions : orig.descriptions;
        return {
          id: crypto.randomUUID(),
          company: orig.company || "Company",
          position: (accepted && tailored ? tailored.title : orig.title) || "Position",
          location: orig.location || "",
          startDate: orig.startDate || "",
          endDate: orig.endDate || "",
          description: (bullets || []).join("\n"),
        };
      });

      const payload = {
        id: crypto.randomUUID().replace(/-/g, "").slice(0, 24),
        userId: "placeholder",
        name: resumeName,
        template: "classic",
        personalInfo: {
          fullName: baseResume.personal?.fullName || user?.name || "Name",
          email: baseResume.personal?.email || user?.email || "email@example.com",
          phone: baseResume.personal?.phone || "",
          location: baseResume.personal?.location || "",
          linkedIn: baseResume.personal?.linkedIn || "",
          website: baseResume.personal?.website || "",
          gitHub: "",
          summary: summaryAccepted
            ? tailoredResume.tailoredSummary
            : baseResume.summary || "",
        },
        experience: mergedExperience,
        education: (baseResume.education || []).map((edu) => ({
          id: crypto.randomUUID(),
          degree: edu.degree || "Degree",
          school: edu.institution || "School",
          location: edu.location || "",
          startDate: edu.startDate || "",
          endDate: edu.endDate || "",
        })),
        skills: (skillsAccepted
          ? tailoredResume.tailoredSkills
          : Object.values(baseResume.skills?.skills || {}).flat()
        ).map((name) => ({
          id: crypto.randomUUID(),
          name: name || "Skill",
          level: "intermediate",
        })),
        sections: [],
        fieldVisibility: {},
        customFields: [],
      };

      const response = await apiRequest("/api/resume", {
        method: "POST",
        data: payload,
        retries: 0,
      });
      const resume = response.data || response;
      router.push("/dashboard/resumes");
    } catch (err: any) {
      const errData = err?.data || err?.response?.data;
      const msg = errData?.errorMessage || errData?.message || (err instanceof Error ? err.message : "Failed to create resume");
      setAnalyzeError(msg);
      setCreating(false);
    }
  }, [tailoredResume, baseResume, decisions, extractedJob, creating, router]);

  /* ---- Tailored score as 0-10 ---- */
  const tailoredScore = tailoredResume
    ? Math.min(tailoredResume.atsScore / 10, 10)
    : 0;

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
      <div className={`${step === 3 && tailoredResume ? "max-w-5xl" : "max-w-3xl"} mx-auto mb-8 space-y-4`}>
        {step < 3 && (
          <>
            {/* Resume selector */}
            <div className="dash-card p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium text-foreground">Base Resume</div>
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
                  onChange={(e) => setSelectedResumeId(e.target.value)}
                  className="w-full bg-secondary rounded-lg px-4 py-2.5 text-sm text-foreground border border-border focus:border-foreground/20 outline-none transition-colors"
                >
                  {userResumes.map((r) => (
                    <option key={r._id} value={r._id}>
                      {r.name || "Untitled Resume"} — {r.personal?.fullName || "No name"}
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
              ) : baseResume && (
                <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                  <span>{baseResume.experience?.length || 0} experience entries</span>
                  <span>·</span>
                  <span>{Object.values(baseResume.skills?.skills || {}).flat().length || 0} skills</span>
                  <span>·</span>
                  <span>{baseResume.education?.length || 0} education entries</span>
                </div>
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
                onChange={(e) => setJobText(e.target.value)}
                placeholder="Paste the full job description here..."
                rows={5}
                className="w-full bg-secondary rounded-lg px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground resize-y outline-none border border-border focus:border-foreground/20 transition-colors"
              />
              {analyzeError && (
                <p className="text-sm text-destructive">{analyzeError}</p>
              )}
              <div className="flex justify-end">
                <button
                  onClick={handleAnalyze}
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
        )}
      </div>

      {/* Wizard (only after analysis) */}
      {hasAnalyzed && (
        <div className={`${step === 3 && tailoredResume ? "max-w-5xl" : "max-w-3xl"} mx-auto`}>
          {/* Step progress bar */}
          <div className="mb-8">
            <StepProgressBar current={step} />
          </div>

          <AnimatePresence mode="wait">
            {/* Step 1: Comparison table */}
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
                  userSkills={Array.isArray(resumeDataForAI.skills) ? resumeDataForAI.skills : []}
                  userTitle={resumeDataForAI.experience?.[0]?.jobTitle || ""}
                  userExpYears={resumeDataForAI.experience?.length || 0}
                  onContinue={() => setStep(2)}
                />
              </motion.div>
            )}

            {/* Step 2: Align your resume */}
            {step === 2 && (
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
                    {(
                      Object.keys(enhanceSections) as Array<keyof typeof enhanceSections>
                    ).map((key) => {
                      const labels: Record<string, string> = {
                        summary: "Professional Summary",
                        skills: "Skills",
                        experience: "Experience",
                        projects: "Projects",
                      };
                      const isSelected = enhanceSections[key];
                      return (
                        <button
                          key={key}
                          onClick={() =>
                            setEnhanceSections((prev) => ({
                              ...prev,
                              [key]: !prev[key],
                            }))
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
                            {isSelected && <Check className="w-3 h-3 text-background" />}
                          </div>
                          {labels[key]}
                        </button>
                      );
                    })}
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
                    {Array.from(
                      new Set([
                        ...(extractedJob!.requiredSkills || []),
                        ...(extractedJob!.preferredSkills || []),
                        ...(extractedJob!.industryKeywords || []),
                      ])
                    ).map((kw) => {
                      const isSelected = selectedKeywords.includes(kw);
                      return (
                        <button
                          key={kw}
                          onClick={() =>
                            setSelectedKeywords((prev) =>
                              isSelected ? prev.filter((k) => k !== kw) : [...prev, kw]
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
                    onClick={() => setStep(1)}
                    className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Back
                  </button>
                  <button
                    onClick={handleTailor}
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
            )}

            {/* Step 3: Jobright-style Review Page */}
            {step === 3 && (
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
                          onToggleDecision={handleToggleDecision}
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
                                Score: {originalScore.toFixed(1)} → {tailoredScore.toFixed(1)}
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
                        <div className="dash-card p-5 space-y-2">
                          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Your Decisions
                          </h3>
                          <div className="space-y-1.5">
                            {[
                              { label: "Summary", section: "summary" },
                              { label: "Skills", section: "skills" },
                              ...(baseResume?.experience || []).map((exp, i) => ({
                                label: `${exp.title} at ${exp.company}`,
                                section: "experience",
                                index: i,
                              })),
                            ].map((item) => {
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
                                    handleToggleDecision(
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
                                    <span className="w-3 h-3 shrink-0 text-center font-bold">✕</span>
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
                      </div>
                    </div>

                    {/* AI Chat Input */}
                    <div className="dash-card p-5">
                      <AIChatInput
                        onSend={handleAIChatSend}
                        isLoading={aiChatLoading}
                      />
                    </div>

                    {/* Bottom navigation */}
                    <div className="flex items-center justify-between pt-2">
                      <button
                        onClick={() => setStep(2)}
                        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <ArrowLeft className="w-4 h-4" />
                        Back
                      </button>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={handleDownloadPDF}
                          className="inline-flex items-center gap-2 bg-secondary text-foreground hover:bg-border rounded-xl px-5 py-2.5 text-sm font-medium border border-border transition-colors"
                        >
                          <Download className="w-4 h-4" />
                          Download Resume
                        </button>
                        <button
                          onClick={handleCreateAndEdit}
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
