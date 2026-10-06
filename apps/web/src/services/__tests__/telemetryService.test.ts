import { TelemetryService } from "@/services/telemetryService";

const persistAccessToken = (token: string) => {
  localStorage.setItem(
    "timcare-global-store",
    JSON.stringify({ state: { user: { accessToken: token } } })
  );
};

// Collection needs both gates open: cookie consent (init) and the account's opt-in.
const enabledService = () => {
  const service = new TelemetryService({ apiEndpoint: "/telemetry" });
  service.init();
  service.setAccountAnalytics(true);
  return service;
};

describe("TelemetryService auth handling", () => {
  beforeEach(() => {
    localStorage.clear();
    document.cookie = "logged_in=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    (global as unknown as { fetch: jest.Mock }).fetch = jest.fn();
  });

  it("does not enqueue events without an auth signal", () => {
    const service = enabledService();

    service.track("page_view", { page: "/dashboard" });

    expect(service.getQueueSize()).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("sends the persisted bearer token when flushing", async () => {
    persistAccessToken("access-token");
    const service = enabledService();
    (fetch as jest.Mock).mockResolvedValue({ ok: true, status: 200 });

    service.track("page_view", { page: "/dashboard" });
    await service.flush();

    expect(fetch).toHaveBeenCalledWith(
      "/telemetry",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer access-token" }),
      })
    );
    expect(service.getQueueSize()).toBe(0);
  });

  it("clears and disables telemetry for the session after auth failures", async () => {
    persistAccessToken("expired-token");
    const service = enabledService();
    (fetch as jest.Mock).mockResolvedValue({ ok: false, status: 401 });

    service.track("page_view", { page: "/dashboard" });
    await service.flush();
    service.track("click", { elementId: "retry" });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(service.getQueueSize()).toBe(0);
  });
});

// Issue #401: "Usage Analytics" in Settings must actually gate collection, and it is opt-in.
describe("TelemetryService consent + account opt-in gating", () => {
  beforeEach(() => {
    localStorage.clear();
    persistAccessToken("access-token");
    (global as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });
  });

  const trackBatch = (service: TelemetryService) => {
    for (let i = 0; i < 12; i++) service.track("page_view", { page: `/p${i}` });
  };

  it("collects nothing before init (no cookie consent), even past the batch size", () => {
    const service = new TelemetryService({ apiEndpoint: "/telemetry" });
    service.setAccountAnalytics(true);
    trackBatch(service);
    expect(service.getQueueSize()).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("collects nothing when consent is given but the account has not opted in (default)", () => {
    const service = new TelemetryService({ apiEndpoint: "/telemetry" });
    service.init();
    trackBatch(service);
    expect(service.getQueueSize()).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
    service.stop();
  });

  it("collects once both consent and the account opt-in are present", () => {
    const service = enabledService();
    service.track("page_view", { page: "/dashboard" });
    expect(service.getQueueSize()).toBe(1);
    service.stop();
  });

  it("turning the account opt-in off drops queued events and stops collection", () => {
    const service = enabledService();
    service.track("page_view", { page: "/dashboard" });
    service.setAccountAnalytics(false);
    expect(service.getQueueSize()).toBe(0);
    service.track("page_view", { page: "/dashboard" });
    expect(service.getQueueSize()).toBe(0);
    service.stop();
  });

  it("stop() (consent revoked) also stops collection", () => {
    const service = enabledService();
    service.stop();
    service.track("page_view", { page: "/dashboard" });
    expect(service.getQueueSize()).toBe(0);
  });
});
