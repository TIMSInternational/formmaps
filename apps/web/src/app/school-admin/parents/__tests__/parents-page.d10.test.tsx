/**
 * Audit 2026-10-09 D10: unlink/resend acted on the parent's first link, and the row opened the student page with the
 * parent's id. Each child chip now opens that student and unlinks that child's own link; resend covers every pending link.
 */
import "@/lib/i18n";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ParentsPage from "../page";
import { apiRequest } from "@/lib/api/apiClient";

const push = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: jest.fn() }) }));
jest.mock("@/lib/api/apiClient", () => ({ apiRequest: jest.fn() }));
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
const api = apiRequest as jest.Mock;

const parent = {
  id: "l1", parentName: "Pat", parentEmail: "pat@e.st", parentUserId: "parent-user", isAccepted: false, acceptedAt: null,
  createdDate: "2026-10-01T00:00:00.000Z",
  students: [
    { id: "s1", name: "Ada", email: "a@s", gradeLevel: "9", linkId: "l1", isAccepted: true },
    { id: "s2", name: "Bo", email: "b@s", gradeLevel: "10", linkId: "l2", isAccepted: false },
    { id: "s3", name: "Cy", email: "c@s", gradeLevel: "11", linkId: "l3", isAccepted: false },
  ],
};

beforeEach(() => {
  api.mockReset();
  api.mockImplementation((url: string) => url.startsWith("/api/v1/school-admin/parents?")
    ? Promise.resolve({ success: true, data: [parent], total: 1, totalPages: 1, page: 1, stats: { totalParents: 1, linkedStudents: 3, pendingInvites: 2 } })
    : Promise.resolve({ success: true }));
  push.mockReset();
});

const renderPage = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ParentsPage /></QueryClientProvider>,
);

it("a child chip opens that student, never the parent's id", async () => {
  renderPage();
  fireEvent.click(await screen.findByText("Bo (10)"));
  expect(push).toHaveBeenCalledWith("/school-admin/users/s2");
  expect(push).not.toHaveBeenCalledWith("/school-admin/users/parent-user");
});

it("unlinking a child deletes that child's own link", async () => {
  renderPage();
  await screen.findByText("Cy (11)");
  fireEvent.click(screen.getByRole("button", { name: "Unlink from Cy" }));
  await waitFor(() => expect(api).toHaveBeenCalledWith("/api/v1/school-admin/parents/l3", { method: "DELETE" }));
});

it("resend covers every pending link and skips accepted ones", async () => {
  renderPage();
  await screen.findByText("Ada (9)");
  fireEvent.click(screen.getByTitle(/resend/i));
  await waitFor(() => expect(api).toHaveBeenCalledWith("/api/v1/school-admin/parents/l3/resend", { method: "POST" }));
  expect(api).toHaveBeenCalledWith("/api/v1/school-admin/parents/l2/resend", { method: "POST" });
  expect(api).not.toHaveBeenCalledWith("/api/v1/school-admin/parents/l1/resend", { method: "POST" });
});
