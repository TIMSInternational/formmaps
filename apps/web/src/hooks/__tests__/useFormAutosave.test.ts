import { renderHook, act, waitFor } from "@testing-library/react";
import { useFormAutosave } from "@/hooks/useFormAutosave";
import { apiRequest } from "@/lib/api/apiClient";

// The hook must use the shared apiClient (correct base URL + auth handling),
// not its own fetch with a divergent env var.
jest.mock("@/lib/api/apiClient", () => ({ apiRequest: jest.fn() }));
const mockApiRequest = apiRequest as jest.Mock;

describe("useFormAutosave", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockApiRequest.mockResolvedValue({ success: true, data: { drafts: [] } });
  });

  it("loads the draft exactly once on mount, even with inline callbacks (no request storm)", async () => {
    const { rerender } = renderHook(
      () =>
        useFormAutosave("profile_form", {
          // Inline arrow — new identity every render, must NOT retrigger the load
          onRestoreSuccess: (data) => void data,
        }),
    );

    await waitFor(() => expect(mockApiRequest).toHaveBeenCalledTimes(1));
    rerender();
    rerender();
    rerender();
    // Give any (buggy) re-triggered loads a chance to fire
    await act(async () => { await Promise.resolve(); });
    expect(mockApiRequest).toHaveBeenCalledTimes(1);
    expect(mockApiRequest).toHaveBeenCalledWith(
      "/api/v1/user/drafts?formId=profile_form"
    );
  });

  it("unwraps the {success,data:{drafts}} envelope and restores the first draft", async () => {
    const draft = {
      draftId: "d1",
      formId: "profile_form",
      data: { name: "Saved Name" },
      lastModified: "2026-06-05T00:00:00Z",
    };
    mockApiRequest.mockResolvedValue({ success: true, data: { drafts: [draft] } });

    const onRestoreSuccess = jest.fn();
    const { result } = renderHook(() =>
      useFormAutosave("profile_form", { onRestoreSuccess }),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.draft?.draftId).toBe("d1");
    expect(onRestoreSuccess).toHaveBeenCalledWith({ name: "Saved Name" });
  });

  it("saveDraft posts to the drafts endpoint and unwraps {success,data:{draftId}}", async () => {
    mockApiRequest
      .mockResolvedValueOnce({ success: true, data: { drafts: [] } }) // mount load
      .mockResolvedValueOnce({ success: true, data: { draftId: "new-draft" } }); // save

    const { result } = renderHook(() => useFormAutosave("profile_form"));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let draftId: string | null = null;
    await act(async () => {
      draftId = await result.current.saveDraft({ name: "X" });
    });

    expect(draftId).toBe("new-draft");
    expect(mockApiRequest).toHaveBeenCalledWith(
      "/api/v1/user/drafts",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
