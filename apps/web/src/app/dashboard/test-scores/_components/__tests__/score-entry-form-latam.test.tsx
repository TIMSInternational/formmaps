/**
 * tafurfede/formmaps-platform#400 (ported from formmaps-platform#419) — the new test types render their own inputs, in EN and ES.
 */
import { render, screen } from "@testing-library/react";
import i18n from "@/lib/i18n";
import { DynamicFields } from "../score-entry-form";
import { emptyForm, type FormState } from "../score-helpers";
import en from "@/lib/i18n/locales/en/common.json";
import es from "@/lib/i18n/locales/es/common.json";
import enStudent from "@/lib/i18n/locales/en/student.json";
import esStudent from "@/lib/i18n/locales/es/student.json";

const renderType = (testType: FormState["testType"]) =>
  render(<DynamicFields form={{ ...emptyForm, testType }} onChange={jest.fn()} />);

afterAll(async () => {
  await i18n.changeLanguage("en");
});

describe("DynamicFields — new types (EN)", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  it("PAA → one score input bounded 200–800", () => {
    renderType("PAA");
    const input = screen.getByLabelText("PAA score (200–800)");
    expect(input).toHaveAttribute("min", "200");
    expect(input).toHaveAttribute("max", "800");
  });

  it("Saber 11 → global score 0–500", () => {
    renderType("SABER11");
    const input = screen.getByLabelText("Saber 11 global score (0–500)");
    expect(input).toHaveAttribute("max", "500");
  });

  it("IELTS → band input with 0.5 step", () => {
    renderType("IELTS");
    const input = screen.getByLabelText("IELTS overall band (0–9)");
    expect(input).toHaveAttribute("step", "0.5");
    expect(input).toHaveAttribute("max", "9");
  });

  it("DELF/DALF → level + score /100", () => {
    renderType("DELF_DALF");
    expect(screen.getByText("Level (A1–C2)")).toBeInTheDocument();
    expect(screen.getByLabelText("Score (0–100)")).toHaveAttribute("max", "100");
  });

  it("Other → exam name (max 80) + score", () => {
    renderType("OTHER");
    expect(screen.getByLabelText("Exam name")).toHaveAttribute("maxLength", "80");
    expect(screen.getByLabelText("Score")).toBeInTheDocument();
  });
});

describe("DynamicFields — new types (ES)", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("es");
  });

  it("PAA label is Spanish", () => {
    renderType("PAA");
    expect(screen.getByLabelText("Puntaje PAA (200–800)")).toBeInTheDocument();
  });

  it("Other exam name label is Spanish", () => {
    renderType("OTHER");
    expect(screen.getByLabelText("Nombre del examen")).toBeInTheDocument();
  });
});

describe("locale keys", () => {
  it("every test type has an EN and ES label", () => {
    for (const k of ["SAT", "ACT", "AP", "PSAT", "TOEFL", "IB", "PAA", "SABER11", "IELTS", "DELF_DALF", "OTHER"]) {
      expect(en.studentUi.testScores.testType).toHaveProperty(k);
      expect(es.studentUi.testScores.testType).toHaveProperty(k);
    }
    expect(es.studentUi.testScores.testType.OTHER).toBe("Otro examen");
  });

  it("every validation message exists in EN and ES", () => {
    for (const k of ["paaRange", "saberRange", "ieltsRange", "delfLevel", "delfRange", "examName", "otherScore"]) {
      expect(enStudent.testScores.errors).toHaveProperty(k);
      expect(esStudent.testScores.errors).toHaveProperty(k);
    }
  });
});
