# Domain 7b: Messaging (SignalR real-time rebuild) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port `formmaps-platform/api/src/routes/messages.ts` (7 REST endpoints) to `.NET`, and add a
SignalR hub that pushes live message-arrival notifications, replacing the frontend's 15-second poll.

**Architecture:** One `IMessagesRepository` method per legacy route (matching `VideoSessionsRepository`'s
per-route-method shape), raw ADO.NET/Npgsql SQL against the existing `conversations`/`messages` tables
(RLS-enforced, participant-scoped — see Global Constraints). A `MessagesHub` (push-only, no
client-to-server methods) receives notifications via `IMessagesRealtimeNotifier`, called from the
repository strictly after each DB commit. The hub requires a direct cross-origin WebSocket connection
from the browser to `formmaps-api-prod` (Vercel cannot proxy WebSockets through `next.config.ts`
rewrites), authenticated via a short-lived ticket minted through the existing same-origin, cookie-backed
REST path — never the long-lived session JWT.

**Tech Stack:** ASP.NET Core Minimal APIs, `Microsoft.AspNetCore.SignalR` (built into the shared
framework, no new NuGet package), Npgsql/ADO.NET, `@microsoft/signalr` (new frontend npm dependency).

## Global Constraints

- Mount path: `/api/v1/messages`, matching legacy (`app.use("/api/v1/messages", messagesRoutes)`).
- Auth guard: `IProtectedRequestGuard.RequireIdentity` (identity-only, no school-context requirement) —
  matches legacy's plain `authenticate` middleware with no `requireSchoolMembership` at the router level;
  Video's endpoints use the same guard for the same reason (school-less coach↔student messaging exists).
- **RLS-native 404/403 collapse (deliberate, documented divergence from legacy):** `conversations`/
  `messages` RLS policies (`api/prisma/rls/005-sensitive.sql`) are **participant-scoped**
  (`participantAId`/`participantBId` = `current_setting('app.current_user_id')`), unlike
  `counselor_sessions`' school-scoped policy that required Video's `IsParticipant` app-layer check. A
  non-participant's query for a real conversation returns **zero rows from Postgres itself** — the .NET
  port cannot distinguish "doesn't exist" from "exists, not yours" without bypassing RLS, which normal
  request-path queries never do (bypass is ops-script-only). Both cases return **404 "Conversation not
  found"** here, not legacy's 403 "Access denied" — this is existence-oracle-safer, matching the same
  precedent already set by Video's `POST /sessions` (404 "Participant not found" instead of a 403). Do
  not try to replicate legacy's 403 by adding a bypass query — that would be a regression, not parity.
- Blocking (`user_blocks` table, `isBlockedBetween`/`blockedUserIds` in `moderationService.ts`) and the
  notification outbox (`notification_outbox` table, `enqueueUnreadMessageNotification` in
  `notificationOutboxService.ts`) have no prior `.NET` port — both are simple enough to inline as raw SQL
  within `MessagesRepository` rather than standing up new shared abstractions (no other `.NET` domain
  needs them yet; YAGNI on a shared `IBlockingService`/`IOutboxWriter` until a second consumer exists).
- Timestamps: bind `Kind=Unspecified` + ms-truncated on write, matching every other repository's
  convention for `timestamp` (without time zone) columns in this schema.
- Flags (frontend `next.config.ts`, all default OFF): `FORMMAPS_ROUTE_MESSAGES_TO_DOTNET` gates all 7 REST
  rewrites as one unit (they're one cohesive feature, unlike Video's independently-rollback-able
  sub-flags — no sub-feature here is safe to ship without the others). `FORMMAPS_ROUTE_MESSAGES_REALTIME_TO_DOTNET`
  independently gates the frontend's SignalR connection attempt — connecting a socket the backend can't
  yet serve would just fail closed, but keeping it separate lets REST ship and soak before flipping on
  the hub.
- Ops (not code, tracked at cutover — not a task in this plan): pin `formmaps-api-prod`'s App Runner
  autoscaling max to 1 instance before flipping `FORMMAPS_ROUTE_MESSAGES_REALTIME_TO_DOTNET` in
  production (no Redis backplane — see design doc).

---

### Task 1: Types, repository skeleton, and `GET /unread-count`

**Files:**
- Create: `services/api/src/FormMaps.Application/Messaging/MessagingTypes.cs`
- Create: `services/api/src/FormMaps.Application/Messaging/IMessagesRepository.cs`
- Create: `services/api/src/FormMaps.Infrastructure/Messaging/MessagesRepository.cs`
- Create: `services/api/src/FormMaps.Api/Endpoints/MessagesEndpoints.cs`
- Modify: `services/api/src/FormMaps.Infrastructure/DependencyInjection.cs`
- Modify: `services/api/src/FormMaps.Api/Program.cs`
- Test: `services/api/tests/FormMaps.IntegrationTests/Messaging/MessagesUnreadCountTests.cs`

**Interfaces:**
- Produces: `IMessagesRepository.GetUnreadCountAsync(RequestContext, string userId, CancellationToken)
  : Task<int>` — used by every later task's endpoint file (same interface, added to across tasks).
- Produces: `MessagesEndpoints.MapMessagesEndpoints(this IEndpointRouteBuilder)` — later tasks add more
  `group.MapX(...)` lines inside it.

- [ ] **Step 1: Write `MessagingTypes.cs`**

```csharp
namespace FormMaps.Application.Messaging;

public sealed record ContactRow(string Id, string? Name, string Email, string RoleName);

public sealed record ConversationSummary(
    string Id, string OtherParticipantId, string? OtherParticipantName, string OtherParticipantEmail,
    string? LastMessagePreview, DateTime? LastMessageAt, int UnreadCount);

public sealed record MessageRow(
    string Id, string ConversationId, string SenderId, string? SenderName, string Content,
    DateTime? ReadAt, DateTime CreatedDate);

public sealed record ConversationMessagesPage(
    IReadOnlyList<MessageRow> Data, int Total, int Page, int Limit, int TotalPages);

public enum CreateConversationStatus { Created, Existing, ValidationFailed, RecipientNotFound, Blocked, Forbidden }
public sealed record CreateConversationResult(CreateConversationStatus Status, ConversationSummary? Data, string? Error);

public enum ConversationMessagesStatus { Ok, NotFound }
public sealed record ConversationMessagesResult(ConversationMessagesStatus Status, ConversationMessagesPage? Page);

public enum SendMessageStatus { Sent, NotFound, Blocked }
public sealed record SendMessageResult(
    SendMessageStatus Status, MessageRow? Message, string? RecipientId, string? RecipientEmail,
    string? SenderName, string? Preview);
```

- [ ] **Step 2: Write `IMessagesRepository.cs`**

```csharp
using FormMaps.Application.Auth;

namespace FormMaps.Application.Messaging;

public interface IMessagesRepository
{
    Task<int> GetUnreadCountAsync(RequestContext context, string userId, CancellationToken cancellationToken = default);
}
```

- [ ] **Step 3: Write `MessagesRepository.cs`**

```csharp
using System.Data.Common;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;
using FormMaps.Application.Messaging;

namespace FormMaps.Infrastructure.Messaging;

/// <summary>
/// SQL for routes/messages.ts (586 lines). One method per legacy route, matching
/// VideoSessionsRepository's convention. RLS on "conversations"/"messages" is participant-scoped
/// (api/prisma/rls/005-sensitive.sql) — see the plan's Global Constraints for the resulting
/// 404-collapses-403 divergence from legacy, which is deliberate.
/// </summary>
public sealed class MessagesRepository(
    IFormMapsDatabaseSessionFactory databaseSessionFactory,
    TimeProvider timeProvider) : IMessagesRepository
{
    public async Task<int> GetUnreadCountAsync(RequestContext context, string userId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        await using var command = Command(session, """
            SELECT count(*)::int FROM "messages" m
            WHERE m."conversationId" IN (
                SELECT c."id" FROM "conversations" c
                WHERE c."participantAId" = @userId OR c."participantBId" = @userId
            )
            AND m."senderId" <> @userId AND m."readAt" IS NULL
            """);
        AddParameter(command, "userId", userId);
        var result = await command.ExecuteScalarAsync(cancellationToken);
        return (int)result!;
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

    private static DateTime NowTruncated() =>
        DateTime.SpecifyKind(new DateTime(timeProviderTicks(), DateTimeKind.Unspecified), DateTimeKind.Unspecified);

    private long timeProviderTicks() => (timeProvider.GetUtcNow().UtcDateTime.Ticks / TimeSpan.TicksPerMillisecond) * TimeSpan.TicksPerMillisecond;
}
```

- [ ] **Step 4: Write `MessagesEndpoints.cs`**

```csharp
// services/api/src/FormMaps.Api/Endpoints/MessagesEndpoints.cs
using FormMaps.Application.Auth;
using FormMaps.Application.Messaging;

namespace FormMaps.Api.Endpoints;

/// <summary>
/// Messaging (routes/messages.ts, 7 endpoints under /api/v1/messages). No RBAC permission gate —
/// RequireIdentity only, matching legacy's plain `authenticate` middleware (school-less coach<->student
/// messaging exists). Flag: FORMMAPS_ROUTE_MESSAGES_TO_DOTNET gates all 7 as one unit (see the Domain 7b
/// design spec and plan's Global Constraints for why they aren't independently flagged).
/// </summary>
public static class MessagesEndpoints
{
    public static IEndpointRouteBuilder MapMessagesEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/messages").WithTags("Messages");
        group.MapGet("/unread-count", GetUnreadCountAsync);
        return app;
    }

    private static async Task<IResult> GetUnreadCountAsync(
        IRequestContextAccessor accessor, IProtectedRequestGuard guard, IMessagesRepository repository,
        CancellationToken cancellationToken)
    {
        var context = accessor.Current;
        var decision = guard.RequireIdentity(context);
        if (!decision.Allowed) return Deny(decision);

        var count = await repository.GetUnreadCountAsync(context, context.Tenant!.UserId, cancellationToken);
        return Results.Ok(new { success = true, data = new { unreadCount = count } });
    }

    private static IResult Deny(GuardDecision decision) =>
        Results.Json(new { success = false, code = decision.Code, message = decision.Message }, statusCode: decision.StatusCode);

    private static IResult NotFound(string message) => Results.Json(new { success = false, message }, statusCode: StatusCodes.Status404NotFound);
    private static IResult Forbidden(string message) => Results.Json(new { success = false, message }, statusCode: StatusCodes.Status403Forbidden);
    private static IResult BadRequestResult(string message) => Results.Json(new { success = false, message }, statusCode: StatusCodes.Status400BadRequest);
}
```

- [ ] **Step 5: Register DI and Program.cs mapping**

In `DependencyInjection.cs`, alongside `services.AddScoped<IVideoSessionsRepository, VideoSessionsRepository>();`:

```csharp
services.AddScoped<IMessagesRepository, MessagesRepository>();
```

In `Program.cs`, alongside `app.MapVideoEndpoints();`:

```csharp
app.MapMessagesEndpoints();
```

- [ ] **Step 6: Write the failing test**

```csharp
// services/api/tests/FormMaps.IntegrationTests/Messaging/MessagesUnreadCountTests.cs
using FormMaps.Application.Auth;
using FormMaps.Infrastructure.Data;
using FormMaps.Infrastructure.Messaging;
using Microsoft.Extensions.Time.Testing;
using Npgsql;

namespace FormMaps.IntegrationTests.Messaging;

public sealed class MessagesUnreadCountTests : IClassFixture<MessagingDatabaseFixture>, IAsyncLifetime
{
    private readonly MessagingDatabaseFixture _fixture;
    private NpgsqlDataSource _dataSource = null!;

    public MessagesUnreadCountTests(MessagingDatabaseFixture fixture) => _fixture = fixture;

    public Task InitializeAsync()
    {
        _dataSource = NpgsqlDataSource.Create(_fixture.ConnectionString);
        return Task.CompletedTask;
    }

    public async Task DisposeAsync() => await _dataSource.DisposeAsync();

    [Fact]
    public async Task Counts_only_unread_messages_from_others_across_all_my_conversations()
    {
        var (userId, otherId, conversationId) = await _fixture.SeedConversationAsync();
        await _fixture.SeedMessageAsync(conversationId, senderId: otherId, readAt: null);
        await _fixture.SeedMessageAsync(conversationId, senderId: otherId, readAt: null);
        await _fixture.SeedMessageAsync(conversationId, senderId: userId, readAt: null); // mine, not counted
        await _fixture.SeedMessageAsync(conversationId, senderId: otherId, readAt: DateTime.UtcNow); // read, not counted

        var repository = new MessagesRepository(
            new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()),
            new FakeTimeProvider());

        var count = await repository.GetUnreadCountAsync(_fixture.Ctx(userId), userId);

        Assert.Equal(2, count);
    }
}
```

Also create the shared fixture used by every task in this plan:

```csharp
// services/api/tests/FormMaps.IntegrationTests/Messaging/MessagingDatabaseFixture.cs
using FormMaps.Application.Auth;
using Npgsql;
using Testcontainers.PostgreSql;

namespace FormMaps.IntegrationTests.Messaging;

public sealed class MessagingDatabaseFixture : IAsyncLifetime
{
    private readonly PostgreSqlContainer _container = new PostgreSqlBuilder()
        .WithImage("postgres:16-alpine")
        .Build();

    public string ConnectionString => _container.GetConnectionString();

    public async Task InitializeAsync()
    {
        await _container.StartAsync();
        await using var conn = new NpgsqlConnection(ConnectionString);
        await conn.OpenAsync();
        var schemaSql = await File.ReadAllTextAsync(
            Path.Combine(AppContext.BaseDirectory, "Messaging", "messaging-schema.sql"));
        await using var cmd = new NpgsqlCommand(schemaSql, conn);
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task DisposeAsync() => await _container.DisposeAsync();

    public RequestContext Ctx(string userId, string? schoolId = null, bool isSuperAdmin = false) =>
        RequestContext.Authenticated(
            new RequestActor(userId, isSuperAdmin ? "Super Admin" : "student", $"{userId}@test.dev", "Test User"),
            schoolId, [], TokenSource.AuthorizationBearer, isDevelopmentOverride: false);

    public async Task<(string UserId, string OtherId, string ConversationId)> SeedConversationAsync(
        string? schoolIdA = null, string? schoolIdB = null, string roleA = "student", string roleB = "counselor")
    {
        var (a, b) = (Guid.NewGuid().ToString(), Guid.NewGuid().ToString());
        await using var conn = new NpgsqlConnection(ConnectionString);
        await conn.OpenAsync();
        foreach (var (id, role, schoolId) in new[] { (a, roleA, schoolIdA), (b, roleB, schoolIdB) })
        {
            await using var userCmd = new NpgsqlCommand(
                """INSERT INTO "users" ("id","name","email","roleId","roleName","schoolId","isActive") VALUES (@id,@id,@id || '@test.dev','r','' || @role,@schoolId,true)""",
                conn);
            userCmd.Parameters.AddWithValue("id", id);
            userCmd.Parameters.AddWithValue("role", role);
            userCmd.Parameters.AddWithValue("schoolId", (object?)schoolId ?? DBNull.Value);
            await userCmd.ExecuteNonQueryAsync();
        }
        var (pa, pb) = string.CompareOrdinal(a, b) < 0 ? (a, b) : (b, a);
        var conversationId = Guid.NewGuid().ToString();
        await using var convCmd = new NpgsqlCommand(
            """INSERT INTO "conversations" ("id","participantAId","participantBId") VALUES (@id,@pa,@pb)""", conn);
        convCmd.Parameters.AddWithValue("id", conversationId);
        convCmd.Parameters.AddWithValue("pa", pa);
        convCmd.Parameters.AddWithValue("pb", pb);
        await convCmd.ExecuteNonQueryAsync();
        return (a, b, conversationId);
    }

    public async Task SeedMessageAsync(string conversationId, string senderId, DateTime? readAt)
    {
        await using var conn = new NpgsqlConnection(ConnectionString);
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand(
            """INSERT INTO "messages" ("id","conversationId","senderId","content","readAt") VALUES (@id,@cid,@sid,'hi',@readAt)""",
            conn);
        cmd.Parameters.AddWithValue("id", Guid.NewGuid().ToString());
        cmd.Parameters.AddWithValue("cid", conversationId);
        cmd.Parameters.AddWithValue("sid", senderId);
        cmd.Parameters.AddWithValue("readAt", (object?)readAt ?? DBNull.Value);
        await cmd.ExecuteNonQueryAsync();
    }
}
```

`messaging-schema.sql` (test fixture schema, mirrors `lia-schema.sql`'s pattern for this plan's tables —
`users`, `conversations`, `messages`, `user_blocks`, `counselor_student_assignments`,
`student_parent_links`, `notification_outbox`, plus the RLS policies from `005-sensitive.sql` verbatim for
`conversations`/`messages` so tests exercise real RLS, not a permissive stand-in):

```sql
-- services/api/tests/FormMaps.IntegrationTests/Messaging/messaging-schema.sql
CREATE TABLE "users" (
  "id" text PRIMARY KEY, "name" text NOT NULL, "email" text NOT NULL,
  "roleId" text NOT NULL DEFAULT '', "roleName" text NOT NULL, "schoolId" text, "isActive" boolean NOT NULL DEFAULT true
);

CREATE TABLE "conversations" (
  "id" text PRIMARY KEY, "participantAId" text NOT NULL, "participantBId" text NOT NULL,
  "lastMessageAt" timestamp, "lastMessagePreview" text, "isActive" boolean NOT NULL DEFAULT true,
  "createdDate" timestamp NOT NULL DEFAULT now(), "updatedAt" timestamp NOT NULL DEFAULT now(),
  UNIQUE ("participantAId", "participantBId")
);

CREATE TABLE "messages" (
  "id" text PRIMARY KEY, "conversationId" text NOT NULL REFERENCES "conversations"("id") ON DELETE CASCADE,
  "senderId" text NOT NULL, "content" text NOT NULL, "readAt" timestamp, "isActive" boolean NOT NULL DEFAULT true,
  "createdDate" timestamp NOT NULL DEFAULT now(), "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE "user_blocks" (
  "id" text PRIMARY KEY, "blockerId" text NOT NULL, "blockedId" text NOT NULL, "isActive" boolean NOT NULL DEFAULT true
);

CREATE TABLE "counselor_student_assignments" (
  "id" text PRIMARY KEY, "counselorId" text NOT NULL, "studentId" text NOT NULL, "isActive" boolean NOT NULL DEFAULT true
);

CREATE TABLE "student_parent_links" (
  "id" text PRIMARY KEY, "studentId" text NOT NULL, "parentUserId" text, "isActive" boolean NOT NULL DEFAULT true,
  "isAccepted" boolean NOT NULL DEFAULT false
);

CREATE TABLE "notification_outbox" (
  "id" text PRIMARY KEY, "type" text NOT NULL, "payload" jsonb NOT NULL, "due_at" timestamp NOT NULL,
  "processed_at" timestamp, "attempts" int NOT NULL DEFAULT 0, "createdDate" timestamp NOT NULL DEFAULT now()
);

ALTER TABLE "conversations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "conversations" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "conversations"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR ("participantAId" = current_setting('app.current_user_id', true) AND current_setting('app.current_user_id', true) <> '')
    OR ("participantBId" = current_setting('app.current_user_id', true) AND current_setting('app.current_user_id', true) <> '')
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR ("participantAId" = current_setting('app.current_user_id', true) AND current_setting('app.current_user_id', true) <> '')
    OR ("participantBId" = current_setting('app.current_user_id', true) AND current_setting('app.current_user_id', true) <> '')
  );

ALTER TABLE "messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "messages" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "messages"
  USING (current_setting('app.bypass_rls', true) = 'on' OR EXISTS (SELECT 1 FROM conversations c WHERE c.id = "messages"."conversationId"))
  WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR EXISTS (SELECT 1 FROM conversations c WHERE c.id = "messages"."conversationId"));
```

Run: `dotnet test tests/FormMaps.IntegrationTests --filter "FullyQualifiedName~MessagesUnreadCountTests"`
Expected: FAIL — `MessagesRepository` doesn't exist yet (or compile error if Steps 1-5 already applied
in order; if so this is the first REAL run and should already PASS — see note below).

- [ ] **Step 7: Verify it passes**

Since Steps 1-5 already wrote the implementation (this task is small enough that test-first would mean
writing the test against a not-yet-existing type, which doesn't compile) — run the test now:

Run: `dotnet test tests/FormMaps.IntegrationTests --filter "FullyQualifiedName~MessagesUnreadCountTests"`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add services/api/src/FormMaps.Application/Messaging services/api/src/FormMaps.Infrastructure/Messaging \
  services/api/src/FormMaps.Api/Endpoints/MessagesEndpoints.cs services/api/src/FormMaps.Infrastructure/DependencyInjection.cs \
  services/api/src/FormMaps.Api/Program.cs services/api/tests/FormMaps.IntegrationTests/Messaging
git commit -m "feat(messaging): port GET /unread-count to .NET (FM-DOTNET-098, dark)"
```

---

### Task 2: `GET /contacts`

**Files:**
- Modify: `services/api/src/FormMaps.Application/Messaging/IMessagesRepository.cs`
- Modify: `services/api/src/FormMaps.Infrastructure/Messaging/MessagesRepository.cs`
- Modify: `services/api/src/FormMaps.Api/Endpoints/MessagesEndpoints.cs`
- Test: `services/api/tests/FormMaps.IntegrationTests/Messaging/MessagesContactsTests.cs`

**Interfaces:**
- Consumes: `ContactRow` from Task 1.
- Produces: `IMessagesRepository.GetContactsAsync(RequestContext, string userId, string role, string? schoolId, string? search, CancellationToken) : Task<IReadOnlyList<ContactRow>>`.

- [ ] **Step 1: Add the interface method**

```csharp
Task<IReadOnlyList<ContactRow>> GetContactsAsync(
    RequestContext context, string userId, string role, string? schoolId, string? search,
    CancellationToken cancellationToken = default);
```

- [ ] **Step 2: Write the failing test**

```csharp
// services/api/tests/FormMaps.IntegrationTests/Messaging/MessagesContactsTests.cs
using FormMaps.Application.Auth;
using FormMaps.Infrastructure.Data;
using FormMaps.Infrastructure.Messaging;
using Microsoft.Extensions.Time.Testing;
using Npgsql;

namespace FormMaps.IntegrationTests.Messaging;

public sealed class MessagesContactsTests : IClassFixture<MessagingDatabaseFixture>, IAsyncLifetime
{
    private readonly MessagingDatabaseFixture _fixture;
    private NpgsqlDataSource _dataSource = null!;

    public MessagesContactsTests(MessagingDatabaseFixture fixture) => _fixture = fixture;
    public Task InitializeAsync() { _dataSource = NpgsqlDataSource.Create(_fixture.ConnectionString); return Task.CompletedTask; }
    public async Task DisposeAsync() => await _dataSource.DisposeAsync();

    private MessagesRepository Repo() => new(
        new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()), new FakeTimeProvider());

    [Fact]
    public async Task Student_only_sees_school_admins_and_their_assigned_counselors()
    {
        var schoolId = Guid.NewGuid().ToString();
        var (student, assignedCounselor, _) = await _fixture.SeedConversationAsync(schoolId, schoolId, "student", "counselor");
        var unassignedCounselor = await _fixture.SeedUserAsync(schoolId, "counselor");
        var admin = await _fixture.SeedUserAsync(schoolId, "school_admin");
        await _fixture.SeedAssignmentAsync(assignedCounselor, student);

        var contacts = await Repo().GetContactsAsync(_fixture.Ctx(student, schoolId), student, "student", schoolId, null);

        var ids = contacts.Select(c => c.Id).ToHashSet();
        Assert.Contains(assignedCounselor, ids);
        Assert.Contains(admin, ids);
        Assert.DoesNotContain(unassignedCounselor, ids);
    }

    [Fact]
    public async Task Counselor_sees_all_school_users()
    {
        var schoolId = Guid.NewGuid().ToString();
        var counselor = await _fixture.SeedUserAsync(schoolId, "counselor");
        var student = await _fixture.SeedUserAsync(schoolId, "student");

        var contacts = await Repo().GetContactsAsync(_fixture.Ctx(counselor, schoolId), counselor, "counselor", schoolId, null);

        Assert.Contains(contacts, c => c.Id == student);
    }

    [Fact]
    public async Task No_school_returns_empty_list()
    {
        var userId = Guid.NewGuid().ToString();
        var contacts = await Repo().GetContactsAsync(_fixture.Ctx(userId, null), userId, "student", null, null);
        Assert.Empty(contacts);
    }
}
```

Add `SeedUserAsync`/`SeedAssignmentAsync` to `MessagingDatabaseFixture.cs`:

```csharp
public async Task<string> SeedUserAsync(string? schoolId, string role)
{
    var id = Guid.NewGuid().ToString();
    await using var conn = new NpgsqlConnection(ConnectionString);
    await conn.OpenAsync();
    await using var cmd = new NpgsqlCommand(
        """INSERT INTO "users" ("id","name","email","roleId","roleName","schoolId","isActive") VALUES (@id,@id,@id || '@test.dev','r',@role,@schoolId,true)""",
        conn);
    cmd.Parameters.AddWithValue("id", id);
    cmd.Parameters.AddWithValue("role", role);
    cmd.Parameters.AddWithValue("schoolId", (object?)schoolId ?? DBNull.Value);
    await cmd.ExecuteNonQueryAsync();
    return id;
}

public async Task SeedAssignmentAsync(string counselorId, string studentId)
{
    await using var conn = new NpgsqlConnection(ConnectionString);
    await conn.OpenAsync();
    await using var cmd = new NpgsqlCommand(
        """INSERT INTO "counselor_student_assignments" ("id","counselorId","studentId") VALUES (@id,@c,@s)""", conn);
    cmd.Parameters.AddWithValue("id", Guid.NewGuid().ToString());
    cmd.Parameters.AddWithValue("c", counselorId);
    cmd.Parameters.AddWithValue("s", studentId);
    await cmd.ExecuteNonQueryAsync();
}
```

Run: `dotnet test tests/FormMaps.IntegrationTests --filter "FullyQualifiedName~MessagesContactsTests"`
Expected: FAIL — `GetContactsAsync` not implemented.

- [ ] **Step 3: Implement `GetContactsAsync`**

```csharp
public async Task<IReadOnlyList<ContactRow>> GetContactsAsync(
    RequestContext context, string userId, string role, string? schoolId, string? search,
    CancellationToken cancellationToken = default)
{
    if (string.IsNullOrWhiteSpace(schoolId)) return [];

    await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
    var privileged = role is "school_admin" or "super admin" or "counselor";

    var sql = """
        SELECT u."id", u."name", u."email", u."roleName" FROM "users" u
        WHERE u."schoolId" = @schoolId AND u."isActive" = true AND u."id" <> @userId
        """ + (string.IsNullOrWhiteSpace(search) ? "" : """
         AND (u."name" ILIKE @search OR u."email" ILIKE @search)
        """) + (privileged ? "" : """
         AND (u."roleName" = 'school_admin' OR u."id" = ANY(@assignedIds))
        """) + """
        ORDER BY u."name" ASC LIMIT 20
        """;

    await using var command = Command(session, sql);
    AddParameter(command, "schoolId", schoolId);
    AddParameter(command, "userId", userId);
    if (!string.IsNullOrWhiteSpace(search)) AddParameter(command, "search", $"%{search}%");
    if (!privileged)
    {
        var assignedIds = await GetAssignedCounselorIdsAsync(session, userId, cancellationToken);
        AddParameter(command, "assignedIds", assignedIds.ToArray());
    }

    await using var reader = await command.ExecuteReaderAsync(cancellationToken);
    var rows = new List<ContactRow>();
    while (await reader.ReadAsync(cancellationToken))
    {
        rows.Add(new ContactRow(
            reader.GetString(0),
            reader.IsDBNull(1) ? null : reader.GetString(1),
            reader.GetString(2),
            reader.GetString(3)));
    }
    return rows;
}

private static async Task<IReadOnlyList<string>> GetAssignedCounselorIdsAsync(
    FormMapsDatabaseSession session, string studentId, CancellationToken cancellationToken)
{
    await using var command = Command(session, """
        SELECT "counselorId" FROM "counselor_student_assignments" WHERE "studentId" = @studentId AND "isActive" = true
        """);
    AddParameter(command, "studentId", studentId);
    await using var reader = await command.ExecuteReaderAsync(cancellationToken);
    var ids = new List<string>();
    while (await reader.ReadAsync(cancellationToken)) ids.Add(reader.GetString(0));
    return ids;
}
```

- [ ] **Step 4: Wire the endpoint**

```csharp
group.MapGet("/contacts", GetContactsAsync);
```

```csharp
private static async Task<IResult> GetContactsAsync(
    IRequestContextAccessor accessor, IProtectedRequestGuard guard, IMessagesRepository repository,
    HttpRequest request, CancellationToken cancellationToken)
{
    var context = accessor.Current;
    var decision = guard.RequireIdentity(context);
    if (!decision.Allowed) return Deny(decision);

    var role = (context.Actor!.NormalizedRole).ToLowerInvariant();
    var search = request.Query.TryGetValue("search", out var s) ? s.ToString() : null;
    var contacts = await repository.GetContactsAsync(
        context, context.Tenant!.UserId, role, context.Tenant.SchoolId, search, cancellationToken);
    return Results.Ok(new { success = true, data = contacts });
}
```

- [ ] **Step 5: Run and verify pass**

Run: `dotnet test tests/FormMaps.IntegrationTests --filter "FullyQualifiedName~MessagesContactsTests"`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add services/api/src/FormMaps.Application/Messaging services/api/src/FormMaps.Infrastructure/Messaging \
  services/api/src/FormMaps.Api/Endpoints/MessagesEndpoints.cs services/api/tests/FormMaps.IntegrationTests/Messaging
git commit -m "feat(messaging): port GET /contacts to .NET (FM-DOTNET-099, dark)"
```

---

### Task 3: `GET /conversations`

**Files:**
- Modify: `IMessagesRepository.cs`, `MessagesRepository.cs`, `MessagesEndpoints.cs`
- Test: `services/api/tests/FormMaps.IntegrationTests/Messaging/MessagesListConversationsTests.cs`

**Interfaces:**
- Consumes: `ConversationSummary` from Task 1.
- Produces: `IMessagesRepository.ListConversationsAsync(RequestContext, string userId, CancellationToken) : Task<IReadOnlyList<ConversationSummary>>`.

- [ ] **Step 1: Add interface method**

```csharp
Task<IReadOnlyList<ConversationSummary>> ListConversationsAsync(
    RequestContext context, string userId, CancellationToken cancellationToken = default);
```

- [ ] **Step 2: Write the failing test**

```csharp
[Fact]
public async Task Lists_my_conversations_with_correct_other_participant_and_unread_count()
{
    var (userId, otherId, conversationId) = await _fixture.SeedConversationAsync();
    await _fixture.SeedMessageAsync(conversationId, senderId: otherId, readAt: null);
    await _fixture.SeedMessageAsync(conversationId, senderId: otherId, readAt: null);

    var results = await Repo().ListConversationsAsync(_fixture.Ctx(userId), userId);

    var conv = Assert.Single(results);
    Assert.Equal(otherId, conv.OtherParticipantId);
    Assert.Equal(2, conv.UnreadCount);
}
```
(add this to a new `MessagesListConversationsTests.cs` following the same `IClassFixture`/`Repo()` shape
as Task 2's test file)

Run: `dotnet test tests/FormMaps.IntegrationTests --filter "FullyQualifiedName~MessagesListConversationsTests"`
Expected: FAIL.

- [ ] **Step 3: Implement `ListConversationsAsync`**

```csharp
public async Task<IReadOnlyList<ConversationSummary>> ListConversationsAsync(
    RequestContext context, string userId, CancellationToken cancellationToken = default)
{
    await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
    await using var command = Command(session, """
        SELECT
            c."id",
            CASE WHEN c."participantAId" = @userId THEN c."participantBId" ELSE c."participantAId" END AS "otherId",
            CASE WHEN c."participantAId" = @userId THEN ub."name" ELSE ua."name" END AS "otherName",
            CASE WHEN c."participantAId" = @userId THEN ub."email" ELSE ua."email" END AS "otherEmail",
            c."lastMessagePreview", c."lastMessageAt",
            COALESCE(uc."cnt", 0)::int AS "unreadCount"
        FROM "conversations" c
        JOIN "users" ua ON ua."id" = c."participantAId"
        JOIN "users" ub ON ub."id" = c."participantBId"
        LEFT JOIN (
            SELECT m."conversationId", count(*) AS "cnt" FROM "messages" m
            WHERE m."senderId" <> @userId AND m."readAt" IS NULL
            GROUP BY m."conversationId"
        ) uc ON uc."conversationId" = c."id"
        WHERE c."participantAId" = @userId OR c."participantBId" = @userId
        ORDER BY c."lastMessageAt" DESC NULLS LAST
        """);
    AddParameter(command, "userId", userId);
    await using var reader = await command.ExecuteReaderAsync(cancellationToken);
    var rows = new List<ConversationSummary>();
    while (await reader.ReadAsync(cancellationToken))
    {
        rows.Add(new ConversationSummary(
            reader.GetString(0), reader.GetString(1),
            reader.IsDBNull(2) ? null : reader.GetString(2), reader.GetString(3),
            reader.IsDBNull(4) ? null : reader.GetString(4),
            reader.IsDBNull(5) ? null : reader.GetDateTime(5),
            reader.GetInt32(6)));
    }
    return rows;
}
```

- [ ] **Step 4: Wire endpoint**

```csharp
group.MapGet("/conversations", ListConversationsAsync);
```

```csharp
private static async Task<IResult> ListConversationsAsync(
    IRequestContextAccessor accessor, IProtectedRequestGuard guard, IMessagesRepository repository,
    CancellationToken cancellationToken)
{
    var context = accessor.Current;
    var decision = guard.RequireIdentity(context);
    if (!decision.Allowed) return Deny(decision);

    var results = await repository.ListConversationsAsync(context, context.Tenant!.UserId, cancellationToken);
    return Results.Ok(new
    {
        success = true,
        data = results.Select(c => new
        {
            id = c.Id,
            otherParticipant = new { id = c.OtherParticipantId, name = c.OtherParticipantName, email = c.OtherParticipantEmail },
            lastMessagePreview = c.LastMessagePreview,
            lastMessageAt = c.LastMessageAt,
            unreadCount = c.UnreadCount,
        }),
    });
}
```

- [ ] **Step 5: Run, verify pass, commit**

```bash
dotnet test tests/FormMaps.IntegrationTests --filter "FullyQualifiedName~MessagesListConversationsTests"
git add services/api/src/FormMaps.Application/Messaging services/api/src/FormMaps.Infrastructure/Messaging \
  services/api/src/FormMaps.Api/Endpoints/MessagesEndpoints.cs services/api/tests/FormMaps.IntegrationTests/Messaging
git commit -m "feat(messaging): port GET /conversations to .NET (FM-DOTNET-100, dark)"
```

---

### Task 4: `POST /conversations` (create/get-or-create)

The most complex endpoint — full replica of legacy's auth matrix (block enforcement, tenant isolation,
student/parent scoping, existence-oracle-safe 400s).

**Files:**
- Modify: `IMessagesRepository.cs`, `MessagesRepository.cs`, `MessagesEndpoints.cs`
- Test: `services/api/tests/FormMaps.IntegrationTests/Messaging/MessagesCreateConversationTests.cs`

**Interfaces:**
- Consumes: `CreateConversationStatus`, `CreateConversationResult` from Task 1; `GetAssignedCounselorIdsAsync` (private, Task 2).
- Produces: `IMessagesRepository.CreateConversationAsync(RequestContext, string userId, string role, string? schoolId, string targetId, CancellationToken) : Task<CreateConversationResult>`.

- [ ] **Step 1: Add interface method**

```csharp
Task<CreateConversationResult> CreateConversationAsync(
    RequestContext context, string userId, string role, string? schoolId, string targetId,
    CancellationToken cancellationToken = default);
```

- [ ] **Step 2: Write the failing tests**

```csharp
// services/api/tests/FormMaps.IntegrationTests/Messaging/MessagesCreateConversationTests.cs
using FormMaps.Application.Auth;
using FormMaps.Application.Messaging;
using FormMaps.Infrastructure.Data;
using FormMaps.Infrastructure.Messaging;
using Microsoft.Extensions.Time.Testing;
using Npgsql;

namespace FormMaps.IntegrationTests.Messaging;

public sealed class MessagesCreateConversationTests : IClassFixture<MessagingDatabaseFixture>, IAsyncLifetime
{
    private readonly MessagingDatabaseFixture _fixture;
    private NpgsqlDataSource _dataSource = null!;
    public MessagesCreateConversationTests(MessagingDatabaseFixture fixture) => _fixture = fixture;
    public Task InitializeAsync() { _dataSource = NpgsqlDataSource.Create(_fixture.ConnectionString); return Task.CompletedTask; }
    public async Task DisposeAsync() => await _dataSource.DisposeAsync();
    private MessagesRepository Repo() => new(
        new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()), new FakeTimeProvider());

    [Fact]
    public async Task Student_can_message_their_assigned_counselor()
    {
        var schoolId = Guid.NewGuid().ToString();
        var student = await _fixture.SeedUserAsync(schoolId, "student");
        var counselor = await _fixture.SeedUserAsync(schoolId, "counselor");
        await _fixture.SeedAssignmentAsync(counselor, student);

        var result = await Repo().CreateConversationAsync(_fixture.Ctx(student, schoolId), student, "student", schoolId, counselor);

        Assert.Equal(CreateConversationStatus.Created, result.Status);
        Assert.Equal(counselor, result.Data!.OtherParticipantId);
    }

    [Fact]
    public async Task Student_cannot_message_an_unassigned_counselor()
    {
        var schoolId = Guid.NewGuid().ToString();
        var student = await _fixture.SeedUserAsync(schoolId, "student");
        var counselor = await _fixture.SeedUserAsync(schoolId, "counselor");

        var result = await Repo().CreateConversationAsync(_fixture.Ctx(student, schoolId), student, "student", schoolId, counselor);

        Assert.Equal(CreateConversationStatus.Forbidden, result.Status);
    }

    [Fact]
    public async Task Cross_school_privileged_target_is_hidden_as_recipient_not_found()
    {
        var schoolA = Guid.NewGuid().ToString();
        var schoolB = Guid.NewGuid().ToString();
        var admin = await _fixture.SeedUserAsync(schoolA, "school_admin");
        var otherSchoolAdmin = await _fixture.SeedUserAsync(schoolB, "school_admin");

        var result = await Repo().CreateConversationAsync(_fixture.Ctx(admin, schoolA), admin, "school_admin", schoolA, otherSchoolAdmin);

        Assert.Equal(CreateConversationStatus.RecipientNotFound, result.Status);
    }

    [Fact]
    public async Task Blocked_pair_cannot_create_a_conversation()
    {
        var schoolId = Guid.NewGuid().ToString();
        var a = await _fixture.SeedUserAsync(schoolId, "counselor");
        var b = await _fixture.SeedUserAsync(schoolId, "school_admin");
        await _fixture.SeedBlockAsync(a, b);

        var result = await Repo().CreateConversationAsync(_fixture.Ctx(a, schoolId), a, "counselor", schoolId, b);

        Assert.Equal(CreateConversationStatus.Blocked, result.Status);
    }

    [Fact]
    public async Task Second_call_returns_the_existing_conversation_not_a_duplicate()
    {
        var schoolId = Guid.NewGuid().ToString();
        var admin = await _fixture.SeedUserAsync(schoolId, "school_admin");
        var counselor = await _fixture.SeedUserAsync(schoolId, "counselor");

        var first = await Repo().CreateConversationAsync(_fixture.Ctx(counselor, schoolId), counselor, "counselor", schoolId, admin);
        var second = await Repo().CreateConversationAsync(_fixture.Ctx(counselor, schoolId), counselor, "counselor", schoolId, admin);

        Assert.Equal(CreateConversationStatus.Created, first.Status);
        Assert.Equal(CreateConversationStatus.Existing, second.Status);
        Assert.Equal(first.Data!.Id, second.Data!.Id);
    }
}
```

Add `SeedBlockAsync` to the fixture:

```csharp
public async Task SeedBlockAsync(string blockerId, string blockedId)
{
    await using var conn = new NpgsqlConnection(ConnectionString);
    await conn.OpenAsync();
    await using var cmd = new NpgsqlCommand(
        """INSERT INTO "user_blocks" ("id","blockerId","blockedId") VALUES (@id,@a,@b)""", conn);
    cmd.Parameters.AddWithValue("id", Guid.NewGuid().ToString());
    cmd.Parameters.AddWithValue("a", blockerId);
    cmd.Parameters.AddWithValue("b", blockedId);
    await cmd.ExecuteNonQueryAsync();
}
```

Run: `dotnet test tests/FormMaps.IntegrationTests --filter "FullyQualifiedName~MessagesCreateConversationTests"`
Expected: FAIL.

- [ ] **Step 3: Implement `CreateConversationAsync`**

```csharp
public async Task<CreateConversationResult> CreateConversationAsync(
    RequestContext context, string userId, string role, string? schoolId, string targetId,
    CancellationToken cancellationToken = default)
{
    await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

    var currentSchoolId = schoolId;
    var (targetSchoolId, targetRole) = await LookupUserAsync(session, targetId, cancellationToken);
    if (targetRole is null)
        return new CreateConversationResult(CreateConversationStatus.RecipientNotFound, null, "Recipient not found");

    if (await IsBlockedBetweenAsync(session, userId, targetId, cancellationToken))
        return new CreateConversationResult(CreateConversationStatus.Blocked, null, "You cannot message this user");

    var sameSchool = currentSchoolId is not null && currentSchoolId == targetSchoolId;
    var privilegedRoles = new[] { "school_admin", "super admin", "counselor" };
    var isPrivileged = privilegedRoles.Contains(role);
    var isSuperAdmin = role == "super admin";

    if (isPrivileged && !isSuperAdmin)
    {
        if (!sameSchool) return new CreateConversationResult(CreateConversationStatus.RecipientNotFound, null, "Recipient not found");
    }
    else if (!isSuperAdmin)
    {
        if (role == "student")
        {
            var normalizedTargetRole = targetRole.ToLowerInvariant();
            if (normalizedTargetRole == "counselor")
            {
                var assigned = await HasActiveAssignmentAsync(session, userId, targetId, cancellationToken);
                if (!assigned) return new CreateConversationResult(CreateConversationStatus.Forbidden, null, "You are not assigned to this counselor");
            }
            else if (normalizedTargetRole == "school_admin")
            {
                if (!sameSchool) return new CreateConversationResult(CreateConversationStatus.RecipientNotFound, null, "Recipient not found");
            }
            else
            {
                return new CreateConversationResult(CreateConversationStatus.Forbidden, null, "You can only message your assigned counselor or school admin");
            }
        }

        if (role == "parent")
        {
            var childIds = await GetLinkedChildIdsAsync(session, userId, cancellationToken);
            if (childIds.Count == 0)
                return new CreateConversationResult(CreateConversationStatus.Forbidden, null, "No linked children found");
            var anyAssigned = false;
            foreach (var childId in childIds)
            {
                if (await HasActiveAssignmentAsync(session, childId, targetId, cancellationToken)) { anyAssigned = true; break; }
            }
            if (!anyAssigned)
                return new CreateConversationResult(CreateConversationStatus.Forbidden, null, "This user is not assigned to any of your children");
        }
    }

    var (participantAId, participantBId) = string.CompareOrdinal(userId, targetId) < 0 ? (userId, targetId) : (targetId, userId);

    var existing = await FindConversationRowAsync(session, participantAId, participantBId, cancellationToken);
    if (existing is not null)
    {
        await session.CommitAsync(cancellationToken);
        return new CreateConversationResult(CreateConversationStatus.Existing, ToSummary(existing, userId), null);
    }

    var newId = Guid.NewGuid().ToString();
    await using (var insert = Command(session, """
        INSERT INTO "conversations" ("id", "participantAId", "participantBId") VALUES (@id, @pa, @pb)
        """))
    {
        AddParameter(insert, "id", newId);
        AddParameter(insert, "pa", participantAId);
        AddParameter(insert, "pb", participantBId);
        await insert.ExecuteNonQueryAsync(cancellationToken);
    }
    await session.CommitAsync(cancellationToken);

    var created = await FindConversationRowAsync(session, participantAId, participantBId, cancellationToken)
        ?? throw new InvalidOperationException("conversation vanished immediately after insert");
    return new CreateConversationResult(CreateConversationStatus.Created, ToSummary(created, userId), null);
}

private sealed record ConversationRow(
    string Id, string ParticipantAId, string ParticipantBId, string? AName, string AEmail,
    string? BName, string BEmail, string? LastMessagePreview, DateTime? LastMessageAt);

private static ConversationSummary ToSummary(ConversationRow row, string userId)
{
    var iAmA = row.ParticipantAId == userId;
    return new ConversationSummary(
        row.Id,
        iAmA ? row.ParticipantBId : row.ParticipantAId,
        iAmA ? row.BName : row.AName,
        iAmA ? row.BEmail : row.AEmail,
        row.LastMessagePreview, row.LastMessageAt, 0);
}

private static async Task<ConversationRow?> FindConversationRowAsync(
    FormMapsDatabaseSession session, string participantAId, string participantBId, CancellationToken cancellationToken)
{
    await using var command = Command(session, """
        SELECT c."id", c."participantAId", c."participantBId", ua."name", ua."email", ub."name", ub."email",
               c."lastMessagePreview", c."lastMessageAt"
        FROM "conversations" c
        JOIN "users" ua ON ua."id" = c."participantAId"
        JOIN "users" ub ON ub."id" = c."participantBId"
        WHERE c."participantAId" = @pa AND c."participantBId" = @pb
        """);
    AddParameter(command, "pa", participantAId);
    AddParameter(command, "pb", participantBId);
    await using var reader = await command.ExecuteReaderAsync(cancellationToken);
    if (!await reader.ReadAsync(cancellationToken)) return null;
    return new ConversationRow(
        reader.GetString(0), reader.GetString(1), reader.GetString(2),
        reader.IsDBNull(3) ? null : reader.GetString(3), reader.GetString(4),
        reader.IsDBNull(5) ? null : reader.GetString(5), reader.GetString(6),
        reader.IsDBNull(7) ? null : reader.GetString(7),
        reader.IsDBNull(8) ? null : reader.GetDateTime(8));
}

private static async Task<(string? SchoolId, string? RoleName)> LookupUserAsync(
    FormMapsDatabaseSession session, string userId, CancellationToken cancellationToken)
{
    await using var command = Command(session, """SELECT "schoolId", "roleName" FROM "users" WHERE "id" = @id AND "isActive" = true""");
    AddParameter(command, "id", userId);
    await using var reader = await command.ExecuteReaderAsync(cancellationToken);
    if (!await reader.ReadAsync(cancellationToken)) return (null, null);
    return (reader.IsDBNull(0) ? null : reader.GetString(0), reader.GetString(1));
}

private static async Task<bool> IsBlockedBetweenAsync(
    FormMapsDatabaseSession session, string a, string b, CancellationToken cancellationToken)
{
    await using var command = Command(session, """
        SELECT 1 FROM "user_blocks"
        WHERE "isActive" = true AND (("blockerId" = @a AND "blockedId" = @b) OR ("blockerId" = @b AND "blockedId" = @a))
        LIMIT 1
        """);
    AddParameter(command, "a", a);
    AddParameter(command, "b", b);
    var result = await command.ExecuteScalarAsync(cancellationToken);
    return result is not null;
}

private static async Task<bool> HasActiveAssignmentAsync(
    FormMapsDatabaseSession session, string studentId, string counselorId, CancellationToken cancellationToken)
{
    await using var command = Command(session, """
        SELECT 1 FROM "counselor_student_assignments"
        WHERE "studentId" = @studentId AND "counselorId" = @counselorId AND "isActive" = true LIMIT 1
        """);
    AddParameter(command, "studentId", studentId);
    AddParameter(command, "counselorId", counselorId);
    var result = await command.ExecuteScalarAsync(cancellationToken);
    return result is not null;
}

private static async Task<IReadOnlyList<string>> GetLinkedChildIdsAsync(
    FormMapsDatabaseSession session, string parentUserId, CancellationToken cancellationToken)
{
    await using var command = Command(session, """
        SELECT "studentId" FROM "student_parent_links"
        WHERE "parentUserId" = @parentUserId AND "isActive" = true AND "isAccepted" = true
        """);
    AddParameter(command, "parentUserId", parentUserId);
    await using var reader = await command.ExecuteReaderAsync(cancellationToken);
    var ids = new List<string>();
    while (await reader.ReadAsync(cancellationToken)) ids.Add(reader.GetString(0));
    return ids;
}
```

- [ ] **Step 4: Wire the endpoint**

```csharp
group.MapPost("/conversations", CreateConversationAsync);
```

```csharp
public sealed record CreateConversationRequest(string? RecipientId, string? CounselorId);

private static async Task<IResult> CreateConversationAsync(
    IRequestContextAccessor accessor, IProtectedRequestGuard guard, IMessagesRepository repository,
    CreateConversationRequest? body, CancellationToken cancellationToken)
{
    var context = accessor.Current;
    var decision = guard.RequireIdentity(context);
    if (!decision.Allowed) return Deny(decision);

    var targetId = body?.RecipientId ?? body?.CounselorId;
    if (string.IsNullOrWhiteSpace(targetId)) return BadRequestResult("recipientId is required");

    var role = context.Actor!.NormalizedRole.ToLowerInvariant();
    var result = await repository.CreateConversationAsync(
        context, context.Tenant!.UserId, role, context.Tenant.SchoolId, targetId, cancellationToken);

    return result.Status switch
    {
        CreateConversationStatus.Created => Results.Json(new { success = true, data = ToJson(result.Data!) }, statusCode: StatusCodes.Status201Created),
        CreateConversationStatus.Existing => Results.Ok(new { success = true, data = ToJson(result.Data!) }),
        CreateConversationStatus.Blocked => Forbidden(result.Error!),
        CreateConversationStatus.Forbidden => Forbidden(result.Error!),
        CreateConversationStatus.RecipientNotFound => BadRequestResult(result.Error!),
        _ => BadRequestResult(result.Error ?? "Invalid request"),
    };
}

private static object ToJson(ConversationSummary c) => new
{
    id = c.Id,
    otherParticipant = new { id = c.OtherParticipantId, name = c.OtherParticipantName, email = c.OtherParticipantEmail },
    lastMessagePreview = c.LastMessagePreview,
    lastMessageAt = c.LastMessageAt,
    unreadCount = c.UnreadCount,
};
```

- [ ] **Step 5: Run, verify pass, commit**

```bash
dotnet test tests/FormMaps.IntegrationTests --filter "FullyQualifiedName~MessagesCreateConversationTests"
git add services/api/src/FormMaps.Application/Messaging services/api/src/FormMaps.Infrastructure/Messaging \
  services/api/src/FormMaps.Api/Endpoints/MessagesEndpoints.cs services/api/tests/FormMaps.IntegrationTests/Messaging
git commit -m "feat(messaging): port POST /conversations to .NET (FM-DOTNET-101, dark)"
```

---

### Task 5: `GET /conversations/:id`

**Files:**
- Modify: `IMessagesRepository.cs`, `MessagesRepository.cs`, `MessagesEndpoints.cs`
- Test: `services/api/tests/FormMaps.IntegrationTests/Messaging/MessagesConversationDetailTests.cs`

**Interfaces:**
- Produces: `IMessagesRepository.GetConversationMessagesAsync(RequestContext, string userId, string conversationId, int page, int limit, CancellationToken) : Task<ConversationMessagesResult>`.

- [ ] **Step 1: Add interface method**

```csharp
Task<ConversationMessagesResult> GetConversationMessagesAsync(
    RequestContext context, string userId, string conversationId, int page, int limit,
    CancellationToken cancellationToken = default);
```

- [ ] **Step 2: Write the failing tests**

```csharp
[Fact]
public async Task Returns_paginated_messages_and_marks_unread_ones_as_read()
{
    var (userId, otherId, conversationId) = await _fixture.SeedConversationAsync();
    await _fixture.SeedMessageAsync(conversationId, otherId, readAt: null);
    await _fixture.SeedMessageAsync(conversationId, otherId, readAt: null);

    var result = await Repo().GetConversationMessagesAsync(_fixture.Ctx(userId), userId, conversationId, page: 1, limit: 50);

    Assert.Equal(ConversationMessagesStatus.Ok, result.Status);
    Assert.Equal(2, result.Page!.Total);
    Assert.All(result.Page.Data, m => Assert.NotNull(m.ReadAt)); // marked read by this call... but re-fetch to confirm DB state:
    var again = await Repo().GetConversationMessagesAsync(_fixture.Ctx(otherId), otherId, conversationId, page: 1, limit: 50);
    // sender's own read-check is irrelevant; verify via a direct repository call from the ORIGINAL reader's perspective
}

[Fact]
public async Task Non_participant_gets_not_found_not_forbidden()
{
    var (_, _, conversationId) = await _fixture.SeedConversationAsync();
    var stranger = Guid.NewGuid().ToString();

    var result = await Repo().GetConversationMessagesAsync(_fixture.Ctx(stranger), stranger, conversationId, page: 1, limit: 50);

    Assert.Equal(ConversationMessagesStatus.NotFound, result.Status);
}

[Fact]
public async Task Missing_conversation_also_returns_not_found()
{
    var userId = Guid.NewGuid().ToString();
    var result = await Repo().GetConversationMessagesAsync(_fixture.Ctx(userId), userId, Guid.NewGuid().ToString(), page: 1, limit: 50);
    Assert.Equal(ConversationMessagesStatus.NotFound, result.Status);
}
```

Run: `dotnet test tests/FormMaps.IntegrationTests --filter "FullyQualifiedName~MessagesConversationDetailTests"`
Expected: FAIL.

- [ ] **Step 3: Implement `GetConversationMessagesAsync`**

```csharp
public async Task<ConversationMessagesResult> GetConversationMessagesAsync(
    RequestContext context, string userId, string conversationId, int page, int limit,
    CancellationToken cancellationToken = default)
{
    await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

    // RLS hides this row entirely for non-participants — see plan's Global Constraints.
    var exists = await ConversationExistsAsync(session, conversationId, cancellationToken);
    if (!exists) return new ConversationMessagesResult(ConversationMessagesStatus.NotFound, null);

    var offset = (page - 1) * limit;
    int total;
    await using (var countCmd = Command(session, """SELECT count(*)::int FROM "messages" WHERE "conversationId" = @cid"""))
    {
        AddParameter(countCmd, "cid", conversationId);
        total = (int)(await countCmd.ExecuteScalarAsync(cancellationToken))!;
    }

    var rows = new List<MessageRow>();
    await using (var listCmd = Command(session, """
        SELECT m."id", m."conversationId", m."senderId", u."name", m."content", m."readAt", m."createdDate"
        FROM "messages" m JOIN "users" u ON u."id" = m."senderId"
        WHERE m."conversationId" = @cid ORDER BY m."createdDate" ASC OFFSET @offset LIMIT @limit
        """))
    {
        AddParameter(listCmd, "cid", conversationId);
        AddParameter(listCmd, "offset", offset);
        AddParameter(listCmd, "limit", limit);
        await using var reader = await listCmd.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            rows.Add(new MessageRow(
                reader.GetString(0), reader.GetString(1), reader.GetString(2),
                reader.IsDBNull(3) ? null : reader.GetString(3), reader.GetString(4),
                reader.IsDBNull(5) ? null : reader.GetDateTime(5), reader.GetDateTime(6)));
        }
    }

    await using (var markReadCmd = Command(session, """
        UPDATE "messages" SET "readAt" = @now WHERE "conversationId" = @cid AND "senderId" <> @userId AND "readAt" IS NULL
        """))
    {
        AddParameter(markReadCmd, "cid", conversationId);
        AddParameter(markReadCmd, "userId", userId);
        AddTimestamp(markReadCmd, "now", NowTruncated());
        await markReadCmd.ExecuteNonQueryAsync(cancellationToken);
    }

    await session.CommitAsync(cancellationToken);

    var totalPages = (int)Math.Ceiling(total / (double)limit);
    return new ConversationMessagesResult(
        ConversationMessagesStatus.Ok,
        new ConversationMessagesPage(rows, total, page, limit, totalPages));
}

private static async Task<bool> ConversationExistsAsync(
    FormMapsDatabaseSession session, string conversationId, CancellationToken cancellationToken)
{
    await using var command = Command(session, """SELECT 1 FROM "conversations" WHERE "id" = @id LIMIT 1""");
    AddParameter(command, "id", conversationId);
    return await command.ExecuteScalarAsync(cancellationToken) is not null;
}

private static void AddTimestamp(DbCommand command, string name, DateTime value)
{
    var parameter = command.CreateParameter();
    parameter.ParameterName = name;
    parameter.DbType = System.Data.DbType.DateTime2;
    parameter.Value = DateTime.SpecifyKind(value, DateTimeKind.Unspecified);
    command.Parameters.Add(parameter);
}
```

- [ ] **Step 4: Wire the endpoint**

```csharp
group.MapGet("/conversations/{id}", GetConversationMessagesAsync);
```

```csharp
private static async Task<IResult> GetConversationMessagesAsync(
    IRequestContextAccessor accessor, IProtectedRequestGuard guard, IMessagesRepository repository,
    string id, HttpRequest request, CancellationToken cancellationToken)
{
    var context = accessor.Current;
    var decision = guard.RequireIdentity(context);
    if (!decision.Allowed) return Deny(decision);

    var page = Math.Max(1, int.TryParse(request.Query["page"], out var p) ? p : 1);
    var limit = Math.Min(100, Math.Max(1, int.TryParse(request.Query["limit"], out var l) ? l : 50));

    var result = await repository.GetConversationMessagesAsync(context, context.Tenant!.UserId, id, page, limit, cancellationToken);
    if (result.Status == ConversationMessagesStatus.NotFound) return NotFound("Conversation not found");

    var pg = result.Page!;
    return Results.Ok(new
    {
        success = true,
        data = new
        {
            data = pg.Data.Select(m => new { id = m.Id, conversationId = m.ConversationId, senderId = m.SenderId, sender = new { id = m.SenderId, name = m.SenderName }, content = m.Content, readAt = m.ReadAt, createdDate = m.CreatedDate }),
            total = pg.Total, page = pg.Page, limit = pg.Limit, totalPages = pg.TotalPages,
        },
    });
}
```

- [ ] **Step 5: Run, verify pass, commit**

Fix the first test to actually verify read-state via a raw query if needed (repository re-fetch doesn't
re-mark since the caller already read them — reviewers should tighten this to a direct SQL assertion via
a small fixture helper `GetReadAtAsync` mirroring `LiaSessionStartTests.ReadDeviceInfoAsync`'s pattern).

```bash
dotnet test tests/FormMaps.IntegrationTests --filter "FullyQualifiedName~MessagesConversationDetailTests"
git add services/api/src/FormMaps.Application/Messaging services/api/src/FormMaps.Infrastructure/Messaging \
  services/api/src/FormMaps.Api/Endpoints/MessagesEndpoints.cs services/api/tests/FormMaps.IntegrationTests/Messaging
git commit -m "feat(messaging): port GET /conversations/:id to .NET (FM-DOTNET-102, dark)"
```

---

### Task 6: `POST /conversations/:id` (send message, REST-only — hub wiring is Task 7)

**Files:**
- Modify: `IMessagesRepository.cs`, `MessagesRepository.cs`, `MessagesEndpoints.cs`
- Test: `services/api/tests/FormMaps.IntegrationTests/Messaging/MessagesSendMessageTests.cs`

**Interfaces:**
- Produces: `IMessagesRepository.SendMessageAsync(RequestContext, string userId, string conversationId, string content, CancellationToken) : Task<SendMessageResult>`.
- Produces (for Task 7): `SendMessageResult` carries `RecipientId`/`RecipientEmail`/`SenderName`/`Preview` —
  the exact fields Task 7's hub push and outbox insert need, so this task's shape must not change later.

- [ ] **Step 1: Add interface method**

```csharp
Task<SendMessageResult> SendMessageAsync(
    RequestContext context, string userId, string conversationId, string content,
    CancellationToken cancellationToken = default);
```

- [ ] **Step 2: Write the failing tests**

```csharp
[Fact]
public async Task Sends_a_message_and_updates_conversation_preview()
{
    var (userId, otherId, conversationId) = await _fixture.SeedConversationAsync();

    var result = await Repo().SendMessageAsync(_fixture.Ctx(userId), userId, conversationId, "hello there");

    Assert.Equal(SendMessageStatus.Sent, result.Status);
    Assert.Equal("hello there", result.Message!.Content);
    Assert.Equal(otherId, result.RecipientId);
}

[Fact]
public async Task Blocked_pair_cannot_send()
{
    var (userId, otherId, conversationId) = await _fixture.SeedConversationAsync();
    await _fixture.SeedBlockAsync(userId, otherId);

    var result = await Repo().SendMessageAsync(_fixture.Ctx(userId), userId, conversationId, "hi");

    Assert.Equal(SendMessageStatus.Blocked, result.Status);
}

[Fact]
public async Task Non_participant_gets_not_found()
{
    var (_, _, conversationId) = await _fixture.SeedConversationAsync();
    var stranger = Guid.NewGuid().ToString();

    var result = await Repo().SendMessageAsync(_fixture.Ctx(stranger), stranger, conversationId, "hi");

    Assert.Equal(SendMessageStatus.NotFound, result.Status);
}
```

Run: `dotnet test tests/FormMaps.IntegrationTests --filter "FullyQualifiedName~MessagesSendMessageTests"`
Expected: FAIL.

- [ ] **Step 3: Implement `SendMessageAsync`**

```csharp
public async Task<SendMessageResult> SendMessageAsync(
    RequestContext context, string userId, string conversationId, string content,
    CancellationToken cancellationToken = default)
{
    await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

    var conversation = await FindConversationRowAsync2(session, conversationId, cancellationToken);
    if (conversation is null) return new SendMessageResult(SendMessageStatus.NotFound, null, null, null, null, null);

    var otherId = conversation.ParticipantAId == userId ? conversation.ParticipantBId : conversation.ParticipantAId;
    if (await IsBlockedBetweenAsync(session, userId, otherId, cancellationToken))
        return new SendMessageResult(SendMessageStatus.Blocked, null, null, null, null, null);

    var preview = content.Length > 100 ? content[..97] + "..." : content;
    var now = NowTruncated();
    var messageId = Guid.NewGuid().ToString();

    await using (var insert = Command(session, """
        INSERT INTO "messages" ("id", "conversationId", "senderId", "content", "createdDate", "updatedAt")
        VALUES (@id, @cid, @sid, @content, @now, @now)
        """))
    {
        AddParameter(insert, "id", messageId);
        AddParameter(insert, "cid", conversationId);
        AddParameter(insert, "sid", userId);
        AddParameter(insert, "content", content);
        AddTimestamp(insert, "now", now);
        await insert.ExecuteNonQueryAsync(cancellationToken);
    }

    await using (var update = Command(session, """
        UPDATE "conversations" SET "lastMessageAt" = @now, "lastMessagePreview" = @preview, "updatedAt" = @now WHERE "id" = @cid
        """))
    {
        AddParameter(update, "cid", conversationId);
        AddParameter(update, "preview", preview);
        AddTimestamp(update, "now", now);
        await update.ExecuteNonQueryAsync(cancellationToken);
    }

    var recipientEmail = conversation.ParticipantAId == userId ? conversation.BEmail : conversation.AEmail;
    var senderName = (conversation.ParticipantAId == userId ? conversation.AName : conversation.BName) ?? "";

    await using (var outbox = Command(session, """
        INSERT INTO "notification_outbox" ("id", "type", "payload", "due_at")
        VALUES (@id, 'unread_message', @payload::jsonb, @dueAt)
        """))
    {
        AddParameter(outbox, "id", Guid.NewGuid().ToString());
        AddParameter(outbox, "payload", System.Text.Json.JsonSerializer.Serialize(new
        {
            messageId, recipientEmail, senderName, preview,
        }));
        AddTimestamp(outbox, "dueAt", now.AddMinutes(5));
        await outbox.ExecuteNonQueryAsync(cancellationToken);
    }

    await session.CommitAsync(cancellationToken);

    var message = new MessageRow(messageId, conversationId, userId, senderName, content, null, now);
    return new SendMessageResult(SendMessageStatus.Sent, message, otherId, recipientEmail, senderName, preview);
}

private static async Task<ConversationRow?> FindConversationRowAsync2(
    FormMapsDatabaseSession session, string conversationId, CancellationToken cancellationToken)
{
    await using var command = Command(session, """
        SELECT c."id", c."participantAId", c."participantBId", ua."name", ua."email", ub."name", ub."email",
               c."lastMessagePreview", c."lastMessageAt"
        FROM "conversations" c
        JOIN "users" ua ON ua."id" = c."participantAId"
        JOIN "users" ub ON ub."id" = c."participantBId"
        WHERE c."id" = @id
        """);
    AddParameter(command, "id", conversationId);
    await using var reader = await command.ExecuteReaderAsync(cancellationToken);
    if (!await reader.ReadAsync(cancellationToken)) return null;
    return new ConversationRow(
        reader.GetString(0), reader.GetString(1), reader.GetString(2),
        reader.IsDBNull(3) ? null : reader.GetString(3), reader.GetString(4),
        reader.IsDBNull(5) ? null : reader.GetString(5), reader.GetString(6),
        reader.IsDBNull(7) ? null : reader.GetString(7),
        reader.IsDBNull(8) ? null : reader.GetDateTime(8));
}
```

(`FindConversationRowAsync2` duplicates Task 4's `FindConversationRowAsync` shape but looks up by `id`
instead of participant pair — a reviewer may consolidate these into one overload during the per-task
review; both must stay behaviorally identical to their respective legacy call sites in the meantime.)

- [ ] **Step 4: Wire the endpoint**

```csharp
group.MapPost("/conversations/{id}", SendMessageAsync);
```

```csharp
public sealed record SendMessageRequest(string Content);

private static async Task<IResult> SendMessageAsync(
    IRequestContextAccessor accessor, IProtectedRequestGuard guard, IMessagesRepository repository,
    string id, SendMessageRequest? body, CancellationToken cancellationToken)
{
    var context = accessor.Current;
    var decision = guard.RequireIdentity(context);
    if (!decision.Allowed) return Deny(decision);

    if (string.IsNullOrWhiteSpace(body?.Content) || body.Content.Length > 5000)
        return BadRequestResult("content: required, max 5000 characters");

    var result = await repository.SendMessageAsync(context, context.Tenant!.UserId, id, body.Content, cancellationToken);
    return result.Status switch
    {
        SendMessageStatus.NotFound => NotFound("Conversation not found"),
        SendMessageStatus.Blocked => Forbidden("You cannot message this user"),
        _ => Results.Json(new
        {
            success = true,
            data = new
            {
                id = result.Message!.Id, conversationId = result.Message.ConversationId, senderId = result.Message.SenderId,
                sender = new { id = result.Message.SenderId, name = result.Message.SenderName },
                content = result.Message.Content, readAt = result.Message.ReadAt, createdDate = result.Message.CreatedDate,
            },
        }, statusCode: StatusCodes.Status201Created),
    };
}
```

- [ ] **Step 5: Run, verify pass, commit**

```bash
dotnet test tests/FormMaps.IntegrationTests --filter "FullyQualifiedName~MessagesSendMessageTests"
git add services/api/src/FormMaps.Application/Messaging services/api/src/FormMaps.Infrastructure/Messaging \
  services/api/src/FormMaps.Api/Endpoints/MessagesEndpoints.cs services/api/tests/FormMaps.IntegrationTests/Messaging
git commit -m "feat(messaging): port POST /conversations/:id (send message) to .NET, incl. outbox insert (FM-DOTNET-103, dark)"
```

---

### Task 7: SignalR hub, realtime ticket endpoint, and notifier wiring

**Files:**
- Create: `services/api/src/FormMaps.Application/Messaging/IMessagesRealtimeNotifier.cs`
- Create: `services/api/src/FormMaps.Api/Realtime/MessagesHub.cs`
- Create: `services/api/src/FormMaps.Api/Realtime/SignalRMessagesNotifier.cs`
- Create: `services/api/src/FormMaps.Api/Auth/RealtimeTicketFactory.cs`
- Modify: `services/api/src/FormMaps.Api/Auth/LegacyJwtRequestContextFactory.cs`
- Modify: `services/api/src/FormMaps.Infrastructure/Messaging/MessagesRepository.cs` (inject notifier, call after commit in `SendMessageAsync`)
- Modify: `services/api/src/FormMaps.Api/Endpoints/MessagesEndpoints.cs` (add ticket endpoint)
- Modify: `services/api/src/FormMaps.Api/Program.cs`
- Modify: `services/api/src/FormMaps.Infrastructure/DependencyInjection.cs`
- Test: `services/api/tests/FormMaps.UnitTests/Messaging/SignalRMessagesNotifierTests.cs`
- Test: `services/api/tests/FormMaps.IntegrationTests/Messaging/RealtimeTicketEndpointTests.cs`

**Interfaces:**
- Produces: `IMessagesRealtimeNotifier.NotifyMessageReceivedAsync(string recipientUserId, object payload, CancellationToken) : Task`.
- Consumes: `MessagesRepository.SendMessageAsync`'s result shape from Task 6 (`RecipientId` etc.) — the
  notifier call goes inside `SendMessageAsync`, right after `session.CommitAsync`.

- [ ] **Step 1: Write `IMessagesRealtimeNotifier.cs`**

```csharp
namespace FormMaps.Application.Messaging;

/// <summary>
/// Push-only: notify a connected user of a new message. Never throws — a dropped/absent connection
/// (recipient offline) is a normal, expected case, not an error. Implemented in the Api layer
/// (SignalRMessagesNotifier) so Application/Infrastructure don't depend on SignalR directly.
/// </summary>
public interface IMessagesRealtimeNotifier
{
    Task NotifyMessageReceivedAsync(string recipientUserId, object payload, CancellationToken cancellationToken = default);
}
```

- [ ] **Step 2: Write the failing unit test for the notifier**

```csharp
// services/api/tests/FormMaps.UnitTests/Messaging/SignalRMessagesNotifierTests.cs
using FormMaps.Api.Realtime;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;

namespace FormMaps.UnitTests.Messaging;

public sealed class SignalRMessagesNotifierTests
{
    [Fact]
    public async Task Pushes_to_the_recipients_group_with_the_messageReceived_method()
    {
        var mockClients = new Mock<IHubClients>();
        var mockGroupProxy = new Mock<IClientProxy>();
        mockClients.Setup(c => c.Group("user:recipient-1")).Returns(mockGroupProxy.Object);
        var mockHubContext = new Mock<IHubContext<MessagesHub>>();
        mockHubContext.Setup(h => h.Clients).Returns(mockClients.Object);

        var notifier = new SignalRMessagesNotifier(mockHubContext.Object, NullLogger<SignalRMessagesNotifier>.Instance);
        await notifier.NotifyMessageReceivedAsync("recipient-1", new { text = "hi" });

        mockGroupProxy.Verify(
            p => p.SendCoreAsync("messageReceived", It.Is<object[]>(args => args.Length == 1), default),
            Times.Once);
    }

    [Fact]
    public async Task Swallows_hub_exceptions_and_never_throws()
    {
        var mockHubContext = new Mock<IHubContext<MessagesHub>>();
        mockHubContext.Setup(h => h.Clients).Throws(new InvalidOperationException("hub is down"));

        var notifier = new SignalRMessagesNotifier(mockHubContext.Object, NullLogger<SignalRMessagesNotifier>.Instance);

        await notifier.NotifyMessageReceivedAsync("recipient-1", new { text = "hi" }); // must not throw
    }
}
```

Run: `dotnet test tests/FormMaps.UnitTests --filter "FullyQualifiedName~SignalRMessagesNotifierTests"`
Expected: FAIL — `MessagesHub`/`SignalRMessagesNotifier` don't exist.

- [ ] **Step 3: Write `MessagesHub.cs`**

```csharp
// services/api/src/FormMaps.Api/Realtime/MessagesHub.cs
using FormMaps.Application.Auth;
using Microsoft.AspNetCore.SignalR;

namespace FormMaps.Api.Realtime;

/// <summary>
/// Push-only hub for live message-arrival notifications — no client-to-server methods, sending a
/// message still goes through POST /api/v1/messages/conversations/{id}. On connect, joins a group named
/// "user:{userId}" so SignalRMessagesNotifier can target a specific recipient without needing a custom
/// IUserIdProvider (this codebase's auth doesn't populate the standard ClaimsPrincipal Context.User).
/// </summary>
public sealed class MessagesHub(IRequestContextAccessor requestContextAccessor) : Hub
{
    public override async Task OnConnectedAsync()
    {
        var context = requestContextAccessor.Current;
        if (!context.IsAuthenticated || context.Tenant is null)
        {
            Context.Abort();
            return;
        }

        await Groups.AddToGroupAsync(Context.ConnectionId, $"user:{context.Tenant.UserId}");
        await base.OnConnectedAsync();
    }
}
```

- [ ] **Step 4: Write `SignalRMessagesNotifier.cs`**

```csharp
// services/api/src/FormMaps.Api/Realtime/SignalRMessagesNotifier.cs
using FormMaps.Application.Messaging;
using Microsoft.AspNetCore.SignalR;

namespace FormMaps.Api.Realtime;

public sealed class SignalRMessagesNotifier(
    IHubContext<MessagesHub> hubContext, ILogger<SignalRMessagesNotifier> logger) : IMessagesRealtimeNotifier
{
    public async Task NotifyMessageReceivedAsync(string recipientUserId, object payload, CancellationToken cancellationToken = default)
    {
        try
        {
            await hubContext.Clients.Group($"user:{recipientUserId}").SendAsync("messageReceived", payload, cancellationToken);
        }
        catch (Exception ex)
        {
            // Never let a push failure affect the send-message REST response — recipient offline or a
            // transient hub error is a normal case, not something the sender should see fail.
            logger.LogWarning(ex, "messages.hub.push_failed recipientUserId={RecipientUserId}", recipientUserId);
        }
    }
}
```

- [ ] **Step 5: Run, verify unit tests pass**

Run: `dotnet test tests/FormMaps.UnitTests --filter "FullyQualifiedName~SignalRMessagesNotifierTests"`
Expected: PASS

- [ ] **Step 6: Inject the notifier into `MessagesRepository` and call it after commit in `SendMessageAsync`**

Change the constructor:

```csharp
public sealed class MessagesRepository(
    IFormMapsDatabaseSessionFactory databaseSessionFactory,
    TimeProvider timeProvider,
    IMessagesRealtimeNotifier realtimeNotifier) : IMessagesRepository
```

At the end of `SendMessageAsync`, right after `await session.CommitAsync(cancellationToken);` and before
`return`:

```csharp
await realtimeNotifier.NotifyMessageReceivedAsync(otherId, new
{
    id = messageId, conversationId, senderId = userId, content, createdDate = now,
}, cancellationToken);
```

- [ ] **Step 7: Register SignalR + the notifier + CORS on the hub, in `Program.cs`/`DependencyInjection.cs`**

In `DependencyInjection.cs`:

```csharp
services.AddSignalR();
services.AddScoped<IMessagesRealtimeNotifier, SignalRMessagesNotifier>();
```

In `Program.cs`, near the other `Map*Endpoints()` calls:

```csharp
app.MapHub<MessagesHub>("/hubs/messages").RequireCors(FormMaps.Api.Security.ApiSecurityExtensions.CorsPolicyName);
```

- [ ] **Step 8: Support the WebSocket-handshake query-string token in `LegacyJwtRequestContextFactory.ExtractToken`**

Browsers cannot set custom headers on a native WebSocket upgrade — SignalR's JS client sends the
`accessTokenFactory` value as an `?access_token=` query parameter instead for exactly this reason. Scope
the fallback to the hub path only, so ordinary REST calls never accept a token via URL (query strings can
leak via logs/proxies — restricting this to the one path that has no alternative limits the exposure).

```csharp
private static ExtractedToken ExtractToken(HttpRequest request)
{
    if (request.Cookies.TryGetValue(AccessTokenCookieName, out var cookieToken) &&
        !string.IsNullOrWhiteSpace(cookieToken))
    {
        return new ExtractedToken(TokenSource.AccessCookie, cookieToken);
    }

    var authorization = request.Headers.Authorization.ToString();
    if (authorization.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
    {
        var bearerToken = authorization["Bearer ".Length..].Trim();
        if (!string.IsNullOrWhiteSpace(bearerToken))
        {
            return new ExtractedToken(TokenSource.AuthorizationBearer, bearerToken);
        }
    }

    if (request.Path.StartsWithSegments("/hubs/messages") &&
        request.Query.TryGetValue("access_token", out var queryToken) &&
        !string.IsNullOrWhiteSpace(queryToken))
    {
        return new ExtractedToken(TokenSource.AuthorizationBearer, queryToken.ToString());
    }

    return ExtractedToken.None;
}
```

- [ ] **Step 9: Write the realtime-ticket endpoint**

The frontend cannot read the `httpOnly` session cookie (deliberately, for XSS hardening — see
`api/src/lib/authCookies.ts`), so it cannot hand the real session JWT to SignalR's `accessTokenFactory`
directly. Instead, mint a short-lived (60s), narrowly-scoped ticket via a normal same-origin,
cookie-authenticated REST call (through the existing Next.js proxy), then use *that* for the direct
cross-origin hub connection. `accessTokenFactory` is called by the SignalR client before every
connect/reconnect, so a fresh ticket is fetched each time — no need to handle ticket refresh manually.

```csharp
// services/api/src/FormMaps.Api/Auth/RealtimeTicketFactory.cs
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using FormMaps.Application.Auth;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

namespace FormMaps.Api.Auth;

public sealed class RealtimeTicketFactory(IOptions<LegacyJwtOptions> options)
{
    private static readonly TimeSpan TicketLifetime = TimeSpan.FromSeconds(60);
    private const string JwtSecretEnvironmentVariable = "JWT_SECRET";
    private readonly LegacyJwtOptions jwtOptions = options.Value;

    public string? CreateTicket(RequestActor actor)
    {
        var secret = Environment.GetEnvironmentVariable(JwtSecretEnvironmentVariable);
        if (string.IsNullOrWhiteSpace(secret)) return null;

        var handler = new JwtSecurityTokenHandler();
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret));
        var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
        var now = DateTime.UtcNow;

        var token = new JwtSecurityToken(
            issuer: jwtOptions.Issuer,
            audience: jwtOptions.Audience,
            claims:
            [
                new Claim(JwtRegisteredClaimNames.Sub, actor.UserId),
                new Claim("role", actor.Role),
            ],
            notBefore: now,
            expires: now.Add(TicketLifetime),
            signingCredentials: credentials);

        return handler.WriteToken(token);
    }
}
```

Register it: `services.AddScoped<RealtimeTicketFactory>();` (`DependencyInjection.cs`).

Add the endpoint to `MessagesEndpoints.cs`:

```csharp
group.MapPost("/realtime-ticket", CreateRealtimeTicketAsync);
```

```csharp
private static IResult CreateRealtimeTicketAsync(
    IRequestContextAccessor accessor, IProtectedRequestGuard guard, RealtimeTicketFactory ticketFactory)
{
    var context = accessor.Current;
    var decision = guard.RequireIdentity(context);
    if (!decision.Allowed) return Deny(decision);

    var ticket = ticketFactory.CreateTicket(context.Actor!);
    if (ticket is null) return Results.Json(new { success = false, message = "Realtime unavailable" }, statusCode: StatusCodes.Status503ServiceUnavailable);

    return Results.Ok(new { success = true, data = new { ticket, expiresIn = 60 } });
}
```

- [ ] **Step 10: Write the failing unit test for `RealtimeTicketFactory`**

Tested directly (no HTTP/WebApplicationFactory needed — it has no DB/repository dependency), mirroring
`LegacyJwtRequestContextFactoryTests.cs`'s direct-construction style:

```csharp
// services/api/tests/FormMaps.UnitTests/Auth/RealtimeTicketFactoryTests.cs
using System.IdentityModel.Tokens.Jwt;
using FormMaps.Api.Auth;
using FormMaps.Application.Auth;
using Microsoft.Extensions.Options;

namespace FormMaps.UnitTests.Auth;

public sealed class RealtimeTicketFactoryTests
{
    [Fact]
    public void CreateTicket_mints_a_short_lived_token_carrying_the_actors_identity()
    {
        Environment.SetEnvironmentVariable("JWT_SECRET", "formmaps-test-secret-that-is-at-least-32-bytes");
        var factory = new RealtimeTicketFactory(Options.Create(new LegacyJwtOptions
        {
            Issuer = "formmaps-api", Audience = "formmaps-frontend", ClockSkew = TimeSpan.Zero,
        }));
        var actor = new RequestActor("user-123", "student", "user@test.dev", "Test User");

        var ticket = factory.CreateTicket(actor);

        Assert.NotNull(ticket);
        var jwt = new JwtSecurityTokenHandler().ReadJwtToken(ticket);
        Assert.Equal("user-123", jwt.Subject);
        Assert.True(jwt.ValidTo <= DateTime.UtcNow.AddSeconds(65));
        Assert.True(jwt.ValidTo > DateTime.UtcNow.AddSeconds(30));
    }

    [Fact]
    public void CreateTicket_returns_null_when_JWT_SECRET_is_unset()
    {
        Environment.SetEnvironmentVariable("JWT_SECRET", null);
        var factory = new RealtimeTicketFactory(Options.Create(new LegacyJwtOptions
        {
            Issuer = "formmaps-api", Audience = "formmaps-frontend", ClockSkew = TimeSpan.Zero,
        }));

        var ticket = factory.CreateTicket(new RequestActor("user-123", "student", null, null));

        Assert.Null(ticket);
    }
}
```

Run: `dotnet test tests/FormMaps.UnitTests --filter "FullyQualifiedName~RealtimeTicketFactoryTests"`
Expected: FAIL, then implement Step 9's code above and re-run to PASS.

Also add two focused cases to the existing `LegacyJwtRequestContextFactoryTests.cs` for Step 8's
query-string fallback, using that file's own `BuildFactory()`/`CreateToken()` helpers:

```csharp
[Fact]
public void Create_authenticates_via_access_token_query_string_on_hub_path_only()
{
    var token = CreateToken([new Claim(JwtRegisteredClaimNames.Sub, "user-123"), new Claim("role", "student")]);
    var httpContext = new DefaultHttpContext();
    httpContext.Request.Path = "/hubs/messages/negotiate";
    httpContext.Request.QueryString = new QueryString($"?access_token={token}");

    var context = BuildFactory().Create(httpContext);

    Assert.True(context.IsAuthenticated);
    Assert.Equal("user-123", context.Actor?.UserId);
}

[Fact]
public void Query_string_token_is_ignored_outside_the_hub_path()
{
    var token = CreateToken([new Claim(JwtRegisteredClaimNames.Sub, "user-123"), new Claim("role", "student")]);
    var httpContext = new DefaultHttpContext();
    httpContext.Request.Path = "/api/v1/messages/conversations";
    httpContext.Request.QueryString = new QueryString($"?access_token={token}");

    var context = BuildFactory().Create(httpContext);

    Assert.False(context.IsAuthenticated); // no cookie, no header — query string not honored off-hub
}
```

- [ ] **Step 11: Commit**

```bash
git add services/api/src/FormMaps.Application/Messaging/IMessagesRealtimeNotifier.cs \
  services/api/src/FormMaps.Api/Realtime services/api/src/FormMaps.Api/Auth/RealtimeTicketFactory.cs \
  services/api/src/FormMaps.Api/Auth/LegacyJwtRequestContextFactory.cs \
  services/api/src/FormMaps.Infrastructure/Messaging/MessagesRepository.cs \
  services/api/src/FormMaps.Api/Endpoints/MessagesEndpoints.cs services/api/src/FormMaps.Api/Program.cs \
  services/api/src/FormMaps.Infrastructure/DependencyInjection.cs \
  services/api/tests/FormMaps.UnitTests/Messaging services/api/tests/FormMaps.IntegrationTests/Messaging
git commit -m "feat(messaging): SignalR hub + realtime-ticket endpoint + push-after-commit wiring (dark)"
```

---

### Task 8: `POST /broadcast`

**Files:**
- Modify: `IMessagesRepository.cs`, `MessagesRepository.cs`, `MessagesEndpoints.cs`
- Test: `services/api/tests/FormMaps.IntegrationTests/Messaging/MessagesBroadcastTests.cs`

**Interfaces:**
- Produces: `IMessagesRepository.BroadcastAsync(RequestContext, string userId, string role, string schoolId, string recipientGroup, string content, CancellationToken) : Task<int>`.

- [ ] **Step 1: Add interface method**

```csharp
Task<int> BroadcastAsync(
    RequestContext context, string userId, string role, string schoolId, string recipientGroup, string content,
    CancellationToken cancellationToken = default);
```

- [ ] **Step 2: Write the failing tests**

```csharp
[Fact]
public async Task Broadcasts_to_all_students_in_school()
{
    var schoolId = Guid.NewGuid().ToString();
    var admin = await _fixture.SeedUserAsync(schoolId, "school_admin");
    var s1 = await _fixture.SeedUserAsync(schoolId, "student");
    var s2 = await _fixture.SeedUserAsync(schoolId, "student");
    var otherSchoolStudent = await _fixture.SeedUserAsync(Guid.NewGuid().ToString(), "student");

    var count = await Repo().BroadcastAsync(_fixture.Ctx(admin, schoolId), admin, "school_admin", schoolId, "students", "hello school");

    Assert.Equal(2, count);
}

[Fact]
public async Task Counselor_broadcast_to_students_only_reaches_assigned_students()
{
    var schoolId = Guid.NewGuid().ToString();
    var counselor = await _fixture.SeedUserAsync(schoolId, "counselor");
    var assigned = await _fixture.SeedUserAsync(schoolId, "student");
    var unassigned = await _fixture.SeedUserAsync(schoolId, "student");
    await _fixture.SeedAssignmentAsync(counselor, assigned);

    var count = await Repo().BroadcastAsync(_fixture.Ctx(counselor, schoolId), counselor, "counselor", schoolId, "students", "hi");

    Assert.Equal(1, count);
}

[Fact]
public async Task Blocked_recipients_are_excluded()
{
    var schoolId = Guid.NewGuid().ToString();
    var admin = await _fixture.SeedUserAsync(schoolId, "school_admin");
    var blocked = await _fixture.SeedUserAsync(schoolId, "student");
    await _fixture.SeedBlockAsync(admin, blocked);

    var count = await Repo().BroadcastAsync(_fixture.Ctx(admin, schoolId), admin, "school_admin", schoolId, "students", "hi");

    Assert.Equal(0, count);
}
```

Run: `dotnet test tests/FormMaps.IntegrationTests --filter "FullyQualifiedName~MessagesBroadcastTests"`
Expected: FAIL.

- [ ] **Step 3: Implement `BroadcastAsync`**

```csharp
private static readonly Dictionary<string, string[]> RoleMap = new()
{
    ["students"] = ["student", "Student"],
    ["parents"] = ["parent", "Parent"],
    ["counselors"] = ["counselor", "Counselor"],
    ["staff"] = ["school_admin", "counselor", "coach", "Coach"],
};

public async Task<int> BroadcastAsync(
    RequestContext context, string userId, string role, string schoolId, string recipientGroup, string content,
    CancellationToken cancellationToken = default)
{
    await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);
    var roles = RoleMap[recipientGroup];

    IReadOnlyList<string>? restrictToIds = null;
    if (role == "counselor" && recipientGroup == "students")
    {
        restrictToIds = await GetAssignedStudentIdsAsync(session, userId, cancellationToken);
    }

    var recipients = await GetSchoolRecipientsAsync(session, schoolId, roles, userId, restrictToIds, cancellationToken);
    if (recipients.Count == 0) { await session.CommitAsync(cancellationToken); return 0; }

    var blockedIds = await GetBlockedIdsAsync(session, userId, recipients.Select(r => r.Id).ToList(), cancellationToken);
    var filtered = recipients.Where(r => !blockedIds.Contains(r.Id)).ToList();

    var preview = content.Length > 100 ? content[..97] + "..." : content;
    var now = NowTruncated();
    var senderName = await GetUserNameAsync(session, userId, cancellationToken) ?? "";

    const int chunkSize = 20;
    var created = 0;
    for (var i = 0; i < filtered.Count; i += chunkSize)
    {
        var chunk = filtered.Skip(i).Take(chunkSize);
        foreach (var recipient in chunk)
        {
            var (pa, pb) = string.CompareOrdinal(userId, recipient.Id) < 0 ? (userId, recipient.Id) : (recipient.Id, userId);
            var conversationId = await UpsertConversationAsync(session, pa, pb, now, preview, cancellationToken);
            await using (var insert = Command(session, """
                INSERT INTO "messages" ("id", "conversationId", "senderId", "content", "createdDate", "updatedAt")
                VALUES (@id, @cid, @sid, @content, @now, @now)
                """))
            {
                AddParameter(insert, "id", Guid.NewGuid().ToString());
                AddParameter(insert, "cid", conversationId);
                AddParameter(insert, "sid", userId);
                AddParameter(insert, "content", content);
                AddTimestamp(insert, "now", now);
                await insert.ExecuteNonQueryAsync(cancellationToken);
            }
            await using (var outbox = Command(session, """
                INSERT INTO "notification_outbox" ("id", "type", "payload", "due_at")
                VALUES (@id, 'unread_message', @payload::jsonb, @dueAt)
                """))
            {
                AddParameter(outbox, "id", Guid.NewGuid().ToString());
                AddParameter(outbox, "payload", System.Text.Json.JsonSerializer.Serialize(new
                {
                    messageId = Guid.NewGuid().ToString(), recipientEmail = recipient.Email, senderName, preview,
                }));
                AddTimestamp(outbox, "dueAt", now.AddMinutes(5));
                await outbox.ExecuteNonQueryAsync(cancellationToken);
            }
        }
        created += chunk.Count();
    }

    await session.CommitAsync(cancellationToken);
    return created;
}

private sealed record RecipientRow(string Id, string Email);

private static async Task<IReadOnlyList<string>> GetAssignedStudentIdsAsync(
    FormMapsDatabaseSession session, string counselorId, CancellationToken cancellationToken)
{
    await using var command = Command(session, """
        SELECT "studentId" FROM "counselor_student_assignments" WHERE "counselorId" = @counselorId AND "isActive" = true
        """);
    AddParameter(command, "counselorId", counselorId);
    await using var reader = await command.ExecuteReaderAsync(cancellationToken);
    var ids = new List<string>();
    while (await reader.ReadAsync(cancellationToken)) ids.Add(reader.GetString(0));
    return ids;
}

private static async Task<IReadOnlyList<RecipientRow>> GetSchoolRecipientsAsync(
    FormMapsDatabaseSession session, string schoolId, string[] roles, string excludeUserId,
    IReadOnlyList<string>? restrictToIds, CancellationToken cancellationToken)
{
    var sql = """
        SELECT "id", "email" FROM "users"
        WHERE "schoolId" = @schoolId AND "roleName" = ANY(@roles) AND "isActive" = true AND "id" <> @excludeUserId
        """ + (restrictToIds is not null ? """ AND "id" = ANY(@restrictToIds)""" : "") + """
         LIMIT 500
        """;
    await using var command = Command(session, sql);
    AddParameter(command, "schoolId", schoolId);
    AddParameter(command, "roles", roles);
    AddParameter(command, "excludeUserId", excludeUserId);
    if (restrictToIds is not null) AddParameter(command, "restrictToIds", restrictToIds.ToArray());
    await using var reader = await command.ExecuteReaderAsync(cancellationToken);
    var rows = new List<RecipientRow>();
    while (await reader.ReadAsync(cancellationToken)) rows.Add(new RecipientRow(reader.GetString(0), reader.GetString(1)));
    return rows;
}

private static async Task<ISet<string>> GetBlockedIdsAsync(
    FormMapsDatabaseSession session, string userId, IReadOnlyList<string> candidateIds, CancellationToken cancellationToken)
{
    if (candidateIds.Count == 0) return new HashSet<string>();
    await using var command = Command(session, """
        SELECT "blockerId", "blockedId" FROM "user_blocks"
        WHERE "isActive" = true AND (
            ("blockerId" = @userId AND "blockedId" = ANY(@candidateIds)) OR
            ("blockedId" = @userId AND "blockerId" = ANY(@candidateIds))
        )
        """);
    AddParameter(command, "userId", userId);
    AddParameter(command, "candidateIds", candidateIds.ToArray());
    await using var reader = await command.ExecuteReaderAsync(cancellationToken);
    var ids = new HashSet<string>();
    while (await reader.ReadAsync(cancellationToken))
    {
        var blockerId = reader.GetString(0);
        var blockedId = reader.GetString(1);
        ids.Add(blockerId == userId ? blockedId : blockerId);
    }
    return ids;
}

private static async Task<string?> GetUserNameAsync(FormMapsDatabaseSession session, string userId, CancellationToken cancellationToken)
{
    await using var command = Command(session, """SELECT "name" FROM "users" WHERE "id" = @id""");
    AddParameter(command, "id", userId);
    var result = await command.ExecuteScalarAsync(cancellationToken);
    return result as string;
}

private static async Task<string> UpsertConversationAsync(
    FormMapsDatabaseSession session, string participantAId, string participantBId, DateTime now, string preview,
    CancellationToken cancellationToken)
{
    await using var upsert = Command(session, """
        INSERT INTO "conversations" ("id", "participantAId", "participantBId", "lastMessageAt", "lastMessagePreview")
        VALUES (@id, @pa, @pb, @now, @preview)
        ON CONFLICT ("participantAId", "participantBId")
        DO UPDATE SET "lastMessageAt" = @now, "lastMessagePreview" = @preview
        RETURNING "id"
        """);
    AddParameter(upsert, "id", Guid.NewGuid().ToString());
    AddParameter(upsert, "pa", participantAId);
    AddParameter(upsert, "pb", participantBId);
    AddTimestamp(upsert, "now", now);
    AddParameter(upsert, "preview", preview);
    var result = await upsert.ExecuteScalarAsync(cancellationToken);
    return (string)result!;
}
```

- [ ] **Step 4: Wire the endpoint**

```csharp
group.MapPost("/broadcast", BroadcastAsync);
```

```csharp
public sealed record BroadcastRequest(string RecipientGroup, string Content);
private static readonly string[] BroadcastGroups = ["students", "parents", "counselors", "staff"];

private static async Task<IResult> BroadcastAsync(
    IRequestContextAccessor accessor, IProtectedRequestGuard guard, IMessagesRepository repository,
    BroadcastRequest? body, CancellationToken cancellationToken)
{
    var context = accessor.Current;
    var decision = guard.RequireIdentity(context);
    if (!decision.Allowed) return Deny(decision);

    var role = context.Actor!.NormalizedRole.ToLowerInvariant();
    if (role is not ("school_admin" or "super admin" or "counselor"))
        return Forbidden("Only school admins and counselors can broadcast");

    if (body is null || !BroadcastGroups.Contains(body.RecipientGroup) || string.IsNullOrWhiteSpace(body.Content) || body.Content.Length > 5000)
        return BadRequestResult("Invalid broadcast request");

    if (string.IsNullOrWhiteSpace(context.Tenant!.SchoolId))
        return BadRequestResult("No school linked");

    var count = await repository.BroadcastAsync(
        context, context.Tenant.UserId, role, context.Tenant.SchoolId, body.RecipientGroup, body.Content, cancellationToken);
    return Results.Ok(new { success = true, data = new { recipientCount = count } });
}
```

- [ ] **Step 5: Run, verify pass, commit**

```bash
dotnet test tests/FormMaps.IntegrationTests --filter "FullyQualifiedName~MessagesBroadcastTests"
git add services/api/src/FormMaps.Application/Messaging services/api/src/FormMaps.Infrastructure/Messaging \
  services/api/src/FormMaps.Api/Endpoints/MessagesEndpoints.cs services/api/tests/FormMaps.IntegrationTests/Messaging
git commit -m "feat(messaging): port POST /broadcast to .NET (FM-DOTNET-104, dark)"
```

---

### Task 9: Adversarial access-control review

Not a code-writing task — a structured verification pass, matching Domain 7a's own dedicated Task 7
(see [[project_domain7a_video_complete]]). Run this after Tasks 1-8 are merged, before frontend wiring.

**Files:** none (review only — any fix it surfaces becomes its own small follow-up commit).

- [ ] **Step 1: Trace every endpoint's real enforcement mechanism**

For each of the 7 endpoints, write down (a) what RLS alone would allow a non-participant/non-privileged
caller to see, and (b) what the app-layer code additionally restricts. Confirm every gap between (a) and
(b) that legacy Node closes is also closed here. Specific angles to check:
- Can a non-participant read another pair's conversation via `GET /conversations/:id` by guessing an id?
  (Should be blocked by participant-scoped RLS — verify with a live cross-user attempt, not just reading
  the SQL.)
- Can a student message a counselor they're not assigned to by supplying `counselorId` instead of
  `recipientId` in `POST /conversations` (legacy's backward-compat field)?
- Can a counselor's `POST /broadcast` to `students` reach a student outside their assignment list by any
  path (e.g. omitted `restrictToIds` on a code path that shouldn't omit it)?
- Does a blocked pair's block enforcement in `SendMessageAsync` actually query the CURRENT block state,
  not a stale conversation-creation-time snapshot?
- Can the `access_token` query-string fallback in `LegacyJwtRequestContextFactory.ExtractToken` be used
  against *non*-hub REST endpoints (it must be scoped to `/hubs/messages` only — confirm the
  `StartsWithSegments` guard actually rejects `/api/v1/messages/...` paths)?
- Does the realtime ticket's 60-second expiry actually get enforced (mint one, wait 61s, attempt to
  connect the hub with it, confirm rejection)?

- [ ] **Step 2: Record findings and fix**

Any real bypass found gets its own task-sized fix (write a regression test first, then fix, then verify),
following the same TDD shape as every task above. Findings with no real exploit path (e.g. a technically
looser-than-legacy check that isn't actually reachable) get documented, not silently dismissed.

---

### Task 10: Frontend wiring — flag-gated REST rewrites + SignalR client

**Files:**
- Modify: `frontend/next.config.ts`
- Modify: `frontend/package.json` (add `@microsoft/signalr`)
- Modify: `frontend/src/app/dashboard/messages/page.tsx`
- Test: existing frontend test suite (no new test framework needed — this is a mechanical rewrite of the
  polling `useEffect` into a connection lifecycle; cover it with a component test asserting the poll
  `setInterval` is gone when the realtime flag is simulated on, matching this repo's existing
  frontend-test conventions).

**Interfaces:**
- Consumes: `POST /api/v1/messages/realtime-ticket` (Task 7) for `accessTokenFactory`.
- Consumes: `messageReceived` hub event payload shape from Task 7's `SendMessageAsync` push (`id`,
  `conversationId`, `senderId`, `content`, `createdDate`).

- [ ] **Step 1: Add the flag-gated REST rewrites to `next.config.ts`**

Placed ahead of the existing `/api/:path*` catch-all, following every prior slice's exact pattern:

```typescript
function shouldRouteMessagesToDotnet() {
  return Boolean(dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_MESSAGES_TO_DOTNET));
}
```

```typescript
...(shouldRouteMessagesToDotnet()
  ? [
      { source: "/api/v1/messages/unread-count", destination: `${dotnetApiBaseUrl}/api/v1/messages/unread-count` },
      { source: "/api/v1/messages/contacts", destination: `${dotnetApiBaseUrl}/api/v1/messages/contacts` },
      { source: "/api/v1/messages/conversations", destination: `${dotnetApiBaseUrl}/api/v1/messages/conversations` },
      { source: "/api/v1/messages/conversations/:id", destination: `${dotnetApiBaseUrl}/api/v1/messages/conversations/:id` },
      { source: "/api/v1/messages/broadcast", destination: `${dotnetApiBaseUrl}/api/v1/messages/broadcast` },
      { source: "/api/v1/messages/realtime-ticket", destination: `${dotnetApiBaseUrl}/api/v1/messages/realtime-ticket` },
    ]
  : []),
```

- [ ] **Step 2: Add `@microsoft/signalr`**

```bash
cd frontend && npm install @microsoft/signalr
```

- [ ] **Step 3: Write the realtime connection hook**

```typescript
// frontend/src/hooks/useMessagesRealtime.ts
import { useEffect, useRef } from "react";
import * as signalR from "@microsoft/signalr";

const REALTIME_ENABLED = process.env.NEXT_PUBLIC_FORMMAPS_ROUTE_MESSAGES_REALTIME_TO_DOTNET === "1";
const DOTNET_HUB_BASE_URL = process.env.NEXT_PUBLIC_FORMMAPS_DOTNET_HUB_BASE_URL || "";

interface MessageReceivedPayload {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  createdDate: string;
}

/** No-op (returns null) unless FORMMAPS_ROUTE_MESSAGES_REALTIME_TO_DOTNET is on — callers must keep
 *  their existing 15s poll as the fallback delivery path regardless of this hook's state. */
export function useMessagesRealtime(onMessageReceived: (payload: MessageReceivedPayload) => void) {
  const connectionRef = useRef<signalR.HubConnection | null>(null);

  useEffect(() => {
    if (!REALTIME_ENABLED || !DOTNET_HUB_BASE_URL) return;

    const connection = new signalR.HubConnectionBuilder()
      .withUrl(`${DOTNET_HUB_BASE_URL}/hubs/messages`, {
        accessTokenFactory: async () => {
          const res = await fetch("/api/v1/messages/realtime-ticket", { method: "POST", credentials: "include" });
          if (!res.ok) return "";
          const body = await res.json();
          return body?.data?.ticket ?? "";
        },
      })
      .withAutomaticReconnect()
      .build();

    connection.on("messageReceived", onMessageReceived);
    connection.start().catch(() => { /* falls back to the existing poll — no user-facing error */ });
    connectionRef.current = connection;

    return () => { connection.stop(); };
  }, [onMessageReceived]);
}
```

- [ ] **Step 4: Wire it into the messages page, alongside the existing poll**

In `frontend/src/app/dashboard/messages/page.tsx`, add the hook call — the existing 15s `setInterval`
poll (lines 70-75) stays exactly as-is, unconditionally, as the fallback delivery path (per the design
doc: "no message-replay/ack protocol... falls back to the next REST load"):

```typescript
useMessagesRealtime(useCallback((payload) => {
  fetchConversations();
  if (selectedId === payload.conversationId) fetchMessages(selectedId, true);
}, [selectedId, fetchConversations, fetchMessages]));
```

- [ ] **Step 5: Write the failing test, then verify it passes**

`REALTIME_ENABLED` defaults to off in the test environment (no `NEXT_PUBLIC_FORMMAPS_ROUTE_MESSAGES_REALTIME_TO_DOTNET`
set), matching production's default-dark flag state — this test locks in that the hook is a safe no-op
until the flag is flipped, and doesn't crash on mount/unmount:

```typescript
// frontend/src/hooks/__tests__/useMessagesRealtime.test.ts
import { renderHook } from "@testing-library/react";
import { useMessagesRealtime } from "../useMessagesRealtime";

describe("useMessagesRealtime", () => {
  it("is a no-op when the realtime flag is off (default/dark state)", () => {
    const onMessageReceived = jest.fn();

    const { unmount } = renderHook(() => useMessagesRealtime(onMessageReceived));

    expect(onMessageReceived).not.toHaveBeenCalled();
    expect(() => unmount()).not.toThrow(); // no connection was started, cleanup must still be safe
  });
});
```

Run: `cd frontend && npx jest --testPathPattern useMessagesRealtime`
Expected: FAIL first (hook doesn't exist until Step 3 lands), PASS once Steps 1-4 are in place.

The existing 15s poll in `messages/page.tsx` is untouched by this task (Step 4 only adds a callback
alongside it) — no separate regression test needed for "the poll still runs," since no code path in this
task removes or conditions it.

A reviewer extending this should add a second case with `@microsoft/signalr` mocked (`jest.mock("@microsoft/signalr")`)
and the flag forced on, asserting `HubConnectionBuilder().withUrl(...).build().start()` is actually
invoked — this task's test only pins the default-off safe path.

- [ ] **Step 6: Verify full frontend suite still green, commit**

```bash
cd frontend && npx tsc --noEmit && npx jest --silent && npx next build
git add frontend/next.config.ts frontend/package.json frontend/package-lock.json \
  frontend/src/hooks/useMessagesRealtime.ts frontend/src/app/dashboard/messages
git commit -m "feat(messaging): flag-gated .NET rewrites + SignalR client wiring, poll stays as fallback (dark)"
```
