import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { VocationalEvaluator } from "../VocationalEvaluator";
import * as svc from "@/services/vocationalTakeService";

const mockAssessmentCompleted = jest.fn(() => Promise.resolve());
jest.mock("@/hooks/useAssessmentCompleted", () => ({ useAssessmentCompleted: () => mockAssessmentCompleted }));

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

it("shows an actionable message when the link has expired (not a bare error)", async () => {
  getForm.mockRejectedValue(Object.assign(new Error("This evaluation link has expired."), { reason: "expired" }));
  render(<VocationalEvaluator token="tok" language="english" />);
  await waitFor(() => expect(screen.getByText(/expired/i)).toBeInTheDocument());
  expect(screen.getByText(/new invitation link/i)).toBeInTheDocument();
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

it("requests the questionnaire in the UI language (English and Spanish)", async () => {
  getForm.mockResolvedValue({ group: "teacher", questions: [] });
  const { unmount } = render(<VocationalEvaluator token="tok" language="english" />);
  await waitFor(() => expect(getForm).toHaveBeenCalledWith("tok", "en"));
  unmount();
  render(<VocationalEvaluator token="tok" language="es-CO" />);
  await waitFor(() => expect(getForm).toHaveBeenLastCalledWith("tok", "es"));
});

it("re-fetches on a language change and keeps the answers already given", async () => {
  const form = (text: string) => ({ group: "teacher", questions: [
    { number: 1, type: "open", scaleAnchors: null, options: null, text, block: "open", area: null, dimensionKey: null } ] });
  getForm.mockImplementation(async (_t: string, lang: string) => form(lang === "es" ? "Cuéntanos" : "Tell us"));
  submit.mockResolvedValue({ ok: true, count: 1 });
  const { rerender } = render(<VocationalEvaluator token="tok" language="en" />);
  await waitFor(() => screen.getByText("Tell us"));
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Mi respuesta" } });

  rerender(<VocationalEvaluator token="tok" language="es" />);
  await waitFor(() => screen.getByText("Cuéntanos"));
  expect(getForm).toHaveBeenLastCalledWith("tok", "es");
  expect(screen.getByRole("textbox")).toHaveValue("Mi respuesta");

  fireEvent.click(screen.getByRole("button", { name: /submit|enviar|finish/i }));
  await waitFor(() => expect(submit).toHaveBeenCalledWith("tok", [{ questionNumber: 1, type: "open", textValue: "Mi respuesta" }]));
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

it("a successful submit says it's done and refreshes every completion reader; a failed one does not", async () => {
  getForm.mockResolvedValue({ group: "self", questions: [
    { number: 1, type: "open", scaleAnchors: null, options: null, text: "Q1", block: "open", area: null, dimensionKey: null },
  ] });
  submit.mockRejectedValueOnce(new Error("network down")).mockResolvedValueOnce({});
  const onCompleted = jest.fn(); // the page uses this to leave secure mode and return to the app
  render(<VocationalEvaluator token="tok" language="english" onCompleted={onCompleted} />);
  await waitFor(() => screen.getByText("Q1"));
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "my answer" } });

  fireEvent.click(screen.getByRole("button", { name: /submit|enviar|finish/i }));
  await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
  expect(mockAssessmentCompleted).not.toHaveBeenCalled();
  expect(onCompleted).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("button", { name: /submit|enviar|finish/i }));
  await waitFor(() => expect(mockAssessmentCompleted).toHaveBeenCalledTimes(1));
  expect(onCompleted).toHaveBeenCalledTimes(1);
  // Just finished: says so — not the "Already submitted" a returning visitor sees.
  expect(await screen.findByRole("heading", { name: "Evaluation completed" })).toBeInTheDocument();
});

describe("ranking items count as answered only after interaction (#410)", () => {
  const rankingForm = () => ({ group: "self", questions: [
    { number: 1, type: "open", scaleAnchors: null, options: null, text: "Q1", block: "open", area: null, dimensionKey: null },
    { number: 2, type: "ranking", scaleAnchors: null, options: [{ value: "x", labelEs: "X" }, { value: "y", labelEs: "Y" }], text: "Rank these", block: "ranking", area: null, dimensionKey: null },
  ] });

  it("starts the counter at 0 — the default order is not an answer", async () => {
    getForm.mockResolvedValue(rankingForm());
    render(<VocationalEvaluator token="tok" language="english" />);
    await waitFor(() => screen.getByText("Rank these"));
    expect(screen.getByText("0 of 2 answered")).toBeInTheDocument();
  });

  it("counts the ranking after an explicit 'Keep this order' confirm", async () => {
    getForm.mockResolvedValue(rankingForm());
    render(<VocationalEvaluator token="tok" language="english" />);
    await waitFor(() => screen.getByText("Rank these"));
    fireEvent.click(screen.getByRole("button", { name: /Keep this order/i }));
    expect(screen.getByText("1 of 2 answered")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Keep this order/i })).not.toBeInTheDocument();
  });

  it("counts the ranking after a reorder", async () => {
    getForm.mockResolvedValue(rankingForm());
    render(<VocationalEvaluator token="tok" language="english" />);
    await waitFor(() => screen.getByText("Rank these"));
    fireEvent.click(screen.getAllByRole("button", { name: /down/i })[0]);
    expect(screen.getByText("1 of 2 answered")).toBeInTheDocument();
  });

  it("blocks submit while a ranking is untouched", async () => {
    getForm.mockResolvedValue(rankingForm());
    render(<VocationalEvaluator token="tok" language="english" />);
    await waitFor(() => screen.getByText("Rank these"));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "answer" } });
    fireEvent.click(screen.getByRole("button", { name: /submit|enviar|finish/i }));
    await new Promise((r) => setTimeout(r, 0));
    expect(submit).not.toHaveBeenCalled();
  });
});
