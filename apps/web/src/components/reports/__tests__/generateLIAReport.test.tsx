/**
 * Guard test: generateLIAReport must NOT silently emit a dummy "Alex Johnson"
 * report when called with no data. With the dummy fallback removed it should
 * fail safe (console.error + no-op), so the PDF renderer is never invoked.
 */

const toBlob = jest.fn().mockResolvedValue(new Blob());
const pdf = jest.fn(() => ({ toBlob }));

jest.mock("@react-pdf/renderer", () => ({ pdf }));
// Avoid importing the heavy PDF component trees in jsdom.
jest.mock("../LIAReportPDF", () => ({ __esModule: true, default: () => null }));
jest.mock("../PCAReportPDF", () => ({
  __esModule: true,
  default: () => null,
  dummyPCAData: {},
}));

import { generateLIAReport } from "../reportGenerationService";

describe("generateLIAReport without data", () => {
  beforeEach(() => {
    toBlob.mockClear();
    pdf.mockClear();
  });

  it("does not render a PDF (no Alex-Johnson fallback) and does not throw", async () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    await expect(generateLIAReport(undefined)).resolves.toBeUndefined();
    expect(pdf).not.toHaveBeenCalled();
    expect(toBlob).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
