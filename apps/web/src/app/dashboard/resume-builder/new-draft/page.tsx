"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";

import { useGlobalStore } from "@/store/useGlobalStore";
import { tailorResume } from "@/services/resumeService";
import { apiRequest } from "@/lib/api/apiClient";
import type { ExtractedJobData, TailoredResume } from "@/types/resume";
import { JobContextCard } from "../_components/JobContextCard";
import {
  AITailorPanel,
  type AcceptedChanges,
} from "../_components/AITailorPanel";

interface ResumeNewContext {
  purpose: string;
  extractedJobData: ExtractedJobData | null;
  tailoredResume?: TailoredResume | null;
  baseResume?: any;
}

export default function NewDraftPage() {
  const router = useRouter();
  const { user } = useGlobalStore();

  const [context, setContext] = useState<ResumeNewContext | null>(null);
  const [tailoredResume, setTailoredResume] = useState<TailoredResume | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const initiated = useRef(false);

  useEffect(() => {
    if (initiated.current) return;
    initiated.current = true;

    const raw = sessionStorage.getItem("resume_new_context");
    if (!raw) {
      router.replace("/dashboard/resume-builder/new");
      return;
    }

    let parsed: ResumeNewContext;
    try {
      parsed = JSON.parse(raw) as ResumeNewContext;
    } catch {
      router.replace("/dashboard/resume-builder/new");
      return;
    }

    setContext(parsed);

    // If tailored resume was already generated in the wizard, use it directly
    if (parsed.tailoredResume) {
      setTailoredResume(parsed.tailoredResume);
      setLoading(false);
      return;
    }

    // Non-job purposes: create a blank resume and redirect
    if (parsed.purpose !== "job_application" || !parsed.extractedJobData) {
      createBlankResume(parsed);
      return;
    }

    // Job application without pre-generated result: run AI tailoring
    runTailoring(parsed);
     
  }, []);

  async function createBlankResume(ctx: ResumeNewContext) {
    try {
      const purposeLabel =
        ctx.purpose === "college_application" ? "College Application" : "General Resume";
      const payload = {
        id: crypto.randomUUID(),
        userId: "placeholder",
        name: purposeLabel,
        template: "classic",
        personalInfo: {
          fullName: user?.name ?? "",
          email: user?.email ?? "",
          phone: "",
          location: "",
          linkedIn: "",
          website: "",
          gitHub: "",
          summary: "",
        },
        experience: [],
        education: [],
        skills: [],
        sections: [],
        fieldVisibility: {},
        customFields: [],
      };

      const response = await apiRequest("/api/resume", {
        method: "POST",
        data: payload,
      });
      const resume = response.data || response;
      sessionStorage.removeItem("resume_new_context");
      router.replace(
        `/dashboard/resume-builder/${resume.ID || resume._id || resume.id}`
      );
    } catch (err) {
      setLoading(false);
      setError(err instanceof Error ? err.message : "Failed to create resume");
    }
  }

  async function runTailoring(ctx: ResumeNewContext) {
    setLoading(true);
    setError(null);

    try {
      // Use base resume from context if available, otherwise fallback to user info
      const currentResume = ctx.baseResume || {
        personal: {
          fullName: user?.name ?? "",
          email: user?.email ?? "",
        },
        summary: "",
        experience: [],
        skills: [],
      };

      const result = await tailorResume({
        purpose: ctx.purpose,
        extractedRequirements: ctx.extractedJobData!,
        currentResume,
      });

      setTailoredResume(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to tailor resume");
    } finally {
      setLoading(false);
    }
  }

  const handleAcceptChanges = useCallback(
    async (accepted: AcceptedChanges) => {
      if (creating) return;
      setCreating(true);
      setError(null);

      try {
        const jobTitle = context?.extractedJobData?.jobTitle ?? "Untitled";
        const company = context?.extractedJobData?.company ?? "";
        const base = context?.baseResume;

        const payload = {
          id: crypto.randomUUID(),
          userId: "placeholder",
          name: `${jobTitle}${company ? ` - ${company}` : ""}`,
          template: "classic",
          personalInfo: {
            fullName: base?.personal?.fullName || (user?.name ?? ""),
            email: base?.personal?.email || (user?.email ?? ""),
            phone: base?.personal?.phone || "",
            location: base?.personal?.location || "",
            linkedIn: base?.personal?.linkedIn || "",
            website: base?.personal?.website || "",
            gitHub: "",
            summary: accepted.summary || "",
          },
          experience: accepted.experience.map((exp) => ({
            id: crypto.randomUUID(),
            company: exp.company || "Company",
            position: exp.title || "Position",
            location: "",
            startDate: "Present",
            endDate: "Present",
            description: exp.descriptions.join("\n"),
          })),
          education: (base?.education || []).map((edu: any) => ({
            id: crypto.randomUUID(),
            degree: edu.degree || "",
            school: edu.institution || "",
            location: edu.location || "",
            startDate: edu.startDate || "",
            endDate: edu.endDate || "",
          })),
          skills: accepted.skills.map((skill) => ({
            id: crypto.randomUUID(),
            name: skill,
            level: "intermediate",
          })),
          sections: [],
          fieldVisibility: {},
          customFields: [],
        };

        const response = await apiRequest("/api/resume", {
          method: "POST",
          data: payload,
        });
        const resume = response.data || response;
        sessionStorage.removeItem("resume_new_context");
        router.push(
          `/dashboard/resume-builder/${resume.ID || resume._id || resume.id}`
        );
      } catch (err: any) {
        const errData = err?.data;
        const msg = errData?.errors
          ? "Validation errors: " + JSON.stringify(errData.errors)
          : errData?.message ||
            (err instanceof Error ? err.message : "Failed to create resume");
        setError(msg);
        setCreating(false);
      }
    },
    [creating, user, router, context]
  );

  const handleDownloadPDF = useCallback(
    async (accepted: AcceptedChanges) => {
      try {
        const { pdf } = await import("@react-pdf/renderer");
        const { createPDFDocument } = await import(
          "../_components/PDFTemplateRenderer"
        );

        const base = context?.baseResume;

        const pdfData = {
          template: "classic",
          personalInfo: {
            fullName: base?.personal?.fullName || (user?.name ?? ""),
            email: base?.personal?.email || (user?.email ?? ""),
            phone: base?.personal?.phone || "",
            location: base?.personal?.location || "",
            linkedin: base?.personal?.linkedIn || "",
            website: base?.personal?.website || "",
            summary: accepted.summary || "",
          },
          experience: accepted.experience.map((exp) => ({
            id: crypto.randomUUID(),
            jobTitle: exp.title,
            company: exp.company,
            location: "",
            startDate: "",
            endDate: "",
            current: false,
            description: exp.descriptions,
          })),
          education: (base?.education || []).map((edu: any) => ({
            id: crypto.randomUUID(),
            degree: edu.degree || "",
            institution: edu.institution || "",
            location: edu.location || "",
            graduationDate: edu.endDate || "",
          })),
          skills: accepted.skills.map((name) => ({
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
        const jobTitle = context?.extractedJobData?.jobTitle ?? "resume";
        const company = context?.extractedJobData?.company ?? "";
        link.href = url;
        link.download = `${base?.personal?.fullName || user?.name || "resume"}_${company || jobTitle}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      } catch {
        setError("Failed to generate PDF. Please try again.");
      }
    },
    [user, context]
  );

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4">
        <motion.div
          className="text-center space-y-4"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <Loader2 className="h-8 w-8 animate-spin text-foreground mx-auto" />
          <div>
            <p className="text-sm font-semibold text-foreground">
              Tailoring your resume...
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Analyzing the job posting and optimizing your content
            </p>
          </div>
        </motion.div>
      </div>
    );
  }

  if (error && !tailoredResume) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4">
        <motion.div
          className="text-center space-y-4 max-w-md"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <p className="text-sm font-semibold text-foreground">
            Something went wrong
          </p>
          <p className="text-xs text-muted-foreground">{error}</p>
          <Link
            href="/dashboard/resume-builder/new"
            className="inline-flex items-center gap-1.5 text-sm text-foreground underline underline-offset-2 hover:text-foreground/80 transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Try again
          </Link>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] px-4 py-8 sm:px-6 lg:px-8">
      <motion.div
        className="max-w-2xl mx-auto mb-8"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Link
          href="/dashboard/resume-builder/new"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </Link>
        <h1 className="text-2xl font-semibold text-foreground">
          AI Resume Tailoring
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Review the AI suggestions below and choose what to include
        </p>
      </motion.div>

      <div className="max-w-2xl mx-auto space-y-5">
        {context?.extractedJobData && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.05 }}
          >
            <JobContextCard extractedJob={context.extractedJobData} />
          </motion.div>
        )}

        {error && (
          <div className="dash-card p-4 border-red-200 dark:border-red-800">
            <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        {tailoredResume && context?.extractedJobData && (
          <AITailorPanel
            extractedJob={context.extractedJobData}
            tailoredResume={tailoredResume}
            onAccept={handleAcceptChanges}
            onDownloadPDF={handleDownloadPDF}
          />
        )}

        {creating && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-sm">
            <motion.div
              className="text-center space-y-3"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.2 }}
            >
              <Loader2 className="h-7 w-7 animate-spin text-foreground mx-auto" />
              <p className="text-sm font-semibold text-foreground">
                Creating your resume...
              </p>
            </motion.div>
          </div>
        )}
      </div>
    </div>
  );
}
