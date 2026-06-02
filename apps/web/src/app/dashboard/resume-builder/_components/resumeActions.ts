import { apiRequest } from "@/lib/api/apiClient";
import type { TailoredResume, ExtractedJobData } from "@/types/resume";
import type { Resume } from "@/services/resumeService";

export interface ChangeDecision {
  section: string;
  index?: number;
  accepted: boolean;
}

export function initDecisions(
  tailored: TailoredResume,
  originalExpCount: number
): ChangeDecision[] {
  const d: ChangeDecision[] = [
    { section: "summary", accepted: true },
    { section: "skills", accepted: true },
  ];
  const count = Math.max(originalExpCount, tailored.tailoredExperience.length);
  for (let i = 0; i < count; i++) {
    d.push({ section: "experience", index: i, accepted: true });
  }
  return d;
}

export function buildResumeDataForAI(
  baseResume: Resume | null,
  user: { name?: string | null; email?: string | null } | null
) {
  if (baseResume) {
    return {
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
    };
  }
  return {
    personalInfo: {
      fullName: user?.name || "",
      email: user?.email || "",
      summary: "",
    },
    experience: [],
    education: [],
    skills: [],
  };
}

export function computeOriginalScore(
  resumeDataForAI: ReturnType<typeof buildResumeDataForAI>,
  extractedJob: ExtractedJobData
): number {
  const skills = Array.isArray(resumeDataForAI.skills)
    ? resumeDataForAI.skills
    : [];
  const allJobKw = [
    ...(extractedJob.requiredSkills || []),
    ...(extractedJob.industryKeywords || []),
  ];
  const unique = [...new Set(allJobKw.map((k) => k.toLowerCase()))];
  const matched = unique.filter((kw) =>
    skills.some(
      (s) => s.toLowerCase().includes(kw) || kw.includes(s.toLowerCase())
    )
  );
  const kwRatio = unique.length > 0 ? matched.length / unique.length : 0;
  return Math.round(kwRatio * 70 + 10) / 10;
}

export async function downloadTailoredPDF(
  tailoredResume: TailoredResume,
  baseResume: Resume,
  decisions: ChangeDecision[]
): Promise<void> {
  const { pdf } = await import("@react-pdf/renderer");
  const { createPDFDocument } = await import("./PDFTemplateRenderer");

  const summaryAccepted =
    decisions.find((d) => d.section === "summary")?.accepted ?? true;
  const skillsAccepted =
    decisions.find((d) => d.section === "skills")?.accepted ?? true;

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
      const accepted =
        decisions.find((d) => d.section === "experience" && d.index === i)
          ?.accepted ?? true;
      const orig = baseResume.experience?.[i];
      return {
        id: crypto.randomUUID(),
        jobTitle: accepted ? exp.title : (orig?.title || exp.title),
        company: exp.company,
        location: orig?.location || "",
        startDate: orig?.startDate || "",
        endDate: orig?.endDate || "",
        current: false,
        description: accepted
          ? exp.descriptions
          : (orig?.descriptions || exp.descriptions),
      };
    }),
    education: (baseResume.education || []).map((edu) => ({
      id: crypto.randomUUID(),
      degree: edu.degree,
      institution: edu.institution,
      location: edu.location,
      graduationDate: edu.endDate,
    })),
    skills: (
      skillsAccepted
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
}

export async function createTailoredResume(
  tailoredResume: TailoredResume,
  baseResume: Resume,
  decisions: ChangeDecision[],
  extractedJob: ExtractedJobData | null,
  user: { name?: string | null; email?: string | null } | null
): Promise<void> {
  const summaryAccepted =
    decisions.find((d) => d.section === "summary")?.accepted ?? true;
  const skillsAccepted =
    decisions.find((d) => d.section === "skills")?.accepted ?? true;

  const getTailoredExp = (origCompany: string, origIndex: number) => {
    return (
      tailoredResume.tailoredExperience?.find((t) =>
        t.company
          .toLowerCase()
          .includes(origCompany.toLowerCase().split(" ")[0])
      ) ||
      tailoredResume.tailoredExperience?.[origIndex] ||
      null
    );
  };

  const resumeName = `${extractedJob?.jobTitle || "Tailored"}${extractedJob?.company ? ` - ${extractedJob.company}` : ""}`.slice(
    0,
    200
  );

  const mergedExperience = (baseResume.experience || []).map((orig, i) => {
    const tailored = getTailoredExp(orig.company, i);
    const accepted =
      decisions.find((d) => d.section === "experience" && d.index === i)
        ?.accepted ?? true;
    const bullets =
      accepted && tailored ? tailored.descriptions : orig.descriptions;
    return {
      id: crypto.randomUUID(),
      company: orig.company || "Company",
      position:
        (accepted && tailored ? tailored.title : orig.title) || "Position",
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
      email:
        baseResume.personal?.email || user?.email || "email@example.com",
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
    skills: (
      skillsAccepted
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

  await apiRequest("/api/resume", {
    method: "POST",
    data: payload,
    retries: 0,
  });
}
