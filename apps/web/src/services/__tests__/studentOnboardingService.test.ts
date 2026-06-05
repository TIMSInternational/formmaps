import { completeStudentOnboarding } from "@/services/studentOnboardingService";

describe("completeStudentOnboarding", () => {
  it("sends credentials so the browser stores the auth cookies (Set-Cookie is discarded cross-origin otherwise)", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: { token: "t", refreshToken: "r", user: { id: "u1" } },
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await completeStudentOnboarding("tok", "Password1!", "Password1!", "u1");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const options = fetchMock.mock.calls[0][1];
    expect(options.credentials).toBe("include");
  });
});
