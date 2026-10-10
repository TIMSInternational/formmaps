/**
 * audit 2026-10-09 C15: the coach search box, specialty filter and paging must reach the API.
 */
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import BookCoachPage from "../page";
import { getCoaches } from "@/services/coachService";

const tFn = (k: string) => k;
jest.mock("react-i18next", () => ({ useTranslation: () => ({ t: tFn }) }));
jest.mock("@/services/coachService", () => ({ getCoaches: jest.fn() }));
jest.mock("motion/react", () => ({
  motion: { div: ({ children, className }: any) => <div className={className}>{children}</div> },
}));

const mockGet = getCoaches as jest.Mock;
const coach = (id: string, specialization: string) => ({ id, name: `Coach ${id}`, title: "Mentor", specialization, tags: [] });
const resp = (coaches: any[], totalPages = 1) => ({ success: true, data: { coaches, total: coaches.length, page: 1, limit: 12, totalPages } });

beforeEach(() => {
  jest.useFakeTimers();
  mockGet.mockReset();
});
afterEach(() => jest.useRealTimers());

async function flush() { await act(async () => { jest.advanceTimersByTime(600); }); }

it("sends search and specialty to the API and resets to page 1", async () => {
  mockGet.mockResolvedValue(resp([coach("1", "STEM"), coach("2", "Arts")]));
  render(<BookCoachPage />);
  await flush();
  expect(mockGet).toHaveBeenLastCalledWith({ search: undefined, specialization: undefined, page: 1, limit: 12 });
  await waitFor(() => expect(screen.getByText("Coach 1")).toBeTruthy());

  fireEvent.change(screen.getByPlaceholderText("coaching.find.searchPlaceholder"), { target: { value: "ana" } });
  await flush();
  expect(mockGet).toHaveBeenLastCalledWith({ search: "ana", specialization: undefined, page: 1, limit: 12 });

  fireEvent.change(screen.getByLabelText("coaching.find.specialtyFilter"), { target: { value: "STEM" } });
  await flush();
  expect(mockGet).toHaveBeenLastCalledWith({ search: "ana", specialization: "STEM", page: 1, limit: 12 });
});

it("Load more fetches the next page and appends", async () => {
  mockGet.mockResolvedValueOnce(resp([coach("1", "STEM")], 2)).mockResolvedValueOnce(resp([coach("2", "Arts")], 2));
  render(<BookCoachPage />);
  await flush();
  await waitFor(() => expect(screen.getByText("coaching.find.loadMore")).toBeTruthy());
  fireEvent.click(screen.getByText("coaching.find.loadMore"));
  await flush();
  expect(mockGet).toHaveBeenLastCalledWith({ search: undefined, specialization: undefined, page: 2, limit: 12 });
  await waitFor(() => expect(screen.getByText("Coach 2")).toBeTruthy());
  expect(screen.getByText("Coach 1")).toBeTruthy();
  expect(screen.queryByText("coaching.find.loadMore")).toBeNull();
});
