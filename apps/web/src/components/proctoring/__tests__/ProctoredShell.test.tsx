import { render, screen, fireEvent } from "@testing-library/react";
import { ProctoredShell } from "../ProctoredShell";
import type { Proctoring } from "../useProctoring";

jest.mock("react-i18next", () => {
  const en = require("@/lib/i18n/locales/en/common.json");
  const get = (k: string) => k.split(".").reduce((o: unknown, p: string) => (o == null ? o : (o as Record<string, unknown>)[p]), en);
  return {
    useTranslation: () => ({
      t: (k: string) => {
        const v = get(k);
        return typeof v === "string" ? v : k;
      },
      i18n: { language: "en" },
    }),
  };
});

function mkProctoring(over: Partial<Proctoring> = {}): Proctoring {
  return {
    active: true,
    elapsedTime: "00:01:23",
    needsFullscreenPrompt: false,
    focusLost: false,
    multiDisplay: false,
    enterFullscreen: jest.fn(),
    begin: jest.fn(),
    end: jest.fn(),
    violations: { current: [] },
    drainViolations: jest.fn(() => []),
    ...over,
  };
}

describe("ProctoredShell", () => {
  it("renders children and the timer bar when active and calm", () => {
    render(
      <ProctoredShell proctoring={mkProctoring()}>
        <div data-testid="runner">exam</div>
      </ProctoredShell>,
    );
    expect(screen.getByTestId("runner")).toBeInTheDocument();
    expect(screen.getByText("00:01:23")).toBeInTheDocument();
    expect(screen.getByText(/Secure Mode/i)).toBeInTheDocument();
  });

  it("shows the focus-lost overlay hiding the questions when focus is lost", () => {
    render(
      <ProctoredShell proctoring={mkProctoring({ focusLost: true })}>
        <div data-testid="runner">exam</div>
      </ProctoredShell>,
    );
    expect(screen.getByText(/Return to the assessment/i)).toBeInTheDocument();
  });

  it("shows the multi-display overlay when a second monitor is detected", () => {
    render(
      <ProctoredShell proctoring={mkProctoring({ multiDisplay: true })}>
        <div data-testid="runner">exam</div>
      </ProctoredShell>,
    );
    expect(screen.getByText(/Disconnect additional displays/i)).toBeInTheDocument();
  });

  it("shows a re-enter fullscreen button that calls enterFullscreen", () => {
    const enterFullscreen = jest.fn();
    render(
      <ProctoredShell proctoring={mkProctoring({ needsFullscreenPrompt: true, enterFullscreen })}>
        <div data-testid="runner">exam</div>
      </ProctoredShell>,
    );
    const btn = screen.getByRole("button", { name: /Enter fullscreen/i });
    fireEvent.click(btn);
    expect(enterFullscreen).toHaveBeenCalled();
  });

  it("renders children without chrome when inactive", () => {
    render(
      <ProctoredShell proctoring={mkProctoring({ active: false })}>
        <div data-testid="runner">exam</div>
      </ProctoredShell>,
    );
    expect(screen.getByTestId("runner")).toBeInTheDocument();
    expect(screen.queryByText(/Secure Mode/i)).not.toBeInTheDocument();
  });
});
