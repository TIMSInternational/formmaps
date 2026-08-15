# Audit-Events Domain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a persistent, immutable, PII-free `audit_events` table plus a write abstraction and a
permission-gated read endpoint, then retrofit it into the 7 existing writer classes that already claim
"PII-free audit" but today only emit a structured log line — per the approved spec.

**Architecture:** New system-owned table (`RequestContext.System()` bypass for both write and read,
RLS-locked to bypass-only sessions, `REVOKE`+`ENABLE ALWAYS`-trigger immutability). `IAuditEventWriter`
follows the `BillingShadowRepository` (Domain 9a) convention exactly. Retrofit tasks are additive
(existing log lines are kept) — inject `IAuditEventWriter`, call `WriteAsync` at the same post-commit
point the log line already fires from.

**Tech Stack:** C#/.NET 10 minimal APIs, Npgsql (raw SQL, no ORM), Testcontainers (Postgres) for
integration tests, xUnit.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-31-audit-events-design.md` — this plan implements it exactly.
  Do not expand scope to authN/authZ-denial audit, new admin-mutation wiring, Domain 9a's live billing
  audit, or TIMS-interop events — all explicitly deferred in the spec's Scope section.
- Repo: `/Users/federicotafur/Desktop/NexaDev/clients/tims-international/github/formmaps`, branch
  `main`, `services/api/FormMaps.slnx`. No Actions CI right now (account billing block) — `dotnet build`
  + `dotnet test` are the only trustworthy verification.
- `audit_events` is written to ONLY via `IAuditEventWriter` and read ONLY via `IAuditEventReader` —
  both always open their DB session under `RequestContext.System()`. No task in this plan opens a
  tenant-scoped (Identity-mode) session against this table; the RLS policy would return zero rows
  for one anyway (see Task 1).
- Follow existing codebase conventions exactly: raw SQL via `Command()`/`AddParameter()` static
  helpers (see `MessagesRepository.cs`, `BillingShadowRepository.cs`), repository interface in
  `FormMaps.Application`, implementation in `FormMaps.Infrastructure`, endpoints in
  `FormMaps.Api/Endpoints/`, primary-constructor DI (see `LiaSessionWriter`), test-authentication via
  `DevelopmentRequestContextFactory` headers under `builder.UseEnvironment(Environments.Development)`
  (see `LiaSessionEndpointsTests.cs`).
- Retrofit tasks (8-14) use a **simplified** copy of the `audit_events` DDL (table shape only, no RLS
  policy, no immutability trigger) appended to each domain's existing Testcontainers fixture schema
  file. Immutability itself is proven once, thoroughly, in Task 4 — repeating the trigger/RLS setup
  (and the DISABLE-TRIGGER dance needed to reset it between tests) in seven unrelated fixtures would
  add test friction for zero additional coverage.
- Commit after every task. Do not push (ask before pushing, per standing convention).

---

### Task 1: `audit_events` schema — table, RLS, immutability

**Files:**
- Create: `infra/aws/sql/audit-events-schema.sql`
- Create: `services/api/tests/FormMaps.IntegrationTests/Audit/Data/audit-events-schema.sql` (copy)

**Interfaces:**
- Produces: table `audit_events` — consumed by Task 3 (`AuditEventWriter`), Task 5 (`AuditEventReader`).

No test cycle for this task (it's schema, not logic) — verified by Task 3's and Task 4's integration
tests successfully using it via Testcontainers.

- [ ] **Step 1: Write the production schema script**

```sql
-- infra/aws/sql/audit-events-schema.sql
-- New, .NET-owned, cross-tenant audit trail. NOT legacy Node's "audit_logs" table
-- (formmaps-platform/api/prisma/schema.prisma) -- that table is untouched, stays Node-owned
-- until Domain 11 retires Node. See spec docs/superpowers/specs/2026-07-31-audit-events-design.md
-- for full rationale (RLS-bypass-only access, built-in immutability, PII-free schema).
-- Idempotent: safe to run multiple times.

CREATE TABLE IF NOT EXISTS "audit_events" (
    "id" TEXT PRIMARY KEY,
    "occurredAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "eventType" TEXT NOT NULL,
    "actorUserId" TEXT,
    "actorRole" TEXT,
    "schoolId" TEXT,
    "subjectType" TEXT NOT NULL,
    "subjectId" TEXT,
    "outcome" TEXT NOT NULL DEFAULT 'success',
    "metadata" JSONB
);

CREATE INDEX IF NOT EXISTS "audit_events_eventType_idx" ON "audit_events" ("eventType");
CREATE INDEX IF NOT EXISTS "audit_events_actorUserId_idx" ON "audit_events" ("actorUserId");
CREATE INDEX IF NOT EXISTS "audit_events_subject_idx" ON "audit_events" ("subjectType", "subjectId");
CREATE INDEX IF NOT EXISTS "audit_events_occurredAt_idx" ON "audit_events" ("occurredAt" DESC);

-- ---------------------------------------------------------------------------
-- RLS: bypass-only. An ordinary tenant-scoped (Identity-mode) RLS session gets
-- ZERO rows and cannot write. Only RequestContext.System() sessions (app.bypass_rls
-- = 'on') can touch this table -- IAuditEventWriter and the audit-read endpoint,
-- both always opened under System(). Stronger than legacy audit_logs (no RLS at
-- all, app-layer-gate-only) by design -- see spec's "Read-access model".
-- ---------------------------------------------------------------------------
ALTER TABLE "audit_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_events" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_events_bypass_only" ON "audit_events";
CREATE POLICY "audit_events_bypass_only" ON "audit_events"
    USING (current_setting('app.bypass_rls', true) = 'on')
    WITH CHECK (current_setting('app.bypass_rls', true) = 'on');

-- ---------------------------------------------------------------------------
-- Immutability (SOC2 CC7.2 / ISO A.8.15): rows may be INSERTed, never
-- UPDATEd/DELETEd/TRUNCATEd, by ANY role including the table owner. Modeled
-- structurally after tims-ats/TimsSuite's AuditImmutability CB-1 pattern
-- (different repo/schema, referenced as a template only, not imported).
-- REVOKE alone does not close the session_replication_role='replica' bypass --
-- both the REVOKE and the ENABLE ALWAYS trigger are required together. See
-- Task 4 for the tests proving both halves.
-- ---------------------------------------------------------------------------
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "audit_events" FROM PUBLIC;

CREATE OR REPLACE FUNCTION audit_events_block_mutation() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'audit_events rows are immutable (SOC2 CC7.2 / ISO A.8.15): % is not permitted', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_events_immutable ON "audit_events";
CREATE TRIGGER audit_events_immutable
    BEFORE UPDATE OR DELETE OR TRUNCATE ON "audit_events"
    FOR EACH STATEMENT EXECUTE FUNCTION audit_events_block_mutation();
ALTER TABLE "audit_events" ENABLE ALWAYS TRIGGER audit_events_immutable;
```

- [ ] **Step 2: Copy it as the Testcontainers fixture schema**

```bash
mkdir -p /Users/federicotafur/Desktop/NexaDev/clients/tims-international/github/formmaps/services/api/tests/FormMaps.IntegrationTests/Audit/Data
cp /Users/federicotafur/Desktop/NexaDev/clients/tims-international/github/formmaps/infra/aws/sql/audit-events-schema.sql \
   /Users/federicotafur/Desktop/NexaDev/clients/tims-international/github/formmaps/services/api/tests/FormMaps.IntegrationTests/Audit/Data/audit-events-schema.sql
```

- [ ] **Step 3: Commit**

```bash
git add infra/aws/sql/audit-events-schema.sql services/api/tests/FormMaps.IntegrationTests/Audit/Data/audit-events-schema.sql
git commit -m "feat(audit): audit_events schema — RLS-bypass-only, immutable by construction"
```

---

### Task 2: Core abstractions — `AuditEvent`, `IAuditEventWriter`, PII denylist guard

**Files:**
- Create: `services/api/src/FormMaps.Application/Audit/IAuditEventWriter.cs`
- Test: `services/api/tests/FormMaps.UnitTests/Audit/AuditMetadataGuardTests.cs`

**Interfaces:**
- Produces: `AuditEvent` (record: `EventType`, `ActorUserId?`, `ActorRole?`, `SchoolId?`,
  `SubjectType`, `SubjectId?`, `Outcome = "success"`, `Metadata?`), `IAuditEventWriter.WriteAsync(AuditEvent, CancellationToken)`,
  `AuditMetadataGuard.Validate(IReadOnlyDictionary<string, object?>?)` (throws `ArgumentException` on
  a PII-shaped key). Consumed by Task 3 (`AuditEventWriter`) and every retrofit task (8-14).

Pure, dependency-free — trivially unit-testable, no DB.

- [ ] **Step 1: Write the failing tests**

```csharp
// services/api/tests/FormMaps.UnitTests/Audit/AuditMetadataGuardTests.cs
using FormMaps.Application.Audit;
using Xunit;

namespace FormMaps.UnitTests.Audit;

public class AuditMetadataGuardTests
{
    [Fact]
    public void Validate_NullMetadata_DoesNotThrow() => AuditMetadataGuard.Validate(null);

    [Fact]
    public void Validate_EmptyMetadata_DoesNotThrow() =>
        AuditMetadataGuard.Validate(new Dictionary<string, object?>());

    [Theory]
    [InlineData("email")]
    [InlineData("actorEmail")]
    [InlineData("userName")]
    [InlineData("ipAddress")]
    [InlineData("phoneNumber")]
    [InlineData("dob")]
    public void Validate_DisallowedKey_Throws(string key)
    {
        var metadata = new Dictionary<string, object?> { [key] = "whatever" };
        Assert.Throws<ArgumentException>(() => AuditMetadataGuard.Validate(metadata));
    }

    [Fact]
    public void Validate_AllowedKeys_DoesNotThrow()
    {
        var metadata = new Dictionary<string, object?>
        {
            ["score"] = 87, ["band"] = "high", ["examId"] = "exam_1", ["correctCount"] = 12,
        };
        AuditMetadataGuard.Validate(metadata);
    }
}
```

- [ ] **Step 2: Run tests, confirm they fail**

```bash
cd /Users/federicotafur/Desktop/NexaDev/clients/tims-international/github/formmaps/services/api
dotnet test tests/FormMaps.UnitTests --filter FullyQualifiedName~AuditMetadataGuardTests
```
Expected: build error (types don't exist yet).

- [ ] **Step 3: Implement**

```csharp
// services/api/src/FormMaps.Application/Audit/IAuditEventWriter.cs
namespace FormMaps.Application.Audit;

/// <summary>
/// A single audit event to persist. IDs/enums/counts only -- see AuditMetadataGuard. EventType
/// values should reuse the existing "audit.&lt;domain&gt;.&lt;action&gt;" strings already used by
/// LiaSessionWriter/PersonalitySessionWriter/TestScoreWriter/VocationalWriter/PcaExamWriter/
/// Question360Writer/EvaluationExternalService's log-only calls where retrofitting (Tasks 8-14).
/// </summary>
public sealed record AuditEvent(
    string EventType,
    string? ActorUserId,
    string? ActorRole,
    string? SchoolId,
    string SubjectType,
    string? SubjectId,
    string Outcome = "success",
    IReadOnlyDictionary<string, object?>? Metadata = null);

public interface IAuditEventWriter
{
    /// <summary>
    /// Persists an audit event. Never throws to the caller -- write failures are logged at Error
    /// level (prefix "audit.write_failed") and swallowed: an audit outage must never fail a real
    /// user action (matches legacy's fail-soft semantics), but unlike legacy's plain logger.warn,
    /// this is distinguishable for future alerting. See spec "Failure semantics".
    /// </summary>
    Task WriteAsync(AuditEvent auditEvent, CancellationToken cancellationToken = default);
}

/// <summary>
/// Denylist guard for AuditEvent.Metadata keys -- defense-in-depth against accidentally logging PII
/// into an immutable, indefinitely-retained table. Not exhaustive (cannot detect PII smuggled into
/// an allowed key's string value) -- the primary control is that every current call site only has
/// IDs/enums/counts to log in the first place; this guard exists to fail loudly if that ever changes.
/// </summary>
public static class AuditMetadataGuard
{
    private static readonly string[] DisallowedKeyFragments =
        ["email", "name", "phone", "address", "ssn", "dob", "birthdate", "ipaddress", "ip_address"];

    public static void Validate(IReadOnlyDictionary<string, object?>? metadata)
    {
        if (metadata is null)
        {
            return;
        }

        foreach (var key in metadata.Keys)
        {
            var normalized = key.ToLowerInvariant();
            foreach (var fragment in DisallowedKeyFragments)
            {
                if (normalized.Contains(fragment, StringComparison.Ordinal))
                {
                    throw new ArgumentException(
                        $"AuditEvent.Metadata key '{key}' looks like it may contain PII (matched '{fragment}') -- audit_events is PII-free by design.",
                        nameof(metadata));
                }
            }
        }
    }
}
```

- [ ] **Step 4: Run tests, confirm they pass**

```bash
dotnet test tests/FormMaps.UnitTests --filter FullyQualifiedName~AuditMetadataGuardTests
```
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/FormMaps.Application/Audit/IAuditEventWriter.cs tests/FormMaps.UnitTests/Audit/AuditMetadataGuardTests.cs
git commit -m "feat(audit): AuditEvent + IAuditEventWriter abstraction + PII denylist guard"
```

---

### Task 3: `AuditEventWriter` — persisted, fail-soft-but-alert write path

**Files:**
- Create: `services/api/src/FormMaps.Infrastructure/Audit/AuditEventWriter.cs`
- Create: `services/api/tests/FormMaps.IntegrationTests/Audit/AuditDatabaseFixture.cs`
- Test: `services/api/tests/FormMaps.IntegrationTests/Audit/AuditEventWriterTests.cs`
- Modify: `services/api/src/FormMaps.Infrastructure/DependencyInjection.cs`

**Interfaces:**
- Consumes: `AuditEvent`, `AuditMetadataGuard` (Task 2), `IFormMapsDatabaseSessionFactory.OpenWritableAsync`,
  `RequestContext.System()` (existing).
- Produces: `AuditEventWriter : IAuditEventWriter`. Registered in DI. Consumed by Task 8-14 retrofits
  and (via DI) Task 6's endpoint tests indirectly.

- [ ] **Step 1: Write the fixture and the failing integration test**

```csharp
// services/api/tests/FormMaps.IntegrationTests/Audit/AuditDatabaseFixture.cs
using FormMaps.Application.Data;
using Npgsql;
using Testcontainers.PostgreSql;
using Xunit;

namespace FormMaps.IntegrationTests.Audit;

public sealed class AuditDatabaseFixture : IAsyncLifetime
{
    private PostgreSqlContainer _container = null!;
    public IFormMapsDatabaseSessionFactory SessionFactory { get; private set; } = null!;
    public string ConnectionString { get; private set; } = null!;

    public async Task InitializeAsync()
    {
        _container = new PostgreSqlBuilder().WithImage("postgres:16-alpine").Build();
        await _container.StartAsync();
        ConnectionString = _container.GetConnectionString();

        var schemaSql = await File.ReadAllTextAsync(
            Path.Combine(AppContext.BaseDirectory, "Audit", "Data", "audit-events-schema.sql"));
        await using var connection = new NpgsqlConnection(ConnectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = schemaSql;
        await command.ExecuteNonQueryAsync();

        SessionFactory = new TestSessionFactory(ConnectionString);
    }

    /// <summary>
    /// Resets between tests. audit_events blocks DELETE/TRUNCATE by design (Task 1) -- the fixture's
    /// own connection is the table owner/superuser, so it must explicitly disable the immutability
    /// trigger for cleanup, then re-enable it. This does NOT weaken production: only this test
    /// fixture's own bootstrap connection can do this, and only because it created the trigger.
    /// </summary>
    public async Task ResetAsync()
    {
        await using var connection = new NpgsqlConnection(ConnectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = """
            ALTER TABLE "audit_events" DISABLE TRIGGER audit_events_immutable;
            DELETE FROM "audit_events";
            ALTER TABLE "audit_events" ENABLE ALWAYS TRIGGER audit_events_immutable;
            """;
        await command.ExecuteNonQueryAsync();
    }

    public async Task<int> CountRowsAsync(string eventType)
    {
        await using var connection = new NpgsqlConnection(ConnectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = """SELECT count(*)::int FROM "audit_events" WHERE "eventType" = @eventType""";
        var p = command.CreateParameter(); p.ParameterName = "eventType"; p.Value = eventType; command.Parameters.Add(p);
        return (int)(await command.ExecuteScalarAsync())!;
    }

    public Task DisposeAsync() => _container.DisposeAsync().AsTask();
}

[CollectionDefinition(nameof(AuditDatabaseCollection))]
public class AuditDatabaseCollection : ICollectionFixture<AuditDatabaseFixture>;
```

Note: check whether `TestSessionFactory` already exists as a shared test helper (see
`BillingDatabaseFixture.cs`'s own note about this) before writing a new one — reuse it if so, matching
its exact constructor signature.

```csharp
// services/api/tests/FormMaps.IntegrationTests/Audit/AuditEventWriterTests.cs
using FormMaps.Application.Audit;
using FormMaps.Infrastructure.Audit;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace FormMaps.IntegrationTests.Audit;

[Collection(nameof(AuditDatabaseCollection))]
public class AuditEventWriterTests(AuditDatabaseFixture fixture)
{
    [Fact]
    public async Task WriteAsync_ValidEvent_PersistsRow()
    {
        await fixture.ResetAsync();
        var writer = new AuditEventWriter(fixture.SessionFactory, NullLogger<AuditEventWriter>.Instance);

        await writer.WriteAsync(new AuditEvent(
            EventType: "audit.test.written",
            ActorUserId: "user_1",
            ActorRole: "student",
            SchoolId: "school_1",
            SubjectType: "test_score",
            SubjectId: "score_1",
            Metadata: new Dictionary<string, object?> { ["score"] = 87 }));

        Assert.Equal(1, await fixture.CountRowsAsync("audit.test.written"));
    }

    [Fact]
    public async Task WriteAsync_DisallowedMetadataKey_DoesNotThrow_AndDoesNotPersist()
    {
        await fixture.ResetAsync();
        var writer = new AuditEventWriter(fixture.SessionFactory, NullLogger<AuditEventWriter>.Instance);

        // Fail-soft: a caller that accidentally passes PII-shaped metadata must never see an
        // exception (that would make an audit-logging mistake fail a real user request) -- but
        // the row must not be written either.
        await writer.WriteAsync(new AuditEvent(
            EventType: "audit.test.pii_attempt",
            ActorUserId: "user_1", ActorRole: null, SchoolId: null,
            SubjectType: "test_score", SubjectId: "score_1",
            Metadata: new Dictionary<string, object?> { ["email"] = "leak@example.test" }));

        Assert.Equal(0, await fixture.CountRowsAsync("audit.test.pii_attempt"));
    }

    [Fact]
    public async Task WriteAsync_NullActorUserId_PersistsRow_SystemInitiatedEvent()
    {
        await fixture.ResetAsync();
        var writer = new AuditEventWriter(fixture.SessionFactory, NullLogger<AuditEventWriter>.Instance);

        await writer.WriteAsync(new AuditEvent(
            EventType: "audit.test.system_initiated",
            ActorUserId: null, ActorRole: null, SchoolId: null,
            SubjectType: "vocational_result", SubjectId: "result_1"));

        Assert.Equal(1, await fixture.CountRowsAsync("audit.test.system_initiated"));
    }
}
```

- [ ] **Step 2: Run tests, confirm they fail**

```bash
dotnet test tests/FormMaps.IntegrationTests --filter FullyQualifiedName~AuditEventWriterTests
```
Expected: build error (types don't exist yet).

- [ ] **Step 3: Implement**

```csharp
// services/api/src/FormMaps.Infrastructure/Audit/AuditEventWriter.cs
using System.Data.Common;
using System.Text.Json;
using FormMaps.Application.Audit;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;
using Microsoft.Extensions.Logging;

namespace FormMaps.Infrastructure.Audit;

/// <summary>
/// Writes audit_events. Always opens under RequestContext.System() -- audit_events' RLS policy
/// only allows bypass-mode sessions (see infra/aws/sql/audit-events-schema.sql). Fail-soft-but-alert:
/// see IAuditEventWriter.WriteAsync's doc comment.
/// </summary>
public sealed class AuditEventWriter(
    IFormMapsDatabaseSessionFactory databaseSessionFactory,
    ILogger<AuditEventWriter> logger) : IAuditEventWriter
{
    public async Task WriteAsync(AuditEvent auditEvent, CancellationToken cancellationToken = default)
    {
        try
        {
            AuditMetadataGuard.Validate(auditEvent.Metadata);

            await using var session = await databaseSessionFactory.OpenWritableAsync(RequestContext.System(), cancellationToken);
            await using var command = Command(session, """
                INSERT INTO "audit_events"
                    ("id", "eventType", "actorUserId", "actorRole", "schoolId", "subjectType", "subjectId", "outcome", "metadata")
                VALUES (@id, @eventType, @actorUserId, @actorRole, @schoolId, @subjectType, @subjectId, @outcome, @metadata::jsonb)
                """);
            AddParameter(command, "id", Guid.NewGuid().ToString());
            AddParameter(command, "eventType", auditEvent.EventType);
            AddParameter(command, "actorUserId", (object?)auditEvent.ActorUserId ?? DBNull.Value);
            AddParameter(command, "actorRole", (object?)auditEvent.ActorRole ?? DBNull.Value);
            AddParameter(command, "schoolId", (object?)auditEvent.SchoolId ?? DBNull.Value);
            AddParameter(command, "subjectType", auditEvent.SubjectType);
            AddParameter(command, "subjectId", (object?)auditEvent.SubjectId ?? DBNull.Value);
            AddParameter(command, "outcome", auditEvent.Outcome);
            AddParameter(command, "metadata",
                auditEvent.Metadata is null ? DBNull.Value : JsonSerializer.Serialize(auditEvent.Metadata));
            await command.ExecuteNonQueryAsync(cancellationToken);

            await session.CommitAsync(cancellationToken);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogError(ex,
                "audit.write_failed eventType={EventType} subjectType={SubjectType} subjectId={SubjectId}",
                auditEvent.EventType, auditEvent.SubjectType, auditEvent.SubjectId);
        }
    }

    private static DbCommand Command(FormMapsDatabaseSession session, string sql)
    {
        var command = session.Connection.CreateCommand();
        command.Transaction = session.Transaction;
        command.CommandText = sql;
        return command;
    }

    private static void AddParameter(DbCommand command, string name, object value)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = name;
        parameter.Value = value;
        command.Parameters.Add(parameter);
    }
}
```

Register in DI (find `services.AddScoped<IMessagesRepository, MessagesRepository>();` per Global
Constraints and add a sibling):

```csharp
// services/api/src/FormMaps.Infrastructure/DependencyInjection.cs
services.AddScoped<FormMaps.Application.Audit.IAuditEventWriter, FormMaps.Infrastructure.Audit.AuditEventWriter>();
```

- [ ] **Step 4: Run tests, confirm they pass**

```bash
dotnet test tests/FormMaps.IntegrationTests --filter FullyQualifiedName~AuditEventWriterTests
```
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/FormMaps.Infrastructure/Audit/AuditEventWriter.cs tests/FormMaps.IntegrationTests/Audit/AuditDatabaseFixture.cs tests/FormMaps.IntegrationTests/Audit/AuditEventWriterTests.cs src/FormMaps.Infrastructure/DependencyInjection.cs
git commit -m "feat(audit): AuditEventWriter — persisted, fail-soft-but-alert write path"
```

---

### Task 4: Immutability enforcement tests

**Files:**
- Test: `services/api/tests/FormMaps.IntegrationTests/Audit/AuditEventImmutabilityTests.cs`

**Interfaces:** none new — proves Task 1's DDL does what it claims. No implementation step; this task
is entirely verification, matching the spec's explicit "prove both halves" testing requirement.

- [ ] **Step 1: Write the tests**

```csharp
// services/api/tests/FormMaps.IntegrationTests/Audit/AuditEventImmutabilityTests.cs
using FormMaps.Application.Audit;
using FormMaps.Infrastructure.Audit;
using Microsoft.Extensions.Logging.Abstractions;
using Npgsql;
using Xunit;

namespace FormMaps.IntegrationTests.Audit;

[Collection(nameof(AuditDatabaseCollection))]
public class AuditEventImmutabilityTests(AuditDatabaseFixture fixture)
{
    private async Task<string> SeedOneEventAsync()
    {
        var writer = new AuditEventWriter(fixture.SessionFactory, NullLogger<AuditEventWriter>.Instance);
        var auditEvent = new AuditEvent(
            EventType: "audit.test.immutability_seed", ActorUserId: "user_1", ActorRole: null,
            SchoolId: null, SubjectType: "test_score", SubjectId: "score_1");
        await writer.WriteAsync(auditEvent);

        await using var connection = new NpgsqlConnection(fixture.ConnectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = """SELECT "id" FROM "audit_events" WHERE "eventType" = 'audit.test.immutability_seed' LIMIT 1""";
        return (string)(await command.ExecuteScalarAsync())!;
    }

    [Fact]
    public async Task DirectUpdate_RaisesException()
    {
        await fixture.ResetAsync();
        var id = await SeedOneEventAsync();

        await using var connection = new NpgsqlConnection(fixture.ConnectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = """UPDATE "audit_events" SET "outcome" = 'tampered' WHERE "id" = @id""";
        var p = command.CreateParameter(); p.ParameterName = "id"; p.Value = id; command.Parameters.Add(p);

        var ex = await Assert.ThrowsAsync<PostgresException>(() => command.ExecuteNonQueryAsync());
        Assert.Contains("immutable", ex.MessageText, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task DirectDelete_RaisesException()
    {
        await fixture.ResetAsync();
        var id = await SeedOneEventAsync();

        await using var connection = new NpgsqlConnection(fixture.ConnectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = """DELETE FROM "audit_events" WHERE "id" = @id""";
        var p = command.CreateParameter(); p.ParameterName = "id"; p.Value = id; command.Parameters.Add(p);

        await Assert.ThrowsAsync<PostgresException>(() => command.ExecuteNonQueryAsync());
    }

    [Fact]
    public async Task DirectDelete_UnderReplicaSessionReplicationRole_StillRaisesException()
    {
        // Proves ENABLE ALWAYS specifically -- a plain "ENABLE" trigger silently no-ops under
        // session_replication_role='replica' (the exact bypass this pattern exists to close; see
        // spec's Immutability section). A logical-replication applier session sets this.
        await fixture.ResetAsync();
        var id = await SeedOneEventAsync();

        await using var connection = new NpgsqlConnection(fixture.ConnectionString);
        await connection.OpenAsync();
        await using (var setReplica = connection.CreateCommand())
        {
            setReplica.CommandText = "SET session_replication_role = 'replica'";
            await setReplica.ExecuteNonQueryAsync();
        }

        await using var command = connection.CreateCommand();
        command.CommandText = """DELETE FROM "audit_events" WHERE "id" = @id""";
        var p = command.CreateParameter(); p.ParameterName = "id"; p.Value = id; command.Parameters.Add(p);

        await Assert.ThrowsAsync<PostgresException>(() => command.ExecuteNonQueryAsync());
    }

    [Fact]
    public async Task DirectTruncate_RaisesException()
    {
        await fixture.ResetAsync();
        await SeedOneEventAsync();

        await using var connection = new NpgsqlConnection(fixture.ConnectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = """TRUNCATE "audit_events" """;

        await Assert.ThrowsAsync<PostgresException>(() => command.ExecuteNonQueryAsync());
    }
}
```

- [ ] **Step 2: Run tests, confirm they pass against Task 1's DDL**

```bash
cd /Users/federicotafur/Desktop/NexaDev/clients/tims-international/github/formmaps/services/api
dotnet test tests/FormMaps.IntegrationTests --filter FullyQualifiedName~AuditEventImmutabilityTests
```
Expected: all PASS (if any FAILs, the DDL in Task 1 needs fixing, not this test file — the trigger/
policy is the thing under test).

- [ ] **Step 3: Commit**

```bash
git add tests/FormMaps.IntegrationTests/Audit/AuditEventImmutabilityTests.cs
git commit -m "test(audit): prove audit_events immutability — REVOKE, trigger, and ENABLE ALWAYS specifically"
```

---

### Task 5: `IAuditEventReader` — paginated, filterable cross-tenant read

**Files:**
- Create: `services/api/src/FormMaps.Application/Audit/IAuditEventReader.cs`
- Create: `services/api/src/FormMaps.Infrastructure/Audit/AuditEventReader.cs`
- Test: `services/api/tests/FormMaps.IntegrationTests/Audit/AuditEventReaderTests.cs`
- Modify: `services/api/src/FormMaps.Infrastructure/DependencyInjection.cs`

**Interfaces:**
- Produces: `AuditEventQuery` (record: `EventType?`, `ActorUserId?`, `SubjectType?`, `SubjectId?`,
  `SchoolId?`, `From?`, `To?`, `Limit = 50`, `Cursor?`), `AuditEventRecord` (record: `Id`, `OccurredAt`,
  `EventType`, `ActorUserId?`, `ActorRole?`, `SchoolId?`, `SubjectType`, `SubjectId?`, `Outcome`,
  `MetadataJson?`), `AuditEventPage` (record: `Items`, `NextCursor?`), `IAuditEventReader.QueryAsync(AuditEventQuery, CancellationToken) -> Task<AuditEventPage>`.
  Consumed by Task 6 (endpoint).

Keyset pagination on `(occurredAt, id)` DESC — stable under concurrent inserts, unlike offset paging.

- [ ] **Step 1: Write the failing integration test**

```csharp
// services/api/tests/FormMaps.IntegrationTests/Audit/AuditEventReaderTests.cs
using FormMaps.Application.Audit;
using FormMaps.Infrastructure.Audit;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace FormMaps.IntegrationTests.Audit;

[Collection(nameof(AuditDatabaseCollection))]
public class AuditEventReaderTests(AuditDatabaseFixture fixture)
{
    private async Task SeedAsync(string eventType, string subjectId, string? actorUserId = "user_1")
    {
        var writer = new AuditEventWriter(fixture.SessionFactory, NullLogger<AuditEventWriter>.Instance);
        await writer.WriteAsync(new AuditEvent(eventType, actorUserId, "student", "school_1", "test_score", subjectId));
    }

    [Fact]
    public async Task QueryAsync_NoFilters_ReturnsAllRows_NewestFirst()
    {
        await fixture.ResetAsync();
        await SeedAsync("audit.test.a", "s1");
        await SeedAsync("audit.test.b", "s2");
        var reader = new AuditEventReader(fixture.SessionFactory);

        var page = await reader.QueryAsync(new AuditEventQuery());

        Assert.Equal(2, page.Items.Count);
        Assert.True(page.Items[0].OccurredAt >= page.Items[1].OccurredAt);
    }

    [Fact]
    public async Task QueryAsync_FilterByEventType_ReturnsOnlyMatching()
    {
        await fixture.ResetAsync();
        await SeedAsync("audit.test.a", "s1");
        await SeedAsync("audit.test.b", "s2");
        var reader = new AuditEventReader(fixture.SessionFactory);

        var page = await reader.QueryAsync(new AuditEventQuery(EventType: "audit.test.a"));

        Assert.Single(page.Items);
        Assert.Equal("audit.test.a", page.Items[0].EventType);
    }

    [Fact]
    public async Task QueryAsync_FilterBySubjectId_ReturnsOnlyMatching()
    {
        await fixture.ResetAsync();
        await SeedAsync("audit.test.a", "s1");
        await SeedAsync("audit.test.b", "s2");
        var reader = new AuditEventReader(fixture.SessionFactory);

        var page = await reader.QueryAsync(new AuditEventQuery(SubjectId: "s2"));

        Assert.Single(page.Items);
        Assert.Equal("s2", page.Items[0].SubjectId);
    }

    [Fact]
    public async Task QueryAsync_LimitSmallerThanTotal_ReturnsNextCursor()
    {
        await fixture.ResetAsync();
        await SeedAsync("audit.test.a", "s1");
        await SeedAsync("audit.test.b", "s2");
        await SeedAsync("audit.test.c", "s3");
        var reader = new AuditEventReader(fixture.SessionFactory);

        var firstPage = await reader.QueryAsync(new AuditEventQuery(Limit: 2));
        Assert.Equal(2, firstPage.Items.Count);
        Assert.NotNull(firstPage.NextCursor);

        var secondPage = await reader.QueryAsync(new AuditEventQuery(Limit: 2, Cursor: firstPage.NextCursor));
        Assert.Single(secondPage.Items);
        Assert.Null(secondPage.NextCursor);
    }
}
```

- [ ] **Step 2: Run tests, confirm they fail**

```bash
dotnet test tests/FormMaps.IntegrationTests --filter FullyQualifiedName~AuditEventReaderTests
```
Expected: build error (types don't exist yet).

- [ ] **Step 3: Implement**

```csharp
// services/api/src/FormMaps.Application/Audit/IAuditEventReader.cs
namespace FormMaps.Application.Audit;

public sealed record AuditEventQuery(
    string? EventType = null,
    string? ActorUserId = null,
    string? SubjectType = null,
    string? SubjectId = null,
    string? SchoolId = null,
    DateTimeOffset? From = null,
    DateTimeOffset? To = null,
    int Limit = 50,
    string? Cursor = null);

public sealed record AuditEventRecord(
    string Id, DateTimeOffset OccurredAt, string EventType, string? ActorUserId, string? ActorRole,
    string? SchoolId, string SubjectType, string? SubjectId, string Outcome, string? MetadataJson);

public sealed record AuditEventPage(IReadOnlyList<AuditEventRecord> Items, string? NextCursor);

public interface IAuditEventReader
{
    Task<AuditEventPage> QueryAsync(AuditEventQuery query, CancellationToken cancellationToken = default);
}
```

```csharp
// services/api/src/FormMaps.Infrastructure/Audit/AuditEventReader.cs
using System.Text;
using FormMaps.Application.Audit;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;

namespace FormMaps.Infrastructure.Audit;

/// <summary>Always opens under RequestContext.System() -- same RLS-bypass rationale as AuditEventWriter.</summary>
public sealed class AuditEventReader(IFormMapsDatabaseSessionFactory databaseSessionFactory) : IAuditEventReader
{
    public async Task<AuditEventPage> QueryAsync(AuditEventQuery query, CancellationToken cancellationToken = default)
    {
        var limit = Math.Clamp(query.Limit, 1, 200);
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(RequestContext.System(), cancellationToken);

        var sql = new StringBuilder("""
            SELECT "id", "occurredAt", "eventType", "actorUserId", "actorRole", "schoolId", "subjectType", "subjectId", "outcome", "metadata"::text
            FROM "audit_events" WHERE 1=1
            """);
        var parameters = new List<(string Name, object Value)>();

        void AddFilter(string sqlFragment, string paramName, object? value)
        {
            if (value is null) return;
            sql.Append(sqlFragment);
            parameters.Add((paramName, value));
        }

        AddFilter(""" AND "eventType" = @eventType""", "eventType", query.EventType);
        AddFilter(""" AND "actorUserId" = @actorUserId""", "actorUserId", query.ActorUserId);
        AddFilter(""" AND "subjectType" = @subjectType""", "subjectType", query.SubjectType);
        AddFilter(""" AND "subjectId" = @subjectId""", "subjectId", query.SubjectId);
        AddFilter(""" AND "schoolId" = @schoolId""", "schoolId", query.SchoolId);
        AddFilter(""" AND "occurredAt" >= @from""", "from", query.From?.UtcDateTime);
        AddFilter(""" AND "occurredAt" <= @to""", "to", query.To?.UtcDateTime);

        var cursor = DecodeCursor(query.Cursor);
        if (cursor is { } c)
        {
            sql.Append(""" AND ("occurredAt", "id") < (@cursorOccurredAt, @cursorId)""");
            parameters.Add(("cursorOccurredAt", c.OccurredAt));
            parameters.Add(("cursorId", c.Id));
        }

        sql.Append(""" ORDER BY "occurredAt" DESC, "id" DESC LIMIT @limit""");
        parameters.Add(("limit", limit + 1));

        await using var command = session.Connection.CreateCommand();
        command.Transaction = session.Transaction;
        command.CommandText = sql.ToString();
        foreach (var (name, value) in parameters)
        {
            var p = command.CreateParameter();
            p.ParameterName = name;
            p.Value = value;
            command.Parameters.Add(p);
        }

        var items = new List<AuditEventRecord>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            items.Add(new AuditEventRecord(
                reader.GetString(0),
                new DateTimeOffset(DateTime.SpecifyKind(reader.GetDateTime(1), DateTimeKind.Utc)),
                reader.GetString(2),
                reader.IsDBNull(3) ? null : reader.GetString(3),
                reader.IsDBNull(4) ? null : reader.GetString(4),
                reader.IsDBNull(5) ? null : reader.GetString(5),
                reader.GetString(6),
                reader.IsDBNull(7) ? null : reader.GetString(7),
                reader.GetString(8),
                reader.IsDBNull(9) ? null : reader.GetString(9)));
        }

        string? nextCursor = null;
        if (items.Count > limit)
        {
            items.RemoveAt(items.Count - 1);
            var last = items[^1];
            nextCursor = EncodeCursor(last.OccurredAt.UtcDateTime, last.Id);
        }

        return new AuditEventPage(items, nextCursor);
    }

    private static string EncodeCursor(DateTime occurredAtUtc, string id) =>
        Convert.ToBase64String(Encoding.UTF8.GetBytes($"{occurredAtUtc:O}|{id}"));

    private static (DateTime OccurredAt, string Id)? DecodeCursor(string? cursor)
    {
        if (string.IsNullOrEmpty(cursor)) return null;
        var parts = Encoding.UTF8.GetString(Convert.FromBase64String(cursor)).Split('|', 2);
        return (DateTime.Parse(parts[0], null, System.Globalization.DateTimeStyles.RoundtripKind), parts[1]);
    }
}
```

Register in DI:

```csharp
// services/api/src/FormMaps.Infrastructure/DependencyInjection.cs
services.AddScoped<FormMaps.Application.Audit.IAuditEventReader, FormMaps.Infrastructure.Audit.AuditEventReader>();
```

- [ ] **Step 4: Run tests, confirm they pass**

```bash
dotnet test tests/FormMaps.IntegrationTests --filter FullyQualifiedName~AuditEventReaderTests
```
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/FormMaps.Application/Audit/IAuditEventReader.cs src/FormMaps.Infrastructure/Audit/AuditEventReader.cs tests/FormMaps.IntegrationTests/Audit/AuditEventReaderTests.cs src/FormMaps.Infrastructure/DependencyInjection.cs
git commit -m "feat(audit): AuditEventReader — cursor-paginated cross-tenant query"
```

---

### Task 6: `GET /api/v1/audit/events` endpoint

**Files:**
- Modify: `services/api/src/FormMaps.Domain/Auth/FormMapsPermissions.cs` (add `AuditRead` constant)
- Create: `services/api/src/FormMaps.Api/Endpoints/AuditEndpoints.cs`
- Modify: `services/api/src/FormMaps.Api/Program.cs` (map the new endpoint)
- Test: `services/api/tests/FormMaps.IntegrationTests/Audit/AuditEndpointsTests.cs`

**Interfaces:**
- Consumes: `IAuditEventReader` (Task 5), `IProtectedRequestGuard.RequireIdentity` (existing),
  `RequestActor.IsSuperAdmin` (existing).
- Produces: `GET /api/v1/audit/events?eventType=&actorUserId=&subjectType=&subjectId=&schoolId=&from=&to=&limit=&cursor=`.

Gated on `IsSuperAdmin`, not a permission string — see spec's "Read-access model" for why (legacy's
equivalent permission gate is dead code; a new granular permission needs a cross-repo Node change,
tracked as a spec Open item, not built here).

- [ ] **Step 1: Write the failing integration test**

```csharp
// services/api/tests/FormMaps.IntegrationTests/Audit/AuditEndpointsTests.cs
using System.Net;
using System.Net.Http.Json;
using FormMaps.Api.Auth;
using FormMaps.Application.Audit;
using FormMaps.Domain.Auth;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;
using Xunit;

namespace FormMaps.IntegrationTests.Audit;

public class AuditEndpointsTests
{
    private const string Path = "/api/v1/audit/events";

    [Fact]
    public async Task Anonymous_Returns401()
    {
        using var factory = new AuditApiFactory(new FakeAuditEventReader());
        using var client = factory.CreateClient();

        var response = await client.GetAsync(Path);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task AuthenticatedNonSuperAdmin_Returns403()
    {
        using var factory = new AuditApiFactory(new FakeAuditEventReader());
        using var client = factory.CreateClient();
        var request = new HttpRequestMessage(HttpMethod.Get, Path);
        AddDevHeaders(request, role: FormMapsRoles.SchoolAdmin);

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task SuperAdmin_Returns200_WithItems()
    {
        var fakeReader = new FakeAuditEventReader();
        fakeReader.Page = new AuditEventPage(
            [new AuditEventRecord("evt_1", DateTimeOffset.UtcNow, "audit.test.a", "user_1", "student", "school_1", "test_score", "score_1", "success", null)],
            NextCursor: null);
        using var factory = new AuditApiFactory(fakeReader);
        using var client = factory.CreateClient();
        var request = new HttpRequestMessage(HttpMethod.Get, Path);
        AddDevHeaders(request, role: FormMapsRoles.SuperAdmin);

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(1, fakeReader.QueryCalls);
    }

    private static void AddDevHeaders(HttpRequestMessage request, string role)
    {
        request.Headers.Add(DevelopmentRequestContextFactory.UserIdHeader, "user-admin-1");
        request.Headers.Add(DevelopmentRequestContextFactory.RoleHeader, role);
        request.Headers.Add(DevelopmentRequestContextFactory.EmailHeader, "admin@example.test");
        request.Headers.Add(DevelopmentRequestContextFactory.NameHeader, "Test Admin");
    }

    private sealed class AuditApiFactory(FakeAuditEventReader reader) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(Environments.Development);
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<IAuditEventReader>();
                services.AddSingleton<IAuditEventReader>(reader);
            });
        }
    }

    private sealed class FakeAuditEventReader : IAuditEventReader
    {
        public AuditEventPage Page { get; set; } = new([], null);
        public int QueryCalls { get; private set; }

        public Task<AuditEventPage> QueryAsync(AuditEventQuery query, CancellationToken cancellationToken = default)
        {
            QueryCalls++;
            return Task.FromResult(Page);
        }
    }
}
```

- [ ] **Step 2: Run tests, confirm they fail**

```bash
dotnet test tests/FormMaps.IntegrationTests --filter FullyQualifiedName~AuditEndpointsTests
```
Expected: build error (route doesn't exist yet, `AuditRead` constant undefined).

- [ ] **Step 3: Implement**

Add the permission constant (forward-compat marker — see spec Open items; not what actually gates
v1's endpoint):

```csharp
// services/api/src/FormMaps.Domain/Auth/FormMapsPermissions.cs — add alongside the others
public const string AuditRead = "audit:read";
```

```csharp
// services/api/src/FormMaps.Api/Endpoints/AuditEndpoints.cs
using FormMaps.Application.Audit;
using FormMaps.Application.Auth;

namespace FormMaps.Api.Endpoints;

/// <summary>
/// GET /api/v1/audit/events -- cross-tenant audit-trail read. Gated on RequestActor.IsSuperAdmin
/// for v1, NOT a permission string: legacy's equivalent gate (requirePermission("admin:settings"))
/// is confirmed dead code (no role in api/src/lib/auth.ts's ROLE_PERMISSIONS has "admin:settings"),
/// so porting it would ship an endpoint nobody can reach. See spec's "Read-access model" and Open
/// items for the tracked fast-follow once Node's ROLE_PERMISSIONS can emit a real "audit:read".
/// </summary>
public static class AuditEndpoints
{
    public static IEndpointRouteBuilder MapAuditEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/v1/audit/events", GetEventsAsync).WithTags("Audit");
        return app;
    }

    private static async Task<IResult> GetEventsAsync(
        IRequestContextAccessor requestContextAccessor,
        IProtectedRequestGuard protectedRequestGuard,
        IAuditEventReader reader,
        string? eventType, string? actorUserId, string? subjectType, string? subjectId, string? schoolId,
        DateTimeOffset? from, DateTimeOffset? to, int? limit, string? cursor,
        CancellationToken cancellationToken)
    {
        var context = requestContextAccessor.Current;
        var decision = protectedRequestGuard.RequireIdentity(context);
        if (!decision.Allowed)
        {
            return Results.Json(
                new { success = false, code = decision.Code, message = decision.Message },
                statusCode: decision.StatusCode);
        }

        if (context.Actor is null || !context.Actor.IsSuperAdmin)
        {
            return Results.Json(
                new { success = false, code = "missing_permission", message = "Insufficient permissions" },
                statusCode: StatusCodes.Status403Forbidden);
        }

        var query = new AuditEventQuery(eventType, actorUserId, subjectType, subjectId, schoolId, from, to, limit ?? 50, cursor);
        var page = await reader.QueryAsync(query, cancellationToken);

        return Results.Ok(new { success = true, items = page.Items, nextCursor = page.NextCursor });
    }
}
```

Wire into `Program.cs` (add near `app.MapMessagesEndpoints();`):

```csharp
app.MapAuditEndpoints();
```

- [ ] **Step 4: Run tests, confirm they pass**

```bash
dotnet test tests/FormMaps.IntegrationTests --filter FullyQualifiedName~AuditEndpointsTests
```
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/FormMaps.Domain/Auth/FormMapsPermissions.cs src/FormMaps.Api/Endpoints/AuditEndpoints.cs src/FormMaps.Api/Program.cs tests/FormMaps.IntegrationTests/Audit/AuditEndpointsTests.cs
git commit -m "feat(audit): GET /api/v1/audit/events — Super-Admin-gated cross-tenant read"
```

---

### Task 7: `formmaps_dotnet_svc` least-privilege grant

**Files:**
- Modify: `infra/aws/sql/dotnet-service-role.sql`

**Interfaces:** none new — grants the existing service role `SELECT, INSERT` (no `UPDATE`/`DELETE`,
matching the table's own immutability) on `audit_events`.

No test cycle (infra grant, not application logic) — matches Task 1's own no-test-cycle rationale.

- [ ] **Step 1: Add a new grant bucket**

Open `infra/aws/sql/dotnet-service-role.sql`, find the "Read/write tables" `GRANT SELECT, INSERT,
UPDATE` block (section 4), and add a new section immediately after it:

```sql
-- ---------------------------------------------------------------------------
-- 4.5. Audit events (new domain, 2026-07-31): INSERT + SELECT only. Never
--    UPDATE/DELETE -- audit_events is immutable by design (see
--    infra/aws/sql/audit-events-schema.sql's REVOKE + ENABLE ALWAYS trigger),
--    so this role is deliberately never granted those verbs, unlike the
--    read/write bucket above.
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT ON TABLE public."audit_events" TO formmaps_dotnet_svc;
```

Also update the file's own maintenance note/table-count comment if it references an exact table
count, so it stays accurate.

- [ ] **Step 2: Commit**

```bash
git add infra/aws/sql/dotnet-service-role.sql
git commit -m "chore(audit): grant formmaps_dotnet_svc SELECT+INSERT on audit_events"
```

---

### Task 8: Retrofit `LiaSessionWriter`

**Files:**
- Modify: `services/api/src/FormMaps.Infrastructure/Assessments/LiaSessionWriter.cs`
- Modify: `services/api/tests/FormMaps.IntegrationTests/Assessments/Data/lia-schema.sql` (append simplified `audit_events` table — see Global Constraints)
- Modify: `services/api/tests/FormMaps.IntegrationTests/Assessments/LiaSessionWriterTests.cs` (or the
  relevant existing completion test file — locate the test(s) covering `CompleteAsync`/timeout/expiry
  completion paths before editing)

**Interfaces:**
- Consumes: `IAuditEventWriter` (Task 2/3).
- Modifies: `LiaSessionWriter`'s constructor (adds `IAuditEventWriter auditEventWriter` primary-ctor
  param) and every one of its 5 `logger.LogInformation("audit.assessment.lia.completed ...")` call
  sites (kept as-is; a `WriteAsync` call is added alongside each).

- [ ] **Step 1: Append the simplified fixture table**

```sql
-- Append to services/api/tests/FormMaps.IntegrationTests/Assessments/Data/lia-schema.sql
-- Simplified audit_events shape for retrofit-wiring tests only (no RLS/immutability trigger --
-- those are proven once in FormMaps.IntegrationTests/Audit; see plan Global Constraints).
CREATE TABLE IF NOT EXISTS "audit_events" (
    "id" TEXT PRIMARY KEY,
    "occurredAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "eventType" TEXT NOT NULL,
    "actorUserId" TEXT,
    "actorRole" TEXT,
    "schoolId" TEXT,
    "subjectType" TEXT NOT NULL,
    "subjectId" TEXT,
    "outcome" TEXT NOT NULL DEFAULT 'success',
    "metadata" JSONB
);
```

- [ ] **Step 2: Write the failing test**

Find the existing test covering `CompleteAsync` (e.g. in `LiaSessionWriterTests.cs`) and add an
assertion alongside it — a new fact proving persistence, using the fixture's existing session
factory:

```csharp
[Fact]
public async Task CompleteAsync_OnSuccess_PersistsAuditEvent()
{
    // Arrange: reuse this file's existing seeding helper to create an in-progress, fully-answered
    // session (see the existing CompleteAsync success test for the exact seed shape), then:
    var auditWriter = new AuditEventWriter(fixture.SessionFactory, NullLogger<AuditEventWriter>.Instance);
    var writer = new LiaSessionWriter(fixture.SessionFactory, questionIdResolver, auditWriter, NullLogger<LiaSessionWriter>.Instance);

    await writer.CompleteAsync(sessionId, ownerUserId, CancellationToken.None);

    await using var connection = new NpgsqlConnection(fixture.ConnectionString);
    await connection.OpenAsync();
    await using var command = connection.CreateCommand();
    command.CommandText = """SELECT count(*)::int FROM "audit_events" WHERE "eventType" = 'audit.assessment.lia.completed' AND "subjectId" = @sessionId""";
    var p = command.CreateParameter(); p.ParameterName = "sessionId"; p.Value = sessionId; command.Parameters.Add(p);
    Assert.Equal(1, (int)(await command.ExecuteScalarAsync())!);
}
```

Adapt variable names (`sessionId`, `ownerUserId`, `questionIdResolver`, `fixture`) to whatever this
file's existing tests already use — do not invent new seeding logic, reuse the existing pattern.

- [ ] **Step 3: Run test, confirm it fails**

```bash
dotnet test tests/FormMaps.IntegrationTests --filter FullyQualifiedName~LiaSessionWriterTests
```
Expected: build error (constructor signature mismatch once Step 4 below is only half-done — apply
Step 4 in full before re-running).

- [ ] **Step 4: Add the constructor param and wire each call site**

```csharp
// services/api/src/FormMaps.Infrastructure/Assessments/LiaSessionWriter.cs
public sealed class LiaSessionWriter(
    IFormMapsDatabaseSessionFactory databaseSessionFactory,
    ILiaQuestionIdResolver questionIdResolver,
    FormMaps.Application.Audit.IAuditEventWriter auditEventWriter,
    ILogger<LiaSessionWriter> logger) : ILiaSessionWriter
```

At each of the 5 existing call sites, immediately after the existing `logger.LogInformation("audit.assessment.lia.completed ...")` line, add:

```csharp
await auditEventWriter.WriteAsync(new FormMaps.Application.Audit.AuditEvent(
    EventType: "audit.assessment.lia.completed",
    ActorUserId: ownerUserId,
    ActorRole: null,
    SchoolId: null,
    SubjectType: "lia_session",
    SubjectId: sessionId,
    Metadata: new Dictionary<string, object?>
    {
        ["globalPercentile"] = result.GlobalPercentile,
        ["performanceLevel"] = result.PerformanceLevel,
    }), cancellationToken);
```

Adjust the local variable names per call site to match what's actually in scope there (each of the 5
sites already has `sessionId`/`ownerUserId`/the result object in scope — that's exactly what the
existing log line's `{SessionId}`/`{ActorUserId}`/etc. placeholders are bound to; use the same
variables). Update any DI-based construction of `LiaSessionWriter` in non-test code (there should be
none outside `DependencyInjection.cs`'s `AddScoped`, which resolves the new constructor param
automatically — no change needed there).

- [ ] **Step 5: Run tests, confirm they pass**

```bash
dotnet test tests/FormMaps.IntegrationTests --filter FullyQualifiedName~LiaSessionWriterTests
dotnet build services/api/FormMaps.slnx
```
Expected: all PASS, build clean (confirms no other call site broke).

- [ ] **Step 6: Commit**

```bash
git add src/FormMaps.Infrastructure/Assessments/LiaSessionWriter.cs tests/FormMaps.IntegrationTests/Assessments/Data/lia-schema.sql tests/FormMaps.IntegrationTests/Assessments/LiaSessionWriterTests.cs
git commit -m "feat(audit): persist LiaSessionWriter's audit.assessment.lia.completed events"
```

---

### Task 9: Retrofit `PersonalitySessionWriter`

**Files:**
- Modify: `services/api/src/FormMaps.Infrastructure/Assessments/PersonalitySessionWriter.cs`
- Modify: its Testcontainers fixture schema file (append the same simplified `audit_events` table as Task 8, Step 1)
- Modify: its existing integration test file

**Interfaces:** same shape as Task 8 — add `IAuditEventWriter` ctor param, wire `audit.assessment.personality.started` (in `StartAsync`) and `audit.assessment.personality.completed` (in `CompleteAsync`), `SubjectType: "personality_session"`.

- [ ] **Step 1:** Append the simplified `audit_events` table to this domain's fixture schema file (locate it — grep the test project for `personality` + `.sql`; likely alongside `lia-schema.sql`'s sibling in the same `Assessments/Data/` folder or its own).
- [ ] **Step 2:** Add two failing tests (mirror Task 8 Step 2's shape) — one asserting a row after `StartAsync`, one after `CompleteAsync`, filtering by the two distinct `eventType` values.
- [ ] **Step 3:** Confirm both fail (build error from the constructor mismatch once wired below).
- [ ] **Step 4:** Add `IAuditEventWriter auditEventWriter` to the primary constructor; at the `audit.assessment.personality.started` log line, add a `WriteAsync` call with `SubjectType: "personality_session"`, `SubjectId: sessionId`, `Metadata: { ["variant"] = variant }`; at `audit.assessment.personality.completed`, add one with `Metadata: { ["type"] = type }`.
- [ ] **Step 5:** Run tests, confirm PASS; run full `dotnet build` to confirm no other call site broke.
- [ ] **Step 6:** Commit — `git commit -m "feat(audit): persist PersonalitySessionWriter's audit events (started, completed)"`.

---

### Task 10: Retrofit `TestScoreWriter`

**Files:**
- Modify: `services/api/src/FormMaps.Infrastructure/Assessments/TestScoreWriter.cs`
- Modify: its Testcontainers fixture schema file (append simplified `audit_events`)
- Modify: its existing integration test file

**Interfaces:** add `IAuditEventWriter` ctor param, wire `audit.assessment.testscore.created` (in `CreateAsync`), `.updated` (in `UpdateAsync`), `.deleted` (in `DeleteAsync`), `SubjectType: "test_score"`, `SubjectId: <row/testScore id>`.

- [ ] **Step 1:** Append simplified `audit_events` to the fixture schema.
- [ ] **Step 2:** Add three failing tests (created/updated/deleted), each asserting exactly one row with the matching `eventType` and correct `subjectId`.
- [ ] **Step 3:** Confirm all three fail.
- [ ] **Step 4:** Add the ctor param; wire all three call sites, each with `Metadata: null` (nothing beyond IDs is logged today at any of these three sites — keep it that way, don't invent new metadata).
- [ ] **Step 5:** Run tests, confirm PASS; `dotnet build` clean.
- [ ] **Step 6:** Commit — `git commit -m "feat(audit): persist TestScoreWriter's audit events (created, updated, deleted)"`.

---

### Task 11: Retrofit `PcaExamWriter`

**Files:**
- Modify: `services/api/src/FormMaps.Infrastructure/Assessments/PcaExamWriter.cs`
- Modify: its Testcontainers fixture schema file (append simplified `audit_events`)
- Modify: its existing integration test file

**Interfaces:** add `IAuditEventWriter` ctor param, wire `audit.assessment.pcaexam.started` (in `StartExamAsync`, `SubjectType: "pca_exam_session"`) and `.submitted` (in `SubmitExamAsync`, `Metadata: { ["score"], ["correct"], ["total"] }` matching the existing log line's fields).

- [ ] **Step 1:** Append simplified `audit_events` to the fixture schema.
- [ ] **Step 2:** Add two failing tests (started/submitted).
- [ ] **Step 3:** Confirm both fail.
- [ ] **Step 4:** Add the ctor param; wire both call sites.
- [ ] **Step 5:** Run tests, confirm PASS; `dotnet build` clean.
- [ ] **Step 6:** Commit — `git commit -m "feat(audit): persist PcaExamWriter's audit events (started, submitted)"`.

---

### Task 12: Retrofit `VocationalWriter`

**Files:**
- Modify: `services/api/src/FormMaps.Infrastructure/Assessments/VocationalWriter.cs`
- Modify: its Testcontainers fixture schema file (append simplified `audit_events`)
- Modify: its existing integration test file

**Interfaces:** add `IAuditEventWriter` ctor param, wire `audit.assessment.vocational.recomputed` (in `RecomputeScoreAsync`, `SubjectType: "vocational_result"`, `SubjectId: evaluatedUserId`, `Metadata: { ["instrumentVersion"], ["composite"], ["band"] }`) and `.integrated_recomputed` (in `RecomputeIntegratedAsync`, `SubjectType: "vocational_integrated_result"`, same metadata shape with `["integratedComposite"]`).

- [ ] **Step 1:** Append simplified `audit_events` to the fixture schema.
- [ ] **Step 2:** Add two failing tests.
- [ ] **Step 3:** Confirm both fail.
- [ ] **Step 4:** Add the ctor param; wire both call sites.
- [ ] **Step 5:** Run tests, confirm PASS; `dotnet build` clean.
- [ ] **Step 6:** Commit — `git commit -m "feat(audit): persist VocationalWriter's audit events (recomputed, integrated_recomputed)"`.

---

### Task 13: Retrofit `Question360Writer`

**Files:**
- Modify: `services/api/src/FormMaps.Infrastructure/Assessments/Question360Writer.cs`
- Modify: its Testcontainers fixture schema file (append simplified `audit_events`)
- Modify: its existing integration test file

**Interfaces:** add `IAuditEventWriter` ctor param, wire all 5 call sites (`created`, `updated`,
`activated`/`deactivated`, `deleted`, `bulk_created`), `SubjectType: "question_360"`,
`SubjectId: questionId` (null for `bulk_created` — no single subject, matches the spec's `SubjectId?`
nullability).

- [ ] **Step 1:** Append simplified `audit_events` to the fixture schema.
- [ ] **Step 2:** Add 5 failing tests, one per event type (for the combined `activated`/`deactivated` site, two tests — one per boolean branch).
- [ ] **Step 3:** Confirm all fail.
- [ ] **Step 4:** Add the ctor param; wire all 5 call sites. For `bulk_created`, use `Metadata: { ["createdCount"], ["totalRequested"] }` matching the existing log line, `SubjectId: null`.
- [ ] **Step 5:** Run tests, confirm PASS; `dotnet build` clean.
- [ ] **Step 6:** Commit — `git commit -m "feat(audit): persist Question360Writer's audit events (all 5 mutation types)"`.

---

### Task 14: Retrofit `EvaluationExternalService`

**Files:**
- Modify: `services/api/src/FormMaps.Infrastructure/Assessments/EvaluationExternalService.cs`
- Modify: its Testcontainers fixture schema file (append simplified `audit_events`)
- Modify: its existing integration test file

**Interfaces:** add `IAuditEventWriter` ctor param, wire `audit.evaluation.feedback.submitted` (`SubjectType: "evaluation_group"`, `SubjectId: input.EvaluationGroupId`).

- [ ] **Step 1:** Append simplified `audit_events` to the fixture schema.
- [ ] **Step 2:** Add one failing test.
- [ ] **Step 3:** Confirm it fails.
- [ ] **Step 4:** Add the ctor param; wire the call site.
- [ ] **Step 5:** Run tests, confirm PASS; `dotnet build` clean.
- [ ] **Step 6:** Commit — `git commit -m "feat(audit): persist EvaluationExternalService's audit.evaluation.feedback.submitted event"`.

---

### Task 15: Full-solution verification

**Files:** none (verification only).

- [ ] **Step 1: Full build**

```bash
cd /Users/federicotafur/Desktop/NexaDev/clients/tims-international/github/formmaps/services/api
dotnet build FormMaps.slnx
```
Expected: 0 errors, 0 new warnings.

- [ ] **Step 2: Full test suite**

```bash
dotnet test FormMaps.slnx
```
Expected: all PASS, including every test added across Tasks 1-14 and every pre-existing test in the
7 retrofitted writer classes (proves the retrofit didn't regress any existing behavior — each writer's
own business-logic tests are untouched and must still pass unmodified).

- [ ] **Step 3: Confirm no other construction site of the 7 retrofitted writers was missed**

```bash
grep -rn "new LiaSessionWriter(\|new PersonalitySessionWriter(\|new TestScoreWriter(\|new PcaExamWriter(\|new VocationalWriter(\|new Question360Writer(\|new EvaluationExternalService(" \
  /Users/federicotafur/Desktop/NexaDev/clients/tims-international/github/formmaps/services/api/src
```
Expected: no results (production code only ever resolves these via DI's `AddScoped`, which already
picked up the new constructor parameter automatically in Tasks 8-14 — this just confirms there's no
stray manual `new` construction elsewhere in `src/` that Step 1's build would have already caught, but
is worth confirming explicitly for a compliance-critical retrofit).

- [ ] **Step 4: Report**

Summarize: full build/test status, table of the 7 retrofitted files with call-site counts, and the 3
open items carried into the spec's "Open items" section (tracking issue, `audit:read` permission
fast-follow, TIMS-interop deferral) for Federico's follow-up.

No commit for this task — it's verification-only, per `superpowers:verification-before-completion`.
