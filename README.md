# FormMaps

FormMaps product monorepo.

This repository is the long-term home for the FormMaps product: React/Next.js
frontend, .NET 10 backend, workers, shared frontend packages, migration docs,
and product-specific infrastructure.

## Why One Repo

FormMaps is one product. Its frontend and backend will change together during
the Node-to-.NET migration, especially when a screen moves from the legacy API
to the new C# backend.

Keeping the product in one repo makes coordinated changes simpler:

- frontend route or screen changes
- .NET endpoint changes
- typed API client updates
- migration feature flags
- contract and security tests
- deployment notes

Product-to-product contracts remain separate in `TIMSInternational/tims-interop`.

## Repository Layout

```text
apps/web/                 # React/Next.js FormMaps application
services/api/             # .NET 10 API, workers, tests, and solution
packages/ui/              # shared FormMaps UI primitives
packages/api-client/      # typed clients for FormMaps API and interop calls
docs/web/                 # frontend architecture and migration notes
docs/api/                 # .NET API architecture, security, migration notes
docs/migration/           # product-level migration plans and inventories
docs/interop/             # FormMaps side of TIMS ATS interop
```

## Root Commands

```bash
npm run web:dev
npm run web:build
npm run web:test
npm run api:restore
npm run api:build
npm run api:test
npm run api:dev
```

## Migration Strategy

The existing production FormMaps platform remains the source of truth until a
domain is migrated and verified.

```text
apps/web
  -> legacy Node API for unmigrated domains
  -> services/api .NET endpoints for migrated domains
  -> tims-interop contracts for product-to-product handoffs
```

The frontend should be moved mostly as-is first. The backend should be rebuilt
in C#/.NET 10 using the current Node backend behavior, data model, tests,
production security rules, and edge cases as the specification.

## Backend

The .NET backend lives in `services/api`.

```bash
cd services/api
dotnet restore FormMaps.slnx
dotnet build FormMaps.slnx
dotnet test FormMaps.slnx
dotnet run --project src/FormMaps.Api
```

Health endpoints:

```text
GET /health
GET /version
```

## Frontend

The current FormMaps frontend has been moved into:

```text
apps/web
```

Workflow:

```bash
cd apps/web
npm install
npm run dev
npm run lint
npm run typecheck
npm test
```

## Related Repositories

- `TIMSInternational/tims-interop` - shared product-to-product contracts
- `TIMSInternational/tims-ats` - TIMS ATS product monorepo

Superseded split repos:

- `TIMSInternational/formmaps-web`
- `TIMSInternational/formmaps-api`
