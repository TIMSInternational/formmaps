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

See:

- `docs/api/architecture.md`
- `docs/api/security.md`
- `docs/api/migration-plan.md`
- `docs/api/interop.md`
