/**
 * Ported tims subtest renderers: each renders its stimulus from real bank
 * data and fires the exact tims answer value on interaction — the contract
 * the golden-verified scoring engine expects.
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { PatternRecognitionItem } from "../subtests/PatternRecognitionItem";
import { VerbalReasoningItem } from "../subtests/VerbalReasoningItem";
import { NumericalSpeedItem } from "../subtests/NumericalSpeedItem";
import { WorkingMemoryItem } from "../subtests/WorkingMemoryItem";
import { VisualRotationItem } from "../subtests/VisualRotationItem";

describe("PatternRecognitionItem", () => {
  it("renders the 2x4 letter grid and fires the count as a string", () => {
    const onAnswer = jest.fn();
    render(
      <PatternRecognitionItem
        data={{ row1: ["q", "p", "d", "t"], row2: ["Q", "P", "D", "T"] }}
        onAnswer={onAnswer}
      />,
    );
    expect(screen.getByText("q")).toBeInTheDocument();
    expect(screen.getByText("Q")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "3" }));
    expect(onAnswer).toHaveBeenCalledWith("3");
  });
});

describe("VerbalReasoningItem", () => {
  it("renders premises + question and fires the option letter", () => {
    const onAnswer = jest.fn();
    render(
      <VerbalReasoningItem
        data={{
          premises: ["Rosa es más alta que María", "María es más alta que Elena"],
          question: "¿Quién es la más alta?",
          options: ["Rosa", "María", "Elena"],
        }}
        onAnswer={onAnswer}
      />,
    );
    expect(screen.getByText("¿Quién es la más alta?")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Rosa"));
    expect(onAnswer).toHaveBeenCalledWith("A");
  });
});

describe("NumericalSpeedItem", () => {
  it("renders the three numbers and fires the position letter", () => {
    const onAnswer = jest.fn();
    render(<NumericalSpeedItem data={{ numbers: [6, 11, 17] }} onAnswer={onAnswer} />);
    expect(screen.getByText("6")).toBeInTheDocument();
    expect(screen.getByText("17")).toBeInTheDocument();
    // Third tile = position C
    fireEvent.click(screen.getByText("17"));
    expect(onAnswer).toHaveBeenCalledWith("C");
  });
});

describe("WorkingMemoryItem", () => {
  it("renders three letters with the middle disabled and fires left/right", () => {
    const onAnswer = jest.fn();
    render(<WorkingMemoryItem data={{ letters: ["K", "N", "R"] }} onAnswer={onAnswer} />);
    expect(screen.getByText("N")).toBeInTheDocument();
    fireEvent.click(screen.getByText("R"));
    expect(onAnswer).toHaveBeenCalledWith("right");
    fireEvent.click(screen.getByText("K"));
    expect(onAnswer).toHaveBeenCalledWith("left");
  });
});

describe("VisualRotationItem", () => {
  it("applies rotate() for _90 figures and scaleX(-1) for mirrored glyphs", () => {
    const onAnswer = jest.fn();
    const { container } = render(
      <VisualRotationItem
        data={{ topRow: ["R_90", "R", "ᖉ"], bottomRow: ["R_90", "ᖉ", "ᖉ"] }}
        onAnswer={onAnswer}
      />,
    );
    const spans = Array.from(container.querySelectorAll("span")).filter((s) => s.textContent === "R");
    expect(spans.length).toBeGreaterThanOrEqual(6);
    const styles = spans.map((s) => s.getAttribute("style") || "");
    expect(styles.some((s) => s.includes("rotate(90deg)"))).toBe(true);
    expect(styles.some((s) => s.includes("scaleX(-1)"))).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "2" }));
    expect(onAnswer).toHaveBeenCalledWith("2");
  });
});
