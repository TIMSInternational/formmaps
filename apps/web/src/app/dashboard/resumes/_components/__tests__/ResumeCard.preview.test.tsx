import { render, screen } from "@testing-library/react";
import { ResumeCard } from "../ResumeCard";
import type { Resume } from "@/services/resumeService";

// Mock the thumbnail so we assert ResumeCard's wiring (which preview it mounts)
// without dragging in pdf.js / canvas.
jest.mock("../ResumeOriginalThumbnail", () => ({
  ResumeOriginalThumbnail: () => <div data-testid="original-thumbnail" />,
}));

const base: Resume = {
  _id: "r1",
  name: "My Resume",
  template: "classic",
  summary: "A short professional summary line.",
  personal: { fullName: "Jane Doe", email: "", phone: "", location: "" },
  skills: { skills: {} },
  experience: [],
  education: [],
};

const noop = () => {};
const renderCard = (resume: Resume) =>
  render(
    <ResumeCard
      resume={resume}
      showMenu={false}
      onToggleMenu={noop}
      onEdit={noop}
      onDuplicate={noop}
      onDelete={noop}
    />,
  );

describe("ResumeCard preview selection", () => {
  it("mounts the original thumbnail when hasOriginal is true", () => {
    renderCard({ ...base, hasOriginal: true });
    expect(screen.getByTestId("original-thumbnail")).toBeInTheDocument();
  });

  it("renders the typeset preview (no thumbnail) when hasOriginal is false", () => {
    renderCard({ ...base, hasOriginal: false });
    expect(screen.queryByTestId("original-thumbnail")).not.toBeInTheDocument();
    // The typeset preview shows the parsed name + the section heading.
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getByText("Summary")).toBeInTheDocument();
  });
});
