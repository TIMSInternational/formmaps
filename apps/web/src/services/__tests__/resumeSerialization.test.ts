import type { ResumeData } from "@/store/useGlobalStore";
import {
  toApiResume,
  fromApiResume,
  type ApiResumePayload,
} from "@/services/resumeSerialization";

const sampleData: ResumeData = {
  careerField: "technology",
  template: "classic",
  personalInfo: {
    fullName: "Jane Doe",
    email: "jane@example.com",
    phone: "555-1234",
    location: "New York, NY",
    linkedin: "in/janedoe",
    website: "jane.dev",
    summary: "Project Manager with 4 years of experience.",
  },
  experience: [
    {
      id: "exp-1",
      jobTitle: "Project Manager",
      company: "Acme Corp",
      location: "New York, NY",
      startDate: "Jan 2020",
      endDate: "Dec 2022",
      current: false,
      description: ["Led cross-functional teams.", "Cut delivery time 30%."],
    },
  ],
  education: [
    {
      id: "edu-1",
      degree: "B.S. Computer Science",
      institution: "MIT",
      location: "Cambridge, MA",
      graduationDate: "2019",
      gpa: "3.9",
    },
  ],
  skills: [
    { id: "s1", name: "React", category: "technical", level: "expert" },
    { id: "s2", name: "Leadership", category: "soft", level: "advanced" },
  ],
  customFields: [],
  dynamicSections: [],
};

describe("toApiResume — emits the backend column contract", () => {
  it("nests personal info + summary under personalInfo (never top-level `personal`/`summary`)", () => {
    const api = toApiResume(sampleData);
    expect(api.personalInfo.fullName).toBe("Jane Doe");
    expect(api.personalInfo.email).toBe("jane@example.com");
    expect(api.personalInfo.summary).toBe(
      "Project Manager with 4 years of experience."
    );
    // The bug: the store used to send `personal` + top-level `summary`, which the
    // PUT allow-list drops, so personalInfo never persisted.
    expect((api as unknown as Record<string, unknown>).personal).toBeUndefined();
    expect((api as unknown as Record<string, unknown>).summary).toBeUndefined();
  });

  it("serializes skills as a FLAT array (not a nested {skills:{}} object)", () => {
    const api = toApiResume(sampleData);
    expect(Array.isArray(api.skills)).toBe(true);
    expect(api.skills.map((s) => s.name)).toEqual(["React", "Leadership"]);
    expect(api.skills.map((s) => s.category)).toEqual(["technical", "soft"]);
  });

  it("maps experience.jobTitle/description -> title/descriptions[]", () => {
    const api = toApiResume(sampleData);
    expect(api.experience[0].title).toBe("Project Manager");
    expect(api.experience[0].company).toBe("Acme Corp");
    expect(api.experience[0].descriptions).toEqual([
      "Led cross-functional teams.",
      "Cut delivery time 30%.",
    ]);
  });
});

describe("save -> reload round-trip is lossless for personal info + skills", () => {
  it("fromApiResume(toApiResume(data)) preserves the meaningful content", () => {
    const api = toApiResume(sampleData);
    // simulate what the backend stores + returns
    const stored = { id: "resume-123", ...api } as unknown as ApiResumePayload & {
      id: string;
    };
    const resume = fromApiResume(stored);

    expect(resume.personal.fullName).toBe("Jane Doe");
    expect(resume.personal.email).toBe("jane@example.com");
    expect(resume.summary).toBe("Project Manager with 4 years of experience.");

    const skillNames = Object.values(resume.skills.skills).flat();
    expect(skillNames).toEqual(
      expect.arrayContaining(["React", "Leadership"])
    );

    expect(resume.experience[0].title).toBe("Project Manager");
    expect(resume.experience[0].descriptions).toEqual([
      "Led cross-functional teams.",
      "Cut delivery time 30%.",
    ]);
    expect(resume.education[0].institution).toBe("MIT");
    expect(resume.education[0].degree).toBe("B.S. Computer Science");
  });
});

describe("fromApiResume carries original-file metadata", () => {
  it("passes through hasOriginal + originalFileType", () => {
    const r = fromApiResume({
      id: "r1",
      personalInfo: { fullName: "Jane" },
      experience: [],
      education: [],
      skills: [],
      hasOriginal: true,
      originalFileType: "pdf",
    } as never);
    expect(r.hasOriginal).toBe(true);
    expect(r.originalFileType).toBe("pdf");
  });
});
