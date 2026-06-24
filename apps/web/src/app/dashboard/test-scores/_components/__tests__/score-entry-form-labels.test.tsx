import { render, screen } from "@testing-library/react";
import { DynamicFields } from "../score-entry-form";
import { emptyForm, type FormState } from "../score-helpers";

// Render the DynamicFields sub-component (part of ScoreEntryForm)
// to test that range labels render with real Unicode en-dashes (U+2013).
describe("ScoreEntryForm labels", () => {
  it("renders SAT Math label with real en-dash (200–800)", () => {
    const form: FormState = { ...emptyForm, testType: "SAT" };
    const onChangeMock = jest.fn();
    render(<DynamicFields form={form} onChange={onChangeMock} />);

    // The label should be "SAT Math (200–800)" with a real en-dash (U+2013)
    const label = screen.getByText("SAT Math (200–800)");
    expect(label).toBeInTheDocument();
  });

  it("renders SAT Reading & Writing label with real en-dash (200–800)", () => {
    const form: FormState = { ...emptyForm, testType: "SAT" };
    const onChangeMock = jest.fn();
    render(<DynamicFields form={form} onChange={onChangeMock} />);

    const label = screen.getByText("SAT Reading & Writing (200–800)");
    expect(label).toBeInTheDocument();
  });

  it("renders ACT English label with real en-dash (1–36)", () => {
    const form: FormState = { ...emptyForm, testType: "ACT" };
    const onChangeMock = jest.fn();
    render(<DynamicFields form={form} onChange={onChangeMock} />);

    const label = screen.getByText("English (1–36)");
    expect(label).toBeInTheDocument();
  });

  it("renders ACT Math label with real en-dash (1–36)", () => {
    const form: FormState = { ...emptyForm, testType: "ACT" };
    const onChangeMock = jest.fn();
    render(<DynamicFields form={form} onChange={onChangeMock} />);

    const label = screen.getByText("Math (1–36)");
    expect(label).toBeInTheDocument();
  });

  it("renders ACT Reading label with real en-dash (1–36)", () => {
    const form: FormState = { ...emptyForm, testType: "ACT" };
    const onChangeMock = jest.fn();
    render(<DynamicFields form={form} onChange={onChangeMock} />);

    const label = screen.getByText("Reading (1–36)");
    expect(label).toBeInTheDocument();
  });

  it("renders ACT Science label with real en-dash (1–36)", () => {
    const form: FormState = { ...emptyForm, testType: "ACT" };
    const onChangeMock = jest.fn();
    render(<DynamicFields form={form} onChange={onChangeMock} />);

    const label = screen.getByText("Science (1–36)");
    expect(label).toBeInTheDocument();
  });

  it("renders AP Score label with real en-dash (1–5)", () => {
    const form: FormState = { ...emptyForm, testType: "AP" };
    const onChangeMock = jest.fn();
    render(<DynamicFields form={form} onChange={onChangeMock} />);

    const label = screen.getByText("Score (1–5)");
    expect(label).toBeInTheDocument();
  });
});
