// checkPCAStatus used to call a PCA "completed" ONLY when the live TIMS results
// round-trip (POST /api/pcaapi/get-result) returned DISC numbers. The database row
// (pca_evaluations.isCompleted, surfaced through GET /api/v1/assessment/completion as
// pcaCompleted) was ignored, so a TIMS outage — or a dev box without PCA_COKEY — turned
// a finished PCA into "Continue PCA" on the assessments page while the dashboard card,
// driven by that same server verdict, said 4/4. This suite pins the precedence:
// server verdict → localStorage cache → TIMS → in_progress.
import { checkPCAStatus } from "@/services/pcaService";
import { apiRequest } from "@/lib/api/apiClient";

jest.mock("@/lib/api/apiClient", () => ({ apiRequest: jest.fn() }));
let currentUserId: string | undefined = "student-1";
jest.mock("@/store/useGlobalStore", () => ({
  useGlobalStore: { getState: () => ({ user: { id: currentUserId } }) },
}));

const mockApiRequest = apiRequest as jest.Mock;
const STUDENT = "student-1";
const EVALUATIONS = { success: true, data: [{ userId: STUDENT, pcaCod: "PCA-1", createdAt: "2026-01-01" }] };

function routes(overrides: Record<string, unknown | (() => unknown)>) {
  mockApiRequest.mockImplementation(async (path: string) => {
    for (const [prefix, value] of Object.entries(overrides)) {
      if (path.startsWith(prefix)) {
        const v = typeof value === "function" ? (value as () => unknown)() : value;
        if (v instanceof Error) throw v;
        return v;
      }
    }
    throw Object.assign(new Error(`unmocked ${path}`), { status: 500 });
  });
}
const calledPaths = () => mockApiRequest.mock.calls.map(([p]: [string]) => p);

beforeEach(() => {
  jest.clearAllMocks();
  currentUserId = STUDENT;
  localStorage.clear();
});

it("not_started when the user has no evaluation row — no verdict lookup needed", async () => {
  routes({ "/api/pcaapi/evaluations": { success: true, data: [] } });
  const r = await checkPCAStatus(STUDENT);
  expect(r.status).toBe("not_started");
  expect(calledPaths()).not.toContain("/api/v1/assessment/completion");
});

it("a knownCompleted hint short-circuits: completed, no verdict fetch, no TIMS call", async () => {
  routes({ "/api/pcaapi/evaluations": EVALUATIONS });
  const r = await checkPCAStatus(STUDENT, "english", true);
  expect(r.status).toBe("completed");
  expect(r.hasResults).toBe(true);
  expect(r.pcaCod).toBe("PCA-1");
  expect(calledPaths()).not.toContain("/api/v1/assessment/completion");
  expect(calledPaths().some((p) => p.startsWith("/api/pcaapi/get-result"))).toBe(false);
});

it("without a hint, the signed-in user's own verdict is fetched and wins even when TIMS 500s", async () => {
  routes({
    "/api/pcaapi/evaluations": EVALUATIONS,
    "/api/v1/assessment/completion": { success: true, data: { allDone: false, pcaCompleted: true } },
    "/api/pcaapi/get-result": () => Object.assign(new Error("Internal server error"), { status: 500 }),
  });
  const r = await checkPCAStatus(STUDENT);
  expect(r.status).toBe("completed");
  expect(calledPaths()).toContain("/api/v1/assessment/completion");
  expect(calledPaths().some((p) => p.startsWith("/api/pcaapi/get-result"))).toBe(false);
});

it("verdict says not completed → falls through to TIMS; TIMS failing → in_progress (the old behaviour, now only for genuinely unfinished PCAs)", async () => {
  routes({
    "/api/pcaapi/evaluations": EVALUATIONS,
    "/api/v1/assessment/completion": { success: true, data: { allDone: false, pcaCompleted: false } },
    "/api/pcaapi/get-result": () => Object.assign(new Error("Internal server error"), { status: 500 }),
  });
  const r = await checkPCAStatus(STUDENT);
  expect(r.status).toBe("in_progress");
  expect(r.hasResults).toBe(false);
});

it("verdict unreachable → TIMS results still count", async () => {
  routes({
    "/api/pcaapi/evaluations": EVALUATIONS,
    "/api/v1/assessment/completion": () => new Error("network down"),
    "/api/pcaapi/get-result": { success: true, data: { pcaCod: "PCA-1", pcaD1: 61 } },
  });
  const r = await checkPCAStatus(STUDENT);
  expect(r.status).toBe("completed");
});

it("for ANOTHER user the self-scoped verdict is never consulted", async () => {
  currentUserId = "counselor-9";
  routes({
    "/api/pcaapi/evaluations": EVALUATIONS,
    "/api/pcaapi/get-result": { success: true, data: { pcaCod: "PCA-1", pcaD1: 61 } },
  });
  const r = await checkPCAStatus(STUDENT);
  expect(r.status).toBe("completed");
  expect(calledPaths()).not.toContain("/api/v1/assessment/completion");
});
