/**
 * User-level calendar OAuth service — single implementation for all roles
 * against /api/v1/calendar/* (the coach-only /coach/auth/* flow is gone).
 */
import { apiRequest } from "@/lib/api/apiClient";
import {
  getCalendarAuthUrl,
  getCalendarStatus,
  disconnectCalendar,
} from "@/services/calendarService";

jest.mock("@/lib/api/apiClient", () => ({ apiRequest: jest.fn() }));
const mockApi = apiRequest as jest.Mock;

beforeEach(() => jest.clearAllMocks());

describe("getCalendarAuthUrl", () => {
  it("requests the provider URL with the current location as returnTo", async () => {
    window.history.replaceState({}, "", "/dashboard/profile?tab=settings");
    mockApi.mockResolvedValue({ success: true, data: { configured: true, url: "https://accounts.google.com/x" } });
    const res = await getCalendarAuthUrl("google");
    expect(res).toEqual({ configured: true, url: "https://accounts.google.com/x" });
    expect(mockApi).toHaveBeenCalledWith(
      `/api/v1/calendar/google/url?redirectUrl=${encodeURIComponent("/dashboard/profile?tab=settings")}`,
    );
  });

  it("surfaces configured:false without throwing", async () => {
    mockApi.mockResolvedValue({ success: true, data: { configured: false } });
    expect(await getCalendarAuthUrl("outlook")).toEqual({ configured: false });
  });
});

describe("getCalendarStatus", () => {
  it("unwraps the envelope", async () => {
    mockApi.mockResolvedValue({
      success: true,
      data: { configured: true, connected: true, email: "u@g.com", connectedAt: "iso" },
    });
    expect(await getCalendarStatus("google")).toEqual({
      configured: true,
      connected: true,
      email: "u@g.com",
      connectedAt: "iso",
    });
  });

  it("falls back to a safe default on request failure", async () => {
    mockApi.mockRejectedValue(new Error("network"));
    expect(await getCalendarStatus("google")).toEqual({
      configured: false,
      connected: false,
      email: null,
      connectedAt: null,
    });
  });
});

describe("disconnectCalendar", () => {
  it("issues a DELETE to the provider disconnect endpoint", async () => {
    mockApi.mockResolvedValue({ success: true });
    await disconnectCalendar("outlook");
    expect(mockApi).toHaveBeenCalledWith("/api/v1/calendar/outlook/disconnect", { method: "DELETE" });
  });
});
