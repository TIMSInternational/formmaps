import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { VocationalEvaluator } from "../VocationalEvaluator";
import * as svc from "@/services/vocationalTakeService";

// Resolve real English copy so text/role-name queries match what users see.
jest.mock("react-i18next", () => {
  const en = require("@/lib/i18n/locales/en/common.json");
  const get = (k: string) => k.split(".").reduce((o: unknown, p: string) => (o == null ? o : (o as Record<string, unknown>)[p]), en);
  return {
    useTranslation: () => ({
      t: (k: string, opts?: Record<string, unknown>) => {
        const v = get(k);
        if (typeof v !== "string") return k;
        return opts ? v.replace(/\{\{(\w+)\}\}/g, (_m, n) => String(opts[n] ?? `{{${n}}}`)) : v;
      },
      i18n: { language: "en" },
    }),
  };
});

jest.mock("@/services/vocationalTakeService");
const getForm = svc.getVocationalForm as jest.Mock;
const submit = svc.submitVocationalAnswers as jest.Mock;

beforeEach(() => jest.clearAllMocks());

it("loads the questionnaire and renders the first question", async () => {
  getForm.mockResolvedValue({ group: "teacher", evaluatorName: "T", studentName: "Stu",
    questions: [{ number: 1, type: "likert", scaleAnchors: ["a","b","c","d","e"], options: null, text: "Q1", block: "dimension", area: null, dimensionKey: "d" }] });
  render(<VocationalEvaluator token="tok" language="english" />);
  await waitFor(() => expect(screen.getByText("Q1")).toBeInTheDocument());
});

it("shows the already-completed state", async () => {
  getForm.mockResolvedValue({ completed: true, questions: [] });
  render(<VocationalEvaluator token="tok" language="english" />);
  await waitFor(() => expect(screen.getByText(/already|completado|submitted/i)).toBeInTheDocument());
});

it("blocks submit until every question is answered", async () => {
  getForm.mockResolvedValue({ group: "teacher", questions: [
    { number: 1, type: "open", scaleAnchors: null, options: null, text: "Q1", block: "open", area: null, dimensionKey: null },
    { number: 2, type: "open", scaleAnchors: null, options: null, text: "Q2", block: "open", area: null, dimensionKey: null },
  ] });
  render(<VocationalEvaluator token="tok" language="english" />);
  await waitFor(() => screen.getByText("Q1"));
  const boxes = screen.getAllByRole("textbox");
  fireEvent.change(boxes[0], { target: { value: "only one answered" } });
  fireEvent.click(screen.getByRole("button", { name: /submit|enviar|finish/i }));
  await new Promise((r) => setTimeout(r, 0));
  expect(submit).not.toHaveBeenCalled();
});

it("submits answered questions as typed answers", async () => {
  getForm.mockResolvedValue({ group: "teacher", questions: [
    { number: 1, type: "open", scaleAnchors: null, options: null, text: "Tell us", block: "open", area: null, dimensionKey: null } ] });
  submit.mockResolvedValue({ ok: true, count: 1 });
  render(<VocationalEvaluator token="tok" language="english" />);
  await waitFor(() => screen.getByRole("textbox"));
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Respuesta" } });
  fireEvent.click(screen.getByRole("button", { name: /submit|enviar|finish/i }));
  await waitFor(() => expect(submit).toHaveBeenCalledWith("tok", [{ questionNumber: 1, type: "open", textValue: "Respuesta" }]));
});
