/**
 * ContentGenerationModal Component
 *
 * Modal dialog for entering generation context and previewing results.
 * Handles the full generation workflow: input → loading → results → approval.
 */

"use client";

import { useState } from "react";
import {
  X,
  Loader,
  Check,
  RotateCcw,
  AlertCircle,
  Copy,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ATSScoreDisplay } from "./ATSScoreDisplay";
import { extractKeywords } from "@/app/dashboard/resume-builder/_components/atsUtils";
import { toast } from "sonner";
import { motion } from "motion/react";
import { GenerationContextForm } from "./GenerationContextForm";
import { AIFieldType } from "./GenerateButton";
import {
  generateProfessionalSummary,
  generateJobBullets,
  generateCareerObjective,
  generateProjectDescription,
  generateAIContent,
  AIGenerationContext,
  AIGenerationResponse,
} from "@/services/resumeService";
import { useTranslation } from "react-i18next";

export type GenerationStep = "config" | "loading" | "result";

export interface GenerationResult {
  id: string;
  content: string | string[];
  atsScore?: number;
  wordCount?: number;
  keywordsIncluded?: string[];
  tone?: string;
}

export interface ContentGenerationModalProps {
  isOpen: boolean;
  field: AIFieldType;
  context: Record<string, any>;
  onClose: () => void;
  onApply: (content: string | string[]) => void;
  onAlternatives?: () => void;
}

export function ContentGenerationModal({
  isOpen,
  field,
  context,
  onClose,
  onApply,
  onAlternatives,
}: ContentGenerationModalProps) {
  const { t } = useTranslation();
  const [step, setStep] = useState<GenerationStep>("config");
  const [generatedContent, setGeneratedContent] =
    useState<GenerationResult | null>(null);
  const [alternatives, setAlternatives] = useState<GenerationResult[]>([]);
  const [selectedAlternativeIndex, setSelectedAlternativeIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationContext, setGenerationContext] = useState(context);
  const [copied, setCopied] = useState(false);
  const [missingKeywords, setMissingKeywords] = useState<string[]>([]);

  const fieldLabels: Record<string, string> = {
    summary: t("ai.fields.summary", "Professional Summary"),
    objective: t("ai.fields.objective", "Career Objective"),
    bullets: t("ai.fields.bullets", "Job Bullet Points"),
    project: t("ai.fields.project", "Project Description"),
    skill: t("ai.fields.skill", "Skill Description"),
    experience_description: t("ai.fields.experienceDesc", "Experience Description"),
    experience_bullets: t("ai.fields.experienceBullets", "Experience Bullet Points"),
    education_description: t("ai.fields.educationDesc", "Education Description"),
    project_description: t("ai.fields.projectDesc", "Project Description"),
    project_bullets: t("ai.fields.projectBullets", "Project Bullet Points"),
    course_description: t("ai.fields.courseDesc", "Course Description"),
    award_description: t("ai.fields.awardDesc", "Award Description"),
    organization_description: t("ai.fields.organizationDesc", "Organization Description"),
    publication_description: t("ai.fields.publicationDesc", "Publication Description"),
    language_description: t("ai.fields.languageDesc", "Language Description"),
    volunteer_description: t("ai.fields.volunteerDesc", "Volunteer Work Description"),
    reference_description: t("ai.fields.referenceDesc", "Reference Description"),
    declaration_text: t("ai.fields.declaration", "Declaration Text"),
    custom_description: t("ai.fields.customDesc", "Custom Section Description"),
    custom_bullets: t("ai.fields.customBullets", "Custom Section Bullet Points"),
  };

  // Build ATS-optimized prompt based on field type and context
  const buildPrompt = (
    fieldType: AIFieldType,
    ctx: Record<string, any>
  ): string => {
    const baseInstructions =
      "You are an expert resume writer specializing in ATS-optimized content. ";

    switch (fieldType) {
      case "summary":
        return `${baseInstructions}Generate a professional summary for a resume.
Current Role: ${ctx.current_role || "Not specified"}
Key Skills: ${ctx.key_skills || "Not specified"}
Years of Experience: ${ctx.years_experience || "0"}
Industry: ${ctx.industry || "Not specified"}
Target Role: ${ctx.target_role || "Not specified"}

Requirements:
- Write a concise 2-3 sentence professional summary
- Use ATS-friendly language with industry-standard keywords
- Highlight key skills and experience
- Make it achievement-focused
- Use professional tone
- Return ONLY the summary text, no additional formatting`;

      case "experience_description":
      case "experience_bullets":
        const isBullets = fieldType === "experience_bullets";
        return `${baseInstructions}Generate ${
          isBullets ? "bullet points" : "a description"
        } for a work experience entry.
Job Title: ${ctx.job_title || "Not specified"}
Company: ${ctx.company || "Not specified"}
Responsibilities: ${ctx.responsibilities || "Not specified"}
Achievements: ${ctx.achievements || "Not specified"}
Technologies/Skills: ${ctx.technologies || "Not specified"}

Requirements:
${
  isBullets
    ? `- Generate 4-6 achievement-focused bullet points
- Each bullet should start with a strong action verb
- Include quantifiable metrics where possible
- Return each bullet point on a new line
- Do NOT include bullet symbols (•, -, *), just the text`
    : `- Write a concise 2-3 sentence description
- Focus on key responsibilities and achievements
- Use professional language`
}
- Use ATS-friendly keywords
- Make it achievement-focused
- Return ONLY the ${
          isBullets ? "bullet points" : "description"
        }, no additional formatting`;

      case "education_description":
        return `${baseInstructions}Generate a description for an education entry.
Degree: ${ctx.degree || "Not specified"}
Institution: ${ctx.institution || "Not specified"}
Field of Study: ${ctx.field_of_study || "Not specified"}
Achievements: ${ctx.achievements || "Not specified"}
Relevant Coursework: ${ctx.coursework || "Not specified"}

Requirements:
- Write a concise 1-2 sentence description
- Highlight relevant achievements, coursework, or honors
- Use professional language
- Return ONLY the description, no additional formatting`;

      case "project_description":
      case "project_bullets":
        const isProjectBullets = fieldType === "project_bullets";
        return `${baseInstructions}Generate ${
          isProjectBullets ? "bullet points" : "a description"
        } for a project.
Project Name: ${ctx.project_name || "Not specified"}
Technologies: ${ctx.technologies || "Not specified"}
Role: ${ctx.role || "Not specified"}
Description: ${ctx.description || "Not specified"}
Impact: ${ctx.impact || "Not specified"}

Requirements:
${
  isProjectBullets
    ? `- Generate 3-5 bullet points describing the project
- Each bullet should highlight technical skills or achievements
- Return each bullet point on a new line
- Do NOT include bullet symbols (•, -, *), just the text`
    : `- Write a concise 2-3 sentence description
- Focus on technologies used and impact`
}
- Use ATS-friendly technical keywords
- Return ONLY the ${
          isProjectBullets ? "bullet points" : "description"
        }, no additional formatting`;

      case "course_description":
        return `${baseInstructions}Generate a description for a course/certification.
Course Name: ${ctx.course_name || "Not specified"}
Provider: ${ctx.provider || "Not specified"}
Skills Learned: ${ctx.skills_learned || "Not specified"}
Projects: ${ctx.projects || "Not specified"}

Requirements:
- Write a concise 1-2 sentence description
- Highlight key skills learned or projects completed
- Use professional language
- Return ONLY the description, no additional formatting`;

      case "award_description":
        return `${baseInstructions}Generate a description for an award or achievement.
Award Name: ${ctx.award_name || "Not specified"}
Issuing Organization: ${ctx.organization || "Not specified"}
Reason: ${ctx.reason || "Not specified"}
Impact: ${ctx.impact || "Not specified"}

Requirements:
- Write a concise 1-2 sentence description
- Highlight the significance and impact
- Use professional language
- Return ONLY the description, no additional formatting`;

      case "organization_description":
        return `${baseInstructions}Generate a description for an organization membership.
Organization Name: ${ctx.organization_name || "Not specified"}
Role: ${ctx.role || "Not specified"}
Activities: ${ctx.activities || "Not specified"}
Achievements: ${ctx.achievements || "Not specified"}

Requirements:
- Write a concise 1-2 sentence description
- Highlight role and key activities
- Use professional language
- Return ONLY the description, no additional formatting`;

      case "publication_description":
        return `${baseInstructions}Generate a description for a publication.
Title: ${ctx.title || "Not specified"}
Publisher: ${ctx.publisher || "Not specified"}
Topic: ${ctx.topic || "Not specified"}
Impact: ${ctx.impact || "Not specified"}

Requirements:
- Write a concise 1-2 sentence description
- Highlight the topic and significance
- Use professional language
- Return ONLY the description, no additional formatting`;

      case "custom_description":
      case "custom_bullets":
        const isCustomBullets = fieldType === "custom_bullets";
        return `${baseInstructions}Generate ${
          isCustomBullets ? "bullet points" : "a description"
        } for a custom resume section.
Section Title: ${ctx.section_title || "Not specified"}
Context: ${ctx.context || "Not specified"}
Key Points: ${ctx.key_points || "Not specified"}

Requirements:
${
  isCustomBullets
    ? `- Generate 3-5 bullet points
- Return each bullet point on a new line
- Do NOT include bullet symbols (•, -, *), just the text`
    : `- Write a concise 2-3 sentence description`
}
- Use ATS-friendly language
- Use professional tone
- Return ONLY the ${
          isCustomBullets ? "bullet points" : "description"
        }, no additional formatting`;

      case "declaration_text":
        return `${baseInstructions}Generate a professional declaration statement for a resume.
Name: ${ctx.name || "Not specified"}
Location: ${ctx.location || "Not specified"}

Requirements:
- Write a formal declaration statement
- Include standard declaration language
- Use professional tone
- Return ONLY the declaration text, no additional formatting`;

      default:
        return `${baseInstructions}Generate professional resume content based on the following context: ${JSON.stringify(
          ctx
        )}`;
    }
  };

  const generationFunctions: Record<
    string,
    (context: AIGenerationContext) => Promise<AIGenerationResponse>
  > = {
    summary: generateProfessionalSummary,
    objective: generateCareerObjective,
    bullets: generateJobBullets,
    project: generateProjectDescription,
    skill: generateProjectDescription,
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    setError(null);
    setStep("loading");

    try {
      let response: AIGenerationResponse;

      // Use the new AI generation service for new field types
      const newFieldTypes = [
        "experience_description",
        "experience_bullets",
        "education_description",
        "project_description",
        "project_bullets",
        "course_description",
        "award_description",
        "organization_description",
        "publication_description",
        "language_description",
        "volunteer_description",
        "reference_description",
        "declaration_text",
        "custom_description",
        "custom_bullets",
      ];

      if (newFieldTypes.includes(field)) {
        // Build the prompt and use the new AI generation service
        const built = buildPrompt(field, generationContext);
        const prompt = built;
        response = await generateAIContent(prompt);
      } else {
        // Use the existing generation functions for legacy fields
        const generateFunction = generationFunctions[field];
        response = await generateFunction(generationContext);
      }

      if (!response.success) {
        throw new Error(response.message || "Generation failed");
      }

      const data = response.data;

      const content = data.generated_content;

      setGeneratedContent({
        id: "main",
        content,
        atsScore: data.atsScore,
        wordCount: data.wordCount,
        keywordsIncluded: data.keywordsIncluded,
        tone: generationContext.tone,
      });

      // Compute missing keywords when we have a job description in context
      const jobDescription =
        generationContext.job_description ||
        generationContext.job_description_text ||
        generationContext.jobDesc ||
        "";
      if (jobDescription && data?.keywordsIncluded) {
        try {
          const jobKeywords = extractKeywords(jobDescription);
          const included = (data.keywordsIncluded || []).map((k: string) =>
            k.toLowerCase()
          );
          const missing = jobKeywords.filter(
            (k: string) => !included.includes(k)
          );
          setMissingKeywords(missing.slice(0, 12));
        } catch (err) {
          console.error("Failed to compute missing keywords", err);
          setMissingKeywords([]);
        }
      } else {
        setMissingKeywords([]);
      }

      // For now, no alternatives support
      setAlternatives([]);

      setStep("result");
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "An error occurred";
      setError(errorMessage);
      setStep("config");
      console.error("Generation error:", err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAddSuggestion = async (keyword: string) => {
    // Add keyword to context key_points array for next generation or user visibility
    const prevKeyPoints = Array.isArray(generationContext.key_points)
      ? [...generationContext.key_points]
      : [];
    const updatedKeyPoints = [...new Set([...prevKeyPoints, keyword])];
    setGenerationContext({
      ...generationContext,
      key_points: updatedKeyPoints,
    });
    // Remove it from missing list
    setMissingKeywords((prev) => prev.filter((k) => k !== keyword));
    try {
      await navigator.clipboard.writeText(keyword);
      toast.success(t("ai.modal.keywordAddedCopied", "Keyword added to context and copied to clipboard."));
    } catch (err) {
      toast.success(t("ai.modal.keywordAdded", "Keyword added to context."));
    }
  };

  const handleApply = () => {
    const contentToApply =
      alternatives.length > 0
        ? alternatives[selectedAlternativeIndex].content
        : generatedContent?.content;

    // Treat empty string and empty arrays as "no content" but allow "0" or similar
    const isEmpty = (c: any) => {
      if (c === undefined || c === null) return true;
      if (Array.isArray(c))
        return c.length === 0 || c.every((v) => !v || !String(v).trim());
      if (typeof c === "string") return c.trim().length === 0;
      return false;
    };

    if (isEmpty(contentToApply)) {
      // Provide user feedback and don't call the parent change handler when content is empty
      toast.error(t("ai.modal.noContentError", "No content to apply. Please generate valid content first."));
      return;
    }

    // Log and apply - this helps with debugging parent not updating
    console.debug("ContentGenerationModal apply: ", contentToApply);
    try {
      onApply(contentToApply!);
      toast.success(t("ai.modal.appliedSuccess", "Applied generated content"));
    } catch (err) {
      console.error("Failed to apply generated content", err);
      toast.error(t("ai.modal.appliedError", "Failed to apply generated content"));
      return;
    }

    // Close modal after a brief delay
    setTimeout(() => onClose(), 50);
  };

  const handleRegenerate = () => {
    setGeneratedContent(null);
    setAlternatives([]);
    setSelectedAlternativeIndex(0);
    setStep("config");
  };

  const handleCopyToClipboard = async () => {
    const contentToCopy =
      alternatives.length > 0
        ? alternatives[selectedAlternativeIndex].content
        : generatedContent?.content;

    if (contentToCopy) {
      try {
        const textToCopy = Array.isArray(contentToCopy)
          ? contentToCopy.join("\n")
          : contentToCopy;
        await navigator.clipboard.writeText(textToCopy);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        console.error("Failed to copy:", err);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div 
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-background rounded-lg border border-border shadow-lg"
        role="dialog"
        aria-labelledby="modal-title"
        aria-modal="true"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background px-6 py-4">
          <div>
            <h2 id="modal-title" className="text-lg font-semibold text-foreground">
              ✨ {t("ai.modal.title", "AI Content Generator")}
            </h2>
            <p className="text-xs text-muted-foreground">
              {fieldLabels[field]} - {t("ai.modal.subtitle", "Optimized for ATS")}
            </p>
            <div aria-live="polite" className="sr-only">
              {isGenerating
                ? t("ai.modal.statusGenerating", "Generating content")
                : generatedContent
                ? t("ai.modal.statusComplete", "AI generation complete")
                : t("ai.modal.statusConfig", "Configure generation settings")}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-accent rounded transition-colors"
            aria-label={t("common.close", "Close")}
          >
            <X className="w-5 h-5 text-muted-foreground" aria-hidden="true" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Config Step */}
          {step === "config" && (
            <div className="space-y-4">
              <GenerationContextForm
                field={field}
                context={generationContext}
                onContextChange={setGenerationContext}
              />

              {/* Error Message */}
              {error && (
                <div role="alert" className="flex gap-2 p-3 bg-destructive/10 border border-destructive rounded-lg">
                  <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-medium text-destructive">
                      {t("ai.modal.generationFailed", "Generation Failed")}
                    </p>
                    <p className="text-xs text-destructive/80">{error}</p>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-2 justify-end pt-4">
                <button
                  onClick={onClose}
                  className="px-4 py-2 border border-input rounded-lg text-sm font-medium hover:bg-accent transition-colors"
                >
                  {t("common.cancel", "Cancel")}
                </button>
                <button
                  onClick={handleGenerate}
                  disabled={isGenerating}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isGenerating ? (
                    <>
                      <Loader className="w-4 h-4 animate-spin" aria-hidden="true" />
                      <span>{t("common.generating", "Generating...")}</span>
                    </>
                  ) : (
                    <>
                      <span>✨ {t("common.generate", "Generate")}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Loading Step */}
          {step === "loading" && (
            <div className="flex flex-col items-center justify-center py-12 space-y-4" role="status" aria-label={t("ai.modal.statusGenerating", "Generating content")}>
              <div className="relative w-12 h-12">
                <div className="absolute inset-0 bg-primary/20 rounded-full animate-pulse" />
                <Loader className="w-12 h-12 text-primary animate-spin" aria-hidden="true" />
              </div>
              <div className="text-center space-y-2">
                <p className="text-sm font-medium text-foreground">
                  {t("ai.modal.generatingContent", "Generating content...")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("ai.modal.generatingTime", "This usually takes 2-5 seconds")}
                </p>
              </div>
            </div>
          )}

          {/* Result Step */}
          {step === "result" && generatedContent && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28 }}
              className="space-y-4"
            >
              {/* Generated Content */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-foreground">
                  {t("ai.modal.generatedContent", "Generated Content")}
                </label>
                <div className="p-3 bg-muted/30 border border-border rounded-lg">
                  {Array.isArray(generatedContent.content) ? (
                    <ul className="space-y-2">
                      {generatedContent.content.map((bullet, idx) => (
                        <li
                          key={idx}
                          className="text-sm text-foreground flex gap-2"
                        >
                          <span className="text-muted-foreground flex-shrink-0" aria-hidden="true">
                            •
                          </span>
                          <span>{bullet}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-foreground whitespace-pre-wrap">
                      {generatedContent.content}
                    </p>
                  )}
                </div>
              </div>

              {/* ATS Score */}
              {generatedContent.atsScore !== undefined && (
                <ATSScoreDisplay
                  score={generatedContent.atsScore}
                  wordCount={generatedContent.wordCount}
                  keywordsIncluded={generatedContent.keywordsIncluded}
                  missingKeywords={missingKeywords}
                  onAddSuggestion={handleAddSuggestion}
                />
              )}

              {/* Alternatives Navigation */}
              {alternatives.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-foreground">
                      {t("ai.modal.alternatives", { current: selectedAlternativeIndex + 1, total: alternatives.length + 1, defaultValue: `Alternatives (${selectedAlternativeIndex + 1} of ${alternatives.length + 1})` })}
                    </label>
                    <div className="flex gap-1">
                      <button
                        onClick={() =>
                          setSelectedAlternativeIndex(
                            Math.max(0, selectedAlternativeIndex - 1)
                          )
                        }
                        disabled={selectedAlternativeIndex === 0}
                        className="p-1 hover:bg-accent rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        aria-label={t("common.previous", "Previous alternative")}
                      >
                        <ChevronLeft className="w-4 h-4" aria-hidden="true" />
                      </button>
                      <button
                        onClick={() =>
                          setSelectedAlternativeIndex(
                            Math.min(
                              alternatives.length - 1,
                              selectedAlternativeIndex + 1
                            )
                          )
                        }
                        disabled={
                          selectedAlternativeIndex === alternatives.length - 1
                        }
                        className="p-1 hover:bg-accent rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        aria-label={t("common.next", "Next alternative")}
                      >
                        <ChevronRight className="w-4 h-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-2 justify-end pt-4">
                <button
                  onClick={handleCopyToClipboard}
                  className="flex items-center gap-2 px-3 py-2 border border-input rounded-lg text-sm hover:bg-accent transition-colors"
                >
                  <Copy className="w-4 h-4" aria-hidden="true" />
                  {copied ? t("common.copied", "Copied!") : t("common.copy", "Copy")}
                </button>
                <button
                  onClick={handleRegenerate}
                  className="flex items-center gap-2 px-3 py-2 border border-input rounded-lg text-sm hover:bg-accent transition-colors"
                >
                  <RotateCcw className="w-4 h-4" aria-hidden="true" />
                  {t("common.regenerate", "Regenerate")}
                </button>
                <button
                  onClick={handleApply}
                  disabled={
                    (alternatives.length > 0
                      ? alternatives[selectedAlternativeIndex].content
                      : generatedContent?.content) === undefined ||
                    (Array.isArray(
                      alternatives.length > 0
                        ? alternatives[selectedAlternativeIndex].content
                        : generatedContent?.content
                    ) &&
                      (alternatives[selectedAlternativeIndex]?.content || [])
                        .length === 0)
                  }
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label={t("ai.modal.useThis", "Use this generated content")}
                >
                  <Check className="w-4 h-4" aria-hidden="true" />
                  {t("ai.modal.useThisBtn", "Use This")}
                </button>
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
