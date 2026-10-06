/**
 * tafurfede/formmaps-platform#406
 *  - the "Tailor for a software engineering role" chip was shown to every
 *    student (a health-track student here) → derive it from the student's top
 *    career match, else a generic "Tailor for my target career".
 *  - the AI editor conversation was lost on reload → persisted per resume.
 */
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import i18n from "@/lib/i18n";

jest.mock("motion/react", () => {
  const React = require("react");
  return {
    motion: {
      div: ({ children, className }: { children: React.ReactNode; className?: string }) =>
        React.createElement("div", { className }, children),
    },
    AnimatePresence: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
  };
});

const mockAiEdit = jest.fn();
jest.mock("@/services/resumeService", () => ({
  aiEditResume: (...a: unknown[]) => mockAiEdit(...a),
}));

let mockScoring: unknown = { data: undefined };
jest.mock("@/hooks/useTimsQueries", () => ({
  useTimsCareerScoring: () => mockScoring,
}));

import { AIChatEditor } from "../AIChatEditor";

beforeAll(() => {
  Element.prototype.scrollIntoView = jest.fn();
});

beforeEach(() => {
  window.localStorage.clear();
  mockAiEdit.mockReset();
  mockScoring = { data: undefined };
});

describe("AIChatEditor suggestion chips", () => {
  it("never offers the hard-coded software-engineering chip", () => {
    render(<AIChatEditor resumeId="r1" onResumeUpdated={jest.fn()} />);
    expect(screen.queryByText(/software engineering/i)).not.toBeInTheDocument();
    expect(screen.getByText("Tailor for my target career")).toBeInTheDocument();
  });

  it("tailors to the student's top career match when one exists", () => {
    mockScoring = {
      data: { data: { locked: false, careers: [{ programTitle: "Nursing", totalScore: 91 }] } },
    };
    render(<AIChatEditor resumeId="r1" onResumeUpdated={jest.fn()} />);
    expect(screen.getByText("Tailor for a Nursing role")).toBeInTheDocument();
  });

  it("ignores locked (placeholder) matches", () => {
    mockScoring = {
      data: { data: { locked: true, careers: [{ programTitle: "Nursing", totalScore: 0 }] } },
    };
    render(<AIChatEditor resumeId="r1" onResumeUpdated={jest.fn()} />);
    expect(screen.getByText("Tailor for my target career")).toBeInTheDocument();
  });
});

describe("AIChatEditor conversation persistence", () => {
  it("restores the conversation for the same resume after a reload", async () => {
    mockAiEdit.mockResolvedValue({ applied: true, changeSummary: "Summary tightened.", resume: { _id: "r1" } });
    const first = render(<AIChatEditor resumeId="r1" onResumeUpdated={jest.fn()} />);
    fireEvent.click(screen.getByText("Make my summary more impactful"));
    await screen.findByText("Summary tightened.");
    first.unmount();

    render(<AIChatEditor resumeId="r1" onResumeUpdated={jest.fn()} />);
    expect(screen.getByText("Summary tightened.")).toBeInTheDocument();
    // The chip text is also the user's sent message bubble.
    expect(screen.getAllByText("Make my summary more impactful").length).toBeGreaterThan(1);
  });

  it("keeps conversations separate per resume", async () => {
    mockAiEdit.mockResolvedValue({ applied: true, changeSummary: "Done for r1.", resume: { _id: "r1" } });
    const first = render(<AIChatEditor resumeId="r1" onResumeUpdated={jest.fn()} />);
    fireEvent.click(screen.getByText("Use stronger action verbs"));
    await screen.findByText("Done for r1.");
    first.unmount();

    render(<AIChatEditor resumeId="r2" onResumeUpdated={jest.fn()} />);
    expect(screen.queryByText("Done for r1.")).not.toBeInTheDocument();
  });

  it("survives a broken storage entry", () => {
    window.localStorage.setItem("formmaps.resumeAiChat.r1", "{not json");
    render(<AIChatEditor resumeId="r1" onResumeUpdated={jest.fn()} />);
    expect(screen.getByText(/Tell me how to improve your resume/)).toBeInTheDocument();
  });

  it("shows the greeting text (never an empty bubble) in Spanish", async () => {
    await act(async () => {
      await i18n.changeLanguage("es");
    });
    render(<AIChatEditor resumeId="r1" onResumeUpdated={jest.fn()} />);
    await waitFor(() =>
      expect(screen.getByText("Dime cómo mejorar tu currículum y lo editaré en tiempo real.")).toBeInTheDocument()
    );
    await act(async () => {
      await i18n.changeLanguage("en");
    });
  });
});
