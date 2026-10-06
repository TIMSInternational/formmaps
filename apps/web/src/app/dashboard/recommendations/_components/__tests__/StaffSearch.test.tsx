// Real i18next (English) so assertions read the rendered copy, not raw keys.
import "@/lib/i18n";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import i18n from "@/lib/i18n";
import StaffSearch from "../StaffSearch";

const apiRequest = jest.fn();
jest.mock("@/lib/api/apiClient", () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));

const PROBE_URL = "/api/v1/recommendations/staff?limit=1";
const COUNSELOR = { id: "c1", name: "Coun Selor", email: "c@s.dev", roleName: "counselor" };

/** Route the mocked API: the unfiltered availability probe vs. the search. */
function mockApi({ probe, search }: { probe: unknown[]; search?: unknown[] | Error }) {
  apiRequest.mockImplementation((url: string) => {
    if (url === PROBE_URL) return Promise.resolve({ data: probe });
    if (search instanceof Error) return Promise.reject(search);
    return Promise.resolve({ data: search ?? [] });
  });
}

beforeEach(async () => {
  jest.useFakeTimers();
  apiRequest.mockReset();
  await i18n.changeLanguage("en");
});

afterEach(() => {
  jest.useRealTimers();
});

async function renderSearch(onChange = jest.fn()) {
  render(<StaffSearch value={null} onChange={onChange} />);
  // let the mount-time availability probe settle
  await act(async () => {});
  return onChange;
}

async function typeAndDebounce(value: string) {
  fireEvent.change(
    screen.getByPlaceholderText("Search counselors and staff..."),
    { target: { value } }
  );
  await act(async () => {
    jest.advanceTimersByTime(300);
  });
}

describe("StaffSearch", () => {
  it("searches the student-accessible staff endpoint, NOT school-admin users", async () => {
    mockApi({ probe: [COUNSELOR], search: [COUNSELOR] });
    await renderSearch();
    await typeAndDebounce("coun");

    expect(apiRequest).toHaveBeenCalledWith(
      "/api/v1/recommendations/staff?search=coun&limit=10",
      { method: "GET" }
    );
    await waitFor(() => expect(screen.getByText("Coun Selor")).toBeInTheDocument());
  });

  it("probes the unfiltered staff list once on mount to know whether ANY recommender exists", async () => {
    mockApi({ probe: [COUNSELOR] });
    await renderSearch();
    expect(apiRequest).toHaveBeenCalledWith(PROBE_URL, { method: "GET" });
    expect(apiRequest).toHaveBeenCalledTimes(1);
  });

  it("selecting a result calls onChange with the user", async () => {
    mockApi({ probe: [COUNSELOR], search: [COUNSELOR] });
    const onChange = await renderSearch();
    await typeAndDebounce("coun");

    fireEvent.click(await screen.findByText("Coun Selor"));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ id: "c1", name: "Coun Selor" })
    );
  });

  it("#412: a student with NO staff sees the 'no counselors or teachers' empty state on the first keystroke", async () => {
    mockApi({ probe: [] });
    await renderSearch();
    await typeAndDebounce("a");

    expect(
      screen.getByText("No counselors or teachers available yet")
    ).toBeInTheDocument();
    // nothing to search — only the probe was called
    expect(apiRequest).toHaveBeenCalledTimes(1);
  });

  it("#412: a student WITH staff whose query matches none sees a distinct no-matches message", async () => {
    mockApi({ probe: [COUNSELOR], search: [] });
    await renderSearch();
    await typeAndDebounce("zzzz");

    await waitFor(() =>
      expect(screen.getByText("No matches for “zzzz”")).toBeInTheDocument()
    );
    expect(
      screen.queryByText("No counselors or teachers available yet")
    ).not.toBeInTheDocument();
  });

  it("#412: a single character (below the search minimum) shows a hint instead of silence", async () => {
    mockApi({ probe: [COUNSELOR] });
    await renderSearch();
    await typeAndDebounce("a");

    expect(screen.getByText(/type at least 2 characters/i)).toBeInTheDocument();
    expect(apiRequest).toHaveBeenCalledTimes(1);
  });

  it("#412: empty states are translated (es)", async () => {
    await i18n.changeLanguage("es");
    mockApi({ probe: [] });
    await renderSearch();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "a" } });
    await act(async () => {
      jest.advanceTimersByTime(300);
    });

    expect(
      screen.getByText("Aún no hay consejeros ni profesores disponibles")
    ).toBeInTheDocument();
  });

  it("shows an error message when the search request fails", async () => {
    mockApi({ probe: [COUNSELOR], search: new Error("403") });
    await renderSearch();
    await typeAndDebounce("coun");

    await waitFor(() =>
      expect(screen.getByText(/search failed/i)).toBeInTheDocument()
    );
  });
});
