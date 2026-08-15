# School-Admin Academics UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the course detail/edit dialog to FormMaps brand UI, and give each pathway its own visual-editor page routed on the pathway's root course.

**Architecture:** Item A is a pure restyle of `CourseDetailDialog` (no API/field changes). Item B extracts the editor body of `PathwayEditorDialog` into a reusable `PathwayEditor` that accepts an optional `rootCourseId`; a new dynamic route renders it scoped to one root's forward-reachable subgraph, while the existing shared dialog keeps the all-pathways view. Pathways stay derived — no schema or API change.

**Tech Stack:** Next.js 16 (App Router), React 19, `@xyflow/react`, TanStack Query, Jest. Branch `feat/school-admin-academics-ui` off `develop`.

---

### Task 1: `subgraphFromRoot` graph helper (TDD)

Forward-reachable subgraph from a root course: the root plus every course that transitively requires it, and the edges among that set. Edges are `source = prerequisite`, `target = dependent`.

**Files:**
- Modify: `frontend/src/app/school-admin/academics/_components/pathwayGraph.ts`
- Test: `frontend/src/app/school-admin/academics/_components/pathwayGraph.subgraph.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx jest pathwayGraph.subgraph -t "subgraphFromRoot"`
Expected: FAIL — `subgraphFromRoot is not a function`.

- [ ] **Step 3: Implement the helper**

Append to `pathwayGraph.ts`:

```ts
/** Forward-reachable subgraph from a root course id: the root plus every course
 *  that transitively requires it (follow source→target edges), and the edge ids
 *  whose both ends are inside that set. Used by the per-pathway editor page. */
export function subgraphFromRoot(
  edges: PathwayEdge[],
  rootId: string,
): { nodeIds: Set<string>; edgeIds: Set<string> } {
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    const list = adj.get(e.source);
    if (list) list.push(e.target);
    else adj.set(e.source, [e.target]);
  }
  const nodeIds = new Set<string>([rootId]);
  const stack = [rootId];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const next of adj.get(cur) ?? []) {
      if (!nodeIds.has(next)) { nodeIds.add(next); stack.push(next); }
    }
  }
  const edgeIds = new Set<string>();
  for (const e of edges) {
    if (nodeIds.has(e.source) && nodeIds.has(e.target)) edgeIds.add(e.id);
  }
  return { nodeIds, edgeIds };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx jest pathwayGraph.subgraph`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/school-admin/academics/_components/pathwayGraph.ts frontend/src/app/school-admin/academics/_components/pathwayGraph.subgraph.test.ts
git commit -m "feat(academics): subgraphFromRoot helper for per-pathway editor"
```

---

### Task 2: Extract `PathwayEditor` from `PathwayEditorDialog`

Move the entire editor body + logic into a new `PathwayEditor` component that takes `{ rootCourseId?: string; onClose?: () => void }`. The dialog becomes a thin wrapper. When `rootCourseId` is set, seed only that root's forward-reachable subgraph (via `subgraphFromRoot`); otherwise seed the full connected graph (unchanged).

**Files:**
- Create: `frontend/src/app/school-admin/academics/_components/PathwayEditor.tsx`
- Modify: `frontend/src/app/school-admin/academics/_components/PathwayEditorDialog.tsx`

- [ ] **Step 1: Create `PathwayEditor.tsx`** — copy the whole inner implementation of `PathwayEditorDialog` (the `useSchoolCourses` load, `toNode`, all `useState`/`useMemo`/`useCallback` editor logic, palette `<aside>`, canvas `<PathwayCanvas>`, header controls) into a new component:

```tsx
"use client";
// imports identical to those currently in PathwayEditorDialog (xyflow, hooks,
// pathwayGraph incl. subgraphFromRoot, layoutTopDown, PathwayCanvas, etc.)

interface PathwayEditorProps {
  rootCourseId?: string;
  onClose?: () => void;        // present in the dialog; the page passes a back-nav
  variant?: "dialog" | "page"; // controls outer chrome only
}

export function PathwayEditor({ rootCourseId, onClose, variant = "dialog" }: PathwayEditorProps) {
  // ... all existing state/logic from PathwayEditorDialog ...
}
```

In the seed `useEffect`, after `buildPathwayGraph(catalogCourses)`, branch on `rootCourseId`:

```tsx
const built = buildPathwayGraph(catalogCourses);
originalPrereqs.current = built.originalPrereqs;
const rfEdgesAll: Edge[] = built.edges.map((e) => ({ id: e.id, source: e.source, target: e.target, type: "prereq" }));

let nodeSet: Set<string>;
let rfEdges: Edge[];
if (rootCourseId) {
  const sub = subgraphFromRoot(built.edges, rootCourseId);
  nodeSet = sub.nodeIds;
  rfEdges = rfEdgesAll.filter((e) => sub.edgeIds.has(e.id));
} else {
  nodeSet = new Set(built.connectedIds);
  rfEdges = rfEdgesAll;
}
const initialNodes = catalog.filter((c) => nodeSet.has(c.id)).map(toNode);
setNodes(layoutTopDown(initialNodes, rfEdges));
setEdges(rfEdges);
```

Render the editor's header/palette/canvas exactly as today, but the outermost wrapper is a plain `div` (the dialog wrapper moves to `PathwayEditorDialog`). The close/cancel button calls `onClose?.()`.

- [ ] **Step 2: Slim `PathwayEditorDialog.tsx`** to a wrapper:

```tsx
"use client";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { PathwayEditor } from "./PathwayEditor";

interface PathwayEditorDialogProps { open: boolean; onClose: () => void; }

export function PathwayEditorDialog({ open, onClose }: PathwayEditorDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent showCloseButton={false} className="p-0 gap-0 flex flex-col"
        style={{ width: "95vw", maxWidth: "95vw", height: "92vh", background: "var(--admin-bg-card)", border: "1px solid var(--admin-border-default)" }}>
        <PathwayEditor variant="dialog" onClose={onClose} />
      </DialogContent>
    </Dialog>
  );
}
```

Note: the "discard unsaved changes" confirm and the dirty-state handling stay inside `PathwayEditor` (it owns `dirty`); `onClose` is called by the editor after the confirm.

- [ ] **Step 3: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Verify the All-pathways dialog still works** (manual, deferred to Task 6 Playwright) — no behavior change expected.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/school-admin/academics/_components/PathwayEditor.tsx frontend/src/app/school-admin/academics/_components/PathwayEditorDialog.tsx
git commit -m "refactor(academics): extract PathwayEditor; support root-scoped subgraph"
```

---

### Task 3: Per-pathway editor route

**Files:**
- Create: `frontend/src/app/school-admin/academics/pathways/[rootCourseId]/editor/page.tsx`

- [ ] **Step 1: Create the page**

```tsx
"use client";
import { use } from "react";
import Link from "next/link";
import { ArrowLeft, GitBranch } from "lucide-react";
import { PathwayEditor } from "../../../_components/PathwayEditor";

export default function PathwayEditorPage({ params }: { params: Promise<{ rootCourseId: string }> }) {
  const { rootCourseId } = use(params);
  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 0px)" }}>
      <div className="flex items-center gap-3 px-5 py-3" style={{ borderBottom: "1px solid var(--admin-border-default)" }}>
        <Link href="/school-admin/academics?tab=pathways"
          className="flex items-center gap-1.5"
          style={{ fontSize: 13, fontWeight: 500, color: "var(--admin-font-secondary)" }}>
          <ArrowLeft style={{ width: 15, height: 15 }} /> Back to Pathways
        </Link>
        <div className="flex items-center gap-2 ml-2" style={{ color: "var(--admin-font-primary)", fontSize: 15, fontWeight: 600 }}>
          <GitBranch style={{ width: 17, height: 17, color: "#065292" }} /> Pathway editor
        </div>
      </div>
      <div className="flex-1 min-h-0">
        <PathwayEditor variant="page" rootCourseId={rootCourseId} />
      </div>
    </div>
  );
}
```

(The root course's code/name is shown inside `PathwayEditor` once the catalog loads — the page header keeps a generic title to avoid an extra fetch. If the editor's header already prints the focused root, that suffices.)

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/school-admin/academics/pathways
git commit -m "feat(academics): per-pathway visual editor route"
```

---

### Task 4: Wire pathway-box navigation in `PathwaysPanel`

Make each chain box navigate to its root's editor page; keep inner chips editing prerequisites.

**Files:**
- Modify: `frontend/src/app/school-admin/academics/_components/PathwaysPanel.tsx`

- [ ] **Step 1: Add the router + make `CourseNode` stop propagation.** Import `useRouter` from `next/navigation`. In `CourseNode`, wrap the existing `onClick`:

```tsx
function CourseNode({ course, onClick }: { course: PathwayCourse; onClick: () => void }) {
  return (
    <button onClick={(e) => { e.stopPropagation(); onClick(); }} title={`${course.name} — click to edit prerequisites`} style={NODE_BTN}
      /* ...existing hover/focus handlers unchanged... */>
      {/* ...unchanged... */}
    </button>
  );
}
```

- [ ] **Step 2: Make the chain box clickable.** In `PathwaysPanel`, add `const router = useRouter();`. Change the chain `<div>` to a clickable row with an "Open editor" hint:

```tsx
{group.chains.map((chain) => (
  <div key={chain.map((c) => c.code).join("|")}
    onClick={() => router.push(`/school-admin/academics/pathways/${chain[0].courseId}/editor`)}
    title="Open this pathway's visual editor"
    className="group flex flex-wrap items-center gap-2 cursor-pointer"
    style={{ padding: "10px 12px", borderRadius: 8, background: "var(--admin-bg-hover)", border: "1px solid var(--admin-border-default)" }}>
    {chain.map((courseNode, i) => (
      <span key={courseNode.courseId + i} className="flex items-center gap-2">
        {i > 0 && <ArrowRight style={{ width: 14, height: 14, color: "var(--admin-font-tertiary)" }} />}
        <CourseNode course={courseNode} onClick={() => setEditCourse(courseNode)} />
      </span>
    ))}
    <span className="ml-auto opacity-0 group-hover:opacity-100 flex items-center gap-1"
      style={{ fontSize: 12, fontWeight: 600, color: "#065292", transition: "opacity 0.15s" }}>
      Open editor <ArrowRight style={{ width: 13, height: 13 }} />
    </span>
  </div>
))}
```

- [ ] **Step 3: Update the helper text** at line ~99 to mention both interactions:

```tsx
Derived from your course prerequisites — click a pathway to open its editor, or click a course to edit its prerequisites.
```

- [ ] **Step 4: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/school-admin/academics/_components/PathwaysPanel.tsx
git commit -m "feat(academics): pathway boxes open their own editor page"
```

---

### Task 5: Redesign `CourseDetailDialog` to FormMaps brand

**Files:**
- Modify: `frontend/src/app/school-admin/academics/_components/CourseDetailDialog.tsx`

- [ ] **Step 1: Rebrand the hero header** (line ~186). Replace the teal/blue gradient background with a brand-blue band and white text:

```tsx
{/* Hero header — FormMaps brand */}
<div style={{ padding: "24px 28px 20px", background: "#065292", borderBottom: "1px solid var(--admin-border-default)" }}>
  <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
    <span style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 4, background: "rgba(255,255,255,0.15)", color: "#fff" }}>{course.code}</span>
    {course.frameworkType && <Badge style={{ fontSize: 10, background: "rgba(255,255,255,0.18)", color: "#fff", border: "none" }}>{course.frameworkType}</Badge>}
    {course.isHonors && <Badge style={{ fontSize: 10, background: "#FFD600", color: "#111", border: "none" }}>Honors</Badge>}
    <Badge style={{ fontSize: 10, background: course.status === "active" ? "rgba(5,150,105,0.9)" : "rgba(255,255,255,0.18)", color: "#fff", border: "none" }}>{course.status || "active"}</Badge>
  </div>
  <h2 style={{ fontSize: 22, fontWeight: 700, color: "#fff", lineHeight: 1.3, margin: 0 }}>{course.name}</h2>
  {course.department && <div style={{ fontSize: 13, color: "rgba(255,255,255,0.85)", marginTop: 4 }}>{course.department}</div>}
</div>
```

- [ ] **Step 2: Rebrand the edit-mode Save button** (line ~164) from teal to brand blue:

```tsx
<button onClick={handleSave} disabled={updateCourse.isPending} style={{
  height: 36, borderRadius: 6, padding: "0 20px", fontSize: 13, fontWeight: 600,
  background: "#065292", color: "#fff", border: "none", cursor: "pointer",
  display: "flex", alignItems: "center", gap: 6,
  opacity: updateCourse.isPending ? 0.6 : 1,
}}>
```

- [ ] **Step 3: Keep the detail-view "Edit Course" button** brand blue (already `#065292`); confirm framework chip stays `#065292` and prerequisite chips stay amber. No field/logic changes. (The detail-view body — description, stats, enrollment bar, grade levels, prereq chain — keeps `var(--admin-*)` surfaces and is unchanged.)

- [ ] **Step 4: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/school-admin/academics/_components/CourseDetailDialog.tsx
git commit -m "feat(academics): redesign course detail dialog to FormMaps brand"
```

---

### Task 6: Verify, security-review, PR

**Files:** none (verification).

- [ ] **Step 1: tsc both dirs**

Run: `cd api && npx tsc --noEmit` then `cd frontend && npx tsc --noEmit`
Expected: both exit 0.

- [ ] **Step 2: Frontend jest** (curriculum + new subgraph test)

Run: `cd frontend && npx jest pathwayGraph`
Expected: PASS.

- [ ] **Step 3: Playwright live verify** in local dev as `test.schooladmin@formmaps.dev` (`/dev-env` if servers down):
  - Academics → Courses → open a course: hero is brand blue, not teal. Click **Edit Course** → change name/credits/framework/honors → **Save Changes** (brand blue) → toast "Course updated", list reflects the change.
  - Academics → Pathways: a chain box shows "Open editor →" on hover; click the box → URL `/school-admin/academics/pathways/<rootCourseId>/editor`, canvas shows that root's subgraph; "← Back to Pathways" returns to the tab. Click a course chip inside a box → the prerequisite editor opens (no navigation). The top "Open visual editor" button still opens the all-pathways dialog.

- [ ] **Step 4: security-reviewer** on the diff (frontend-only; confirm the `[rootCourseId]` route param is not a trust/IDOR surface — it only seeds a client-side graph; course/prereq mutations enforce school ownership server-side).

- [ ] **Step 5: Push + PR to develop**

```bash
git push origin feat/school-admin-academics-ui
gh pr create --base develop --head feat/school-admin-academics-ui --title "feat(academics): course dialog redesign + per-pathway editor pages" --body "<summary + verification>"
```

---

## Self-review notes
- **Spec coverage:** Item A → Task 5; Item B extract → Task 2, subgraph → Task 1, route → Task 3, panel wiring → Task 4; verify/ship → Task 6. All spec sections covered.
- **Type consistency:** `subgraphFromRoot(edges, rootId) → { nodeIds: Set, edgeIds: Set }` used identically in Task 1 (def) and Task 2 (consumer). `PathwayEditor` props `{ rootCourseId?, onClose?, variant? }` consistent across Tasks 2/3.
- **No placeholders:** all code shown inline.
