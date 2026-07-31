import { scopedPrereqChanges, type CatalogCourse, type PathwayEdge } from "./pathwayGraph";

// C requires BOTH p1 (in the root chain, on canvas) and p2 (a sibling chain that
// converges on C and is NOT on the per-pathway canvas). The canvas only draws p1→C.
const courses: CatalogCourse[] = [
  { id: "root", code: "ROOT", name: "Root", department: "X" },
  { id: "p1", code: "P1", name: "P1", department: "X" },
  { id: "c", code: "C", name: "C", department: "X", prerequisites: ["P1", "P2"] },
  { id: "p2", code: "P2", name: "P2", department: "Y" },
];
const baseline: Record<string, string[]> = { c: ["p1", "p2"] };

describe("scopedPrereqChanges", () => {
  it("reports no change when the on-canvas portion is unchanged (does not wipe off-canvas prereqs)", () => {
    // Canvas shows root, p1, c — and the drawn edge p1→C matches the baseline's
    // on-canvas portion. p2 is off-canvas. Nothing should be flagged.
    const onCanvas = new Set(["root", "p1", "c"]);
    const edges: PathwayEdge[] = [{ id: "p1__c", source: "p1", target: "c" }];
    expect(scopedPrereqChanges(baseline, edges, courses, onCanvas)).toEqual([]);
  });

  it("preserves the off-canvas prereq in the payload when an on-canvas edge is removed", () => {
    // Admin deletes p1→C on the canvas. The PUT must keep p2 (off-canvas).
    const onCanvas = new Set(["root", "p1", "c"]);
    const edges: PathwayEdge[] = []; // p1→C removed
    const changes = scopedPrereqChanges(baseline, edges, courses, onCanvas);
    expect(changes).toHaveLength(1);
    expect(changes[0].courseId).toBe("c");
    expect([...changes[0].courseIds].sort()).toEqual(["p2"]); // p1 dropped, p2 preserved
  });

  it("adds a new on-canvas prereq while preserving the off-canvas one", () => {
    const onCanvas = new Set(["root", "p1", "c"]);
    const edges: PathwayEdge[] = [
      { id: "p1__c", source: "p1", target: "c" },
      { id: "root__c", source: "root", target: "c" },
    ];
    const changes = scopedPrereqChanges(baseline, edges, courses, onCanvas);
    expect(changes).toHaveLength(1);
    expect([...changes[0].courseIds].sort()).toEqual(["p1", "p2", "root"]);
  });

  it("behaves like a plain diff when every prereq source is on the canvas", () => {
    const onCanvas = new Set(["root", "p1", "c", "p2"]);
    const edges: PathwayEdge[] = [{ id: "p1__c", source: "p1", target: "c" }]; // p2→C removed
    const changes = scopedPrereqChanges(baseline, edges, courses, onCanvas);
    expect(changes).toHaveLength(1);
    expect([...changes[0].courseIds].sort()).toEqual(["p1"]); // p2 genuinely removed (it was on canvas)
  });
});
