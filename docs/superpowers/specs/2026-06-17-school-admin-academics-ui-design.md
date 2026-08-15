# School-Admin Academics UI — Design

**Date:** 2026-06-17
**Branch:** `feat/school-admin-academics-ui` (off `develop`)
**Scope:** Two changes on `/school-admin/academics` — (A) redesign the course detail/edit dialog to the FormMaps brand UI; (B) give each pathway its own visual-editor page (routed on the pathway's root course).

---

## Context (current state)

The Academics page (`frontend/src/app/school-admin/academics/page.tsx`) has 3 tabs: **Courses** (`CoursesPanel`), **Curriculum** (`CurriculumPanel`), **Pathways** (`PathwaysPanel`). All editing happens in modal dialogs; there are no dynamic routes under `academics/` except `gaps/[studentId]`.

- **Course detail/edit:** `_components/CourseDetailDialog.tsx`. A modal with a teal/blue gradient hero. It **already** has an edit mode covering every course field, and saves via `useUpdateSchoolCourse` → `PUT /api/v1/school-admin/courses/:courseId` (endpoint exists). The Save button is off-brand teal `#14b8a6`.
- **Pathways:** `_components/PathwaysPanel.tsx` renders pathway "boxes" — each box is one **chain** (`PathwayCourse[]`), grouped by department. Pathways are **derived on the fly** from the course prerequisite graph (`computePathways(schoolId)` in `schoolCoursesService.ts`, served by `GET /api/v1/school-admin/courses/pathways`). **There is no Pathway entity, table, or id.** Clicking a course chip opens `EditPrerequisitesDialog`. A single "Open visual editor" button opens `PathwayEditorDialog` — a full-screen modal showing **all** pathways at once via `PathwayCanvas` (`@xyflow/react`).

---

## Item A — Course detail dialog redesign (in place)

**Decision:** Redesign the existing modal in place (no new route). No field or API changes — purely visual + a clearer Edit affordance.

Changes in `CourseDetailDialog.tsx`:
- **Hero header:** replace the teal/blue gradient (`linear-gradient(135deg, rgba(20,184,166,0.08), rgba(59,130,246,0.06))`) with a FormMaps-brand header — a `#065292` band with white course code/name/department (or a clean white header with brand accents), consistent with other admin surfaces.
- **Save button (edit mode):** teal `#14b8a6` → brand `#065292`, hover `#054a83`.
- **Badges:** framework chip on brand blue `#065292`; honors amber `#d97706`; status green `#059669` (active) / muted otherwise. Surfaces keep `var(--admin-*)` tokens so dark mode is preserved.
- **Edit affordance:** "Edit Course" stays as the primary action (brand blue), made clearly primary; optionally a pencil icon in the header.
- **Edit form:** unchanged fields (name, description, department, credits, max enrollment, grade levels, framework, prerequisites, honors); only the footer/Save button restyled to brand.

**No backend change.** `PUT /api/v1/school-admin/courses/:courseId` already accepts all these fields.

---

## Item B — Per-pathway visual editor page

**Decisions:**
- A pathway is identified for routing by its **root course id** (`chain[0].courseId`).
- The editor page shows the **whole forward-reachable subgraph** from that root (root + every course that transitively requires it), not just the single clicked chain.
- The existing shared full-screen editor is **kept** as an "All pathways" overview/editor.

### 1. Extract a reusable `PathwayEditor` component
Pull the editor body and logic out of `PathwayEditorDialog.tsx` into a new presentational+logic component `_components/PathwayEditor.tsx` (seed graph, palette, connect/drop, cycle guard, `diffPrereqs`/`updatePrerequisites` save, `readOnly` catalog-incomplete guard, `PathwayCanvas`). This keeps each file focused and avoids duplicating ~200 lines.

Props: `{ rootCourseId?: string; onClose?: () => void }`.
- **`rootCourseId` absent** → seed the full connected graph (today's behavior). `PathwayEditorDialog` becomes a thin wrapper rendering `<PathwayEditor onClose={…} />` inside the Dialog (All-pathways view, unchanged behavior).
- **`rootCourseId` present** → after `buildPathwayGraph`, seed the canvas with only the forward-reachable set from the root (BFS/DFS over prereq edges where `source = prerequisite`, `target = dependent`, starting at the root). The palette still lists the full catalog so prerequisites from anywhere can be added. Same wholesale-save guard (read-only when `catalogData.total > catalog.length`).

### 2. New route
`frontend/src/app/school-admin/academics/pathways/[rootCourseId]/editor/page.tsx`:
- Full FormMaps-styled page (not a modal). Header shows the root course code/name (resolved from the loaded catalog) + a "← Back to Pathways" link (`/school-admin/academics?tab=pathways`).
- Renders `<PathwayEditor rootCourseId={params.rootCourseId} />`.
- Edge cases: unknown/empty root id, or a root with no subgraph → show a friendly empty/back state.

### 3. Wire the pathway boxes (`PathwaysPanel.tsx`)
- Each chain box (`<div>` wrapping a chain) becomes clickable → `router.push('/school-admin/academics/pathways/' + chain[0].courseId + '/editor')`, with a right-aligned "Open editor →" hint shown on hover.
- The inner course chips (`CourseNode`) keep their existing behavior: `onClick` calls `e.stopPropagation()` then `setEditCourse(courseNode)` (edit that course's prerequisites), so clicking a chip does **not** also navigate.
- The top-level "Open visual editor" button stays (All-pathways `PathwayEditorDialog`).

**No backend change.** Pathways stay derived; the page filters the existing catalog/pathways data client-side. No single-pathway API is added.

---

## Components & boundaries
- `PathwayEditor` (new) — owns all editor logic; consumed by both the dialog and the per-pathway page. Testable in isolation via its `rootCourseId` prop.
- `PathwayEditorDialog` (slimmed) — modal wrapper around `PathwayEditor` for the All-pathways view.
- `pathways/[rootCourseId]/editor/page.tsx` (new) — route shell.
- `CourseDetailDialog` (restyled) — same responsibilities, brand UI.
- `PathwaysPanel` (wired) — adds navigation on chain boxes.

## Testing / verification
- `tsc --noEmit` clean (api + frontend); existing curriculum jest tests still pass.
- Playwright live verify as `test.schooladmin@formmaps.dev` in local dev:
  - Course: open a course → brand-styled detail → Edit → change fields (incl. credits/framework/honors) → Save → values persist + list refreshes.
  - Pathways: click a pathway box → lands on `/…/pathways/[rootCourseId]/editor` showing that root's subgraph; back link returns to the Pathways tab; clicking a chip still opens the prerequisite editor; the shared "Open visual editor" still opens the All-pathways view.
- security-reviewer before PR (frontend-only, but the route reads a path param → confirm no trust/IDOR surface; course/prereq mutations already enforce school ownership server-side).

## Out of scope (YAGNI)
- No Pathway entity/table/migration.
- No single-pathway API.
- No changes to `CurriculumPanel`, the prerequisite-chain algorithm, or `computePathways`.
