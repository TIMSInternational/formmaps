/**
 * Audit F: `r.message || r.counselorAssigned ? `Counselor: ${r.counselorAssigned}` : undefined` bound the
 * ternary to the whole `||`, so a row with only a message became "Counselor: undefined" (and in English).
 * The mapper now keeps just the counselor's name.
 */
import { mapOnboardResponse } from "../types";

describe("mapOnboardResponse", () => {
  it("carries the assigned counselor's name, and nothing for a row without one", () => {
    const out = mapOnboardResponse({
      summary: { created: 1, linked: 0, existing: 1, failed: 1 },
      results: [
        { name: "Ana", email: "a@x.co", status: "created", counselorAssigned: "Ms. Ruiz" },
        { name: "Luis", email: "l@x.co", status: "existing", message: "Already enrolled" },
        { name: "Eva", email: "e@x.co", status: "failed", message: "Invalid email" },
      ],
    });
    expect(out.results.map((r) => r.counselorName)).toEqual(["Ms. Ruiz", undefined, undefined]);
    expect(out.results[2].error).toBe("Invalid email");
    expect(JSON.stringify(out)).not.toContain("Counselor:");
    expect(out).toMatchObject({ created: 1, updated: 1, failed: 1 });
  });
});
