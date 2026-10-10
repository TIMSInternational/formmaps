/**
 * Audit 2026-10-09 D4: reminders / 360 setup for more than 100 students used to send one request the API refuses
 * (both backends cap a batch at 100). The service now sends batches of 100 and adds the counts up.
 */
import { sendReminders, setup360, ASSESSMENT_COMMAND_BATCH } from "@/services/assessmentCommandService";
import { apiRequest } from "@/lib/api/apiClient";

jest.mock("@/lib/api/apiClient", () => ({ apiRequest: jest.fn() }));
const api = apiRequest as jest.Mock;

const ids = (n: number) => Array.from({ length: n }, (_, i) => `s${i}`);

beforeEach(() => api.mockReset());

describe("sendReminders", () => {
  it("splits 250 students into requests of at most 100 and sums the counts", async () => {
    api.mockImplementation((_path: string, opts: { data: { studentIds: string[] } }) =>
      Promise.resolve({ success: true, data: { sent: opts.data.studentIds.length - 1, failed: 1, total: opts.data.studentIds.length } }));

    const result = await sendReminders(ids(250), ["pca"]);

    expect(ASSESSMENT_COMMAND_BATCH).toBe(100);
    expect(api).toHaveBeenCalledTimes(3);
    const sizes = api.mock.calls.map((c) => c[1].data.studentIds.length);
    expect(sizes).toEqual([100, 100, 50]);
    expect(new Set(api.mock.calls.flatMap((c) => c[1].data.studentIds)).size).toBe(250);
    expect(api.mock.calls.every((c) => c[1].data.assessmentTypes[0] === "pca")).toBe(true);
    expect(result).toEqual({ sent: 247, failed: 3, total: 250 });
  });

  it("sends a single request for 100 students or fewer", async () => {
    api.mockResolvedValue({ data: { sent: 100, failed: 0, total: 100 } });
    await sendReminders(ids(100), ["pca"]);
    expect(api).toHaveBeenCalledTimes(1);
  });
});

describe("setup360", () => {
  it("batches a selection over 100 and sums created / skipped / emailsSent", async () => {
    api.mockImplementation((_p: string, opts: { data: { studentIds: string[] } }) =>
      Promise.resolve({ data: { created: opts.data.studentIds.length, skipped: 0, emailsSent: 1, studentsProcessed: opts.data.studentIds.length } }));

    const result = await setup360(ids(201));

    expect(api).toHaveBeenCalledTimes(3);
    expect(result).toEqual({ created: 201, skipped: 0, emailsSent: 3, studentsProcessed: 201 });
  });

  it("a whole grade (no ids) is one request the server resolves", async () => {
    api.mockResolvedValue({ data: { created: 5, skipped: 0, emailsSent: 5, studentsProcessed: 5 } });
    await setup360(undefined, 10);
    expect(api).toHaveBeenCalledTimes(1);
    expect(api.mock.calls[0][1].data).toEqual({ studentIds: undefined, gradeLevel: 10 });
  });
});
