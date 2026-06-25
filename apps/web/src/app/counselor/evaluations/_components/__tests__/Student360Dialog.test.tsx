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
  it("defaults to generic instrument (no instrument field in POST body)", async () => {
    renderDialog();

    // Open the add form
    fireEvent.click(screen.getByRole("button", { name: /add evaluator/i }));

    // Fill name and email
    fireEvent.change(screen.getByPlaceholderText(/full name/i), { target: { value: "Alice" } });
    fireEvent.change(screen.getByPlaceholderText(/email address/i), { target: { value: "alice@test.com" } });

    // Click Add
    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));

    await waitFor(() => {
      const createCall = mockApiRequest.mock.calls.find((c: string[]) => c[0] === "/evaluation/create-group");
      expect(createCall).toBeDefined();
      const payload = createCall![1].data;
      // Generic: instrument must be absent (undefined)
      expect(payload.instrument).toBeUndefined();
      expect(payload.instrumentVersion).toBeUndefined();
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
});
