# Domain status manifest

Closes formmaps#12, formmaps#13.

`GET /api/v1/migration/roadmap` used to return a hardcoded, 8-domain array baked into
`MigrationRoadmapProvider.cs`. It went stale almost immediately (e.g. showing `"planned"` for
domains that had shipped and cut over weeks earlier) because nothing forced it to be touched when a
domain's real status changed, and there was no single place that recorded live-vs-dark flag state at
all -- code-completion (tracked per-slice in `agentic-migration.manifest.json`) is not the same thing
as "actually serving production traffic."

## The fix

The single source of truth is now:

```
services/api/src/FormMaps.Application/Migration/Data/domain-status.manifest.json
```

It is embedded into `FormMaps.Application.dll` at build time (same pattern as the personality/LIA
data banks in `Assessments/Data`) and loaded once by `MigrationRoadmapProvider`. One entry per
product domain, with:

- `status` -- code-completion state (`planned` / `started` / `completed` / `deferred`), same
  vocabulary the old hardcoded array used.
- `liveInProd` -- whether the domain's `FORMMAPS_ROUTE_*_TO_DOTNET` flag(s) are actually flipped on
  and serving real production traffic. This is the field formmaps#13 asked for: a domain can be
  fully `status: "completed"` and still have `liveInProd: false` (see `messaging`, cut over
  2026-07-31 but deliberately left dark).
- `lastVerified` -- the date that status was last confirmed against reality (a real `curl`/canary
  check or an explicit deploy note), not just "when the code merged."

The API response (`GET /api/v1/migration/roadmap`) is unchanged in shape for existing fields
(`domain`, `currentOwner`, `targetOwner`, `firstMove`, `risk`, `status`) and adds `liveInProd` +
`lastVerified` as new, additive fields.

## How to keep it current

Update **one entry** in `domain-status.manifest.json` whenever a domain's real-world status changes:

1. **Code-completion changes** (a domain's .NET port moves from planned → started → completed, or
   gets deferred) -- update `status` and `firstMove`.
2. **A flag actually flips in production** -- update `liveInProd` only once you've verified it's
   really serving prod traffic (a canary `curl` or equivalent), not just merged to `main`. Git branch
   state has repeatedly under-counted real prod state in this project, because the live frontend
   deploys via a direct `vercel --prod` invocation, not a merge-gated pipeline.

Either way, bump that entry's `lastVerified` and the file's top-level `lastUpdated`, and reference
this file in the commit that completes or cuts over the domain, e.g.:

```
docs(migration): mark messaging live in domain-status manifest
```

This is domain-grained (≈11 rows), not slice-grained -- for per-task code-completion detail, see
`agentic-migration.manifest.json` in this same directory.
