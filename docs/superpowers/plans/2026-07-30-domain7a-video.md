# Domain 7a: Video (Daily.co REST port) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port 7 of `video.ts`'s 9 endpoints (`GET /enabled`, `GET /sessions`, `GET /sessions/:id`, `POST /signature`, `POST /sessions`, `POST /sessions/:id/end`, `POST /sessions/:id/start`) to `.NET`, dark behind 5 new flags, plus the frontend rewrites and the new `DAILY_API_KEY` infra wiring. `POST /sessions/schedule` and `POST /sessions/:id/cancel` are explicitly NOT in scope (calendar-sync side effect stays Node — see spec).

**Architecture:** New `FormMaps.Application/Video` + `FormMaps.Infrastructure/Video` folders (sibling to, not sharing with, the existing `Counselor` domain, even though both read/write `counselor_sessions`). `IVideoSessionsRepository` owns all SQL against `counselor_sessions`/`users`/`counselor_student_assignments`/`schools`. `IDailyClient` wraps the two Daily.co REST calls via a typed `HttpClient`. `VideoEndpoints.cs` wires both behind `RequireIdentity` only (no RBAC permission constant — matches `video.ts`'s plain `authenticate`-only gate, same shape as `ResumeCrudEndpoints`).

**Tech Stack:** .NET minimal APIs, Npgsql (raw SQL, no ORM), xUnit + Testcontainers.Postgres, `WebApplicationFactory<Program>` for endpoint tests, `HttpClient` + a hand-rolled fake `HttpMessageHandler` for `DailyClient` tests (no mocking library in this repo — every existing test uses hand-written fakes).

## Global Constraints

- Spec: `formmaps-platform/docs/superpowers/specs/2026-07-30-domain7a-video-design.md`.
- `counselor_sessions` access-denial responses use **403** ("Access denied" / "Session not found" separately) — this is `video.ts`'s own actual behavior (unlike `resume.ts`'s existence-oracle-safe 404s). Preserve as-is; every route here is strictly participant-only, not a cross-user-viewable-by-privileged-roles surface.
- `POST /sessions`'s role/assignment/school-mismatch denials use **404** "Participant not found" (staff-only feature; the 403 role gate is a separate, earlier check that *is* allowed to reveal itself — see Task 4).
- Unhandled exceptions → generic 500, never leak `err.Message` / exception details to the client.
- Timestamps written to Postgres: `DateTime` with `Kind=Unspecified`, millisecond-truncated (reuse `CounselorSessionsRepository.Now()`'s exact pattern, don't reinvent). Timestamps read back: ISO-Z strings via the same `IsoZ()` shape.
- Every new flag defaults **OFF**. This plan produces **local commits only** — no push, no PR, no staging deploy, no flag flip.
- No RBAC/`FormMapsPermissions` gate on any Video route — `RequireIdentity` only, matching `video.ts`'s `authenticate`-only middleware chain.

---

### Task 1: `IVideoSessionsRepository` contract + read-side implementation

**Files:**
- Create: `services/api/src/FormMaps.Application/Video/IVideoSessionsRepository.cs`
- Create: `services/api/src/FormMaps.Infrastructure/Video/VideoSessionsRepository.cs`
- Test: `services/api/tests/FormMaps.IntegrationTests/Video/VideoSessionsRepositoryTests.cs`

**Interfaces:**
- Produces (used by Task 2 and Task 4):
  - `record VideoSessionRow(string Id, string SessionName, string Status, string Topic, string Notes, string StartTime, string EndTime, string? CompletedAt, string CounselorId, string? CounselorName, string? CounselorEmail, string StudentId, string? StudentName, string? StudentEmail)`
  - `record VideoParticipantCandidate(string Id, string? Name, string? Email, string? SchoolId)`
  - `record CreatedVideoSession(string Id, string SessionName, string StartTime)`
  - `enum SessionMutationOutcomeKind { NotFound, Forbidden, NotScheduled, Ok }`
  - `interface IVideoSessionsRepository` — full contract below (Task 1 implements the read methods; Task 2 fills in the write methods, which throw `NotImplementedException` until then).

- [ ] **Step 1: Write the full interface**

```csharp
// services/api/src/FormMaps.Application/Video/IVideoSessionsRepository.cs
using FormMaps.Application.Auth;

namespace FormMaps.Application.Video;

/// <summary>
/// Video-call session access (routes/video.ts). Reads/writes the SAME "counselor_sessions" table as
/// FormMaps.Application.Counselor's ICounselorSessionsRepository, filtered to topic="Video Call" rows
/// where relevant — kept as a sibling interface, not shared, because the two domains' query shapes
/// (video-call filtering vs. a counselor's full session list) are independently evolving. See the
/// Domain 7a design spec for why this isn't folded into Counselor.
/// </summary>
public interface IVideoSessionsRepository
{
    /// <summary>schools.videoCallsEnabled for a given school id. False if the school row is missing.
    /// <paramref name="context"/> is threaded through to every method (not just this one) and used to open
    /// an Identity-GUC session via IFormMapsDatabaseSessionFactory, same convention as
    /// ICounselorSessionsRepository — NOT RequestContext.System()/Bypass, since these are ordinary
    /// caller-scoped reads/writes, not a system-level operation.</summary>
    Task<bool> IsVideoEnabledForSchoolAsync(RequestContext context, string schoolId, CancellationToken cancellationToken = default);

    /// <summary>The caller's own video-call sessions (topic="Video Call", meetingLink != ""), where the
    /// caller is either counselorId or studentId. Desc by startTime, capped at 50 — matches legacy's
    /// fixed `take: 50` (no pagination on this route).</summary>
    Task<IReadOnlyList<VideoSessionRow>> ListForUserAsync(RequestContext context, string userId, CancellationToken cancellationToken = default);

    /// <summary>Plain lookup by id — NO topic filter (legacy quirk: GET /sessions/:id and the end/start
    /// mutations all use prisma.counselorSession.findUnique, which doesn't scope to video-call rows).</summary>
    Task<VideoSessionRow?> GetByIdAsync(RequestContext context, string sessionId, CancellationToken cancellationToken = default);

    /// <summary>Lookup by meetingLink + topic="Video Call" (used only by POST /signature, which legacy
    /// resolves via findFirst on those two columns instead of an id).</summary>
    Task<VideoSessionRow?> FindByRoomNameAsync(RequestContext context, string roomName, CancellationToken cancellationToken = default);

    /// <summary>A prospective call participant's directory info, for POST /sessions's validation chain.</summary>
    Task<VideoParticipantCandidate?> FindParticipantCandidateAsync(RequestContext context, string userId, CancellationToken cancellationToken = default);

    /// <summary>True if an ACTIVE counselor_student_assignments row links counselorId → studentId.</summary>
    Task<bool> HasActiveCounselorAssignmentAsync(RequestContext context, string counselorId, string studentId, CancellationToken cancellationToken = default);

    /// <summary>Creates an ad-hoc call: status="video_active", topic="Video Call", a random
    /// `formmaps-{16 hex chars}` meetingLink, startTime=now, endTime=now+1h (all legacy-owned defaults —
    /// the repository generates them, mirroring how CounselorSessionsRepository.Now() self-stamps).</summary>
    Task<CreatedVideoSession> CreateAsync(RequestContext context, string counselorId, string studentId, CancellationToken cancellationToken = default);

    /// <summary>NotFound (missing) / Forbidden (caller not counselorId or studentId) / Ok (status set to
    /// "completed", completedAt+endTime stamped now).</summary>
    Task<SessionMutationOutcomeKind> EndAsync(RequestContext context, string sessionId, string callerId, CancellationToken cancellationToken = default);

    /// <summary>NotFound / Forbidden / NotScheduled (status != "scheduled") / Ok (status set to
    /// "video_active", startTime restamped now). SessionName is non-null only when Kind == Ok.</summary>
    Task<(SessionMutationOutcomeKind Kind, string? SessionName)> StartAsync(
        RequestContext context, string sessionId, string callerId, CancellationToken cancellationToken = default);
}

public sealed record VideoSessionRow(
    string Id, string SessionName, string Status, string Topic, string Notes,
    string StartTime, string EndTime, string? CompletedAt,
    string CounselorId, string? CounselorName, string? CounselorEmail,
    string StudentId, string? StudentName, string? StudentEmail);

public sealed record VideoParticipantCandidate(string Id, string? Name, string? Email, string? SchoolId);

public sealed record CreatedVideoSession(string Id, string SessionName, string StartTime);

public enum SessionMutationOutcomeKind { NotFound, Forbidden, NotScheduled, Ok }
```

- [ ] **Step 2: Run a build to confirm the interface compiles standalone**

Run: `dotnet build services/api/src/FormMaps.Application/FormMaps.Application.csproj`
Expected: builds clean.

- [ ] **Step 3: Implement the read-side of `VideoSessionsRepository`** (write methods throw `NotImplementedException` for now — Task 2 fills them in)

```csharp
// services/api/src/FormMaps.Infrastructure/Video/VideoSessionsRepository.cs
using System.Data;
using System.Data.Common;
using System.Globalization;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;
using FormMaps.Application.Video;

namespace FormMaps.Infrastructure.Video;

/// <summary>
/// SQL for routes/video.ts (FM-091..097). See IVideoSessionsRepository for the exact per-method legacy
/// quirks (topic-filtered vs. unfiltered lookups). Timestamps bound Kind=Unspecified + ms-truncated on
/// write; ISO-Z on read, matching CounselorSessionsRepository's own convention for this same table.
/// </summary>
public sealed class VideoSessionsRepository(
    IFormMapsDatabaseSessionFactory databaseSessionFactory,
    TimeProvider timeProvider) : IVideoSessionsRepository
{
    private const string SelectColumns =
        """
        cs."id", cs."meetingLink", cs."status", cs."topic", cs."notes", cs."startTime", cs."endTime",
        cs."completedAt", cs."counselorId", uc."name", uc."email", cs."studentId", us."name", us."email"
        """;

    private const string JoinedFrom =
        """
        "counselor_sessions" cs
        LEFT JOIN "users" uc ON uc."id" = cs."counselorId"
        LEFT JOIN "users" us ON us."id" = cs."studentId"
        """;

    public async Task<bool> IsVideoEnabledForSchoolAsync(RequestContext context, string schoolId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        await using var command = Command(session, """SELECT "videoCallsEnabled" FROM "schools" WHERE "id" = @id""");
        AddParameter(command, "id", schoolId);
        var result = await command.ExecuteScalarAsync(cancellationToken);
        return result is bool enabled && enabled;
    }

    public async Task<IReadOnlyList<VideoSessionRow>> ListForUserAsync(RequestContext context, string userId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        await using var command = Command(session, $"""
            SELECT {SelectColumns}
            FROM {JoinedFrom}
            WHERE (cs."counselorId" = @uid OR cs."studentId" = @uid)
              AND cs."topic" = 'Video Call' AND cs."meetingLink" <> ''
            ORDER BY cs."startTime" DESC
            LIMIT 50
            """);
        AddParameter(command, "uid", userId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        var rows = new List<VideoSessionRow>();
        while (await reader.ReadAsync(cancellationToken))
        {
            rows.Add(MapRow(reader));
        }

        return rows;
    }

    public async Task<VideoSessionRow?> GetByIdAsync(RequestContext context, string sessionId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        await using var command = Command(session, $"""SELECT {SelectColumns} FROM {JoinedFrom} WHERE cs."id" = @id""");
        AddParameter(command, "id", sessionId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        return await reader.ReadAsync(cancellationToken) ? MapRow(reader) : null;
    }

    public async Task<VideoSessionRow?> FindByRoomNameAsync(RequestContext context, string roomName, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        await using var command = Command(session, $"""
            SELECT {SelectColumns} FROM {JoinedFrom}
            WHERE cs."meetingLink" = @roomName AND cs."topic" = 'Video Call'
            LIMIT 1
            """);
        AddParameter(command, "roomName", roomName);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        return await reader.ReadAsync(cancellationToken) ? MapRow(reader) : null;
    }

    public Task<VideoParticipantCandidate?> FindParticipantCandidateAsync(RequestContext context, string userId, CancellationToken cancellationToken = default) =>
        throw new NotImplementedException("Task 2");

    public Task<bool> HasActiveCounselorAssignmentAsync(RequestContext context, string counselorId, string studentId, CancellationToken cancellationToken = default) =>
        throw new NotImplementedException("Task 2");

    public Task<CreatedVideoSession> CreateAsync(RequestContext context, string counselorId, string studentId, CancellationToken cancellationToken = default) =>
        throw new NotImplementedException("Task 2");

    public Task<SessionMutationOutcomeKind> EndAsync(RequestContext context, string sessionId, string callerId, CancellationToken cancellationToken = default) =>
        throw new NotImplementedException("Task 2");

    public Task<(SessionMutationOutcomeKind Kind, string? SessionName)> StartAsync(
        RequestContext context, string sessionId, string callerId, CancellationToken cancellationToken = default) =>
        throw new NotImplementedException("Task 2");

    private static VideoSessionRow MapRow(DbDataReader reader) => new(
        Id: reader.GetString(0),
        SessionName: reader.GetString(1),
        Status: reader.GetString(2),
        Topic: reader.GetString(3),
        Notes: reader.GetString(4),
        StartTime: IsoZ(reader.GetDateTime(5)),
        EndTime: IsoZ(reader.GetDateTime(6)),
        CompletedAt: reader.IsDBNull(7) ? null : IsoZ(reader.GetDateTime(7)),
        CounselorId: reader.GetString(8),
        CounselorName: reader.IsDBNull(9) ? null : reader.GetString(9),
        CounselorEmail: reader.IsDBNull(10) ? null : reader.GetString(10),
        StudentId: reader.GetString(11),
        StudentName: reader.IsDBNull(12) ? null : reader.GetString(12),
        StudentEmail: reader.IsDBNull(13) ? null : reader.GetString(13));

    private DateTime Now() =>
        new DateTime(
            (timeProvider.GetUtcNow().UtcDateTime.Ticks / TimeSpan.TicksPerMillisecond) * TimeSpan.TicksPerMillisecond,
            DateTimeKind.Unspecified);

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

    private static string IsoZ(DateTime value) =>
        DateTime.SpecifyKind(value, DateTimeKind.Utc).ToString("yyyy-MM-ddTHH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);
}
```

Every method takes the caller's real `RequestContext` (threaded from the endpoint, Task 4) and opens an Identity-GUC session via `databaseSessionFactory.OpenReadOnlyAsync(context, ...)` — exactly `CounselorSessionsRepository`'s own convention. Do NOT use `RequestContext.System()`/`RequestContext.Anonymous()` here: per `TenantGucPlanResolver.Resolve`, `IsSystem` (and super-admin) resolve to `TenantGucPlan.Bypass()`, which skips RLS scoping entirely — appropriate for genuinely system-level operations, not for these ordinary caller-scoped reads/writes. The participant/role authorization still happens in the endpoint layer (Task 4) on top of this — the two are independent layers (DB-session identity vs. application-level authorization), not a substitute for each other.

- [ ] **Step 4: Write the Testcontainers integration tests**

```csharp
// services/api/tests/FormMaps.IntegrationTests/Video/VideoSessionsRepositoryTests.cs
using FormMaps.Application.Auth;
using FormMaps.Infrastructure.Data;
using FormMaps.Infrastructure.Video;
using Npgsql;

namespace FormMaps.IntegrationTests.Video;

public sealed class VideoSessionsRepositoryTests : IClassFixture<VideoSessionsRepositoryTests.Fixture>, IAsyncLifetime
{
    private readonly Fixture _fixture;
    private NpgsqlDataSource _dataSource = null!;

    public VideoSessionsRepositoryTests(Fixture fixture) => _fixture = fixture;

    public async Task InitializeAsync()
    {
        _dataSource = NpgsqlDataSource.Create(_fixture.ConnectionString);
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand("""TRUNCATE "users","counselor_sessions","schools" CASCADE""", conn);
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task DisposeAsync() => await _dataSource.DisposeAsync();

    [Fact]
    public async Task IsVideoEnabled_true_false_and_missing_school()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await School(conn, "s-on", videoEnabled: true);
        await School(conn, "s-off", videoEnabled: false);

        Assert.True(await Repo().IsVideoEnabledForSchoolAsync(Ctx(), "s-on"));
        Assert.False(await Repo().IsVideoEnabledForSchoolAsync(Ctx(), "s-off"));
        Assert.False(await Repo().IsVideoEnabledForSchoolAsync(Ctx(), "missing"));
    }

    [Fact]
    public async Task ListForUser_scopes_either_role_video_call_only_desc_take_50()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await User(conn, "s1", "Alice"); await User(conn, "c1", "Coach");
        await Session(conn, "as-counselor", "u1", "s1", start: new DateTime(2026, 7, 1));
        await Session(conn, "as-student", "c1", "u1", start: new DateTime(2026, 7, 10));
        await Session(conn, "not-video", "u1", "s1", topic: "Coaching Session");
        await Session(conn, "no-link", "u1", "s1", meetingLink: "");

        var rows = await Repo().ListForUserAsync(Ctx(), "u1");

        Assert.Equal(["as-student", "as-counselor"], rows.Select(r => r.Id)); // startTime DESC
    }

    [Fact]
    public async Task GetById_has_no_topic_filter_and_joins_both_names()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await User(conn, "c1", "Coach"); await User(conn, "s1", "Alice");
        await Session(conn, "any-topic", "c1", "s1", topic: "Coaching Session");

        var row = await Repo().GetByIdAsync(Ctx(), "any-topic");

        Assert.NotNull(row);
        Assert.Equal("Coach", row!.CounselorName);
        Assert.Equal("Alice", row.StudentName);
    }

    [Fact]
    public async Task FindByRoomName_requires_video_call_topic()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await User(conn, "c1", "Coach"); await User(conn, "s1", "Alice");
        await Session(conn, "vc", "c1", "s1", meetingLink: "room-x", topic: "Video Call");
        await Session(conn, "other", "c1", "s1", meetingLink: "room-y", topic: "Coaching Session");

        Assert.Equal("vc", (await Repo().FindByRoomNameAsync(Ctx(), "room-x"))!.Id);
        Assert.Null(await Repo().FindByRoomNameAsync(Ctx(), "room-y"));
    }

    // ---- helpers ----

    private VideoSessionsRepository Repo() =>
        new(new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()), TimeProvider.System);

    // Identity-GUC context — NOT System()/Bypass (see the note after Task 1 Step 3). schoolId "school-1"
    // is a placeholder; individual tests insert whatever school/user rows they need under their own ids.
    private static RequestContext Ctx() =>
        RequestContext.Authenticated(
            new RequestActor("test-caller", "counselor", "c@e.st", "Caller"),
            schoolId: "school-1", permissions: [], tokenSource: TokenSource.DevelopmentHeader, isDevelopmentOverride: true);

    private static async Task User(NpgsqlConnection conn, string id, string name)
    {
        await using var cmd = new NpgsqlCommand(
            """INSERT INTO "users" ("id","name","email","isActive") VALUES (@id,@name,@id||'@x.test',true)""", conn);
        cmd.Parameters.AddWithValue("id", id); cmd.Parameters.AddWithValue("name", name);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task School(NpgsqlConnection conn, string id, bool videoEnabled)
    {
        await using var cmd = new NpgsqlCommand(
            """INSERT INTO "schools" ("id","name","videoCallsEnabled") VALUES (@id,@id,@enabled)""", conn);
        cmd.Parameters.AddWithValue("id", id); cmd.Parameters.AddWithValue("enabled", videoEnabled);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task Session(
        NpgsqlConnection conn, string id, string counselorId, string studentId,
        DateTime? start = null, string status = "video_active", string topic = "Video Call",
        string? meetingLink = null)
    {
        await using var cmd = new NpgsqlCommand("""
            INSERT INTO "counselor_sessions"
                ("id","counselorId","studentId","startTime","endTime","status","topic","notes",
                 "counselorNotes","meetingLink","calendarEventIds","cancellationReason","isActive",
                 "createdDate","updatedAt")
            VALUES (@id,@cid,@sid,@start,@start,@status,@topic,'','',@link,'{}','',true,@start,@start)
            """, conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("cid", counselorId);
        cmd.Parameters.AddWithValue("sid", studentId);
        cmd.Parameters.AddWithValue("start", start ?? new DateTime(2026, 1, 1));
        cmd.Parameters.AddWithValue("status", status);
        cmd.Parameters.AddWithValue("topic", topic);
        cmd.Parameters.AddWithValue("link", meetingLink ?? $"link-{id}");
        await cmd.ExecuteNonQueryAsync();
    }

    public sealed class Fixture : IAsyncLifetime
    {
        private readonly Testcontainers.PostgreSql.PostgreSqlContainer _container =
            new Testcontainers.PostgreSql.PostgreSqlBuilder().WithImage("postgres:16-alpine").Build();

        public string ConnectionString => _container.GetConnectionString();

        public async Task InitializeAsync()
        {
            await _container.StartAsync();
            // Apply the shared schema harness the way CounselorSessionsRepositoryTests' Fixture does —
            // point at the same base migration/schema SQL file used by every other Video-adjacent
            // Testcontainers fixture in this test project (find it via: grep -rl "counselor_sessions"
            // services/api/tests/**/*.sql). Reuse that file verbatim; do not hand-write a second copy
            // of the counselor_sessions/schools/users DDL.
        }

        public async Task DisposeAsync() => await _container.DisposeAsync();
    }
}
```

- [ ] **Step 5: Run the tests**

Run: `dotnet test services/api/tests/FormMaps.IntegrationTests --filter "FullyQualifiedName~VideoSessionsRepositoryTests"`
Expected: all 4 tests PASS.

**If `GetById_has_no_topic_filter_and_joins_both_names` (or any test whose `Ctx()` caller — `"test-caller"` —
is deliberately NOT a participant of the row it fetches) unexpectedly returns null:** this means
`counselor_sessions`'s RLS policy restricts reads to participant-only rows under Identity mode, which
breaks the exact legacy behavior this plan needs (`GetByIdAsync` MUST return the row regardless of
participant-ness — the 404-vs-403 distinction is decided in the endpoint, Task 4, not by the DB silently
returning nothing). Do not route around this by switching back to `RequestContext.System()`/Bypass — find
the actual RLS policy definition for `counselor_sessions` (check the Prisma migrations in
`formmaps-platform/api/prisma/migrations` for the original `CREATE POLICY` statement, or ask Federico
directly) and confirm whether `.NET`'s Identity-GUC session is expected to see all rows it explicitly
`WHERE`-scopes, the same way `CounselorSessionsRepository`'s own reads apparently already do for its
owner-scoped queries. This is worth flagging to Federico as its own small decision if the policy turns out
to be more restrictive than `CounselorSessionsRepository` assumed — don't guess silently.

- [ ] **Step 6: Commit**

```bash
git add services/api/src/FormMaps.Application/Video services/api/src/FormMaps.Infrastructure/Video services/api/tests/FormMaps.IntegrationTests/Video
git commit -m "feat(video): add IVideoSessionsRepository read-side (FM-091..093)"
```

---

### Task 2: `VideoSessionsRepository` write-side + DI registration

**Files:**
- Modify: `services/api/src/FormMaps.Infrastructure/Video/VideoSessionsRepository.cs`
- Modify: `services/api/src/FormMaps.Infrastructure/DependencyInjection.cs`
- Modify: `services/api/tests/FormMaps.IntegrationTests/Video/VideoSessionsRepositoryTests.cs`

**Interfaces:**
- Consumes: `VideoSessionRow`, `VideoParticipantCandidate`, `CreatedVideoSession`, `SessionMutationOutcomeKind` (Task 1).
- Produces: `IVideoSessionsRepository` fully implemented and registered in DI as `Scoped`.

- [ ] **Step 1: Replace the 5 `NotImplementedException` stubs**

```csharp
// services/api/src/FormMaps.Infrastructure/Video/VideoSessionsRepository.cs — replace the 5 throwing methods:

public async Task<VideoParticipantCandidate?> FindParticipantCandidateAsync(RequestContext context, string userId, CancellationToken cancellationToken = default)
{
    await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
    await using var command = Command(session,
        """SELECT "id","name","email","schoolId" FROM "users" WHERE "id" = @id AND "isActive" = true""");
    AddParameter(command, "id", userId);
    await using var reader = await command.ExecuteReaderAsync(cancellationToken);
    if (!await reader.ReadAsync(cancellationToken))
    {
        return null;
    }

    return new VideoParticipantCandidate(
        Id: reader.GetString(0),
        Name: reader.IsDBNull(1) ? null : reader.GetString(1),
        Email: reader.IsDBNull(2) ? null : reader.GetString(2),
        SchoolId: reader.IsDBNull(3) ? null : reader.GetString(3));
}

public async Task<bool> HasActiveCounselorAssignmentAsync(RequestContext context, string counselorId, string studentId, CancellationToken cancellationToken = default)
{
    await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
    await using var command = Command(session, """
        SELECT 1 FROM "counselor_student_assignments"
        WHERE "counselorId" = @cid AND "studentId" = @sid AND "isActive" = true
        LIMIT 1
        """);
    AddParameter(command, "cid", counselorId);
    AddParameter(command, "sid", studentId);
    var result = await command.ExecuteScalarAsync(cancellationToken);
    return result is not null;
}

public async Task<CreatedVideoSession> CreateAsync(RequestContext context, string counselorId, string studentId, CancellationToken cancellationToken = default)
{
    await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

    var id = Guid.NewGuid().ToString();
    var sessionName = $"formmaps-{System.Security.Cryptography.RandomNumberGenerator.GetHexString(16, lowercase: true)}";
    var start = Now();
    var end = start.AddHours(1);

    await using (var insert = Command(session, """
        INSERT INTO "counselor_sessions"
            ("id","counselorId","studentId","startTime","endTime","status","topic","notes",
             "counselorNotes","meetingLink","calendarEventIds","cancellationReason","isActive",
             "createdDate","updatedAt")
        VALUES (@id,@cid,@sid,@start,@end,'video_active','Video Call','','',@link,'{}'::jsonb,'',true,@start,@start)
        """))
    {
        AddParameter(insert, "id", id);
        AddParameter(insert, "cid", counselorId);
        AddParameter(insert, "sid", studentId);
        AddTimestamp(insert, "start", start);
        AddTimestamp(insert, "end", end);
        AddParameter(insert, "link", sessionName);
        await insert.ExecuteNonQueryAsync(cancellationToken);
    }

    await session.CommitAsync(cancellationToken);
    return new CreatedVideoSession(id, sessionName, IsoZ(start));
}

public async Task<SessionMutationOutcomeKind> EndAsync(RequestContext context, string sessionId, string callerId, CancellationToken cancellationToken = default)
{
    await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

    var participants = await LoadParticipantsAsync(session, sessionId, cancellationToken);
    if (participants is null)
    {
        return SessionMutationOutcomeKind.NotFound;
    }

    if (participants.Value.CounselorId != callerId && participants.Value.StudentId != callerId)
    {
        return SessionMutationOutcomeKind.Forbidden;
    }

    var now = Now();
    await using (var update = Command(session, """
        UPDATE "counselor_sessions"
        SET "status" = 'completed', "completedAt" = @now, "endTime" = @now, "updatedAt" = @now
        WHERE "id" = @id
        """))
    {
        AddTimestamp(update, "now", now);
        AddParameter(update, "id", sessionId);
        await update.ExecuteNonQueryAsync(cancellationToken);
    }

    await session.CommitAsync(cancellationToken);
    return SessionMutationOutcomeKind.Ok;
}

public async Task<(SessionMutationOutcomeKind Kind, string? SessionName)> StartAsync(
    RequestContext context, string sessionId, string callerId, CancellationToken cancellationToken = default)
{
    await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

    string status, meetingLink, counselorId, studentId;
    await using (var lookup = Command(session,
        """SELECT "status","meetingLink","counselorId","studentId" FROM "counselor_sessions" WHERE "id" = @id"""))
    {
        AddParameter(lookup, "id", sessionId);
        await using var reader = await lookup.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return (SessionMutationOutcomeKind.NotFound, null);
        }

        status = reader.GetString(0);
        meetingLink = reader.GetString(1);
        counselorId = reader.GetString(2);
        studentId = reader.GetString(3);
    }

    if (counselorId != callerId && studentId != callerId)
    {
        return (SessionMutationOutcomeKind.Forbidden, null);
    }

    if (status != "scheduled")
    {
        return (SessionMutationOutcomeKind.NotScheduled, null);
    }

    var now = Now();
    await using (var update = Command(session, """
        UPDATE "counselor_sessions" SET "status" = 'video_active', "startTime" = @now, "updatedAt" = @now
        WHERE "id" = @id
        """))
    {
        AddTimestamp(update, "now", now);
        AddParameter(update, "id", sessionId);
        await update.ExecuteNonQueryAsync(cancellationToken);
    }

    await session.CommitAsync(cancellationToken);
    return (SessionMutationOutcomeKind.Ok, meetingLink);
}

private static async Task<(string CounselorId, string StudentId)?> LoadParticipantsAsync(
    FormMapsDatabaseSession session, string sessionId, CancellationToken cancellationToken)
{
    await using var lookup = Command(session, """SELECT "counselorId","studentId" FROM "counselor_sessions" WHERE "id" = @id""");
    AddParameter(lookup, "id", sessionId);
    await using var reader = await lookup.ExecuteReaderAsync(cancellationToken);
    return await reader.ReadAsync(cancellationToken) ? (reader.GetString(0), reader.GetString(1)) : null;
}

private static void AddTimestamp(DbCommand command, string name, DateTime value)
{
    var parameter = command.CreateParameter();
    parameter.ParameterName = name;
    parameter.DbType = DbType.DateTime2;
    parameter.Value = value;
    command.Parameters.Add(parameter);
}
```

- [ ] **Step 2: Register in DI**

```csharp
// services/api/src/FormMaps.Infrastructure/DependencyInjection.cs
// Add the using near the other FormMaps.Application.* usings:
using FormMaps.Application.Video;
// ...and near the other FormMaps.Infrastructure.* usings:
using FormMaps.Infrastructure.Video;

// Add the registration right after the existing CounselorSessions/CounselorNotes lines:
// Domain 7a: video-call sessions (FM-091..097 — routes/video.ts, 7 of 9 endpoints; schedule/cancel stay
// Node for their calendar-sync side effect).
services.AddScoped<IVideoSessionsRepository, VideoSessionsRepository>();
```

- [ ] **Step 3: Add write-side tests**

```csharp
// Append to services/api/tests/FormMaps.IntegrationTests/Video/VideoSessionsRepositoryTests.cs, inside the class:

[Fact]
public async Task Create_stamps_video_active_1hr_window_and_random_link()
{
    await using var conn = await _dataSource.OpenConnectionAsync();
    await User(conn, "c1", "Coach"); await User(conn, "s1", "Alice");

    var created = await Repo().CreateAsync(Ctx(), "c1", "s1");

    Assert.StartsWith("formmaps-", created.SessionName);
    Assert.Equal(32 + "formmaps-".Length, created.SessionName.Length); // 16 bytes → 32 hex chars

    var row = await Repo().GetByIdAsync(Ctx(), created.Id);
    Assert.Equal("video_active", row!.Status);
    Assert.Equal("Video Call", row.Topic);
}

[Fact]
public async Task End_not_found_forbidden_then_ok()
{
    await using var conn = await _dataSource.OpenConnectionAsync();
    await User(conn, "c1", "Coach"); await User(conn, "s1", "Alice");
    await Session(conn, "sess", "c1", "s1", status: "video_active");

    Assert.Equal(SessionMutationOutcomeKind.NotFound, await Repo().EndAsync(Ctx(), "nope", "c1"));
    Assert.Equal(SessionMutationOutcomeKind.Forbidden, await Repo().EndAsync(Ctx(), "sess", "stranger"));
    Assert.Equal(SessionMutationOutcomeKind.Ok, await Repo().EndAsync(Ctx(), "sess", "c1"));

    var row = await Repo().GetByIdAsync(Ctx(), "sess");
    Assert.Equal("completed", row!.Status);
    Assert.NotNull(row.CompletedAt);
}

[Fact]
public async Task Start_not_found_forbidden_not_scheduled_then_ok()
{
    await using var conn = await _dataSource.OpenConnectionAsync();
    await User(conn, "c1", "Coach"); await User(conn, "s1", "Alice");
    await Session(conn, "sess", "c1", "s1", status: "scheduled", meetingLink: "room-z");
    await Session(conn, "active", "c1", "s1", status: "video_active");

    Assert.Equal(SessionMutationOutcomeKind.NotFound, (await Repo().StartAsync(Ctx(), "nope", "c1")).Kind);
    Assert.Equal(SessionMutationOutcomeKind.Forbidden, (await Repo().StartAsync(Ctx(), "sess", "stranger")).Kind);
    Assert.Equal(SessionMutationOutcomeKind.NotScheduled, (await Repo().StartAsync(Ctx(), "active", "c1")).Kind);

    var (kind, sessionName) = await Repo().StartAsync(Ctx(), "sess", "c1");
    Assert.Equal(SessionMutationOutcomeKind.Ok, kind);
    Assert.Equal("room-z", sessionName);
    Assert.Equal("video_active", (await Repo().GetByIdAsync(Ctx(), "sess"))!.Status);
}

[Fact]
public async Task FindParticipantCandidate_and_assignment_check()
{
    await using var conn = await _dataSource.OpenConnectionAsync();
    await User(conn, "s1", "Alice");
    await using (var cmd = new NpgsqlCommand(
        """INSERT INTO "counselor_student_assignments" ("id","counselorId","studentId","isActive") VALUES (gen_random_uuid()::text,'c1','s1',true)""", conn))
    {
        await cmd.ExecuteNonQueryAsync();
    }

    var candidate = await Repo().FindParticipantCandidateAsync(Ctx(), "s1");
    Assert.Equal("Alice", candidate!.Name);
    Assert.Null(await Repo().FindParticipantCandidateAsync(Ctx(), "missing"));

    Assert.True(await Repo().HasActiveCounselorAssignmentAsync(Ctx(), "c1", "s1"));
    Assert.False(await Repo().HasActiveCounselorAssignmentAsync(Ctx(), "c1", "someone-else"));
}
```

- [ ] **Step 4: Run all Video repository tests**

Run: `dotnet test services/api/tests/FormMaps.IntegrationTests --filter "FullyQualifiedName~VideoSessionsRepositoryTests"`
Expected: all 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add services/api/src/FormMaps.Infrastructure/Video/VideoSessionsRepository.cs services/api/src/FormMaps.Infrastructure/DependencyInjection.cs services/api/tests/FormMaps.IntegrationTests/Video/VideoSessionsRepositoryTests.cs
git commit -m "feat(video): implement IVideoSessionsRepository write-side + DI registration (FM-094..097)"
```

---

### Task 3: `IDailyClient` + `DailyClient` (Daily.co REST wrapper)

**Files:**
- Create: `services/api/src/FormMaps.Application/Video/IDailyClient.cs`
- Create: `services/api/src/FormMaps.Infrastructure/Video/DailyClient.cs`
- Modify: `services/api/src/FormMaps.Infrastructure/DependencyInjection.cs`
- Test: `services/api/tests/FormMaps.UnitTests/Video/DailyClientTests.cs`

**Interfaces:**
- Produces (used by Task 4):
  - `interface IDailyClient { bool IsConfigured { get; } Task<string> EnsureRoomUrlAsync(string roomName, CancellationToken ct = default); Task<string?> CreateMeetingTokenAsync(string roomName, string userId, string userName, bool isOwner, CancellationToken ct = default); }`

- [ ] **Step 1: Write the interface**

```csharp
// services/api/src/FormMaps.Application/Video/IDailyClient.cs
namespace FormMaps.Application.Video;

/// <summary>
/// Thin wrapper over the two Daily.co REST calls routes/video.ts's POST /signature makes. The first
/// (video calling is NOT globally on/off gated by whether the key is set — see Task 4) call MUST NEVER
/// throw: legacy wraps room creation in a try/catch that swallows BOTH the "already exists" API error
/// AND any network failure, falling back to a deterministic room URL either way. The second call has NO
/// such guard in legacy — a transport failure there is expected to bubble up to a generic 500.
/// </summary>
public interface IDailyClient
{
    /// <summary>False when DAILY_API_KEY is unset/blank — callers must check this BEFORE calling either
    /// method below and return 503 "Video calling is not configured" if false (matches legacy exactly).</summary>
    bool IsConfigured { get; }

    /// <summary>Idempotent room creation. Never throws.</summary>
    Task<string> EnsureRoomUrlAsync(string roomName, CancellationToken cancellationToken = default);

    /// <summary>May throw on transport failure — deliberately unguarded, matching legacy. Returns null if
    /// Daily.co's response has no "token" field (caller maps this to 502).</summary>
    Task<string?> CreateMeetingTokenAsync(
        string roomName, string userId, string userName, bool isOwner, CancellationToken cancellationToken = default);
}
```

- [ ] **Step 2: Run a build to confirm the interface compiles standalone**

Run: `dotnet build services/api/src/FormMaps.Application/FormMaps.Application.csproj`
Expected: builds clean.

- [ ] **Step 3: Implement `DailyClient`**

```csharp
// services/api/src/FormMaps.Infrastructure/Video/DailyClient.cs
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using FormMaps.Application.Video;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace FormMaps.Infrastructure.Video;

public sealed class DailyClient(
    HttpClient httpClient, IConfiguration configuration, TimeProvider timeProvider, ILogger<DailyClient> logger)
    : IDailyClient
{
    private string? ApiKey => configuration["DAILY_API_KEY"];

    public bool IsConfigured => !string.IsNullOrWhiteSpace(ApiKey);

    public async Task<string> EnsureRoomUrlAsync(string roomName, CancellationToken cancellationToken = default)
    {
        var fallbackUrl = $"https://formmaps.daily.co/{roomName}";
        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Post, "rooms/")
            {
                Content = JsonContent.Create(new
                {
                    name = roomName,
                    privacy = "private",
                    properties = new
                    {
                        exp = timeProvider.GetUtcNow().ToUnixTimeSeconds() + 7200,
                        enable_chat = true,
                        enable_screenshare = true,
                        start_audio_off = false,
                        start_video_off = false,
                        max_participants = 10,
                    },
                }),
            };
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", ApiKey);

            using var response = await httpClient.SendAsync(request, cancellationToken);
            var payload = await response.Content.ReadFromJsonAsync<JsonElement>(cancellationToken: cancellationToken);

            if (payload.TryGetProperty("error", out _)
                && payload.TryGetProperty("info", out var info)
                && info.ValueKind == JsonValueKind.String
                && (info.GetString() ?? string.Empty).Contains("already exists", StringComparison.Ordinal))
            {
                return fallbackUrl;
            }

            return payload.TryGetProperty("url", out var url) && url.ValueKind == JsonValueKind.String
                ? url.GetString()!
                : fallbackUrl;
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or JsonException)
        {
            logger.LogWarning(ex, "Daily.co room creation failed for {RoomName}; falling back to deterministic URL", roomName);
            return fallbackUrl;
        }
    }

    public async Task<string?> CreateMeetingTokenAsync(
        string roomName, string userId, string userName, bool isOwner, CancellationToken cancellationToken = default)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, "meeting-tokens")
        {
            Content = JsonContent.Create(new
            {
                properties = new
                {
                    room_name = roomName,
                    user_name = userName,
                    user_id = userId,
                    is_owner = isOwner,
                    exp = timeProvider.GetUtcNow().ToUnixTimeSeconds() + 7200,
                },
            }),
        };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", ApiKey);

        using var response = await httpClient.SendAsync(request, cancellationToken); // deliberately unguarded
        var payload = await response.Content.ReadFromJsonAsync<JsonElement>(cancellationToken: cancellationToken);
        return payload.TryGetProperty("token", out var token) && token.ValueKind == JsonValueKind.String
            ? token.GetString()
            : null;
    }
}
```

- [ ] **Step 4: Register the typed HttpClient in DI**

```csharp
// services/api/src/FormMaps.Infrastructure/DependencyInjection.cs
// Add the using: using FormMaps.Infrastructure.Video; (already added in Task 2)

// Domain 7a: Daily.co video-provider client (FM-094). First HttpClient-based external integration in
// this codebase — 15s timeout matches legacy's AbortSignal.timeout(15000).
services.AddHttpClient<IDailyClient, DailyClient>(client =>
{
    client.BaseAddress = new Uri("https://api.daily.co/v1/");
    client.Timeout = TimeSpan.FromSeconds(15);
});
```

- [ ] **Step 5: Write unit tests with a hand-rolled fake `HttpMessageHandler`**

```csharp
// services/api/tests/FormMaps.UnitTests/Video/DailyClientTests.cs
using System.Net;
using System.Text;
using FormMaps.Infrastructure.Video;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;

namespace FormMaps.UnitTests.Video;

public sealed class DailyClientTests
{
    [Fact]
    public void IsConfigured_reflects_DAILY_API_KEY()
    {
        Assert.True(Client(apiKey: "key-123").IsConfigured);
        Assert.False(Client(apiKey: null).IsConfigured);
        Assert.False(Client(apiKey: "   ").IsConfigured);
    }

    [Fact]
    public async Task EnsureRoomUrl_returns_daily_url_on_success()
    {
        var handler = new FakeHandler(_ => Json("""{"url":"https://formmaps.daily.co/real-room"}"""));
        var client = Client(apiKey: "key", handler);

        Assert.Equal("https://formmaps.daily.co/real-room", await client.EnsureRoomUrlAsync("real-room"));
    }

    [Fact]
    public async Task EnsureRoomUrl_falls_back_on_already_exists_error()
    {
        var handler = new FakeHandler(_ => Json("""{"error":"invalid-request-error","info":"a room with name room-x already exists"}"""));
        var client = Client(apiKey: "key", handler);

        Assert.Equal("https://formmaps.daily.co/room-x", await client.EnsureRoomUrlAsync("room-x"));
    }

    [Fact]
    public async Task EnsureRoomUrl_falls_back_on_transport_failure()
    {
        var handler = new FakeHandler(_ => throw new HttpRequestException("boom"));
        var client = Client(apiKey: "key", handler);

        Assert.Equal("https://formmaps.daily.co/room-x", await client.EnsureRoomUrlAsync("room-x"));
    }

    [Fact]
    public async Task CreateMeetingToken_returns_token_or_null()
    {
        var withToken = Client(apiKey: "key", new FakeHandler(_ => Json("""{"token":"abc123"}""")));
        Assert.Equal("abc123", await withToken.CreateMeetingTokenAsync("room", "u1", "Name", isOwner: true));

        var withoutToken = Client(apiKey: "key", new FakeHandler(_ => Json("""{}""")));
        Assert.Null(await withoutToken.CreateMeetingTokenAsync("room", "u1", "Name", isOwner: true));
    }

    [Fact]
    public async Task CreateMeetingToken_propagates_transport_failure()
    {
        var client = Client(apiKey: "key", new FakeHandler(_ => throw new HttpRequestException("boom")));
        await Assert.ThrowsAsync<HttpRequestException>(() => client.CreateMeetingTokenAsync("room", "u1", "Name", true));
    }

    // ---- helpers ----

    private static DailyClient Client(string? apiKey, FakeHandler? handler = null)
    {
        var httpClient = new HttpClient(handler ?? new FakeHandler(_ => Json("{}"))) { BaseAddress = new Uri("https://api.daily.co/v1/") };
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(apiKey is null ? [] : new Dictionary<string, string?> { ["DAILY_API_KEY"] = apiKey })
            .Build();
        return new DailyClient(httpClient, configuration, TimeProvider.System, NullLogger<DailyClient>.Instance);
    }

    private static HttpResponseMessage Json(string body) =>
        new(HttpStatusCode.OK) { Content = new StringContent(body, Encoding.UTF8, "application/json") };

    private sealed class FakeHandler(Func<HttpRequestMessage, HttpResponseMessage> respond) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) =>
            Task.FromResult(respond(request));
    }
}
```

- [ ] **Step 6: Run the tests**

Run: `dotnet test services/api/tests/FormMaps.UnitTests --filter "FullyQualifiedName~DailyClientTests"`
Expected: all 6 tests PASS.

- [ ] **Step 7: Commit**

```bash
git add services/api/src/FormMaps.Application/Video/IDailyClient.cs services/api/src/FormMaps.Infrastructure/Video/DailyClient.cs services/api/src/FormMaps.Infrastructure/DependencyInjection.cs services/api/tests/FormMaps.UnitTests/Video
git commit -m "feat(video): add IDailyClient + DailyClient (FM-094)"
```

---

### Task 4: `VideoEndpoints.cs` — all 7 routes

**Files:**
- Create: `services/api/src/FormMaps.Api/Endpoints/VideoEndpoints.cs`
- Modify: `services/api/src/FormMaps.Api/Program.cs`
- Test: `services/api/tests/FormMaps.IntegrationTests/Video/VideoEndpointsTests.cs`

**Interfaces:**
- Consumes: everything from Tasks 1–3 (`IVideoSessionsRepository`, `IDailyClient`, their DTOs/enums).
- Produces: `MapVideoEndpoints(this IEndpointRouteBuilder app)` — called once from `Program.cs`.

- [ ] **Step 1: Write `VideoEndpoints.cs`**

```csharp
// services/api/src/FormMaps.Api/Endpoints/VideoEndpoints.cs
using System.Text.Json;
using FormMaps.Application.Auth;
using FormMaps.Application.Video;

namespace FormMaps.Api.Endpoints;

/// <summary>
/// Video calling (FM-091..097 — routes/video.ts, 7 of 9 endpoints under /api/v1/video). No RBAC
/// permission gate — RequireIdentity only, matching legacy's plain `authenticate` middleware. Flags:
/// FORMMAPS_ROUTE_VIDEO_ENABLED_TO_DOTNET (GET /enabled), FORMMAPS_ROUTE_VIDEO_SESSIONS_TO_DOTNET
/// (GET+POST /sessions — forced co-flip, same literal rewrite path), FORMMAPS_ROUTE_VIDEO_SESSION_DETAIL_TO_DOTNET
/// (GET /sessions/:id), FORMMAPS_ROUTE_VIDEO_SIGNATURE_TO_DOTNET (POST /signature),
/// FORMMAPS_ROUTE_VIDEO_SESSION_LIFECYCLE_TO_DOTNET (POST /sessions/:id/end + /start).
/// POST /sessions/schedule and POST /sessions/:id/cancel are NOT ported (calendar-sync side effect stays
/// Node — see the Domain 7a design spec).
/// </summary>
public static class VideoEndpoints
{
    private static readonly JsonElement EmptyObject = JsonDocument.Parse("{}").RootElement.Clone();
    private static readonly string[] StaffRoles = ["counselor", "school_admin", "Super Admin"];

    public static IEndpointRouteBuilder MapVideoEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/video").WithTags("Video");
        group.MapGet("/enabled", GetEnabledAsync);
        group.MapGet("/sessions", ListSessionsAsync);
        group.MapGet("/sessions/{id}", GetSessionAsync);
        group.MapPost("/signature", CreateSignatureAsync);
        group.MapPost("/sessions", CreateSessionAsync);
        group.MapPost("/sessions/{id}/end", EndSessionAsync);
        group.MapPost("/sessions/{id}/start", StartSessionAsync);
        return app;
    }

    private static async Task<IResult> GetEnabledAsync(
        IRequestContextAccessor accessor, IProtectedRequestGuard guard, IVideoSessionsRepository repository,
        CancellationToken cancellationToken)
    {
        var (context, error) = Authorize(accessor, guard);
        if (error is not null) return error;

        var schoolId = context.Tenant?.SchoolId;
        var enabled = schoolId is not null && await repository.IsVideoEnabledForSchoolAsync(context, schoolId, cancellationToken);
        return Results.Ok(new { success = true, data = new { enabled } });
    }

    private static async Task<IResult> ListSessionsAsync(
        IRequestContextAccessor accessor, IProtectedRequestGuard guard, IVideoSessionsRepository repository,
        CancellationToken cancellationToken)
    {
        var (context, error) = Authorize(accessor, guard);
        if (error is not null) return error;

        var rows = await repository.ListForUserAsync(context, context.Tenant!.UserId, cancellationToken);
        return Results.Ok(new { success = true, data = rows.Select(ListJson) });
    }

    private static async Task<IResult> GetSessionAsync(
        IRequestContextAccessor accessor, IProtectedRequestGuard guard, IVideoSessionsRepository repository,
        string id, CancellationToken cancellationToken)
    {
        var (context, error) = Authorize(accessor, guard);
        if (error is not null) return error;

        var row = await repository.GetByIdAsync(context, id, cancellationToken);
        if (row is null) return NotFound("Session not found");
        if (!IsParticipant(row, context.Tenant!.UserId)) return Forbidden("Access denied");

        return Results.Ok(new { success = true, data = DetailJson(row) });
    }

    private static async Task<IResult> CreateSignatureAsync(
        HttpContext http, IRequestContextAccessor accessor, IProtectedRequestGuard guard,
        IVideoSessionsRepository repository, IDailyClient dailyClient, CancellationToken cancellationToken)
    {
        var (context, error) = Authorize(accessor, guard);
        if (error is not null) return error;

        if (!dailyClient.IsConfigured)
        {
            return Results.Json(new { success = false, message = "Video calling is not configured" }, statusCode: StatusCodes.Status503ServiceUnavailable);
        }

        var body = await ReadBodyAsync(http, cancellationToken);
        if (body is null) return InternalError();

        var sessionName = GetTrimmedString(body.Value, "sessionName");
        if (sessionName is null or { Length: 0 } or { Length: > 200 })
        {
            return BadRequest("sessionName is required");
        }

        var schoolId = context.Tenant?.SchoolId;
        if (schoolId is not null && !await repository.IsVideoEnabledForSchoolAsync(context, schoolId, cancellationToken))
        {
            return Forbidden("Video calls are not enabled for your school");
        }

        var videoSession = await repository.FindByRoomNameAsync(context, sessionName, cancellationToken);
        if (videoSession is null) return NotFound("Session not found");

        var userId = context.Tenant!.UserId;
        if (!IsParticipant(videoSession, userId)) return Forbidden("Access denied");

        var isOwner = videoSession.CounselorId == userId;
        var roomUrl = await dailyClient.EnsureRoomUrlAsync(sessionName, cancellationToken);
        var token = await dailyClient.CreateMeetingTokenAsync(
            sessionName, userId, context.Actor?.Name ?? "Participant", isOwner, cancellationToken);

        if (token is null)
        {
            return Results.Json(new { success = false, message = "Failed to generate video token" }, statusCode: StatusCodes.Status502BadGateway);
        }

        return Results.Ok(new { success = true, data = new { signature = token, roomUrl, roomName = sessionName } });
    }

    private static async Task<IResult> CreateSessionAsync(
        HttpContext http, IRequestContextAccessor accessor, IProtectedRequestGuard guard,
        IVideoSessionsRepository repository, CancellationToken cancellationToken)
    {
        var (context, error) = Authorize(accessor, guard);
        if (error is not null) return error;

        var body = await ReadBodyAsync(http, cancellationToken);
        if (body is null) return InternalError();

        var participantId = GetTrimmedString(body.Value, "participantId");
        if (string.IsNullOrEmpty(participantId)) return BadRequest("participantId is required");

        var schoolId = context.Tenant?.SchoolId;
        if (schoolId is not null && !await repository.IsVideoEnabledForSchoolAsync(context, schoolId, cancellationToken))
        {
            return Forbidden("Video calls are not enabled for your school");
        }

        var participant = await repository.FindParticipantCandidateAsync(context, participantId, cancellationToken);
        if (participant is null) return NotFound("Participant not found");

        var role = context.Actor?.NormalizedRole ?? "student";
        if (!StaffRoles.Contains(role))
        {
            return Forbidden("Only staff can initiate video calls");
        }

        var isSuperAdmin = role == "Super Admin";
        if (!isSuperAdmin && (schoolId is null || participant.SchoolId != schoolId))
        {
            return NotFound("Participant not found");
        }

        if (role == "counselor" && !await repository.HasActiveCounselorAssignmentAsync(context, context.Tenant!.UserId, participantId, cancellationToken))
        {
            return NotFound("Not found");
        }

        var callerId = context.Tenant!.UserId;
        var created = await repository.CreateAsync(context, callerId, participantId, cancellationToken);

        return Results.Json(new
        {
            success = true,
            data = new
            {
                id = created.Id,
                sessionName = created.SessionName,
                participant = new { id = participant.Id, name = participant.Name },
                caller = new { id = callerId, name = context.Actor?.Name },
                startTime = created.StartTime,
            },
        }, statusCode: StatusCodes.Status201Created);
    }

    private static async Task<IResult> EndSessionAsync(
        IRequestContextAccessor accessor, IProtectedRequestGuard guard, IVideoSessionsRepository repository,
        string id, CancellationToken cancellationToken)
    {
        var (context, error) = Authorize(accessor, guard);
        if (error is not null) return error;

        var outcome = await repository.EndAsync(context, id, context.Tenant!.UserId, cancellationToken);
        return outcome switch
        {
            SessionMutationOutcomeKind.NotFound => NotFound("Session not found"),
            SessionMutationOutcomeKind.Forbidden => Forbidden("Access denied"),
            _ => Results.Ok(new { success = true, data = new { id, status = "completed" } }),
        };
    }

    private static async Task<IResult> StartSessionAsync(
        IRequestContextAccessor accessor, IProtectedRequestGuard guard, IVideoSessionsRepository repository,
        string id, CancellationToken cancellationToken)
    {
        var (context, error) = Authorize(accessor, guard);
        if (error is not null) return error;

        var (kind, sessionName) = await repository.StartAsync(context, id, context.Tenant!.UserId, cancellationToken);
        return kind switch
        {
            SessionMutationOutcomeKind.NotFound => NotFound("Session not found"),
            SessionMutationOutcomeKind.Forbidden => Forbidden("Access denied"),
            SessionMutationOutcomeKind.NotScheduled => BadRequest("Session is not in scheduled state"),
            _ => Results.Ok(new { success = true, data = new { id, status = "video_active", sessionName } }),
        };
    }

    // ---- shared helpers ----

    private static bool IsParticipant(VideoSessionRow row, string userId) =>
        row.CounselorId == userId || row.StudentId == userId;

    private static object ListJson(VideoSessionRow s) => new
    {
        id = s.Id,
        sessionName = s.SessionName,
        status = s.Status,
        caller = new { id = s.CounselorId, name = s.CounselorName, email = s.CounselorEmail },
        participant = new { id = s.StudentId, name = s.StudentName, email = s.StudentEmail },
        startTime = s.StartTime,
        endTime = s.EndTime,
        completedAt = s.CompletedAt,
        topic = s.Topic,
        notes = s.Notes,
    };

    private static object DetailJson(VideoSessionRow s) => new
    {
        id = s.Id,
        sessionName = s.SessionName,
        status = s.Status,
        caller = new { id = s.CounselorId, name = s.CounselorName, email = s.CounselorEmail },
        participant = new { id = s.StudentId, name = s.StudentName, email = s.StudentEmail },
        startTime = s.StartTime,
        endTime = s.EndTime,
    };

    private static string? GetTrimmedString(JsonElement body, string property) =>
        body.TryGetProperty(property, out var value) && value.ValueKind == JsonValueKind.String
            ? value.GetString()
            : null;

    private static async Task<JsonElement?> ReadBodyAsync(HttpContext http, CancellationToken cancellationToken)
    {
        using var reader = new StreamReader(http.Request.Body);
        var raw = await reader.ReadToEndAsync(cancellationToken);
        if (string.IsNullOrWhiteSpace(raw)) return EmptyObject;

        try
        {
            using var document = JsonDocument.Parse(raw);
            return document.RootElement.ValueKind is JsonValueKind.Object or JsonValueKind.Array
                ? document.RootElement.Clone()
                : null;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static (RequestContext Context, IResult? Error) Authorize(IRequestContextAccessor accessor, IProtectedRequestGuard guard)
    {
        var context = accessor.Current;
        var decision = guard.RequireIdentity(context);
        return decision.Allowed
            ? (context, null)
            : (context, Results.Json(new { success = false, code = decision.Code, message = decision.Message }, statusCode: decision.StatusCode));
    }

    private static IResult NotFound(string message) => Results.Json(new { success = false, message }, statusCode: StatusCodes.Status404NotFound);
    private static IResult Forbidden(string message) => Results.Json(new { success = false, message }, statusCode: StatusCodes.Status403Forbidden);
    private static IResult BadRequest(string message) => Results.Json(new { success = false, message }, statusCode: StatusCodes.Status400BadRequest);
    private static IResult InternalError() => Results.Json(new { success = false, message = "Internal server error" }, statusCode: StatusCodes.Status500InternalServerError);
}
```

**A note on `POST /sessions`'s check order:** this plan puts the school-`videoCallsEnabled` check BEFORE the participant lookup, matching legacy's exact ordering (`video.ts` lines ~202–219). Do not reorder — the response codes at each step (403 vs. 404) depend on it being exactly this sequence.

- [ ] **Step 2: Register the endpoint group in `Program.cs`**

```csharp
// services/api/src/FormMaps.Api/Program.cs — add near app.MapCounselorSessionsEndpoints():
app.MapVideoEndpoints();
```

- [ ] **Step 3: Run a build**

Run: `dotnet build services/api/src/FormMaps.Api/FormMaps.Api.csproj`
Expected: builds clean (0 errors).

- [ ] **Step 4: Write endpoint tests (faked repository + Daily client)**

```csharp
// services/api/tests/FormMaps.IntegrationTests/Video/VideoEndpointsTests.cs
using System.Net;
using System.Text;
using System.Text.Json;
using FormMaps.Api.Auth;
using FormMaps.Application.Auth;
using FormMaps.Application.Video;
using FormMaps.Domain.Auth;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace FormMaps.IntegrationTests.Video;

public class VideoEndpointsTests
{
    [Theory]
    [InlineData("/api/v1/video/enabled", "GET")]
    [InlineData("/api/v1/video/sessions", "GET")]
    [InlineData("/api/v1/video/sessions/s1", "GET")]
    [InlineData("/api/v1/video/signature", "POST")]
    [InlineData("/api/v1/video/sessions", "POST")]
    [InlineData("/api/v1/video/sessions/s1/end", "POST")]
    [InlineData("/api/v1/video/sessions/s1/start", "POST")]
    public async Task Anonymous_is_401(string path, string method)
    {
        using var factory = new Factory(new FakeRepo(), new FakeDaily());
        using var client = factory.CreateClient();
        var response = await client.SendAsync(new HttpRequestMessage(new HttpMethod(method), path));
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Get_session_not_found_then_forbidden_then_ok()
    {
        var repo = new FakeRepo();
        using var factory = new Factory(repo, new FakeDaily());
        using var client = factory.CreateClient();

        Assert.Equal(HttpStatusCode.NotFound, (await Send(client, HttpMethod.Get, "/api/v1/video/sessions/missing")).StatusCode);

        repo.Row = SampleRow("s1", counselorId: "someone-else", studentId: "another");
        Assert.Equal(HttpStatusCode.Forbidden, (await Send(client, HttpMethod.Get, "/api/v1/video/sessions/s1")).StatusCode);

        repo.Row = SampleRow("s1", counselorId: "caller-1", studentId: "another");
        var ok = await Send(client, HttpMethod.Get, "/api/v1/video/sessions/s1");
        Assert.Equal(HttpStatusCode.OK, ok.StatusCode);
        using var doc = JsonDocument.Parse(await ok.Content.ReadAsStringAsync());
        Assert.False(doc.RootElement.GetProperty("data").TryGetProperty("topic", out _)); // detail shape omits topic/notes/completedAt
    }

    [Fact]
    public async Task List_uses_full_row_shape()
    {
        var repo = new FakeRepo { Rows = [SampleRow("s1", "caller-1", "st1")] };
        using var factory = new Factory(repo, new FakeDaily());
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Get, "/api/v1/video/sessions");
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var row = doc.RootElement.GetProperty("data")[0];
        Assert.True(row.TryGetProperty("topic", out _));
        Assert.True(row.TryGetProperty("completedAt", out _));
    }

    [Fact]
    public async Task Signature_returns_503_when_daily_not_configured()
    {
        using var factory = new Factory(new FakeRepo(), new FakeDaily { Configured = false });
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Post, "/api/v1/video/signature", body: """{"sessionName":"room-x","role":0}""");
        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
    }

    [Fact]
    public async Task Signature_returns_502_when_no_token()
    {
        var repo = new FakeRepo { RoomLookup = SampleRow("s1", "caller-1", "st1", meetingLink: "room-x") };
        using var factory = new Factory(repo, new FakeDaily { Configured = true, Token = null });
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Post, "/api/v1/video/signature", body: """{"sessionName":"room-x","role":0}""");
        Assert.Equal(HttpStatusCode.BadGateway, response.StatusCode);
    }

    [Fact]
    public async Task Signature_happy_path()
    {
        var repo = new FakeRepo { RoomLookup = SampleRow("s1", "caller-1", "st1", meetingLink: "room-x") };
        using var factory = new Factory(repo, new FakeDaily { Configured = true, Token = "tok-1", RoomUrl = "https://formmaps.daily.co/room-x" });
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Post, "/api/v1/video/signature", body: """{"sessionName":"room-x","role":0}""");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("tok-1", doc.RootElement.GetProperty("data").GetProperty("signature").GetString());
    }

    [Fact]
    public async Task Create_session_role_gate_is_403_school_mismatch_is_404()
    {
        var repo = new FakeRepo { Participant = new VideoParticipantCandidate("p1", "Peer", "p@x.test", "school-1") };
        using var factory = new Factory(repo, new FakeDaily());
        using var client = factory.CreateClient();

        var studentAttempt = await Send(client, HttpMethod.Post, "/api/v1/video/sessions", body: """{"participantId":"p1"}""", role: FormMapsRoles.Student);
        Assert.Equal(HttpStatusCode.Forbidden, studentAttempt.StatusCode);

        var mismatched = await Send(client, HttpMethod.Post, "/api/v1/video/sessions", body: """{"participantId":"p1"}""", role: FormMapsRoles.Counselor, schoolId: "school-2");
        Assert.Equal(HttpStatusCode.NotFound, mismatched.StatusCode);
    }

    [Fact]
    public async Task Create_session_counselor_requires_active_assignment()
    {
        var repo = new FakeRepo { Participant = new VideoParticipantCandidate("p1", "Peer", "p@x.test", "school-1"), HasAssignment = false };
        using var factory = new Factory(repo, new FakeDaily());
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Post, "/api/v1/video/sessions", body: """{"participantId":"p1"}""", role: FormMapsRoles.Counselor, schoolId: "school-1");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Create_session_happy_path_is_201()
    {
        var repo = new FakeRepo
        {
            Participant = new VideoParticipantCandidate("p1", "Peer", "p@x.test", "school-1"),
            HasAssignment = true,
            Created = new CreatedVideoSession("new-id", "formmaps-abc", "2026-01-01T00:00:00.000Z"),
        };
        using var factory = new Factory(repo, new FakeDaily());
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Post, "/api/v1/video/sessions", body: """{"participantId":"p1"}""", role: FormMapsRoles.Counselor, schoolId: "school-1");
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
    }

    [Theory]
    [InlineData(SessionMutationOutcomeKind.NotFound, HttpStatusCode.NotFound)]
    [InlineData(SessionMutationOutcomeKind.Forbidden, HttpStatusCode.Forbidden)]
    [InlineData(SessionMutationOutcomeKind.Ok, HttpStatusCode.OK)]
    public async Task End_maps_outcome_to_status(SessionMutationOutcomeKind outcome, HttpStatusCode expected)
    {
        var repo = new FakeRepo { EndOutcome = outcome };
        using var factory = new Factory(repo, new FakeDaily());
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Post, "/api/v1/video/sessions/s1/end");
        Assert.Equal(expected, response.StatusCode);
    }

    [Theory]
    [InlineData(SessionMutationOutcomeKind.NotFound, HttpStatusCode.NotFound)]
    [InlineData(SessionMutationOutcomeKind.Forbidden, HttpStatusCode.Forbidden)]
    [InlineData(SessionMutationOutcomeKind.NotScheduled, HttpStatusCode.BadRequest)]
    [InlineData(SessionMutationOutcomeKind.Ok, HttpStatusCode.OK)]
    public async Task Start_maps_outcome_to_status(SessionMutationOutcomeKind outcome, HttpStatusCode expected)
    {
        var repo = new FakeRepo { StartOutcome = (outcome, outcome == SessionMutationOutcomeKind.Ok ? "room-1" : null) };
        using var factory = new Factory(repo, new FakeDaily());
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Post, "/api/v1/video/sessions/s1/start");
        Assert.Equal(expected, response.StatusCode);
    }

    // ---- helpers ----

    private static VideoSessionRow SampleRow(string id, string counselorId, string studentId, string meetingLink = "link") =>
        new(id, meetingLink, "video_active", "Video Call", "", "2026-01-01T00:00:00.000Z", "2026-01-01T01:00:00.000Z",
            null, counselorId, "Coach", "c@x.test", studentId, "Student", "s@x.test");

    private static Task<HttpResponseMessage> Send(
        HttpClient client, HttpMethod method, string path, string? body = null,
        string role = "counselor", string userId = "caller-1", string? schoolId = null)
    {
        var request = new HttpRequestMessage(method, path);
        request.Headers.Add(DevelopmentRequestContextFactory.UserIdHeader, userId);
        request.Headers.Add(DevelopmentRequestContextFactory.RoleHeader, role);
        request.Headers.Add(DevelopmentRequestContextFactory.EmailHeader, "caller@example.test");
        request.Headers.Add(DevelopmentRequestContextFactory.NameHeader, "Caller");
        if (schoolId is not null) request.Headers.Add("X-Test-School-Id", schoolId); // see Factory note below
        if (body is not null) request.Content = new StringContent(body, Encoding.UTF8, "application/json");
        return client.SendAsync(request);
    }

    private sealed class Factory(FakeRepo repo, FakeDaily daily) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(Environments.Development);
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<IVideoSessionsRepository>();
                services.AddSingleton<IVideoSessionsRepository>(repo);
                services.RemoveAll<IDailyClient>();
                services.AddSingleton<IDailyClient>(daily);
            });
        }
    }

    // NOTE: the exact mechanism for injecting a per-request test schoolId onto RequestContext.Tenant
    // depends on how DevelopmentRequestContextFactory is wired in this repo — check
    // services/api/src/FormMaps.Api/Auth/DevelopmentRequestContextFactory.cs for a school-id test header
    // (grep for "SchoolId" in that file) before assuming "X-Test-School-Id" above; adjust Send() to match
    // whatever header name that factory actually reads, mirroring how CounselorSessionsEndpointsTests
    // sets role/permissions via its own documented headers.

    private sealed class FakeRepo : IVideoSessionsRepository
    {
        public bool VideoEnabled { get; init; } = true;
        public VideoSessionRow? Row { get; set; }
        public IReadOnlyList<VideoSessionRow> Rows { get; set; } = [];
        public VideoSessionRow? RoomLookup { get; init; }
        public VideoParticipantCandidate? Participant { get; init; }
        public bool HasAssignment { get; init; }
        public CreatedVideoSession Created { get; init; } = new("id", "formmaps-x", "2026-01-01T00:00:00.000Z");
        public SessionMutationOutcomeKind EndOutcome { get; init; } = SessionMutationOutcomeKind.Ok;
        public (SessionMutationOutcomeKind Kind, string? SessionName) StartOutcome { get; init; } = (SessionMutationOutcomeKind.Ok, "room");

        public Task<bool> IsVideoEnabledForSchoolAsync(RequestContext context, string schoolId, CancellationToken ct = default) => Task.FromResult(VideoEnabled);
        public Task<IReadOnlyList<VideoSessionRow>> ListForUserAsync(RequestContext context, string userId, CancellationToken ct = default) => Task.FromResult(Rows);
        public Task<VideoSessionRow?> GetByIdAsync(RequestContext context, string sessionId, CancellationToken ct = default) => Task.FromResult(Row);
        public Task<VideoSessionRow?> FindByRoomNameAsync(RequestContext context, string roomName, CancellationToken ct = default) => Task.FromResult(RoomLookup);
        public Task<VideoParticipantCandidate?> FindParticipantCandidateAsync(RequestContext context, string userId, CancellationToken ct = default) => Task.FromResult(Participant);
        public Task<bool> HasActiveCounselorAssignmentAsync(RequestContext context, string counselorId, string studentId, CancellationToken ct = default) => Task.FromResult(HasAssignment);
        public Task<CreatedVideoSession> CreateAsync(RequestContext context, string counselorId, string studentId, CancellationToken ct = default) => Task.FromResult(Created);
        public Task<SessionMutationOutcomeKind> EndAsync(RequestContext context, string sessionId, string callerId, CancellationToken ct = default) => Task.FromResult(EndOutcome);
        public Task<(SessionMutationOutcomeKind Kind, string? SessionName)> StartAsync(RequestContext context, string sessionId, string callerId, CancellationToken ct = default) => Task.FromResult(StartOutcome);
    }

    private sealed class FakeDaily : IDailyClient
    {
        public bool Configured { get; init; } = true;
        public string? Token { get; init; } = "tok";
        public string RoomUrl { get; init; } = "https://formmaps.daily.co/room";

        public bool IsConfigured => Configured;
        public Task<string> EnsureRoomUrlAsync(string roomName, CancellationToken ct = default) => Task.FromResult(RoomUrl);
        public Task<string?> CreateMeetingTokenAsync(string roomName, string userId, string userName, bool isOwner, CancellationToken ct = default) => Task.FromResult(Token);
    }
}
```

- [ ] **Step 5: Run the tests**

Run: `dotnet test services/api/tests/FormMaps.IntegrationTests --filter "FullyQualifiedName~VideoEndpointsTests"`
Expected: all tests PASS. If the school-id test-header mechanism noted in Step 4 doesn't match this repo's actual `DevelopmentRequestContextFactory`, fix `Send()`'s header first (do not skip or delete the affected tests).

- [ ] **Step 6: Commit**

```bash
git add services/api/src/FormMaps.Api/Endpoints/VideoEndpoints.cs services/api/src/FormMaps.Api/Program.cs services/api/tests/FormMaps.IntegrationTests/Video/VideoEndpointsTests.cs
git commit -m "feat(video): add VideoEndpoints.cs (FM-091..097)"
```

---

### Task 5: Infra — `DAILY_API_KEY` secret wiring (staging + prod)

**Files:**
- Modify: `infra/aws/formmaps-api-staging-service.yml`
- Modify: `infra/aws/formmaps-api-prod-service.yml`

**Interfaces:** none (infra-only; no code dependency on this task from any other task — `DailyClient` already reads `configuration["DAILY_API_KEY"]`, which resolves from the environment either way).

- [ ] **Step 1: Add the parameter + secret wiring to the staging template**

```yaml
# infra/aws/formmaps-api-staging-service.yml — add to Parameters:, alongside JwtSecretArn/DatabaseUrlSecretArn:
  DailyApiKeySecretArn:
    Type: String
    NoEcho: true
    Description: >-
      Full ARN of the Secrets Manager secret containing DAILY_API_KEY (Domain 7a video calling).

# Add to AppRunnerInstanceRole's Policies[0].PolicyDocument.Statement[0].Resource, alongside the other two ARNs:
                  - !Ref DailyApiKeySecretArn

# Add to RuntimeEnvironmentSecrets, alongside JWT_SECRET/DATABASE_URL:
              - Name: DAILY_API_KEY
                Value: !Ref DailyApiKeySecretArn
```

- [ ] **Step 2: Apply the identical change to the prod template**

```yaml
# infra/aws/formmaps-api-prod-service.yml — same three edits, using the exact same block shapes as Step 1.
```

- [ ] **Step 3: Validate both templates**

Run: `aws cloudformation validate-template --template-body file://infra/aws/formmaps-api-staging-service.yml && aws cloudformation validate-template --template-body file://infra/aws/formmaps-api-prod-service.yml`
Expected: both return without error. (This validates syntax only — it does NOT deploy anything. No stack update, no secret creation, nothing reaches AWS beyond a template lint call.)

- [ ] **Step 4: Commit**

```bash
git add infra/aws/formmaps-api-staging-service.yml infra/aws/formmaps-api-prod-service.yml
git commit -m "feat(video): wire DAILY_API_KEY secret into App Runner staging+prod templates"
```

Creating the actual Secrets Manager secret + updating the live App Runner stacks is a deploy-time action, explicitly out of scope for this plan (no push/deploy per the Global Constraints) — flag this to Federico when push/deploy is later discussed.

---

### Task 6: Frontend rewrite wiring (`next.config.ts`)

**Files:**
- Modify: `../formmaps-platform/frontend/next.config.ts` (sibling repo — see [[reference-formmaps-migration-docs]] for the path)

**Interfaces:** none — pure transcription, no design decision (matches Phase F Track A's own characterization).

- [ ] **Step 1: Add the 5 flag functions**

```typescript
// frontend/next.config.ts — add near shouldRouteResumeOriginalToDotnet(), same file section:

// Video enabled check (Domain 7a, FM-091): GET /api/v1/video/enabled. Default OFF.
function shouldRouteVideoEnabledToDotnet() {
  return Boolean(dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_VIDEO_ENABLED_TO_DOTNET));
}

// Video sessions list + create (Domain 7a, FM-092/095): GET+POST /api/v1/video/sessions — forced
// co-flip, Next rewrites match path not method, same precedent as resume.ts's GET/POST /. Default OFF.
function shouldRouteVideoSessionsToDotnet() {
  return Boolean(dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_VIDEO_SESSIONS_TO_DOTNET));
}

// Video session detail (Domain 7a, FM-093): GET /api/v1/video/sessions/:id. Own path, own flag,
// independent from the list+create flag above. Default OFF.
function shouldRouteVideoSessionDetailToDotnet() {
  return Boolean(dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_VIDEO_SESSION_DETAIL_TO_DOTNET));
}

// Video Daily.co signature (Domain 7a, FM-094): POST /api/v1/video/signature — the actual external-call
// risk surface, isolated for independent rollback. Default OFF.
function shouldRouteVideoSignatureToDotnet() {
  return Boolean(dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_VIDEO_SIGNATURE_TO_DOTNET));
}

// Video session lifecycle (Domain 7a, FM-096/097): POST /api/v1/video/sessions/:id/end + /start.
// schedule/cancel are NOT included (calendar-sync side effect stays Node). Default OFF.
function shouldRouteVideoSessionLifecycleToDotnet() {
  return Boolean(dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_VIDEO_SESSION_LIFECYCLE_TO_DOTNET));
}
```

- [ ] **Step 2: Add the rewrite entries, ahead of the `/api/:path*` catch-all**

```typescript
// frontend/next.config.ts — add after the shouldRouteResumeOriginalToDotnet() rewrite block, still
// inside the array that's spread into `afterFiles` before the /api/:path* catch-all:

      ...(shouldRouteVideoEnabledToDotnet()
        ? [{ source: "/api/v1/video/enabled", destination: `${dotnetApiBaseUrl}/api/v1/video/enabled` }]
        : []),
      ...(shouldRouteVideoSessionsToDotnet()
        ? [{ source: "/api/v1/video/sessions", destination: `${dotnetApiBaseUrl}/api/v1/video/sessions` }]
        : []),
      ...(shouldRouteVideoSessionDetailToDotnet()
        ? [{ source: "/api/v1/video/sessions/:id", destination: `${dotnetApiBaseUrl}/api/v1/video/sessions/:id` }]
        : []),
      ...(shouldRouteVideoSignatureToDotnet()
        ? [{ source: "/api/v1/video/signature", destination: `${dotnetApiBaseUrl}/api/v1/video/signature` }]
        : []),
      ...(shouldRouteVideoSessionLifecycleToDotnet()
        ? [
            { source: "/api/v1/video/sessions/:id/end", destination: `${dotnetApiBaseUrl}/api/v1/video/sessions/:id/end` },
            { source: "/api/v1/video/sessions/:id/start", destination: `${dotnetApiBaseUrl}/api/v1/video/sessions/:id/start` },
          ]
        : []),
```

**Important — verify no collision with `/sessions/schedule` and `/sessions/:id/cancel`:** `shouldRouteVideoSessionDetailToDotnet()`'s source `/api/v1/video/sessions/:id` is a single dynamic segment. Confirm Next.js's rewrite matcher does NOT also match the literal 2-segment path `/sessions/:id/cancel` or the literal `/sessions/schedule` against this pattern (it shouldn't — `:id` matches exactly one path segment, not `schedule` followed by nothing extra, and not `:id/cancel` which has an extra segment) before running Step 3. This is the same reasoning `resume.ts`'s cross-user rewrite already relies on for its own single-segment `:id` pattern; unlike that route, Video's `/sessions/:id` needs no negative-lookahead exclusion because `schedule` is a sibling of `:id`'s parent segment, not a value `:id` could ever equal in a way that leaks into the unwanted 2-segment paths.

- [ ] **Step 3: Type-check the config**

Run: `cd ../formmaps-platform/frontend && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit** (in the `formmaps-platform` repo, `develop` branch)

```bash
cd ../formmaps-platform && git add frontend/next.config.ts && git commit -m "$(cat <<'EOF'
feat(video): add Domain 7a frontend rewrites (FM-091..097)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Adversarial access-control review

Not a TDD task — a review gate, matching Phase F Fork 1's own dedicated adversarial pass (per the Domain 7a spec's Testing section).

- [ ] **Step 1:** Dispatch a fresh-context review (via `superpowers:subagent-driven-development`'s own review stage, or a dedicated `code-reviewer` agent if running under `executing-plans`) against the full Video diff (Tasks 1–4), focused specifically on:
  - Every route's participant-only check (`IsParticipant`) — is there any path where a non-participant can read or mutate a session?
  - `POST /sessions`'s role/school/assignment gate chain — can a student or a counselor from another school reach `CreateAsync` under any input?
  - `POST /signature`'s participant check against the room-owning session, not some other session.
  - Cross-school isolation: does anything here trust a client-supplied schoolId instead of `context.Tenant?.SchoolId`?

- [ ] **Step 2:** Fix any confirmed finding as its own small commit (not folded into Tasks 1–4's commits) — same pattern Phase F used for its own review-driven fix wave.

- [ ] **Step 3:** Once clean, this plan is complete. Per the Global Constraints, do NOT push, open a PR, deploy, or flip any flag — report completion and stop.
