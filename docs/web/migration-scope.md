# FormMaps Web Migration Scope

## Source

Initial source application:

```text
formmaps-platform/frontend
```

## Target

Target repository:

```text
TIMSInternational/formmaps-web
```

## Principles

- Preserve current production behavior before redesigning anything.
- Move the frontend separately from backend migration.
- Keep route compatibility unless a route change is explicitly approved.
- Convert backend access to typed clients before cutting over .NET endpoints.
- Use feature flags for backend route switches.

## Initial Work Packages

1. Inventory current frontend routes, environment variables, and build scripts.
2. Move the Next.js app into `apps/web`.
3. Move shared frontend code into `packages/ui` and `packages/api-client`.
4. Add CI for lint, typecheck, test, and production build.
5. Connect Vercel preview deployments.
6. Add feature flags for legacy Node API versus .NET API routing.
