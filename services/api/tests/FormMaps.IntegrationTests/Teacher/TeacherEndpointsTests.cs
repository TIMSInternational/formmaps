using System.Net;
using System.Text;
using System.Text.Json;
using FormMaps.Api.Auth;
using FormMaps.Application.Auth;
using FormMaps.Application.Teacher;
using FormMaps.Domain.Auth;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;

namespace FormMaps.IntegrationTests.Teacher;

/// <summary>
/// routes/teacher.ts (issue #62). THE SPLIT AUTH BOUNDARY IS WHAT THIS CLASS EXISTS TO PIN, and it is pinned
/// from both sides for all four routes:
/// <list type="bullet">
///   <item><description>/onboarding/verify (:18) and /onboarding/complete (:33) are declared BEFORE
///   <c>router.use(authenticate)</c> (:84), so they must answer with NO credentials at all. The negative control
///   is <see cref="Onboarding_pair_answers_with_no_credentials_at_all"/>: if either ever starts 401ing,
///   onboarding is broken outright, because the teacher being onboarded has no session yet by
///   definition.</description></item>
///   <item><description>/profile (:91) and /evaluations/pending (:111) are declared AFTER it, so they must
///   REJECT an unauthenticated caller. The negative control is
///   <see cref="Authenticated_pair_rejects_an_anonymous_caller"/>: if either ever stops 401ing, teacher PII and
///   another user's 360 invitation tokens are exposed to anyone.</description></item>
/// </list>
///
/// <para><see cref="Only_the_authenticated_pair_consults_the_auth_guard"/> pins the same boundary structurally
/// rather than by status code, so that a future refactor cannot satisfy the status assertions while quietly
/// moving the onboarding pair behind the guard (or the profile pair out from behind it).</para>
///
/// <para>DB behaviour is proven by <see cref="TeacherOnboardingRepositoryTests"/>; the repository is a fake here.
/// Membership in <see cref="JwtSecretCollection"/> is required because the complete happy path mints a real JWT
/// through <c>AccessTokenFactory</c>, which reads the process-wide JWT_SECRET (formmaps#37).</para>
/// </summary>
[Collection(nameof(JwtSecretCollection))]
public class TeacherEndpointsTests : IDisposable
{
    private const string Secret = "formmaps-test-secret-that-is-at-least-32-bytes";
    private const string Base = "/api/v1/teacher";
    private const string Caller = "teacher-1";
    private const string School = "school-1";

    private readonly JwtSecretScope jwtSecretScope = new(Secret);

    public void Dispose()
    {
        jwtSecretScope.Dispose();
        GC.SuppressFinalize(this);
    }

    // =============================================================================================
    // THE BOUNDARY
    // =============================================================================================

    /// <summary>
    /// NEGATIVE CONTROL for the pre-auth half. No dev-identity headers, no cookie, no bearer token — exactly
    /// what a teacher clicking an emailed invite link sends. Anything but a 2xx here breaks onboarding.
    /// </summary>
    [Fact]
    public async Task Onboarding_pair_answers_with_no_credentials_at_all()
    {
        using var factory = new Factory();
        factory.Repository.Invite = ValidInvite();
        using var client = factory.CreateClient();

        var verify = await client.GetAsync($"{Base}/onboarding/verify?token=tok-1");
        var complete = await client.PostAsync(
            $"{Base}/onboarding/complete",
            new StringContent("""{"token":"tok-1","password":"Str0ng!pass"}""", Encoding.UTF8, "application/json"));

        Assert.Equal(HttpStatusCode.OK, verify.StatusCode);
        Assert.NotEqual(HttpStatusCode.Unauthorized, complete.StatusCode);
        Assert.NotEqual(HttpStatusCode.Forbidden, complete.StatusCode);
        Assert.Equal(HttpStatusCode.OK, complete.StatusCode);
    }

    /// <summary>
    /// NEGATIVE CONTROL for the authenticated half. Same two routes' siblings, same absent credentials, opposite
    /// required outcome.
    /// </summary>
    [Theory]
    [InlineData(Base + "/profile")]
    [InlineData(Base + "/evaluations/pending")]
    public async Task Authenticated_pair_rejects_an_anonymous_caller(string path)
    {
        using var factory = new Factory();
        using var client = factory.CreateClient();

        var response = await client.GetAsync(path);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        using var doc = await Json(response);
        Assert.False(doc.RootElement.GetProperty("success").GetBoolean());
        Assert.Equal("missing_identity", doc.RootElement.GetProperty("code").GetString());
    }

    /// <summary>
    /// The boundary pinned structurally. A status-code-only pin can be satisfied by an onboarding handler that
    /// calls the guard and ignores the answer; this one cannot. It also fails if the profile pair ever stops
    /// consulting the guard, which is the direction that leaks data.
    /// </summary>
    [Fact]
    public async Task Only_the_authenticated_pair_consults_the_auth_guard()
    {
        using var factory = new Factory();
        factory.Repository.Invite = ValidInvite();
        using var client = factory.CreateClient();

        await client.GetAsync($"{Base}/onboarding/verify?token=tok-1");
        await client.PostAsync(
            $"{Base}/onboarding/complete",
            new StringContent("""{"token":"tok-1","password":"Str0ng!pass"}""", Encoding.UTF8, "application/json"));

        Assert.Equal(0, factory.Guard.Calls);

        await Send(client, HttpMethod.Get, $"{Base}/profile", permissions: "teacher:dashboard");
        Assert.Equal(1, factory.Guard.Calls);

        await Send(client, HttpMethod.Get, $"{Base}/evaluations/pending", permissions: "evaluations:read");
        Assert.Equal(2, factory.Guard.Calls);
    }

    /// <summary>
    /// The onboarding pair carries NO <c>requirePermission</c> in legacy either, so an authenticated caller
    /// holding zero permissions must still get through. Pinned so that "tidying" the pair under the same
    /// Authorize helper the profile pair uses would fail here rather than in production.
    /// </summary>
    [Fact]
    public async Task Onboarding_pair_is_not_permission_gated()
    {
        using var factory = new Factory();
        factory.Repository.Invite = ValidInvite();
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Get, $"{Base}/onboarding/verify?token=tok-1", permissions: "");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    /// <summary>
    /// The two authenticated routes gate on DIFFERENT permissions (teacher.ts:91 vs :111). Each is denied when
    /// the caller holds only the other one — which is what proves neither is accidentally checking the same
    /// string, and that neither was widened to "any authenticated teacher".
    /// </summary>
    [Theory]
    [InlineData(Base + "/profile", "evaluations:read")]
    [InlineData(Base + "/profile", "evaluations:manage")]
    [InlineData(Base + "/evaluations/pending", "teacher:dashboard")]
    [InlineData(Base + "/evaluations/pending", "evaluations:manage")]
    public async Task Authenticated_pair_is_403_without_its_own_permission(string path, string heldPermission)
    {
        using var factory = new Factory();
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Get, path, permissions: heldPermission);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        using var doc = await Json(response);
        Assert.Equal("missing_permission", doc.RootElement.GetProperty("code").GetString());
        Assert.Equal("Insufficient permissions", doc.RootElement.GetProperty("message").GetString());
    }

    /// <summary>
    /// The permissions the real teacher role actually carries (RolePermissions/lib/auth.ts:103-110) open both
    /// authenticated routes. Without this, the 403 theory above would still pass if the gates named strings no
    /// teacher can ever hold — the dead-gate mistake FormMapsPermissions.AuditRead documents.
    /// </summary>
    [Fact]
    public async Task A_real_teacher_role_holds_both_gates()
    {
        var teacherPermissions = RolePermissions.For(FormMapsRoles.Teacher);
        Assert.Contains("teacher:dashboard", teacherPermissions);
        Assert.Contains("evaluations:read", teacherPermissions);

        using var factory = new Factory();
        factory.Repository.Profile = new TeacherProfileRow(Caller, "Tess", "tess@example.test", School);
        using var client = factory.CreateClient();
        var all = string.Join(",", teacherPermissions);

        Assert.Equal(HttpStatusCode.OK, (await Send(client, HttpMethod.Get, $"{Base}/profile", permissions: all)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Send(client, HttpMethod.Get, $"{Base}/evaluations/pending", permissions: all)).StatusCode);
    }

    /// <summary>
    /// The authenticated pair must reach the database as the CALLER (Identity GUCs), never as System. A System
    /// context here would bypass RLS and let a teacher read every school's rows — the exact exposure the
    /// boundary exists to prevent, and one no status-code assertion can see.
    /// </summary>
    [Fact]
    public async Task Authenticated_pair_passes_the_callers_own_context_to_the_repository()
    {
        using var factory = new Factory();
        factory.Repository.Profile = new TeacherProfileRow(Caller, "Tess", "tess@example.test", School);
        using var client = factory.CreateClient();

        await Send(client, HttpMethod.Get, $"{Base}/profile", permissions: "teacher:dashboard");
        await Send(client, HttpMethod.Get, $"{Base}/evaluations/pending", permissions: "evaluations:read");

        foreach (var context in new[] { factory.Repository.ProfileContext, factory.Repository.PendingContext })
        {
            Assert.NotNull(context);
            Assert.False(context!.IsSystem);
            Assert.True(context.IsAuthenticated);
            Assert.Equal(Caller, context.Tenant?.UserId);
            Assert.Equal(School, context.Tenant?.SchoolId);
            Assert.Equal(TenantGucPlanMode.Identity, TenantGucPlanResolver.Resolve(context).Mode);
        }

        // And both reads are keyed on the caller's OWN user id, not on anything client-supplied.
        Assert.Equal(Caller, factory.Repository.ProfileUserId);
        Assert.Equal(Caller, factory.Repository.PendingUserId);
    }

    // =============================================================================================
    // GET /onboarding/verify -- teacher.ts:18
    // =============================================================================================

    [Fact]
    public async Task Verify_requires_a_token()
    {
        using var factory = new Factory();
        using var client = factory.CreateClient();

        var response = await client.GetAsync($"{Base}/onboarding/verify");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await AssertMessage(response, "Token required");
        Assert.Null(factory.Repository.SeenVerifyToken);
    }

    /// <summary>An unknown token is a 200 with isValid:false — legacy never 404s it (teacher.ts:24).</summary>
    [Fact]
    public async Task Verify_reports_an_unknown_token_as_invalid_with_a_200()
    {
        using var factory = new Factory();
        using var client = factory.CreateClient();

        var response = await client.GetAsync($"{Base}/onboarding/verify?token=nope");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = await Json(response);
        var data = doc.RootElement.GetProperty("data");
        Assert.True(doc.RootElement.GetProperty("success").GetBoolean());
        Assert.False(data.GetProperty("isValid").GetBoolean());
        Assert.Equal("invalid", data.GetProperty("status").GetString());
        Assert.Equal("nope", factory.Repository.SeenVerifyToken);
    }

    /// <summary>
    /// teacher.ts:25 checks expiry BEFORE :26 checks usedAt, so an invite that is BOTH reports "expired".
    /// Pinned because reordering the two reads as an obvious tidy-up would silently change the answer.
    /// </summary>
    [Fact]
    public async Task Verify_reports_expired_before_used()
    {
        using var factory = new Factory();
        factory.Repository.Invite = ValidInvite() with
        {
            ExpiresAt = DateTime.UtcNow.AddDays(-1),
            UsedAt = DateTime.UtcNow.AddDays(-2),
        };
        using var client = factory.CreateClient();

        var response = await client.GetAsync($"{Base}/onboarding/verify?token=tok-1");

        using var doc = await Json(response);
        Assert.Equal("expired", doc.RootElement.GetProperty("data").GetProperty("status").GetString());
    }

    [Fact]
    public async Task Verify_reports_a_consumed_invite_as_used()
    {
        using var factory = new Factory();
        factory.Repository.Invite = ValidInvite() with { UsedAt = DateTime.UtcNow.AddDays(-1) };
        using var client = factory.CreateClient();

        var response = await client.GetAsync($"{Base}/onboarding/verify?token=tok-1");

        using var doc = await Json(response);
        Assert.Equal("used", doc.RootElement.GetProperty("data").GetProperty("status").GetString());
    }

    [Fact]
    public async Task Verify_returns_the_invite_email_school_name_and_expiry()
    {
        using var factory = new Factory();
        factory.Repository.Invite = ValidInvite();
        factory.Repository.SchoolName = "Ridgeview High";
        using var client = factory.CreateClient();

        var response = await client.GetAsync($"{Base}/onboarding/verify?token=tok-1");

        using var doc = await Json(response);
        var data = doc.RootElement.GetProperty("data");
        Assert.True(data.GetProperty("isValid").GetBoolean());
        Assert.Equal("valid", data.GetProperty("status").GetString());
        Assert.Equal("Invitee@Example.Test", data.GetProperty("email").GetString());
        Assert.Equal("Ridgeview High", data.GetProperty("schoolName").GetString());
        Assert.Equal("2030-01-02T03:04:05.678Z", data.GetProperty("expiresAt").GetString());
        Assert.Equal(School, factory.Repository.SeenSchoolNameId);
    }

    /// <summary>
    /// teacher.ts:29 writes <c>schoolName: school?.name</c> with NO <c>?? null</c>, so JSON.stringify DROPS the
    /// key entirely when the invite has no school (or the school row is missing). Its sibling /profile (:99)
    /// DOES write <c>?? null</c> and keeps the key. DIVERGENCE NOT MADE — emitting null here to match /profile
    /// would be a wire-shape change on flip for any client using `"schoolName" in data`.
    /// </summary>
    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task Verify_omits_the_schoolName_key_entirely_when_there_is_no_school(bool inviteHasNoSchool)
    {
        using var factory = new Factory();
        factory.Repository.Invite = inviteHasNoSchool ? ValidInvite() with { SchoolId = null } : ValidInvite();
        factory.Repository.SchoolName = null; // school row missing, for the inviteHasNoSchool == false case
        using var client = factory.CreateClient();

        var response = await client.GetAsync($"{Base}/onboarding/verify?token=tok-1");

        using var doc = await Json(response);
        var data = doc.RootElement.GetProperty("data");
        Assert.False(data.TryGetProperty("schoolName", out _));
        Assert.True(data.GetProperty("isValid").GetBoolean());

        // A null schoolId must not even attempt the school lookup (teacher.ts:28's ternary).
        Assert.Equal(inviteHasNoSchool ? null : School, factory.Repository.SeenSchoolNameId);
    }

    // =============================================================================================
    // POST /onboarding/complete -- teacher.ts:33
    // =============================================================================================

    [Theory]
    [InlineData("""{}""")]
    [InlineData("""{"password":"Str0ng!pass"}""")]
    [InlineData("""{"token":"tok-1"}""")]
    [InlineData("""{"token":"","password":"Str0ng!pass"}""")]
    [InlineData("""{"token":"tok-1","password":""}""")]
    public async Task Complete_requires_a_token_and_a_password(string body)
    {
        using var factory = new Factory();
        using var client = factory.CreateClient();

        var response = await Post(client, body);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await AssertMessage(response, "Token and password required");
    }

    /// <summary>
    /// teacher.ts:39-40 validates strength BEFORE looking the token up (:42), so a weak password on a bogus
    /// token reports the strength message, not "Invalid or expired token". Ordering pinned by asserting the
    /// invite lookup never happened.
    /// </summary>
    [Fact]
    public async Task Complete_validates_password_strength_before_it_looks_the_token_up()
    {
        using var factory = new Factory();
        using var client = factory.CreateClient();

        var response = await Post(client, """{"token":"does-not-exist","password":"short"}""");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await AssertMessage(response, "Password must be at least 8 characters");
        Assert.Null(factory.Repository.SeenVerifyToken);
    }

    /// <summary>
    /// teacher.ts:43-44 collapses unknown / used / expired into ONE message here, unlike verify's three
    /// distinct statuses. Both shapes are legacy's; neither is harmonised.
    /// </summary>
    [Fact]
    public async Task Complete_collapses_unknown_used_and_expired_into_one_400()
    {
        foreach (var invite in new TeacherInviteRow?[]
        {
            null,
            ValidInvite() with { UsedAt = DateTime.UtcNow.AddDays(-1) },
            ValidInvite() with { ExpiresAt = DateTime.UtcNow.AddDays(-1) },
        })
        {
            using var factory = new Factory();
            factory.Repository.Invite = invite;
            using var client = factory.CreateClient();

            var response = await Post(client, """{"token":"tok-1","password":"Str0ng!pass"}""");

            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
            await AssertMessage(response, "Invalid or expired token");
        }
    }

    /// <summary>teacher.ts:48 — a 500 on an otherwise entirely valid request. Ported as-is.</summary>
    [Fact]
    public async Task Complete_is_500_when_the_teacher_role_is_missing()
    {
        using var factory = new Factory();
        factory.Repository.Invite = ValidInvite();
        factory.Repository.Role = null;
        using var client = factory.CreateClient();

        var response = await Post(client, """{"token":"tok-1","password":"Str0ng!pass"}""");

        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        await AssertMessage(response, "Teacher role not found");
    }

    /// <summary>teacher.ts:56 — the account-takeover guard. 409, and the invite must NOT be consumed.</summary>
    [Fact]
    public async Task Complete_is_409_when_the_account_already_exists()
    {
        using var factory = new Factory();
        factory.Repository.Invite = ValidInvite();
        factory.Repository.CompleteOutcome = TeacherOnboardingOutcome.AccountAlreadyExists;
        using var client = factory.CreateClient();

        var response = await Post(client, """{"token":"tok-1","password":"Str0ng!pass"}""");

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        await AssertMessage(response, "Account already exists");
        // No session is issued on the takeover path: legacy returns before generateAccessToken/setAuthCookies.
        var cookies = response.Headers.TryGetValues("Set-Cookie", out var values) ? values.ToArray() : [];
        Assert.DoesNotContain(cookies, c => c.StartsWith("access_token=", StringComparison.Ordinal));
    }

    /// <summary>
    /// teacher.ts:74-80. Also pins teacher.ts:51 — the email written and returned comes from the VERIFIED
    /// INVITE, lower-cased, never from the request body. A body "email" must not be able to steer it.
    /// </summary>
    [Fact]
    public async Task Complete_returns_the_session_payload_and_takes_the_email_from_the_invite()
    {
        using var factory = new Factory();
        factory.Repository.Invite = ValidInvite();
        using var client = factory.CreateClient();

        var response = await Post(
            client,
            """{"token":"tok-1","password":"Str0ng!pass","name":"Tess","email":"attacker@evil.test"}""");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = await Json(response);
        var data = doc.RootElement.GetProperty("data");
        Assert.True(doc.RootElement.GetProperty("success").GetBoolean());
        Assert.Equal("user-9", data.GetProperty("userId").GetString());
        Assert.Equal("/teacher", data.GetProperty("redirectUrl").GetString());
        Assert.False(string.IsNullOrEmpty(data.GetProperty("token").GetString()));
        Assert.Equal("refresh-token-1", data.GetProperty("refreshToken").GetString());

        var user = data.GetProperty("user");
        Assert.Equal("user-9", user.GetProperty("id").GetString());
        Assert.Equal("role-teacher", user.GetProperty("roleId").GetString());
        Assert.Equal("teacher", user.GetProperty("roleName").GetString());
        Assert.Equal("invitee@example.test", user.GetProperty("email").GetString());
        Assert.Contains("teacher:dashboard", user.GetProperty("permissions").EnumerateArray().Select(p => p.GetString()));

        // The repository is handed the INVITE's lower-cased email, and the invite's schoolId.
        Assert.Equal("invitee@example.test", factory.Repository.SeenCompleteEmail);
        Assert.Equal(School, factory.Repository.SeenCompleteSchoolId);
        Assert.Equal("Tess", factory.Repository.SeenCompleteName);
        // The token is consumed by token, and the hash is a real bcrypt hash produced by the endpoint layer.
        Assert.Equal("tok-1", factory.Repository.SeenCompleteToken);
        Assert.StartsWith("$2", factory.Repository.SeenCompletePasswordHash);
    }

    /// <summary>teacher.ts:73 — setAuthCookies with BOTH tokens (unlike school-admin registration's single arg).</summary>
    [Fact]
    public async Task Complete_sets_both_auth_cookies()
    {
        using var factory = new Factory();
        factory.Repository.Invite = ValidInvite();
        using var client = factory.CreateClient();

        var response = await Post(client, """{"token":"tok-1","password":"Str0ng!pass"}""");

        var cookies = response.Headers.GetValues("Set-Cookie").ToArray();
        Assert.Contains(cookies, c => c.StartsWith("access_token=", StringComparison.Ordinal));
        Assert.Contains(cookies, c => c.StartsWith("refresh_token=", StringComparison.Ordinal));
    }

    // =============================================================================================
    // GET /profile -- teacher.ts:91
    // =============================================================================================

    [Fact]
    public async Task Profile_is_404_not_found_when_the_row_is_invisible_or_absent()
    {
        using var factory = new Factory();
        factory.Repository.Profile = null;
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Get, $"{Base}/profile", permissions: "teacher:dashboard");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        await AssertMessage(response, "Not found");
    }

    [Fact]
    public async Task Profile_returns_the_user_plus_school_name()
    {
        using var factory = new Factory();
        factory.Repository.Profile = new TeacherProfileRow(Caller, "Tess", "tess@example.test", School);
        factory.Repository.SchoolName = "Ridgeview High";
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Get, $"{Base}/profile", permissions: "teacher:dashboard");

        using var doc = await Json(response);
        var data = doc.RootElement.GetProperty("data");
        Assert.Equal(Caller, data.GetProperty("id").GetString());
        Assert.Equal("Tess", data.GetProperty("name").GetString());
        Assert.Equal("tess@example.test", data.GetProperty("email").GetString());
        Assert.Equal(School, data.GetProperty("schoolId").GetString());
        Assert.Equal("Ridgeview High", data.GetProperty("schoolName").GetString());
    }

    /// <summary>
    /// The counterpart to <see cref="Verify_omits_the_schoolName_key_entirely_when_there_is_no_school"/>:
    /// here the key IS present and null, because :99 writes <c>?? null</c>. Two sibling routes, two shapes.
    /// </summary>
    [Fact]
    public async Task Profile_keeps_a_null_schoolName_key_when_the_teacher_has_no_school()
    {
        using var factory = new Factory();
        factory.Repository.Profile = new TeacherProfileRow(Caller, "Tess", "tess@example.test", null);
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Get, $"{Base}/profile", permissions: "teacher:dashboard");

        using var doc = await Json(response);
        var data = doc.RootElement.GetProperty("data");
        Assert.True(data.TryGetProperty("schoolName", out var schoolName));
        Assert.Equal(JsonValueKind.Null, schoolName.ValueKind);
        Assert.Equal(JsonValueKind.Null, data.GetProperty("schoolId").ValueKind);
        Assert.Null(factory.Repository.SeenSchoolNameId);
    }

    // =============================================================================================
    // GET /evaluations/pending -- teacher.ts:111
    // =============================================================================================

    [Fact]
    public async Task Pending_evaluations_returns_the_four_field_projection()
    {
        using var factory = new Factory();
        factory.Repository.Pending =
        [
            new TeacherPendingEvaluationRow("eg-1", "Ada", "2030-05-06T07:08:09.010Z", "inv-1"),
            new TeacherPendingEvaluationRow("eg-2", "your student", "2030-05-06T07:08:09.010Z", "inv-2"),
        ];
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Get, $"{Base}/evaluations/pending", permissions: "evaluations:read");

        using var doc = await Json(response);
        var data = doc.RootElement.GetProperty("data");
        Assert.Equal(2, data.GetArrayLength());
        Assert.Equal("eg-1", data[0].GetProperty("evaluationId").GetString());
        Assert.Equal("Ada", data[0].GetProperty("studentName").GetString());
        Assert.Equal("2030-05-06T07:08:09.010Z", data[0].GetProperty("deadline").GetString());
        Assert.Equal("inv-1", data[0].GetProperty("token").GetString());
        Assert.Equal("your student", data[1].GetProperty("studentName").GetString());
        Assert.Equal(4, data[0].EnumerateObject().Count());
    }

    [Fact]
    public async Task Pending_evaluations_is_an_empty_array_not_a_404()
    {
        using var factory = new Factory();
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Get, $"{Base}/evaluations/pending", permissions: "evaluations:read");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = await Json(response);
        Assert.Equal(0, doc.RootElement.GetProperty("data").GetArrayLength());
    }

    // =============================================================================================
    // helpers
    // =============================================================================================

    private static TeacherInviteRow ValidInvite() => new(
        Id: "inv-1",
        Token: "tok-1",
        Email: "Invitee@Example.Test",
        SchoolId: School,
        ExpiresAt: new DateTime(2030, 1, 2, 3, 4, 5, 678, DateTimeKind.Utc),
        UsedAt: null);

    private static Task<HttpResponseMessage> Post(HttpClient client, string body) =>
        client.PostAsync(
            $"{Base}/onboarding/complete", new StringContent(body, Encoding.UTF8, "application/json"));

    private static Task<HttpResponseMessage> Send(
        HttpClient client, HttpMethod method, string path, string permissions)
    {
        var request = new HttpRequestMessage(method, path);
        request.Headers.Add(DevelopmentRequestContextFactory.UserIdHeader, Caller);
        request.Headers.Add(DevelopmentRequestContextFactory.RoleHeader, FormMapsRoles.Teacher);
        request.Headers.Add(DevelopmentRequestContextFactory.EmailHeader, "tess@example.test");
        request.Headers.Add(DevelopmentRequestContextFactory.NameHeader, "Tess");
        request.Headers.Add(DevelopmentRequestContextFactory.SchoolIdHeader, School);
        if (permissions.Length > 0)
        {
            request.Headers.Add(DevelopmentRequestContextFactory.PermissionsHeader, permissions);
        }

        return client.SendAsync(request);
    }

    private static async Task<JsonDocument> Json(HttpResponseMessage response) =>
        JsonDocument.Parse(await response.Content.ReadAsStringAsync());

    private static async Task AssertMessage(HttpResponseMessage response, string expected)
    {
        using var doc = await Json(response);
        Assert.False(doc.RootElement.GetProperty("success").GetBoolean());
        Assert.Equal(expected, doc.RootElement.GetProperty("message").GetString());
    }

    private sealed class Factory : WebApplicationFactory<Program>
    {
        public FakeRepository Repository { get; } = new();

        public CountingGuard Guard { get; } = new();

        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(Environments.Development);
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<ITeacherOnboardingRepository>();
                services.AddSingleton<ITeacherOnboardingRepository>(Repository);

                services.RemoveAll<IProtectedRequestGuard>();
                services.AddSingleton<IProtectedRequestGuard>(Guard);

                services.RemoveAll<IAuthRepository>();
                services.AddSingleton<IAuthRepository>(new StubRefreshTokenRepository());

                services.RemoveAll<AccessTokenFactory>();
                services.AddSingleton(new AccessTokenFactory(Options.Create(new LegacyJwtOptions())));
            });
        }
    }

    /// <summary>
    /// Real decisions, counted calls. Counting rather than stubbing keeps
    /// <see cref="Only_the_authenticated_pair_consults_the_auth_guard"/> honest: it observes that the guard was
    /// consulted, without changing what it decides.
    /// </summary>
    private sealed class CountingGuard : IProtectedRequestGuard
    {
        private readonly ProtectedRequestGuard inner = new();

        public int Calls { get; private set; }

        public GuardDecision RequireTenantContext(RequestContext context)
        {
            Calls++;
            return inner.RequireTenantContext(context);
        }

        public GuardDecision RequireIdentity(RequestContext context)
        {
            Calls++;
            return inner.RequireIdentity(context);
        }
    }

    private sealed class FakeRepository : ITeacherOnboardingRepository
    {
        public TeacherInviteRow? Invite { get; set; }

        public string? SchoolName { get; set; }

        public TeacherRoleRow? Role { get; set; } = new("role-teacher", "teacher");

        public TeacherOnboardingOutcome CompleteOutcome { get; set; } = TeacherOnboardingOutcome.Completed;

        public TeacherProfileRow? Profile { get; set; }

        public IReadOnlyList<TeacherPendingEvaluationRow> Pending { get; set; } = [];

        public string? SeenVerifyToken { get; private set; }

        public string? SeenSchoolNameId { get; private set; }

        public string? SeenCompleteToken { get; private set; }

        public string? SeenCompleteEmail { get; private set; }

        public string? SeenCompleteName { get; private set; }

        public string? SeenCompletePasswordHash { get; private set; }

        public string? SeenCompleteSchoolId { get; private set; }

        public RequestContext? ProfileContext { get; private set; }

        public RequestContext? PendingContext { get; private set; }

        public string? ProfileUserId { get; private set; }

        public string? PendingUserId { get; private set; }

        public Task<TeacherInviteRow?> FindInviteByTokenAsync(string token, CancellationToken cancellationToken = default)
        {
            SeenVerifyToken = token;
            return Task.FromResult(Invite);
        }

        public Task<string?> FindSchoolNameAsync(string schoolId, CancellationToken cancellationToken = default)
        {
            SeenSchoolNameId = schoolId;
            return Task.FromResult(SchoolName);
        }

        public Task<TeacherRoleRow?> FindActiveTeacherRoleAsync(CancellationToken cancellationToken = default) =>
            Task.FromResult(Role);

        public Task<TeacherOnboardingResult> CompleteOnboardingAsync(
            string token, string normalizedEmail, string? name, string passwordHash, TeacherRoleRow role,
            string? schoolId, CancellationToken cancellationToken = default)
        {
            SeenCompleteToken = token;
            SeenCompleteEmail = normalizedEmail;
            SeenCompleteName = name;
            SeenCompletePasswordHash = passwordHash;
            SeenCompleteSchoolId = schoolId;
            return Task.FromResult(new TeacherOnboardingResult(
                CompleteOutcome, "user-9", name ?? normalizedEmail, normalizedEmail));
        }

        public Task<TeacherProfileRow?> GetProfileAsync(
            RequestContext context, string userId, CancellationToken cancellationToken = default)
        {
            ProfileContext = context;
            ProfileUserId = userId;
            return Task.FromResult(Profile);
        }

        public Task<string?> GetSchoolNameAsync(
            RequestContext context, string schoolId, CancellationToken cancellationToken = default)
        {
            SeenSchoolNameId = schoolId;
            return Task.FromResult(SchoolName);
        }

        public Task<IReadOnlyList<TeacherPendingEvaluationRow>> ListPendingEvaluationsAsync(
            RequestContext context, string userId, CancellationToken cancellationToken = default)
        {
            PendingContext = context;
            PendingUserId = userId;
            return Task.FromResult(Pending);
        }
    }

    /// <summary>
    /// Only <see cref="IAuthRepository.CreateRefreshTokenAsync"/> is reachable from this router (teacher.ts:72);
    /// every other member throws so that a handler quietly growing a second auth-repository dependency fails
    /// loudly here instead of silently passing against a permissive stub.
    /// </summary>
    private sealed class StubRefreshTokenRepository : IAuthRepository
    {
        public Task<string> CreateRefreshTokenAsync(string userId, string clientIp, CancellationToken cancellationToken = default) =>
            Task.FromResult("refresh-token-1");

        public Task<AuthUserRow?> FindUserByEmailAsync(string normalizedEmail, CancellationToken cancellationToken = default) => throw new NotSupportedException();

        public Task<LockoutStatus> GetLockoutStatusAsync(string email, CancellationToken cancellationToken = default) => throw new NotSupportedException();

        public Task<int> RecordFailedLoginAsync(string email, string clientIp, CancellationToken cancellationToken = default) => throw new NotSupportedException();

        public Task ClearLoginAttemptsAsync(string email, CancellationToken cancellationToken = default) => throw new NotSupportedException();

        public Task<string> GetLanguageAsync(string userId, CancellationToken cancellationToken = default) => throw new NotSupportedException();

        public Task<RotateResult?> RotateRefreshTokenAsync(string oldToken, string clientIp, CancellationToken cancellationToken = default) => throw new NotSupportedException();

        public Task RevokeAllRefreshTokensAsync(string userId, string clientIp, CancellationToken cancellationToken = default) => throw new NotSupportedException();

        public Task<ProfileRow?> GetProfileAsync(string userId, CancellationToken cancellationToken = default) => throw new NotSupportedException();

        public Task UpdatePasswordAsync(string userId, string newHash, CancellationToken cancellationToken = default) => throw new NotSupportedException();

        public Task<AuthUserRow?> FindUserByIdWithRoleAsync(string userId, CancellationToken cancellationToken = default) => throw new NotSupportedException();

        public Task<ChangeEmailResult> ChangeEmailAsync(string userId, string newEmail, CancellationToken cancellationToken = default) => throw new NotSupportedException();

        public Task<ChangeRoleResult?> ChangeRoleAsync(string userId, string roleId, CancellationToken cancellationToken = default) => throw new NotSupportedException();

        public Task<bool> RoleExistsAndActiveAsync(string roleId, CancellationToken cancellationToken = default) => throw new NotSupportedException();

        public Task<SchoolInviteRow?> FindSchoolByInvitationTokenAsync(string token, CancellationToken cancellationToken = default) => throw new NotSupportedException();

        public Task<string> EnsureSchoolAdminRoleAsync(CancellationToken cancellationToken = default) => throw new NotSupportedException();

        public Task<AuthUserRow> UpsertSchoolAdminUserAsync(string schoolId, string email, string name, string passwordHash, string roleId, string roleName, CancellationToken cancellationToken = default) => throw new NotSupportedException();

        public Task ActivateSchoolAsync(string schoolId, CancellationToken cancellationToken = default) => throw new NotSupportedException();

        public Task InvalidatePriorResetTokensAsync(string userId, CancellationToken cancellationToken = default) => throw new NotSupportedException();

        public Task CreatePasswordResetTokenAsync(string userId, string sha256Hex, TimeSpan lifetime, CancellationToken cancellationToken = default) => throw new NotSupportedException();

        public Task<ResetTokenRow?> FindResetTokenAsync(string sha256Hex, CancellationToken cancellationToken = default) => throw new NotSupportedException();

        public Task<bool> ApplyPasswordResetAsync(string resetTokenId, string userId, string newHash, string clientIp, CancellationToken cancellationToken = default) => throw new NotSupportedException();
    }
}
