import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import StaffSearch from "../StaffSearch";

const apiRequest = jest.fn();
jest.mock("@/lib/api/apiClient", () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));

beforeEach(() => {
  jest.useFakeTimers();
  apiRequest.mockReset();
});

afterEach(() => {
  jest.useRealTimers();
});

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
    apiRequest.mockResolvedValue({ data: [{ id: "c1", name: "Coun Selor", email: "c@s.dev", roleName: "counselor" }] });
    render(<StaffSearch value={null} onChange={jest.fn()} />);
    await typeAndDebounce("coun");

    expect(apiRequest).toHaveBeenCalledWith(
      "/api/v1/recommendations/staff?search=coun&limit=10",
      { method: "GET" }
    );
    await waitFor(() => expect(screen.getByText("Coun Selor")).toBeInTheDocument());
  });

  it("selecting a result calls onChange with the user", async () => {
    const onChange = jest.fn();
    apiRequest.mockResolvedValue({ data: [{ id: "c1", name: "Coun Selor", email: "c@s.dev", roleName: "counselor" }] });
    render(<StaffSearch value={null} onChange={onChange} />);
    await typeAndDebounce("coun");

    fireEvent.click(await screen.findByText("Coun Selor"));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ id: "c1", name: "Coun Selor" })
    );
  });

  it("shows a no-results message instead of silently rendering nothing", async () => {
    apiRequest.mockResolvedValue({ data: [] });
    render(<StaffSearch value={null} onChange={jest.fn()} />);
    await typeAndDebounce("zzzz");

    await waitFor(() =>
      expect(screen.getByText(/no counselors or staff found/i)).toBeInTheDocument()
    );
  });

  it("shows an error message when the search request fails", async () => {
    apiRequest.mockRejectedValue(new Error("403"));
    render(<StaffSearch value={null} onChange={jest.fn()} />);
    await typeAndDebounce("coun");

    await waitFor(() =>
      expect(screen.getByText(/search failed/i)).toBeInTheDocument()
    );
  });
});
