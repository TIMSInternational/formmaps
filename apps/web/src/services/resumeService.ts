import { apiRequest } from "@/lib/api/apiClient";

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
  const raw = response.data?.data || response.data || [];
  // Map backend ID field to frontend _id
  return raw.map((r: any) => ({
    ...r,
    _id: r.ID || r._id || r.id || "",
    name: r.name || r.Name || "",
    template: r.template || r.Template || "classic",
    personal: {
      fullName: r.personalInfo?.fullName || r.personalInfo?.name || r.PersonalInfo?.FullName || "",
      email: r.personalInfo?.email || r.PersonalInfo?.Email || "",
      phone: r.personalInfo?.phone || r.PersonalInfo?.Phone || "",
      location: r.personalInfo?.location || r.PersonalInfo?.Location || "",
      linkedIn: r.personalInfo?.linkedIn || r.personalInfo?.linkedin || r.PersonalInfo?.LinkedIn || "",
      website: r.personalInfo?.website || r.PersonalInfo?.Website || "",
    },
    summary: r.personalInfo?.summary || r.PersonalInfo?.Summary || r.summary || "",
    experience: (r.experience || r.Experience || []).map((exp: any) => ({
      company: exp.company || exp.Company || "",
      location: exp.location || exp.Location || "",
      title: exp.position || exp.Position || exp.title || exp.Title || "",
      startDate: exp.startDate || exp.StartDate || "",
      endDate: exp.endDate || exp.EndDate || "",
      descriptions: exp.bullets?.length
        ? exp.bullets
        : exp.description
        ? (typeof exp.description === "string" ? exp.description.split("\n").filter(Boolean) : exp.description)
        : exp.descriptions || [],
    })),
    education: (r.education || r.Education || []).map((edu: any) => ({
      degree: edu.degree || edu.Degree || "",
      institution: edu.school || edu.School || edu.institution || "",
      location: edu.location || edu.Location || "",
      startDate: edu.startDate || edu.StartDate || "",
      endDate: edu.endDate || edu.EndDate || "",
    })),
    skills: {
      skills: groupSkillsFromFlat(r.skills || r.Skills || []),
    },
    createdAt: r.createdDate || r.CreatedDate || r.createdAt || "",
    updatedAt: r.updatedAt || r.UpdatedAt || "",
  }));
}

export async function getResumeById(resumeId: string): Promise<Resume> {
  const response = await apiRequest(`/api/resume/${resumeId}`, {
    method: "GET",
  });
  const raw = response.data || response;

  // Map backend entity (PascalCase / flat) to frontend Resume shape
  // The backend stores: personalInfo.summary, experience[].position, experience[].description (string), skills[] (flat array)
  // The frontend builder expects: personal, summary (top-level), experience[].title, experience[].descriptions (array), skills.skills (grouped object)
  const mapped: Resume = {
    _id: raw.ID || raw._id || raw.id || resumeId,
    name: raw.name || raw.Name || "",
    template: raw.template || raw.Template || "classic",
    createdAt: raw.createdDate || raw.CreatedDate || raw.createdAt,
    updatedAt: raw.updatedAt || raw.UpdatedAt,
    personal: {
      fullName: raw.personalInfo?.fullName || raw.personalInfo?.name || raw.PersonalInfo?.FullName || "",
      email: raw.personalInfo?.email || raw.PersonalInfo?.Email || "",
      phone: raw.personalInfo?.phone || raw.PersonalInfo?.Phone || "",
      location: raw.personalInfo?.location || raw.PersonalInfo?.Location || "",
      linkedIn: raw.personalInfo?.linkedIn || raw.personalInfo?.linkedin || raw.PersonalInfo?.LinkedIn || "",
      website: raw.personalInfo?.website || raw.PersonalInfo?.Website || "",
      github: raw.personalInfo?.github || "",
    },
    summary: raw.personalInfo?.summary || raw.PersonalInfo?.Summary || raw.summary || "",
    experience: (raw.experience || raw.Experience || []).map((exp: any) => ({
      company: exp.company || exp.Company || "",
      location: exp.location || exp.Location || "",
      title: exp.position || exp.Position || exp.title || exp.Title || "",
      startDate: exp.startDate || exp.StartDate || "",
      endDate: exp.endDate || exp.EndDate || "",
      descriptions: exp.bullets?.length
        ? exp.bullets
        : exp.description
        ? (typeof exp.description === "string" ? exp.description.split("\n").filter(Boolean) : exp.description)
        : exp.descriptions || [],
    })),
    education: (raw.education || raw.Education || []).map((edu: any) => ({
      degree: edu.degree || edu.Degree || "",
      institution: edu.school || edu.School || edu.institution || edu.Institution || "",
      location: edu.location || edu.Location || "",
      startDate: edu.startDate || edu.StartDate || "",
      endDate: edu.endDate || edu.EndDate || edu.year || "",
      gpa: edu.gpa || "",
    })),
    skills: {
      skills: groupSkillsFromFlat(raw.skills || raw.Skills || []),
    },
    sections: raw.sections || [],
  };

  return mapped;
}

function groupSkillsFromFlat(skills: any[]): ResumeSkillGroups {
  if (!Array.isArray(skills) || skills.length === 0) return {};
  // If already grouped object format, return as-is
  if (skills.length > 0 && typeof skills[0] === "string") {
    return { "Skills": skills };
  }
  // Flat SkillItem[] → grouped by category or "Key Skills"
  const grouped: ResumeSkillGroups = {};
  for (const skill of skills) {
    const name = skill.name || skill.Name || "";
    if (!name) continue;
    const category = "Key Skills";
    if (!grouped[category]) grouped[category] = [];
    grouped[category].push(name);
  }
  return grouped;
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

// --- AI Resume Tailoring Functions ---

import type {
  ExtractedJobData,
  TailorResumePayload,
  TailoredResume,
} from "@/types/resume";

/**
 * Send a job posting text to the backend for AI extraction of key requirements.
 */
export async function extractJobPosting(
  jobPostingText: string,
  purpose: string
): Promise<ExtractedJobData> {
  const response = await apiRequest("/api/resume/extract-job-posting", {
    method: "POST",
    data: { jobPostingText, purpose },
  });
  return response.data || response;
}

/**
 * Tailor an existing resume to match extracted job requirements.
 */
export async function tailorResume(
  payload: TailorResumePayload
): Promise<TailoredResume> {
  const response = await apiRequest("/api/resume/tailor", {
    method: "POST",
    data: payload,
  });
  return response.data || response;
}
