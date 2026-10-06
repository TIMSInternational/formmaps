import i18n from "@/lib/i18n";

/**
 * Normalizes resume data right before a template renders it, so every template
 * prints ONE language (the UI language) and the summary comes first.
 *
 * Why: the API (upload-and-parse and ai-edit) stores the summary, projects,
 * languages and certifications as `sections` with fixed English titles
 * ("Summary", "Projects", …). Templates printed those titles verbatim in the
 * dynamic-section loop — so a Spanish resume read EDUCACIÓN … SUMMARY /
 * PROJECTS / LANGUAGES, with SUMMARY after EXPERIENCE (tafurfede/formmaps-platform#405, #406).
 *
 * Render-only: the stored data keeps its shape (the Node ai-edit route reads
 * the summary back from the "Summary" section).
 */

type SectionKey = { key: string; fallback: string };

const SUMMARY_TITLES = new Set([
  "summary",
  "professional summary",
  "profile",
  "resumen",
  "resumen profesional",
  "perfil",
  "perfil profesional",
]);

const SECTION_KEYS: Record<string, SectionKey> = {
  projects: { key: "resumeBuilder.sections.projects.title", fallback: "Projects" },
  languages: { key: "resumeBuilder.doc.languages", fallback: "Languages" },
  certifications: { key: "resumeBuilder.doc.certifications", fallback: "Certifications" },
  certificates: { key: "resumeBuilder.sections.certificates.title", fallback: "Certificates" },
  awards: { key: "resumeBuilder.sections.awards.title", fallback: "Awards" },
  courses: { key: "resumeBuilder.sections.courses.title", fallback: "Courses" },
  interests: { key: "resumeBuilder.sections.interests.title", fallback: "Interests" },
  publications: { key: "resumeBuilder.sections.publications.title", fallback: "Publications" },
  references: { key: "resumeBuilder.sections.references.title", fallback: "References" },
  organisations: { key: "resumeBuilder.sections.organisations.title", fallback: "Organisations" },
  declaration: { key: "resumeBuilder.sections.declaration.title", fallback: "Declaration" },
  skills: { key: "resumeBuilder.doc.skills", fallback: "Skills" },
};

const LANGUAGES = ["en", "es"] as const;

/** Every known stored title (in any supported language) → its section key. */
function titleIndex(): Map<string, SectionKey> {
  const index = new Map<string, SectionKey>();
  for (const entry of Object.values(SECTION_KEYS)) {
    index.set(entry.fallback.toLowerCase(), entry);
    for (const lng of LANGUAGES) {
      const translated = i18n.getFixedT(lng)(entry.key, { defaultValue: "" });
      if (translated) index.set(translated.toLowerCase(), entry);
    }
  }
  return index;
}

function normalizeTitle(title: string | undefined): string {
  return (title || "").trim().toLowerCase();
}

interface RenderSection {
  type: string;
  title: string;
  description?: string;
}

/** The slice of resume data this normalizer touches — every template's prop type satisfies it. */
interface RenderableResume {
  personalInfo: { summary?: string };
  dynamicSections?: RenderSection[];
}

type Section = RenderSection;

function isSummarySection(section: Section): boolean {
  return section.type === "summary" || SUMMARY_TITLES.has(normalizeTitle(section.title));
}

function sectionText(section: Section): string {
  if (section.description) return section.description;
  const content = (section as unknown as { content?: unknown }).content;
  return typeof content === "string" ? content : "";
}

export function prepareResumeForRender<T extends RenderableResume>(data: T): T {
  const sections: Section[] = data.dynamicSections || [];
  const summarySection = sections.find(isSummarySection);
  const index = titleIndex();

  const body = sections
    .filter((s) => !isSummarySection(s))
    .map((section) => {
      const known =
        (section.type !== "custom" ? SECTION_KEYS[section.type] : undefined) ??
        index.get(normalizeTitle(section.title));
      return known ? { ...section, title: i18n.t(known.key, { defaultValue: known.fallback }) } : section;
    });

  return {
    ...data,
    personalInfo: {
      ...data.personalInfo,
      summary: data.personalInfo?.summary || (summarySection ? sectionText(summarySection) : ""),
    },
    dynamicSections: body,
  } as T;
}

/** "Technical Skills" only when every skill really is technical; else "Skills". */
export function skillsHeadingKey(skills: ReadonlyArray<{ category: string }>): string {
  return skills.length > 0 && skills.every((s) => s.category === "technical")
    ? "resumeBuilder.doc.technicalSkills"
    : "resumeBuilder.doc.skills";
}
