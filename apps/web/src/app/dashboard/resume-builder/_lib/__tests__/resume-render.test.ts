/**
 * tafurfede/formmaps-platform#405/#406 — the resume preview mixed languages
 * (EDUCACIÓN … but SUMMARY / PROJECTS / LANGUAGES) and put SUMMARY after
 * EXPERIENCE. The API stores the summary, projects and languages as sections
 * with fixed English titles ("Summary", "Projects", "Languages"), which the
 * templates printed verbatim among the dynamic sections.
 */
import i18n from "@/lib/i18n";
import type { ResumeData } from "@/store/useGlobalStore";
import { prepareResumeForRender, skillsHeadingKey } from "../resume-render";

function resume(over: Partial<ResumeData> = {}): ResumeData {
  return {
    careerField: "",
    personalInfo: { fullName: "Valentina", email: "", phone: "", location: "", linkedin: "", website: "", summary: "" },
    experience: [],
    education: [],
    skills: [],
    customFields: [],
    dynamicSections: [
      { id: "s", type: "custom", title: "Summary", entries: [], description: "Compassionate student." },
      { id: "p", type: "projects", title: "Projects", entries: [] },
      { id: "l", type: "custom", title: "Languages", entries: [], description: "Spanish, English" },
      { id: "c", type: "custom", title: "Mi sección propia", entries: [], description: "x" },
    ],
    template: "classic",
    ...over,
  } as ResumeData;
}

describe("prepareResumeForRender", () => {
  afterEach(() => i18n.changeLanguage("en"));

  it("lifts a stored Summary section into the summary slot (rendered first) and out of the body", () => {
    const out = prepareResumeForRender(resume());
    expect(out.personalInfo.summary).toBe("Compassionate student.");
    expect(out.dynamicSections!.map((s) => s.id)).toEqual(["p", "l", "c"]);
  });

  it("keeps an explicit personal summary over the section one", () => {
    const r = resume();
    r.personalInfo.summary = "Mine";
    expect(prepareResumeForRender(r).personalInfo.summary).toBe("Mine");
  });

  it("localizes stored English section titles to the UI language, leaving custom titles alone", async () => {
    await i18n.changeLanguage("es");
    const titles = prepareResumeForRender(resume()).dynamicSections!.map((s) => s.title);
    expect(titles).toEqual(["Proyectos", "Idiomas", "Mi sección propia"]);
  });

  it("localizes Spanish-stored titles back to English", () => {
    const r = resume({
      dynamicSections: [{ id: "x", type: "custom", title: "Proyectos", entries: [] }],
    });
    expect(prepareResumeForRender(r).dynamicSections![0].title).toBe("Projects");
  });

  it("does not mutate its input", () => {
    const r = resume();
    prepareResumeForRender(r);
    expect(r.dynamicSections).toHaveLength(4);
    expect(r.personalInfo.summary).toBe("");
  });
});

describe("skillsHeadingKey", () => {
  const skill = (category: string) => ({ id: category, name: category, category, level: "intermediate" });
  it("says Technical Skills only when every skill is technical", () => {
    expect(skillsHeadingKey([skill("technical")] as ResumeData["skills"])).toBe("resumeBuilder.doc.technicalSkills");
    expect(skillsHeadingKey([skill("technical"), skill("soft")] as ResumeData["skills"])).toBe("resumeBuilder.doc.skills");
    expect(skillsHeadingKey([skill("Key Skills")] as unknown as ResumeData["skills"])).toBe("resumeBuilder.doc.skills");
  });
});
