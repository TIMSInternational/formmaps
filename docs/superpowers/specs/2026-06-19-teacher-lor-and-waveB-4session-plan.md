# Teacher Portal + Letter-of-Recommendation + Wave B5–B10 — 4-Session Delegation Plan

**Date:** 2026-06-19 · **Base:** `develop` (tip after B1–B4 merged: contains #146/#152/#155/#156)

This is the **shared source of truth** for 4 parallel Claude Code sessions. Each session: own git worktree/clone, own branch off **freshly-pulled `develop`**, own dev ports, FormMaps workflow (spec → TDD → `tsc`+vitest+jest+`next build` → codex adversarial review → security-reviewer → PR to `develop`). Never push `main`. Conventions: `CLAUDE.md`, `ENGINEERING.md`, `.claude/rules/`.

## Locked product decisions
- **LOR letter delivery = file upload (PDF) + status tracker.** Recommender uploads the actual letter; stored (S3 via the existing upload route pattern `api/src/routes/upload.ts`); downloadable by student (and counselor/admin). Status lifecycle stays.
- **Requestable recommenders = staff + teachers:** `counselor`, `school_admin`, and the new `teacher` role; same-school + active only. (Not students/parents/coaches.)

## ⚠️ Cross-session coordination (read first)
1. **`api/prisma/schema.prisma` is the single shared file.** Each session edits ONLY its own model region. Before any schema edit: `git pull origin develop`, make a small standalone schema commit, push/merge promptly. Announce in the team channel/user before editing. Regions: A→`TeacherInvite` (optional); B→`RecommendationRequest`; D→calendar event model. C aims for **no migration** (reuse `schoolAssessmentConfig` rows). FormMaps dev uses `npx prisma db push` + `prisma generate`; coordinate so two sessions don't push schema simultaneously.
2. **Ports:** A `3020/3021`, B `3030/3031`, C `3040/3041`, D `3050/3051`. (Existing sessions use 3000/3001 and 3010/3011.) Kill only by PID/port — never `pkill -f "tsx watch"`.
3. **Dependency:** **Session A lands the teacher ROLE + `app/teacher/` shell first.** B's "request a teacher" path and the teacher LOR-inbox depend on it. B starts its schema + student-tracker UI immediately and integrates teacher bits after A merges.
4. **Role vs evaluator collision:** `"teacher"` is ALREADY a 360 *evaluator* groupType/relationType (`lib/evaluationGroups.ts`, weight 1.1). The new `roleName: "teacher"` is a DIFFERENT subsystem. Don't let invite/seed feed the evaluation pipeline or vice versa.

---

## SESSION A — Teacher role + minimal portal (foundation, merge first)
**Branch:** `feat/teacher-role-portal` · ports 3020/3021 · **1 PR**
**Goal:** `teacher` is a first-class role with a portal shell, invite+onboarding, and a 360 pending-evaluations inbox (roadmap P1). NO gradebook (that's later P2–P4).
**Backend:** `auth.ts` — add `Teacher: "teacher"` to `ROLES` (:10), `case "teacher"` to `normalizeRole` (:21), `[ROLES.Teacher]` block to `ROLE_PERMISSIONS` (clone Counselor; include `students:read`, `evaluations:read/submit`, and a `recommendations:respond`-style perm for B to use). `seed.ts` — teacher Role row + `test.teacher@formmaps.dev` fixture. `schoolService.ts:165` inviteStaff `validRoles` += `"teacher"` (token onboarding like counselor). New `routes/teacher.ts` (clone `counselor.ts` onboarding verify/complete + authed routes); register in `index.ts`. Optional `TeacherInvite` model OR reuse `CounselorInvite`.
**Frontend (11 sync-points):** `lib/permissions.ts` (Roles + perm group), `lib/rolePermissionMap.ts`, `lib/roleUtils.ts` (normalizeRole + `roleHomeMap[Teacher]="/teacher"`), `lib/routePermissions.ts`, `hooks/usePermission.ts` (`isTeacher`), `components/AuthWrapper.tsx` (protected + onboarding routes), `school-admin/users/_components/InvitePanel.tsx` (InviteRole union + roleConfig). New `app/teacher/{layout.tsx,page.tsx,_components/TeacherSidebar.tsx, onboarding/, evaluations/}` cloned from `app/parent/`. New `hooks/useTeacherPortalQueries.ts`. (TS `Record<RoleName,...>` will force the maps you miss.)
**360 inbox:** `GET /api/v1/teacher/evaluations/pending` cloning `parent.ts:264` (EvaluationGroup where `evaluatorEmail = teacher.email`).
**Verify:** invite a teacher → onboard → lands `/teacher`; counselor sends a teacher a 360 → appears in inbox → complete via existing public flow.

## SESSION B — LOR enhancement (teacher recommenders + letter upload + tracker)
**Branch:** `feat/lor-enhancement` · ports 3030/3031 · **2 PRs** (B-1 backend+schema, B-2 frontend tracker) — B-1 can start now; teacher-role bits integrate after A merges.
**Goal:** students request staff+teachers; recommenders upload the letter; students get a full status tracker.
**Schema (`RecommendationRequest` ~:2767):** add letter storage — `letterFileKey String?`, `letterFileName String?`, `letterUploadedAt DateTime?` (S3 key, not a URL). Add missing `@@index([studentId])`. Consider relaxing `@@unique([studentId, recommenderId])` so a student can re-request after a decline (or reactivate the soft-deleted row) — design decision, document it.
**Backend (`recommendations.ts`, **extract a service** — file is >500 LOC):** add `"teacher"` to BOTH hardcoded role gates (`STAFF_ROLES` :73 and `/staff` `roleName:{in}` :184) and the `/dashboard` gate (:213) if teachers get a dashboard. New upload+download routes for the letter (model `routes/upload.ts`; S3; recommender uploads, ownership-checked; student/counselor downloads). On upload → status `submitted` + `submittedAt`. Fix the **un-escaped accept/decline emails** (XSS-in-email, :360-378) while here. Add tests (only `/staff` is covered today).
**Frontend:** student tracker — upgrade `app/dashboard/recommendations/_components/RecommendationList.tsx` to a real per-request **timeline/status tracker** + download-letter button. Recommender (teacher/counselor) **incoming-requests inbox** inside the portals (teacher inbox added to A's `app/teacher/`, counselor inbox already at `app/counselor/recommendations/`). StaffSearch already renders arbitrary roles — teachers appear automatically once backend returns them.
**Verify:** student requests a teacher → teacher sees it in `/teacher` → uploads PDF → student tracker shows submitted + downloads it.

## SESSION C — Assessments & reports (Wave B5–B7)
**Branch(es):** `feat/results-download` then `feat/insights-gating` then `feat/pca-download-gating` · ports 3040/3041 · **3 PRs**
- **B5 — `assessments?tab=results`:** per-student report **download**, and **completely redo the "View" actions pop-up** (current one inadequate → proper report viewer/modal). Backend likely exists (`getResultsList`/`getStudentResults` in `schoolAssessmentsService.ts`); focus on download endpoint(s) + the modal UX.
- **B6 — `/school-admin/insights`:** AI triggers **only at 90% AND 100% class completion**, and **auto at most once per school year** (track last-auto-run per school year — **reuse `schoolAssessmentConfig` rows like B3's INSIGHTS_CACHE → likely NO migration**; manual re-run still allowed). Reuse B3's `getSchoolAssessmentCompletion` / `computeStudentCompletion` (now on develop, `schoolAssessmentsService.ts`) for the % math — do NOT reinvent it.
- **B7 — `reports?tab=pca`:** PCA download button enabled **only if the student completed the PCA** (else disabled/hidden). Reuse `checkAssessmentCompletion` / pca completion signals.
**Note:** B3 already shipped the 100% gate on the *assessments* page; B6 is the separate *insights* page with the 90/100 + once-a-year rule.

## SESSION D — Calendar / messages / settings (Wave B8–B10)
**Branch(es):** `feat/calendar-multiday` then `feat/messages-broadcast` then `feat/settings-profile` · ports 3050/3051 · **3 PRs**
- **B8 — `/school-admin/calendar`:** holidays + assessment windows support **multi-day (date-range) events**. Backend calendar model (in `school-grades.ts`) + UI; add `endDate` (schema).
- **B9 — `/school-admin/messages` + `?tab=broadcast`:** make messaging fully functional; **expand the broadcast textbox** (cleaner/larger) and make **broadcast actually send** end-to-end. (NB: `messages.ts` was touched by B4's guard — pull latest.)
- **B10 — `/school-admin/settings` + `?tab=profile`:** all cards functional; **account info displayed + editable**; **School Profile editable + persisted.**

---

## Roadmap pointer
Full Wave B definitions: `~/.claude/plans/let-s-do-a-complete-elegant-lake.md` (B1–B10). Teacher track P2–P4 (class sections, granular gradebook, student visibility) remain **after** this.
