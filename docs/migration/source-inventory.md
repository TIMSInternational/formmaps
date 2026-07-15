# Source Inventory

Source inspected:

```text
/Users/federicotafur/formmaps-platform
```

## Current Shape

```text
api/        # Node.js + TypeScript + Express + Prisma
frontend/   # Next.js 16 + React 19 + TypeScript
docs/       # security, ops, frontend/backend notes
tests/      # cross-cutting test assets
```

## Current Frontend

Moved into:

```text
apps/web
```

Copied from:

```text
formmaps-platform/frontend
```

Excluded from the move:

- `node_modules`
- `.next`
- `.vercel`
- `.vscode`
- `test-results`
- `.env`
- `.env.local`
- `.DS_Store`

Observed frontend facts:

- Next.js 16
- React 19
- TypeScript strict mode enabled
- 183 app router page/layout/route files
- React Query + Axios API access
- cookie-first auth with in-memory bearer fallback
- English/Spanish i18n checks

## Current Backend

Legacy backend remains the behavior source of truth until migrated.

Observed backend facts:

- Express 5
- Prisma 6
- PostgreSQL/Aurora
- TypeScript strict mode disabled
- 52 route files
- 90 service files
- 123 Prisma models
- 177 API test/spec files
- RLS production enforcement enabled with `RLS_STRICT=1`
- runtime DB user is `formmaps_app`

Largest route files at inventory time:

```text
pcaapi.ts             732 lines
messages.ts           586 lines
resume.ts             579 lines
academic-gaps.ts      535 lines
video.ts              533 lines
user.ts               525 lines
counselor.ts          495 lines
stripe.ts             422 lines
student.ts            410 lines
coach.ts              409 lines
school-courses.ts     396 lines
parent.ts             395 lines
college.ts            395 lines
coach-bookings.ts     381 lines
test-scores.ts        378 lines
report.ts             364 lines
```

## Security Inputs To Preserve

- RLS is live in production.
- Missing tenant context must fail closed for protected routes.
- Auth is cookie-first.
- Counselor access is assignment-scoped.
- Parent access is child-link-scoped.
- Student access is own-record-scoped.
- School admin access is school-scoped.
- Super admin access is platform-scoped.
- Sensitive reporting must preserve existing role checks.

## Open Infrastructure Debt To Consider During Migration

- Aurora needs an enterprise failover/read replica posture.
- PCA/TIMS coKey rotation is still vendor-dependent.
- The legacy Node Dockerfile uses Node 20.
- Some dependency audit findings remain in the legacy app.
- `assignSequence` N+1 remains open in the legacy backend.
