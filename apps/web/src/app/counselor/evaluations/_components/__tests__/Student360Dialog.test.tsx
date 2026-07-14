import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { Student360Dialog } from "../Student360Dialog";
import * as apiClientModule from "@/lib/api/apiClient";
import * as evalService from "@/services/evaluationService";

// Mock apiRequest
jest.mock("@/lib/api/apiClient", () => ({
  apiRequest: jest.fn(),
}));

// Mock evaluationService to avoid group-load side effects
jest.mock("@/services/evaluationService", () => ({
  getUserEvaluationGroups: jest.fn().mockResolvedValue([]),
}));

// Stub sonner toast
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

// Stub ExtendDeadlinePicker (not under test)
jest.mock("../ExtendDeadlinePicker", () => ({
  ExtendDeadlinePicker: () => null,
}));

const mockApiRequest = apiClientModule.apiRequest as jest.Mock;

const student = {
  studentId: "student-1",
  name: "Jane Doe",
  email: "jane@test.com",
  gradeLevel: 11,
  totalEvaluators: 0,
  completedEvaluators: 0,
  selfCompleted: false,
  status: "not_started" as const,
};

beforeEach(() => {
  jest.clearAllMocks();
  // Default: create-group succeeds; vocational instrument endpoint returns version
  mockApiRequest.mockImplementation((path: string) => {
    if (path === "/api/v1/vocational360/instrument") {
      return Promise.resolve({ data: { version: "2024-v1" } });
    }
    // create-group
    return Promise.resolve({ data: { emailSent: true } });
  });
});

function renderDialog() {
  return render(
    <Student360Dialog student={student} open onOpenChange={jest.fn()} />
  );
}

describe("Student360Dialog — instrument selector", () => {
  it("defaults to the vocational instrument (sends instrument: 'vocational')", async () => {
    renderDialog();

    // Open the add form
    fireEvent.click(screen.getByRole("button", { name: /add evaluator/i }));

    // Fill name and email (leave the instrument on its default)
    fireEvent.change(screen.getByPlaceholderText(/full name/i), { target: { value: "Alice" } });
    fireEvent.change(screen.getByPlaceholderText(/email address/i), { target: { value: "alice@test.com" } });

    // Click Add
    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));

    await waitFor(() => {
      const createCall = mockApiRequest.mock.calls.find((c: string[]) => c[0] === "/evaluation/create-group");
      expect(createCall).toBeDefined();
      const payload = createCall![1].data;
      // New default: the real Vocational 360.
      expect(payload.instrument).toBe("vocational");
    });
  });

  it("sends instrument: 'generic' when the counselor explicitly opts out", async () => {
    renderDialog();
    fireEvent.click(screen.getByRole("button", { name: /add evaluator/i }));

    const instrumentSelect = screen.getByRole("combobox", { name: /instrument/i });
    fireEvent.change(instrumentSelect, { target: { value: "generic" } });

    fireEvent.change(screen.getByPlaceholderText(/full name/i), { target: { value: "Dana" } });
    fireEvent.change(screen.getByPlaceholderText(/email address/i), { target: { value: "dana@test.com" } });
    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));

    await waitFor(() => {
      const createCall = mockApiRequest.mock.calls.find((c: string[]) => c[0] === "/evaluation/create-group");
      expect(createCall).toBeDefined();
      const payload = createCall![1].data;
      expect(payload.instrument).toBe("generic");
    });
  });

  it("includes instrument: 'vocational' in POST body when Vocational 360 is selected", async () => {
    renderDialog();

    // Open the add form
    fireEvent.click(screen.getByRole("button", { name: /add evaluator/i }));

    // Select Vocational 360
    const instrumentSelect = screen.getByRole("combobox", { name: /instrument/i });
    fireEvent.change(instrumentSelect, { target: { value: "vocational" } });

    // Fill name and email
    fireEvent.change(screen.getByPlaceholderText(/full name/i), { target: { value: "Bob" } });
    fireEvent.change(screen.getByPlaceholderText(/email address/i), { target: { value: "bob@test.com" } });

    // Wait for the instrument version fetch to resolve
    await waitFor(() =>
      expect(mockApiRequest).toHaveBeenCalledWith("/api/v1/vocational360/instrument")
    );

    // Click Add
    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));

    await waitFor(() => {
      const createCall = mockApiRequest.mock.calls.find((c: string[]) => c[0] === "/evaluation/create-group");
      expect(createCall).toBeDefined();
      const payload = createCall![1].data;
      expect(payload.instrument).toBe("vocational");
      expect(payload.instrumentVersion).toBe("2024-v1");
    });
  });

  it("adds the Self relation option to the relation select", async () => {
    renderDialog();
    fireEvent.click(screen.getByRole("button", { name: /add evaluator/i }));

    // The relation select should have a "Self Evaluation" option
    const options = screen.getAllByRole("option");
    const selfOption = options.find((o) => o.textContent === "Self Evaluation");
    expect(selfOption).toBeDefined();
  });

  it("creates evaluator group without instrumentVersion when vocational instrument fetch fails", async () => {
    // Override the mock to reject the instrument fetch
    mockApiRequest.mockImplementation((path: string) => {
      if (path === "/api/v1/vocational360/instrument") {
        return Promise.reject(new Error("Fetch failed"));
      }
      // create-group still succeeds
      return Promise.resolve({ data: { emailSent: true } });
    });

    renderDialog();

    // Open the add form
    fireEvent.click(screen.getByRole("button", { name: /add evaluator/i }));

    // Select Vocational 360
    const instrumentSelect = screen.getByRole("combobox", { name: /instrument/i });
    fireEvent.change(instrumentSelect, { target: { value: "vocational" } });

    // Fill name and email
    fireEvent.change(screen.getByPlaceholderText(/full name/i), { target: { value: "Charlie" } });
    fireEvent.change(screen.getByPlaceholderText(/email address/i), { target: { value: "charlie@test.com" } });

    // Wait for the instrument version fetch to reject
    await waitFor(() =>
      expect(mockApiRequest).toHaveBeenCalledWith("/api/v1/vocational360/instrument")
    );

    // Click Add
    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));

    await waitFor(() => {
      const createCall = mockApiRequest.mock.calls.find((c: string[]) => c[0] === "/evaluation/create-group");
      expect(createCall).toBeDefined();
      const payload = createCall![1].data;
      // Creation must still happen even if fetch failed
      expect(payload.instrument).toBe("vocational");
      // instrumentVersion should be omitted (undefined)
      expect(payload.instrumentVersion).toBeUndefined();
    });
  });
});
