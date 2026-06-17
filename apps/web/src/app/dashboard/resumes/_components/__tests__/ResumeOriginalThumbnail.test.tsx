import { render, screen, waitFor, act } from "@testing-library/react";
import { ResumeOriginalThumbnail } from "../ResumeOriginalThumbnail";
import { getOriginalUrl } from "@/services/resumeService";

// jsdom can't run canvas/pdf.js workers, so mock both the service and pdfjs-dist.
jest.mock("@/services/resumeService", () => ({
  getOriginalUrl: jest.fn(),
}));

const getDocument = jest.fn();
const renderPage = jest.fn();
const getPage = jest.fn();
const destroy = jest.fn();

jest.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: { workerSrc: "" },
  getDocument: (...args: unknown[]) => getDocument(...args),
}));

// pdfWorker uses `import.meta.url` (ESM-only) which ts-jest's CommonJS
// transform can't parse — mock it out.
jest.mock("../pdfWorker", () => ({
  configurePdfWorker: jest.fn(),
}));

const mockedGetOriginalUrl = getOriginalUrl as jest.MockedFunction<typeof getOriginalUrl>;

// IntersectionObserver isn't in jsdom — install a controllable stub that fires
// immediately on observe so the lazy code path runs in tests.
class MockIntersectionObserver implements IntersectionObserver {
  readonly root: Element | null = null;
  readonly rootMargin: string = "";
  readonly thresholds: ReadonlyArray<number> = [];
  private cb: IntersectionObserverCallback;
  constructor(cb: IntersectionObserverCallback) {
    this.cb = cb;
  }
  observe = (target: Element) => {
    // Fire as "in view" synchronously.
    this.cb(
      [{ isIntersecting: true, target } as IntersectionObserverEntry],
      this,
    );
  };
  unobserve = jest.fn();
  disconnect = jest.fn();
  takeRecords = () => [];
}

beforeEach(() => {
  jest.clearAllMocks();
  (globalThis as unknown as { IntersectionObserver: typeof IntersectionObserver }).IntersectionObserver =
    MockIntersectionObserver as unknown as typeof IntersectionObserver;

  // jsdom has no 2D canvas context — stub it so the render path proceeds.
  HTMLCanvasElement.prototype.getContext = jest
    .fn()
    .mockReturnValue({}) as unknown as HTMLCanvasElement["getContext"];

  // Default pdf.js happy-path: one page that "renders" successfully.
  renderPage.mockReturnValue({ promise: Promise.resolve() });
  getPage.mockResolvedValue({
    getViewport: () => ({ width: 100, height: 130 }),
    render: renderPage,
  });
  getDocument.mockReturnValue({
    promise: Promise.resolve({ numPages: 1, getPage, destroy }),
  });
});

const Fallback = <div data-testid="fallback">typeset</div>;

describe("ResumeOriginalThumbnail", () => {
  it("renders the fallback when getOriginalUrl resolves null", async () => {
    mockedGetOriginalUrl.mockResolvedValue(null);

    await act(async () => {
      render(<ResumeOriginalThumbnail resumeId="r1" fallback={Fallback} />);
    });

    await waitFor(() => {
      expect(screen.getByTestId("fallback")).toBeInTheDocument();
    });
    expect(getDocument).not.toHaveBeenCalled();
  });

  it("renders the original (calls pdf.js getDocument) and not the fallback when a URL resolves", async () => {
    mockedGetOriginalUrl.mockResolvedValue("https://s3.amazonaws.com/original.pdf");

    await act(async () => {
      render(<ResumeOriginalThumbnail resumeId="r1" fallback={Fallback} />);
    });

    await waitFor(() => {
      expect(getDocument).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(getPage).toHaveBeenCalledWith(1);
    });
    expect(screen.queryByTestId("fallback")).not.toBeInTheDocument();
  });

  it("falls back when pdf.js throws during render", async () => {
    mockedGetOriginalUrl.mockResolvedValue("https://s3.amazonaws.com/original.pdf");
    getDocument.mockReturnValue({ promise: Promise.reject(new Error("boom")) });

    await act(async () => {
      render(<ResumeOriginalThumbnail resumeId="r1" fallback={Fallback} />);
    });

    await waitFor(() => {
      expect(screen.getByTestId("fallback")).toBeInTheDocument();
    });
  });
});
