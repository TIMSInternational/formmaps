import { buildDraftPayload, draftsFromEssays } from "../essay-payload";
import type { Essay } from "../../_components/types";

describe("buildDraftPayload", () => {
  it("returns currentDraft and status=drafting when draft is non-empty", () => {
    expect(buildDraftPayload("Some text")).toEqual({
      currentDraft: "Some text",
      status: "drafting",
    });
  });

  it("returns currentDraft='' and status=not_started when draft is empty", () => {
    expect(buildDraftPayload("")).toEqual({
      currentDraft: "",
      status: "not_started",
    });
  });
});

describe("draftsFromEssays", () => {
  it("seeds a Record from essay.currentDraft", () => {
    const essays: Essay[] = [
      { id: "e1", title: "Essay 1", status: "drafting", currentDraft: "hello" },
      { id: "e2", title: "Essay 2", status: "not_started" },
    ];
    expect(draftsFromEssays(essays)).toEqual({ e1: "hello" });
  });

  it("returns empty record when no essays have currentDraft", () => {
    const essays: Essay[] = [
      { id: "e1", title: "Essay 1", status: "not_started" },
    ];
    expect(draftsFromEssays(essays)).toEqual({});
  });
});
