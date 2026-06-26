import { render, screen, waitFor } from "@testing-library/react";
import { VocationalReport } from "../VocationalReport";
import * as svc from "@/services/vocationalReportService";

jest.mock("@/services/vocationalReportService");
const r360 = svc.recompute360 as jest.Mock;
const rInt = svc.recomputeIntegrated as jest.Mock;

beforeEach(() => jest.clearAllMocks());

const readyScore = { status: "ready", composite: 80, band: "strong", respondentCount: 2, groupsIncluded: ["self", "parent"],
  dimensionScores: [{ key: "d1", nameEs: "Intereses", score: 75, band: "moderateHigh", byGroup: { self: 80 } }],
  rankings: { interests: [{ value: "ing", points: 20 }], industries: [], workType: null, openInsights: [] } };

it("recomputes 360 before integrated, then renders", async () => {
  const order: string[] = [];
  r360.mockImplementation(async () => { order.push("360"); return readyScore; });
  rInt.mockImplementation(async () => { order.push("int"); return { status: "ready", integratedComposite: 84.1, band: "strong", threeSixtyScore: 80, pcaScore: 90, milScore: 80, weightsApplied: { threeSixty: 0.4, pca: 0.3, mil: 0.3 } }; });
  render(<VocationalReport evaluatedUserId="stu1" />);
  await waitFor(() => expect(screen.getByText(/84.1/)).toBeInTheDocument());
  expect(order).toEqual(["360", "int"]);
  expect(screen.getByText("Intereses")).toBeInTheDocument();
});

it("renders dimensions but no integrated headline when integration not_ready", async () => {
  r360.mockResolvedValue(readyScore);
  rInt.mockResolvedValue({ status: "not_ready", missing: ["mil"] });
  render(<VocationalReport evaluatedUserId="stu1" />);
  await waitFor(() => expect(screen.getByText("Intereses")).toBeInTheDocument());
  expect(screen.getAllByText(/unlock|complete/i).length).toBeGreaterThan(0);
});

it("shows an error state with retry when recompute throws", async () => {
  r360.mockRejectedValue(new Error("boom"));
  render(<VocationalReport evaluatedUserId="stu1" />);
  await waitFor(() => expect(screen.getAllByText(/couldn't load|error|try again/i).length).toBeGreaterThan(0));
});
