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
FM-DOTNET-004-security-middleware-parity
```

The request-context and JWT/RLS-decision foundation is implemented. The next
agentic slice ports production API security middleware parity before database
connectivity and product endpoints begin.
