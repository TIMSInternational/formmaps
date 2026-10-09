/**
 * Audit 2026-10-09 C1: the school-admin invitation page called /api/v1/school-admin/{token}/onboarding(-status),
 * which existed in neither backend. It now uses /authapi/school-admin/invite-status + complete-registration.
 */
import { apiRequest } from "@/lib/api/apiClient";
import { getSchoolAdminOnboardingStatus, submitSchoolAdminOnboarding } from "@/services/schoolService";

jest.mock("@/lib/api/apiClient", () => ({ apiRequest: jest.fn() }));
const api = apiRequest as jest.Mock;
afterEach(() => jest.resetAllMocks());

describe("school admin onboarding service", () => {
  it("reads the invitation from /authapi/school-admin/invite-status", async () => {
    api.mockResolvedValue({ success: true, data: { schoolName: "Country Day", email: "head@cd.edu", maxStudents: 250, status: "pending" } });

    const s = await getSchoolAdminOnboardingStatus("tok/1");

    expect(api.mock.calls[0][0]).toBe("/authapi/school-admin/invite-status?token=tok%2F1");
    expect(s).toMatchObject({ schoolName: "Country Day", email: "head@cd.edu", isValid: true, status: "pending" });
  });

  it("an expired invitation is not valid", async () => {
    api.mockResolvedValue({ data: { schoolName: "X", email: "a@b.c", maxStudents: 1, status: "expired" } });
    expect((await getSchoolAdminOnboardingStatus("t")).isValid).toBe(false);
  });

  it("an unknown or used token (404) is not valid rather than an error", async () => {
    api.mockRejectedValue(Object.assign(new Error("nope"), { status: 404 }));
    expect((await getSchoolAdminOnboardingStatus("t")).isValid).toBe(false);
  });

  it("submitting posts token, password and name to complete-registration and returns the session", async () => {
    api.mockResolvedValue({ success: true, data: { token: "jwt", user: { id: "u1", email: "head@cd.edu", name: "Ana", role: { name: "school_admin" }, schoolId: "s1", permissions: [] } } });

    const session = await submitSchoolAdminOnboarding("tok", { password: "Secret#123", adminInfo: { name: "  Ana " } });

    expect(api).toHaveBeenCalledWith("/authapi/school-admin/complete-registration", expect.objectContaining({
      method: "POST", data: { token: "tok", password: "Secret#123", name: "Ana" },
    }));
    expect(session.token).toBe("jwt");
  });
});
