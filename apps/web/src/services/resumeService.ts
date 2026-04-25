import { apiRequest } from "@/lib/api/apiClient";

export interface ResumePersonal {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  linkedIn?: string;
  website?: string;
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
}

export interface Resume {
  _id: string;
  personal: ResumePersonal;
  summary?: string;
  skills: ResumeSkills;
  experience: ResumeExperience[];
  education: ResumeEducation[];
  name: string;
  template: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateResumePayload {
  personal: ResumePersonal;
  summary?: string;
  skills: ResumeSkills;
  experience: ResumeExperience[];
  education: ResumeEducation[];
}

export type UpdateResumePayload = Partial<CreateResumePayload>;

export async function createResume(
  payload: CreateResumePayload
): Promise<Resume> {
  return apiRequest("/api/resume", {
    method: "POST",
    data: payload,
  });
}

export async function updateResume(
  resumeId: string,
  payload: UpdateResumePayload
): Promise<Resume> {
  return apiRequest(`/api/resume/${resumeId}`, {
    method: "PUT",
    data: payload,
  });
}

export async function getAllResumes(): Promise<Resume[]> {
  const response = await apiRequest("/api/resume", { method: "GET" });
  return response.data?.data || [];
}

export async function getResumeById(resumeId: string): Promise<Resume> {
  const response = await apiRequest(`/api/resume/${resumeId}`, {
    method: "GET",
  });
  return response.data || response;
}

export async function deleteResume(resumeId: string): Promise<void> {
  return apiRequest(`/api/resume/${resumeId}`, { method: "DELETE" });
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
    const response = await apiRequest("/api/resume/ask", {
      method: "POST",
      data: {
        Prompt: prompt,
      },
    });

    // Normalize the various shapes the backend may return so callers
    // always receive either a string or an array of strings.
    let generated: string | string[] = "";

    if (typeof response === "string") {
      generated = response;
    } else if (response == null) {
      generated = "";
    } else if (typeof response === "object") {
      // Common patterns:
      // { data: "..." }
      // { generated_content: "..." }
      // { data: { generated_content: "..." } }
      if (
        typeof response.generated_content === "string" ||
        Array.isArray(response.generated_content)
      ) {
        generated = response.generated_content;
      } else if (typeof response.data === "string") {
        generated = response.data;
      } else if (
        response.data &&
        (typeof response.data.generated_content === "string" ||
          Array.isArray(response.data.generated_content))
      ) {
        generated = response.data.generated_content;
      } else if (typeof response.message === "string") {
        // As a fallback, use a textual message field if present
        generated = response.message;
      } else {
        // Last resort: stringify the object so React renders a string
        try {
          generated = JSON.stringify(response);
        } catch (e) {
          generated = String(response);
        }
      }
    } else {
      generated = String(response);
    }

    return {
      success: true,
      data: {
        generated_content: generated,
      },
    };
  } catch (error) {
    console.error("AI generation error:", error);
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
  const response = await apiRequest("/api/resume/default", { method: "GET" });
  return response.data || response;
}
