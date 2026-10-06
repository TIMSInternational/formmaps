/**
 * tafurfede/formmaps-platform#406 — the live preview was a blank dark frame for
 * ~2 s (EN) and 4–8 s (ES) after load. Causes:
 *  - react-pdf's <PDFViewer> was keyed on section counts AND the UI language,
 *    so every change destroyed the iframe and Chrome re-initialised its PDF
 *    plugin (the dark frame) from scratch;
 *  - the template loader effect depended on `t`, whose identity changes every
 *    time the language is (re)applied — in Spanish that swapped the viewer for a
 *    spinner and back, re-rendering from zero;
 *  - nothing was shown meanwhile.
 * Now: a skeleton shows immediately; the PDF is rendered to a blob off-screen
 * and swapped in only once loaded, so the visible page is never torn down.
 */
import { render, screen, act, fireEvent, waitFor } from "@testing-library/react";
import i18n from "@/lib/i18n";

const mockPdf = jest.fn();
jest.mock("@react-pdf/renderer", () => {
  const Passthrough = ({ children }: { children?: unknown }) => children ?? null;
  return {
    pdf: (doc: unknown) => mockPdf(doc),
    StyleSheet: { create: (s: unknown) => s },
    Font: { register: jest.fn() },
    Document: Passthrough,
    Page: Passthrough,
    View: Passthrough,
    Text: Passthrough,
    Link: Passthrough,
    Image: Passthrough,
  };
});

let mockData: Record<string, unknown>;
jest.mock("@/store/useGlobalStore", () => ({
  useGlobalStore: () => ({ resumeBuilder: { data: mockData } }),
}));

import { LivePreviewPDF } from "../LivePreviewPDF";

let urlCount = 0;
beforeAll(() => {
  URL.createObjectURL = jest.fn(() => `blob:pdf-${++urlCount}`);
  URL.revokeObjectURL = jest.fn();
});

beforeEach(() => {
  mockPdf.mockReset();
  mockPdf.mockImplementation(() => ({ toBlob: () => Promise.resolve(new Blob(["%PDF"])) }));
  mockData = {
    template: "classic",
    careerField: "",
    personalInfo: { fullName: "Valentina", email: "", phone: "", location: "", linkedin: "", website: "", summary: "" },
    experience: [],
    education: [],
    skills: [],
    dynamicSections: [],
  };
});

afterEach(async () => {
  await act(async () => {
    await i18n.changeLanguage("en");
  });
});

function frames() {
  return Array.from(document.querySelectorAll("iframe"));
}

describe("LivePreviewPDF", () => {
  it("shows a page skeleton immediately, before react-pdf has loaded", () => {
    render(<LivePreviewPDF />);
    expect(screen.getByTestId("resume-preview-skeleton")).toBeInTheDocument();
  });

  it("keeps the skeleton until the rendered PDF has loaded, then reveals it", async () => {
    render(<LivePreviewPDF />);
    await waitFor(() => expect(frames()).toHaveLength(1));
    expect(screen.getByTestId("resume-preview-skeleton")).toBeInTheDocument();
    fireEvent.load(frames()[0]);
    expect(screen.queryByTestId("resume-preview-skeleton")).not.toBeInTheDocument();
    expect(frames()[0].className).not.toMatch(/opacity-0/);
  });

  it("does not tear down the visible PDF when the UI language changes", async () => {
    render(<LivePreviewPDF />);
    await waitFor(() => expect(frames()).toHaveLength(1));
    fireEvent.load(frames()[0]);
    const visible = frames()[0];

    await act(async () => {
      await i18n.changeLanguage("es");
    });
    // re-rendered off-screen in Spanish, while the current page stays up
    await waitFor(() => expect(frames()).toHaveLength(2));
    expect(frames()).toContain(visible);
    expect(visible.className).not.toMatch(/opacity-0/);
    expect(screen.queryByTestId("resume-preview-skeleton")).not.toBeInTheDocument();
    expect(screen.queryByText(/Loading PDF preview|Cargando/i)).not.toBeInTheDocument();

    // the fresh page replaces it once loaded — without re-creating its iframe
    const incoming = frames().find((f) => f !== visible)!;
    fireEvent.load(incoming);
    expect(frames()).toEqual([incoming]);
    expect(incoming.className).not.toMatch(/opacity-0/);
  });

  it("reveals the PDF even if the browser never fires the iframe load event", async () => {
    jest.useFakeTimers();
    try {
      render(<LivePreviewPDF />);
      await act(async () => {
        await jest.advanceTimersByTimeAsync(500);
      });
      expect(frames()).toHaveLength(1);
      await act(async () => {
        await jest.advanceTimersByTimeAsync(4000);
      });
      expect(screen.queryByTestId("resume-preview-skeleton")).not.toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
  });
});
