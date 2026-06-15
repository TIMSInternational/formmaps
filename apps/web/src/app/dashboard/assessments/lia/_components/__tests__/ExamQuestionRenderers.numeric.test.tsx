import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import {
  renderNumberSequence,
  renderAnswerOptions,
} from "../ExamQuestionRenderers";
import { MILQuestion } from "@/services/milService";

// Numeric Velocity (Numérica): the backend stores `correctAnswer` as the
// POSITION index 0/1/2 (A/B/C) of the extreme furthest from the middle, and
// presents numbers in fixed A,B,C order. The renderer must therefore:
//  - show A/B/C position labels (no pre-solving "Lowest"/"Middle"/"Highest")
//  - offer 3 options and pass the POSITION index 0/1/2 to onSelect.
const numericQuestion: MILQuestion = {
  questionNumber: 1,
  questionText:
    "Find the highest and lowest numbers, then determine which extreme is furthest from the middle number.",
  type: 4,
  data: { numbers: [7, 1, 3] },
  correctAnswer: 0,
} as MILQuestion;

describe("ExamQuestionRenderers — Numeric Velocity (positional A/B/C)", () => {
  it("renders A/B/C labels and does NOT reveal Lowest/Middle/Highest", () => {
    render(<div>{renderNumberSequence(numericQuestion)}</div>);

    // Position labels are shown (one per presented number).
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.getByText("B")).toBeInTheDocument();
    expect(screen.getByText("C")).toBeInTheDocument();

    // The presented numbers are still visible.
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();

    // Pre-solving cues must be gone.
    expect(screen.queryByText("Lowest")).not.toBeInTheDocument();
    expect(screen.queryByText("Middle")).not.toBeInTheDocument();
    expect(screen.queryByText("Highest")).not.toBeInTheDocument();
  });

  it("renders 3 options and clicking the 3rd calls onSelect(2)", () => {
    const onSelect = jest.fn();
    render(
      <div>{renderAnswerOptions(numericQuestion, null, onSelect, false)}</div>
    );

    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(3);

    fireEvent.click(buttons[2]);
    expect(onSelect).toHaveBeenCalledWith(2);
  });
});
