import { apiClient, apiRequest } from "@/lib/api/apiClient";
import {
  getChildProgress,
  getChildResults,
  getChildReportBlob,
  getParentNotifications,
  getMyParents,
  getStudentParents,
  inviteMyParent,
  inviteParentToStudent,
  resendMyParentInvite,
  resendParentInvite,
  toStudentParentLink,
} from "@/services/parentPortalService";

jest.mock("@/lib/api/apiClient", () => ({ apiRequest: jest.fn(), apiClient: { request: jest.fn() } }));
const mockApiRequest = apiRequest as jest.Mock;
const mockClientRequest = apiClient.request as jest.Mock;

// Audit 2026-10-09 E1: parents read their child's results and download the career report.
describe("child results + report", () => {
  beforeEach(() => jest.clearAllMocks());

  it("getChildResults reads the parent-scoped results route in the page language", async () => {
    const data = { student: { id: "stu-1", name: "Kid", gradeLevel: "11", schoolName: null }, generatedAt: "x", assessments: [], report: { available: false } };
    mockApiRequest.mockResolvedValue({ success: true, data });
    await expect(getChildResults("stu-1", "en")).resolves.toEqual(data);
    expect(mockApiRequest).toHaveBeenCalledWith("/api/v1/parent/children/stu-1/results?lang=en");
  });

  it("getChildReportBlob downloads the parent-scoped PDF as a blob", async () => {
    const blob = new Blob(["%PDF"]);
    mockClientRequest.mockResolvedValue({ data: blob });
    await expect(getChildReportBlob("stu-1", "es")).resolves.toBe(blob);
    expect(mockClientRequest).toHaveBeenCalledWith({
      url: "/api/v1/parent/children/stu-1/report/pdf?lang=es", method: "GET", responseType: "blob",
    });
  });
});

// batch-1 fix/broken-pages: the API returns a nested shape; the page reads a
// flat one. Without the mapping the page showed a blank name, "undefined/
// undefined" credits, and a permanent "At Risk".
describe("getChildProgress flattens the nested API shape", () => {
  beforeEach(() => jest.clearAllMocks());

  it("maps student/creditProgress/assessments/isOnTrack to the flat summary", async () => {
    mockApiRequest.mockResolvedValue({
      data: {
        student: { id: "stu-1", name: "Kid Student", gradeLevel: 11 },
        gpa: 3.4,
        isOnTrack: true,
        creditProgress: { earned: 18, required: 24, percentage: 75 },
        assessments: {
          pca: { completed: true },
          mil: { completed: 5, total: 5 },
          evaluation360: { completed: 2, total: 3 },
        },
      },
    });

    const p = await getChildProgress("stu-1");
    expect(p.studentName).toBe("Kid Student");
    expect(p.gradeLevel).toBe(11);
    expect(p.gpa).toBe(3.4);
    expect(p.isOnTrack).toBe(true);
    expect(p.creditsEarned).toBe(18);
    expect(p.creditsRequired).toBe(24);
    expect(p.creditPercentage).toBe(75);
    // pca done + mil done (5/5), 360 not fully done (2/3) → 2 of 3
    expect(p.assessmentStatus).toEqual({ completed: 2, total: 3 });
  });

  it("defaults safely when the API omits fields (new student, no At-Risk)", async () => {
    mockApiRequest.mockResolvedValue({
      data: { student: { id: "stu-2", name: "New Kid", gradeLevel: 9 }, gpa: null },
    });
    const p = await getChildProgress("stu-2");
    expect(p.studentName).toBe("New Kid");
    expect(p.isOnTrack).toBe(true);
    expect(p.gpa).toBeNull(); // null → page shows "N/A", not a misleading "0.00"
    expect(p.creditsEarned).toBe(0);
    expect(p.assessmentStatus).toEqual({ completed: 0, total: 3 });
  });
});

// formmaps#93. GET /parent/notifications answers with a paginated envelope —
// `{ data: { data: [...], total, page, limit } }` — but the service returned
// `res.data`, i.e. the envelope, while declaring `Promise<ParentNotification[]>`.
// The page's `Array.isArray(...) ? ... : []` guard then swallowed it whole and
// rendered "all caught up" no matter how many notifications the parent had.
describe("getParentNotifications unwraps the paginated envelope", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns the rows, not the envelope", async () => {
    mockApiRequest.mockResolvedValue({
      data: {
        data: [
          { id: "n-1", title: "New grade", message: "Math posted", type: "grade", isRead: false, createdDate: "2026-08-01T10:00:00Z" },
          { id: "n-2", title: "Meeting", message: "Thursday 3pm", type: "meeting", isRead: true, createdDate: "2026-07-30T10:00:00Z" },
        ],
        total: 2,
        page: 1,
        limit: 20,
      },
    });

    const rows = await getParentNotifications();
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.map((n) => n.id)).toEqual(["n-1", "n-2"]);
    // The two fields the type used to get wrong: the row carries `message` and
    // `createdDate`, never `body` or `createdAt`.
    expect(rows[0].message).toBe("Math posted");
    expect(rows[0].createdDate).toBe("2026-08-01T10:00:00Z");
  });

  it("still works if the endpoint is ever flattened to a bare array", async () => {
    mockApiRequest.mockResolvedValue({ data: [{ id: "n-1" }] });
    expect(await getParentNotifications()).toHaveLength(1);
  });

  it("returns [] rather than a non-array when there is nothing to show", async () => {
    mockApiRequest.mockResolvedValue({ data: { data: [], total: 0 } });
    expect(await getParentNotifications()).toEqual([]);
    mockApiRequest.mockResolvedValue({});
    expect(await getParentNotifications()).toEqual([]);
  });
});

// audit 2026-10-09 C8b / C9 — parent invites: the link is emailed (never returned), the
// student route reads { parentEmail, parentName, relation }, and the counselor panel uses the
// caseload-checked routes instead of the school-admin ones (which 403 for counselors).
describe("parent invite service calls", () => {
  beforeEach(() => jest.clearAllMocks());

  it("student invite sends the field names the route reads and returns { id, emailSent }", async () => {
    mockApiRequest.mockResolvedValue({ success: true, data: { id: "l-1", emailSent: true } });
    const r = await inviteMyParent({ name: "Mom", email: "mom@x.com", relationship: "mother", message: "hi" });
    expect(mockApiRequest).toHaveBeenCalledWith("/api/v1/student/parents/invite", {
      method: "POST",
      data: { parentEmail: "mom@x.com", parentName: "Mom", relation: "mother" },
    });
    expect(r).toEqual({ id: "l-1", emailSent: true });
  });

  it("student resend returns { emailSent }", async () => {
    mockApiRequest.mockResolvedValue({ success: true, data: { emailSent: false } });
    expect(await resendMyParentInvite("l-1")).toEqual({ emailSent: false });
    expect(mockApiRequest).toHaveBeenCalledWith("/api/v1/student/parents/l-1/resend", { method: "POST" });
  });

  it("maps the student list's raw link rows to the panel shape", async () => {
    mockApiRequest.mockResolvedValue({
      success: true,
      data: [
        { id: "a", parentEmail: "a@x.com", parentName: "A", relation: "father", isAccepted: true, createdDate: "2026-01-01" },
        { id: "b", parentEmail: "b@x.com", parentName: "B", relation: "mother", isAccepted: false, tokenExpiresAt: "2000-01-01T00:00:00Z" },
        { id: "c", parentEmail: "c@x.com", parentName: "", relation: "guardian", isAccepted: false, tokenExpiresAt: "2999-01-01T00:00:00Z" },
      ],
    });
    const rows = await getMyParents();
    expect(rows.map((r) => [r.id, r.email, r.name, r.relationship, r.status])).toEqual([
      ["a", "a@x.com", "A", "father", "accepted"],
      ["b", "b@x.com", "B", "mother", "expired"],
      ["c", "c@x.com", "", "guardian", "pending"],
    ]);
  });

  it("passes rows already in the panel shape through unchanged", () => {
    const row = { id: "x", name: "N", email: "n@x.com", relationship: "other" as const, status: "pending" as const, invitedAt: "t" };
    expect(toStudentParentLink(row)).toBe(row);
  });

  it("counselor scope lists via the caseload-checked counselor route", async () => {
    mockApiRequest.mockResolvedValue({ success: true, data: [] });
    await getStudentParents("s-1", "counselor");
    expect(mockApiRequest).toHaveBeenCalledWith("/api/v1/counselor/students/s-1/parents");
  });

  it("counselor scope invites via POST /parent/invite with the student id in the body", async () => {
    mockApiRequest.mockResolvedValue({ success: true, data: { id: "l-1", emailSent: true } });
    const r = await inviteParentToStudent({ studentId: "s-1", name: "Mom", email: "mom@x.com", relationship: "mother" }, "counselor");
    expect(mockApiRequest).toHaveBeenCalledWith("/api/v1/parent/invite", {
      method: "POST",
      data: { studentId: "s-1", parentEmail: "mom@x.com", parentName: "Mom", relation: "mother" },
    });
    expect(r).toEqual({ id: "l-1", emailSent: true });
  });

  it("counselor scope resends via POST /parent/:id/resend", async () => {
    mockApiRequest.mockResolvedValue({ success: true, data: { emailSent: true } });
    await resendParentInvite("s-1", "l-1", "counselor");
    expect(mockApiRequest).toHaveBeenCalledWith("/api/v1/parent/l-1/resend", { method: "POST" });
  });

  it("school-admin scope is unchanged by default", async () => {
    mockApiRequest.mockResolvedValue({ success: true, data: [] });
    await getStudentParents("s-1");
    expect(mockApiRequest).toHaveBeenCalledWith("/api/v1/school-admin/students/s-1/parents");
    mockApiRequest.mockResolvedValue({ success: true, data: { emailSent: true } });
    await resendParentInvite("s-1", "l-1");
    expect(mockApiRequest).toHaveBeenLastCalledWith("/api/v1/school-admin/students/s-1/parents/l-1/resend", { method: "POST" });
  });
});
