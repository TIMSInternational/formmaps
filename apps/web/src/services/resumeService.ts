import { apiRequest, unwrapApiData, type ApiEnvelope } from "@/lib/api/apiClient";
import {
  fromApiResume,
  type ApiResumePayload,
  type OriginalFileType,
  type RawResumeEntity,
} from "@/services/resumeSerialization";
import type {
  ExtractedJobData,
  TailorResumePayload,
  TailoredResume,
} from "@/types/resume";

export interface ResumePersonal {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  linkedIn?: string;
  website?: string;
  github?: string;
}

export interface ResumeSkillGroups {
  [category: string]: string[];
}

export interface ResumeSkills {
  skills: ResumeSkillGroups;
}

export interface ResumeExperience {
  company: string;
  location: string;
  title: string;
  startDate: string;
  endDate: string;
  descriptions: string[];
}

export interface ResumeEducation {
  degree: string;
  institution: string;
  location: string;
  startDate: string;
  endDate: string;
  gpa?: string;
}

export interface Resume {
  _id: string;
  personal: ResumePersonal;
  summary?: string;
  skills: ResumeSkills;
  experience: ResumeExperience[];
  education: ResumeEducation[];
  sections?: Record<string, unknown>[];
  name: string;
  template: string;
  createdAt?: string;
  updatedAt?: string;
  hasOriginal?: boolean;
  originalFileType?: OriginalFileType;
  documentEdits?: import("@/store/useGlobalStore").DocumentEdit[];
}

// Writers MUST emit the backend column contract (see resumeSerialization).
export type CreateResumePayload = ApiResumePayload;
export type UpdateResumePayload = Partial<ApiResumePayload>;
type ResumeApiResponse = ApiEnvelope<RawResumeEntity> | RawResumeEntity;
type ResumeListApiResponse = ApiEnvelope<RawResumeEntity[]> | RawResumeEntity[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

export async function createResume(
  payload: CreateResumePayload
): Promise<Resume> {
  const response = await apiRequest<ResumeApiResponse>("/api/resume", {
    method: "POST",
    data: payload,
  });
  return fromApiResume(unwrapApiData(response));
}

export async function updateResume(
  resumeId: string,
  payload: UpdateResumePayload
): Promise<Resume> {
  const response = await apiRequest<ResumeApiResponse>(`/api/resume/${resumeId}`, {
    method: "PUT",
    data: payload,
  });
  return fromApiResume(unwrapApiData(response));
}

export async function getAllResumes(): Promise<Resume[]> {
  const response = await apiRequest<ResumeListApiResponse>("/api/resume", { method: "GET" });
  const raw = unwrapApiData(response) || [];
  return (Array.isArray(raw) ? raw : []).map(fromApiResume);
}

export async function getResumeById(resumeId: string): Promise<Resume> {
  const response = await apiRequest<ResumeApiResponse>(`/api/resume/${resumeId}`, {
    method: "GET",
  });
  const raw = unwrapApiData(response);
  return fromApiResume({ ...raw, id: raw?.ID || raw?._id || raw?.id || resumeId });
}

export async function deleteResume(resumeId: string): Promise<void> {
  await apiRequest<ApiEnvelope<unknown>>(`/api/resume/${resumeId}`, { method: "DELETE" });
}

export interface AiEditResult {
  applied: boolean;
  message?: string;
  changeSummary?: string;
  resume?: Resume;
}

/**
 * Apply a natural-language edit to a resume. The backend re-writes the full
 * resume via AI, persists it, and returns the updated row (or applied:false on
 * a parse/validate failure so the resume is never corrupted).
 */
export async function aiEditResume(
  resumeId: string,
  instruction: string
): Promise<AiEditResult> {
  const response = await apiRequest<ApiEnvelope<{
    applied?: boolean;
    message?: string;
    changeSummary?: string;
    resume?: RawResumeEntity;
  }>>(`/api/resume/${resumeId}/ai-edit`, {
    method: "POST",
    data: { instruction },
  });
  const data = unwrapApiData(response);
  return {
    applied: Boolean(data?.applied),
    message: data?.message,
    changeSummary: data?.changeSummary,
    resume: data?.resume
      ? fromApiResume({
          ...(data.resume as Record<string, unknown>),
          id: resumeId,
        } as Parameters<typeof fromApiResume>[0])
      : undefined,
  };
}

export async function getOriginalUrl(resumeId: string): Promise<string | null> {
  try {
    const res = await apiRequest<ApiEnvelope<{ url?: string }> | { url?: string }>(
      `/api/resume/${resumeId}/original`,
      { method: "GET" },
    );
    return unwrapApiData(res)?.url ?? null;
  } catch (e) {
    console.error("getOriginalUrl failed", e);
    return null;
  }
}

// AI Generation Functions
export interface AIGenerationContext {
  jobTitle?: string;
  company?: string;
  responsibilities?: string;
  technologies?: string;
  currentRole?: string;
  keySkills?: string;
  yearsExperience?: number;
  industry?: string;
  targetRole?: string;
  achievements?: string[];
}

export interface AIGenerationResponse {
  success: boolean;
  data: {
    generated_content: string | string[];
    atsScore?: number;
    wordCount?: number;
    keywordsIncluded?: string[];
  };
  message?: string;
}

export async function generateProfessionalSummary(
  context: AIGenerationContext
): Promise<AIGenerationResponse> {
  // Construct a detailed prompt and use the generic ask endpoint so the
  // frontend controls the prompt content. This avoids calling a fixed
  // specialized endpoint and lets the backend route the prompt to the AI.
  const parts: string[] = [];
  parts.push(
    "Write a concise professional resume summary (3-4 sentences) optimized for ATS and recruiters."
  );
  if (context.jobTitle) parts.push(`Target role: ${context.jobTitle}.`);
  if (context.currentRole) parts.push(`Current role: ${context.currentRole}.`);
  if (context.yearsExperience !== undefined)
    parts.push(`Years of experience: ${context.yearsExperience}.`);
  if (context.keySkills) parts.push(`Key skills: ${context.keySkills}.`);
  if (context.industry) parts.push(`Industry: ${context.industry}.`);
  if (context.achievements && context.achievements.length)
    parts.push(`Notable achievements: ${context.achievements.join("; ")}.`);
  parts.push(
    "Highlight impact using metrics where possible and keep tone professional."
  );

  const prompt = parts.join(" ");

  return generateAIContent(prompt);
}

export async function generateJobBullets(
  context: AIGenerationContext
): Promise<AIGenerationResponse> {
  // Build a prompt for generating concise job bullet points
  const parts: string[] = [];
  parts.push(
    "Generate 4-6 impactful resume bullet points describing achievements and responsibilities for the role below. Use action verbs and include metrics where possible."
  );
  if (context.currentRole) parts.push(`Current role: ${context.currentRole}.`);
  if (context.company) parts.push(`Company: ${context.company}.`);
  if (context.responsibilities)
    parts.push(`Responsibilities: ${context.responsibilities}.`);
  if (context.technologies)
    parts.push(`Technologies: ${context.technologies}.`);
  if (context.yearsExperience !== undefined)
    parts.push(`Years of experience: ${context.yearsExperience}.`);
  if (context.achievements && context.achievements.length)
    parts.push(`Achievements: ${context.achievements.join("; ")}.`);
  parts.push("Return bullets as a JSON array of strings.");
  const prompt = parts.join(" ");
  return generateAIContent(prompt);
}

export async function generateCareerObjective(
  context: AIGenerationContext
): Promise<AIGenerationResponse> {
  // Build a prompt for a career objective / professional objective sentence
  const parts: string[] = [];
  parts.push("Write a 1-2 sentence career objective tailored for a resume.");
  if (context.targetRole) parts.push(`Target role: ${context.targetRole}.`);
  if (context.industry) parts.push(`Industry: ${context.industry}.`);
  if (context.yearsExperience !== undefined)
    parts.push(`Years of experience: ${context.yearsExperience}.`);
  if (context.keySkills) parts.push(`Key skills: ${context.keySkills}.`);
  parts.push("Keep tone professional and concise.");
  const prompt = parts.join(" ");
  return generateAIContent(prompt);
}

export async function generateProjectDescription(
  context: AIGenerationContext
): Promise<AIGenerationResponse> {
  // Build a prompt for project descriptions
  const parts: string[] = [];
  parts.push(
    "Create a 2-3 sentence project description suitable for a resume. Focus on the problem solved, your contribution, technologies used, and measurable outcome."
  );
  if (context.currentRole) parts.push(`Role: ${context.currentRole}.`);
  if (context.technologies)
    parts.push(`Technologies: ${context.technologies}.`);
  if (context.achievements && context.achievements.length)
    parts.push(`Outcomes: ${context.achievements.join("; ")}.`);
  parts.push("Keep language concise and achievement-focused.");
  const prompt = parts.join(" ");
  return generateAIContent(prompt);
}

/**
 * Generic AI content generation using the /api/resume/ask endpoint
 * This function constructs a detailed prompt and sends it to the AI
 */
export async function generateAIContent(
  prompt: string
): Promise<AIGenerationResponse> {
  try {
    type AiGeneratedContent = string | string[];
    type AiAskResponse = AiGeneratedContent | {
      generated_content?: AiGeneratedContent;
      message?: string;
      data?: AiGeneratedContent | { generated_content?: AiGeneratedContent };
    };
    const response = await apiRequest<ApiEnvelope<AiAskResponse> | AiAskResponse>("/api/resume/ask", {
      method: "POST",
      data: {
        Prompt: prompt,
      },
    });
    const payload = unwrapApiData(response);

    // Normalize the various shapes the backend may return so callers
    // always receive either a string or an array of strings.
    let generated: string | string[] = "";

    if (typeof payload === "string" || Array.isArray(payload)) {
      generated = payload;
    } else if (payload == null) {
      generated = "";
    } else if (isRecord(payload)) {
      // Common patterns:
      // { data: "..." }
      // { generated_content: "..." }
      // { data: { generated_content: "..." } }
      if (
        typeof payload.generated_content === "string" ||
        Array.isArray(payload.generated_content)
      ) {
        generated = payload.generated_content;
      } else if (typeof payload.data === "string" || Array.isArray(payload.data)) {
        generated = payload.data;
      } else if (
        isRecord(payload.data) &&
        (typeof payload.data.generated_content === "string" ||
          Array.isArray(payload.data.generated_content))
      ) {
        generated = payload.data.generated_content;
      } else if (typeof payload.message === "string") {
        // As a fallback, use a textual message field if present
        generated = payload.message;
      } else {
        // Last resort: stringify the object so React renders a string
        try {
          generated = JSON.stringify(payload);
        } catch (e) {
          generated = String(payload);
        }
      }
    } else {
      generated = String(payload);
    }

    return {
      success: true,
      data: {
        generated_content: generated,
      },
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error ? error.message : "Failed to generate content",
      data: {
        generated_content: "",
      },
    };
  }
}

export async function getDefaultResume(): Promise<Resume> {
  const response = await apiRequest<ResumeApiResponse>("/api/resume/default", { method: "GET" });
  return fromApiResume(unwrapApiData(response));
}

// --- AI Resume Tailoring Functions ---

/**
 * Send a job posting text to the backend for AI extraction of key requirements.
 */
export async function extractJobPosting(
  jobPostingText: string,
  purpose: string
): Promise<ExtractedJobData> {
  type ExtractJobPostingResponse = {
    title?: string;
    company?: string;
    location?: string;
    requirements?: string[];
    skills?: string[];
    description?: string;
  };
  const response = await apiRequest<ApiEnvelope<ExtractJobPostingResponse>>("/api/resume/extract-job-posting", {
    method: "POST",
    data: { text: jobPostingText, purpose },
  });
  const data = unwrapApiData(response);
  return {
    jobTitle: data.title ?? "",
    company: data.company ?? "",
    location: data.location ?? "",
    employmentType: "",
    requiredSkills: data.skills ?? [],
    preferredSkills: [],
    requiredQualifications: data.requirements ?? [],
    keyResponsibilities: data.requirements ?? [],
    industryKeywords: data.skills ?? [],
    experienceLevel: "",
    summary: data.description ?? "",
  };
}

/**
 * Tailor an existing resume to match extracted job requirements.
 */
export async function tailorResume(
  payload: TailorResumePayload
): Promise<TailoredResume> {
  const response = await apiRequest<ApiEnvelope<TailoredResume> | TailoredResume>("/api/resume/tailor", {
    method: "POST",
    data: payload,
  });
  return unwrapApiData(response);
}
