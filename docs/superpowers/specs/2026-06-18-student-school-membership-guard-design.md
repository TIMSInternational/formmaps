# School-membership guard for school-scoped student features (Wave B / B4) — Design

**Date:** 2026-06-18
**Branch:** `feat/student-school-requisite` (off `develop`)
**Scope:** Make the "school-less student is excluded from school features, included in own features" invariant **explicit, consistent, and regression-proof** — via one shared guard + a test suite. No behavior change for affiliated users; no signup/session block; no schema/migration.

---

## Context & reframed requirement

B4 as written said school membership must be a "hard requisite … a student without a `schoolId` cannot be created." The product owner clarified the actual intent: **students may create unaffiliated accounts and use the non-school parts of the app; they must only be kept out of the *school* functionalities.** So this is purely the "blocked from school-scoped flows" half — not a creation/session block.

### Audit finding (the important part)
The behavior already holds everywhere audited. `schoolId` is nullable (`schema.prisma:206`); the only path that creates a school-less student is public `POST /authapi/signup` (intended, kept). Every student-reachable **school-scoped** endpoint already guards a missing school before doing school work:
- `messages` contacts → empty list (`messages.ts:85`); message-send → `sameSchool = !!currentUser.schoolId && …` is false for a null school, and student→counselor requires an explicit assignment, so an unaffiliated student can reach no one (`messages.ts:225,241-256`).
- `report/benchmark` → 400 (`report.ts:290`); `video/enabled` → `{enabled:false}` (`video.ts:19`); `course-plan` GET → empty, POST → 400 (`course-plan.ts:19,55`); `college` → 400 (`college.ts:16`); `academic-gaps`/`alerts` → 400 + role-gated to staff (`academic-gaps.ts:15`, `alerts.ts:17`); `recommendations` → guarded (`recommendations.ts:82,174`).
- Own-data features (assessments, career, profile) key off `req.userId`, not `schoolId`, so they work for unaffiliated students.

So there is **no data-bleed gap and no incorrectly-blocked non-school feature.** What's weak is *architectural*: the invariant is enforced by ~8 **ad-hoc, inconsistent (`"No school"` vs `"No school linked"` vs empty), untested** checks. A new school-scoped endpoint can silently omit the check and reintroduce the bug class (incl. a `where: { schoolId: null }` cross-unaffiliated bleed). B4 makes the invariant a named, tested guard.

---

## Design

### 1. Shared guard (`api/src/lib/access.ts`)
```ts
export const NO_SCHOOL_MESSAGE = "You are not affiliated with a school";

export type SchoolMembership = { ok: true; schoolId: string } | { ok: false };

/** Central guard for school-scoped features. Returns the caller's schoolId, or
 *  ok:false when the user (e.g. a self-registered student) has no school.
 *  Pure — takes the already-fetched user, adds no query. */
export function requireSchoolMembership(
  user: { schoolId?: string | null } | null | undefined,
): SchoolMembership {
  return user && user.schoolId ? { ok: true, schoolId: user.schoolId } : { ok: false };
}
```
Pure and dependency-free (the existing `lib/access.ts` is the access-control home — `canAccessUser`/`resolveSecureUserId`). Call sites already fetch the user, so no extra DB round-trip.

### 2. Refactor the ad-hoc checks to the guard (behavior-preserving)
Replace `if (!user?.schoolId) { … }` in the student-facing school-scoped endpoints with the guard, keeping **each endpoint's existing response *policy*** (this is correct REST, not inconsistency):
- **Reads/lists** (GET) → unchanged: return empty data, 200 (`course-plan` GET, `messages` contacts, `video/enabled`).
- **Writes/actions** → denial uses **`NO_SCHOOL_MESSAGE`** (message unified). **Status codes are preserved** (no 400↔403 flips) to avoid breaking any frontend error handling — message text is the only thing standardized.

Files: `messages.ts`, `course-plan.ts`, `college.ts`, `recommendations.ts`, `video.ts` (student-facing); `report.ts`, `academic-gaps.ts`, `alerts.ts` adopt the guard/constant in their `getUserAndSchool`-style helpers for consistency (these are also staff-gated, so no student impact). Each change is a 1–3 line swap; affiliated-user behavior is byte-for-byte unchanged.

**No signup change, no `authenticate`-middleware session block, no `schema.prisma`/migration.** Unaffiliated students keep full access to own-data features.

### 3. Regression tests — lock the invariant
New `api/src/__tests__/student-school-membership.test.ts` (supertest + mocked prisma + real `app`, `studentToken("")` = school-less student):
- **Unit:** `requireSchoolMembership` → `ok:false` for null/undefined user and `schoolId: null`/`""`; `ok:true` + schoolId for a set value.
- **Integration, school-less student is excluded from school features:** representative endpoints return the guarded result and **never** query with a null schoolId — e.g. `GET /messages/contacts` → `200 []`; `POST /student/course-plan/courses` → denied with `NO_SCHOOL_MESSAGE`; `GET /reports/benchmark` → denied.
- **Integration, affiliated student is unaffected:** same endpoints with `studentToken("s1")` proceed (proves the refactor preserved behavior).
- **Integration, non-school feature works school-less:** an own-data endpoint keyed by `userId` (e.g. assessment exam list) returns 200 for `studentToken("")`.

The integration tests double as the copy-paste template + guardrail so a future school-scoped endpoint that forgets the guard fails CI.

---

## Edge cases
- **Parents/coaches/super-admin are school-less by design** — the guard is only applied on *school-scoped* paths; their own flows (marketplace, parent links, platform admin) don't call it, so they're unaffected.
- **Empty-string schoolId in JWT** (`generateAccessToken` writes `schoolId: user.schoolId || ""`) → `req.schoolId` becomes `undefined` and the DB `schoolId` is null; the guard treats both as `ok:false`.
- **Affiliated student** → identical responses pre/post refactor (locked by the integration tests).

## Verification
- `cd api && npx tsc --noEmit && npm test`; `cd frontend && npx tsc --noEmit && npx jest && npx next build` (no frontend logic change expected; build sanity only).
- codex adversarial review + `security-reviewer` on the diff.
- Live (API): `studentToken`-equivalent — confirm a school-less student is denied on a school endpoint and 200 on an own-data endpoint; an affiliated student is unchanged.
- PR to `develop` (FormMaps PR body + Claude trailer). Never push `main`.
