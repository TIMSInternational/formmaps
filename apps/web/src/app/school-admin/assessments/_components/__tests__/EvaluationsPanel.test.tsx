/**
 * Assessment Hub → Evaluations lists EVERY student. It used to ask for `limit=200` in one request and get the
 * server's maximum of 100, so in a school of 150 the last 50 students could not have their 360° set up.
 */
import { render, screen, waitFor } from "@testing-library/react";
import { EvaluationsPanel } from "../EvaluationsPanel";
import { getAllStudents } from "@/services/schoolAdminService";
import { apiRequest } from "@/lib/api/apiClient";

jest.mock("react-i18next", () => {
  const { createTestI18n } = require("@/test-utils/realI18n");
  const inst = createTestI18n("en");
  return {
    initReactI18next: { type: "3rdParty", init: () => {} },
    useTranslation: (ns?: string) => ({ t: inst.getFixedT(null, ns ?? "common"), i18n: inst }),
  };
});
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock("motion/react", () => {
  const React = require("react");
  const passthrough = new Proxy({}, { get: (_t, tag: string) => React.forwardRef((p: Record<string, unknown>, ref: unknown) => {
    const { initial: _i, animate: _a, exit: _e, transition: _tr, whileHover: _wh, whileTap: _wt, layout: _l, ...rest } = p;
    return React.createElement(tag, { ...rest, ref });
  }) });
  return { motion: passthrough, AnimatePresence: ({ children }: { children: unknown }) => children };
});
jest.mock("@/services/schoolAdminService", () => ({ getAllStudents: jest.fn() }));
jest.mock("@/lib/api/apiClient", () => ({ apiRequest: jest.fn() }));
jest.mock("../Student360Dialog", () => ({ Student360Dialog: () => null }));

const all = getAllStudents as jest.MockedFunction<typeof getAllStudents>;
const api = apiRequest as jest.MockedFunction<typeof apiRequest>;

it("shows all 150 students, not the first 100", async () => {
  all.mockResolvedValue(Array.from({ length: 150 }, (_, i) => ({ id: `s${i}`, name: `Student ${i}`, email: `s${i}@x.test`, gradeLevel: 10 })) as never);
  api.mockResolvedValue({ data: [] } as never);
  render(<EvaluationsPanel />);
  await waitFor(() => expect(screen.getByText("Student 149")).toBeInTheDocument());
  expect(all).toHaveBeenCalledTimes(1);
  // the old single request for 200 is gone
  expect(api.mock.calls.some(([u]) => String(u).includes("/school-admin/students"))).toBe(false);
});
