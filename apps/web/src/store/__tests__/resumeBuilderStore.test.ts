import { useGlobalStore } from "@/store/useGlobalStore";
import { updateResume } from "@/services/resumeService";

jest.mock("@/services/resumeService", () => ({
  updateResume: jest.fn().mockResolvedValue({}),
  getResumeById: jest.fn(),
}));

jest.mock("@/services/telemetryService", () => ({
  telemetry: { trackAuth: jest.fn() },
}));

describe("resume builder store", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const current = useGlobalStore.getState();
    useGlobalStore.setState({
      currentResumeId: "resume-1",
      resumeSaveError: false,
      resumeBuilder: {
        ...current.resumeBuilder,
        isDirty: false,
        data: {
          ...current.resumeBuilder.data,
          template: "classic",
          careerField: "technology",
          personalInfo: {
            ...current.resumeBuilder.data.personalInfo,
            fullName: "Jane Doe",
            email: "jane@example.com",
          },
          experience: [],
          education: [],
          skills: [],
          customFields: [],
          dynamicSections: [],
        },
      },
    });
  });

  it("persists template changes through the same API save path as resume edits", async () => {
    useGlobalStore.getState().setResumeTemplate("modern");

    expect(updateResume).toHaveBeenCalledWith(
      "resume-1",
      expect.objectContaining({
        template: "modern",
        personalInfo: expect.objectContaining({
          fullName: "Jane Doe",
          email: "jane@example.com",
        }),
        skills: [],
      }),
    );

    await Promise.resolve();
    expect(useGlobalStore.getState().resumeSaveError).toBe(false);
  });
});
