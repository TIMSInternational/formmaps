import { render, screen } from "@testing-library/react";
import { ResumeCard } from "../ResumeCard";
import type { Resume } from "@/services/resumeService";

const base: Resume = {
  _id: "r1", name: "My Resume", template: "classic",
  personal: { fullName: "Jane", email: "", phone: "", location: "" },
  skills: { skills: {} }, experience: [], education: [],
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

describe("ResumeCard original badge", () => {
  it("shows an Original badge when hasOriginal is true", () => {
    renderCard({ ...base, hasOriginal: true });
    expect(screen.getByText(/original/i)).toBeInTheDocument();
  });

  it("hides the badge when hasOriginal is false", () => {
    renderCard({ ...base, hasOriginal: false });
    expect(screen.queryByText(/original/i)).not.toBeInTheDocument();
  });
});
