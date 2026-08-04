/**
 * webVitals.test.ts — formmaps#90.
 *
 * `web-vitals` was a dependency that nothing imported, so the app had no field
 * performance data at all and #90 could not be assessed on evidence. These pin the
 * things that would silently make the new reporting useless or harmful:
 *
 *   - double-subscription (CLS reports repeatedly as shifts accumulate, so a remount
 *     that re-subscribed would multiply every sample)
 *   - sending the full URL, which for student-scoped routes contains identifiers
 *   - rounding CLS to zero, since it is a unitless ratio well below 1
 */
jest.mock("@/services/telemetryService", () => ({ telemetry: { track: jest.fn() } }));

type Cb = (metric: { name: string; value: number; rating: string; navigationType?: string }) => void;
const subscribers: Record<string, Cb[]> = {};
const register = (name: string) => (cb: Cb) => { (subscribers[name] ??= []).push(cb); };

jest.mock("web-vitals", () => ({
  onCLS: register("CLS"),
  onINP: register("INP"),
  onLCP: register("LCP"),
  onTTFB: register("TTFB"),
  onFCP: register("FCP"),
}));

/** reportWebVitals imports web-vitals dynamically; let that microtask settle. */
const settle = () => new Promise((r) => setTimeout(r, 0));

/**
 * A FRESH module per test. reportWebVitals guards against double-subscription with
 * module-level state, which is correct in the browser but means one test consuming the
 * guard would leave every later test with no subscribers at all — the first version of
 * this file failed exactly that way.
 */
async function freshReporter() {
  jest.resetModules();
  // The track mock must come from the SAME module registry as the freshly imported
  // reporter. resetModules gives the reporter a new telemetryService instance, so a
  // mock captured before the reset is a different object and never sees the calls.
  const { telemetry } = await import("@/services/telemetryService");
  const { reportWebVitals } = await import("../webVitals");
  return { report: reportWebVitals, track: telemetry.track as jest.Mock };
}

beforeEach(() => {
  jest.clearAllMocks();
  for (const k of Object.keys(subscribers)) delete subscribers[k];
  window.history.replaceState({}, "", "/dashboard/students/stu-123?tab=grades");
});

describe("#90 web vitals reporting", () => {
  it("subscribes to all five Core Web Vitals", async () => {
    const { report } = await freshReporter();
    report();
    await settle();

    expect(Object.keys(subscribers).sort()).toEqual(["CLS", "FCP", "INP", "LCP", "TTFB"]);
  });

  it("reports a metric as a web_vital telemetry event", async () => {
    const { report, track } = await freshReporter();
    report();
    await settle();

    subscribers["LCP"][0]({ name: "LCP", value: 2418.7, rating: "needs-improvement", navigationType: "navigate" });

    expect(track).toHaveBeenCalledWith("web_vital", expect.objectContaining({
      metric: "LCP", value: 2419, rating: "needs-improvement",
    }));
  });

  it("keeps CLS precision instead of rounding it to zero", async () => {
    // CLS is a unitless ratio — 0.12 is a real regression and Math.round makes it 0.
    const { report, track } = await freshReporter();
    report();
    await settle();

    subscribers["CLS"][0]({ name: "CLS", value: 0.1234567, rating: "good" });

    expect(track.mock.calls[0][1]).toMatchObject({ metric: "CLS", value: 0.1235 });
  });

  it("sends the route PATH only, never the query string or ids", async () => {
    const { report, track } = await freshReporter();
    report();
    await settle();

    subscribers["LCP"][0]({ name: "LCP", value: 100, rating: "good" });

    const props = track.mock.calls[0][1];
    expect(props.path).toBe("/dashboard/students/stu-123");
    // The path still carries a student id by nature of the route, but the query
    // string must not ride along, and no full URL/origin should appear.
    expect(JSON.stringify(props)).not.toContain("tab=grades");
    expect(JSON.stringify(props)).not.toContain("http");
  });

  it("is idempotent — a second call does not double-subscribe", async () => {
    const { report } = await freshReporter();
    report();
    await settle();
    report();
    await settle();

    // One subscriber per metric. Two would double every CLS sample, since CLS fires
    // repeatedly as layout shifts accumulate.
    expect(subscribers["CLS"]).toHaveLength(1);
    expect(subscribers["LCP"]).toHaveLength(1);
  });

  it("never throws when web-vitals cannot be loaded", async () => {
    // It is declared as an optional dependency. Losing telemetry must not break a page.
    jest.resetModules();
    jest.doMock("web-vitals", () => { throw new Error("not installed"); });
    const { reportWebVitals: fresh } = await import("../webVitals");

    expect(() => fresh()).not.toThrow();
    await settle();
  });
});
