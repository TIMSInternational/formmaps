# FormMaps Web Architecture

## Purpose

`formmaps-web` is the browser-facing application for FormMaps. It should stay a
React/Next.js product surface and should not absorb backend domain logic during
the .NET migration.

## Frontend Responsibilities

- render role-specific product experiences
- manage navigation and client state
- call typed backend clients
- handle optimistic UI where appropriate
- enforce presentation-level permission hiding
- report browser telemetry and user-visible errors

## Backend Responsibilities

The frontend must delegate these to `formmaps-api`:

- authorization decisions
- tenant isolation
- assessment scoring
- counselor/student assignment rules
- FormMaps-to-TIMS data sharing consent
- persistence and audit logging

## API Boundary

All backend calls should flow through `packages/api-client`. Product screens
should not call `fetch` directly except inside API client modules.

```text
app route/component
  -> feature service/hook
  -> packages/api-client
  -> backend
```

This boundary is what lets us migrate backend endpoints from the legacy Node API
to .NET without rewriting every screen.
