/**
 * tafurfede/formmaps-platform#405/#406 — every template's HTML preview must print
 * section headings in the UI language only, with the stored "Summary" section
 * shown as the summary (not as an English body section).
 */
import { render, act } from "@testing-library/react";

// @react-pdf/renderer ships ESM jest can't parse; the HTML previews only need
// StyleSheet/Font at module load.
jest.mock("@react-pdf/renderer", () => {
  const Passthrough = ({ children }: { children?: unknown }) => children ?? null;
  return {
    StyleSheet: { create: (s: unknown) => s },
    Font: { register: jest.fn() },
    Document: Passthrough,
    Page: Passthrough,
    View: Passthrough,
    Text: Passthrough,
    Link: Passthrough,
    Image: Passthrough,
  };
});
import i18n from "@/lib/i18n";
import { ClassicTemplatePreview } from "../ClassicTemplate";
import { CreativeTemplatePreview } from "../CreativeTemplate";
import { ExecutiveTemplatePreview } from "../ExecutiveTemplate";
import { MinimalTemplatePreview } from "../MinimalTemplate";
import { ModernTemplatePreview } from "../ModernTemplate";
import { TechTemplatePreview } from "../TechTemplate";

const data = {
  careerField: "",
  template: "classic",
  personalInfo: { fullName: "Valentina Rojas", email: "v@x.co", phone: "", location: "San José", linkedin: "", website: "", summary: "" },
  experience: [{ id: "e", jobTitle: "Volunteer", company: "Hospital", location: "", startDate: "2024", endDate: "", current: true, description: ["Read to patients"] }],
  education: [{ id: "d", degree: "High School Diploma", institution: "Colegio", location: "", graduationDate: "2026", gpa: "" }],
  skills: [{ id: "s", name: "Teamwork", category: "Key Skills", level: "intermediate" }],
  customFields: [],
  dynamicSections: [
    { id: "1", type: "custom", title: "Summary", entries: [], description: "Compassionate student." },
    { id: "2", type: "projects", title: "Projects", entries: [{ id: "p", name: "Club", title: "Club", description: "Led drives" }] },
    { id: "3", type: "custom", title: "Languages", entries: [], description: "Spanish (Native)" },
  ],
};

const ENGLISH_HEADINGS = /\b(SUMMARY|PROJECTS|LANGUAGES|TECHNICAL SKILLS|KEY SKILLS)\b/i;

const templates = {
  ClassicTemplatePreview,
  CreativeTemplatePreview,
  ExecutiveTemplatePreview,
  MinimalTemplatePreview,
  ModernTemplatePreview,
  TechTemplatePreview,
};

describe("resume template previews in Spanish", () => {
  beforeEach(async () => {
    await act(async () => {
      await i18n.changeLanguage("es");
    });
  });
  afterEach(async () => {
    await act(async () => {
      await i18n.changeLanguage("en");
    });
  });

  it.each(Object.entries(templates))("%s prints no English section headings", (_name, Template) => {
    const { container } = render(<Template data={data as never} />);
    const headings = Array.from(container.querySelectorAll("h1,h2,h3,h4"))
      .map((h) => h.textContent || "")
      .join(" | ");
    expect(headings).not.toMatch(ENGLISH_HEADINGS);
  });
});
