import {
  buildPathwayGraph,
  wouldCreateCycle,
  diffPrereqs,
  edgeId,
  type CatalogCourse,
} from "../pathwayGraph";

const C = (id: string, code: string, extra: Partial<CatalogCourse> = {}): CatalogCourse => ({
  id, code, name: code, department: "Math", ...extra,
});

describe("buildPathwayGraph", () => {
  it("builds prereq edges (source=prereq, target=dependent) and splits the palette", () => {
    const courses = [
      C("c1", "ALG1"),
      C("c2", "ALG2", { prerequisites: ["ALG1"] }),
      C("c3", "CALC", { prerequisites: ["ALG2"] }),
      C("c4", "ART1", { department: "Arts" }), // no edges → palette
    ];
    const g = buildPathwayGraph(courses);

    expect(g.edges).toEqual([
      { id: edgeId("c1", "c2"), source: "c1", target: "c2" },
      { id: edgeId("c2", "c3"), source: "c2", target: "c3" },
    ]);
    expect(g.connectedIds.sort()).toEqual(["c1", "c2", "c3"]);
    expect(g.paletteIds).toEqual(["c4"]);
    expect(g.originalPrereqs).toEqual({ c1: [], c2: ["c1"], c3: ["c2"], c4: [] });
  });

  it("normalizes prereq codes (trim + case) and drops out-of-catalog + self refs", () => {
    const courses = [
      C("c1", "ALG1"),
      C("c2", "ALG2", { prerequisites: [" alg1 ", "GHOST", "ALG2"] }),
    ];
    const g = buildPathwayGraph(courses);
    expect(g.edges).toEqual([{ id: edgeId("c1", "c2"), source: "c1", target: "c2" }]);
    expect(g.originalPrereqs.c2).toEqual(["c1"]); // GHOST dropped, self ALG2 dropped
  });

  it("de-dupes repeated prereq codes", () => {
    const courses = [C("c1", "ALG1"), C("c2", "ALG2", { prerequisites: ["ALG1", "alg1"] })];
    const g = buildPathwayGraph(courses);
    expect(g.edges).toHaveLength(1);
  });
});

describe("wouldCreateCycle", () => {
  const edges = [
    { id: "e1", source: "a", target: "b" },
    { id: "e2", source: "b", target: "c" },
  ];

  it("rejects a self-edge", () => {
    expect(wouldCreateCycle(edges, "a", "a")).toBe(true);
  });
  it("rejects a direct back-edge (b→a when a→b exists)", () => {
    expect(wouldCreateCycle(edges, "b", "a")).toBe(true);
  });
  it("rejects a transitive back-edge (c→a when a→b→c exists)", () => {
    expect(wouldCreateCycle(edges, "c", "a")).toBe(true);
  });
  it("allows a forward edge that introduces no cycle (a→c)", () => {
    expect(wouldCreateCycle(edges, "a", "c")).toBe(false);
  });
  it("allows an edge to a fresh node", () => {
    expect(wouldCreateCycle(edges, "c", "d")).toBe(false);
  });
});

describe("diffPrereqs", () => {
  const courses = [
    C("c1", "ALG1"),
    C("c2", "ALG2"),
    C("c3", "CALC", { corequisites: ["CALC-LAB"] }),
    C("c6", "GEO"),
  ];
  const original = { c1: [], c2: ["c1"], c3: ["c2"], c6: [] };

  it("returns nothing when edges match the baseline", () => {
    const edges = [
      { id: "e", source: "c1", target: "c2" },
      { id: "e2", source: "c2", target: "c3" },
    ];
    expect(diffPrereqs(original, edges, courses)).toEqual([]);
  });

  it("emits the full new prereq set for a course that gained an edge (coreqs preserved)", () => {
    const edges = [
      { id: "e", source: "c1", target: "c2" },
      { id: "e2", source: "c2", target: "c3" },
      { id: "e3", source: "c6", target: "c3" }, // GEO added to CALC
    ];
    expect(diffPrereqs(original, edges, courses)).toEqual([
      { courseId: "c3", courseIds: ["c2", "c6"], corequisites: ["CALC-LAB"] },
    ]);
  });

  it("emits an empty set for a course that lost all prerequisites", () => {
    const edges = [{ id: "e", source: "c1", target: "c2" }]; // CALC's c2→c3 removed
    expect(diffPrereqs(original, edges, courses)).toEqual([
      { courseId: "c3", courseIds: [], corequisites: ["CALC-LAB"] },
    ]);
  });

  it("is order-independent when comparing sets", () => {
    const reversedOriginal = { ...original, c3: ["c2"] };
    const edges = [
      { id: "e", source: "c1", target: "c2" },
      { id: "e2", source: "c2", target: "c3" },
    ];
    expect(diffPrereqs(reversedOriginal, edges, courses)).toEqual([]);
  });
});
