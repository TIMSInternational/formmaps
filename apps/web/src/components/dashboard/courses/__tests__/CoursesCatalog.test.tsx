import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

// #397: a 0/4-assessment student saw "Recommended for You · 6 courses" — the
// catalog fell back to its own top-rated courses whenever the API had none.
const mockList = jest.fn();
const mockRec = jest.fn();
jest.mock("@/hooks/useCourseQueries", () => ({
  useCourseList: () => mockList(),
  useRecommendedCourses: () => mockRec(),
}));
jest.mock("@/components/side-panel/SidePanel", () => ({ useSidePanel: () => ({ openPanel: jest.fn() }) }));
jest.mock("@/components/side-panel/CourseDetailPanel", () => ({ CourseDetailPanel: () => null }));
jest.mock("../../../../services/courseService", () => ({
  enrollInCourse: jest.fn(), trackCourseProgress: jest.fn(), markCourseCompleted: jest.fn(),
}));
jest.mock("next/image", () => ({ __esModule: true, default: () => null }));
jest.mock("next/link", () => ({ __esModule: true, default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>) => (typeof fallback === "string" ? fallback : key),
    i18n: { language: "en" },
  }),
}));

import { CoursesCatalog } from "../CoursesCatalog";

const course = (id: string, extra: Record<string, unknown> = {}) => ({
  id, title: `Course ${id}`, shortDescription: "", provider: "Coursera", category: "Data", language: "English",
  difficulty: "Beginner", country: "", rating: 4.8, duration: 0, publishedDate: "2024-01-01", ...extra,
});

beforeEach(() => {
  mockList.mockReturnValue({ data: { courses: [course("a"), course("b")] }, isLoading: false });
});

describe("CoursesCatalog — Recommended for You (#397)", () => {
  it("shows the complete-your-assessments prompt instead of a recommendations section while locked", () => {
    mockRec.mockReturnValue({ data: { courses: [], total: 0, locked: true } });
    render(<CoursesCatalog />);
    expect(screen.queryByText("courses.recommendedForYou")).not.toBeInTheDocument();
    expect(screen.getByText("Complete your assessments to get course recommendations")).toBeInTheDocument();
  });

  it("never fills the section with top-rated catalog courses when the API recommends nothing", () => {
    mockRec.mockReturnValue({ data: { courses: [], total: 0, locked: false } });
    render(<CoursesCatalog />);
    expect(screen.queryByText("courses.recommendedForYou")).not.toBeInTheDocument();
    expect(screen.queryByText("Complete your assessments to get course recommendations")).not.toBeInTheDocument();
  });

  it("renders the API's recommendations once the student is matched", () => {
    mockRec.mockReturnValue({ data: { courses: [course("r1")], total: 1, locked: false } });
    render(<CoursesCatalog />);
    expect(screen.getByText("courses.recommendedForYou")).toBeInTheDocument();
  });

  it("hides the duration chip for courses without a duration (no '0 weeks')", () => {
    mockRec.mockReturnValue({ data: { courses: [], locked: true } });
    render(<CoursesCatalog />);
    expect(screen.queryByText(/^0 /)).not.toBeInTheDocument();
    expect(screen.queryByText("0 courses.weeks")).not.toBeInTheDocument();
  });
});
