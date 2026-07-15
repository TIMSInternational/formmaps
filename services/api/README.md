# FormMaps API

.NET 10 backend for FormMaps.

This service replaces the legacy Node/Express API incrementally. The current
Node API is the behavioral specification until each domain has been migrated,
tested, and cut over.

## Commands

```bash
dotnet restore FormMaps.slnx
dotnet build FormMaps.slnx
dotnet test FormMaps.slnx
dotnet run --project src/FormMaps.Api
```

From the repository root:

```bash
npm run api:docker:build
npm run api:staging-canary -- --health-only
```

The production container listens on port `8080` and requires `JWT_SECRET` and a
FormMaps database connection string (`DATABASE_URL`, `Database:ConnectionString`,
or `ConnectionStrings:FormMaps`) when `ASPNETCORE_ENVIRONMENT=Production`.

See:

- `docs/api/architecture.md`
- `docs/api/security.md`
- `docs/api/migration-plan.md`
- `docs/api/interop.md`
