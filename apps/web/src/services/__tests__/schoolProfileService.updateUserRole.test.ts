/**
 * The wire contract for PUT /api/v1/school-admin/users/:userId/role (formmaps#114).
 *
 * This function used to send `{ role }` while both servers read `roleName` — the
 * exact mistake formmaps#79 was filed for. It was latent only because the endpoint
 * did not exist and the request 404'd before a body was ever parsed. #114 built the
 * route, so the bug stopped being theoretical the same day.
 *
 * Both backends now reject the wrong key outright (`.strict()` in zod; a hand-written
 * extra-property check in .NET, because System.Text.Json ignores unknown properties
 * by default and would otherwise reproduce #79 verbatim). So sending `role` is a 400,
 * not a silent privilege grant — but it is still a broken client, and this test is
 * what stops the field name drifting back.
 */
import { updateUserRole } from "../schoolProfileService";
import { apiRequest } from "@/lib/api/apiClient";

jest.mock("@/lib/api/apiClient", () => ({ apiRequest: jest.fn() }));

const mockApi = apiRequest as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockApi.mockResolvedValue({ success: true, data: {} });
});

describe("#114 updateUserRole wire contract", () => {
  it("PUTs the role path with a body keyed `roleName`, and NOTHING else", async () => {
    await updateUserRole("u-1", "teacher");

    expect(mockApi).toHaveBeenCalledWith("/api/v1/school-admin/users/u-1/role", {
      method: "PUT",
      data: { roleName: "teacher" },
    });

    // Stated as its own assertion because it is the actual defect: a `role` key here
    // is #79. Both servers are strict, so an extra key is a 400 for every caller.
    const body = mockApi.mock.calls[0][1].data;
    expect(Object.keys(body)).toEqual(["roleName"]);
    expect(body).not.toHaveProperty("role");
  });

  it("forwards each of the four staff roles unchanged", async () => {
    for (const roleName of ["counselor", "teacher", "staff", "coach"] as const) {
      mockApi.mockClear();
      await updateUserRole("u-1", roleName);
      expect(mockApi.mock.calls[0][1].data).toEqual({ roleName });
    }
  });
});
