"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { Check, Download } from "lucide-react";
import { useGlobalStore } from "@/store/useGlobalStore";
import type { ResumeData } from "@/store/useGlobalStore";
import { ResumePreviewPanel } from "../_components/ResumePreviewPanel";
import { ResumeTabSwitcher } from "../_components/ResumeTabSwitcher";
import type { EditorTab } from "../_components/ResumeTabSwitcher";
import { cn } from "@/lib/utils";
import { getResumeById, type Resume } from "@/services/resumeService";
import { AIChatEditor } from "../_components/AIChatEditor";
import { hasMeaningfulResumeData, TEMPLATES } from "../_lib/resume-constants";


// Map an API resume (already run through `fromApiResume`) into the global-store
// ResumeData shape. Shared by the initial loader and the AI-chat live update.
function mapApiResumeToStore(apiData: Resume): ResumeData {
  return {
    careerField: "",
    personalInfo: {
      fullName: apiData.personal?.fullName || (apiData.personal as unknown as Record<string, string>)?.name || "",
      email: apiData.personal?.email || "",
      phone: apiData.personal?.phone || "",
      location: apiData.personal?.location || "",
      linkedin: apiData.personal?.linkedIn || (apiData.personal as unknown as Record<string, string>)?.linkedin || "",
      website: apiData.personal?.website || "",
      github: (apiData.personal as unknown as Record<string, string>)?.github || "",
      summary: apiData.summary || "",
    },
    experience: (apiData.experience || []).map((exp) => ({
      id: crypto.randomUUID(),
      jobTitle: exp.title,
      company: exp.company,
      location: exp.location,
      startDate: exp.startDate,
      endDate: exp.endDate,
      current: false,
      description: exp.descriptions || [],
    })),
    education: (apiData.education || []).map((edu) => ({
      id: crypto.randomUUID(),
      degree: edu.degree,
      institution: edu.institution,
      location: edu.location,
      graduationDate: edu.endDate || (edu as unknown as Record<string, string>).year || "",
      gpa: (edu as unknown as Record<string, string>).gpa || "",
    })),
    skills: Object.entries(apiData.skills?.skills || {}).flatMap(
      ([category, skillNames]) =>
        (skillNames as string[]).map((name) => ({
          id: crypto.randomUUID(),
          name,
          category: category as "technical" | "soft" | "language",
          level: "intermediate" as const,
        }))
    ),
    customFields: [],
    dynamicSections: ((apiData as unknown as { sections?: Record<string, unknown>[] }).sections || []).map((s: Record<string, unknown>) => ({
      id: crypto.randomUUID(),
      title: (s.title as string) || "",
      type: (s.type as string) || ((s.title as string)?.toLowerCase().includes("certif") ? "certifications" : (s.title as string)?.toLowerCase().includes("project") ? "projects" : "custom"),
      entries: Array.isArray(s.items)
        ? (s.items as Record<string, unknown>[])
            .filter((item, idx, arr) => {
              const name = (item.name as string) || "";
              return !name || arr.findIndex((i) => (i.name as string) === name) === idx;
            })
            .map((item) => ({
              id: crypto.randomUUID(),
              name: (item.name as string) || "",
              title: (item.name as string) || "",
              date: (item.year as string) || `${(item.startDate as string) || ""} - ${(item.endDate as string) || ""}`.replace(/^ - $/, ""),
              issuer: (item.issuer as string) || "",
              description: Array.isArray(item.bullets) ? (item.bullets as string[]).join("\n") : (item.description as string) || "",
              bullets: Array.isArray(item.bullets) ? (item.bullets as string[]).join("\n") : "",
            }))
        : [],
      description: (s.content as string) || "",
      bullets: "",
    })),
    template: "classic",
    documentEdits: Array.isArray(apiData.documentEdits) ? apiData.documentEdits : [],
  };
}

export default function ResumeBuilderPage() {
  const params = useParams();
  const {
    resumeBuilder,
    populateWithDummyContent,
    setResumeTemplate,
    resetResumeBuilder,
    setCurrentResumeId,
    loadResume,
    currentResumeId,
  } = useGlobalStore();

  const [hasOriginalState, setHasOriginalState] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [editorTab, setEditorTab] = useState<EditorTab>("chat");

  const resumeDataRef = useRef(resumeBuilder.data);
  const initializationRef = useRef(false);

  useEffect(() => {
    resumeDataRef.current = resumeBuilder.data;
  }, [resumeBuilder.data]);

  useEffect(() => {
    initializationRef.current = false;
  }, [params.id]);

  useEffect(() => {
    const idParam = params.id;
    const normalizedId = Array.isArray(idParam) ? idParam[0] : idParam ?? null;
    setCurrentResumeId(normalizedId);
  }, [params.id, setCurrentResumeId]);

  useEffect(() => {
    const idParam = params.id;
    const id = Array.isArray(idParam) ? idParam[0] : idParam ?? null;

    if (!id || initializationRef.current) {
      return;
    }

    if (id === "new") {
      const hasExistingData = hasMeaningfulResumeData(resumeDataRef.current);

      if (!hasExistingData) {
        resetResumeBuilder();
        populateWithDummyContent(
          resumeDataRef.current.careerField || "technology"
        );
      }

      initializationRef.current = true;
      return;
    }

    let isMounted = true;

    getResumeById(id)
      .then((apiData) => {
        if (!isMounted) {
          return;
        }

        const storeData: ResumeData = mapApiResumeToStore(apiData);

        loadResume(storeData);
        setHasOriginalState(Boolean(apiData?.hasOriginal));
      })
      .catch((error) => {
        console.error("Failed to load resume", error);
      })
      .finally(() => {
        if (isMounted) {
          initializationRef.current = true;
        }
      });

    return () => {
      isMounted = false;
    };
  }, [params.id, populateWithDummyContent, resetResumeBuilder, loadResume]);

  // PDF Download Handler
  const handleDownloadPDF = async () => {
    try {
      const { pdf } = await import("@react-pdf/renderer");
      const { createPDFDocument } = await import(
        "../_components/PDFTemplateRenderer"
      );

      const pdfDoc = createPDFDocument(resumeBuilder.data);
      const blob = await pdf(pdfDoc).toBlob();

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${
        resumeBuilder.data.personalInfo.fullName || "resume"
      }.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      alert("Failed to download PDF. Please try again.");
    }
  };

  // Live-update the preview after an AI-chat edit. The backend already persisted
  // the change, so we just refresh local store state from the returned resume.
  const handleResumeUpdated = useCallback(
    (updated: Resume) => {
      loadResume(mapApiResumeToStore(updated));
      setHasOriginalState(Boolean(updated?.hasOriginal));
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    },
    [loadResume]
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Success Notification */}
      <AnimatePresence>
        {saveSuccess && (
          <motion.div
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-[300] bg-[#102B47] text-white px-5 py-2.5 rounded-xl shadow-lg flex items-center gap-2 text-sm"
          >
            <Check className="w-4 h-4" />
            Saved
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content — Jobright-style: Preview Left, Editor Right */}
      <div className="grid lg:grid-cols-[1fr_380px] h-[calc(100dvh-4rem)]">
        {/* Left Panel - Live Resume Preview */}
        <ResumePreviewPanel
          fullName={resumeBuilder.data.personalInfo?.fullName || ""}
          template={resumeBuilder.data.template}
          careerField={resumeBuilder.data.careerField || ""}
          onPopulateSampleData={populateWithDummyContent}
          resumeId={currentResumeId ?? ""}
          hasOriginal={hasOriginalState}
        />

        {/* Right Panel — Tabs: AI Editor / Style */}
        <div className="border-l border-border flex flex-col h-full bg-white dark:bg-card overflow-hidden">
          {/* Tab switcher */}
          <ResumeTabSwitcher activeTab={editorTab} setActiveTab={setEditorTab} />

          {/* Tab content */}
          <div className="flex-1 overflow-hidden flex flex-col">
            {/* AI Editor Tab — chat-driven resume editing */}
            {editorTab === "chat" && (
              <AIChatEditor
                resumeId={currentResumeId ?? ""}
                onResumeUpdated={handleResumeUpdated}
              />
            )}

            {/* Style Tab */}
            {editorTab === "style" && (
              <div className="flex-1 overflow-y-auto p-3 space-y-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-1">Template</p>
                <div className="grid grid-cols-2 gap-2">
                  {TEMPLATES.map((template) => (
                    <button
                      key={template.id}
                      onClick={() => {
                        setResumeTemplate(template.id as any);
                        setSaveSuccess(true);
                        setTimeout(() => setSaveSuccess(false), 1500);
                      }}
                      className={cn(
                        "p-3 rounded-xl border text-left transition-all text-xs",
                        resumeBuilder.data.template === template.id
                          ? "border-[#2E9098] bg-[#102B47]/5 text-[#2E9098] font-semibold"
                          : "border-border hover:border-[#2E9098]/30"
                      )}
                    >
                      {template.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Bottom bar */}
          <div className="border-t border-border p-3 shrink-0 bg-white dark:bg-card">
            <button
              onClick={handleDownloadPDF}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#102B47] text-white rounded-lg text-sm font-medium hover:bg-[#0b1f33] transition-colors shadow-sm"
            >
              <Download className="w-4 h-4" />
              Download Resume
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
