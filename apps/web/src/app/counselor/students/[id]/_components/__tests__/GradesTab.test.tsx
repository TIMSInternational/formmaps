import { render, screen } from "@testing-library/react";
import { Tabs } from "@/components/ui/tabs";
import { GradesTab } from "../GradesTab";
import type { StudentGpa, TranscriptData } from "@/services/transcriptService";

const mockGpaData = {
  gpaWeighted: 3.85,
  gpaUnweighted: 3.62,
  totalCredits: 22,
  classRank: null,
  classSize: null,
  rankPercentile: null,
  yearlyBreakdown: {},
  computedAt: "2026-06-01T00:00:00Z",
};

const mockTranscriptData = {
  byYear: {
    "2024-2025": [
      {
        id: "row-1",
        courseId: "course-1",
        courseCode: "MATH101",
        grade: "A",
        credits: 1,
        courseLevel: "Honors",
        semester: "Fall",
        academicYear: "2024-2025",
        status: "completed",
      },
    ],
    "2023-2024": [
      {
        id: "row-2",
        courseId: "course-2",
        courseCode: "ENG101",
        grade: "B+",
        credits: 1,
        courseLevel: "Regular",
        semester: "Fall",
        academicYear: "2023-2024",
        status: "completed",
      },
    ],
  },
  gpaUnweighted: 3.62,
  gpaWeighted: 3.85,
  totalCredits: 22,
};

function renderGradesTab(gpaData: StudentGpa | null | undefined, transcriptData: TranscriptData | null | undefined) {
  return render(
    <Tabs defaultValue="grades">
      <GradesTab gpaData={gpaData} transcriptData={transcriptData} />
    </Tabs>,
  );
}

describe("GradesTab", () => {
  it("renders course codes from byYear and shows year headers", () => {
    renderGradesTab(mockGpaData, mockTranscriptData);
    expect(screen.getByText("MATH101")).toBeInTheDocument();
    expect(screen.getByText("ENG101")).toBeInTheDocument();
    expect(screen.getByText("2024-2025")).toBeInTheDocument();
    expect(screen.getByText("2023-2024")).toBeInTheDocument();
    expect(screen.queryByText(/no transcript data available/i)).not.toBeInTheDocument();
  });

  it("shows the empty message when byYear is empty", () => {
    const emptyTranscript = { byYear: {}, gpaUnweighted: null, gpaWeighted: null, totalCredits: 0 };
    renderGradesTab(null, emptyTranscript);
    expect(screen.getByText(/no transcript data available/i)).toBeInTheDocument();
  });

  it("shows the empty message when transcriptData is null", () => {
    renderGradesTab(null, null);
    expect(screen.getByText(/no transcript data available/i)).toBeInTheDocument();
  });
});
