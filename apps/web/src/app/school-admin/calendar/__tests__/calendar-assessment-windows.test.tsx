/**
 * Audit D7: the calendar's assessment windows are the shared AssessmentSchedule rows (the same
 * ones the Assessments → Schedule grid edits). Older calendar-only periods still show and delete.
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import AcademicCalendarPage from "../page";
import { apiRequest } from "@/lib/api/apiClient";

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string, d?: unknown) => (typeof d === "string" ? d : k) }),
}));
jest.mock("motion/react", () => {
  const React = jest.requireActual("react");
  const passthrough = (tag: string) => React.forwardRef(({ initial, animate, transition, ...rest }: Record<string, unknown>, ref: unknown) => React.createElement(tag, { ...rest, ref }));
  return { motion: new Proxy({}, { get: (_t, tag: string) => passthrough(tag) }) };
});
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock("@/lib/api/apiClient", () => ({ apiRequest: jest.fn() }));

const mockApi = apiRequest as jest.Mock;

beforeEach(() => {
  mockApi.mockReset().mockImplementation(async (url: string, opts?: { method?: string }) => {
    if (opts?.method) return { success: true };
    if (url.endsWith("/assessments/schedule")) return { data: [{ id: "sch-1", gradeLevel: 10, assessmentType: "PCA", startDate: "2026-11-02T00:00:00.000Z", endDate: "2026-11-13T00:00:00.000Z" }] };
    if (url.endsWith("/assessment-periods")) return { data: [{ id: "old-1", name: "Legacy window", termId: "t", assessmentTypes: ["MIL"], startDate: "2026-12-01T00:00:00.000Z", endDate: "2026-12-05T00:00:00.000Z" }] };
    return { data: [] };
  });
});

describe("calendar assessment windows", () => {
  it("lists the shared schedule rows and the older calendar periods", async () => {
    render(<AcademicCalendarPage />);
    expect(await screen.findByTestId("assessment-window-sch-sch-1")).toHaveTextContent("PCA — calendar.assessmentsSection.gradeOption");
    expect(screen.getByTestId("assessment-window-ap-old-1")).toHaveTextContent("Legacy window");
  });

  it("removing a schedule window clears it in the shared schedule", async () => {
    render(<AcademicCalendarPage />);
    const row = await screen.findByTestId("assessment-window-sch-sch-1");
    fireEvent.click(row.querySelector("button")!);
    await waitFor(() => expect(mockApi).toHaveBeenCalledWith("/api/v1/school-admin/assessments/schedule", {
      method: "PUT", data: { schedules: [{ gradeLevel: 10, assessmentType: "PCA", clear: true }] },
    }));
  });

  it("removing an older calendar period still deletes it there", async () => {
    render(<AcademicCalendarPage />);
    const row = await screen.findByTestId("assessment-window-ap-old-1");
    fireEvent.click(row.querySelector("button")!);
    await waitFor(() => expect(mockApi).toHaveBeenCalledWith("/api/v1/school-admin/calendar/assessment-periods/old-1", { method: "DELETE" }));
  });
});
