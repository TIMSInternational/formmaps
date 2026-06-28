import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { VocationalEvaluator } from "../VocationalEvaluator";
import * as svc from "@/services/vocationalTakeService";

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
