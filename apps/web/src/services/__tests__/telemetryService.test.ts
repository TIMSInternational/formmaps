import { TelemetryService } from "@/services/telemetryService";

const persistAccessToken = (token: string) => {
  localStorage.setItem(
    "timcare-global-store",
    JSON.stringify({ state: { user: { accessToken: token } } })
  );
};

describe("TelemetryService auth handling", () => {
  beforeEach(() => {
    localStorage.clear();
    document.cookie = "logged_in=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    (global as unknown as { fetch: jest.Mock }).fetch = jest.fn();
  });

  it("does not enqueue events without an auth signal", () => {
    const service = new TelemetryService({ apiEndpoint: "/telemetry" });

    service.track("page_view", { page: "/dashboard" });

    expect(service.getQueueSize()).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("sends the persisted bearer token when flushing", async () => {
    persistAccessToken("access-token");
    const service = new TelemetryService({ apiEndpoint: "/telemetry" });
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
    const service = new TelemetryService({ apiEndpoint: "/telemetry" });
    (fetch as jest.Mock).mockResolvedValue({ ok: false, status: 401 });

    service.track("page_view", { page: "/dashboard" });
    await service.flush();
    service.track("click", { elementId: "retry" });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(service.getQueueSize()).toBe(0);
  });
});
