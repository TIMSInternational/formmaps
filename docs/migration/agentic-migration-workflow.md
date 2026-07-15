# Agentic Migration Workflow

## Purpose

Make the FormMaps migration executable by agents without losing engineering
control. Agents should operate on one encoded slice at a time, produce explicit
outputs, and leave verification evidence.

## Encoding

Each migration slice is encoded in:

```text
docs/migration/agentic-migration.manifest.json
```

Each task defines:

- `id`
- `status`
- `goal`
- `inputs`
- `ownedPaths`
- `outputs`
- `guardrails`
- `validation`

## Decoding Rules

Before implementing a task, an agent must:

1. Read the manifest task.
2. Read all listed input files.
3. Touch only listed owned paths unless the task is updated.
4. Preserve RLS, tenant isolation, and role/assignment scoping.
5. Add or update tests in the same slice.
6. Run the listed validation commands.
7. Update the task status and notes only after the code is merged or committed.

## Guardrails

- Do not big-bang migrate domains.
- Do not trust spoofable headers outside Development.
- Do not bypass tenant context for protected endpoints.
- Do not write EF migrations against legacy-owned tables until table ownership is
  explicitly assigned.
- Do not send FormMaps data to TIMS ATS outside `tims-interop` contracts.

## Current Active Slice

```text
FM-DOTNET-008-staging-benchmark-canary
```

The request-context, JWT/RLS-decision foundation, and production security
middleware parity are implemented. The RLS-safe Npgsql read session layer is
also implemented, and `/api/v1/reports/benchmark` is the first read-only
product endpoint. The benchmark route now has an opt-in .NET web rewrite,
documented rollback path, a gated real-database smoke test, a production API
container, a staging canary runner, and a deployed staging App Runner service:
`https://zsmkrbkhc7.us-east-1.awsapprunner.com`.

The health-only staging deployment gate has passed. The active gate is now
product-data validation: rotate the copied staging database credential, generate
a real staging school analytics token, run the authenticated benchmark canary,
run the gated staging database smoke, verify staging web route ownership, and
prove rollback before production traffic moves to .NET.
