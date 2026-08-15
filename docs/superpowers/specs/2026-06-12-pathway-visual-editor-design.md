# Pathway Visual Editor — Design

**Date:** 2026-06-12
**Status:** Approved by user
**Context:** Course Pathways (PR #75/#76) derives pathways from the prereq graph and retired the drag-and-drop sequence builder. The chip-based EditPrerequisitesDialog is functional but hard to reason with for multi-course curriculum work. This feature brings back the visual drag-and-drop editing experience as a direct editor over prerequisites — the derived-pathways data model is unchanged.

## Decisions (user-confirmed)

1. **Data model:** the canvas edits course `prerequisites` directly. Drawing an arrow A→B means "A is a prerequisite of B"; deleting the arrow removes it. Pathways stay 100% derived. Stored sequence templates do NOT come back.
2. **Placement:** full-screen pop-up (~95vw × 92vh dialog) opened from an "Open visual editor" button on the Academics → Pathways tab.
3. **Scope:** whole catalog on one auto-laid-out canvas, with a department filter that dims/zooms (never hides cross-department edges). Unconnected courses live in a searchable side palette.
4. **Save model:** local draft + explicit Save button. Save diffs changed courses and writes via the existing `PUT /api/v1/school-admin/courses/:courseId/prerequisites`. **No backend changes.**

## Architecture

Frontend-only. New components under `frontend/src/app/school-admin/academics/_components/`:

- **`PathwayEditorDialog.tsx`** — the full-screen dialog shell: header (title, department filter, Save, close), React Flow canvas, side palette. Owns draft state.
- **Reused:** `school-admin/sequences/_components/` `CourseNode`, `DashedEdge`, `ConnectionLine` (already styled, currently orphaned); `@xyflow/react` v12 (already a dependency).
- **Resurrected from git history:** `layoutTopDown.ts` (deleted in PR #75, commit `147cacf~1`) for the auto-layout.
- A small pure module **`pathwayGraph.ts`** (same folder or `lib/`) holding the testable logic: build nodes/edges from catalog rows, cycle detection (`wouldCreateCycle(edges, source, target)`), and diff computation (`diffPrereqs(original, draft) → Array<{courseId, courseIds, corequisites}>`).

### Data flow

1. Open: fetch catalog via existing `useSchoolCourses({ limit: 500 })`.
2. Build graph: nodes = active courses with ≥1 prereq edge (others → palette); edges from each course's `prerequisites` codes resolved against the catalog (trim+uppercase, same normalization as the backend/eligibility engine). `layoutTopDown` positions nodes.
3. Edit: connect/delete edges mutate local draft edge state only.
4. Save: `diffPrereqs` produces the changed-course set → `Promise.all` of existing `useUpdatePrerequisites` calls (each payload: `prerequisiteRules: [{type:"AND", courseIds}]`, `corequisites` echoed from the course's current row). Invalidate `curriculumKeys.pathways()` + `schoolCourses()` → PathwaysPanel re-renders derived chains.

## Interaction details

- **Add prereq:** drag from source node's bottom handle to target's top handle.
- **Remove prereq:** select edge + Delete key, or click the edge's ✕ (DashedEdge affordance).
- **Palette:** searchable list of unconnected courses; drag onto canvas to place; node joins the graph once connected. Removing a node's last edge returns it to the palette on next open (canvas keeps it placed for the session).
- **Department filter:** dropdown, default "All departments". Selecting one dims all nodes/edges except that department's courses and their direct cross-department neighbors, and zooms to fit the highlighted subgraph.
- **Unsaved-changes guard:** closing with a dirty draft asks "Discard changes?".

## Guard rails

- **Cycle prevention:** reject connections where the target already reaches the source (in-memory reachability over draft edges); toast explains (e.g. "ALG2 already requires ALG1 — this would create a loop").
- **Self-edges and duplicate edges:** rejected silently/with toast.
- **Catalog-completeness guard:** if `catalogData.total > loaded`, the editor opens **read-only** with the same warning as EditPrerequisitesDialog (the PUT endpoint replaces wholesale; a partial catalog could wipe data).
- **Corequisites:** never edited here; each save echoes the course's current `corequisites` back.

## Error handling

- Per-course save failures: toast per failed course (by code), dialog stays open, successfully saved courses are committed (each course's prereq list is independently valid — partial save cannot corrupt the graph; reopening shows DB truth).
- Catalog load failure: error state with retry inside the dialog.

## Testing

- **Jest (pure logic, `pathwayGraph.ts`):** graph build from catalog fixtures (normalization, palette split), `wouldCreateCycle` (direct, transitive, self), `diffPrereqs` (only changed courses, coreq preservation, add+remove mixed).
- **Jest (component):** dialog opens from PathwaysPanel, read-only guard when catalog incomplete, Save calls `updatePrerequisites` with the diffed payloads, unsaved-changes guard.
- **Live QA (Playwright, dev, test.schooladmin):** open editor, drag a new edge, save, verify the derived chain appears on the Pathways tab; delete the edge, save, verify revert. (jsdom cannot simulate React Flow drags — handler-level tests + live QA cover this.)

## Out of scope (YAGNI)

- Creating/editing/deleting courses from the canvas (use the Courses tab).
- AND/OR prerequisite rule types (data model is a flat AND list).
- Persisted node positions (layout recomputed each open).
- Stored sequence templates (retired; not coming back).
