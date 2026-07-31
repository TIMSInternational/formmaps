import { ESSAY_STATUS_CONFIG, Essay } from "../types";

const MODEL_STATUSES: Essay["status"][] = ["not_started", "drafting", "review", "final"];

describe("ESSAY_STATUS_CONFIG", () => {
  it("has a config entry for every model status value", () => {
    for (const s of MODEL_STATUSES) {
      expect(ESSAY_STATUS_CONFIG[s]).toBeDefined();
      expect(ESSAY_STATUS_CONFIG[s].label).toBeTruthy();
      expect(ESSAY_STATUS_CONFIG[s].color).toBeTruthy();
      expect(ESSAY_STATUS_CONFIG[s].bg).toBeTruthy();
    }
  });

  it("does NOT have stale in_progress or complete keys", () => {
    expect((ESSAY_STATUS_CONFIG as Record<string, unknown>)["in_progress"]).toBeUndefined();
    expect((ESSAY_STATUS_CONFIG as Record<string, unknown>)["complete"]).toBeUndefined();
  });
});
