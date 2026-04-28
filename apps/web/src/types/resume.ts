export interface ExtractedJobData {
  jobTitle: string;
  company: string;
  location: string;
  employmentType: string;
  requiredSkills: string[];
  preferredSkills: string[];
  requiredQualifications: string[];
  keyResponsibilities: string[];
  industryKeywords: string[];
  experienceLevel: string;
  summary: string;
}

export interface TailorResumePayload {
  purpose: string;
  jobPostingText?: string;
  extractedRequirements?: ExtractedJobData;
  currentResume: any;
}

export interface TailoredResume {
  tailoredSummary: string;
  tailoredExperience: Array<{
    company: string;
    title: string;
    descriptions: string[];
  }>;
  tailoredSkills: string[];
  atsScore: number;
  changes: string[];
}
