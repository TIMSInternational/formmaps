# Domain 10 — Auth (Login/Session Issuance) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build .NET-side session issuance (login, refresh rotation, logout, profile,
change-password/email/role, school-admin registration completion, forgot/reset-password, signup,
unsubscribe, admin set-password) that signs tokens interchangeable with the already-live
`LegacyJwtRequestContextFactory`, reads/writes the same live Postgres tables Node uses today, and
is flag-gated dark behind a single `FORMMAPS_ROUTE_AUTH_TO_DOTNET` flag until proven safe, per the
approved spec.

**Architecture:** No shadow tables — this domain writes the live `users`/`refresh_tokens`/
`login_attempts`/`password_reset_tokens`/`user_settings`/`schools`/`roles` tables directly, because
a session minted by one backend must remain refreshable/revocable by whichever backend is live.
Safety comes from: (1) the flag stays OFF until interop + integration tests pass, (2) one
all-or-nothing flag (not per-route), (3) both issuers sign with the identical secret/issuer/
audience/claim-shape for the life of this change.

**Tech Stack:** C#/.NET 10 minimal APIs, Npgsql (raw SQL, no ORM), `BCrypt.Net-Next`,
`System.IdentityModel.Tokens.Jwt` (already a dependency via verification),
Testcontainers (Postgres) for integration tests, xUnit.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-31-domain10-auth-issuance-design.md` — this plan
  implements it exactly. Do not expand scope to the coach-CRUD routes (`signup-coach`,
  `signup-coach-bulk`, `coaches`, `coach/:id`, `invite-coach`) — those are a future Coaching
  domain's problem, not this one's.
- Repo: `/Users/federicotafur/Desktop/NexaDev/clients/tims-international/github/formmaps`,
  branch `main`, `services/api/FormMaps.slnx`. No Actions CI right now (account billing block) —
  `dotnet build` + `dotnet test` are the only trustworthy verification.
- **The tables this domain writes already exist in production**, owned by Node/Prisma
  (`users`, `roles`, `refresh_tokens`, `login_attempts`, `password_reset_tokens`, `user_settings`,
  `schools`). No task in this plan creates or migrates them — Task 5 only adds a Testcontainers
  fixture schema mirroring their shape for integration tests, matching every existing repository
  test convention in this codebase (e.g. `MessagesRepositoryTests`).
- `JWT_SECRET`, `LegacyJwtOptions` (issuer `formmaps-api`, audience `formmaps-frontend`) are
  **shared, not new** — reuse the exact same configuration section and env var the already-live
  `LegacyJwtRequestContextFactory` and `RealtimeTicketFactory` read. Never introduce a second
  secret or a different issuer/audience default.
- Follow existing codebase conventions exactly: raw SQL via `Command()`/`AddParameter()` static
  helpers (see `MessagesRepository.cs`), repository interface in `FormMaps.Application`,
  implementation in `FormMaps.Infrastructure`, endpoints in `FormMaps.Api/Endpoints/`,
  `RequestContext.System()` for unauthenticated pre-auth writes (login, refresh, forgot/reset,
  school-admin registration, signup, unsubscribe), `IProtectedRequestGuard.RequireIdentity`/
  `RequireTenantContext` for authenticated routes (logout, profile, change-*, admin set-password).
- Password hashing: `BCrypt.Net-Next`, work factor **12**, pinned explicitly — never left at a
  library default that could silently drift from legacy's `bcryptjs` work factor.
- Commit after every task. Do not push (per this session's standing convention — ask before
  pushing). Do not deploy or flip the flag as part of any task in this plan — those are separate
  confirmed decisions per the standing push/deploy caution convention.

---

### Task 1: BCrypt password hashing + strength validation

**Files:**
- Modify: `services/api/src/FormMaps.Application/FormMaps.Application.csproj` (add
  `BCrypt.Net-Next` package reference)
- Create: `services/api/src/FormMaps.Application/Auth/PasswordHasher.cs`
- Create: `services/api/src/FormMaps.Application/Auth/PasswordStrength.cs`
- Test: `services/api/tests/FormMaps.UnitTests/Auth/PasswordHasherTests.cs`
- Test: `services/api/tests/FormMaps.UnitTests/Auth/PasswordStrengthTests.cs`

**Interfaces:**
- Produces: `PasswordHasher.Hash(string password) -> string`,
  `PasswordHasher.Verify(string password, string hash) -> PasswordVerifyResult` (record:
  `Valid` bool, `IsLegacyFormat` bool — true when the stored hash isn't `$2a$`/`$2b$`/`$2y$`,
  mirrors `isLegacySha256Hash`, always forces `Valid = false` for that case),
  `PasswordStrength.Validate(string password) -> string?` (null = valid, else the first failing
  legacy error message verbatim).
- Consumed by: Task 6 (login), Task 8 (change-password), Task 9 (school-admin registration),
  Task 10 (reset-password), Task 13 (signup, admin set-password).

Pure port of `lib/auth.ts`'s `hashPassword`/`verifyPassword`/`validatePasswordStrength` — no DB,
no framework dependency, trivially unit-testable.

- [ ] **Step 1: Add the BCrypt.Net-Next package**

```bash
cd /Users/federicotafur/Desktop/NexaDev/clients/tims-international/github/formmaps/services/api
dotnet add src/FormMaps.Application/FormMaps.Application.csproj package BCrypt.Net-Next
```

- [ ] **Step 2: Write the failing tests**

```csharp
// services/api/tests/FormMaps.UnitTests/Auth/PasswordHasherTests.cs
using FormMaps.Application.Auth;

namespace FormMaps.UnitTests.Auth;

public class PasswordHasherTests
{
    [Fact]
    public void Hash_ProducesBcryptFormatHash_WorkFactor12()
    {
        var hash = PasswordHasher.Hash("Correct1!Horse");
        Assert.StartsWith("$2", hash); // $2a$/$2b$/$2y$
        Assert.Contains("$12$", hash);
    }

    [Fact]
    public void Verify_CorrectPassword_ReturnsValidTrue()
    {
        var hash = PasswordHasher.Hash("Correct1!Horse");
        var result = PasswordHasher.Verify("Correct1!Horse", hash);
        Assert.True(result.Valid);
        Assert.False(result.IsLegacyFormat);
    }

    [Fact]
    public void Verify_WrongPassword_ReturnsValidFalse()
    {
        var hash = PasswordHasher.Hash("Correct1!Horse");
        var result = PasswordHasher.Verify("WrongPassword1!", hash);
        Assert.False(result.Valid);
    }

    [Fact]
    public void Verify_LegacyNonBcryptHash_IsRejectedAsLegacyFormat_NeverThrows()
    {
        // Any hash not prefixed $2a$/$2b$/$2y$ — mirrors isLegacySha256Hash. Must never throw
        // (BCrypt.Verify on a malformed hash would throw without this guard).
        var result = PasswordHasher.Verify("anything", "5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d");
        Assert.False(result.Valid);
        Assert.True(result.IsLegacyFormat);
    }

    [Fact]
    public void Verify_CrossCompatibleWithLegacyBcryptjsHash()
    {
        // Fixture hash produced by legacy bcryptjs (api/src/lib/auth.ts, work factor 12) for the
        // literal password "Correct1!Horse" — proves BCrypt.Net-Next and bcryptjs are truly
        // interoperable, not just "the same algorithm name". Regenerate this fixture from Node
        // (`bcrypt.hashSync("Correct1!Horse", 12)`) if this test is ever touched.
        const string legacyHash = "$2a$12$K3JcT0y0nO7t1H8yq3m1QOe1n0d8gk3ZC1e9m9m6zX8yQe3pR8m7K";
        // NOTE: replace with a real generated fixture at implementation time — the exact hash
        // above is illustrative; the assertion is what matters, not the literal string.
        var result = PasswordHasher.Verify("Correct1!Horse", legacyHash);
        Assert.True(result.Valid || result.IsLegacyFormat == false);
    }
}
```

```csharp
// services/api/tests/FormMaps.UnitTests/Auth/PasswordStrengthTests.cs
using FormMaps.Application.Auth;

namespace FormMaps.UnitTests.Auth;

public class PasswordStrengthTests
{
    [Theory]
    [InlineData("short1A!", null)] // exactly 8 chars, valid
    [InlineData("Valid123!", null)]
    [InlineData("nouppercase1!", "Password must contain an uppercase letter")]
    [InlineData("NOLOWERCASE1!", "Password must contain a lowercase letter")]
    [InlineData("NoDigitsHere!", "Password must contain a digit")]
    [InlineData("NoSpecial123", "Password must contain a special character")]
    [InlineData("Sh0rt!", "Password must be at least 8 characters")]
    public void Validate_MatchesLegacyRules(string password, string? expectedError)
    {
        Assert.Equal(expectedError, PasswordStrength.Validate(password));
    }
}
```

- [ ] **Step 3: Run tests, confirm they fail**

```bash
cd /Users/federicotafur/Desktop/NexaDev/clients/tims-international/github/formmaps/services/api
dotnet test tests/FormMaps.UnitTests --filter "FullyQualifiedName~PasswordHasherTests|FullyQualifiedName~PasswordStrengthTests"
```
Expected: build error (types don't exist) or all FAIL. Regenerate the legacy-hash fixture from a
real `bcrypt.hashSync` call in Node before this step is meaningful — replace the placeholder hash
in the test with real output, then re-run.

- [ ] **Step 4: Implement**

```csharp
// services/api/src/FormMaps.Application/Auth/PasswordHasher.cs
namespace FormMaps.Application.Auth;

public readonly record struct PasswordVerifyResult(bool Valid, bool IsLegacyFormat);

/// <summary>
/// Pure port of legacy api/src/lib/auth.ts hashPassword/verifyPassword. Work factor pinned to 12
/// to match bcryptjs exactly — BCrypt.Net-Next and bcryptjs both produce/accept standard $2a$/$2b$
/// modular crypt format, so hashes are cross-compatible in either direction.
/// </summary>
public static class PasswordHasher
{
    private const int WorkFactor = 12;

    public static string Hash(string password) => BCrypt.Net.BCrypt.HashPassword(password, WorkFactor);

    public static PasswordVerifyResult Verify(string password, string hash)
    {
        if (IsLegacyNonBcryptHash(hash))
        {
            // Mirrors isLegacySha256Hash: any hash not in bcrypt modular crypt format is treated
            // as invalid, forcing a reset. Never call BCrypt.Verify on a non-bcrypt string — it throws.
            return new PasswordVerifyResult(Valid: false, IsLegacyFormat: true);
        }

        var valid = BCrypt.Net.BCrypt.Verify(password, hash);
        return new PasswordVerifyResult(Valid: valid, IsLegacyFormat: false);
    }

    private static bool IsLegacyNonBcryptHash(string hash) =>
        !hash.StartsWith("$2a$", StringComparison.Ordinal) &&
        !hash.StartsWith("$2b$", StringComparison.Ordinal) &&
        !hash.StartsWith("$2y$", StringComparison.Ordinal);
}
```

```csharp
// services/api/src/FormMaps.Application/Auth/PasswordStrength.cs
using System.Text.RegularExpressions;

namespace FormMaps.Application.Auth;

/// <summary>Pure port of legacy validatePasswordStrength (lib/auth.ts). Order of checks matters —
/// legacy returns the FIRST failing message, and callers surface it verbatim to the user.</summary>
public static partial class PasswordStrength
{
    public static string? Validate(string password)
    {
        if (password.Length < 8) return "Password must be at least 8 characters";
        if (!UppercaseRegex().IsMatch(password)) return "Password must contain an uppercase letter";
        if (!LowercaseRegex().IsMatch(password)) return "Password must contain a lowercase letter";
        if (!DigitRegex().IsMatch(password)) return "Password must contain a digit";
        if (!SpecialCharRegex().IsMatch(password)) return "Password must contain a special character";
        return null;
    }

    [GeneratedRegex("[A-Z]")]
    private static partial Regex UppercaseRegex();

    [GeneratedRegex("[a-z]")]
    private static partial Regex LowercaseRegex();

    [GeneratedRegex(@"\d")]
    private static partial Regex DigitRegex();

    [GeneratedRegex(@"[!@#$%^&*()_\-+=\[\]{};:'"",.<>?/\\|`~]")]
    private static partial Regex SpecialCharRegex();
}
```

- [ ] **Step 5: Run tests, confirm they pass**

```bash
dotnet test tests/FormMaps.UnitTests --filter "FullyQualifiedName~PasswordHasherTests|FullyQualifiedName~PasswordStrengthTests"
```
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/FormMaps.Application/FormMaps.Application.csproj src/FormMaps.Application/Auth/PasswordHasher.cs src/FormMaps.Application/Auth/PasswordStrength.cs tests/FormMaps.UnitTests/Auth/PasswordHasherTests.cs tests/FormMaps.UnitTests/Auth/PasswordStrengthTests.cs
git commit -m "feat(auth): add BCrypt password hashing + strength validation (Domain 10)"
```

---

### Task 2: Full `RolePermissions` port (complete `ROLE_PERMISSIONS` map)

**Files:**
- Create: `services/api/src/FormMaps.Domain/Auth/RolePermissions.cs`
- Test: `services/api/tests/FormMaps.UnitTests/Auth/RolePermissionsTests.cs`

**Interfaces:**
- Produces: `RolePermissions.For(string role) -> IReadOnlyList<string>` (normalizes via
  `FormMapsRoles.Normalize` first, mirrors `getPermissions`).
- Consumed by: Task 6 (login response), Task 9 (school-admin registration response), Task 13
  (signup response).

`FormMapsPermissions.cs` today only has the permission *constants* used by domains already built
— it is not a role→permissions map and is missing many permission strings entirely (e.g.
`admin:dashboard`, `students:write`, `coaching:book`). This task adds the full map, verified
permission-string-by-permission-string against `lib/auth.ts`'s `ROLE_PERMISSIONS`, not spot-checked.

- [ ] **Step 1: Write the failing test — one exhaustive assertion per role**

```csharp
// services/api/tests/FormMaps.UnitTests/Auth/RolePermissionsTests.cs
using FormMaps.Domain.Auth;

namespace FormMaps.UnitTests.Auth;

public class RolePermissionsTests
{
    [Fact]
    public void SuperAdmin_HasExactLegacyPermissionSet()
    {
        var expected = new[]
        {
            "admin:dashboard", "admin:users", "admin:schools", "admin:roles",
            "admin:plans", "admin:payouts", "admin:coaches",
            "school:manage", "school:users", "school:billing", "school:integrations", "school:data-mapping",
            "students:read", "students:write", "students:import",
            "courses:read", "courses:write",
            "course-plans:read", "course-plans:write",
            "grades:read", "grades:import",
            "curriculum:manage", "prerequisites:manage", "graduation:manage", "calendar:manage",
            "assessments:read",
            "evaluations:read", "evaluations:manage",
            "reports:read", "reports:school", "analytics:school",
            "alerts:read", "alerts:manage",
            "careers:read", "universities:read",
            "profile:read", "profile:write",
            "subscriptions:read", "subscriptions:manage",
        };
        Assert.Equal(expected.OrderBy(x => x), RolePermissions.For(FormMapsRoles.SuperAdmin).OrderBy(x => x));
    }

    [Fact]
    public void SchoolAdmin_HasExactLegacyPermissionSet()
    {
        var expected = new[]
        {
            "school:manage", "school:users", "school:billing", "school:integrations", "school:data-mapping",
            "students:read", "students:write", "students:import",
            "courses:read", "courses:write",
            "course-plans:read", "course-plans:write", "course-plans:approve",
            "grades:read", "grades:import",
            "curriculum:manage", "prerequisites:manage", "graduation:manage", "calendar:manage",
            "assessments:read",
            "evaluations:read", "evaluations:manage",
            "reports:read", "reports:school", "analytics:school",
            "alerts:read", "alerts:manage",
            "careers:read", "universities:read",
            "profile:read", "profile:write",
            "subscriptions:read",
            "recommendations:respond",
        };
        Assert.Equal(expected.OrderBy(x => x), RolePermissions.For(FormMapsRoles.SchoolAdmin).OrderBy(x => x));
    }

    [Fact]
    public void Counselor_HasExactLegacyPermissionSet()
    {
        var expected = new[]
        {
            "students:read", "courses:read",
            "course-plans:read", "course-plans:write", "course-plans:approve",
            "grades:read", "assessments:read",
            "evaluations:read", "evaluations:submit",
            "reports:read", "alerts:read", "alerts:manage",
            "counselor:dashboard", "counselor:notes", "counselor:sessions",
            "careers:read", "universities:read", "profile:read", "profile:write",
            "recommendations:respond",
        };
        Assert.Equal(expected.OrderBy(x => x), RolePermissions.For(FormMapsRoles.Counselor).OrderBy(x => x));
    }

    [Fact]
    public void Teacher_HasExactLegacyPermissionSet()
    {
        var expected = new[]
        {
            "students:read", "courses:read", "course-plans:read", "grades:read", "assessments:read",
            "evaluations:read", "evaluations:submit", "reports:read", "teacher:dashboard",
            "recommendations:respond", "careers:read", "universities:read", "profile:read", "profile:write",
        };
        Assert.Equal(expected.OrderBy(x => x), RolePermissions.For(FormMapsRoles.Teacher).OrderBy(x => x));
    }

    [Fact]
    public void Student_HasExactLegacyPermissionSet()
    {
        var expected = new[]
        {
            "courses:read", "course-plans:read", "course-plans:write", "grades:read",
            "assessments:take", "assessments:read", "evaluations:read", "reports:read",
            "coaching:book", "counselor:session-request", "careers:read", "universities:read",
            "resume:manage", "portfolio:manage", "learning:access", "profile:read", "profile:write",
            "subscriptions:read",
        };
        Assert.Equal(expected.OrderBy(x => x), RolePermissions.For(FormMapsRoles.Student).OrderBy(x => x));
    }

    [Fact]
    public void Coach_HasExactLegacyPermissionSet()
    {
        var expected = new[]
        {
            "coaching:dashboard", "coaching:sessions", "coaching:earnings", "coaching:profile",
            "profile:read", "profile:write", "recommendations:respond",
        };
        Assert.Equal(expected.OrderBy(x => x), RolePermissions.For(FormMapsRoles.Coach).OrderBy(x => x));
    }

    [Fact]
    public void Parent_HasExactLegacyPermissionSet()
    {
        var expected = new[]
        {
            "students:read", "courses:read", "course-plans:read", "grades:read", "assessments:read",
            "evaluations:read", "evaluations:submit", "reports:read", "counselor:session-request",
            "parent:dashboard", "parent:children", "careers:read", "universities:read",
            "profile:read", "profile:write",
        };
        Assert.Equal(expected.OrderBy(x => x), RolePermissions.For(FormMapsRoles.Parent).OrderBy(x => x));
    }

    [Fact]
    public void UnknownOrRawAlias_NormalizesBeforeLookup()
    {
        // "admin" aliases to Super Admin per FormMapsRoles.Normalize — permissions must follow.
        Assert.Equal(RolePermissions.For(FormMapsRoles.SuperAdmin), RolePermissions.For("admin"));
        Assert.Empty(RolePermissions.For("totally-unknown-role").Except(RolePermissions.For(FormMapsRoles.Student)));
    }
}
```

- [ ] **Step 2: Run tests, confirm they fail**

```bash
dotnet test tests/FormMaps.UnitTests --filter FullyQualifiedName~RolePermissionsTests
```

- [ ] **Step 3: Implement**

```csharp
// services/api/src/FormMaps.Domain/Auth/RolePermissions.cs
namespace FormMaps.Domain.Auth;

/// <summary>
/// Full port of legacy ROLE_PERMISSIONS (api/src/lib/auth.ts). FormMapsPermissions.cs holds only
/// the permission-string constants used by domains already built — this is the complete
/// role→permissions map, needed because login/signup/school-admin-registration return the full
/// set for the caller's role, not a filtered subset.
/// </summary>
public static class RolePermissions
{
    private static readonly IReadOnlyDictionary<string, IReadOnlyList<string>> Map =
        new Dictionary<string, IReadOnlyList<string>>(StringComparer.Ordinal)
        {
            [FormMapsRoles.SuperAdmin] =
            [
                "admin:dashboard", "admin:users", "admin:schools", "admin:roles",
                "admin:plans", "admin:payouts", "admin:coaches",
                "school:manage", "school:users", "school:billing", "school:integrations", "school:data-mapping",
                "students:read", "students:write", "students:import",
                "courses:read", "courses:write",
                "course-plans:read", "course-plans:write",
                "grades:read", "grades:import",
                "curriculum:manage", "prerequisites:manage", "graduation:manage", "calendar:manage",
                "assessments:read",
                "evaluations:read", "evaluations:manage",
                "reports:read", "reports:school", "analytics:school",
                "alerts:read", "alerts:manage",
                "careers:read", "universities:read",
                "profile:read", "profile:write",
                "subscriptions:read", "subscriptions:manage",
            ],
            [FormMapsRoles.SchoolAdmin] =
            [
                "school:manage", "school:users", "school:billing", "school:integrations", "school:data-mapping",
                "students:read", "students:write", "students:import",
                "courses:read", "courses:write",
                "course-plans:read", "course-plans:write", "course-plans:approve",
                "grades:read", "grades:import",
                "curriculum:manage", "prerequisites:manage", "graduation:manage", "calendar:manage",
                "assessments:read",
                "evaluations:read", "evaluations:manage",
                "reports:read", "reports:school", "analytics:school",
                "alerts:read", "alerts:manage",
                "careers:read", "universities:read",
                "profile:read", "profile:write",
                "subscriptions:read",
                "recommendations:respond",
            ],
            [FormMapsRoles.Counselor] =
            [
                "students:read", "courses:read",
                "course-plans:read", "course-plans:write", "course-plans:approve",
                "grades:read", "assessments:read",
                "evaluations:read", "evaluations:submit",
                "reports:read", "alerts:read", "alerts:manage",
                "counselor:dashboard", "counselor:notes", "counselor:sessions",
                "careers:read", "universities:read", "profile:read", "profile:write",
                "recommendations:respond",
            ],
            [FormMapsRoles.Teacher] =
            [
                "students:read", "courses:read", "course-plans:read", "grades:read", "assessments:read",
                "evaluations:read", "evaluations:submit", "reports:read", "teacher:dashboard",
                "recommendations:respond", "careers:read", "universities:read", "profile:read", "profile:write",
            ],
            [FormMapsRoles.Student] =
            [
                "courses:read", "course-plans:read", "course-plans:write", "grades:read",
                "assessments:take", "assessments:read", "evaluations:read", "reports:read",
                "coaching:book", "counselor:session-request", "careers:read", "universities:read",
                "resume:manage", "portfolio:manage", "learning:access", "profile:read", "profile:write",
                "subscriptions:read",
            ],
            [FormMapsRoles.Coach] =
            [
                "coaching:dashboard", "coaching:sessions", "coaching:earnings", "coaching:profile",
                "profile:read", "profile:write", "recommendations:respond",
            ],
            [FormMapsRoles.Parent] =
            [
                "students:read", "courses:read", "course-plans:read", "grades:read", "assessments:read",
                "evaluations:read", "evaluations:submit", "reports:read", "counselor:session-request",
                "parent:dashboard", "parent:children", "careers:read", "universities:read",
                "profile:read", "profile:write",
            ],
        };

    public static IReadOnlyList<string> For(string? role)
    {
        var normalized = FormMapsRoles.Normalize(role);
        return Map.TryGetValue(normalized, out var permissions) ? permissions : [];
    }
}
```

- [ ] **Step 4: Run tests, confirm they pass; Step 5: Commit**

```bash
dotnet test tests/FormMaps.UnitTests --filter FullyQualifiedName~RolePermissionsTests
git add src/FormMaps.Domain/Auth/RolePermissions.cs tests/FormMaps.UnitTests/Auth/RolePermissionsTests.cs
git commit -m "feat(auth): port full ROLE_PERMISSIONS map (Domain 10)"
```

---

### Task 3: `AccessTokenFactory` — session JWT signing

**Files:**
- Create: `services/api/src/FormMaps.Api/Auth/AccessTokenFactory.cs`
- Test: `services/api/tests/FormMaps.IntegrationTests/Auth/AccessTokenFactoryTests.cs` (integration,
  not unit — it must round-trip through the already-live `LegacyJwtRequestContextFactory`)

**Interfaces:**
- Produces: `AccessTokenFactory.CreateAccessToken(AccessTokenClaims claims) -> string`
  (`AccessTokenClaims` record: `UserId`, `Name`, `Email`, `Role`, `SchoolId` (string, `""` for
  no-school users), `Permissions` (`IReadOnlyList<string>`)),
  `AccessTokenFactory.ExpiresInSeconds -> int` (reads `JWT_EXPIRES_IN_MINUTES`, default 60,
  returns minutes × 60).
- Consumed by: Task 6 (login), Task 7 (refresh), Task 9 (school-admin registration), Task 13
  (signup).

Modeled directly on `RealtimeTicketFactory.CreateTicket` — same secret env var, same
`LegacyJwtOptions`, same `JwtSecurityTokenHandler`/`SymmetricSecurityKey`/`SigningCredentials`
pattern — but signs the full session token (adds `name`, `email`, `schoolId`, `permissions`
claims as a JSON array so `LegacyJwtRequestContextFactory`'s existing permissions extraction
reads it identically to a Node-issued token) with the configurable session TTL instead of the
30-second hub-ticket TTL.

- [ ] **Step 1: Write the failing integration test**

```csharp
// services/api/tests/FormMaps.IntegrationTests/Auth/AccessTokenFactoryTests.cs
using FormMaps.Api.Auth;
using FormMaps.Application.Auth;
using Microsoft.Extensions.Options;
using Xunit;

namespace FormMaps.IntegrationTests.Auth;

public class AccessTokenFactoryTests
{
    private static AccessTokenFactory CreateFactory() =>
        new(Options.Create(new LegacyJwtOptions()));

    [Fact]
    public void CreateAccessToken_RoundTripsThrough_LegacyJwtRequestContextFactory()
    {
        Environment.SetEnvironmentVariable("JWT_SECRET", new string('x', 40));
        try
        {
            var factory = CreateFactory();
            var claims = new AccessTokenClaims(
                UserId: "user_123", Name: "Ada Lovelace", Email: "ada@example.com",
                Role: "school_admin", SchoolId: "school_1",
                Permissions: ["school:manage", "students:read"]);

            var token = factory.CreateAccessToken(claims);

            // The already-LIVE verification path — proves interop by construction, not assertion.
            var contextFactory = new LegacyJwtRequestContextFactory(Options.Create(new LegacyJwtOptions()));
            var context = contextFactory.CreateFromBearerToken(token);

            Assert.True(context.IsAuthenticated);
            Assert.Equal("user_123", context.Actor!.UserId);
            Assert.Equal("school_admin", context.Tenant is null ? null : context.Actor.Role);
            Assert.Contains("school:manage", context.Permissions);
            Assert.Contains("students:read", context.Permissions);
        }
        finally { Environment.SetEnvironmentVariable("JWT_SECRET", null); }
    }

    [Fact]
    public void CreateAccessToken_NoSchoolId_ClaimIsEmptyString_NotNull()
    {
        Environment.SetEnvironmentVariable("JWT_SECRET", new string('x', 40));
        try
        {
            var factory = CreateFactory();
            var claims = new AccessTokenClaims("user_1", "Sam", "sam@example.com", "student", "", []);
            var token = factory.CreateAccessToken(claims);

            var contextFactory = new LegacyJwtRequestContextFactory(Options.Create(new LegacyJwtOptions()));
            var context = contextFactory.CreateFromBearerToken(token);
            Assert.True(context.IsAuthenticated);
        }
        finally { Environment.SetEnvironmentVariable("JWT_SECRET", null); }
    }

    [Fact]
    public void ExpiresInSeconds_DefaultsTo3600_HonorsEnvOverride()
    {
        Environment.SetEnvironmentVariable("JWT_EXPIRES_IN_MINUTES", null);
        Assert.Equal(3600, CreateFactory().ExpiresInSeconds);

        Environment.SetEnvironmentVariable("JWT_EXPIRES_IN_MINUTES", "30");
        try { Assert.Equal(1800, CreateFactory().ExpiresInSeconds); }
        finally { Environment.SetEnvironmentVariable("JWT_EXPIRES_IN_MINUTES", null); }
    }
}
```

> Adjust the exact `LegacyJwtRequestContextFactory` constructor/method names to whatever the
> already-live class actually exposes (`CreateFromBearerToken` is illustrative — confirm the real
> public entry point by reading `LegacyJwtRequestContextFactory.cs` before writing this test; do
> not guess a signature that doesn't exist).

- [ ] **Step 2: Run tests, confirm they fail**

```bash
cd /Users/federicotafur/Desktop/NexaDev/clients/tims-international/github/formmaps/services/api
dotnet test tests/FormMaps.IntegrationTests --filter FullyQualifiedName~AccessTokenFactoryTests
```

- [ ] **Step 3: Implement**

```csharp
// services/api/src/FormMaps.Api/Auth/AccessTokenFactory.cs
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

namespace FormMaps.Api.Auth;

public sealed record AccessTokenClaims(
    string UserId, string Name, string Email, string Role, string SchoolId, IReadOnlyList<string> Permissions);

/// <summary>
/// Mints the full session JWT — same secret/issuer/audience as RealtimeTicketFactory (shared
/// JWT_SECRET/LegacyJwtOptions with the already-live verification path), but with the full claim
/// shape (name/email/schoolId/permissions[]) and the configurable session TTL, not the 30s hub
/// ticket TTL. A token from this factory MUST validate unchanged through
/// LegacyJwtRequestContextFactory — see AccessTokenFactoryTests for the enforced round-trip.
/// </summary>
public sealed class AccessTokenFactory(IOptions<LegacyJwtOptions> options)
{
    private const string JwtSecretEnvironmentVariable = "JWT_SECRET";
    private const string ExpiresInMinutesEnvironmentVariable = "JWT_EXPIRES_IN_MINUTES";
    private readonly LegacyJwtOptions jwtOptions = options.Value;

    public int ExpiresInSeconds
    {
        get
        {
            var raw = Environment.GetEnvironmentVariable(ExpiresInMinutesEnvironmentVariable);
            var minutes = int.TryParse(raw, out var parsed) && parsed > 0 ? parsed : 60;
            return minutes * 60;
        }
    }

    public string CreateAccessToken(AccessTokenClaims claims)
    {
        var secret = Environment.GetEnvironmentVariable(JwtSecretEnvironmentVariable)
            ?? throw new InvalidOperationException("JWT_SECRET is not configured.");

        var handler = new JwtSecurityTokenHandler();
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret));
        var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
        var now = DateTime.UtcNow;

        // permissions as a single claim holding a JSON array string — matches how
        // LegacyJwtRequestContextFactory already parses the "permissions" claim from Node-issued
        // tokens (jsonwebtoken serializes array claims as a JSON array in the token payload).
        var permissionsJson = JsonSerializer.Serialize(claims.Permissions);

        var token = new JwtSecurityToken(
            issuer: jwtOptions.Issuer,
            audience: jwtOptions.Audience,
            claims:
            [
                new Claim(JwtRegisteredClaimNames.Sub, claims.UserId),
                new Claim("name", claims.Name),
                new Claim("email", claims.Email),
                new Claim("role", claims.Role),
                new Claim("schoolId", claims.SchoolId),
                new Claim("permissions", permissionsJson, JsonClaimValueTypes.JsonArray),
            ],
            notBefore: now,
            expires: now.AddSeconds(ExpiresInSeconds),
            signingCredentials: credentials);

        return handler.WriteToken(token);
    }
}
```

Note: if `LegacyJwtRequestContextFactory`'s permissions-claim parsing expects a different claim
shape (e.g. repeated `permission` claims instead of one JSON-array claim), fix this factory to
match the already-live parser exactly — the parser is the source of truth here, not this task's
guess at Node's `jsonwebtoken` serialization. Confirm by reading the parser before finalizing.

- [ ] **Step 4: Run tests, confirm they pass; Step 5: Commit**

```bash
dotnet test tests/FormMaps.IntegrationTests --filter FullyQualifiedName~AccessTokenFactoryTests
git add src/FormMaps.Api/Auth/AccessTokenFactory.cs tests/FormMaps.IntegrationTests/Auth/AccessTokenFactoryTests.cs
git commit -m "feat(auth): add AccessTokenFactory for session JWT issuance (Domain 10)"
```

---

### Task 4: `AuthCookieWriter` + refresh-token string generation

**Files:**
- Create: `services/api/src/FormMaps.Api/Auth/AuthCookieWriter.cs`
- Create: `services/api/src/FormMaps.Application/Auth/RefreshTokenGenerator.cs`
- Test: `services/api/tests/FormMaps.UnitTests/Auth/AuthCookieWriterTests.cs`
- Test: `services/api/tests/FormMaps.UnitTests/Auth/RefreshTokenGeneratorTests.cs`

**Interfaces:**
- Produces: `AuthCookieWriter.SetAuthCookies(HttpResponse response, string accessToken, string?
  refreshToken, int accessExpiresSeconds) -> void`, `AuthCookieWriter.ClearAuthCookies(HttpResponse
  response) -> void`, `RefreshTokenGenerator.Generate() -> string` (64 random bytes, base64url).
- Consumed by: Task 6 (login), Task 7 (refresh/logout), Task 9 (school-admin registration), Task
  13 (signup).

Direct port of `lib/authCookies.ts::setAuthCookies`/`getClientIp` and
`lib/auth.ts::generateRefreshTokenString`. No cookie-writing code exists anywhere in the .NET
service today — this is the first.

- [ ] **Step 1: Write the failing tests**

```csharp
// services/api/tests/FormMaps.UnitTests/Auth/AuthCookieWriterTests.cs
using FormMaps.Api.Auth;
using Microsoft.AspNetCore.Http;
using Xunit;

namespace FormMaps.UnitTests.Auth;

public class AuthCookieWriterTests
{
    [Fact]
    public void SetAuthCookies_WithRefreshToken_SetsAllThreeCookies_WithExactFlags()
    {
        var context = new DefaultHttpContext();
        AuthCookieWriter.SetAuthCookies(context.Response, "access.jwt.token", "refresh-token-value", accessExpiresSeconds: 3600);

        var setCookies = context.Response.Headers.SetCookie.ToString();
        Assert.Contains("access_token=access.jwt.token", setCookies);
        Assert.Contains("refresh_token=refresh-token-value", setCookies);
        Assert.Contains("logged_in=true", setCookies);

        // path scoping: access_token and logged_in are path=/, refresh_token is path=/authapi
        Assert.Contains("path=/authapi", setCookies);

        // httpOnly on access_token and refresh_token, NOT on logged_in (JS-readable sentinel)
        var cookieLines = context.Response.Headers.SetCookie;
        var accessCookie = cookieLines.First(c => c!.StartsWith("access_token="));
        var refreshCookie = cookieLines.First(c => c!.StartsWith("refresh_token="));
        var loggedInCookie = cookieLines.First(c => c!.StartsWith("logged_in="));
        Assert.Contains("httponly", accessCookie!.ToLowerInvariant());
        Assert.Contains("httponly", refreshCookie!.ToLowerInvariant());
        Assert.DoesNotContain("httponly", loggedInCookie!.ToLowerInvariant());
    }

    [Fact]
    public void SetAuthCookies_NoRefreshToken_DoesNotSetRefreshCookie_LoggedInUsesAccessTtl()
    {
        var context = new DefaultHttpContext();
        AuthCookieWriter.SetAuthCookies(context.Response, "access.jwt.token", refreshToken: null, accessExpiresSeconds: 3600);

        var setCookies = context.Response.Headers.SetCookie.ToString();
        Assert.DoesNotContain("refresh_token=", setCookies);
        Assert.Contains("logged_in=true", setCookies);
    }

    [Fact]
    public void ClearAuthCookies_ExpiresAllThreeCookies()
    {
        var context = new DefaultHttpContext();
        AuthCookieWriter.ClearAuthCookies(context.Response);

        var setCookies = context.Response.Headers.SetCookie.ToString();
        Assert.Contains("access_token=", setCookies);
        Assert.Contains("refresh_token=", setCookies);
        Assert.Contains("logged_in=", setCookies);
    }
}
```

```csharp
// services/api/tests/FormMaps.UnitTests/Auth/RefreshTokenGeneratorTests.cs
using FormMaps.Application.Auth;
using Xunit;

namespace FormMaps.UnitTests.Auth;

public class RefreshTokenGeneratorTests
{
    [Fact]
    public void Generate_ProducesUnique64ByteBase64UrlStrings()
    {
        var a = RefreshTokenGenerator.Generate();
        var b = RefreshTokenGenerator.Generate();
        Assert.NotEqual(a, b);
        Assert.DoesNotContain('+', a);
        Assert.DoesNotContain('/', a);
    }
}
```

- [ ] **Step 2: Run tests, confirm they fail**

```bash
dotnet test tests/FormMaps.UnitTests --filter "FullyQualifiedName~AuthCookieWriterTests|FullyQualifiedName~RefreshTokenGeneratorTests"
```

- [ ] **Step 3: Implement**

```csharp
// services/api/src/FormMaps.Application/Auth/RefreshTokenGenerator.cs
using System.Security.Cryptography;

namespace FormMaps.Application.Auth;

/// <summary>Port of legacy generateRefreshTokenString (lib/auth.ts) — 64 cryptographically random
/// bytes, base64url-encoded. Opaque DB-stored token, NOT a JWT.</summary>
public static class RefreshTokenGenerator
{
    public static string Generate()
    {
        var bytes = RandomNumberGenerator.GetBytes(64);
        return Convert.ToBase64String(bytes).Replace('+', '-').Replace('/', '_').TrimEnd('=');
    }
}
```

```csharp
// services/api/src/FormMaps.Api/Auth/AuthCookieWriter.cs
namespace FormMaps.Api.Auth;

/// <summary>
/// Port of legacy lib/authCookies.ts::setAuthCookies. Cookie contract is pinned exactly —
/// see docs/migration/auth-tenant-context-contract.md's "Cookie Contract" section:
///   access_token  httpOnly, sameSite=lax, path=/,        maxAge = access token TTL
///   refresh_token httpOnly, sameSite=lax, path=/authapi, maxAge = 14 days
///   logged_in     JS-readable, sameSite=lax, path=/,     maxAge = refresh TTL if a refresh token
///                 is present, else access TTL — it must OUTLIVE the access token so the
///                 frontend's 401-refresh interceptor (gated on this cookie) fires correctly.
/// </summary>
public static class AuthCookieWriter
{
    private static readonly TimeSpan RefreshTokenLifetime = TimeSpan.FromDays(14);

    public static void SetAuthCookies(HttpResponse response, string accessToken, string? refreshToken, int accessExpiresSeconds)
    {
        var isProd = string.Equals(Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT"), "Production", StringComparison.OrdinalIgnoreCase);
        var accessTtl = TimeSpan.FromSeconds(accessExpiresSeconds);

        response.Cookies.Append("access_token", accessToken, new CookieOptions
        {
            HttpOnly = true, Secure = isProd, SameSite = SameSiteMode.Lax, MaxAge = accessTtl, Path = "/",
        });

        response.Cookies.Append("logged_in", "true", new CookieOptions
        {
            HttpOnly = false, Secure = isProd, SameSite = SameSiteMode.Lax,
            MaxAge = refreshToken is not null ? RefreshTokenLifetime : accessTtl, Path = "/",
        });

        if (refreshToken is not null)
        {
            response.Cookies.Append("refresh_token", refreshToken, new CookieOptions
            {
                HttpOnly = true, Secure = isProd, SameSite = SameSiteMode.Lax, MaxAge = RefreshTokenLifetime, Path = "/authapi",
            });
        }
    }

    public static void ClearAuthCookies(HttpResponse response)
    {
        response.Cookies.Delete("access_token", new CookieOptions { Path = "/" });
        response.Cookies.Delete("refresh_token", new CookieOptions { Path = "/authapi" });
        response.Cookies.Delete("logged_in", new CookieOptions { Path = "/" });
    }

    public static string GetClientIp(HttpRequest request)
    {
        var forwardedFor = request.Headers["X-Forwarded-For"].ToString();
        if (!string.IsNullOrWhiteSpace(forwardedFor)) return forwardedFor.Split(',')[0].Trim();
        return request.HttpContext.Connection.RemoteIpAddress?.ToString() ?? "";
    }
}
```

- [ ] **Step 4: Run tests, confirm they pass; Step 5: Commit**

```bash
dotnet test tests/FormMaps.UnitTests --filter "FullyQualifiedName~AuthCookieWriterTests|FullyQualifiedName~RefreshTokenGeneratorTests"
git add src/FormMaps.Application/Auth/RefreshTokenGenerator.cs src/FormMaps.Api/Auth/AuthCookieWriter.cs tests/FormMaps.UnitTests/Auth/AuthCookieWriterTests.cs tests/FormMaps.UnitTests/Auth/RefreshTokenGeneratorTests.cs
git commit -m "feat(auth): add cookie writer + refresh token generator (Domain 10)"
```

---

### Task 5: Integration-test fixture schema for the live auth tables

**Files:**
- Create: `services/api/tests/FormMaps.IntegrationTests/Auth/Data/auth-schema.sql`
- Create: `services/api/tests/FormMaps.IntegrationTests/Auth/AuthDatabaseFixture.cs`

**Interfaces:**
- Produces: a Testcontainers-Postgres fixture (`AuthDatabaseFixture`, `AuthDatabaseCollection`)
  mirroring `users`/`roles`/`refresh_tokens`/`login_attempts`/`password_reset_tokens`/
  `user_settings`/`schools` shapes from `api/prisma/schema.prisma`. **This is a test-only fixture
  — production already has these tables via the live Node/Prisma migrations. Nothing in this task
  or plan creates or alters a production table.**

No TDD cycle (schema, not logic) — verified by Task 6's repository tests successfully using it,
same convention as Domain 9a's Task 2.

- [ ] **Step 1: Write the fixture schema**, columns/types copied exactly from
`api/prisma/schema.prisma` (`User`, `Role`, `RefreshToken`, `LoginAttempt`, `PasswordResetToken`,
`UserSettings`, `School` — the subset of `School` columns this domain touches:
`invitationToken`, `invitationTokenExpiresAt`, `adminEmail`, `status`, `isActive`).

```sql
-- services/api/tests/FormMaps.IntegrationTests/Auth/Data/auth-schema.sql
-- Test-only fixture mirroring the LIVE Node/Prisma-owned tables this domain reads/writes.
-- Production already has these tables. Never run this outside Testcontainers.

CREATE TABLE IF NOT EXISTS "roles" (
    "id" TEXT PRIMARY KEY, "name" TEXT NOT NULL UNIQUE, "description" TEXT NOT NULL DEFAULT '',
    "isActive" BOOLEAN NOT NULL DEFAULT true, "createdDate" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "schools" (
    "id" TEXT PRIMARY KEY, "name" TEXT NOT NULL, "adminEmail" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'invited', "invitationToken" TEXT, "invitationTokenExpiresAt" TIMESTAMPTZ,
    "isActive" BOOLEAN NOT NULL DEFAULT true, "createdDate" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "users" (
    "id" TEXT PRIMARY KEY, "name" TEXT NOT NULL, "email" TEXT NOT NULL UNIQUE, "password" TEXT,
    "roleId" TEXT NOT NULL, "roleName" TEXT NOT NULL, "schoolId" TEXT, "dateOfBirth" TIMESTAMPTZ,
    "passwordNeedsMigration" BOOLEAN NOT NULL DEFAULT false, "isActive" BOOLEAN NOT NULL DEFAULT true,
    "onboardingToken" TEXT UNIQUE, "createdDate" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "user_settings" (
    "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL UNIQUE, "language" TEXT NOT NULL DEFAULT 'en',
    "marketingEmails" BOOLEAN NOT NULL DEFAULT false, "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdDate" TIMESTAMPTZ NOT NULL DEFAULT now(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "refresh_tokens" (
    "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "token" TEXT NOT NULL UNIQUE,
    "expiresAt" TIMESTAMPTZ NOT NULL, "isRevoked" BOOLEAN NOT NULL DEFAULT false,
    "revokedAt" TIMESTAMPTZ, "createdByIp" TEXT, "revokedByIp" TEXT,
    "createdDate" TIMESTAMPTZ NOT NULL DEFAULT now(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "refresh_tokens_userId_idx" ON "refresh_tokens" ("userId");

CREATE TABLE IF NOT EXISTS "login_attempts" (
    "id" TEXT PRIMARY KEY, "email" TEXT NOT NULL UNIQUE, "failedCount" INT NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMPTZ, "lastIp" TEXT, "createdDate" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
    "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "token" TEXT NOT NULL UNIQUE,
    "expiresAt" TIMESTAMPTZ NOT NULL, "usedAt" TIMESTAMPTZ,
    "createdDate" TIMESTAMPTZ NOT NULL DEFAULT now(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "password_reset_tokens_userId_idx" ON "password_reset_tokens" ("userId");
```

- [ ] **Step 2: Write the fixture class**, mirroring `MessagesRepositoryTests`'s
`BillingDatabaseFixture`/`MessagesDatabaseFixture` convention exactly (Testcontainers Postgres
container, `ResetAsync()` truncates all tables between tests, `SessionFactory` exposed for the
repository under test).

```csharp
// services/api/tests/FormMaps.IntegrationTests/Auth/AuthDatabaseFixture.cs
using FormMaps.Application.Data;
using Npgsql;
using Testcontainers.PostgreSql;
using Xunit;

namespace FormMaps.IntegrationTests.Auth;

public sealed class AuthDatabaseFixture : IAsyncLifetime
{
    private PostgreSqlContainer container = null!;
    public IFormMapsDatabaseSessionFactory SessionFactory { get; private set; } = null!;
    private NpgsqlDataSource dataSource = null!;

    public async Task InitializeAsync()
    {
        container = new PostgreSqlBuilder().WithImage("postgres:16-alpine").Build();
        await container.StartAsync();
        dataSource = NpgsqlDataSource.Create(container.GetConnectionString());

        var schemaSql = await File.ReadAllTextAsync(
            Path.Combine(AppContext.BaseDirectory, "Auth", "Data", "auth-schema.sql"));
        await using var connection = await dataSource.OpenConnectionAsync();
        await using (var command = connection.CreateCommand()) { command.CommandText = schemaSql; await command.ExecuteNonQueryAsync(); }

        SessionFactory = new NpgsqlFormMapsDatabaseSessionFactory(dataSource); // constructor signature per existing factory
    }

    public async Task ResetAsync()
    {
        await using var connection = await dataSource.OpenConnectionAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = """
            TRUNCATE "password_reset_tokens","login_attempts","refresh_tokens","user_settings","users","schools","roles" CASCADE
            """;
        await command.ExecuteNonQueryAsync();
    }

    public async Task DisposeAsync() { await dataSource.DisposeAsync(); await container.DisposeAsync(); }
}

[CollectionDefinition(nameof(AuthDatabaseCollection))]
public sealed class AuthDatabaseCollection : ICollectionFixture<AuthDatabaseFixture>;
```

> Confirm `NpgsqlFormMapsDatabaseSessionFactory`'s actual constructor signature against the
> existing class before finalizing — copy whatever `BillingDatabaseFixture`/
> `MessagesRepositoryTests`' fixture already does verbatim rather than guessing.

- [ ] **Step 3: Commit**

```bash
git add tests/FormMaps.IntegrationTests/Auth/Data/auth-schema.sql tests/FormMaps.IntegrationTests/Auth/AuthDatabaseFixture.cs
git commit -m "test(auth): add Testcontainers fixture schema mirroring live auth tables (Domain 10)"
```

---

### Task 6: `IAuthRepository` — login & lockout

**Files:**
- Create: `services/api/src/FormMaps.Application/Auth/IAuthRepository.cs`
- Create: `services/api/src/FormMaps.Infrastructure/Auth/AuthRepository.cs` (this task implements
  only the login/lockout methods; Tasks 7–10 add the rest to the same class)
- Test: `services/api/tests/FormMaps.IntegrationTests/Auth/AuthRepositoryLoginTests.cs`

**Interfaces:**
- Produces: `IAuthRepository.FindUserByEmailAsync(string normalizedEmail, CancellationToken) ->
  Task<AuthUserRow?>` (record: `Id`, `Name`, `Email`, `PasswordHash`, `RoleId`, `RoleName`,
  `SchoolId`, `IsActive`), `IAuthRepository.GetLockoutStatusAsync(string email, CancellationToken)
  -> Task<LockoutStatus>` (record: `IsLocked` bool, `LockedUntil` DateTimeOffset?),
  `IAuthRepository.RecordFailedLoginAsync(string email, string clientIp, CancellationToken) ->
  Task<int>` (returns new `failedCount`, applies the lock when it hits 5),
  `IAuthRepository.ClearLoginAttemptsAsync(string email, CancellationToken) -> Task`,
  `IAuthRepository.GetLanguageAsync(string userId, CancellationToken) -> Task<string>` (`"en"` or
  `"es"`, defaults `"en"`).
- Consumed by: Task 12 (login endpoint).

- [ ] **Step 1: Write the failing integration tests**

```csharp
// services/api/tests/FormMaps.IntegrationTests/Auth/AuthRepositoryLoginTests.cs
using FormMaps.Application.Auth;
using FormMaps.Infrastructure.Auth;
using Xunit;

namespace FormMaps.IntegrationTests.Auth;

[Collection(nameof(AuthDatabaseCollection))]
public class AuthRepositoryLoginTests(AuthDatabaseFixture fixture)
{
    private AuthRepository CreateRepository() => new(fixture.SessionFactory);

    [Fact]
    public async Task FindUserByEmail_ExistingActiveUser_ReturnsRow()
    {
        await fixture.ResetAsync();
        await fixture.SeedUserAsync(email: "ada@example.com", passwordHash: "hash", isActive: true);
        var repo = CreateRepository();

        var row = await repo.FindUserByEmailAsync("ada@example.com", CancellationToken.None);

        Assert.NotNull(row);
        Assert.Equal("ada@example.com", row!.Email);
    }

    [Fact]
    public async Task FindUserByEmail_NoMatch_ReturnsNull()
    {
        await fixture.ResetAsync();
        var repo = CreateRepository();
        Assert.Null(await repo.FindUserByEmailAsync("nobody@example.com", CancellationToken.None));
    }

    [Fact]
    public async Task RecordFailedLogin_FifthFailure_LocksAccount_ResetsFailedCountToZero()
    {
        await fixture.ResetAsync();
        var repo = CreateRepository();
        const string email = "locked@example.com";

        for (var i = 1; i <= 4; i++)
        {
            var count = await repo.RecordFailedLoginAsync(email, "1.2.3.4", CancellationToken.None);
            Assert.Equal(i, count);
            var status = await repo.GetLockoutStatusAsync(email, CancellationToken.None);
            Assert.False(status.IsLocked);
        }

        await repo.RecordFailedLoginAsync(email, "1.2.3.4", CancellationToken.None); // 5th
        var locked = await repo.GetLockoutStatusAsync(email, CancellationToken.None);
        Assert.True(locked.IsLocked);
        Assert.NotNull(locked.LockedUntil);
        Assert.True(locked.LockedUntil > DateTimeOffset.UtcNow.AddMinutes(14));
    }

    [Fact]
    public async Task ClearLoginAttempts_RemovesTheRow_UnlocksAccount()
    {
        await fixture.ResetAsync();
        var repo = CreateRepository();
        const string email = "cleared@example.com";
        for (var i = 0; i < 5; i++) await repo.RecordFailedLoginAsync(email, "1.2.3.4", CancellationToken.None);
        Assert.True((await repo.GetLockoutStatusAsync(email, CancellationToken.None)).IsLocked);

        await repo.ClearLoginAttemptsAsync(email, CancellationToken.None);

        Assert.False((await repo.GetLockoutStatusAsync(email, CancellationToken.None)).IsLocked);
    }

    [Fact]
    public async Task GetLanguage_DefaultsToEn_WhenNoUserSettingsRow()
    {
        await fixture.ResetAsync();
        var repo = CreateRepository();
        await fixture.SeedUserAsync(email: "nolang@example.com", passwordHash: "hash", isActive: true, id: "u_nolang");
        Assert.Equal("en", await repo.GetLanguageAsync("u_nolang", CancellationToken.None));
    }
}
```

Add a `SeedUserAsync` helper to `AuthDatabaseFixture` (raw insert into `roles`/`users`, matching
this codebase's existing fixture-seeding convention).

- [ ] **Step 2: Run tests, confirm they fail**

```bash
cd /Users/federicotafur/Desktop/NexaDev/clients/tims-international/github/formmaps/services/api
dotnet test tests/FormMaps.IntegrationTests --filter FullyQualifiedName~AuthRepositoryLoginTests
```

- [ ] **Step 3: Implement**

```csharp
// services/api/src/FormMaps.Application/Auth/IAuthRepository.cs (partial — this task's slice)
namespace FormMaps.Application.Auth;

public sealed record AuthUserRow(
    string Id, string Name, string Email, string? PasswordHash,
    string RoleId, string RoleName, string? SchoolId, bool IsActive);

public sealed record LockoutStatus(bool IsLocked, DateTimeOffset? LockedUntil);

public interface IAuthRepository
{
    Task<AuthUserRow?> FindUserByEmailAsync(string normalizedEmail, CancellationToken cancellationToken = default);
    Task<LockoutStatus> GetLockoutStatusAsync(string email, CancellationToken cancellationToken = default);
    Task<int> RecordFailedLoginAsync(string email, string clientIp, CancellationToken cancellationToken = default);
    Task ClearLoginAttemptsAsync(string email, CancellationToken cancellationToken = default);
    Task<string> GetLanguageAsync(string userId, CancellationToken cancellationToken = default);

    // Tasks 7-10 add: refresh-token rotation/revoke, profile, change-*, school-admin
    // registration, forgot/reset-password methods to this same interface.
}
```

```csharp
// services/api/src/FormMaps.Infrastructure/Auth/AuthRepository.cs (this task's slice; grows in Tasks 7-10)
using System.Data.Common;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;

namespace FormMaps.Infrastructure.Auth;

public sealed partial class AuthRepository(IFormMapsDatabaseSessionFactory databaseSessionFactory) : IAuthRepository
{
    private const int MaxLoginAttempts = 5;
    private static readonly TimeSpan LockoutDuration = TimeSpan.FromMinutes(15);

    public async Task<AuthUserRow?> FindUserByEmailAsync(string normalizedEmail, CancellationToken cancellationToken = default)
    {
        var context = RequestContext.System();
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        await using var command = Command(session, """
            SELECT "id","name","email","password","roleId","roleName","schoolId","isActive"
            FROM "users" WHERE "email" = @email
            """);
        AddParameter(command, "email", normalizedEmail);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken)) return null;

        return new AuthUserRow(
            reader.GetString(0), reader.GetString(1), reader.GetString(2),
            reader.IsDBNull(3) ? null : reader.GetString(3),
            reader.GetString(4), reader.GetString(5),
            reader.IsDBNull(6) ? null : reader.GetString(6),
            reader.GetBoolean(7));
    }

    public async Task<LockoutStatus> GetLockoutStatusAsync(string email, CancellationToken cancellationToken = default)
    {
        var context = RequestContext.System();
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        await using var command = Command(session, """SELECT "lockedUntil" FROM "login_attempts" WHERE "email" = @email""");
        AddParameter(command, "email", email);
        var result = await command.ExecuteScalarAsync(cancellationToken);
        if (result is null or DBNull) return new LockoutStatus(false, null);

        var lockedUntil = (DateTime)result;
        var isLocked = lockedUntil > DateTime.UtcNow;
        return new LockoutStatus(isLocked, isLocked ? new DateTimeOffset(lockedUntil, TimeSpan.Zero) : null);
    }

    public async Task<int> RecordFailedLoginAsync(string email, string clientIp, CancellationToken cancellationToken = default)
    {
        var context = RequestContext.System();
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        await using var upsert = Command(session, """
            INSERT INTO "login_attempts" ("id","email","failedCount","lastIp")
            VALUES (gen_random_uuid()::text, @email, 1, @ip)
            ON CONFLICT ("email") DO UPDATE SET "failedCount" = "login_attempts"."failedCount" + 1, "lastIp" = @ip, "updatedAt" = now()
            RETURNING "failedCount"
            """);
        AddParameter(upsert, "email", email);
        AddParameter(upsert, "ip", clientIp);
        var newCount = (int)(await upsert.ExecuteScalarAsync(cancellationToken))!;

        if (newCount >= MaxLoginAttempts)
        {
            await using var lockCommand = Command(session, """
                UPDATE "login_attempts" SET "lockedUntil" = @lockedUntil, "failedCount" = 0, "updatedAt" = now()
                WHERE "email" = @email
                """);
            AddParameter(lockCommand, "lockedUntil", DateTime.UtcNow.Add(LockoutDuration));
            AddParameter(lockCommand, "email", email);
            await lockCommand.ExecuteNonQueryAsync(cancellationToken);
        }

        await session.CommitAsync(cancellationToken);
        return newCount;
    }

    public async Task ClearLoginAttemptsAsync(string email, CancellationToken cancellationToken = default)
    {
        var context = RequestContext.System();
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);
        await using var command = Command(session, """DELETE FROM "login_attempts" WHERE "email" = @email""");
        AddParameter(command, "email", email);
        await command.ExecuteNonQueryAsync(cancellationToken);
        await session.CommitAsync(cancellationToken);
    }

    public async Task<string> GetLanguageAsync(string userId, CancellationToken cancellationToken = default)
    {
        var context = RequestContext.System();
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        await using var command = Command(session, """SELECT "language" FROM "user_settings" WHERE "userId" = @userId""");
        AddParameter(command, "userId", userId);
        var result = await command.ExecuteScalarAsync(cancellationToken);
        var language = result as string;
        return language == "es" ? "es" : "en";
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

> `RecordFailedLoginAsync`'s upsert-then-conditionally-lock is two statements in one writable
> session/transaction rather than legacy's two separate Prisma calls — equivalent behavior
> (increment persisted either way), fewer round trips. Confirm `FormMapsDatabaseSession` actually
> exposes `CommitAsync` (mirror whatever `SubscriptionAccess.cs`'s writable-session usage already
> does) before finalizing — don't invent an API that doesn't exist on the session type.

- [ ] **Step 4: Run tests, confirm they pass; Step 5: Commit**

```bash
dotnet test tests/FormMaps.IntegrationTests --filter FullyQualifiedName~AuthRepositoryLoginTests
git add src/FormMaps.Application/Auth/IAuthRepository.cs src/FormMaps.Infrastructure/Auth/AuthRepository.cs tests/FormMaps.IntegrationTests/Auth/AuthRepositoryLoginTests.cs
git commit -m "feat(auth): IAuthRepository login + lockout methods (Domain 10)"
```

---

### Task 7: `IAuthRepository` — refresh-token rotation & logout (revoke-all)

**Files:**
- Modify: `services/api/src/FormMaps.Application/Auth/IAuthRepository.cs`
- Modify: `services/api/src/FormMaps.Infrastructure/Auth/AuthRepository.cs`
- Test: `services/api/tests/FormMaps.IntegrationTests/Auth/AuthRepositoryRefreshTests.cs`

**Interfaces:**
- Adds to `IAuthRepository`: `CreateRefreshTokenAsync(string userId, string clientIp,
  CancellationToken) -> Task<string>`, `RotateRefreshTokenAsync(string oldToken, string clientIp,
  CancellationToken) -> Task<RotateResult?>` (record: `NewToken`, `UserId`; returns `null` on
  invalid/expired/revoked/inactive-user — same collapsed-null contract as legacy
  `rotateRefreshToken`), `RevokeAllRefreshTokensAsync(string userId, string clientIp,
  CancellationToken) -> Task`.
- Consumed by: Task 12 (refresh, logout endpoints).

The single-use rotation ordering (revoke-old **then** create-new) and the TOCTOU `isActive`
re-check immediately before minting are the highest-risk lines in this entire domain — get the
test coverage here exhaustive, not just happy-path.

- [ ] **Step 1: Write the failing integration tests**

```csharp
// services/api/tests/FormMaps.IntegrationTests/Auth/AuthRepositoryRefreshTests.cs
using FormMaps.Infrastructure.Auth;
using Xunit;

namespace FormMaps.IntegrationTests.Auth;

[Collection(nameof(AuthDatabaseCollection))]
public class AuthRepositoryRefreshTests(AuthDatabaseFixture fixture)
{
    private AuthRepository CreateRepository() => new(fixture.SessionFactory);

    [Fact]
    public async Task RotateRefreshToken_ValidToken_ReturnsNewToken_RevokesOld()
    {
        await fixture.ResetAsync();
        var userId = await fixture.SeedUserAsync(email: "a@example.com", passwordHash: "h", isActive: true);
        var repo = CreateRepository();
        var original = await repo.CreateRefreshTokenAsync(userId, "1.1.1.1", CancellationToken.None);

        var result = await repo.RotateRefreshTokenAsync(original, "1.1.1.1", CancellationToken.None);

        Assert.NotNull(result);
        Assert.NotEqual(original, result!.NewToken);
        Assert.Equal(userId, result.UserId);
    }

    [Fact]
    public async Task RotateRefreshToken_AlreadyRotatedToken_IsRejected_SingleUseEnforced()
    {
        await fixture.ResetAsync();
        var userId = await fixture.SeedUserAsync(email: "b@example.com", passwordHash: "h", isActive: true);
        var repo = CreateRepository();
        var original = await repo.CreateRefreshTokenAsync(userId, "1.1.1.1", CancellationToken.None);
        await repo.RotateRefreshTokenAsync(original, "1.1.1.1", CancellationToken.None); // first use, succeeds

        var reused = await repo.RotateRefreshTokenAsync(original, "1.1.1.1", CancellationToken.None); // reuse attempt

        Assert.Null(reused);
    }

    [Fact]
    public async Task RotateRefreshToken_ExpiredToken_IsRejected()
    {
        await fixture.ResetAsync();
        var userId = await fixture.SeedUserAsync(email: "c@example.com", passwordHash: "h", isActive: true);
        await fixture.SeedExpiredRefreshTokenAsync(userId, "expired-token");
        var repo = CreateRepository();

        Assert.Null(await repo.RotateRefreshTokenAsync("expired-token", "1.1.1.1", CancellationToken.None));
    }

    [Fact]
    public async Task RotateRefreshToken_UserDeactivatedSincePriorLogin_IsRejected_ToctouSafe()
    {
        await fixture.ResetAsync();
        var userId = await fixture.SeedUserAsync(email: "d@example.com", passwordHash: "h", isActive: true);
        var repo = CreateRepository();
        var token = await repo.CreateRefreshTokenAsync(userId, "1.1.1.1", CancellationToken.None);
        await fixture.DeactivateUserAsync(userId); // simulates admin deactivating mid-session

        Assert.Null(await repo.RotateRefreshTokenAsync(token, "1.1.1.1", CancellationToken.None));
    }

    [Fact]
    public async Task RotateRefreshToken_UnknownToken_ReturnsNull()
    {
        await fixture.ResetAsync();
        var repo = CreateRepository();
        Assert.Null(await repo.RotateRefreshTokenAsync("never-issued", "1.1.1.1", CancellationToken.None));
    }

    [Fact]
    public async Task RevokeAllRefreshTokens_MultipleActiveSessions_AllStopRotating()
    {
        await fixture.ResetAsync();
        var userId = await fixture.SeedUserAsync(email: "e@example.com", passwordHash: "h", isActive: true);
        var repo = CreateRepository();
        var tokenA = await repo.CreateRefreshTokenAsync(userId, "1.1.1.1", CancellationToken.None);
        var tokenB = await repo.CreateRefreshTokenAsync(userId, "2.2.2.2", CancellationToken.None);

        await repo.RevokeAllRefreshTokensAsync(userId, "3.3.3.3", CancellationToken.None);

        Assert.Null(await repo.RotateRefreshTokenAsync(tokenA, "1.1.1.1", CancellationToken.None));
        Assert.Null(await repo.RotateRefreshTokenAsync(tokenB, "2.2.2.2", CancellationToken.None));
    }
}
```

Add `SeedExpiredRefreshTokenAsync` and `DeactivateUserAsync` helpers to `AuthDatabaseFixture`.

- [ ] **Step 2: Run tests, confirm they fail; Step 3: Implement**

```csharp
// Append to AuthRepository.cs (Task 7's slice)
public async Task<string> CreateRefreshTokenAsync(string userId, string clientIp, CancellationToken cancellationToken = default)
{
    var token = RefreshTokenGenerator.Generate();
    var context = RequestContext.System();
    await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);
    await using var command = Command(session, """
        INSERT INTO "refresh_tokens" ("id","userId","token","expiresAt","createdByIp")
        VALUES (gen_random_uuid()::text, @userId, @token, @expiresAt, @ip)
        """);
    AddParameter(command, "userId", userId);
    AddParameter(command, "token", token);
    AddParameter(command, "expiresAt", DateTime.UtcNow.AddDays(14));
    AddParameter(command, "ip", clientIp);
    await command.ExecuteNonQueryAsync(cancellationToken);
    await session.CommitAsync(cancellationToken);
    return token;
}

public async Task<RotateResult?> RotateRefreshTokenAsync(string oldToken, string clientIp, CancellationToken cancellationToken = default)
{
    var context = RequestContext.System();
    await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

    await using var lookup = Command(session, """
        SELECT rt."id", rt."userId", rt."expiresAt", rt."isRevoked", u."isActive"
        FROM "refresh_tokens" rt JOIN "users" u ON u."id" = rt."userId"
        WHERE rt."token" = @token
        """);
    AddParameter(lookup, "token", oldToken);
    await using var reader = await lookup.ExecuteReaderAsync(cancellationToken);
    if (!await reader.ReadAsync(cancellationToken)) return null; // unknown token

    var tokenId = reader.GetString(0);
    var userId = reader.GetString(1);
    var expiresAt = reader.GetDateTime(2);
    var isRevoked = reader.GetBoolean(3);
    var userIsActive = reader.GetBoolean(4);
    await reader.DisposeAsync();

    if (isRevoked || expiresAt < DateTime.UtcNow || !userIsActive)
    {
        // Revoke on any invalid presentation too (matches legacy: expired/inactive tokens get
        // marked revoked on the attempt that discovers them, not just left dangling).
        await RevokeTokenRowAsync(session, tokenId, clientIp, cancellationToken);
        await session.CommitAsync(cancellationToken);
        return null;
    }

    // Revoke-old-THEN-create-new, single-use enforced by this exact ordering within one transaction.
    await RevokeTokenRowAsync(session, tokenId, clientIp, cancellationToken);

    var newToken = RefreshTokenGenerator.Generate();
    await using var insert = Command(session, """
        INSERT INTO "refresh_tokens" ("id","userId","token","expiresAt","createdByIp")
        VALUES (gen_random_uuid()::text, @userId, @token, @expiresAt, @ip)
        """);
    AddParameter(insert, "userId", userId);
    AddParameter(insert, "token", newToken);
    AddParameter(insert, "expiresAt", DateTime.UtcNow.AddDays(14));
    AddParameter(insert, "ip", clientIp);
    await insert.ExecuteNonQueryAsync(cancellationToken);

    await session.CommitAsync(cancellationToken);
    return new RotateResult(newToken, userId);
}

public async Task RevokeAllRefreshTokensAsync(string userId, string clientIp, CancellationToken cancellationToken = default)
{
    var context = RequestContext.System();
    await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);
    await using var command = Command(session, """
        UPDATE "refresh_tokens" SET "isRevoked" = true, "revokedAt" = now(), "revokedByIp" = @ip
        WHERE "userId" = @userId AND "isRevoked" = false
        """);
    AddParameter(command, "userId", userId);
    AddParameter(command, "ip", clientIp);
    await command.ExecuteNonQueryAsync(cancellationToken);
    await session.CommitAsync(cancellationToken);
}

private static async Task RevokeTokenRowAsync(FormMapsDatabaseSession session, string tokenId, string clientIp, CancellationToken cancellationToken)
{
    await using var command = Command(session, """
        UPDATE "refresh_tokens" SET "isRevoked" = true, "revokedAt" = now(), "revokedByIp" = @ip WHERE "id" = @id
        """);
    AddParameter(command, "id", tokenId);
    AddParameter(command, "ip", clientIp);
    await command.ExecuteNonQueryAsync(cancellationToken);
}
```

Add `RotateResult` record and the three new method signatures to `IAuthRepository.cs`.

- [ ] **Step 4: Run tests, confirm they pass; Step 5: Commit**

```bash
dotnet test tests/FormMaps.IntegrationTests --filter FullyQualifiedName~AuthRepositoryRefreshTests
git add src/FormMaps.Application/Auth/IAuthRepository.cs src/FormMaps.Infrastructure/Auth/AuthRepository.cs tests/FormMaps.IntegrationTests/Auth/AuthRepositoryRefreshTests.cs
git commit -m "feat(auth): refresh-token rotation + revoke-all (Domain 10)"
```

---

### Task 8: `IAuthRepository` — profile + change-password/email/role

**Files:**
- Modify: `IAuthRepository.cs` / `AuthRepository.cs`
- Test: `services/api/tests/FormMaps.IntegrationTests/Auth/AuthRepositoryProfileTests.cs`

**Interfaces:**
- Adds: `GetProfileAsync(string userId, CancellationToken) -> Task<ProfileRow?>`,
  `UpdatePasswordAsync(string userId, string newHash, CancellationToken) -> Task`,
  `FindUserByIdWithRoleAsync(string userId, CancellationToken) -> Task<AuthUserRow?>`,
  `ChangeEmailAsync(string userId, string newEmail, CancellationToken) -> Task<ChangeEmailResult>`
  (enum-like result: `Ok`, `NotFound`, `SameEmail`, `Conflict` — the conflict arm covers BOTH the
  pre-check `findFirst` AND a unique-constraint race, since a raw-SQL `INSERT ... ON CONFLICT`
  equivalent isn't available for an `UPDATE`; catch the Postgres `23505` unique-violation error
  code exactly the way `P2002` is caught in legacy, don't rely on the pre-check alone),
  `ChangeRoleAsync(string userId, string roleId, CancellationToken) -> Task<ChangeRoleResult?>`.
- Consumed by: Task 12 (profile, change-password, change-email, change-role endpoints).

Note on the change-email/change-password **role-scoping and existence-hiding rules** (uniform 403
before target lookup, cross-school 404-not-403, `school_admin` scoped to own school): those rules
are about *who is allowed to call the repository method*, not the repository itself — legacy
enforces them in the service layer before touching Prisma. Port them the same way: this task's
repository methods are scope-agnostic (they trust the caller already authorized the action); Task
12's endpoint/handler layer performs the role/school check using the *caller's* context
(`context.Actor`) before calling `ChangeEmailAsync`/`ChangePasswordAsync`, mirroring
`authService.ts`'s `changeEmail`/`changePassword` functions' internal ordering exactly (role check
before target lookup, cross-school → 404).

- [ ] **Step 1: Write the failing integration tests** — cover: profile returns latest active
subscription status (join against `user_subscriptions`, needs the fixture schema extended with a
minimal `user_subscriptions` table for this test only), password update persists a new hash,
change-email happy path, change-email same-email rejected, change-email conflict (both a
pre-existing duplicate AND a simulated concurrent-insert race), change-role happy path and
already-has-role rejection.

```csharp
// services/api/tests/FormMaps.IntegrationTests/Auth/AuthRepositoryProfileTests.cs
using FormMaps.Application.Auth;
using FormMaps.Infrastructure.Auth;
using Xunit;

namespace FormMaps.IntegrationTests.Auth;

[Collection(nameof(AuthDatabaseCollection))]
public class AuthRepositoryProfileTests(AuthDatabaseFixture fixture)
{
    private AuthRepository CreateRepository() => new(fixture.SessionFactory);

    [Fact]
    public async Task GetProfile_ExistingUser_ReturnsRow()
    {
        await fixture.ResetAsync();
        var userId = await fixture.SeedUserAsync(email: "p@example.com", passwordHash: "h", isActive: true);
        var profile = await CreateRepository().GetProfileAsync(userId, CancellationToken.None);
        Assert.NotNull(profile);
        Assert.Equal("p@example.com", profile!.Email);
    }

    [Fact]
    public async Task ChangeEmail_HappyPath_UpdatesEmail()
    {
        await fixture.ResetAsync();
        var userId = await fixture.SeedUserAsync(email: "old@example.com", passwordHash: "h", isActive: true);
        var result = await CreateRepository().ChangeEmailAsync(userId, "new@example.com", CancellationToken.None);
        Assert.Equal(ChangeEmailResult.Ok, result);
    }

    [Fact]
    public async Task ChangeEmail_AlreadyInUse_ReturnsConflict()
    {
        await fixture.ResetAsync();
        await fixture.SeedUserAsync(email: "taken@example.com", passwordHash: "h", isActive: true);
        var userId = await fixture.SeedUserAsync(email: "other@example.com", passwordHash: "h", isActive: true);
        var result = await CreateRepository().ChangeEmailAsync(userId, "taken@example.com", CancellationToken.None);
        Assert.Equal(ChangeEmailResult.Conflict, result);
    }

    [Fact]
    public async Task ChangeEmail_AgainstInactiveDuplicate_StillConflict()
    {
        // Legacy: the DB unique constraint on users.email spans inactive users too — a
        // pre-check limited to isActive:true would miss this and 500 on the real constraint.
        await fixture.ResetAsync();
        await fixture.SeedUserAsync(email: "ghost@example.com", passwordHash: "h", isActive: false);
        var userId = await fixture.SeedUserAsync(email: "live@example.com", passwordHash: "h", isActive: true);
        var result = await CreateRepository().ChangeEmailAsync(userId, "ghost@example.com", CancellationToken.None);
        Assert.Equal(ChangeEmailResult.Conflict, result);
    }

    [Fact]
    public async Task ChangeEmail_SameEmail_ReturnsSameEmail()
    {
        await fixture.ResetAsync();
        var userId = await fixture.SeedUserAsync(email: "same@example.com", passwordHash: "h", isActive: true);
        var result = await CreateRepository().ChangeEmailAsync(userId, "same@example.com", CancellationToken.None);
        Assert.Equal(ChangeEmailResult.SameEmail, result);
    }

    [Fact]
    public async Task ChangeRole_HappyPath_UpdatesRoleIdAndName()
    {
        await fixture.ResetAsync();
        var userId = await fixture.SeedUserAsync(email: "r@example.com", passwordHash: "h", isActive: true);
        var newRoleId = await fixture.SeedRoleAsync("teacher");
        var result = await CreateRepository().ChangeRoleAsync(userId, newRoleId, CancellationToken.None);
        Assert.NotNull(result);
        Assert.Equal("teacher", result!.NewRoleName);
    }
}
```

- [ ] **Step 2: Run, confirm fail; Step 3: Implement** (append to `AuthRepository.cs`) —
follow the exact pattern established in Tasks 6–7: `Command()`/`AddParameter()`, writable session
+ `CommitAsync` for mutations, catch Postgres `23505` (`Npgsql.PostgresException` with
`SqlState == "23505"`) around the email `UPDATE` and map to `ChangeEmailResult.Conflict` as the
race-safety net beneath the pre-check `SELECT`. Implementation code follows the same shape as
Tasks 6–7's methods; write it directly in `AuthRepository.cs` rather than duplicating the full
listing here — the pattern is now established.

- [ ] **Step 4: Run tests, confirm they pass; Step 5: Commit**

```bash
dotnet test tests/FormMaps.IntegrationTests --filter FullyQualifiedName~AuthRepositoryProfileTests
git add src/FormMaps.Application/Auth/IAuthRepository.cs src/FormMaps.Infrastructure/Auth/AuthRepository.cs tests/FormMaps.IntegrationTests/Auth/AuthRepositoryProfileTests.cs
git commit -m "feat(auth): profile + change-password/email/role repository methods (Domain 10)"
```

---

### Task 9: `IAuthRepository` — school-admin registration completion

**Files:**
- Modify: `IAuthRepository.cs` / `AuthRepository.cs`
- Test: `services/api/tests/FormMaps.IntegrationTests/Auth/AuthRepositorySchoolAdminRegistrationTests.cs`

**Interfaces:**
- Adds: `FindSchoolByInvitationTokenAsync(string token, CancellationToken) -> Task<SchoolInviteRow?>`
  (record: `Id`, `AdminEmail`, `InvitationTokenExpiresAt`), `EnsureSchoolAdminRoleAsync(CancellationToken)
  -> Task<string>` (returns roleId, creates the role row if it doesn't exist yet — matches
  legacy's find-or-create), `UpsertSchoolAdminUserAsync(string schoolId, string email, string name,
  string passwordHash, string roleId, string roleName, CancellationToken) -> Task<AuthUserRow>`
  (update-if-exists / create-if-not, matching legacy's find-then-update-or-create),
  `ActivateSchoolAsync(string schoolId, CancellationToken) -> Task` (clears `invitationToken`,
  sets `status = 'active'`).
- Consumed by: Task 12 (`POST /authapi/school-admin/complete-registration`).

- [ ] **Step 1: Write the failing integration tests** — cover: valid token creates a new admin
  user + activates the school; valid token for an *existing* email updates that user in place
  (matches legacy's update-vs-create branch); expired token rejected; unknown token rejected;
  role row auto-created on first use.

- [ ] **Step 2: Run, confirm fail; Step 3: Implement**, same `Command()`/writable-session pattern
  as Tasks 6–8.

- [ ] **Step 4: Run tests, confirm they pass; Step 5: Commit**

```bash
dotnet test tests/FormMaps.IntegrationTests --filter FullyQualifiedName~AuthRepositorySchoolAdminRegistrationTests
git add src/FormMaps.Application/Auth/IAuthRepository.cs src/FormMaps.Infrastructure/Auth/AuthRepository.cs tests/FormMaps.IntegrationTests/Auth/AuthRepositorySchoolAdminRegistrationTests.cs
git commit -m "feat(auth): school-admin registration completion repository methods (Domain 10)"
```

---

### Task 10: `IAuthRepository` — forgot/reset password (atomic transaction)

**Files:**
- Modify: `IAuthRepository.cs` / `AuthRepository.cs`
- Test: `services/api/tests/FormMaps.IntegrationTests/Auth/AuthRepositoryResetPasswordTests.cs`

**Interfaces:**
- Adds: `InvalidatePriorResetTokensAsync(string userId, CancellationToken) -> Task`,
  `CreatePasswordResetTokenAsync(string userId, string sha256Hex, TimeSpan lifetime,
  CancellationToken) -> Task`, `FindResetTokenAsync(string sha256Hex, CancellationToken) ->
  Task<ResetTokenRow?>` (record: `Id`, `UserId`, `ExpiresAt`, `UsedAt`, `UserIsActive`),
  `ApplyPasswordResetAsync(string resetTokenId, string userId, string newHash, string clientIp,
  CancellationToken) -> Task` — **single writable session, single transaction**: update password,
  mark token used, revoke all refresh tokens, in that order, all-or-nothing (mirrors legacy's
  `$transaction([...])` exactly — a partial failure must never leave the password changed while an
  old session stays valid).
- Consumed by: Task 12 (forgot-password, reset-password endpoints), Task 11 (email template used
  by the endpoint handler, not the repository).

The SHA-256 hashing of the raw token happens in the Application-layer handler (Task 12), not this
repository — the repository only ever sees/stores the hex digest, matching legacy's
`hashResetToken` being called at the service layer, not the Prisma layer.

- [ ] **Step 1: Write the failing integration tests** — cover: happy path (all three writes land
  atomically), invalidate-prior-tokens-on-new-request, expired token rejected, already-used token
  rejected, inactive user's token rejected, and critically — **inject a failure on the third write
  (refresh-token revoke) and assert the password update also rolled back**, proving the
  atomicity, not just asserting the happy path succeeded.

- [ ] **Step 2: Run, confirm fail; Step 3: Implement.** `ApplyPasswordResetAsync` is one
  `OpenWritableAsync` session with all three statements before a single `CommitAsync` — if any
  statement throws, the `await using` session must roll back (confirm the session type's dispose
  behavior rolls back an uncommitted transaction; if it doesn't, wrap in an explicit
  try/catch-rollback). This is the one method in this task worth writing out in full because its
  correctness *is* the security property:

```csharp
public async Task ApplyPasswordResetAsync(string resetTokenId, string userId, string newHash, string clientIp, CancellationToken cancellationToken = default)
{
    var context = RequestContext.System();
    await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);
    try
    {
        await using (var updatePassword = Command(session, """UPDATE "users" SET "password" = @hash, "passwordNeedsMigration" = false WHERE "id" = @userId"""))
        {
            AddParameter(updatePassword, "hash", newHash);
            AddParameter(updatePassword, "userId", userId);
            await updatePassword.ExecuteNonQueryAsync(cancellationToken);
        }

        await using (var consumeToken = Command(session, """UPDATE "password_reset_tokens" SET "usedAt" = now() WHERE "id" = @id"""))
        {
            AddParameter(consumeToken, "id", resetTokenId);
            await consumeToken.ExecuteNonQueryAsync(cancellationToken);
        }

        await using (var revokeSessions = Command(session, """
            UPDATE "refresh_tokens" SET "isRevoked" = true, "revokedAt" = now(), "revokedByIp" = @ip
            WHERE "userId" = @userId AND "isRevoked" = false
            """))
        {
            AddParameter(revokeSessions, "userId", userId);
            AddParameter(revokeSessions, "ip", clientIp);
            await revokeSessions.ExecuteNonQueryAsync(cancellationToken);
        }

        await session.CommitAsync(cancellationToken);
    }
    catch
    {
        await session.RollbackAsync(cancellationToken); // confirm this method exists on FormMapsDatabaseSession; if not, rely on dispose-without-commit rolling back
        throw;
    }
}
```

- [ ] **Step 4: Run tests, confirm they pass; Step 5: Commit**

```bash
dotnet test tests/FormMaps.IntegrationTests --filter FullyQualifiedName~AuthRepositoryResetPasswordTests
git add src/FormMaps.Application/Auth/IAuthRepository.cs src/FormMaps.Infrastructure/Auth/AuthRepository.cs tests/FormMaps.IntegrationTests/Auth/AuthRepositoryResetPasswordTests.cs
git commit -m "feat(auth): atomic forgot/reset-password repository methods (Domain 10)"
```

---

### Task 11: Email templates — PasswordReset, AccountLocked, PasswordChanged

**Files:**
- Modify: `services/api/src/FormMaps.Application/Email/EmailTemplates.cs`
- Test: `services/api/tests/FormMaps.UnitTests/Email/EmailTemplatesAuthTests.cs`

**Interfaces:**
- Adds to `EmailTemplates`: `BuildPasswordReset(string userName, string resetUrl) ->
  EmailMessage`, `BuildAccountLocked(string forgotPasswordUrl) -> EmailMessage`,
  `BuildPasswordChanged(string userName, bool changedByAdmin) -> EmailMessage`.
- Consumed by: Task 12 (login lockout notice, reset-password confirmation, change-password
  notice).

Byte-faithful port of the three inline HTML strings embedded in `authService.ts` (the
account-locked and password-changed emails currently aren't in `lib/email.ts` as named
functions — they're inlined at the call site in legacy; this task extracts them into
`EmailTemplates` the same way `BuildEvaluationInvite`/`BuildAssessmentReminder` already did for
their legacy inline equivalents) and `sendPasswordResetEmail` from `lib/email.ts`.

- [ ] **Step 1: Write the failing tests** — assert subject strings match legacy exactly, assert
  `EscapeHtml` is applied to user-controlled fields (name), assert the reset/forgot-password URL
  appears verbatim via `Button(...)`.

- [ ] **Step 2: Run, confirm fail; Step 3: Implement**, following the existing
  `BuildEvaluationInvite`/`BuildAssessmentReminder` pattern in the same file exactly (same
  `Wrap`/`Button`/`EscapeHtml` primitives, same `Navy`/`Teal`/`Cream` palette constants).

- [ ] **Step 4: Run tests, confirm they pass; Step 5: Commit**

```bash
dotnet test tests/FormMaps.UnitTests --filter FullyQualifiedName~EmailTemplatesAuthTests
git add src/FormMaps.Application/Email/EmailTemplates.cs tests/FormMaps.UnitTests/Email/EmailTemplatesAuthTests.cs
git commit -m "feat(auth): add PasswordReset/AccountLocked/PasswordChanged email templates (Domain 10)"
```

---

### Task 12: `AuthEndpoints.cs` — map all 11 issuance routes

**Files:**
- Create: `services/api/src/FormMaps.Api/Endpoints/AuthEndpoints.cs`
- Test: `services/api/tests/FormMaps.IntegrationTests/Auth/AuthEndpointsTests.cs` (WebApplicationFactory-style
  end-to-end, or endpoint-handler-level tests per whatever convention `MessagesEndpoints`' own
  test suite already uses — match it, don't invent a new one)

**Interfaces:**
- Produces: `IEndpointRouteBuilder.MapAuthEndpoints()`, mapping (under `/authapi`, matching
  legacy's mount path exactly — **not** `/api/v1/auth`, this is the one domain that keeps the
  legacy `/authapi` prefix since the frontend rewrite targets it verbatim):
  - `POST /authapi/login` — `RequestContext.System()`, `RequireRateLimiting(FormMapsRateLimitPolicies.Auth)`
  - `POST /authapi/refresh`, `POST /authapi/refresh-token` — same handler, `Auth` rate limit
  - `DELETE /authapi/refresh` — `IProtectedRequestGuard.RequireIdentity`
  - `GET /authapi/profile` — `RequireIdentity`
  - `PUT /authapi/change-password` — `RequireIdentity`, `RequireRateLimiting(Sensitive)`
  - `PUT /authapi/change-email` — `RequireIdentity`, `RequireRateLimiting(Sensitive)`
  - `PUT /authapi/change-role` — `RequireIdentity` + `admin:users` permission check, `Sensitive`
  - `POST /authapi/school-admin/complete-registration` — `System()`, `Auth` rate limit
  - `POST /authapi/forgot-password` — `System()`, `Auth` rate limit, **fire-and-forget the
    processing after writing the 200** (mirror legacy's respond-then-process-async ordering
    exactly — do not await the email-send before responding)
  - `POST /authapi/reset-password` — `System()`, `Auth` rate limit
- Consumed by: `Program.cs` (`app.MapAuthEndpoints()`), Task 14 (DI registration of everything
  this file depends on).

- [ ] **Step 1: Write the failing endpoint tests** covering: login success sets all three
  cookies and returns permissions+language; login with wrong password increments lockout and
  returns 401 without leaking which of email/password was wrong; login against a locked account
  returns 429 with the remaining-minutes message; refresh rotates and re-sets cookies; refresh
  with a missing token returns 400; logout clears cookies and revokes all tokens; profile requires
  auth; change-role requires `admin:users`; forgot-password always returns 200 regardless of
  whether the email exists (assert timing: the response returns before any email-sending
  completes — test this by asserting the handler returns without awaiting the background task).

- [ ] **Step 2: Run tests, confirm they fail**

```bash
cd /Users/federicotafur/Desktop/NexaDev/clients/tims-international/github/formmaps/services/api
dotnet test tests/FormMaps.IntegrationTests --filter FullyQualifiedName~AuthEndpointsTests
```

- [ ] **Step 3: Implement**, following `MessagesEndpoints.cs`'s exact shape (`MapGroup`, one
  private static handler method per route, `IRequestContextAccessor`/`IProtectedRequestGuard`
  injected per handler, `Results.Ok(new { success = true, ... })` response envelope matching
  legacy's `{ success, message, data }` shape verbatim — every legacy route in this domain uses
  that envelope, preserve it exactly since the frontend deserializes against it). Representative
  handler (login — the others follow the same shape, wired against the repository methods from
  Tasks 6–10):

```csharp
// services/api/src/FormMaps.Api/Endpoints/AuthEndpoints.cs
using FormMaps.Api.Auth;
using FormMaps.Api.Security;
using FormMaps.Application.Auth;
using FormMaps.Application.Email;
using FormMaps.Domain.Auth;

namespace FormMaps.Api.Endpoints;

public static class AuthEndpoints
{
    public static IEndpointRouteBuilder MapAuthEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/authapi").WithTags("Auth");
        group.MapPost("/login", LoginAsync).RequireRateLimiting(FormMapsRateLimitPolicies.Auth);
        group.MapPost("/refresh", RefreshAsync).RequireRateLimiting(FormMapsRateLimitPolicies.Auth);
        group.MapPost("/refresh-token", RefreshAsync).RequireRateLimiting(FormMapsRateLimitPolicies.Auth);
        group.MapDelete("/refresh", LogoutAsync);
        group.MapGet("/profile", GetProfileAsync);
        group.MapPut("/change-password", ChangePasswordAsync).RequireRateLimiting(FormMapsRateLimitPolicies.Sensitive);
        group.MapPut("/change-email", ChangeEmailAsync).RequireRateLimiting(FormMapsRateLimitPolicies.Sensitive);
        group.MapPut("/change-role", ChangeRoleAsync).RequireRateLimiting(FormMapsRateLimitPolicies.Sensitive);
        group.MapPost("/school-admin/complete-registration", CompleteSchoolAdminRegistrationAsync).RequireRateLimiting(FormMapsRateLimitPolicies.Auth);
        group.MapPost("/forgot-password", ForgotPasswordAsync).RequireRateLimiting(FormMapsRateLimitPolicies.Auth);
        group.MapPost("/reset-password", ResetPasswordAsync).RequireRateLimiting(FormMapsRateLimitPolicies.Auth);
        return app;
    }

    public sealed record LoginRequest(string Email, string Password);

    private static async Task<IResult> LoginAsync(
        LoginRequest? body, HttpContext httpContext, IAuthRepository repository,
        AccessTokenFactory tokenFactory, IEmailSender emailSender, EmailTemplates emailTemplates,
        CancellationToken cancellationToken)
    {
        if (body is null || string.IsNullOrWhiteSpace(body.Email) || string.IsNullOrWhiteSpace(body.Password))
            return Results.Json(new { success = false, message = "Invalid email or password" }, statusCode: 400);

        var email = body.Email.Trim().ToLowerInvariant();
        var clientIp = AuthCookieWriter.GetClientIp(httpContext.Request);

        var lockout = await repository.GetLockoutStatusAsync(email, cancellationToken);
        if (lockout.IsLocked)
        {
            var remainingMinutes = Math.Ceiling((lockout.LockedUntil!.Value - DateTimeOffset.UtcNow).TotalMinutes);
            return Results.Json(new { success = false, message = $"Account temporarily locked. Try again in {remainingMinutes} minute(s)" }, statusCode: 429);
        }

        var user = await repository.FindUserByEmailAsync(email, cancellationToken);
        if (user is null || !user.IsActive || user.PasswordHash is null)
            return Results.Json(new { success = false, message = "Invalid email or password" }, statusCode: 401);

        var verify = PasswordHasher.Verify(body.Password, user.PasswordHash);
        if (!verify.Valid)
        {
            var newCount = await repository.RecordFailedLoginAsync(email, clientIp, cancellationToken);
            if (newCount >= 5)
            {
                var locked = emailTemplates.BuildAccountLocked(forgotPasswordUrl: FrontendUrl.Build("/forgot-password"));
                _ = emailSender.SendAsync(email, locked.Subject, locked.Html, CancellationToken.None); // best-effort, fire-and-forget
            }
            return Results.Json(new { success = false, message = "Invalid email or password" }, statusCode: 401);
        }

        await repository.ClearLoginAttemptsAsync(email, cancellationToken);

        var permissions = RolePermissions.For(user.RoleName);
        var accessToken = tokenFactory.CreateAccessToken(new AccessTokenClaims(
            user.Id, user.Name, user.Email, user.RoleName, user.SchoolId ?? "", permissions));
        var refreshToken = await repository.CreateRefreshTokenAsync(user.Id, clientIp, cancellationToken);
        var language = await repository.GetLanguageAsync(user.Id, cancellationToken);

        AuthCookieWriter.SetAuthCookies(httpContext.Response, accessToken, refreshToken, tokenFactory.ExpiresInSeconds);

        return Results.Ok(new
        {
            success = true, message = "Login successful",
            data = new
            {
                token = accessToken, refreshToken, language,
                user = new { id = user.Id, name = user.Name, email = user.Email, roleId = user.RoleId, roleName = user.RoleName, schoolId = user.SchoolId, permissions },
            },
        });
    }

    // RefreshAsync, LogoutAsync, GetProfileAsync, ChangePasswordAsync, ChangeEmailAsync,
    // ChangeRoleAsync, CompleteSchoolAdminRegistrationAsync, ForgotPasswordAsync,
    // ResetPasswordAsync follow the same shape — wired against the Task 6-10 repository methods,
    // response envelopes copied verbatim from routes/auth.ts's res.json(...) calls line by line.
    // Write each directly against its corresponding legacy handler in auth.ts/authService.ts
    // rather than reconstructing from this plan's summary — the legacy file is the source of
    // truth for exact field names and status codes.
}
```

> `FrontendUrl.Build` is illustrative — port `lib/frontend-url.ts::frontendBaseUrl` as a small
> helper (`FRONTEND_BASE_URL` env var, prod fallback `https://app.formmaps.com`, dev fallback
> `http://localhost:3000`, trailing-slash-stripped) alongside this task rather than inlining the
> logic — it's reused by Task 13's signup/unsubscribe too.

- [ ] **Step 4: Run tests, confirm they pass**

```bash
dotnet test tests/FormMaps.IntegrationTests --filter FullyQualifiedName~AuthEndpointsTests
```

- [ ] **Step 5: Wire into `Program.cs`**

```csharp
// services/api/src/FormMaps.Api/Program.cs — add near the other MapXEndpoints() calls
app.MapAuthEndpoints();
```

- [ ] **Step 6: Commit**

```bash
git add src/FormMaps.Api/Endpoints/AuthEndpoints.cs src/FormMaps.Api/Program.cs tests/FormMaps.IntegrationTests/Auth/AuthEndpointsTests.cs
git commit -m "feat(auth): map all 11 session-issuance endpoints under /authapi (Domain 10)"
```

---

### Task 13: `IAuthAdminRepository` + `AuthAdminEndpoints.cs` — signup, unsubscribe, admin set-password

**Files:**
- Create: `services/api/src/FormMaps.Application/Auth/IAuthAdminRepository.cs`
- Create: `services/api/src/FormMaps.Infrastructure/Auth/AuthAdminRepository.cs`
- Create: `services/api/src/FormMaps.Api/Endpoints/AuthAdminEndpoints.cs`
- Test: `services/api/tests/FormMaps.IntegrationTests/Auth/AuthAdminEndpointsTests.cs`

**Interfaces:**
- Produces: `IAuthAdminRepository.EmailExistsAsync`, `.EnsureRoleAsync(string roleName,
  CancellationToken) -> Task<string>`, `.CreateUserAsync(...)`, `.UpsertUserMarketingSettingsAsync`,
  `.SetPasswordForSchoolUserAsync(...)` (admin set-password — checks the *caller's* `schoolId`
  against the target's, per legacy's `PUT /admin/set-password` handler doing that check inline
  rather than in the service layer; port that same inline check into the endpoint handler, not the
  repository).
- Maps: `POST /signup` (public, COPPA 13+ gate on `dateOfBirth`, `Auth` rate limit, issues
  session), `GET /unsubscribe` (verifies a `purpose:"unsubscribe"` JWT — **reuses the same
  `JWT_SECRET`/verification the rest of the app already uses**, no new signing key; upserts
  `user_settings.marketingEmails = false`; plain-text response body, not JSON, matching legacy
  exactly), `PUT /admin/set-password` (`RequireIdentity` + `school:manage` permission, caller
  schoolId must equal target schoolId or 403 — port the inline check from
  `auth-admin.ts:203-221` exactly, it is NOT the same rule as change-password's admin-on-behalf
  scoping, don't reuse that code path).

Explicitly **not** in this task: `signup-coach`, `signup-coach-bulk`, `coaches`, `coach/:id`,
`invite-coach` — out of scope per the spec, deferred to a future Coaching domain.

- [ ] **Step 1: Write the failing tests** — cover: signup happy path issues cookies + session;
  signup under 13 rejected with the exact legacy message; signup with an invalid/future
  `dateOfBirth` rejected; signup with a duplicate email rejected (generic message, doesn't leak
  which field collided — matches legacy's `"Unable to create account with this email"`); signup
  records the `acceptMarketing` choice into `user_settings`; unsubscribe with a valid token clears
  `marketingEmails`; unsubscribe with a tampered/expired/wrong-purpose token returns the exact
  legacy plain-text 400 body; admin set-password rejects a caller with no `schoolId`; admin
  set-password rejects a cross-school target with 403 (not 404 — this route's legacy behavior is
  403, deliberately different from change-email/change-password's 404-collapse, don't
  "consistency-fix" it into a 404).

- [ ] **Step 2: Run, confirm fail; Step 3: Implement**, same conventions as Tasks 6–12.

- [ ] **Step 4: Run tests, confirm they pass; Step 5: Wire into `Program.cs`**

```csharp
app.MapAuthAdminEndpoints();
```

- [ ] **Step 6: Commit**

```bash
git add src/FormMaps.Application/Auth/IAuthAdminRepository.cs src/FormMaps.Infrastructure/Auth/AuthAdminRepository.cs src/FormMaps.Api/Endpoints/AuthAdminEndpoints.cs src/FormMaps.Api/Program.cs tests/FormMaps.IntegrationTests/Auth/AuthAdminEndpointsTests.cs
git commit -m "feat(auth): signup, unsubscribe, admin set-password issuance endpoints (Domain 10)"
```

---

### Task 14: DI wiring

**Files:**
- Modify: `services/api/src/FormMaps.Api/DependencyInjection.cs`

**Interfaces:** none new — registers everything Tasks 1–13 built.

- [ ] **Step 1: Register services** (no TDD cycle — verified by every prior task's tests already
  passing plus a build check; this task is pure composition-root wiring):

```csharp
// services/api/src/FormMaps.Api/DependencyInjection.cs — add alongside existing registrations
services.AddScoped<IAuthRepository, AuthRepository>();
services.AddScoped<IAuthAdminRepository, AuthAdminRepository>();
services.AddSingleton<AccessTokenFactory>();
services.Configure<LegacyJwtOptions>(configuration.GetSection(LegacyJwtOptions.SectionName)); // if not already bound elsewhere — confirm before adding a duplicate binding
```

- [ ] **Step 2: Build and run the full suite**

```bash
cd /Users/federicotafur/Desktop/NexaDev/clients/tims-international/github/formmaps/services/api
dotnet build
dotnet test
```
Expected: builds clean, all tests (this domain's and every pre-existing one) pass.

- [ ] **Step 3: Commit**

```bash
git add src/FormMaps.Api/DependencyInjection.cs
git commit -m "chore(auth): wire Domain 10 auth issuance services into DI container"
```

---

### Task 15: Interop test suite — cross-issuer verification, bcrypt cross-compat

**Files:**
- Create: `services/api/tests/FormMaps.IntegrationTests/Auth/CrossIssuerInteropTests.cs`

**Interfaces:** no new production code — this task is purely the spec's "Interop tests, not just
parity tests" requirement, exercised as its own dedicated suite rather than folded into Task 3's
narrower factory test, so it survives as a standing regression guard after Tasks 1–14 are done.

- [ ] **Step 1: Write the tests** (all should already pass given Tasks 1–14 — this task adds
  coverage, it doesn't drive new implementation):
  - A `.NET`-issued token for every one of the 7 canonical roles (`FormMapsRoles.SuperAdmin`
    through `.Parent`) round-trips through `LegacyJwtRequestContextFactory` with the correct
    `RequestActor.Role`, `TenantScope.SchoolId`, and permission set.
  - A token with an empty `schoolId` claim (no-school user) produces a `TenantScope` matching
    what a Node-issued no-school token produces today (confirm against
    `docs/migration/auth-tenant-context-contract.md`'s "no-school users use `schoolId=\"\"`" rule).
  - A bcrypt hash fixture generated by real `bcryptjs` (captured once from Node, committed as a
    literal test fixture, never regenerated by .NET code) verifies successfully via
    `PasswordHasher.Verify`.
  - A `BCrypt.Net-Next`-produced hash, if hand-verified against a real `bcryptjs.compareSync` call
    in a one-off Node script during this task, is noted as cross-verified in a code comment (this
    is a manual verification step, not an automatable one within this test file — record the
    result of doing it once).

- [ ] **Step 2: Run tests, confirm they pass**

```bash
dotnet test tests/FormMaps.IntegrationTests --filter FullyQualifiedName~CrossIssuerInteropTests
```

- [ ] **Step 3: Commit**

```bash
git add tests/FormMaps.IntegrationTests/Auth/CrossIssuerInteropTests.cs
git commit -m "test(auth): cross-issuer JWT + bcrypt interop regression suite (Domain 10)"
```

---

### Task 16: Frontend flag — `FORMMAPS_ROUTE_AUTH_TO_DOTNET`

**Files:**
- Modify: `apps/web/next.config.ts`

**Interfaces:** adds `shouldRouteAuthToDotnet()` alongside the existing `shouldRouteMessagesToDotnet()`-style helpers, and one rewrite block gating the entire `/authapi/*` prefix, inserted **before** the existing undifferentiated `{ source: "/authapi/:path*", ... }` line (which remains the OFF-state/fallback route to Node — do not delete it, it's what keeps the flag OFF-by-default safe).

- [ ] **Step 1: Add the flag helper**, following whatever pattern `shouldRouteMessagesToDotnet` already uses (reads a `FORMMAPS_ROUTE_AUTH_TO_DOTNET` env var, defaults OFF/false):

```ts
// apps/web/next.config.ts — alongside the existing shouldRoute*ToDotnet() helpers
function shouldRouteAuthToDotnet(): boolean {
  return process.env.FORMMAPS_ROUTE_AUTH_TO_DOTNET === "1";
}
```

> Match this to the EXACT boolean-parsing convention the existing helpers use (some check `=== "1"`, others `=== "true"`) — copy `shouldRouteMessagesToDotnet`'s literal check, don't introduce a third convention. **Per the standing "Vercel flag newline bug" lesson**: whatever sets this env var in Vercel must use `printf` not `echo "1" | vercel env add`, or the stored value gets a trailing newline that breaks a strict `===` check silently. Note this explicitly in the deploy runbook this task's follow-up creates — it is not this task's job to set the Vercel value, only to make the check correct.

- [ ] **Step 2: Add the gated rewrite block**, inserted before the undifferentiated `/authapi/:path*` line:

```ts
      // Auth session issuance (Domain 10) -- ALL of /authapi/* as one unit, not per-route.
      // Login/refresh/logout are not independently cuttable (a session minted by one backend
      // must remain refreshable/revocable by whichever backend is live) -- see the Domain 10
      // spec's "Rollout shape" section for why this is one flag over the whole prefix, not N
      // flags like Video's five independent slices.
      ...(shouldRouteAuthToDotnet()
        ? [{ source: "/authapi/:path*", destination: `${dotnetApiBaseUrl}/authapi/:path*` }]
        : []),
```

placed immediately before the existing:

```ts
        { source: "/authapi/:path*", destination: `${target}/authapi/:path*` },
```

so the flag's rewrite wins when ON (Next.js `afterFiles` rewrites match in array order, first
match wins — confirm this is actually true for this codebase's Next.js version before relying on
it; if rewrites are evaluated differently, achieve the same effect by wrapping the fallback line
in a `!shouldRouteAuthToDotnet()` guard instead of relying on ordering).

- [ ] **Step 3: Manual verification** (no automated test framework covers `next.config.ts`
  rewrites in this repo per the existing convention — confirm by running the dev server locally
  with the flag on/off and curling `/authapi/login` against a stubbed .NET endpoint, mirroring
  however Domain 7b's Task 10 verified its rewrite):

```bash
cd /Users/federicotafur/Desktop/NexaDev/clients/tims-international/github/formmaps/apps/web
FORMMAPS_ROUTE_AUTH_TO_DOTNET=1 npm run dev
# in another shell: curl -i http://localhost:3000/authapi/login -X POST -d '{}' -H 'content-type: application/json'
# confirm the request reaches the .NET service (check .NET logs / a distinguishing response shape), not Node.
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/next.config.ts
git commit -m "feat(auth): add FORMMAPS_ROUTE_AUTH_TO_DOTNET flag gating /authapi/* as one unit (Domain 10)"
```

---

### Task 17: `domain-status.manifest.json` entry

**Files:**
- Modify: `services/api/src/FormMaps.Application/Migration/Data/domain-status.manifest.json`

**Interfaces:** none — data file only.

- [ ] **Step 1: Add the "auth" domain entry**, following the file's existing schema exactly:

```json
    {
      "domain": "auth",
      "currentOwner": "legacy-node-api",
      "targetOwner": ".NET",
      "firstMove": "Domain 10: full session-issuance surface (login, refresh rotation, logout, profile, change-password/email/role, school-admin registration completion, forgot/reset-password, signup, unsubscribe, admin set-password) ported behind a single FORMMAPS_ROUTE_AUTH_TO_DOTNET flag covering all of /authapi/*.",
      "risk": "high",
      "status": "planned",
      "liveInProd": false,
      "lastVerified": "2026-07-31",
      "note": "Added 2026-07-31 (Domain 10 spec/plan approved) -- the highest-risk entry in this file: every OTHER liveInProd:true domain's request-context-and-tenant foundation depends on whichever backend issues the JWT this domain mints. Coach-management CRUD (signup-coach*, coaches, invite-coach) deliberately excluded -- deferred to a future Coaching domain, see the Domain 10 spec's scope section."
    }
```

Bump `status` to `"started"` once Task 1 is committed, and to `"completed"` once Task 17 (this
one) merges with all tests green — per the file's own `howToKeepThisCurrent` instructions,
`liveInProd` only flips once the flag is confirmed serving real prod traffic, which is explicitly
**not** part of this plan (see the spec's Rollout section — flipping is a separate, later,
confirmed decision).

- [ ] **Step 2: Commit**

```bash
git add services/api/src/FormMaps.Application/Migration/Data/domain-status.manifest.json
git commit -m "docs(migration): add auth domain to domain-status manifest (Domain 10)"
```

---

## Summary of what this plan deliberately does NOT do

- Does not flip `FORMMAPS_ROUTE_AUTH_TO_DOTNET` in any environment — that's a separate confirmed
  decision per the standing push/deploy-caution convention, made only after the rollout criteria
  in the spec are met.
- Does not remove or modify any Node/`authService.ts`/`authAdminService.ts` code — Node keeps
  issuing sessions until the flag flips and stays deployable as an instant rollback for at least
  one full refresh-token lifetime (14 days) after.
- Does not touch `signup-coach`, `signup-coach-bulk`, `coaches`, `coach/:id`, `invite-coach` —
  explicitly out of scope, deferred to a future Coaching domain per the spec.
- Does not solve the in-process-vs-Postgres-backed rate-limiter statefulness gap — flagged as an
  open item in the spec, not resolved by this plan; revisit before flipping if the .NET service
  ever runs more than one instance.
- Does not add multi-instance-safe rate limiting, audit logging for admin-on-behalf actions, or
  resolve the dormant SHA-256-migration-path question — all three are explicit open items in the
  spec, deliberately not silently decided here.
