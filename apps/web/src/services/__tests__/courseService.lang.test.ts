import { listCourses, getRecommendedCourses } from "../courseService";
import { apiRequest } from "@/lib/api/apiClient";

jest.mock("@/lib/api/apiClient", () => ({ apiRequest: jest.fn() }));

const mockApiRequest = apiRequest as jest.Mock;

// tafurfede/formmaps-platform#397: the catalog request must carry the UI language
// (the API returns that language + English) and ask for the API's max page (100),
// otherwise the default page of 20 mixed-language courses is all a student sees.
describe("course catalog requests carry lang + limit (#397)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApiRequest.mockResolvedValue({ data: { courses: [] } });
  });

  it("listCourses asks for 100 courses in the UI language", async () => {
    await listCourses("es");
    expect(mockApiRequest).toHaveBeenCalledWith("/api/course?limit=100&lang=es", { method: "GET" });
  });

  it("listCourses without a language still asks for the full page", async () => {
    await listCourses();
    expect(mockApiRequest).toHaveBeenCalledWith("/api/course?limit=100", { method: "GET" });
  });

  it("getRecommendedCourses forwards the UI language", async () => {
    await getRecommendedCourses("en");
    expect(mockApiRequest).toHaveBeenCalledWith("/api/course/recommended?lang=en", { method: "GET" });
  });
});
