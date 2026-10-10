/**
 * Audit 2026-10-09 D4: the counselor Sessions page asked for 100 sessions (clamped to 50), read counts the API never
 * returns, and dropped rescheduled sessions from Upcoming.
 */
import {
  getAllMyCounselorSessions, getAllStudentCounselorSessions, sessionCounts, isUpcomingSession, SESSIONS_PAGE_MAX, UPCOMING_SESSION_STATUSES,
} from "@/services/counselorSessionService";
import { apiRequest } from "@/lib/api/apiClient";

jest.mock("@/lib/api/apiClient", () => ({ apiRequest: jest.fn() }));
const api = apiRequest as jest.Mock;

const paged = (total: number) => (url: string) => {
  const q = new URLSearchParams(url.split("?")[1]);
  const page = Number(q.get("page")); const limit = Number(q.get("limit"));
  const start = (page - 1) * limit;
  const data = Array.from({ length: Math.max(0, Math.min(limit, total - start)) }, (_, i) => ({ id: `x${start + i}`, status: "confirmed" }));
  return Promise.resolve({ success: true, data: { data, total, page, limit, totalPages: Math.ceil(total / limit) } });
};

beforeEach(() => api.mockReset());

it("reads every counselor session 50 at a time", async () => {
  api.mockImplementation(paged(130));
  const rows = await getAllMyCounselorSessions();
  expect(SESSIONS_PAGE_MAX).toBe(50);
  expect(rows).toHaveLength(130);
  expect(api).toHaveBeenCalledTimes(3);
  expect(api.mock.calls.every(([u]) => u.startsWith("/api/v1/counselor/me/sessions?") && u.includes("limit=50"))).toBe(true);
});

it("reads every student counselor session 50 at a time", async () => {
  api.mockImplementation(paged(51));
  expect(await getAllStudentCounselorSessions()).toHaveLength(51);
  expect(api.mock.calls[0][0]).toContain("/api/v1/counselor/student/sessions?");
});

it("counts upcoming (confirmed + rescheduled), completed and cancelled from the list", () => {
  expect(UPCOMING_SESSION_STATUSES).toEqual(["confirmed", "rescheduled"]);
  const counts = sessionCounts([
    { status: "confirmed" }, { status: "rescheduled" }, { status: "completed" }, { status: "completed" }, { status: "cancelled" },
  ]);
  expect(counts).toEqual({ total: 5, upcoming: 2, completed: 2, cancelled: 1 });
});

it("does not count a confirmed session that already started as upcoming (same rule as the list and the API)", () => {
  const now = Date.parse("2026-10-10T12:00:00Z");
  const past = { status: "confirmed", startTime: "2026-10-09T12:00:00Z" };
  const future = { status: "rescheduled", startTime: "2026-10-11T12:00:00Z" };
  expect(isUpcomingSession(past, now)).toBe(false);
  expect(isUpcomingSession(future, now)).toBe(true);
  expect(isUpcomingSession({ status: "completed", startTime: "2026-10-11T12:00:00Z" }, now)).toBe(false);
  expect(sessionCounts([past, future], now).upcoming).toBe(1);
});
