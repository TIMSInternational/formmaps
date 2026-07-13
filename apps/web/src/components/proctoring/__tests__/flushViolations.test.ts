import { flushViolations, installViolationFlush } from "../flushViolations";
import type { LockdownViolation } from "../types";

const V: LockdownViolation[] = [{ type: "tab_switch", timestamp: "2026-07-13T00:00:00.000Z" }];

describe("flushViolations", () => {
  let sendBeacon: jest.Mock;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    sendBeacon = jest.fn(() => true);
    fetchMock = jest.fn(() => Promise.resolve({ ok: true }));
    Object.defineProperty(navigator, "sendBeacon", { configurable: true, value: sendBeacon });
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it("uses sendBeacon for token-scoped (beacon) endpoints with the drained payload", () => {
    const sent = flushViolations({ url: "/evaluation/vocational/tok/violations", transport: "beacon", drain: () => V });
    expect(sent).toBe(true);
    expect(sendBeacon).toHaveBeenCalledTimes(1);
    const [url, blob] = sendBeacon.mock.calls[0];
    expect(url).toBe("/evaluation/vocational/tok/violations");
    expect(blob).toBeInstanceOf(Blob);
  });

  it("uses keepalive fetch with the auth header for authed endpoints", () => {
    flushViolations({
      url: "/api/pcaexam/session/s1/violations",
      transport: "keepalive",
      drain: () => V,
      token: () => "jwt-abc",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/pcaexam/session/s1/violations");
    expect(init.method).toBe("POST");
    expect(init.keepalive).toBe(true);
    expect(init.credentials).toBe("include");
    expect(init.headers.Authorization).toBe("Bearer jwt-abc");
    expect(JSON.parse(init.body)).toEqual({ violations: V });
  });

  it("falls back to keepalive fetch when sendBeacon refuses (returns false)", () => {
    sendBeacon.mockReturnValue(false);
    const sent = flushViolations({ url: "/evaluation/vocational/tok/violations", transport: "beacon", drain: () => V });
    expect(sent).toBe(true);
    expect(sendBeacon).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1); // fell back
  });

  it("requeues the drained violations when the keepalive send is rejected", async () => {
    fetchMock.mockReturnValue(Promise.reject(new Error("network")));
    const requeue = jest.fn();
    flushViolations({ url: "/api/pcaexam/session/s1/violations", transport: "keepalive", drain: () => V, requeue });
    await Promise.resolve();
    await Promise.resolve();
    expect(requeue).toHaveBeenCalledWith(V);
  });

  it("sends nothing when the buffer is empty", () => {
    const sent = flushViolations({ url: "/x", transport: "beacon", drain: () => [] });
    expect(sent).toBe(false);
    expect(sendBeacon).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("flushes on pagehide and visibilitychange->hidden, and cleans up its listeners", () => {
    const drain = jest.fn(() => V);
    const cleanup = installViolationFlush({ url: "/x", transport: "beacon", drain });

    window.dispatchEvent(new Event("pagehide"));
    expect(sendBeacon).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(sendBeacon).toHaveBeenCalledTimes(2);

    cleanup();
    window.dispatchEvent(new Event("pagehide"));
    expect(sendBeacon).toHaveBeenCalledTimes(2);
  });
});
