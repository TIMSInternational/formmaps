import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import GradeImportForm from "@/components/school-admin/GradeImportForm";

// Mock useSchoolAdminAccess to provide a schoolId
jest.mock("@/hooks/useSchoolAdminAccess", () => ({
  useSchoolAdminAccess: () => ({ schoolId: "school-1" }),
}));

// Keep the grade import hook simple for preview tests
jest.mock("@/hooks/useGradeImport", () => ({
  useGradeImport: () => ({ mutateAsync: jest.fn().mockResolvedValue({ jobId: "job-1" }) }),
}));

describe("GradeImportForm", () => {
  it("parses CSV and shows preview rows", async () => {
    render(<GradeImportForm onClose={() => {}} />);

    const csv = `student_id,student_email,course_code,semester,grade,credits,status\nSTU001,john@school.edu,MATH-301,Fall 2025,A,1.0,completed`;
    const file = new File([csv], "grades.csv", { type: "text/csv" });

    const input = screen.getByTestId("grade-csv-input") as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [file] });

    fireEvent.change(input);

    await waitFor(() => {
      // table rows should render parsed values
      expect(screen.getByText(/STU001/)).toBeInTheDocument();
      expect(screen.getByText(/john@school.edu/)).toBeInTheDocument();
      expect(screen.getByText(/MATH-301/)).toBeInTheDocument();
    });
  });
});
