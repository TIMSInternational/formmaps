# Phase F — resume.ts Cross-User Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port `resume.ts`'s remaining 4 endpoints (`GET /:id`, `PUT /:resumeId`, `DELETE /:resumeId`, `GET /:id/original`) to `.NET`, dark behind two new flags, plus the frontend rewrites.

**Architecture:** Two new pure-logic files (`ResumeAccessResolution`, `ResumeUpdate`) hold the testable business rules; `IResumeRepository` gains 4 methods; a new endpoints file (`ResumeCrossUserEndpoints.cs`) wires them under `RequireIdentity` → `ISubscriptionGuard`; `IObjectStorage` gains a second presign method for existing keys.

**Tech Stack:** .NET minimal APIs, Npgsql (raw SQL, no ORM), xUnit + Testcontainers.Postgres, `WebApplicationFactory<Program>` for endpoint tests.

## Global Constraints

- `resumes` has **no RLS** — every query scopes `userId` in code, never via a tenant GUC.
- Ownership/access failures → **404**, never 403 (don't confirm existence to an unauthorized caller).
- Body validation happens **after** the ownership/access check (accepted "auth-before-body" 401/404-before-500 convention already used throughout this codebase).
- Unhandled exceptions → generic 500, never `err.Message` leaked.
- Every new flag defaults **OFF**. This plan produces **local commits only** — no push, no PR, no staging deploy, no flag flip.
- Timestamps written to Postgres: `DateTime` with `Kind=Unspecified`, millisecond-truncated (see `ResumeRepository.Now()` — reuse it, don't reinvent).

---

### Task 1: `IObjectStorage.GetPresignedReadUrlAsync` — presign an existing key

**Files:**
- Modify: `services/api/src/FormMaps.Application/Storage/IObjectStorage.cs`
- Modify: `services/api/src/FormMaps.Infrastructure/Storage/S3ObjectStorage.cs`

**Interfaces:**
- Produces: `Task<string> IObjectStorage.GetPresignedReadUrlAsync(string key, int ttlSeconds, bool inline, string contentType, CancellationToken ct = default)` — a presigned GET URL for a key that already exists in the bucket (as opposed to `UploadAndGetUrlAsync`, which uploads first). `inline: true` sets `ResponseContentDisposition = "inline"`; `inline: false` omits the override (defaults to whatever was set at upload time).

There is no existing unit-test file for `S3ObjectStorage` (confirmed — none exists in the repo today; it's exercised only indirectly through endpoint tests against a faked `IObjectStorage`). Don't invent a new S3-mocking convention here; Task 5's endpoint test covers this through a fake `IObjectStorage`.

- [ ] **Step 1: Add the method to the interface**

```csharp
// services/api/src/FormMaps.Application/Storage/IObjectStorage.cs — add inside the interface, after UploadAndGetUrlAsync:

/// <summary>
/// Presign a GET for a key that was stored at some earlier time (as opposed to <see cref="UploadAndGetUrlAsync"/>,
/// which uploads first). <paramref name="ttlSeconds"/> and <paramref name="inline"/> are caller-controlled —
/// unlike the fixed 24h/attachment shape of an upload-time presign, a read of an existing object may need a much
/// shorter TTL and an inline (browser-renderable) disposition, e.g. resume.ts's GET /:id/original (300s, inline,
/// application/pdf).
/// </summary>
Task<string> GetPresignedReadUrlAsync(
    string key, int ttlSeconds, bool inline, string contentType, CancellationToken cancellationToken = default);
```

- [ ] **Step 2: Implement it in `S3ObjectStorage`**

```csharp
// services/api/src/FormMaps.Infrastructure/Storage/S3ObjectStorage.cs — add as a new public method on the class:

public Task<string> GetPresignedReadUrlAsync(
    string key, int ttlSeconds, bool inline, string contentType, CancellationToken cancellationToken = default)
{
    var request = new GetPreSignedUrlRequest
    {
        BucketName = options.Bucket,
        Key = key,
        Verb = HttpVerb.GET,
        Expires = DateTime.UtcNow.AddSeconds(ttlSeconds),
        ResponseHeaderOverrides = { ContentType = contentType },
    };
    if (inline)
    {
        request.ResponseHeaderOverrides.ContentDisposition = "inline";
    }

    // Presigning is a local (offline) signing operation — no network call, same as UploadAndGetUrlAsync.
    return Task.FromResult(client.GetPreSignedURL(request));
}
```

- [ ] **Step 3: Build**

Run: `dotnet build services/api/src/FormMaps.Api/FormMaps.Api.csproj`
Expected: builds clean (0 errors).

- [ ] **Step 4: Commit**

```bash
git add services/api/src/FormMaps.Application/Storage/IObjectStorage.cs services/api/src/FormMaps.Infrastructure/Storage/S3ObjectStorage.cs
git commit -m "feat(resume): add IObjectStorage.GetPresignedReadUrlAsync for existing-key presigning"
```

---

### Task 2: `ResumeAccessResolution` — the GET /:id dual-mode target resolution (pure logic)

**Files:**
- Create: `services/api/src/FormMaps.Application/Resumes/ResumeAccessResolution.cs`
- Test: `services/api/tests/FormMaps.UnitTests/Resumes/ResumeAccessResolutionTests.cs`

**Interfaces:**
- Consumes: `RequestContext` (`FormMaps.Application.Auth`) — `context.Actor!.UserId`, `context.Actor!.Role` (raw string).
- Produces: `static string ResumeAccessResolution.ResolveTargetUserId(RequestContext caller, string? requestedId)` — the plain target user id to look up (mirrors legacy `resolveSecureUserId`'s pre-`canAccessUser` resolution: **non-privileged callers are always forced to their own id, `requestedId` is silently ignored**; privileged callers get `requestedId` resolved, or their own id if `requestedId` is null/empty/`"me"`). The caller (the endpoint) still runs `IUserAccessGuard.CanAccessUserAsync` afterward for the actual permission check — this method only resolves *which* id to check, it does not authorize anything itself.

```csharp
using FormMaps.Application.Auth;
using FormMaps.Domain.Auth;

namespace FormMaps.Application.Resumes;

/// <summary>
/// Pure port of the routes/resume.ts GET /:id fallback path's target-id resolution (lib/access.ts
/// resolveSecureUserId, the part BEFORE canAccessUser is called). A non-privileged caller is always resolved to
/// their own id — the requested id is silently ignored, a legacy quirk preserved as-is. A privileged caller
/// (Super Admin / school_admin / counselor, matched by RAW role string exactly like UserAccessGuard.CanAccessUserAsync
/// — intentionally duplicated here rather than shared, to keep this file a standalone pure function with no DB
/// dependency) gets requestedId resolved, defaulting to their own id when requestedId is null, empty, or "me".
/// </summary>
public static class ResumeAccessResolution
{
    public static string ResolveTargetUserId(RequestContext caller, string? requestedId)
    {
        var callerId = caller.Actor!.UserId;
        var rawRole = caller.Actor.Role;

        var isPrivileged =
            string.Equals(rawRole, FormMapsRoles.SuperAdmin, StringComparison.Ordinal) ||
            string.Equals(rawRole, FormMapsRoles.SchoolAdmin, StringComparison.Ordinal) ||
            string.Equals(rawRole, FormMapsRoles.Counselor, StringComparison.Ordinal);

        if (!isPrivileged)
        {
            return callerId;
        }

        if (string.IsNullOrEmpty(requestedId) || requestedId == "me")
        {
            return callerId;
        }

        return requestedId;
    }
}
```

- [ ] **Step 1: Write the failing tests**

```csharp
// services/api/tests/FormMaps.UnitTests/Resumes/ResumeAccessResolutionTests.cs
using FormMaps.Application.Auth;
using FormMaps.Application.Resumes;
using FormMaps.Domain.Auth;

namespace FormMaps.UnitTests.Resumes;

/// <summary>
/// Pure port of resume.ts GET /:id's fallback target-id resolution (lib/access.ts resolveSecureUserId, pre-canAccessUser).
/// </summary>
public sealed class ResumeAccessResolutionTests
{
    private static RequestContext Caller(string userId, string role) =>
        RequestContext.Authenticated(
            new RequestActor(userId, role, "u@e.st", "User"),
            schoolId: null,
            permissions: Array.Empty<string>(),
            tokenSource: TokenSource.DevelopmentHeader,
            isDevelopmentOverride: true);

    [Fact]
    public void Non_privileged_caller_is_always_forced_to_self_regardless_of_requested_id()
    {
        var caller = Caller("student-1", FormMapsRoles.Student);
        Assert.Equal("student-1", ResumeAccessResolution.ResolveTargetUserId(caller, "someone-else"));
    }

    [Fact]
    public void Non_privileged_caller_with_null_requested_id_resolves_to_self()
    {
        var caller = Caller("student-1", FormMapsRoles.Student);
        Assert.Equal("student-1", ResumeAccessResolution.ResolveTargetUserId(caller, null));
    }

    [Theory]
    [InlineData(FormMapsRoles.SuperAdmin)]
    [InlineData(FormMapsRoles.SchoolAdmin)]
    [InlineData(FormMapsRoles.Counselor)]
    public void Privileged_caller_gets_requested_id_resolved(string role)
    {
        var caller = Caller("admin-1", role);
        Assert.Equal("target-9", ResumeAccessResolution.ResolveTargetUserId(caller, "target-9"));
    }

    [Theory]
    [InlineData(FormMapsRoles.SuperAdmin)]
    [InlineData(FormMapsRoles.SchoolAdmin)]
    [InlineData(FormMapsRoles.Counselor)]
    public void Privileged_caller_with_null_or_me_resolves_to_self(string role)
    {
        var caller = Caller("admin-1", role);
        Assert.Equal("admin-1", ResumeAccessResolution.ResolveTargetUserId(caller, null));
        Assert.Equal("admin-1", ResumeAccessResolution.ResolveTargetUserId(caller, "me"));
    }

    [Fact]
    public void Privileged_caller_requesting_own_id_resolves_to_self()
    {
        var caller = Caller("admin-1", FormMapsRoles.SuperAdmin);
        Assert.Equal("admin-1", ResumeAccessResolution.ResolveTargetUserId(caller, "admin-1"));
    }
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `dotnet test services/api/tests/FormMaps.UnitTests --filter FullyQualifiedName~ResumeAccessResolutionTests`
Expected: FAIL — `ResumeAccessResolution` does not exist yet.

- [ ] **Step 3: Create `ResumeAccessResolution.cs`** with the exact code shown above (in the Interfaces block).

- [ ] **Step 4: Run to verify it passes**

Run: `dotnet test services/api/tests/FormMaps.UnitTests --filter FullyQualifiedName~ResumeAccessResolutionTests`
Expected: PASS, 5 tests (7 cases with Theory).

- [ ] **Step 5: Commit**

```bash
git add services/api/src/FormMaps.Application/Resumes/ResumeAccessResolution.cs services/api/tests/FormMaps.UnitTests/Resumes/ResumeAccessResolutionTests.cs
git commit -m "feat(resume): add ResumeAccessResolution (GET /:id dual-mode target resolution, pure logic)"
```

---

### Task 3: `ResumeUpdate` — PUT /:resumeId partial-field coalescing + documentEdits sanitizer (pure logic)

**Files:**
- Create: `services/api/src/FormMaps.Application/Resumes/ResumeUpdate.cs`
- Test: `services/api/tests/FormMaps.UnitTests/Resumes/ResumeUpdateTests.cs`

**Interfaces:**
- Consumes: `JsonElement body` (the raw parsed request body).
- Produces:
  - `static IReadOnlyDictionary<string, JsonElement> ResumeUpdate.ResolveFields(JsonElement body)` — only the whitelisted keys (`name, template, careerField, personalInfo, experience, education, skills, sections, fieldVisibility, customFields`) that are **present** in the body (legacy: `if (req.body[k] !== undefined) data[k] = req.body[k]`); a key absent from the body is absent from the result (no default substitution — this differs from `ResumeCreate`, which defaults missing fields; `PUT` only touches what's given).
  - `static string? ResumeUpdate.SanitizeDocumentEdits(JsonElement body)` — returns the sanitized `documentEdits` JSON (as a jsonb-ready string) if `documentEdits` is present in the body, else `null` (meaning: don't touch the column). Cap 1000 entries; drop non-object entries; clamp `orig`/`text` to 1000 chars (empty string if not a string); `page`/`runIndex` via `Number(e.page) || 0` (any non-finite/non-numeric → 0); drop entries where `page` or `runIndex` isn't a non-negative integer.

```csharp
using System.Text.Json;

namespace FormMaps.Application.Resumes;

/// <summary>
/// Pure port of PUT /api/resume/:resumeId's field-selection (routes/resume.ts L142-153): only body keys the
/// caller actually sent get written — no defaults, unlike POST's ResumeCreate. documentEdits is bounded
/// separately (sanitizeDocumentEdits, L125-139) — cap 1000 entries, clamp orig/text to 1000 chars, drop any entry
/// whose page/runIndex isn't a non-negative integer after JS Number() coercion (NaN/non-numeric → 0 via `|| 0`,
/// so a malformed page/runIndex silently becomes 0 rather than dropping the entry, UNLESS 0 itself still fails the
/// final Number.isInteger &amp;&amp; >= 0 check — it doesn't, 0 is valid, so `|| 0` effectively means "garbage
/// page/runIndex survives as 0", matching legacy exactly).
/// </summary>
public static class ResumeUpdate
{
    private static readonly string[] WhitelistedFields =
    [
        "name", "template", "careerField", "personalInfo", "experience",
        "education", "skills", "sections", "fieldVisibility", "customFields",
    ];

    public static IReadOnlyDictionary<string, JsonElement> ResolveFields(JsonElement body)
    {
        var result = new Dictionary<string, JsonElement>(StringComparer.Ordinal);
        if (body.ValueKind != JsonValueKind.Object)
        {
            return result;
        }

        foreach (var key in WhitelistedFields)
        {
            if (body.TryGetProperty(key, out var value))
            {
                result[key] = value.Clone();
            }
        }

        return result;
    }

    public static string? SanitizeDocumentEdits(JsonElement body)
    {
        if (body.ValueKind != JsonValueKind.Object || !body.TryGetProperty("documentEdits", out var raw))
        {
            return null;
        }

        var entries = new List<object>();
        if (raw.ValueKind == JsonValueKind.Array)
        {
            var count = 0;
            foreach (var element in raw.EnumerateArray())
            {
                if (count >= 1000) break;
                count++;

                if (element.ValueKind != JsonValueKind.Object) continue;

                var page = CoerceNumberOrZero(element, "page");
                var runIndex = CoerceNumberOrZero(element, "runIndex");
                var orig = CoerceStringClamped(element, "orig");
                var text = CoerceStringClamped(element, "text");

                if (page < 0 || runIndex < 0) continue; // Number.isInteger + >=0 gate; page/runIndex are always
                                                          // integers here since CoerceNumberOrZero truncates.

                entries.Add(new { page, runIndex, orig, text });
            }
        }

        return JsonSerializer.Serialize(entries);
    }

    private static int CoerceNumberOrZero(JsonElement element, string prop)
    {
        if (!element.TryGetProperty(prop, out var value)) return 0;
        return value.ValueKind == JsonValueKind.Number && value.TryGetInt32(out var i) ? i : 0;
    }

    private static string CoerceStringClamped(JsonElement element, string prop)
    {
        if (!element.TryGetProperty(prop, out var value) || value.ValueKind != JsonValueKind.String) return "";
        var s = value.GetString() ?? "";
        return s.Length > 1000 ? s[..1000] : s;
    }
}
```

- [ ] **Step 1: Write the failing tests**

```csharp
// services/api/tests/FormMaps.UnitTests/Resumes/ResumeUpdateTests.cs
using System.Text.Json;
using FormMaps.Application.Resumes;

namespace FormMaps.UnitTests.Resumes;

public sealed class ResumeUpdateTests
{
    private static JsonElement J(string json) => JsonDocument.Parse(json).RootElement.Clone();

    [Fact]
    public void ResolveFields_only_includes_keys_present_in_body()
    {
        var fields = ResumeUpdate.ResolveFields(J("""{"name":"New Name","unrelatedKey":"ignored"}"""));
        Assert.Single(fields);
        Assert.Equal("New Name", fields["name"].GetString());
    }

    [Fact]
    public void ResolveFields_empty_body_yields_no_fields()
    {
        Assert.Empty(ResumeUpdate.ResolveFields(J("{}")));
    }

    [Fact]
    public void ResolveFields_includes_all_ten_whitelisted_keys_when_present()
    {
        var body = J("""
            {"name":"n","template":"t","careerField":"c","personalInfo":{},"experience":[],
             "education":[],"skills":[],"sections":[],"fieldVisibility":{},"customFields":[]}
            """);
        Assert.Equal(10, ResumeUpdate.ResolveFields(body).Count);
    }

    [Fact]
    public void SanitizeDocumentEdits_absent_key_returns_null()
    {
        Assert.Null(ResumeUpdate.SanitizeDocumentEdits(J("{}")));
    }

    [Fact]
    public void SanitizeDocumentEdits_valid_entries_pass_through()
    {
        var result = ResumeUpdate.SanitizeDocumentEdits(
            J("""{"documentEdits":[{"page":1,"runIndex":2,"orig":"a","text":"b"}]}"""));
        using var doc = JsonDocument.Parse(result!);
        var entry = doc.RootElement[0];
        Assert.Equal(1, entry.GetProperty("page").GetInt32());
        Assert.Equal(2, entry.GetProperty("runIndex").GetInt32());
        Assert.Equal("a", entry.GetProperty("orig").GetString());
        Assert.Equal("b", entry.GetProperty("text").GetString());
    }

    [Fact]
    public void SanitizeDocumentEdits_caps_at_1000_entries()
    {
        var items = string.Join(",", Enumerable.Range(0, 1500).Select(i => $$"""{"page":{{i}},"runIndex":0,"orig":"x","text":"y"}"""));
        var result = ResumeUpdate.SanitizeDocumentEdits(J($"{{\"documentEdits\":[{items}]}}"));
        using var doc = JsonDocument.Parse(result!);
        Assert.Equal(1000, doc.RootElement.GetArrayLength());
    }

    [Fact]
    public void SanitizeDocumentEdits_clamps_orig_and_text_to_1000_chars()
    {
        var longText = new string('a', 2000);
        var result = ResumeUpdate.SanitizeDocumentEdits(
            J($$"""{"documentEdits":[{"page":0,"runIndex":0,"orig":"{{longText}}","text":"{{longText}}"}]}"""));
        using var doc = JsonDocument.Parse(result!);
        Assert.Equal(1000, doc.RootElement[0].GetProperty("orig").GetString()!.Length);
        Assert.Equal(1000, doc.RootElement[0].GetProperty("text").GetString()!.Length);
    }

    [Fact]
    public void SanitizeDocumentEdits_drops_non_object_entries()
    {
        var result = ResumeUpdate.SanitizeDocumentEdits(J("""{"documentEdits":["not-an-object",42,{"page":0,"runIndex":0}]}"""));
        using var doc = JsonDocument.Parse(result!);
        Assert.Equal(1, doc.RootElement.GetArrayLength());
    }

    [Fact]
    public void SanitizeDocumentEdits_non_array_documentEdits_yields_empty_array()
    {
        var result = ResumeUpdate.SanitizeDocumentEdits(J("""{"documentEdits":"not-an-array"}"""));
        using var doc = JsonDocument.Parse(result!);
        Assert.Equal(0, doc.RootElement.GetArrayLength());
    }
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `dotnet test services/api/tests/FormMaps.UnitTests --filter FullyQualifiedName~ResumeUpdateTests`
Expected: FAIL — `ResumeUpdate` does not exist yet.

- [ ] **Step 3: Create `ResumeUpdate.cs`** with the exact code shown above.

- [ ] **Step 4: Run to verify it passes**

Run: `dotnet test services/api/tests/FormMaps.UnitTests --filter FullyQualifiedName~ResumeUpdateTests`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add services/api/src/FormMaps.Application/Resumes/ResumeUpdate.cs services/api/tests/FormMaps.UnitTests/Resumes/ResumeUpdateTests.cs
git commit -m "feat(resume): add ResumeUpdate (PUT field whitelist + documentEdits sanitizer, pure logic)"
```

---

### Task 4: Extend `IResumeRepository` + `ResumeRepository` with the 4 new data operations

**Files:**
- Modify: `services/api/src/FormMaps.Application/Resumes/IResumeRepository.cs`
- Modify: `services/api/src/FormMaps.Infrastructure/Resumes/ResumeRepository.cs`
- Test: `services/api/tests/FormMaps.IntegrationTests/Resumes/ResumeCrossUserRepositoryTests.cs`

**Interfaces:**
- Consumes: `ResumeRow` (existing, from Task-090's `IResumeRepository.cs`), `RequestContext`, `ResumeUpdate.ResolveFields`/`SanitizeDocumentEdits` (Task 3), `ResumeAccessResolution.ResolveTargetUserId` (Task 2, used by the endpoint layer in Task 5, not the repository).
- Produces, added to `IResumeRepository`:
  - `Task<ResumeRow?> FindActiveByIdAsync(string resumeId, CancellationToken ct = default)` — `findFirst{id, isActive}`, no ownership check (the caller does that). Used by `GET /:id`'s direct-lookup branch and `GET /:id/original`.
  - `Task<ResumeRow?> FindMostRecentActiveByUserIdAsync(string userId, CancellationToken ct = default)` — `findMany{userId, isActive} ORDER BY updatedAt DESC, id ASC` → first row or null. Used by `GET /:id`'s fallback branch.
  - `Task<ResumeUpdateOutcome> UpdateAsync(RequestContext context, string resumeId, JsonElement body, CancellationToken ct = default)` — owner-only (`existing.userId != caller`), **no `isActive` filter**. Returns `NotOwned` if missing/not-owned, else the updated full row.
  - `Task<bool> SoftDeleteAsync(RequestContext context, string resumeId, CancellationToken ct = default)` — owner-only, no `isActive` filter. Returns `false` if missing/not-owned (caller maps to 404), `true` on success.

```csharp
// services/api/src/FormMaps.Application/Resumes/IResumeRepository.cs — ADD to the existing interface:

    /// <summary>GET /:id direct-lookup branch — findFirst{id, isActive}, no ownership check (the endpoint applies
    /// IUserAccessGuard.CanAccessUserAsync against the row's userId). Also backs GET /:id/original.</summary>
    Task<ResumeRow?> FindActiveByIdAsync(string resumeId, CancellationToken cancellationToken = default);

    /// <summary>GET /:id fallback branch — findMany{userId, isActive} ORDER BY updatedAt DESC, id ASC → first row,
    /// or null (endpoint maps to 404 "No resume found").</summary>
    Task<ResumeRow?> FindMostRecentActiveByUserIdAsync(string userId, CancellationToken cancellationToken = default);

    /// <summary>PUT /:resumeId — owner-only (existing.userId != caller, NOT canAccessUser), NO isActive filter (a
    /// soft-deleted resume stays editable). Only whitelisted body keys present get written, plus a sanitized
    /// documentEdits if present.</summary>
    Task<ResumeUpdateOutcome> UpdateAsync(
        RequestContext context, string resumeId, JsonElement body, CancellationToken cancellationToken = default);

    /// <summary>DELETE /:resumeId — same owner-only, no-isActive-filter gate as UpdateAsync. Sets isActive=false.
    /// Returns false when missing/not-owned (endpoint maps to 404).</summary>
    Task<bool> SoftDeleteAsync(RequestContext context, string resumeId, CancellationToken cancellationToken = default);
}

/// <summary>Result of PUT /:resumeId.</summary>
public sealed record ResumeUpdateOutcome(ResumeUpdateStatus Status, ResumeRow? Row = null)
{
    public static readonly ResumeUpdateOutcome NotOwned = new(ResumeUpdateStatus.NotOwned);

    public static ResumeUpdateOutcome Updated(ResumeRow row) => new(ResumeUpdateStatus.Updated, row);
}

public enum ResumeUpdateStatus
{
    Updated,
    NotOwned,
}
```
(Note: the closing `}` of the `IResumeRepository` interface moves to after `SoftDeleteAsync`'s signature — the 4 new methods go inside the existing interface body, and `ResumeUpdateOutcome`/`ResumeUpdateStatus` are added as new top-level types in the same file, same pattern as `ResumeCreateOutcome`/`ResumeCreateStatus` already there.)

- [ ] **Step 1: Add the 4 method signatures + `ResumeUpdateOutcome`/`ResumeUpdateStatus`** to `IResumeRepository.cs` exactly as shown above.

- [ ] **Step 2: Write the failing Testcontainers integration tests**

```csharp
// services/api/tests/FormMaps.IntegrationTests/Resumes/ResumeCrossUserRepositoryTests.cs
using System.Text.Json;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;
using FormMaps.Application.Resumes;
using FormMaps.Domain.Auth;
using FormMaps.Infrastructure.Data;
using FormMaps.Infrastructure.Resumes;

namespace FormMaps.IntegrationTests.Resumes;

/// <summary>
/// Real-Postgres coverage for the 4 new IResumeRepository operations (Phase F resume.ts completion), reusing the
/// FM-090 full-22-column resumes-table fixture — no schema changes needed.
/// </summary>
public sealed class ResumeCrossUserRepositoryTests : IClassFixture<ResumeCrudDatabaseFixture>
{
    private readonly ResumeCrudDatabaseFixture _fixture;

    public ResumeCrossUserRepositoryTests(ResumeCrudDatabaseFixture fixture) => _fixture = fixture;

    private ResumeRepository CreateRepository() =>
        new(new FormMapsDatabaseSessionFactory(_fixture.ConnectionString), TimeProvider.System);

    private static RequestContext ContextFor(string userId) =>
        RequestContext.Authenticated(
            new RequestActor(userId, FormMapsRoles.Student, "u@e.st", "User"),
            schoolId: null, permissions: Array.Empty<string>(),
            tokenSource: TokenSource.DevelopmentHeader, isDevelopmentOverride: true);

    private async Task<string> InsertResumeAsync(ResumeRepository repo, string userId, string name = "R")
    {
        var created = await repo.CreateAsync(ContextFor(userId), JsonDocument.Parse($$"""{"name":"{{name}}"}""").RootElement);
        return created.Row!.Id;
    }

    [Fact]
    public async Task FindActiveByIdAsync_returns_null_for_unknown_id()
    {
        var repo = CreateRepository();
        Assert.Null(await repo.FindActiveByIdAsync("does-not-exist"));
    }

    [Fact]
    public async Task FindActiveByIdAsync_returns_the_row_regardless_of_caller()
    {
        var repo = CreateRepository();
        var id = await InsertResumeAsync(repo, "owner-1");

        var found = await repo.FindActiveByIdAsync(id);

        Assert.NotNull(found);
        Assert.Equal("owner-1", found!.UserId);
    }

    [Fact]
    public async Task FindMostRecentActiveByUserIdAsync_returns_null_when_user_has_no_resumes()
    {
        var repo = CreateRepository();
        Assert.Null(await repo.FindMostRecentActiveByUserIdAsync("nobody"));
    }

    [Fact]
    public async Task FindMostRecentActiveByUserIdAsync_returns_the_most_recently_updated_row()
    {
        var repo = CreateRepository();
        await InsertResumeAsync(repo, "owner-2", "First");
        var secondId = await InsertResumeAsync(repo, "owner-2", "Second");

        var found = await repo.FindMostRecentActiveByUserIdAsync("owner-2");

        Assert.Equal(secondId, found!.Id);
    }

    [Fact]
    public async Task UpdateAsync_returns_NotOwned_for_unknown_id()
    {
        var repo = CreateRepository();
        var outcome = await repo.UpdateAsync(
            ContextFor("someone"), "does-not-exist", JsonDocument.Parse("{}").RootElement);
        Assert.Equal(ResumeUpdateStatus.NotOwned, outcome.Status);
    }

    [Fact]
    public async Task UpdateAsync_returns_NotOwned_when_caller_is_not_the_owner()
    {
        var repo = CreateRepository();
        var id = await InsertResumeAsync(repo, "owner-3");

        var outcome = await repo.UpdateAsync(ContextFor("attacker"), id, JsonDocument.Parse("{}").RootElement);

        Assert.Equal(ResumeUpdateStatus.NotOwned, outcome.Status);
    }

    [Fact]
    public async Task UpdateAsync_writes_only_whitelisted_present_fields()
    {
        var repo = CreateRepository();
        var id = await InsertResumeAsync(repo, "owner-4", "Original Name");

        var outcome = await repo.UpdateAsync(
            ContextFor("owner-4"), id, JsonDocument.Parse("""{"name":"Updated Name"}""").RootElement);

        Assert.Equal(ResumeUpdateStatus.Updated, outcome.Status);
        Assert.Equal("Updated Name", outcome.Row!.Name);
        Assert.Equal("default", outcome.Row.Template); // untouched field survives
    }

    [Fact]
    public async Task UpdateAsync_sanitizes_documentEdits_when_present()
    {
        var repo = CreateRepository();
        var id = await InsertResumeAsync(repo, "owner-5");

        var outcome = await repo.UpdateAsync(
            ContextFor("owner-5"), id,
            JsonDocument.Parse("""{"documentEdits":[{"page":1,"runIndex":0,"orig":"a","text":"b"}]}""").RootElement);

        Assert.Equal(1, outcome.Row!.DocumentEdits.GetArrayLength());
    }

    [Fact]
    public async Task UpdateAsync_succeeds_on_a_soft_deleted_resume()
    {
        var repo = CreateRepository();
        var id = await InsertResumeAsync(repo, "owner-6");
        await repo.SoftDeleteAsync(ContextFor("owner-6"), id);

        var outcome = await repo.UpdateAsync(
            ContextFor("owner-6"), id, JsonDocument.Parse("""{"name":"Still editable"}""").RootElement);

        Assert.Equal(ResumeUpdateStatus.Updated, outcome.Status); // no isActive filter — PUT works on soft-deleted rows
    }

    [Fact]
    public async Task SoftDeleteAsync_returns_false_for_unknown_id()
    {
        var repo = CreateRepository();
        Assert.False(await repo.SoftDeleteAsync(ContextFor("someone"), "does-not-exist"));
    }

    [Fact]
    public async Task SoftDeleteAsync_returns_false_when_caller_is_not_the_owner()
    {
        var repo = CreateRepository();
        var id = await InsertResumeAsync(repo, "owner-7");

        Assert.False(await repo.SoftDeleteAsync(ContextFor("attacker"), id));
    }

    [Fact]
    public async Task SoftDeleteAsync_sets_isActive_false_and_returns_true()
    {
        var repo = CreateRepository();
        var id = await InsertResumeAsync(repo, "owner-8");

        Assert.True(await repo.SoftDeleteAsync(ContextFor("owner-8"), id));
        var row = await repo.FindActiveByIdAsync(id);
        Assert.Null(row); // FindActiveByIdAsync filters isActive=true, so it's gone from that view
    }
}
```

- [ ] **Step 3: Run to verify it fails**

Run: `dotnet test services/api/tests/FormMaps.IntegrationTests --filter FullyQualifiedName~ResumeCrossUserRepositoryTests`
Expected: FAIL — `ResumeRepository` doesn't implement the new interface members yet (build error).

- [ ] **Step 4: Implement the 4 methods in `ResumeRepository.cs`**

```csharp
// services/api/src/FormMaps.Infrastructure/Resumes/ResumeRepository.cs — ADD as new public methods on the class:

    public async Task<ResumeRow?> FindActiveByIdAsync(string resumeId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(RequestContext.System(), cancellationToken);
        await using var command = Command(session, $"""
            SELECT {ResumeColumns} FROM "resumes" WHERE "id" = @id AND "isActive" = true
            """);
        AddParameter(command, "id", resumeId);

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        return await reader.ReadAsync(cancellationToken) ? MapResume(reader) : null;
    }

    public async Task<ResumeRow?> FindMostRecentActiveByUserIdAsync(
        string userId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(RequestContext.System(), cancellationToken);
        await using var command = Command(session, $"""
            SELECT {ResumeColumns}
            FROM "resumes"
            WHERE "userId" = @uid AND "isActive" = true
            ORDER BY "updatedAt" DESC, "id" ASC
            LIMIT 1
            """);
        AddParameter(command, "uid", userId);

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        return await reader.ReadAsync(cancellationToken) ? MapResume(reader) : null;
    }

    public async Task<ResumeUpdateOutcome> UpdateAsync(
        RequestContext context, string resumeId, JsonElement body, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        var owner = await LoadOwnerAsync(session, resumeId, cancellationToken);
        if (owner is null || owner != context.Actor!.UserId)
        {
            return ResumeUpdateOutcome.NotOwned;
        }

        var fields = ResumeUpdate.ResolveFields(body);
        var documentEdits = ResumeUpdate.SanitizeDocumentEdits(body);

        var setClauses = new List<string>();
        var jsonbColumns = new HashSet<string>(
            ["personalInfo", "experience", "education", "skills", "sections", "fieldVisibility", "customFields"],
            StringComparer.Ordinal);

        await using var command = session.Connection.CreateCommand();
        command.Transaction = session.Transaction;

        foreach (var (key, value) in fields)
        {
            var paramName = "p_" + key;
            setClauses.Add(jsonbColumns.Contains(key)
                ? $""""{key}" = @{paramName}::jsonb""""
                : $""""{key}" = @{paramName}"""");
            AddParameter(command, paramName, jsonbColumns.Contains(key) ? value.GetRawText() : GetScalar(value));
        }

        if (documentEdits is not null)
        {
            setClauses.Add(""""documentEdits" = @documentEdits::jsonb"""");
            AddParameter(command, "documentEdits", documentEdits);
        }

        setClauses.Add(""""updatedAt" = @now"""");
        AddTimestamp(command, "now", Now());
        AddParameter(command, "id", resumeId);

        command.CommandText = $"""
            UPDATE "resumes" SET {string.Join(", ", setClauses)}
            WHERE "id" = @id
            RETURNING {ResumeColumns}
            """;

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        await reader.ReadAsync(cancellationToken);
        var row = MapResume(reader);
        await reader.DisposeAsync();
        await session.CommitAsync(cancellationToken);
        return ResumeUpdateOutcome.Updated(row);
    }

    public async Task<bool> SoftDeleteAsync(
        RequestContext context, string resumeId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        var owner = await LoadOwnerAsync(session, resumeId, cancellationToken);
        if (owner is null || owner != context.Actor!.UserId)
        {
            return false;
        }

        await using var command = Command(session, """UPDATE "resumes" SET "isActive" = false WHERE "id" = @id""");
        AddParameter(command, "id", resumeId);
        await command.ExecuteNonQueryAsync(cancellationToken);
        await session.CommitAsync(cancellationToken);
        return true;
    }

    // findUnique(id) with NO isActive filter — mirrors ResumeSectionsRepository's LoadAsync ownership pattern.
    private static async Task<string?> LoadOwnerAsync(
        FormMapsDatabaseSession session, string resumeId, CancellationToken cancellationToken)
    {
        await using var command = Command(session, """SELECT "userId" FROM "resumes" WHERE "id" = @id""");
        AddParameter(command, "id", resumeId);
        var result = await command.ExecuteScalarAsync(cancellationToken);
        return result as string;
    }

    // Scalar (non-jsonb) whitelisted fields are all text columns (name/template/careerField) — pass the JSON
    // string value straight through; a truthy non-string here fails the same way ResumeCreate's coercion does
    // (Prisma-style String-column reject), acceptable because PUT's whitelist only ever names String/jsonb columns.
    private static object GetScalar(JsonElement value) =>
        value.ValueKind == JsonValueKind.String ? value.GetString()! : value.GetRawText();
```

- [ ] **Step 5: Run to verify it passes**

Run: `dotnet test services/api/tests/FormMaps.IntegrationTests --filter FullyQualifiedName~ResumeCrossUserRepositoryTests`
Expected: PASS, 12 tests. (Requires Docker running — Testcontainers spins up a real `postgres:16-alpine`.)

- [ ] **Step 6: Commit**

```bash
git add services/api/src/FormMaps.Application/Resumes/IResumeRepository.cs services/api/src/FormMaps.Infrastructure/Resumes/ResumeRepository.cs services/api/tests/FormMaps.IntegrationTests/Resumes/ResumeCrossUserRepositoryTests.cs
git commit -m "feat(resume): implement FindActiveById/FindMostRecentActiveByUserId/Update/SoftDelete on IResumeRepository"
```

---

### Task 5: `ResumeCrossUserEndpoints.cs` — wire the 4 HTTP routes

**Files:**
- Create: `services/api/src/FormMaps.Api/Endpoints/ResumeCrossUserEndpoints.cs`
- Modify: `services/api/src/FormMaps.Api/Program.cs:74` (add the mapping call, right after `app.MapResumeCrudEndpoints();`)
- Test: `services/api/tests/FormMaps.IntegrationTests/Resumes/ResumeCrossUserEndpointsTests.cs`

**Interfaces:**
- Consumes: `IResumeRepository` (Task 4), `IUserAccessGuard.CanAccessUserAsync` (existing), `ResumeAccessResolution.ResolveTargetUserId` (Task 2), `IObjectStorage.GetPresignedReadUrlAsync` (Task 1), `IProtectedRequestGuard.RequireIdentity`, `ISubscriptionGuard.RequireSubscriptionAsync` (existing, same auth chain as `ResumeCrudEndpoints`/`ResumeSectionsEndpoints`).
- Produces: `MapResumeCrossUserEndpoints(this IEndpointRouteBuilder app)`.

```csharp
using System.Text.Json;
using FormMaps.Application.Auth;
using FormMaps.Application.Resumes;
using FormMaps.Application.Storage;

namespace FormMaps.Api.Endpoints;

/// <summary>
/// resume.ts cross-user completion (Phase F): GET /:id (dual-mode: direct resume lookup with cross-user
/// canAccessUser, falling back to a userId lookup via ResumeAccessResolution), PUT/DELETE /:resumeId (strictly
/// owner-only, no canAccessUser), GET /:id/original (presigned S3 URL, cross-user canAccessUser). Two dark flags:
/// FORMMAPS_ROUTE_RESUME_CROSSUSER_TO_DOTNET (GET/PUT/DELETE) and FORMMAPS_ROUTE_RESUME_ORIGINAL_TO_DOTNET
/// (GET /:id/original) — the frontend rewrite decides which flag gates which route; both endpoints exist here
/// regardless of flag state (the flag only controls whether Next.js routes traffic here at all).
/// </summary>
public static class ResumeCrossUserEndpoints
{
    private const int OriginalUrlTtlSeconds = 300;

    public static IEndpointRouteBuilder MapResumeCrossUserEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/resume").WithTags("ResumeCrossUser");
        group.MapGet("/{id}", GetByIdAsync);
        group.MapPut("/{resumeId}", UpdateAsync);
        group.MapDelete("/{resumeId}", DeleteAsync);
        group.MapGet("/{id}/original", GetOriginalAsync);
        return app;
    }

    private static async Task<IResult> GetByIdAsync(
        IRequestContextAccessor accessor, IProtectedRequestGuard guard, ISubscriptionGuard subscriptionGuard,
        IResumeRepository repository, IUserAccessGuard userAccessGuard, string id, CancellationToken ct)
    {
        var (context, error) = await AuthorizeAsync(accessor, guard, subscriptionGuard, ct);
        if (error is not null) return error;

        var direct = await repository.FindActiveByIdAsync(id, ct);
        if (direct is not null)
        {
            if (!await userAccessGuard.CanAccessUserAsync(context, direct.UserId, ct)) return NotFound();
            return Results.Ok(new { success = true, data = ResumeJson(direct) });
        }

        var targetUserId = ResumeAccessResolution.ResolveTargetUserId(context, id);
        if (targetUserId != context.Actor!.UserId && !await userAccessGuard.CanAccessUserAsync(context, targetUserId, ct))
        {
            return NotFound();
        }

        var fallback = await repository.FindMostRecentActiveByUserIdAsync(targetUserId, ct);
        return fallback is null
            ? Results.Json(new { success = false, message = "No resume found" }, statusCode: StatusCodes.Status404NotFound)
            : Results.Ok(new { success = true, data = ResumeJson(fallback) });
    }

    private static async Task<IResult> UpdateAsync(
        HttpContext http, IRequestContextAccessor accessor, IProtectedRequestGuard guard, ISubscriptionGuard subscriptionGuard,
        IResumeRepository repository, string resumeId, CancellationToken ct)
    {
        var (context, error) = await AuthorizeAsync(accessor, guard, subscriptionGuard, ct);
        if (error is not null) return error;

        var body = await ReadBodyAsync(http, ct);
        if (body is null) return InternalError();

        var outcome = await repository.UpdateAsync(context, resumeId, body.Value, ct);
        return outcome.Status switch
        {
            ResumeUpdateStatus.NotOwned => ResumeNotFound(),
            _ => Results.Ok(new { success = true, data = ResumeJson(outcome.Row!) }),
        };
    }

    private static async Task<IResult> DeleteAsync(
        IRequestContextAccessor accessor, IProtectedRequestGuard guard, ISubscriptionGuard subscriptionGuard,
        IResumeRepository repository, string resumeId, CancellationToken ct)
    {
        var (context, error) = await AuthorizeAsync(accessor, guard, subscriptionGuard, ct);
        if (error is not null) return error;

        var deleted = await repository.SoftDeleteAsync(context, resumeId, ct);
        return deleted ? Results.Ok(new { success = true }) : ResumeNotFound();
    }

    private static async Task<IResult> GetOriginalAsync(
        IRequestContextAccessor accessor, IProtectedRequestGuard guard, ISubscriptionGuard subscriptionGuard,
        IResumeRepository repository, IUserAccessGuard userAccessGuard, IObjectStorage storage,
        string id, CancellationToken ct)
    {
        var (context, error) = await AuthorizeAsync(accessor, guard, subscriptionGuard, ct);
        if (error is not null) return error;

        var resume = await repository.FindActiveByIdAsync(id, ct);
        if (resume?.OriginalPdfKey is null) return NotFound();
        if (!await userAccessGuard.CanAccessUserAsync(context, resume.UserId, ct)) return NotFound();

        var url = await storage.GetPresignedReadUrlAsync(
            resume.OriginalPdfKey, OriginalUrlTtlSeconds, inline: true, contentType: "application/pdf", ct);
        return Results.Ok(new { success = true, data = new { url } });
    }

    // Same 22-column shape as ResumeCrudEndpoints.ResumeJson — duplicated intentionally (each endpoints file in
    // this domain owns its own response mapping, matching FM-089/090's convention of not sharing across slices).
    private static object ResumeJson(ResumeRow r) => new
    {
        id = r.Id, userId = r.UserId, name = r.Name, template = r.Template, careerField = r.CareerField,
        personalInfo = r.PersonalInfo, experience = r.Experience, education = r.Education, skills = r.Skills,
        sections = r.Sections, fieldVisibility = r.FieldVisibility, customFields = r.CustomFields,
        documentEdits = r.DocumentEdits, originalFileKey = r.OriginalFileKey, originalFileType = r.OriginalFileType,
        originalPdfKey = r.OriginalPdfKey, hasOriginal = r.HasOriginal, isActive = r.IsActive,
        createdBy = r.CreatedBy, createdDate = r.CreatedDate, updatedBy = r.UpdatedBy, updatedAt = r.UpdatedAt,
    };

    private static async Task<(RequestContext Context, IResult? Error)> AuthorizeAsync(
        IRequestContextAccessor accessor, IProtectedRequestGuard guard, ISubscriptionGuard subscriptionGuard, CancellationToken ct)
    {
        var context = accessor.Current;
        var identity = guard.RequireIdentity(context);
        if (!identity.Allowed) return (context, Deny(identity));
        var subscription = await subscriptionGuard.RequireSubscriptionAsync(context, ct);
        return subscription.Allowed ? (context, null) : (context, Deny(subscription));
    }

    private static async Task<JsonElement?> ReadBodyAsync(HttpContext http, CancellationToken ct)
    {
        using var reader = new StreamReader(http.Request.Body);
        var raw = await reader.ReadToEndAsync(ct);
        if (string.IsNullOrWhiteSpace(raw)) return JsonDocument.Parse("{}").RootElement.Clone();
        try
        {
            using var document = JsonDocument.Parse(raw);
            return document.RootElement.ValueKind is JsonValueKind.Object or JsonValueKind.Array
                ? document.RootElement.Clone() : null;
        }
        catch (JsonException) { return null; }
    }

    private static IResult Deny(GuardDecision decision) =>
        Results.Json(new { success = false, code = decision.Code, message = decision.Message }, statusCode: decision.StatusCode);

    private static IResult NotFound() =>
        Results.Json(new { success = false, message = "Not found" }, statusCode: StatusCodes.Status404NotFound);

    private static IResult ResumeNotFound() =>
        Results.Json(new { success = false, message = "Resume not found" }, statusCode: StatusCodes.Status404NotFound);

    private static IResult InternalError() =>
        Results.Json(new { success = false, message = "Internal server error" }, statusCode: StatusCodes.Status500InternalServerError);
}
```

- [ ] **Step 1: Create `ResumeCrossUserEndpoints.cs`** with the exact code above.

- [ ] **Step 2: Register it in `Program.cs`**

```csharp
// services/api/src/FormMaps.Api/Program.cs:74 — immediately after app.MapResumeCrudEndpoints();
app.MapResumeCrossUserEndpoints();
```

- [ ] **Step 3: Build**

Run: `dotnet build services/api/src/FormMaps.Api/FormMaps.Api.csproj`
Expected: builds clean.

- [ ] **Step 4: Write the failing endpoint tests**

```csharp
// services/api/tests/FormMaps.IntegrationTests/Resumes/ResumeCrossUserEndpointsTests.cs
using System.Net;
using System.Text;
using System.Text.Json;
using FormMaps.Api.Auth;
using FormMaps.Application.Auth;
using FormMaps.Application.Resumes;
using FormMaps.Application.Storage;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;

namespace FormMaps.IntegrationTests.Resumes;

/// <summary>
/// Guard chain + routing for the 4 resume.ts cross-user completion endpoints (Phase F). Pins the GET-cross-user
/// vs. PUT/DELETE-owner-only asymmetry: a privileged FakeUserAccessGuard(allow:true) lets GET succeed for a
/// non-owner, but PUT/DELETE 404 for a non-owner regardless of the fake guard's answer (they don't call it at all).
/// </summary>
public sealed class ResumeCrossUserEndpointsTests
{
    private static JsonElement J(string json) => JsonDocument.Parse(json).RootElement.Clone();

    private static ResumeRow Row(string id, string userId) => new(
        id, userId, "n", "default", "", J("{}"), J("[]"), J("[]"), J("[]"), J("[]"), J("{}"), J("[]"), J("[]"),
        null, null, "key.pdf", true, true, null, "2026-07-24T12:00:00.000Z", null, "2026-07-24T12:00:00.000Z");

    [Fact]
    public async Task GetById_anonymous_is_401()
    {
        using var factory = new Factory(new FakeRepo(), new FakeGuard(true), new FakeStorage());
        using var client = factory.CreateClient();
        var response = await client.GetAsync("/api/resume/some-id");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task GetById_direct_hit_denied_by_access_guard_is_404()
    {
        var repo = new FakeRepo { ActiveById = Row("r1", "owner-1") };
        using var factory = new Factory(repo, new FakeGuard(false), new FakeStorage());
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Get, "/api/resume/r1", null, callerId: "someone-else");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task GetById_direct_hit_allowed_by_access_guard_returns_200()
    {
        var repo = new FakeRepo { ActiveById = Row("r1", "owner-1") };
        using var factory = new Factory(repo, new FakeGuard(true), new FakeStorage());
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Get, "/api/resume/r1", null, callerId: "owner-1");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task GetById_falls_back_to_userId_lookup_when_no_direct_resume_matches()
    {
        var repo = new FakeRepo { ActiveById = null, MostRecentForUser = Row("r2", "owner-1") };
        using var factory = new Factory(repo, new FakeGuard(true), new FakeStorage());
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Get, "/api/resume/owner-1", null, callerId: "owner-1");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task GetById_fallback_with_no_resumes_is_404()
    {
        var repo = new FakeRepo { ActiveById = null, MostRecentForUser = null };
        using var factory = new Factory(repo, new FakeGuard(true), new FakeStorage());
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Get, "/api/resume/owner-1", null, callerId: "owner-1");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Update_owner_only_non_owner_is_404_even_though_access_guard_would_allow()
    {
        var repo = new FakeRepo { UpdateResult = ResumeUpdateOutcome.NotOwned };
        using var factory = new Factory(repo, new FakeGuard(true), new FakeStorage()); // guard would ALLOW; must not be consulted
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Put, "/api/resume/r1", Json("""{"name":"x"}"""), callerId: "attacker");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Update_owner_succeeds()
    {
        var repo = new FakeRepo { UpdateResult = ResumeUpdateOutcome.Updated(Row("r1", "owner-1")) };
        using var factory = new Factory(repo, new FakeGuard(true), new FakeStorage());
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Put, "/api/resume/r1", Json("""{"name":"x"}"""), callerId: "owner-1");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Delete_non_owner_is_404()
    {
        var repo = new FakeRepo { SoftDeleteResult = false };
        using var factory = new Factory(repo, new FakeGuard(true), new FakeStorage());
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Delete, "/api/resume/r1", null, callerId: "attacker");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Delete_owner_succeeds()
    {
        var repo = new FakeRepo { SoftDeleteResult = true };
        using var factory = new Factory(repo, new FakeGuard(true), new FakeStorage());
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Delete, "/api/resume/r1", null, callerId: "owner-1");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task GetOriginal_missing_originalPdfKey_is_404()
    {
        var noOriginal = Row("r1", "owner-1") with { OriginalPdfKey = null };
        var repo = new FakeRepo { ActiveById = noOriginal };
        using var factory = new Factory(repo, new FakeGuard(true), new FakeStorage());
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Get, "/api/resume/r1/original", null, callerId: "owner-1");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task GetOriginal_denied_by_access_guard_is_404()
    {
        var repo = new FakeRepo { ActiveById = Row("r1", "owner-1") };
        using var factory = new Factory(repo, new FakeGuard(false), new FakeStorage());
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Get, "/api/resume/r1/original", null, callerId: "someone-else");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task GetOriginal_success_returns_presigned_url()
    {
        var repo = new FakeRepo { ActiveById = Row("r1", "owner-1") };
        var storage = new FakeStorage { Url = "https://example.s3/key.pdf?sig=abc" };
        using var factory = new Factory(repo, new FakeGuard(true), storage);
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Get, "/api/resume/r1/original", null, callerId: "owner-1");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("https://example.s3/key.pdf?sig=abc", doc.RootElement.GetProperty("data").GetProperty("url").GetString());
    }

    private static StringContent Json(string json) => new(json, Encoding.UTF8, "application/json");

    private static Task<HttpResponseMessage> Send(HttpClient client, HttpMethod method, string path, HttpContent? content, string callerId)
    {
        var request = new HttpRequestMessage(method, path) { Content = content };
        request.Headers.Add(DevelopmentRequestContextFactory.UserIdHeader, callerId);
        request.Headers.Add(DevelopmentRequestContextFactory.RoleHeader, "student");
        request.Headers.Add(DevelopmentRequestContextFactory.EmailHeader, "s@e.st");
        request.Headers.Add(DevelopmentRequestContextFactory.NameHeader, "Student");
        request.Headers.Add(DevelopmentRequestContextFactory.PermissionsHeader, "");
        return client.SendAsync(request);
    }

    private sealed class Factory(FakeRepo repo, FakeGuard guard, FakeStorage storage) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(Environments.Development);
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<IResumeRepository>();
                services.AddSingleton<IResumeRepository>(repo);
                services.RemoveAll<ISubscriptionGuard>();
                services.AddSingleton<ISubscriptionGuard>(new FakeSub(true));
                services.RemoveAll<IUserAccessGuard>();
                services.AddSingleton<IUserAccessGuard>(guard);
                services.RemoveAll<IObjectStorage>();
                services.AddSingleton<IObjectStorage>(storage);
            });
        }
    }

    private sealed class FakeSub(bool allow) : ISubscriptionGuard
    {
        public Task<GuardDecision> RequireSubscriptionAsync(RequestContext context, CancellationToken ct = default) =>
            Task.FromResult(allow ? GuardDecision.Allow() : GuardDecision.Deny(403, "SUBSCRIPTION_REQUIRED", "Active subscription required"));
    }

    private sealed class FakeGuard(bool allow) : IUserAccessGuard
    {
        public Task<bool> CanAccessUserAsync(RequestContext caller, string targetUserId, CancellationToken ct = default) =>
            Task.FromResult(allow);
    }

    private sealed class FakeStorage : IObjectStorage
    {
        public string Url { get; init; } = "https://example.s3/x";
        public Task<StoredObject> UploadAndGetUrlAsync(string folder, string filename, byte[] body, string contentType, CancellationToken ct = default) =>
            throw new NotSupportedException();
        public Task<string> GetPresignedReadUrlAsync(string key, int ttlSeconds, bool inline, string contentType, CancellationToken ct = default) =>
            Task.FromResult(Url);
    }

    private sealed class FakeRepo : IResumeRepository
    {
        public ResumeRow? ActiveById { get; init; }
        public ResumeRow? MostRecentForUser { get; init; }
        public ResumeUpdateOutcome UpdateResult { get; init; } = ResumeUpdateOutcome.NotOwned;
        public bool SoftDeleteResult { get; init; }

        public Task<IReadOnlyList<ResumeRow>> ListAsync(RequestContext context, CancellationToken ct = default) =>
            throw new NotSupportedException();
        public Task<ResumeCreateOutcome> CreateAsync(RequestContext context, JsonElement body, CancellationToken ct = default) =>
            throw new NotSupportedException();
        public Task<ResumeRow?> FindActiveByIdAsync(string resumeId, CancellationToken ct = default) =>
            Task.FromResult(ActiveById);
        public Task<ResumeRow?> FindMostRecentActiveByUserIdAsync(string userId, CancellationToken ct = default) =>
            Task.FromResult(MostRecentForUser);
        public Task<ResumeUpdateOutcome> UpdateAsync(RequestContext context, string resumeId, JsonElement body, CancellationToken ct = default) =>
            Task.FromResult(UpdateResult);
        public Task<bool> SoftDeleteAsync(RequestContext context, string resumeId, CancellationToken ct = default) =>
            Task.FromResult(SoftDeleteResult);
    }
}
```

- [ ] **Step 5: Run to verify it fails, then implement/fix until it passes**

Run: `dotnet test services/api/tests/FormMaps.IntegrationTests --filter FullyQualifiedName~ResumeCrossUserEndpointsTests`
Expected: initial FAIL if `Program` isn't `public partial class` yet for `WebApplicationFactory<Program>` (check — `ResumeCrudEndpointsTests.cs` already uses this exact pattern successfully, so `Program` is already test-accessible; no change needed here). Iterate on the endpoint code from Step 1 until all 12 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add services/api/src/FormMaps.Api/Endpoints/ResumeCrossUserEndpoints.cs services/api/src/FormMaps.Api/Program.cs services/api/tests/FormMaps.IntegrationTests/Resumes/ResumeCrossUserEndpointsTests.cs
git commit -m "feat(resume): wire GET /:id, PUT/DELETE /:resumeId, GET /:id/original endpoints"
```

---

### Task 6: Adversarial review pass (Fork 1 only, per approved plan)

**Files:** none created — this is a review task.

- [ ] **Step 1: Dispatch a fresh reviewer agent** against the diff introduced by Tasks 1–5, prompted specifically to try to break the ownership/access-control logic: can a non-owner reach PUT/DELETE by manipulating headers? Does `ResumeAccessResolution`'s privileged-role check use the same raw-ordinal comparison as `UserAccessGuard` (a mismatch here would silently open or close access incorrectly)? Does `GET /:id/original` leak existence of another user's resume through timing or a different status code? Does the `UpdateAsync` SQL building (dynamic `SET` clause list) have any injection risk from field *names* (it doesn't — names come from the fixed `WhitelistedFields` array, never from user input, but the reviewer should confirm this explicitly).

- [ ] **Step 2: Fix any BLOCKING/HIGH findings**, re-run the full test suite (`dotnet test services/api/tests/FormMaps.UnitTests services/api/tests/FormMaps.IntegrationTests --filter FullyQualifiedName~Resume`), and commit the fixes as a separate commit (`fix(resume): <finding>`).

---

### Task 7: Frontend wiring — 2 new flags

**Files:**
- Modify: `formmaps-platform/frontend/next.config.ts`

**Interfaces:** none — pure rewrite config, same pattern as the FM-043 commit (`b88f5655`) and Track A of this Phase F effort.

- [ ] **Step 1: Add the two flag functions**, placed after `shouldRouteSchoolAdminConfigScheduleToDotnet` (or wherever Track A's wiring commit landed them, if Track A is done first):

```typescript
// Resume cross-user completion (Phase F): GET /:id + PUT/DELETE /:resumeId, co-flipped (path-not-method).
function shouldRouteResumeCrossUserToDotnet() {
  return Boolean(dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_RESUME_CROSSUSER_TO_DOTNET));
}

// Resume GET /:id/original (Phase F): independent flag — a new presigned-URL capability, separate risk
// surface from plain CRUD ownership checks, isolated for independent rollback.
function shouldRouteResumeOriginalToDotnet() {
  return Boolean(dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_RESUME_ORIGINAL_TO_DOTNET));
}
```

- [ ] **Step 2: Add the rewrites**, inside the array that already holds the FM-089/090/043-style entries, BEFORE the `/api/:path*` and `/evaluation/:path*` catch-alls (there is no `/api/resume/:path*` catch-all today — confirm with `grep -n "api/resume" frontend/next.config.ts` before adding; if none exists, these are the first resume rewrites and can go anywhere in the array before the general `/api/:path*` catch-all):

```typescript
      ...(shouldRouteResumeCrossUserToDotnet()
        ? [
            {
              source: "/api/resume/:id((?!default|ask|upload-and-parse|tailor|extract-job-posting)[^/]+)",
              destination: `${dotnetApiBaseUrl}/api/resume/:id`,
            },
          ]
        : []),
      ...(shouldRouteResumeOriginalToDotnet()
        ? [
            {
              source: "/api/resume/:id/original",
              destination: `${dotnetApiBaseUrl}/api/resume/:id/original`,
            },
          ]
        : []),
```

- [ ] **Step 3: Verify default-off and default-on behavior**, same method used for the FM-043 wiring commit:

```bash
cd /Users/federicotafur/formmaps-platform/frontend
node --input-type=module -e "
import('./next.config.ts').then(m => m.default.rewrites()).then(r => {
  console.log(JSON.stringify(r.afterFiles.filter(x => x.source.includes('resume')), null, 2));
});
"
# Expect: empty array (flags unset, default OFF)

FORMMAPS_DOTNET_API_BASE_URL=https://dotnet.example.com \
FORMMAPS_ROUTE_RESUME_CROSSUSER_TO_DOTNET=true \
FORMMAPS_ROUTE_RESUME_ORIGINAL_TO_DOTNET=true \
node --input-type=module -e "
import('./next.config.ts').then(m => m.default.rewrites()).then(r => {
  console.log(JSON.stringify(r.afterFiles.filter(x => x.source.includes('resume')), null, 2));
});
"
# Expect: both rewrites present, listed before any catch-all
```

- [ ] **Step 4: Commit**

```bash
cd /Users/federicotafur/formmaps-platform
git add frontend/next.config.ts
git commit -m "feat(migration): wire resume.ts cross-user completion rewrites, flags default OFF"
```

## Self-Review

- **Spec coverage:** all 4 routes from the design doc's Track B table have a task (Tasks 4–5); the new `IObjectStorage` capability is Task 1; the GET-cross-user-vs-PUT/DELETE-owner-only asymmetry is pinned in Task 5's tests (`Update_owner_only_non_owner_is_404_even_though_access_guard_would_allow`); the adversarial review gate is Task 6; frontend wiring is Task 7.
- **Placeholder scan:** no TBD/TODO; every step has concrete code.
- **Type consistency:** `ResumeUpdateOutcome`/`ResumeUpdateStatus` (Task 4) match their usage in Task 5's endpoint `switch`; `ResumeAccessResolution.ResolveTargetUserId` (Task 2) signature matches its call site in Task 5; `IObjectStorage.GetPresignedReadUrlAsync` (Task 1) signature matches its call in Task 5 and its fake in Task 5's test.
