using System.Net;
using System.Text;
using System.Text.Json;
using FormMaps.Api.Auth;
using FormMaps.Application.Auth;
using FormMaps.Application.Moderation;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;

namespace FormMaps.IntegrationTests.Moderation;

/// <summary>
/// HTTP-level coverage for ModerationEndpoints (routes/moderation.ts, 4 endpoints under
/// /api/v1/moderation), formmaps#63 — a WebApplicationFactory&lt;Program&gt; with a swapped-in fake
/// repository, exercised via dev-header identity, asserting the status codes, response shapes and the
/// legacy quirks a flag flip has to preserve.
///
/// <para>Repository/SQL behaviour lives in ModerationRepositoryTests; the tenant-boundary predicates and
/// their sabotage record live in ModerationCrossTenantRlsTests. Neither is re-covered here.</para>
/// </summary>
public class ModerationEndpointsTests
{
    [Theory]
    [InlineData("/api/v1/moderation/report", "POST")]
    [InlineData("/api/v1/moderation/reports", "GET")]
    [InlineData("/api/v1/moderation/block/u2", "POST")]
    [InlineData("/api/v1/moderation/block/u2", "DELETE")]
    public async Task Anonymous_is_401(string path, string method)
    {
        using var factory = new Factory(new FakeRepo());
        using var client = factory.CreateClient();
        var response = await client.SendAsync(new HttpRequestMessage(new HttpMethod(method), path));
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    // =====================================================================================
    // POST /report
    // =====================================================================================

    [Fact]
    public async Task Report_happy_path_is_201_with_id_and_status()
    {
        var repo = new FakeRepo { Created = new CreatedReport("rep-1", "open") };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Post, "/api/v1/moderation/report",
            body: """{"targetType":"message","targetId":"m1","reason":"abusive"}""");

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.True(doc.RootElement.GetProperty("success").GetBoolean());
        Assert.Equal("rep-1", doc.RootElement.GetProperty("data").GetProperty("id").GetString());
        Assert.Equal("open", doc.RootElement.GetProperty("data").GetProperty("status").GetString());
        Assert.Equal(("caller-1", "message", "m1", "abusive"), (repo.LastReporterId, repo.LastTargetType, repo.LastTargetId, repo.LastReason));
    }

    [Fact]
    public async Task Report_of_a_target_the_reporter_has_no_relationship_to_is_404_not_403()
    {
        // "404 -- don't reveal existence of unrelated resources" (moderation.ts:44).
        var repo = new FakeRepo { CanReport = false };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Post, "/api/v1/moderation/report",
            body: """{"targetType":"user","targetId":"u9","reason":"abusive"}""");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Not found", doc.RootElement.GetProperty("message").GetString());
        Assert.Null(repo.LastReason); // the create never ran
    }

    /// <summary>
    /// The Zod messages at moderation.ts:29-33, verbatim — they ARE the 400 body, so a paraphrase is a
    /// behaviour change at flag-flip time. Zod reports issues in schema KEY order and the route returns
    /// <c>errors[0].message</c>, which is why the last case (both fields wrong) expects the targetType one.
    /// </summary>
    [Theory]
    [InlineData("""{"targetId":"m1","reason":"x"}""", "Required")]
    [InlineData("""{"targetType":"post","targetId":"m1","reason":"x"}""", "Invalid enum value. Expected 'message' | 'conversation' | 'user', received 'post'")]
    [InlineData("""{"targetType":7,"targetId":"m1","reason":"x"}""", "Expected 'message' | 'conversation' | 'user', received number")]
    [InlineData("""{"targetType":"message","reason":"x"}""", "Required")]
    [InlineData("""{"targetType":"message","targetId":"","reason":"x"}""", "String must contain at least 1 character(s)")]
    [InlineData("""{"targetType":"message","targetId":"m1","reason":""}""", "String must contain at least 1 character(s)")]
    [InlineData("""{"targetType":"message","targetId":"m1","reason":5}""", "Expected string, received number")]
    [InlineData("""{"targetType":"post","targetId":"m1","reason":""}""", "Invalid enum value. Expected 'message' | 'conversation' | 'user', received 'post'")]
    public async Task Report_invalid_body_is_400_with_the_first_zod_message(string body, string expected)
    {
        using var factory = new Factory(new FakeRepo());
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Post, "/api/v1/moderation/report", body: body);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.False(doc.RootElement.GetProperty("success").GetBoolean());
        Assert.Equal(expected, doc.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task Report_rejects_a_targetId_over_200_and_a_reason_over_1000()
    {
        using var factory = new Factory(new FakeRepo());
        using var client = factory.CreateClient();

        var longTarget = JsonSerializer.Serialize(new { targetType = "message", targetId = new string('t', 201), reason = "x" });
        var longReason = JsonSerializer.Serialize(new { targetType = "message", targetId = "m1", reason = new string('r', 1001) });

        Assert.Equal("String must contain at most 200 character(s)", await MessageOf(client, longTarget));
        Assert.Equal("String must contain at most 1000 character(s)", await MessageOf(client, longReason));

        static async Task<string?> MessageOf(HttpClient client, string body)
        {
            var response = await Send(client, HttpMethod.Post, "/api/v1/moderation/report", body: body);
            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            return doc.RootElement.GetProperty("message").GetString();
        }
    }

    [Fact]
    public async Task Report_accepts_a_whitespace_only_reason()
    {
        // z.string().min(1) measures the RAW string, so " " is valid in legacy. Trimming here (the natural
        // .NET instinct, and what VideoEndpoints does where legacy also trims) would tighten the contract.
        var repo = new FakeRepo();
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Post, "/api/v1/moderation/report",
            body: """{"targetType":"message","targetId":" ","reason":" "}""");

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.Equal(" ", repo.LastReason);
        Assert.Equal(" ", repo.LastTargetId);
    }

    [Theory]
    [InlineData("{not valid json")]
    [InlineData("[]")]
    public async Task Report_malformed_body_is_400_in_the_house_shape(string body)
    {
        using var factory = new Factory(new FakeRepo());
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Post, "/api/v1/moderation/report", body: body);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.False(doc.RootElement.GetProperty("success").GetBoolean());
    }

    // =====================================================================================
    // GET /reports
    // =====================================================================================

    [Theory]
    [InlineData("student")]
    [InlineData("counselor")]
    [InlineData("teacher")]
    [InlineData("coach")]
    [InlineData("parent")]
    // RAW-role gate, not the normalized one: legacy matches (req.userRole || "").toLowerCase() against
    // exactly ["school_admin", "super admin"], so every one of these variants is DENIED even though
    // FormMapsRoles.Normalize would fold them into an admitted bucket.
    [InlineData("admin")]
    [InlineData("superadmin")]
    [InlineData("super_admin")]
    [InlineData("schooladmin")]
    [InlineData("school admin")]
    public async Task Reports_denies_every_role_outside_the_raw_admin_list(string role)
    {
        using var factory = new Factory(new FakeRepo());
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Get, "/api/v1/moderation/reports", role: role, schoolId: "school-1");

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Access denied", doc.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task Reports_school_admin_is_scoped_to_their_own_school()
    {
        var repo = new FakeRepo();
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Get, "/api/v1/moderation/reports", role: "school_admin", schoolId: "school-1");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("school-1", repo.LastSchoolScope);
    }

    [Fact]
    public async Task Reports_super_admin_passes_a_null_school_scope()
    {
        var repo = new FakeRepo();
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();

        // Note the schoolId header is set and still ignored: `isSuper ? undefined : req.schoolId`.
        var response = await Send(client, HttpMethod.Get, "/api/v1/moderation/reports", role: "Super Admin", schoolId: "school-1");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Null(repo.LastSchoolScope);
        Assert.True(repo.ListCalled);
    }

    [Fact]
    public async Task Reports_school_admin_with_no_school_fails_closed_with_the_limit_zero_quirk()
    {
        // moderation.ts:89-92 — an empty page is returned BEFORE page/limit are parsed, so the echoed
        // `limit` is 0, not the 50 a caller would infer. Quirk, ported; and the repository is never called.
        var repo = new FakeRepo();
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Get, "/api/v1/moderation/reports?page=3&limit=25",
            role: "school_admin", schoolId: null);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = doc.RootElement.GetProperty("data");
        Assert.Equal(0, data.GetProperty("data").GetArrayLength());
        Assert.Equal(0, data.GetProperty("total").GetInt32());
        Assert.Equal(1, data.GetProperty("page").GetInt32());
        Assert.Equal(0, data.GetProperty("limit").GetInt32());
        Assert.Equal(0, data.GetProperty("totalPages").GetInt32());
        Assert.False(repo.ListCalled);
    }

    [Theory]
    [InlineData("", 1, 50)]
    [InlineData("?page=2&limit=10", 2, 10)]
    [InlineData("?page=0&limit=0", 1, 50)]          // parseInt(x) || default -- a parsed 0 is FALSY in JS
    [InlineData("?page=-4&limit=99999", 1, 100)]    // Math.max(1, ...) / Math.min(100, ...)
    [InlineData("?page=abc&limit=abc", 1, 50)]      // NaN || default
    public async Task Reports_clamps_page_and_limit_the_way_legacy_does(string query, int page, int limit)
    {
        var repo = new FakeRepo();
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Get, "/api/v1/moderation/reports" + query,
            role: "school_admin", schoolId: "school-1");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(page, repo.LastPage);
        Assert.Equal(limit, repo.LastLimit);
    }

    [Fact]
    public async Task Reports_returns_the_paginated_envelope_and_the_full_report_shape()
    {
        var row = new OpenReportRow(
            "rep-1", "u-reporter", "message", "m1", "abusive", "open",
            ReviewedBy: null, ReviewedAt: null, Resolution: null, IsActive: true,
            CreatedBy: "u-reporter", CreatedDate: new DateTime(2026, 3, 1, 12, 0, 0),
            UpdatedBy: null, UpdatedAt: new DateTime(2026, 3, 1, 12, 0, 0),
            Reporter: new ReportReporter("u-reporter", "Reporty", "r@x.test"));
        var repo = new FakeRepo { Page = new OpenReportsPage([row], Total: 3) };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Get, "/api/v1/moderation/reports?limit=2",
            role: "school_admin", schoolId: "school-1");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = doc.RootElement.GetProperty("data");
        Assert.Equal(3, data.GetProperty("total").GetInt32());
        Assert.Equal(1, data.GetProperty("page").GetInt32());
        Assert.Equal(2, data.GetProperty("limit").GetInt32());
        Assert.Equal(2, data.GetProperty("totalPages").GetInt32()); // ceil(3 / 2)

        var report = data.GetProperty("data")[0];
        Assert.Equal("rep-1", report.GetProperty("id").GetString());
        Assert.Equal("u-reporter", report.GetProperty("reporterId").GetString());
        Assert.Equal("message", report.GetProperty("targetType").GetString());
        Assert.Equal("m1", report.GetProperty("targetId").GetString());
        Assert.Equal("abusive", report.GetProperty("reason").GetString());
        Assert.Equal("open", report.GetProperty("status").GetString());
        Assert.Equal(JsonValueKind.Null, report.GetProperty("reviewedBy").ValueKind);
        Assert.Equal(JsonValueKind.Null, report.GetProperty("reviewedAt").ValueKind);
        Assert.Equal(JsonValueKind.Null, report.GetProperty("resolution").ValueKind);
        Assert.True(report.GetProperty("isActive").GetBoolean());
        Assert.Equal("u-reporter", report.GetProperty("createdBy").GetString());
        Assert.Equal(JsonValueKind.Null, report.GetProperty("updatedBy").ValueKind);
        Assert.True(report.TryGetProperty("createdDate", out _));
        Assert.True(report.TryGetProperty("updatedAt", out _));
        Assert.Equal("Reporty", report.GetProperty("reporter").GetProperty("name").GetString());
        Assert.Equal("r@x.test", report.GetProperty("reporter").GetProperty("email").GetString());
    }

    // =====================================================================================
    // POST / DELETE /block/{userId}
    // =====================================================================================

    [Fact]
    public async Task Block_self_is_400_and_never_reaches_the_eligibility_check()
    {
        var repo = new FakeRepo();
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Post, "/api/v1/moderation/block/caller-1");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("You cannot block yourself", doc.RootElement.GetProperty("message").GetString());
        Assert.False(repo.CanModerateCalled);
    }

    [Fact]
    public async Task Block_of_an_ineligible_or_absent_user_is_one_indistinguishable_404()
    {
        var repo = new FakeRepo { CanModerate = false };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Post, "/api/v1/moderation/block/u9");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("User not found", doc.RootElement.GetProperty("message").GetString());
        Assert.False(repo.BlockCalled);
    }

    [Fact]
    public async Task Block_happy_path_is_200_not_201()
    {
        var repo = new FakeRepo();
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Post, "/api/v1/moderation/block/u2");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.True(doc.RootElement.GetProperty("data").GetProperty("blocked").GetBoolean());
        Assert.Equal(("caller-1", "u2"), (repo.LastBlockerId, repo.LastBlockedId));
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task Unblock_is_200_and_echoes_removed(bool removed)
    {
        var repo = new FakeRepo { Removed = removed };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Delete, "/api/v1/moderation/block/u2");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = doc.RootElement.GetProperty("data");
        Assert.False(data.GetProperty("blocked").GetBoolean());
        Assert.Equal(removed, data.GetProperty("removed").GetBoolean());
    }

    [Fact]
    public async Task Unblock_runs_no_self_check_and_no_eligibility_check()
    {
        // Legacy DELETE has neither (moderation.ts:154-170). Clearing your own block row cannot affect
        // another user's state, and requiring eligibility to UNblock would strand a block whose
        // relationship has since gone away. Ported as-is rather than "fixed".
        var repo = new FakeRepo { CanModerate = false };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();

        var other = await Send(client, HttpMethod.Delete, "/api/v1/moderation/block/u9");
        var self = await Send(client, HttpMethod.Delete, "/api/v1/moderation/block/caller-1");

        Assert.Equal(HttpStatusCode.OK, other.StatusCode);
        Assert.Equal(HttpStatusCode.OK, self.StatusCode);
        Assert.False(repo.CanModerateCalled);
    }

    // ---- helpers ----

    private static Task<HttpResponseMessage> Send(
        HttpClient client, HttpMethod method, string path, string? body = null,
        string role = "student", string userId = "caller-1", string? schoolId = "school-1")
    {
        var request = new HttpRequestMessage(method, path);
        request.Headers.Add(DevelopmentRequestContextFactory.UserIdHeader, userId);
        request.Headers.Add(DevelopmentRequestContextFactory.RoleHeader, role);
        request.Headers.Add(DevelopmentRequestContextFactory.EmailHeader, "caller@example.test");
        request.Headers.Add(DevelopmentRequestContextFactory.NameHeader, "Caller");
        if (schoolId is not null) request.Headers.Add(DevelopmentRequestContextFactory.SchoolIdHeader, schoolId);
        if (body is not null) request.Content = new StringContent(body, Encoding.UTF8, "application/json");
        return client.SendAsync(request);
    }

    private sealed class Factory(IModerationRepository repository) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(Environments.Development);
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<IModerationRepository>();
                services.AddSingleton(repository);
            });
        }
    }

    private sealed class FakeRepo : IModerationRepository
    {
        public bool CanReport { get; init; } = true;
        public bool CanModerate { get; init; } = true;
        public bool Removed { get; init; } = true;
        public CreatedReport Created { get; init; } = new("rep-1", "open");
        public OpenReportsPage Page { get; init; } = new([], 0);

        public string? LastReporterId { get; private set; }
        public string? LastTargetType { get; private set; }
        public string? LastTargetId { get; private set; }
        public string? LastReason { get; private set; }
        public string? LastSchoolScope { get; private set; }
        public string? LastBlockerId { get; private set; }
        public string? LastBlockedId { get; private set; }
        public int LastPage { get; private set; }
        public int LastLimit { get; private set; }
        public bool ListCalled { get; private set; }
        public bool CanModerateCalled { get; private set; }
        public bool BlockCalled { get; private set; }

        public Task<bool> CanReportTargetAsync(RequestContext context, string reporterId, string targetType, string targetId, CancellationToken cancellationToken = default)
        {
            (LastReporterId, LastTargetType, LastTargetId) = (reporterId, targetType, targetId);
            return Task.FromResult(CanReport);
        }

        public Task<CreatedReport> CreateReportAsync(RequestContext context, string reporterId, string targetType, string targetId, string reason, string actorEmail, string clientIp, CancellationToken cancellationToken = default)
        {
            (LastReporterId, LastTargetType, LastTargetId, LastReason) = (reporterId, targetType, targetId, reason);
            return Task.FromResult(Created);
        }

        public Task<OpenReportsPage> ListOpenReportsAsync(RequestContext context, int page, int limit, string? schoolId, CancellationToken cancellationToken = default)
        {
            (ListCalled, LastPage, LastLimit, LastSchoolScope) = (true, page, limit, schoolId);
            return Task.FromResult(Page);
        }

        public Task<bool> CanModerateUserAsync(RequestContext context, string actorId, string targetId, CancellationToken cancellationToken = default)
        {
            CanModerateCalled = true;
            return Task.FromResult(CanModerate);
        }

        public Task BlockUserAsync(RequestContext context, string blockerId, string blockedId, string actorEmail, string clientIp, CancellationToken cancellationToken = default)
        {
            (BlockCalled, LastBlockerId, LastBlockedId) = (true, blockerId, blockedId);
            return Task.CompletedTask;
        }

        public Task<bool> UnblockUserAsync(RequestContext context, string blockerId, string blockedId, string actorEmail, string clientIp, CancellationToken cancellationToken = default)
        {
            (LastBlockerId, LastBlockedId) = (blockerId, blockedId);
            return Task.FromResult(Removed);
        }
    }
}
