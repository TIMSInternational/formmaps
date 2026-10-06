import { render, screen } from "@testing-library/react";
import i18n from "@/lib/i18n";
import { AssessmentGate } from "../AssessmentGate";

const progress = {
  pcaAssessment: { status: "completed" },
  milAssessment: { status: "in_progress" },
  evaluationAssessment: { status: "not_started" },
  personalityAssessment: { key: "personality", gating: true, status: "not_started", hasAccess: true },
} as never;

describe("AssessmentGate (#398)", () => {
  afterEach(async () => {
    await i18n.changeLanguage("en");
  });

  it("lists all 4 required instruments with LIA naming and N/4", async () => {
    await i18n.changeLanguage("en");
    render(<AssessmentGate progress={progress} unlocks="careers" />);
    expect(screen.getByText("1/4 completed")).toBeInTheDocument();
    expect(
      screen.getByText(/Finish all 4 assessments \(PCA, LIA, 360°, and Personality\)/),
    ).toBeInTheDocument();
    for (const name of ["PCA Assessment", "LIA Assessment", "360° Evaluation", "Personality Assessment"]) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
    expect(screen.queryByText(/MIL/)).toBeNull();
    // CTA continues the first unfinished instrument (LIA, in progress)
    expect(screen.getByRole("link", { name: /Continue Assessment/ })).toHaveAttribute("href", "/dashboard/assessments/lia");
  });

  it("renders in Spanish for the university gate", async () => {
    await i18n.changeLanguage("es");
    render(<AssessmentGate progress={progress} unlocks="universities" />);
    expect(screen.getByText("Completa tus evaluaciones")).toBeInTheDocument();
    expect(screen.getByText("1/4 completadas")).toBeInTheDocument();
    expect(screen.getByText(/\(PCA, LIA, 360° y Personalidad\)/)).toBeInTheDocument();
    expect(screen.getByText("Evaluación de Personalidad")).toBeInTheDocument();
  });
});
