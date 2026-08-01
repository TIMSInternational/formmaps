// services/api/tests/FormMaps.IntegrationTests/Auth/AuthAdminEndpointsTests.cs
using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using FormMaps.Api.Auth;
using FormMaps.Application.Auth;
using FormMaps.Application.Email;
using FormMaps.Domain.Auth;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

namespace FormMaps.IntegrationTests.Auth;

/// <summary>
/// HTTP-level coverage for AuthAdminEndpoints (routes/auth-admin.ts's in-scope slice: POST /signup,
/// GET /unsubscribe, PUT /admin/set-password), mirroring AuthEndpointsTests's style exactly: a
/// WebApplicationFactory&lt;Program&gt; with a swapped-in fake IAuthAdminRepository, exercised via real
/// HTTP calls (dev-header identity for admin/set-password's RequireIdentity gate; real cookies/JSON
/// bodies for the pre-auth signup/unsubscribe routes). No Testcontainers/AuthDatabaseFixture usage --
/// this task's file list has no separate AuthAdminRepository SQL-correctness suite (unlike
/// AuthRepositoryLoginTests/etc. for IAuthRepository); IAuthAdminRepository's SQL is exercised only
/// indirectly, at the fake-repository boundary, same scope AuthEndpointsTests itself keeps for
/// IAuthRepository.
/// </summary>
public class AuthAdminEndpointsTests
{
    private const string Secret = "formmaps-test-secret-that-is-at-least-32-bytes";

    // ---- Signup ----

    [Fact]
    public async Task Signup_happy_path_issues_cookies_and_session()
    {
        var repo = new FakeAuthAdminRepository();
        using var factory = CreateFactory(repo);
        using var client = factory.CreateClient();

        var response = await client.PostAsync("/authapi/signup", JsonBody(new
        {
            name = "New Student",
            email = "newkid@example.test",
            password = "Sup3r$ecret",
            dateOfBirth = IsoYearsAgo(15),
        }));

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var setCookies = response.Headers.TryGetValues("Set-Cookie", out var cookies) ? cookies.ToList() : [];
        Assert.Contains(setCookies, c => c.StartsWith("access_token="));
        Assert.Contains(setCookies, c => c.StartsWith("refresh_token="));
        Assert.Contains(setCookies, c => c.StartsWith("logged_in="));

        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.True(doc.RootElement.GetProperty("success").GetBoolean());
        Assert.Equal("User registered successfully", doc.RootElement.GetProperty("message").GetString());
        var data = doc.RootElement.GetProperty("data");
        Assert.False(string.IsNullOrEmpty(data.GetProperty("token").GetString()));
        Assert.False(string.IsNullOrEmpty(data.GetProperty("refreshToken").GetString()));
        var user = data.GetProperty("user");
        Assert.Equal("newkid@example.test", user.GetProperty("email").GetString());
        Assert.Equal(FormMapsRoles.Student, user.GetProperty("roleName").GetString());
        Assert.True(user.GetProperty("permissions").GetArrayLength() > 0);
        Assert.True(repo.EnsureRoleWasCalled);
        Assert.NotNull(repo.LastCreatedUser);
    }

    [Fact]
    public async Task Signup_under_13_is_rejected_with_exact_legacy_message()
    {
        var repo = new FakeAuthAdminRepository();
        using var factory = CreateFactory(repo);
        using var client = factory.CreateClient();

        var response = await client.PostAsync("/authapi/signup", JsonBody(new
        {
            name = "Too Young",
            email = "young@example.test",
            password = "Sup3r$ecret",
            dateOfBirth = IsoYearsAgo(10),
        }));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(
            "You must be at least 13 years old to create an account. Please ask your school to invite you.",
            doc.RootElement.GetProperty("message").GetString());
        Assert.Null(repo.LastCreatedUser);
    }

    [Fact]
    public async Task Signup_invalid_date_of_birth_is_rejected()
    {
        var repo = new FakeAuthAdminRepository();
        using var factory = CreateFactory(repo);
        using var client = factory.CreateClient();

        var response = await client.PostAsync("/authapi/signup", JsonBody(new
        {
            name = "Bad Dob",
            email = "baddob@example.test",
            password = "Sup3r$ecret",
            dateOfBirth = "not-a-date",
        }));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("A valid date of birth is required.", doc.RootElement.GetProperty("message").GetString());
        Assert.Null(repo.LastCreatedUser);
    }

    [Fact]
    public async Task Signup_future_date_of_birth_is_rejected()
    {
        var repo = new FakeAuthAdminRepository();
        using var factory = CreateFactory(repo);
        using var client = factory.CreateClient();

        var response = await client.PostAsync("/authapi/signup", JsonBody(new
        {
            name = "Future Kid",
            email = "future@example.test",
            password = "Sup3r$ecret",
            dateOfBirth = IsoYearsAgo(-5),
        }));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("A valid date of birth is required.", doc.RootElement.GetProperty("message").GetString());
        Assert.Null(repo.LastCreatedUser);
    }

    [Fact]
    public async Task Signup_duplicate_email_is_rejected_with_generic_message()
    {
        var repo = new FakeAuthAdminRepository { EmailExists = true };
        using var factory = CreateFactory(repo);
        using var client = factory.CreateClient();

        var response = await client.PostAsync("/authapi/signup", JsonBody(new
        {
            name = "Dup Student",
            email = "taken@example.test",
            password = "Sup3r$ecret",
            dateOfBirth = IsoYearsAgo(15),
        }));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Unable to create account with this email", doc.RootElement.GetProperty("message").GetString());
        Assert.Null(repo.LastCreatedUser);
    }

    [Fact]
    public async Task Signup_records_acceptMarketing_true_into_user_settings()
    {
        var repo = new FakeAuthAdminRepository();
        using var factory = CreateFactory(repo);
        using var client = factory.CreateClient();

        await client.PostAsync("/authapi/signup", JsonBody(new
        {
            name = "Marketing Yes",
            email = "yes@example.test",
            password = "Sup3r$ecret",
            dateOfBirth = IsoYearsAgo(15),
            acceptMarketing = true,
        }));

        Assert.True(repo.LastMarketingEmails);
    }

    [Fact]
    public async Task Signup_defaults_acceptMarketing_to_false_when_omitted()
    {
        var repo = new FakeAuthAdminRepository();
        using var factory = CreateFactory(repo);
        using var client = factory.CreateClient();

        await client.PostAsync("/authapi/signup", JsonBody(new
        {
            name = "Marketing No",
            email = "no@example.test",
            password = "Sup3r$ecret",
            dateOfBirth = IsoYearsAgo(15),
        }));

        Assert.False(repo.LastMarketingEmails);
    }

    [Fact]
    public async Task Signup_with_valid_custom_roleId_uses_that_role()
    {
        var repo = new FakeAuthAdminRepository { RoleById = new AdminRoleRow("role-counselor", FormMapsRoles.Counselor) };
        using var factory = CreateFactory(repo);
        using var client = factory.CreateClient();

        var response = await client.PostAsync("/authapi/signup", JsonBody(new
        {
            name = "Custom Role",
            email = "custom@example.test",
            password = "Sup3r$ecret",
            dateOfBirth = IsoYearsAgo(20),
            roleId = "role-counselor",
        }));

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(FormMapsRoles.Counselor, doc.RootElement.GetProperty("data").GetProperty("user").GetProperty("roleName").GetString());
        Assert.False(repo.EnsureRoleWasCalled);
    }

    [Fact]
    public async Task Signup_with_unknown_roleId_is_rejected()
    {
        var repo = new FakeAuthAdminRepository { RoleById = null };
        using var factory = CreateFactory(repo);
        using var client = factory.CreateClient();

        var response = await client.PostAsync("/authapi/signup", JsonBody(new
        {
            name = "Bad Role",
            email = "badrole@example.test",
            password = "Sup3r$ecret",
            dateOfBirth = IsoYearsAgo(20),
            roleId = "role-unknown",
        }));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Invalid role", doc.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task Signup_weak_password_is_rejected()
    {
        var repo = new FakeAuthAdminRepository();
        using var factory = CreateFactory(repo);
        using var client = factory.CreateClient();

        var response = await client.PostAsync("/authapi/signup", JsonBody(new
        {
            name = "Weak Pw",
            email = "weak@example.test",
            password = "weak",
            dateOfBirth = IsoYearsAgo(15),
        }));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Null(repo.LastCreatedUser);
    }

    // ---- Unsubscribe ----

    [Fact]
    public async Task Unsubscribe_valid_token_clears_marketingEmails_with_exact_plain_text_body()
    {
        var repo = new FakeAuthAdminRepository();
        using var factory = CreateFactory(repo);
        using var client = factory.CreateClient();

        var token = SignJwt(new { sub = "u-123", purpose = "unsubscribe" }, Secret);
        var response = await client.GetAsync($"/authapi/unsubscribe?token={token}");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.StartsWith("text/html", response.Content.Headers.ContentType?.MediaType);
        var body = await response.Content.ReadAsStringAsync();
        Assert.Equal(
            "You've been unsubscribed from FormMaps marketing emails. You'll still receive essential account and school messages.",
            body);
        Assert.Equal("u-123", repo.LastMarketingSettingsUserId);
        Assert.False(repo.LastMarketingEmails);
    }

    [Fact]
    public async Task Unsubscribe_garbage_token_is_400_with_exact_plain_text_body()
    {
        var repo = new FakeAuthAdminRepository();
        using var factory = CreateFactory(repo);
        using var client = factory.CreateClient();

        var response = await client.GetAsync("/authapi/unsubscribe?token=garbage");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var body = await response.Content.ReadAsStringAsync();
        Assert.Equal("This unsubscribe link is invalid or has expired.", body);
        Assert.Null(repo.LastMarketingSettingsUserId);
    }

    [Fact]
    public async Task Unsubscribe_wrong_purpose_token_is_400()
    {
        var repo = new FakeAuthAdminRepository();
        using var factory = CreateFactory(repo);
        using var client = factory.CreateClient();

        var token = SignJwt(new { sub = "u-123", purpose = "password-reset" }, Secret);
        var response = await client.GetAsync($"/authapi/unsubscribe?token={token}");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var body = await response.Content.ReadAsStringAsync();
        Assert.Equal("This unsubscribe link is invalid or has expired.", body);
        Assert.Null(repo.LastMarketingSettingsUserId);
    }

    [Fact]
    public async Task Unsubscribe_wrong_secret_token_is_400()
    {
        var repo = new FakeAuthAdminRepository();
        using var factory = CreateFactory(repo);
        using var client = factory.CreateClient();

        var token = SignJwt(new { sub = "u-123", purpose = "unsubscribe" }, "a-completely-different-signing-secret-value");
        var response = await client.GetAsync($"/authapi/unsubscribe?token={token}");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Null(repo.LastMarketingSettingsUserId);
    }

    [Fact]
    public async Task Unsubscribe_expired_token_is_400()
    {
        var repo = new FakeAuthAdminRepository();
        using var factory = CreateFactory(repo);
        using var client = factory.CreateClient();

        var token = SignJwt(new { sub = "u-123", purpose = "unsubscribe" }, Secret, expiresAt: DateTime.UtcNow.AddDays(-1));
        var response = await client.GetAsync($"/authapi/unsubscribe?token={token}");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Null(repo.LastMarketingSettingsUserId);
    }

    // ---- Admin set-password ----

    [Fact]
    public async Task AdminSetPassword_happy_path_sets_password_for_same_school_target()
    {
        var repo = new FakeAuthAdminRepository
        {
            TargetUser = new AdminTargetUserRow("target-1", "target@example.test", "school-1"),
            CallerSchoolId = "school-1",
        };
        using var factory = CreateFactory(repo);
        using var client = factory.CreateClient();

        var request = new HttpRequestMessage(HttpMethod.Put, "/authapi/admin/set-password")
        {
            Content = JsonBody(new { email = "target@example.test", password = "NewPass1$" }),
        };
        AddDevIdentity(request, userId: "admin-1", role: FormMapsRoles.SchoolAdmin, schoolId: "school-1", permissions: "school:manage");
        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.True(doc.RootElement.GetProperty("success").GetBoolean());
        // Deliberately no "message" property -- matches auth-admin.ts:220 exactly (see
        // AuthAdminEndpoints.AdminSetPasswordAsync's comment).
        Assert.False(doc.RootElement.TryGetProperty("message", out _));
        var data = doc.RootElement.GetProperty("data");
        Assert.Equal("target-1", data.GetProperty("userId").GetString());
        Assert.Equal("target@example.test", data.GetProperty("email").GetString());
        Assert.Equal("target-1", repo.LastSetPasswordUserId);
    }

    [Fact]
    public async Task AdminSetPassword_caller_with_no_schoolId_is_403_not_404()
    {
        var repo = new FakeAuthAdminRepository
        {
            TargetUser = new AdminTargetUserRow("target-1", "target@example.test", "school-1"),
            CallerSchoolId = null,
        };
        using var factory = CreateFactory(repo);
        using var client = factory.CreateClient();

        var request = new HttpRequestMessage(HttpMethod.Put, "/authapi/admin/set-password")
        {
            Content = JsonBody(new { email = "target@example.test", password = "NewPass1$" }),
        };
        AddDevIdentity(request, userId: "admin-1", role: FormMapsRoles.SchoolAdmin, permissions: "school:manage");
        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Not authorized", doc.RootElement.GetProperty("message").GetString());
        Assert.Null(repo.LastSetPasswordUserId);
    }

    [Fact]
    public async Task AdminSetPassword_cross_school_target_is_403_not_404()
    {
        var repo = new FakeAuthAdminRepository
        {
            TargetUser = new AdminTargetUserRow("target-1", "target@example.test", "other-school"),
            CallerSchoolId = "school-1",
        };
        using var factory = CreateFactory(repo);
        using var client = factory.CreateClient();

        var request = new HttpRequestMessage(HttpMethod.Put, "/authapi/admin/set-password")
        {
            Content = JsonBody(new { email = "target@example.test", password = "NewPass1$" }),
        };
        AddDevIdentity(request, userId: "admin-1", role: FormMapsRoles.SchoolAdmin, schoolId: "school-1", permissions: "school:manage");
        var response = await client.SendAsync(request);

        // The load-bearing assertion for this task: cross-school MUST be 403, never 404 -- a
        // DIFFERENT rule from Task 12's change-password/change-email 404-collapse convention.
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Not authorized", doc.RootElement.GetProperty("message").GetString());
        Assert.Null(repo.LastSetPasswordUserId);
    }

    [Fact]
    public async Task AdminSetPassword_unknown_target_email_is_404()
    {
        var repo = new FakeAuthAdminRepository { TargetUser = null, CallerSchoolId = "school-1" };
        using var factory = CreateFactory(repo);
        using var client = factory.CreateClient();

        var request = new HttpRequestMessage(HttpMethod.Put, "/authapi/admin/set-password")
        {
            Content = JsonBody(new { email = "nobody@example.test", password = "NewPass1$" }),
        };
        AddDevIdentity(request, userId: "admin-1", role: FormMapsRoles.SchoolAdmin, schoolId: "school-1", permissions: "school:manage");
        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Not found", doc.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task AdminSetPassword_missing_permission_is_403()
    {
        var repo = new FakeAuthAdminRepository();
        using var factory = CreateFactory(repo);
        using var client = factory.CreateClient();

        var request = new HttpRequestMessage(HttpMethod.Put, "/authapi/admin/set-password")
        {
            Content = JsonBody(new { email = "target@example.test", password = "NewPass1$" }),
        };
        AddDevIdentity(request, userId: "admin-1", role: FormMapsRoles.Student);
        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("missing_permission", doc.RootElement.GetProperty("code").GetString());
    }

    [Fact]
    public async Task AdminSetPassword_without_identity_is_401()
    {
        using var factory = CreateFactory(new FakeAuthAdminRepository());
        using var client = factory.CreateClient();

        var response = await client.PutAsync("/authapi/admin/set-password", JsonBody(new { email = "e@example.test", password = "NewPass1$" }));

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task AdminSetPassword_weak_password_is_400()
    {
        var repo = new FakeAuthAdminRepository
        {
            TargetUser = new AdminTargetUserRow("target-1", "target@example.test", "school-1"),
            CallerSchoolId = "school-1",
        };
        using var factory = CreateFactory(repo);
        using var client = factory.CreateClient();

        var request = new HttpRequestMessage(HttpMethod.Put, "/authapi/admin/set-password")
        {
            Content = JsonBody(new { email = "target@example.test", password = "weak" }),
        };
        AddDevIdentity(request, userId: "admin-1", role: FormMapsRoles.SchoolAdmin, schoolId: "school-1", permissions: "school:manage");
        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Null(repo.LastSetPasswordUserId);
    }

    // ---- helpers ----

    private static string IsoYearsAgo(int years)
    {
        var d = DateTime.UtcNow.AddYears(-years);
        return d.ToString("yyyy-MM-dd");
    }

    private static string SignJwt(object claims, string secret, DateTime? expiresAt = null)
    {
        var handler = new JwtSecurityTokenHandler();
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret));
        var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var claimsList = new List<Claim>();
        foreach (var property in claims.GetType().GetProperties())
        {
            var value = property.GetValue(claims)?.ToString() ?? "";
            claimsList.Add(new Claim(property.Name, value));
        }

        var token = new JwtSecurityToken(
            claims: claimsList,
            expires: expiresAt,
            signingCredentials: credentials);

        return handler.WriteToken(token);
    }

    private static StringContent JsonBody(object body) =>
        new(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json");

    private static void AddDevIdentity(
        HttpRequestMessage request, string userId, string role, string? schoolId = null, string? permissions = null)
    {
        request.Headers.Add(DevelopmentRequestContextFactory.UserIdHeader, userId);
        request.Headers.Add(DevelopmentRequestContextFactory.RoleHeader, role);
        request.Headers.Add(DevelopmentRequestContextFactory.EmailHeader, "caller@example.test");
        request.Headers.Add(DevelopmentRequestContextFactory.NameHeader, "Caller");
        if (schoolId is not null) request.Headers.Add(DevelopmentRequestContextFactory.SchoolIdHeader, schoolId);
        if (permissions is not null) request.Headers.Add(DevelopmentRequestContextFactory.PermissionsHeader, permissions);
    }

    private static Factory CreateFactory(FakeAuthAdminRepository repository)
    {
        Environment.SetEnvironmentVariable("JWT_SECRET", Secret);
        return new Factory(repository);
    }

    private sealed class Factory(FakeAuthAdminRepository repository) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(Environments.Development);
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<IAuthAdminRepository>();
                services.AddSingleton<IAuthAdminRepository>(repository);

                services.RemoveAll<AccessTokenFactory>();
                services.AddSingleton(new AccessTokenFactory(Options.Create(new LegacyJwtOptions())));

                // Program.cs maps EVERY endpoint group unconditionally (AuthAdminEndpoints included,
                // as of this task), and AuthorizationPolicyCache eagerly walks every mapped endpoint's
                // metadata at host-startup -- so AuthEndpoints' OWN routes (unrelated to this test
                // file, but present in the same shared Program) must still be able to resolve their
                // dependencies here, or the WHOLE host fails to boot for every test in this class.
                // IAuthRepository/AccessTokenFactory/IEmailSender/EmailTemplates are never actually
                // exercised by any test in THIS file -- these are inert stand-ins purely so route
                // metadata can build, same purpose (if not the same instances) as AuthEndpointsTests'
                // own Factory overrides for its own tests.
                services.RemoveAll<IAuthRepository>();
                services.AddSingleton<IAuthRepository>(new NoOpAuthRepository());

                services.RemoveAll<IEmailSender>();
                services.AddSingleton<IEmailSender>(new FakeEmailSender());

                services.RemoveAll<EmailTemplates>();
                services.AddSingleton(new EmailTemplates(new EmailOptions(
                    FromEmail: "noreply@formmaps.com", FrontendUrl: "https://app.formmaps.com",
                    InviteBaseUrl: "https://app.formmaps.ai", LogoUrl: "https://example.test/logo.png",
                    PostalAddress: "FormMaps", AwsRegion: "us-east-1")));
            });
        }
    }

    private sealed class FakeEmailSender : IEmailSender
    {
        public Task<bool> SendAsync(string to, string subject, string html, CancellationToken cancellationToken = default) =>
            Task.FromResult(true);
    }

    /// <summary>Inert IAuthRepository stand-in -- see the Factory's comment above for why this
    /// exists. Never exercised: no test in this file calls any AuthEndpoints route.</summary>
    private sealed class NoOpAuthRepository : IAuthRepository
    {
        public Task<AuthUserRow?> FindUserByEmailAsync(string normalizedEmail, CancellationToken cancellationToken = default) =>
            Task.FromResult<AuthUserRow?>(null);

        public Task<LockoutStatus> GetLockoutStatusAsync(string email, CancellationToken cancellationToken = default) =>
            Task.FromResult(new LockoutStatus(false, null));

        public Task<int> RecordFailedLoginAsync(string email, string clientIp, CancellationToken cancellationToken = default) =>
            Task.FromResult(0);

        public Task ClearLoginAttemptsAsync(string email, CancellationToken cancellationToken = default) => Task.CompletedTask;

        public Task<string> GetLanguageAsync(string userId, CancellationToken cancellationToken = default) => Task.FromResult("en");

        public Task<string> CreateRefreshTokenAsync(string userId, string clientIp, CancellationToken cancellationToken = default) =>
            Task.FromResult("noop-refresh-token");

        public Task<RotateResult?> RotateRefreshTokenAsync(string oldToken, string clientIp, CancellationToken cancellationToken = default) =>
            Task.FromResult<RotateResult?>(null);

        public Task RevokeAllRefreshTokensAsync(string userId, string clientIp, CancellationToken cancellationToken = default) =>
            Task.CompletedTask;

        public Task<ProfileRow?> GetProfileAsync(string userId, CancellationToken cancellationToken = default) =>
            Task.FromResult<ProfileRow?>(null);

        public Task UpdatePasswordAsync(string userId, string newHash, CancellationToken cancellationToken = default) => Task.CompletedTask;

        public Task<AuthUserRow?> FindUserByIdWithRoleAsync(string userId, CancellationToken cancellationToken = default) =>
            Task.FromResult<AuthUserRow?>(null);

        public Task<ChangeEmailResult> ChangeEmailAsync(string userId, string newEmail, CancellationToken cancellationToken = default) =>
            Task.FromResult(ChangeEmailResult.NotFound);

        public Task<ChangeRoleResult?> ChangeRoleAsync(string userId, string roleId, CancellationToken cancellationToken = default) =>
            Task.FromResult<ChangeRoleResult?>(null);

        public Task<bool> RoleExistsAndActiveAsync(string roleId, CancellationToken cancellationToken = default) => Task.FromResult(false);

        public Task<SchoolInviteRow?> FindSchoolByInvitationTokenAsync(string token, CancellationToken cancellationToken = default) =>
            Task.FromResult<SchoolInviteRow?>(null);

        public Task<string> EnsureSchoolAdminRoleAsync(CancellationToken cancellationToken = default) => Task.FromResult("noop-role-id");

        public Task<AuthUserRow> UpsertSchoolAdminUserAsync(
            string schoolId, string email, string name, string passwordHash, string roleId, string roleName,
            CancellationToken cancellationToken = default) =>
            Task.FromResult(new AuthUserRow("noop-user-id", name, email, passwordHash, roleId, roleName, schoolId, true));

        public Task ActivateSchoolAsync(string schoolId, CancellationToken cancellationToken = default) => Task.CompletedTask;

        public Task InvalidatePriorResetTokensAsync(string userId, CancellationToken cancellationToken = default) => Task.CompletedTask;

        public Task CreatePasswordResetTokenAsync(string userId, string sha256Hex, TimeSpan lifetime, CancellationToken cancellationToken = default) =>
            Task.CompletedTask;

        public Task<ResetTokenRow?> FindResetTokenAsync(string sha256Hex, CancellationToken cancellationToken = default) =>
            Task.FromResult<ResetTokenRow?>(null);

        public Task ApplyPasswordResetAsync(string resetTokenId, string userId, string newHash, string clientIp, CancellationToken cancellationToken = default) =>
            Task.CompletedTask;
    }

    private sealed class FakeAuthAdminRepository : IAuthAdminRepository
    {
        public bool EmailExists { get; set; }
        public AdminRoleRow? RoleById { get; set; }
        public AdminTargetUserRow? TargetUser { get; set; }
        public string? CallerSchoolId { get; set; }

        public bool EnsureRoleWasCalled { get; private set; }
        public CreatedAdminUserRow? LastCreatedUser { get; private set; }
        public string? LastMarketingSettingsUserId { get; private set; }
        public bool LastMarketingEmails { get; private set; }
        public string? LastSetPasswordUserId { get; private set; }

        public Task<bool> EmailExistsAsync(string normalizedEmail, CancellationToken cancellationToken = default) =>
            Task.FromResult(EmailExists);

        public Task<string> EnsureRoleAsync(string roleName, CancellationToken cancellationToken = default)
        {
            EnsureRoleWasCalled = true;
            return Task.FromResult("role-student-id");
        }

        public Task<AdminRoleRow?> FindActiveRoleByIdAsync(string roleId, CancellationToken cancellationToken = default) =>
            Task.FromResult(RoleById);

        public Task<CreatedAdminUserRow> CreateUserAsync(
            string name, string normalizedEmail, string passwordHash, string roleId, string roleName,
            DateTime dateOfBirth, CancellationToken cancellationToken = default)
        {
            var created = new CreatedAdminUserRow(Guid.NewGuid().ToString(), name, normalizedEmail, roleId, roleName);
            LastCreatedUser = created;
            return Task.FromResult(created);
        }

        public Task UpsertUserMarketingSettingsAsync(string userId, bool marketingEmails, CancellationToken cancellationToken = default)
        {
            LastMarketingSettingsUserId = userId;
            LastMarketingEmails = marketingEmails;
            return Task.CompletedTask;
        }

        public Task<string> CreateRefreshTokenAsync(string userId, string clientIp, CancellationToken cancellationToken = default) =>
            Task.FromResult("new-refresh-token-from-signup");

        public Task<AdminTargetUserRow?> FindUserByEmailForAdminAsync(string normalizedEmail, CancellationToken cancellationToken = default) =>
            Task.FromResult(TargetUser);

        public Task<string?> GetUserSchoolIdAsync(string userId, CancellationToken cancellationToken = default) =>
            Task.FromResult(CallerSchoolId);

        public Task SetPasswordForSchoolUserAsync(string userId, string passwordHash, CancellationToken cancellationToken = default)
        {
            LastSetPasswordUserId = userId;
            return Task.CompletedTask;
        }
    }
}
