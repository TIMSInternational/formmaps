/**
 * Cmd+K course results navigate to /dashboard/learning/courses?course=<id>
 * (#407) — the catalog must open that course's detail panel on arrival.
 */
import { render, waitFor } from "@testing-library/react";
import { CoursesCatalog } from "../CoursesCatalog";

const openPanel = jest.fn();
jest.mock("@/components/side-panel/SidePanel", () => ({
  useSidePanel: () => ({ openPanel }),
}));
jest.mock("@/components/side-panel/CourseDetailPanel", () => ({
  CourseDetailPanel: () => null,
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string, d?: string) => (typeof d === "string" ? d : k), i18n: { language: "en" } }),
}));
const course = {
  id: "c-1", title: "Introducción a la Biología", shortDescription: "", provider: "Coursera",
  category: "Science", language: "es", country: "CR", difficulty: "Beginner", rating: 4, enrollmentCount: 1,
};
jest.mock("@/hooks/useCourseQueries", () => ({
  useCourseList: () => ({ data: { courses: [course] }, isLoading: false }),
  useRecommendedCourses: () => ({ data: { courses: [] } }),
}));
jest.mock("../CourseCard", () => ({ CourseCard: () => null }));
jest.mock("../CourseFilters", () => ({ CourseFilters: () => null }));

describe("CoursesCatalog ?course= deep link", () => {
  afterEach(() => window.history.replaceState({}, "", "/"));

  it("opens the detail panel for the linked course", async () => {
    window.history.replaceState({}, "", "/dashboard/learning/courses?course=c-1");
    render(<CoursesCatalog />);
    await waitFor(() => expect(openPanel).toHaveBeenCalledTimes(1));
    expect(openPanel.mock.calls[0][0].title).toBe("Introducción a la Biología");
  });

  it("does nothing without the param", () => {
    openPanel.mockClear();
    render(<CoursesCatalog />);
    expect(openPanel).not.toHaveBeenCalled();
  });
});
