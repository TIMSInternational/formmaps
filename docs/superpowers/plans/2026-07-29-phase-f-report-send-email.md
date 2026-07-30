# Phase F — report.ts send-report-email Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port `report.ts`'s `POST /send-report-email/:userId` to `.NET`, dark behind one new flag, plus the frontend rewrite.

**Architecture:** One new template method on the already-existing `EmailTemplates` class, one new minimal user-lookup reader, one new endpoints file wiring `IUserAccessGuard` + the reader + `IEmailSender` together. No new DI registrations — `IEmailSender`, `EmailTemplates`, and `IUserAccessGuard` are already registered.

**Tech Stack:** .NET minimal APIs, Npgsql (raw SQL), xUnit + Testcontainers.Postgres, `WebApplicationFactory<Program>`.

## Global Constraints

- Access failures → 404 "Not found" (never 403), matching every other cross-user report route already ported.
- `IEmailSender.SendAsync` never throws — a mailer outage returns `false`, and the endpoint must surface that as `emailSent: false` in a `200`, not an error.
- This is a **byte-for-byte port of existing behavior** — legacy sends a fixed canned paragraph, no report data, no attachment. Do not add anything legacy doesn't already send.
- Local commits only — no push, no PR, no staging deploy, no flag flip. New flag defaults OFF.

---

### Task 1: `EmailTemplates.BuildReportEmail` — the canned report-ready email

**Files:**
- Modify: `services/api/src/FormMaps.Application/Email/EmailTemplates.cs`
- Modify: `services/api/tests/FormMaps.UnitTests/Email/EmailTemplatesTests.cs`

**Interfaces:**
- Produces: `EmailMessage EmailTemplates.BuildReportEmail(string studentName)` — subject `"FormMaps — Student Report for {studentName}"` (studentName **raw**, not escaped — matches `BuildEvaluationInvite`'s subject convention, per legacy `sendReportEmail`'s exact string interpolation), body `<h2>Student Report: {EscapeHtml(studentName)}</h2><p>Your latest assessment report is ready. Log in to view your full results.</p><p>Log in to view the full report: <a href="{FrontendUrl}/dashboard">{FrontendUrl}/dashboard</a></p>`, wrapped via the existing `Wrap()`.

- [ ] **Step 1: Write the failing test**

```csharp
// services/api/tests/FormMaps.UnitTests/Email/EmailTemplatesTests.cs — ADD as a new [Fact] in the existing class:

    [Fact]
    public void ReportEmail_subject_is_raw_studentName_body_escapes_name_and_links_to_dashboard()
    {
        var msg = Templates().BuildReportEmail("Ana \"A\" & Co");

        Assert.Equal("FormMaps — Student Report for Ana \"A\" & Co", msg.Subject);
        Assert.Contains("Student Report: Ana &quot;A&quot; &amp; Co", msg.Html);
        Assert.Contains("Your latest assessment report is ready. Log in to view your full results.", msg.Html);
        Assert.Contains("https://app.formmaps.com/dashboard", msg.Html);
        Assert.Contains("postal-addr", msg.Html); // branded shell present
    }
```

- [ ] **Step 2: Run to verify it fails**

Run: `dotnet test services/api/tests/FormMaps.UnitTests --filter FullyQualifiedName~ReportEmail_subject_is_raw_studentName`
Expected: FAIL — `BuildReportEmail` does not exist yet.

- [ ] **Step 3: Add the method to `EmailTemplates.cs`**

```csharp
// services/api/src/FormMaps.Application/Email/EmailTemplates.cs — ADD as a new public method, next to
// BuildEvaluationInvite/BuildAssessmentReminder:

    /// <summary>Report-ready notification — mirrors sendReportEmail (email.ts:243). studentName is RAW in the
    /// subject (matches TS) and escaped in the body, same asymmetry as BuildEvaluationInvite. The body content is
    /// a FIXED canned paragraph in legacy (report.ts always passes the same literal reportHtml) — not a
    /// caller-supplied parameter, so it isn't one here either.</summary>
    public EmailMessage BuildReportEmail(string studentName)
    {
        var subject = $"FormMaps — Student Report for {studentName}";
        var body =
            $"""
                <h2 style="color:#102B47">Student Report: {EscapeHtml(studentName)}</h2>
                <p>Your latest assessment report is ready. Log in to view your full results.</p>
                <p>Log in to view the full report: <a href="{options.FrontendUrl}/dashboard">{options.FrontendUrl}/dashboard</a></p>
            """;
        return new EmailMessage(subject, Wrap(body));
    }
```

- [ ] **Step 4: Run to verify it passes**

Run: `dotnet test services/api/tests/FormMaps.UnitTests --filter FullyQualifiedName~ReportEmail_subject_is_raw_studentName`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/api/src/FormMaps.Application/Email/EmailTemplates.cs services/api/tests/FormMaps.UnitTests/Email/EmailTemplatesTests.cs
git commit -m "feat(report): add EmailTemplates.BuildReportEmail (send-report-email template)"
```

---

### Task 2: `IReportEmailRecipientReader` — minimal user lookup

**Files:**
- Create: `services/api/src/FormMaps.Application/Reports/IReportEmailRecipientReader.cs`
- Create: `services/api/src/FormMaps.Infrastructure/Reports/ReportEmailRecipientReader.cs`
- Test: `services/api/tests/FormMaps.IntegrationTests/Reports/ReportEmailRecipientReaderTests.cs`

**Interfaces:**
- Produces: `Task<ReportEmailRecipient?> IReportEmailRecipientReader.FindAsync(RequestContext context, string userId, CancellationToken ct = default)` — a 3-column lookup (`id, email, name`), `null` if the user doesn't exist. Deliberately NOT reusing `IUserReportReader` (which runs the full GPA/PCA/MIL/eval360/enrollment query set this endpoint doesn't need — a lean, single-purpose reader matching legacy's own `prisma.user.findUnique({select:{id,email,name}})`).

```csharp
// services/api/src/FormMaps.Application/Reports/IReportEmailRecipientReader.cs
using FormMaps.Application.Auth;

namespace FormMaps.Application.Reports;

public interface IReportEmailRecipientReader
{
    Task<ReportEmailRecipient?> FindAsync(
        RequestContext context, string userId, CancellationToken cancellationToken = default);
}

public sealed record ReportEmailRecipient(string Id, string Email, string Name);
```

```csharp
// services/api/src/FormMaps.Infrastructure/Reports/ReportEmailRecipientReader.cs
using FormMaps.Application.Auth;
using FormMaps.Application.Data;
using FormMaps.Application.Reports;

namespace FormMaps.Infrastructure.Reports;

/// <summary>
/// Minimal recipient lookup for POST /send-report-email/:userId (routes/report.ts:76) — id/email/name only, under
/// the caller's read-only session (same as every other report reader in this domain).
/// </summary>
public sealed class ReportEmailRecipientReader(
    IFormMapsDatabaseSessionFactory databaseSessionFactory) : IReportEmailRecipientReader
{
    public async Task<ReportEmailRecipient?> FindAsync(
        RequestContext context, string userId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        await using var command = session.Connection.CreateCommand();
        command.Transaction = session.Transaction;
        command.CommandText = """SELECT "id", "email", "name" FROM "users" WHERE "id" = @id""";
        var parameter = command.CreateParameter();
        parameter.ParameterName = "id";
        parameter.Value = userId;
        command.Parameters.Add(parameter);

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return null;
        }

        return new ReportEmailRecipient(reader.GetString(0), reader.GetString(1), reader.GetString(2));
    }
}
```

- [ ] **Step 1: Write the failing integration test**

```csharp
// services/api/tests/FormMaps.IntegrationTests/Reports/ReportEmailRecipientReaderTests.cs
using FormMaps.Application.Auth;
using FormMaps.Domain.Auth;
using FormMaps.Infrastructure.Data;
using FormMaps.Infrastructure.Reports;
using Npgsql;

namespace FormMaps.IntegrationTests.Reports;

/// <summary>Reuses an existing Reports Testcontainers fixture that already has a "users" table (confirm which
/// fixture other Reports tests use, e.g. UserReportEndpointsTests' companion database fixture, and reference the
/// SAME fixture class here via IClassFixture — do not create a second users-table schema file).</summary>
public sealed class ReportEmailRecipientReaderTests : IClassFixture<ReportsDatabaseFixture>
{
    private readonly ReportsDatabaseFixture _fixture;

    public ReportEmailRecipientReaderTests(ReportsDatabaseFixture fixture) => _fixture = fixture;

    private ReportEmailRecipientReader CreateReader() =>
        new(new FormMapsDatabaseSessionFactory(_fixture.ConnectionString));

    private static RequestContext SystemContext() => RequestContext.System();

    private async Task InsertUserAsync(string id, string email, string name)
    {
        await using var connection = new NpgsqlConnection(_fixture.ConnectionString);
        await connection.OpenAsync();
        await using var command = new NpgsqlCommand(
            """INSERT INTO "users" ("id","email","name") VALUES (@id,@email,@name)""", connection);
        command.Parameters.AddWithValue("id", id);
        command.Parameters.AddWithValue("email", email);
        command.Parameters.AddWithValue("name", name);
        await command.ExecuteNonQueryAsync();
    }

    [Fact]
    public async Task FindAsync_returns_null_for_unknown_user()
    {
        var reader = CreateReader();
        Assert.Null(await reader.FindAsync(SystemContext(), "does-not-exist"));
    }

    [Fact]
    public async Task FindAsync_returns_id_email_name_for_existing_user()
    {
        await InsertUserAsync("u-1", "student@example.com", "Ana Student");
        var reader = CreateReader();

        var recipient = await reader.FindAsync(SystemContext(), "u-1");

        Assert.NotNull(recipient);
        Assert.Equal("u-1", recipient!.Id);
        Assert.Equal("student@example.com", recipient.Email);
        Assert.Equal("Ana Student", recipient.Name);
    }
}
```

**Before writing this test**, find the actual fixture class name and its `users` table schema by running:
`grep -rln "IClassFixture" services/api/tests/FormMaps.IntegrationTests/Reports/*.cs` and reading whichever fixture the existing 7 report-reader test files already share — reuse that exact class and its connection string property name (adjust `ReportsDatabaseFixture` above to whatever it's actually called; do not invent a second Reports schema fixture).

- [ ] **Step 2: Run to verify it fails**

Run: `dotnet test services/api/tests/FormMaps.IntegrationTests --filter FullyQualifiedName~ReportEmailRecipientReaderTests`
Expected: FAIL — `IReportEmailRecipientReader`/`ReportEmailRecipientReader` don't exist yet.

- [ ] **Step 3: Create both files** exactly as shown above.

- [ ] **Step 4: Run to verify it passes**

Run: `dotnet test services/api/tests/FormMaps.IntegrationTests --filter FullyQualifiedName~ReportEmailRecipientReaderTests`
Expected: PASS, 2 tests.

- [ ] **Step 5: Register the DI binding**

```csharp
// services/api/src/FormMaps.Infrastructure/DependencyInjection.cs — add near the other Reports reader registrations:
services.AddScoped<IReportEmailRecipientReader, ReportEmailRecipientReader>();
```

- [ ] **Step 6: Commit**

```bash
git add services/api/src/FormMaps.Application/Reports/IReportEmailRecipientReader.cs services/api/src/FormMaps.Infrastructure/Reports/ReportEmailRecipientReader.cs services/api/tests/FormMaps.IntegrationTests/Reports/ReportEmailRecipientReaderTests.cs services/api/src/FormMaps.Infrastructure/DependencyInjection.cs
git commit -m "feat(report): add IReportEmailRecipientReader (minimal id/email/name lookup for send-report-email)"
```

---

### Task 3: `ReportEmailEndpoints.cs` — wire `POST /send-report-email/:userId`

**Files:**
- Create: `services/api/src/FormMaps.Api/Endpoints/ReportEmailEndpoints.cs`
- Modify: `services/api/src/FormMaps.Api/Program.cs:31` (add the mapping call, right after `app.MapReportEndpoints();`)
- Test: `services/api/tests/FormMaps.IntegrationTests/Reports/ReportEmailEndpointsTests.cs`

**Interfaces:**
- Consumes: `IUserAccessGuard.CanAccessUserAsync` (existing), `IReportEmailRecipientReader.FindAsync` (Task 2), `EmailTemplates.BuildReportEmail` (Task 1), `IEmailSender.SendAsync` (existing), `IProtectedRequestGuard.RequireIdentity` (existing).
- Produces: `MapReportEmailEndpoints(this IEndpointRouteBuilder app)`.

```csharp
using FormMaps.Application.Auth;
using FormMaps.Application.Email;
using FormMaps.Application.Reports;

namespace FormMaps.Api.Endpoints;

/// <summary>
/// report.ts send-report-email (Phase F) — routes/report.ts:71. POST /api/v1/reports/send-report-email/:userId:
/// IUserAccessGuard cross-user check, fetch {id,email,name}, send the canned "report ready" email via the
/// existing IEmailSender/EmailTemplates rail. Dark behind FORMMAPS_ROUTE_SEND_REPORT_EMAIL_TO_DOTNET. No PDF, no
/// attachment — legacy never generates one for this route.
/// </summary>
public static class ReportEmailEndpoints
{
    public static IEndpointRouteBuilder MapReportEmailEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGroup("/api/v1/reports").WithTags("ReportEmail")
            .MapPost("/send-report-email/{userId}", SendReportEmailAsync);
        return app;
    }

    private static async Task<IResult> SendReportEmailAsync(
        IRequestContextAccessor accessor, IProtectedRequestGuard guard, IUserAccessGuard userAccessGuard,
        IReportEmailRecipientReader recipientReader, EmailTemplates templates, IEmailSender emailSender,
        string userId, CancellationToken ct)
    {
        var context = accessor.Current;
        var identity = guard.RequireIdentity(context);
        if (!identity.Allowed)
        {
            return Results.Json(
                new { success = false, code = identity.Code, message = identity.Message },
                statusCode: identity.StatusCode);
        }

        if (!await userAccessGuard.CanAccessUserAsync(context, userId, ct))
        {
            return NotFound("Not found");
        }

        var recipient = await recipientReader.FindAsync(context, userId, ct);
        if (recipient is null)
        {
            return NotFound("User not found");
        }

        var message = templates.BuildReportEmail(recipient.Name);
        var emailSent = await emailSender.SendAsync(recipient.Email, message.Subject, message.Html, ct);

        return Results.Ok(new { success = true, data = new { emailSent, recipient = recipient.Email } });
    }

    private static IResult NotFound(string message) =>
        Results.Json(new { success = false, message }, statusCode: StatusCodes.Status404NotFound);
}
```

- [ ] **Step 1: Create `ReportEmailEndpoints.cs`** with the exact code above.

- [ ] **Step 2: Register it in `Program.cs`**

```csharp
// services/api/src/FormMaps.Api/Program.cs:31 — immediately after app.MapReportEndpoints();
app.MapReportEmailEndpoints();
```

- [ ] **Step 3: Build**

Run: `dotnet build services/api/src/FormMaps.Api/FormMaps.Api.csproj`
Expected: builds clean.

- [ ] **Step 4: Write the failing endpoint tests**

```csharp
// services/api/tests/FormMaps.IntegrationTests/Reports/ReportEmailEndpointsTests.cs
using System.Net;
using System.Text.Json;
using FormMaps.Api.Auth;
using FormMaps.Application.Auth;
using FormMaps.Application.Email;
using FormMaps.Application.Reports;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;

namespace FormMaps.IntegrationTests.Reports;

/// <summary>Guard chain + routing for POST /send-report-email/:userId (Phase F). Pins: anon 401, access-denied
/// 404, unknown-recipient 404, and the emailSent:false pass-through when IEmailSender itself reports failure
/// (never surfaced as an error — matches "a mailer outage can't fail the calling write").</summary>
public sealed class ReportEmailEndpointsTests
{
    [Fact]
    public async Task Anonymous_is_401()
    {
        using var factory = new Factory(new FakeGuard(true), new FakeReader(), new FakeSender(true));
        using var client = factory.CreateClient();
        var response = await client.PostAsync("/api/v1/reports/send-report-email/u-1", null);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Access_denied_is_404()
    {
        using var factory = new Factory(new FakeGuard(false), new FakeReader(), new FakeSender(true));
        using var client = factory.CreateClient();
        var response = await Send(factory.CreateClient(), "u-1");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Unknown_recipient_is_404()
    {
        using var factory = new Factory(new FakeGuard(true), new FakeReader { Recipient = null }, new FakeSender(true));
        var response = await Send(factory.CreateClient(), "u-1");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Success_returns_emailSent_true_and_recipient_address()
    {
        var reader = new FakeReader { Recipient = new ReportEmailRecipient("u-1", "student@example.com", "Ana") };
        using var factory = new Factory(new FakeGuard(true), reader, new FakeSender(true));
        var response = await Send(factory.CreateClient(), "u-1");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = doc.RootElement.GetProperty("data");
        Assert.True(data.GetProperty("emailSent").GetBoolean());
        Assert.Equal("student@example.com", data.GetProperty("recipient").GetString());
    }

    [Fact]
    public async Task Mailer_failure_still_returns_200_with_emailSent_false()
    {
        var reader = new FakeReader { Recipient = new ReportEmailRecipient("u-1", "student@example.com", "Ana") };
        using var factory = new Factory(new FakeGuard(true), reader, new FakeSender(false));
        var response = await Send(factory.CreateClient(), "u-1");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.False(doc.RootElement.GetProperty("data").GetProperty("emailSent").GetBoolean());
    }

    private static Task<HttpResponseMessage> Send(HttpClient client, string userId)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/reports/send-report-email/{userId}");
        request.Headers.Add(DevelopmentRequestContextFactory.UserIdHeader, "caller-1");
        request.Headers.Add(DevelopmentRequestContextFactory.RoleHeader, "school_admin");
        request.Headers.Add(DevelopmentRequestContextFactory.EmailHeader, "a@e.st");
        request.Headers.Add(DevelopmentRequestContextFactory.NameHeader, "Admin");
        request.Headers.Add(DevelopmentRequestContextFactory.PermissionsHeader, "");
        return client.SendAsync(request);
    }

    private sealed class Factory(FakeGuard guard, FakeReader reader, FakeSender sender) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(Environments.Development);
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<IUserAccessGuard>();
                services.AddSingleton<IUserAccessGuard>(guard);
                services.RemoveAll<IReportEmailRecipientReader>();
                services.AddSingleton<IReportEmailRecipientReader>(reader);
                services.RemoveAll<IEmailSender>();
                services.AddSingleton<IEmailSender>(sender);
            });
        }
    }

    private sealed class FakeGuard(bool allow) : IUserAccessGuard
    {
        public Task<bool> CanAccessUserAsync(RequestContext caller, string targetUserId, CancellationToken ct = default) =>
            Task.FromResult(allow);
    }

    private sealed class FakeReader : IReportEmailRecipientReader
    {
        public ReportEmailRecipient? Recipient { get; init; } = new("u-1", "student@example.com", "Ana");
        public Task<ReportEmailRecipient?> FindAsync(RequestContext context, string userId, CancellationToken ct = default) =>
            Task.FromResult(Recipient);
    }

    private sealed class FakeSender(bool result) : IEmailSender
    {
        public Task<bool> SendAsync(string to, string subject, string html, CancellationToken ct = default) =>
            Task.FromResult(result);
    }
}
```

Note: `EmailTemplates` is a concrete (non-interface) singleton already registered in DI (`services.AddSingleton(new EmailTemplates(emailOptions));`) — it does not need faking; the real instance runs in every test here, which is fine since it's pure/deterministic.

- [ ] **Step 5: Run to verify it fails, then iterate until it passes**

Run: `dotnet test services/api/tests/FormMaps.IntegrationTests --filter FullyQualifiedName~ReportEmailEndpointsTests`
Expected: iterate on Task 3 Step 1's endpoint code until all 5 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add services/api/src/FormMaps.Api/Endpoints/ReportEmailEndpoints.cs services/api/src/FormMaps.Api/Program.cs services/api/tests/FormMaps.IntegrationTests/Reports/ReportEmailEndpointsTests.cs
git commit -m "feat(report): wire POST /send-report-email/:userId endpoint"
```

---

### Task 4: Frontend wiring — 1 new flag

**Files:**
- Modify: `formmaps-platform/frontend/next.config.ts`

- [ ] **Step 1: Add the flag function**

```typescript
// Report send-report-email (Phase F): byte-for-byte port, no PDF/attachment. Default OFF.
function shouldRouteSendReportEmailToDotnet() {
  return Boolean(dotnetApiBaseUrl && isEnabled(process.env.FORMMAPS_ROUTE_SEND_REPORT_EMAIL_TO_DOTNET));
}
```

- [ ] **Step 2: Add the rewrite**, before the `/api/:path*` catch-all:

```typescript
      ...(shouldRouteSendReportEmailToDotnet()
        ? [
            {
              source: "/api/v1/reports/send-report-email/:userId",
              destination: `${dotnetApiBaseUrl}/api/v1/reports/send-report-email/:userId`,
            },
          ]
        : []),
```

- [ ] **Step 3: Verify default-off and default-on**, same method as prior wiring commits:

```bash
cd /Users/federicotafur/formmaps-platform/frontend
node --input-type=module -e "
import('./next.config.ts').then(m => m.default.rewrites()).then(r => {
  console.log(JSON.stringify(r.afterFiles.filter(x => x.source.includes('send-report-email')), null, 2));
});
"
# Expect: empty (flag unset)

FORMMAPS_DOTNET_API_BASE_URL=https://dotnet.example.com FORMMAPS_ROUTE_SEND_REPORT_EMAIL_TO_DOTNET=true \
node --input-type=module -e "
import('./next.config.ts').then(m => m.default.rewrites()).then(r => {
  console.log(JSON.stringify(r.afterFiles.filter(x => x.source.includes('send-report-email')), null, 2));
});
"
# Expect: the rewrite present, before any catch-all
```

- [ ] **Step 4: Commit**

```bash
cd /Users/federicotafur/formmaps-platform
git add frontend/next.config.ts
git commit -m "feat(migration): wire report.ts send-report-email rewrite, flag default OFF"
```

## Self-Review

- **Spec coverage:** the single Track C route has a task for its template (Task 1), its data lookup (Task 2), its endpoint (Task 3), and its frontend wiring (Task 4).
- **Placeholder scan:** none, except the intentional "confirm the actual Reports fixture class name" note in Task 2 — this isn't a plan placeholder, it's a pointer to verify one class name against a file this plan's author didn't re-read in full; flagged explicitly rather than guessed.
- **Type consistency:** `ReportEmailRecipient` (Task 2) fields match its use in Task 3's `BuildReportEmail(recipient.Name)`/`SendAsync(recipient.Email, ...)`/`recipient.Email` in the response; `EmailMessage` (already existing, from Task 1's `BuildReportEmail` return) matches its `.Subject`/`.Html` usage in Task 3.
- **Correction to the design doc:** the design doc said this needs "no new infra," which undersold it slightly — an existing `EmailTemplates` class (built for a prior invite/reminder slice) already provides `Wrap`/`EscapeHtml`; this plan adds one new method to it rather than porting email templating from scratch, which is even less work than the design doc implied, not more.
