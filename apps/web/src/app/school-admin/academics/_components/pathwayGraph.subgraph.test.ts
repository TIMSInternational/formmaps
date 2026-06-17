import { subgraphFromRoot, type PathwayEdge } from "./pathwayGraph";

const edges: PathwayEdge[] = [
  { id: "a__b", source: "a", target: "b" }, // a is prereq of b
  { id: "b__c", source: "b", target: "c" }, // b is prereq of c
  { id: "x__b", source: "x", target: "b" }, // x is also a prereq of b (sibling root)
  { id: "p__q", source: "p", target: "q" }, // unrelated chain
];

describe("subgraphFromRoot", () => {
  it("includes the root and everything forward-reachable from it", () => {
    const { nodeIds, edgeIds } = subgraphFromRoot(edges, "a");
    expect([...nodeIds].sort()).toEqual(["a", "b", "c"]);
    // only edges with both ends in the set
    expect([...edgeIds].sort()).toEqual(["a__b", "b__c"]);
  });

  it("excludes sibling prerequisites not reachable from the root", () => {
    const { nodeIds } = subgraphFromRoot(edges, "a");
    expect(nodeIds.has("x")).toBe(false); // x is a sibling prereq of b, not downstream of a
  });

  it("returns just the root when it has no dependents", () => {
    const { nodeIds, edgeIds } = subgraphFromRoot(edges, "c");
    expect([...nodeIds]).toEqual(["c"]);
    expect([...edgeIds]).toEqual([]);
  });

  it("returns an empty result for an unknown root", () => {
    const { nodeIds, edgeIds } = subgraphFromRoot(edges, "zzz");
    expect([...nodeIds]).toEqual(["zzz"]);
    expect([...edgeIds]).toEqual([]);
  });
});
