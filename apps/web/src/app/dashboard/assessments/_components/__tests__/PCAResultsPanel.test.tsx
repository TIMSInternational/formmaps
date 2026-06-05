import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import PCAResultsPanel from "@/app/dashboard/assessments/_components/PCAResultsPanel";
import {
  getPCAResult,
  getPCACompetences,
  getPCAVsJCAAnalysis,
} from "@/services/pcaService";

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (_k: string, d?: string) => d ?? _k }),
}));
jest.mock("@/services/pcaService", () => ({
  ...jest.requireActual("@/services/pcaService"),
  getPCAResult: jest.fn(),
  getPCACompetences: jest.fn(),
  getPCAVsJCAAnalysis: jest.fn(),
}));

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
});
