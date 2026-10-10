/**
 * Audit F: a pending 360 for a student with no name came back as the English text "your student",
 * shown to Spanish parents and teachers. The APIs now send null and the services normalize the old
 * placeholder to null too, so the pages render their own translated fallback.
 */
import { apiRequest } from "@/lib/api/apiClient";
import { getParentPendingEvaluations } from "../parentPortalService";
import { getTeacherPendingEvaluations, namedOrNull } from "../teacherPortalService";

jest.mock("@/lib/api/apiClient", () => ({ apiRequest: jest.fn(), apiClient: { request: jest.fn() } }));
const mockApiRequest = apiRequest as jest.Mock;

const rows = [
  { evaluationId: "e1", studentName: "Ana", deadline: "2030-01-01", token: "t1" },
  { evaluationId: "e2", studentName: "your student", deadline: "2030-01-01", token: "t2" },
  { evaluationId: "e3", studentName: null, deadline: "2030-01-01", token: "t3" },
];

describe("pending evaluations: the student name is a name or null", () => {
  beforeEach(() => mockApiRequest.mockResolvedValue({ success: true, data: rows }));

  it("parent", async () => {
    expect((await getParentPendingEvaluations()).map((e) => e.studentName)).toEqual(["Ana", null, null]);
  });

  it("teacher", async () => {
    expect((await getTeacherPendingEvaluations()).map((e) => e.studentName)).toEqual(["Ana", null, null]);
  });

  it("namedOrNull", () => {
    expect(namedOrNull("")).toBeNull();
    expect(namedOrNull(undefined)).toBeNull();
    expect(namedOrNull("Luis")).toBe("Luis");
  });
});
