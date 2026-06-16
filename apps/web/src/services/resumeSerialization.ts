// Single source of truth for resume <-> API (backend column) serialization.
//
// The backend (api/src/routes/resume.ts) stores resumes by COLUMN NAME:
//   personalInfo (object incl. summary), experience[], education[], skills[] (flat),
//   sections[], fieldVisibility, customFields. Its PUT only persists those keys.
//
// Historically each writer hand-rolled its own payload; the store sent `personal`
// + top-level `summary` + a nested `skills:{skills:{}}` object, none of which the
// backend persists — so saving silently dropped personal info and wiped skills.
// Every writer must now go through `toApiResume`, and every reader through
// `fromApiResume`, which is the exact inverse.
import type { ResumeData } from "@/store/useGlobalStore";
import type { Resume } from "@/services/resumeService";

export type OriginalFileType = "pdf" | "docx" | "other";

// --- Transport contract (what the backend stores + returns) --------------------

export interface ApiExperience {
  company: string;
  location: string;
  title: string;
  startDate: string;
  endDate: string;
  descriptions: string[];
}

export interface ApiEducation {
  degree: string;
  institution: string;
  location: string;
  startDate: string;
  endDate: string;
  gpa?: string;
}

export interface ApiSkill {
  name: string;
  category?: string;
}

export interface ApiResumePayload {
  name?: string;
  template?: string;
  careerField?: string;
  personalInfo: Record<string, string>;
  experience: ApiExperience[];
  education: ApiEducation[];
  skills: ApiSkill[];
  sections?: Record<string, unknown>[];
  customFields?: unknown[];
  fieldVisibility?: Record<string, boolean>;
  hasOriginal?: boolean;
  originalFileType?: OriginalFileType;
}

// --- Raw backend shapes (field names vary: camelCase / PascalCase / legacy) -----

export interface RawExperience {
  company?: string;
  Company?: string;
  location?: string;
  Location?: string;
  position?: string;
  Position?: string;
  title?: string;
  Title?: string;
  startDate?: string;
  StartDate?: string;
  endDate?: string;
  EndDate?: string;
  bullets?: string[];
  description?: string | string[];
  descriptions?: string[];
}

export interface RawEducation {
  degree?: string;
  Degree?: string;
  school?: string;
  School?: string;
  institution?: string;
  Institution?: string;
  location?: string;
  Location?: string;
  startDate?: string;
  StartDate?: string;
  endDate?: string;
  EndDate?: string;
  year?: string;
  gpa?: string;
}

export interface RawSkillItem {
  name?: string;
  Name?: string;
  category?: string;
}

export interface RawResumeEntity {
  ID?: string;
  _id?: string;
  id?: string;
  name?: string;
  Name?: string;
  template?: string;
  Template?: string;
  personalInfo?: Record<string, string | undefined>;
  PersonalInfo?: Record<string, string | undefined>;
  summary?: string;
  experience?: RawExperience[];
  Experience?: RawExperience[];
  education?: RawEducation[];
  Education?: RawEducation[];
  skills?: (string | RawSkillItem)[];
  Skills?: (string | RawSkillItem)[];
  sections?: Record<string, unknown>[];
  createdDate?: string;
  CreatedDate?: string;
  createdAt?: string;
  updatedAt?: string;
  UpdatedAt?: string;
  hasOriginal?: boolean;
  originalFileType?: OriginalFileType;
}

// --- Read: backend entity -> in-app Resume (canonical) -------------------------

export function groupSkillsFromFlat(
  skills: (string | RawSkillItem)[]
): Record<string, string[]> {
  if (!Array.isArray(skills) || skills.length === 0) return {};
  // Already-flat string list (legacy)
  if (typeof skills[0] === "string") {
    return { "Key Skills": skills as string[] };
  }
  const grouped: Record<string, string[]> = {};
  for (const skill of skills) {
    if (typeof skill === "string") {
      (grouped["Key Skills"] ??= []).push(skill);
      continue;
    }
    const name = skill.name || skill.Name || "";
    if (!name) continue;
    const category = skill.category || "Key Skills";
    (grouped[category] ??= []).push(name);
  }
  return grouped;
}

export function fromApiResume(raw: RawResumeEntity): Resume {
  return {
    _id: raw.ID || raw._id || raw.id || "",
    name: raw.name || raw.Name || "",
    template: raw.template || raw.Template || "classic",
    createdAt: raw.createdDate || raw.CreatedDate || raw.createdAt,
    updatedAt: raw.updatedAt || raw.UpdatedAt,
    personal: {
      fullName:
        raw.personalInfo?.fullName ||
        raw.personalInfo?.name ||
        raw.PersonalInfo?.FullName ||
        "",
      email: raw.personalInfo?.email || raw.PersonalInfo?.Email || "",
      phone: raw.personalInfo?.phone || raw.PersonalInfo?.Phone || "",
      location: raw.personalInfo?.location || raw.PersonalInfo?.Location || "",
      linkedIn:
        raw.personalInfo?.linkedIn ||
        raw.personalInfo?.linkedin ||
        raw.PersonalInfo?.LinkedIn ||
        "",
      website: raw.personalInfo?.website || raw.PersonalInfo?.Website || "",
      github: raw.personalInfo?.github || "",
    },
    summary:
      raw.personalInfo?.summary ||
      raw.PersonalInfo?.Summary ||
      raw.summary ||
      "",
    experience: (raw.experience || raw.Experience || []).map((exp) => ({
      company: exp.company || exp.Company || "",
      location: exp.location || exp.Location || "",
      title: exp.position || exp.Position || exp.title || exp.Title || "",
      startDate: exp.startDate || exp.StartDate || "",
      endDate: exp.endDate || exp.EndDate || "",
      descriptions: exp.bullets?.length
        ? exp.bullets
        : exp.description
        ? typeof exp.description === "string"
          ? exp.description.split("\n").filter(Boolean)
          : exp.description
        : exp.descriptions || [],
    })),
    education: (raw.education || raw.Education || []).map((edu) => ({
      degree: edu.degree || edu.Degree || "",
      institution:
        edu.school || edu.School || edu.institution || edu.Institution || "",
      location: edu.location || edu.Location || "",
      startDate: edu.startDate || edu.StartDate || "",
      endDate: edu.endDate || edu.EndDate || edu.year || "",
      gpa: edu.gpa || "",
    })),
    skills: {
      skills: groupSkillsFromFlat(raw.skills || raw.Skills || []),
    },
    sections: raw.sections || [],
    hasOriginal: raw.hasOriginal ?? false,
    originalFileType: raw.originalFileType,
  };
}

// --- Write: in-app store ResumeData -> API payload (inverse of fromApiResume) ---

export function toApiResume(data: ResumeData): ApiResumePayload {
  // Preserve every string field on personalInfo (incl. custom fields via the
  // index signature) so nothing is silently dropped on save.
  const personalInfo: Record<string, string> = {};
  for (const [key, value] of Object.entries(data.personalInfo || {})) {
    if (typeof value === "string") personalInfo[key] = value;
  }
  // The reader prefers `linkedIn`; the store holds `linkedin`. Emit both-friendly.
  if (data.personalInfo?.linkedin && !personalInfo.linkedIn) {
    personalInfo.linkedIn = data.personalInfo.linkedin;
  }

  return {
    template: data.template,
    careerField: data.careerField,
    personalInfo,
    experience: (data.experience || []).map((exp) => ({
      company: exp.company || "",
      location: exp.location || "",
      title: exp.jobTitle || "",
      startDate: exp.startDate || "",
      endDate: exp.endDate || "",
      descriptions: Array.isArray(exp.description) ? exp.description : [],
    })),
    education: (data.education || []).map((edu) => ({
      degree: edu.degree || "",
      institution: edu.institution || "",
      location: edu.location || "",
      startDate: "",
      endDate: edu.graduationDate || "",
      gpa: edu.gpa,
    })),
    // FLAT array — the bug was a nested {skills:{}} object the reader couldn't parse.
    skills: (data.skills || []).map((s) => ({
      name: s.name,
      category: s.category,
    })),
    sections: (data.dynamicSections || []) as unknown as Record<
      string,
      unknown
    >[],
    customFields: data.customFields || [],
  };
}
