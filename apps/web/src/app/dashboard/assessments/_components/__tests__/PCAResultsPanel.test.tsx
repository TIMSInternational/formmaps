import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import PCAResultsPanel from "@/app/dashboard/assessments/_components/PCAResultsPanel";
import {
  getPCAResult,
  getPCACompetences,
  getPCAVsJCAAnalysis,
} from "@/services/pcaService";
import { getCareerInformeBlob } from "@/services/careerInformeService";

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_k: string, d?: string) => d ?? _k,
    i18n: { language: "es" },
  }),
}));
jest.mock("@/services/pcaService", () => ({
  ...jest.requireActual("@/services/pcaService"),
  getPCAResult: jest.fn(),
  getPCACompetences: jest.fn(),
  getPCAVsJCAAnalysis: jest.fn(),
}));
jest.mock("@/services/careerInformeService", () => ({
  getCareerInformeBlob: jest.fn(),
}));
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const mockGetCareerInformeBlob = getCareerInformeBlob as jest.Mock;

const mockResult = getPCAResult as jest.Mock;
const mockCompetences = getPCACompetences as jest.Mock;
const mockAnalysis = getPCAVsJCAAnalysis as jest.Mock;

describe("PCAResultsPanel", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockResult.mockResolvedValue({
      perNom: "Test Student",
      perEmail: "s@t.dev",
      perGen: "M",
      pcaDom: 37, pcaInf: 35, pcaEst: 60, pcaCum: 75,
      pcaDom2: 56, pcaInf2: 31, pcaEst2: 50, pcaCum2: 87,
      pcaDom3: 50, pcaInf3: 37, pcaEst3: 56, pcaCum3: 81,
    });
    mockCompetences.mockResolvedValue({
      perNom: "Test Student",
      pcaFec: "05/06/2026",
      pcaCmps: [
        { cmpNom: "TRABAJO EN EQUIPO", level: 2 },
        { cmpNom: "TOMA DE DECISIONES", level: 1 },
        { cmpNom: "MANEJO DEL TIEMPO", level: 3 },
      ],
    });
    mockAnalysis.mockResolvedValue({
      jcaCodExt: "GTCML",
      pcaCod: "pca-1",
      repLink: "https://timshr.com/core/api/Pca/PdfReport?CoKey=SECRET-COKEY&PcaCod=pca-1",
      val: 45,
    });
  });

  it("renders competences as a formatted list, not raw JSON", async () => {
    render(<PCAResultsPanel pcaCod="pca-1" userId="u1" onClose={() => {}} />);
    await screen.findByText("Test Student"); // wait for initial results load
    fireEvent.click(screen.getByText("dashboard.competences")); // t() mock returns keys

    expect(await screen.findByText("TRABAJO EN EQUIPO")).toBeInTheDocument();
    // no raw-JSON dump
    expect(document.querySelector("pre")).toBeNull();
    expect(screen.queryByText(/pcaCmps/)).toBeNull();
  });

  it("renders the JCA match percentage and never exposes the vendor CoKey", async () => {
    render(<PCAResultsPanel pcaCod="pca-1" userId="u1" onClose={() => {}} />);
    await screen.findByText("Test Student"); // wait for initial results load
    fireEvent.click(screen.getByText("dashboard.jcaAnalysis")); // t() mock returns keys

    await waitFor(() => expect(mockAnalysis).toHaveBeenCalled());
    expect(await screen.findByText(/45%/)).toBeInTheDocument();
    expect(document.querySelector("pre")).toBeNull();
    expect(document.body.innerHTML).not.toContain("SECRET-COKEY");
  });

  describe("Career Informe download button", () => {
    it("renders the informe download button when results are loaded (completion signal)", async () => {
      render(<PCAResultsPanel pcaCod="pca-1" userId="u1" onClose={() => {}} />);
      await screen.findByText("Test Student");
      // Button should appear once results data is present
      expect(await screen.findByText("informe.download")).toBeInTheDocument();
    });

    it("calls getCareerInformeBlob with userId and lang, toasts success on click", async () => {
      const fakeBlob = new Blob(["pdf"], { type: "application/pdf" });
      mockGetCareerInformeBlob.mockResolvedValue(fakeBlob);

      // Mock URL.createObjectURL / revokeObjectURL
      const mockCreate = jest.fn(() => "blob:fake-url");
      const mockRevoke = jest.fn();
      const origCreate = global.URL.createObjectURL;
      const origRevoke = global.URL.revokeObjectURL;
      global.URL.createObjectURL = mockCreate;
      global.URL.revokeObjectURL = mockRevoke;

      // Mock anchor click without recursive document.createElement call
      const mockClick = jest.fn();
      const mockAnchor = { href: "", download: "", click: mockClick } as unknown as HTMLAnchorElement;
      const origCreateElement = document.createElement.bind(document);
      const createSpy = jest.spyOn(document, "createElement").mockImplementation((tag: string, ...rest) => {
        if (tag === "a") return mockAnchor;
        return origCreateElement(tag, ...rest as [ElementCreationOptions?]);
      });

      const { toast } = await import("sonner");

      render(<PCAResultsPanel pcaCod="pca-1" userId="u1" onClose={() => {}} />);
      await screen.findByText("Test Student");

      const btn = await screen.findByText("informe.download");
      fireEvent.click(btn);

      await waitFor(() => expect(mockGetCareerInformeBlob).toHaveBeenCalledWith("u1", "es"));
      await waitFor(() => expect(toast.success).toHaveBeenCalledWith("informe.downloaded"));
      expect(mockClick).toHaveBeenCalled();
      expect(mockRevoke).toHaveBeenCalledWith("blob:fake-url");

      createSpy.mockRestore();
      global.URL.createObjectURL = origCreate;
      global.URL.revokeObjectURL = origRevoke;
    });

    it("is not rendered when results have not loaded yet", () => {
      // Hang the getPCAResult promise — results will never arrive
      mockResult.mockReturnValue(new Promise(() => {}));
      render(<PCAResultsPanel pcaCod="pca-1" userId="u1" onClose={() => {}} />);
      expect(screen.queryByText("informe.download")).toBeNull();
    });
  });
});
