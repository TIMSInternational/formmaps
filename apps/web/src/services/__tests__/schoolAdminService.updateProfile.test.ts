/**
 * audit 2026-10-09 C10: Settings → "Update Profile" sent `fullName`, but PUT /user/profile renames the
 * account from `name` (fullName only touches the profile card), so the school admin's name never changed.
 */
import { updateAdminProfile } from "@/services/schoolAdminService";
import { apiRequest } from "@/lib/api/apiClient";

jest.mock("@/lib/api/apiClient", () => ({ apiRequest: jest.fn(), actingSchoolFetchHeaders: () => ({}) }));
const api = apiRequest as jest.MockedFunction<typeof apiRequest>;

beforeEach(() => api.mockReset());

it("sends the name as `name`, not `fullName`", async () => {
  api.mockResolvedValue({ success: true } as never);
  await updateAdminProfile({ name: "Ana Admin", phone: "300 000 0000" });
  expect(api).toHaveBeenCalledWith("/api/v1/user/profile", {
    method: "PUT",
    data: { name: "Ana Admin", phone: "300 000 0000" },
  });
  const body = (api.mock.calls[0][1] as { data: Record<string, unknown> }).data;
  expect(body).not.toHaveProperty("fullName");
});
