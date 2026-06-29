import { render, screen, fireEvent } from "@testing-library/react";
import { VocationalQuestionCard, VocationalAnswerValue } from "../VocationalQuestionCard";
import type { VocationalQuestionItem } from "@/services/vocationalTakeService";

// Resolve real English copy (with {{var}} interpolation) so aria-label/text
// queries match what users see.
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

const q = (over: Partial<VocationalQuestionItem>): VocationalQuestionItem => ({
  number: 1, block: "dimension", type: "likert", area: null, dimensionKey: "d", scaleAnchors: null, options: null, text: "Q?", ...over,
});
function capture() { const calls: VocationalAnswerValue[] = []; return { calls, onChange: (v: VocationalAnswerValue) => calls.push(v) }; }

describe("VocationalQuestionCard", () => {
  it("likert: renders scaleAnchors labels and emits ratingValue", () => {
    const { onChange, calls } = capture();
    render(<VocationalQuestionCard question={q({ type: "likert", scaleAnchors: ["Nada","Poco","Medio","Alto","Muy alto"] })} value={undefined} onChange={onChange} />);
    expect(screen.getByText(/Muy alto/)).toBeInTheDocument();
    fireEvent.click(screen.getByText(/Nada/));
    expect(calls.at(-1)).toEqual({ ratingValue: 1 });
  });

  it("multi_select: toggles selectedValues", () => {
    const { onChange, calls } = capture();
    render(<VocationalQuestionCard question={q({ type: "multi_select", options: [{ value: "a", labelEs: "Banca" }, { value: "b", labelEs: "Salud" }] })} value={{ selectedValues: [] }} onChange={onChange} />);
    fireEvent.click(screen.getByText("Banca"));
    expect(calls.at(-1)).toEqual({ selectedValues: ["a"] });
  });

  it("single_select: emits the chosen value in textValue", () => {
    const { onChange, calls } = capture();
    render(<VocationalQuestionCard question={q({ type: "single_select", options: [{ value: "analitico", labelEs: "Analítico" }] })} value={undefined} onChange={onChange} />);
    fireEvent.click(screen.getByText("Analítico"));
    expect(calls.at(-1)).toEqual({ textValue: "analitico" });
  });

  it("open: emits textValue", () => {
    const { onChange, calls } = capture();
    render(<VocationalQuestionCard question={q({ type: "open" })} value={undefined} onChange={onChange} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Hola" } });
    expect(calls.at(-1)).toEqual({ textValue: "Hola" });
  });

  it("ranking: moving an item down produces sequential ranks", () => {
    const { onChange, calls } = capture();
    render(<VocationalQuestionCard question={q({ type: "ranking", options: [{ value: "x", labelEs: "X" }, { value: "y", labelEs: "Y" }] })} value={undefined} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText(/move X down/i));
    expect(calls.at(-1)).toEqual({ rankingOrder: [{ value: "y", rank: 1 }, { value: "x", rank: 2 }] });
  });
});
