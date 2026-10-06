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

const mockPush = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush }) }));

beforeEach(() => mockPush.mockClear());

function mkProctoring(over: Partial<Proctoring> = {}): Proctoring {
  return {
    mode: "enforce",
    active: true,
    elapsedTime: "00:01:23",
    needsFullscreenPrompt: false,
    focusLost: false,
    multiDisplay: false,
    fullscreenUnavailable: false,
    enterFullscreen: jest.fn(),
    begin: jest.fn(),
    end: jest.fn(),
    exit: jest.fn(),
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

  describe("screenshot-deterrent watermark", () => {
    it("tiles the watermark (>=4 nodes) with the email when `watermark` is passed", () => {
      render(
        <ProctoredShell proctoring={mkProctoring()} watermark={{ email: "s@e.st" }}>
          <div data-testid="runner">exam</div>
        </ProctoredShell>,
      );
      const tiles = screen.getAllByText(
        (_content, el) => !!el && el.tagName.toLowerCase() === "span" && (el.textContent ?? "").includes("s@e.st"),
      );
      expect(tiles.length).toBeGreaterThanOrEqual(4);

      const overlay = tiles[0].closest('[aria-hidden="true"]');
      expect(overlay).not.toBeNull();
      expect(overlay).toHaveClass("pointer-events-none");
      expect(overlay).toHaveClass("select-none");
    });

    it("omits the watermark entirely when `watermark` is not passed", () => {
      render(
        <ProctoredShell proctoring={mkProctoring()}>
          <div data-testid="runner">exam</div>
        </ProctoredShell>,
      );
      expect(screen.queryByText(/s@e\.st/)).not.toBeInTheDocument();
    });
  });

  describe("Save and exit (#391)", () => {
    it.each([
      ["second display", { multiDisplay: true }],
      ["fullscreen", { needsFullscreenPrompt: true }],
      ["focus lost", { focusLost: true }],
    ])("the %s overlay offers Save and exit → exit() then /dashboard/assessments", (_name, over) => {
      const exit = jest.fn();
      render(
        <ProctoredShell proctoring={mkProctoring({ ...over, exit })}>
          <div data-testid="runner">exam</div>
        </ProctoredShell>,
      );
      fireEvent.click(screen.getByRole("button", { name: /Save and exit/i }));
      expect(exit).toHaveBeenCalledTimes(1);
      expect(mockPush).toHaveBeenCalledWith("/dashboard/assessments");
    });

    it("honours a custom exitHref (e.g. unauthenticated external evaluator)", () => {
      render(
        <ProctoredShell proctoring={mkProctoring({ focusLost: true })} exitHref="/">
          <div>exam</div>
        </ProctoredShell>,
      );
      fireEvent.click(screen.getByRole("button", { name: /Save and exit/i }));
      expect(mockPush).toHaveBeenCalledWith("/");
    });

    it("the multi-display overlay explains docked laptops", () => {
      render(
        <ProctoredShell proctoring={mkProctoring({ multiDisplay: true })}>
          <div>exam</div>
        </ProctoredShell>,
      );
      expect(screen.getByText(/close the lid or mirror your displays/i)).toBeInTheDocument();
    });
  });

  it("shows a non-blocking banner (no overlay) when fullscreen is unavailable", () => {
    render(
      <ProctoredShell proctoring={mkProctoring({ fullscreenUnavailable: true })}>
        <div data-testid="runner">exam</div>
      </ProctoredShell>,
    );
    expect(screen.getByRole("status")).toHaveTextContent(/fullscreen isn.t available/i);
    expect(screen.queryByRole("button", { name: /Enter fullscreen/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Save and exit/i })).not.toBeInTheDocument();
  });
});
