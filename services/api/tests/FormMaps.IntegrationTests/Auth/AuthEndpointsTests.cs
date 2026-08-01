// services/api/tests/FormMaps.IntegrationTests/Auth/AuthEndpointsTests.cs
using System.Net;
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

namespace FormMaps.IntegrationTests.Auth;

/// <summary>
/// HTTP-level coverage for AuthEndpoints (routes/auth.ts, 11 endpoints under /authapi), mirroring
/// MessagesEndpointsTests's style exactly: a WebApplicationFactory&lt;Program&gt; with a swapped-in
/// fake IAuthRepository (+ fake IEmailSender), exercised via real HTTP calls (dev-header identity for
/// the RequireIdentity-gated routes; real cookies/JSON bodies for the pre-auth routes), asserting
/// status codes, response envelope shapes, and cookie behavior. This file intentionally does NOT
/// re-cover IAuthRepository/SQL correctness -- that lives in the Testcontainers suites Tasks 6-10 already
/// wrote (AuthRepositoryLoginTests, AuthRepositoryRefreshTests, AuthRepositoryProfileTests,
/// AuthRepositorySchoolAdminRegistrationTests, AuthRepositoryResetPasswordTests).
/// </summary>
public class AuthEndpointsTests
{
    private const string Secret = "formmaps-test-secret-that-is-at-least-32-bytes";

    // ---- Login ----

    [Fact]
    public async Task Login_success_sets_three_cookies_and_returns_permissions_and_language()
    {
        var repo = new FakeAuthRepository
        {
            UserByEmail = new AuthUserRow("u1", "Ada", "ada@example.test", PasswordHasher.Hash("Sup3r$ecret"), "role_admin", FormMapsRoles.SuperAdmin, null, true),
            Language = "es",
        };
        using var factory = CreateFactory(repo);
        using var client = factory.CreateClient();

        var response = await client.PostAsync("/authapi/login", JsonBody(new { email = "ada@example.test", password = "Sup3r$ecret" }));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var setCookies = response.Headers.TryGetValues("Set-Cookie", out var cookies) ? cookies.ToList() : [];
        Assert.Contains(setCookies, c => c.StartsWith("access_token="));
        Assert.Contains(setCookies, c => c.StartsWith("refresh_token="));
        Assert.Contains(setCookies, c => c.StartsWith("logged_in="));

        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.True(doc.RootElement.GetProperty("success").GetBoolean());
        Assert.Equal("Login successful", doc.RootElement.GetProperty("message").GetString());
        var data = doc.RootElement.GetProperty("data");
        Assert.Equal("es", data.GetProperty("language").GetString());
        Assert.False(string.IsNullOrEmpty(data.GetProperty("token").GetString()));
        Assert.False(string.IsNullOrEmpty(data.GetProperty("refreshToken").GetString()));
        var permissions = data.GetProperty("user").GetProperty("permissions");
        Assert.True(permissions.GetArrayLength() > 0);
        Assert.Contains("admin:users", permissions.EnumerateArray().Select(p => p.GetString()));
    }

    [Fact]
    public async Task Login_wrong_password_is_401_uniform_message_and_increments_lockout()
    {
        var repo = new FakeAuthRepository
        {
            UserByEmail = new AuthUserRow("u1", "Ada", "ada@example.test", PasswordHasher.Hash("Sup3r$ecret"), "role_x", FormMapsRoles.Student, null, true),
        };
        using var factory = CreateFactory(repo);
        using var client = factory.CreateClient();

        var response = await client.PostAsync("/authapi/login", JsonBody(new { email = "ada@example.test", password = "wrong-one" }));

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Invalid email or password", doc.RootElement.GetProperty("message").GetString());
        Assert.Equal(1, repo.RecordFailedLoginCallCount);
    }

    [Fact]
    public async Task Login_unknown_email_is_401_same_uniform_message_as_wrong_password()
    {
        var repo = new FakeAuthRepository { UserByEmail = null };
        using var factory = CreateFactory(repo);
        using var client = factory.CreateClient();

        var response = await client.PostAsync("/authapi/login", JsonBody(new { email = "nobody@example.test", password = "whatever1" }));

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Invalid email or password", doc.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task Login_locked_account_is_429_with_remaining_minutes()
    {
        var repo = new FakeAuthRepository
        {
            Lockout = new LockoutStatus(true, DateTimeOffset.UtcNow.AddMinutes(7)),
        };
        using var factory = CreateFactory(repo);
        using var client = factory.CreateClient();

        var response = await client.PostAsync("/authapi/login", JsonBody(new { email = "ada@example.test", password = "whatever1" }));

        Assert.Equal((HttpStatusCode)429, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var message = doc.RootElement.GetProperty("message").GetString();
        Assert.Contains("Account temporarily locked", message);
        Assert.Contains("minute(s)", message);
    }

    [Fact]
    public async Task Login_missing_body_fields_is_400()
    {
        using var factory = CreateFactory(new FakeAuthRepository());
        using var client = factory.CreateClient();

        var response = await client.PostAsync("/authapi/login", JsonBody(new { email = "", password = "" }));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    // ---- Refresh ----

    [Theory]
    [InlineData("/authapi/refresh")]
    [InlineData("/authapi/refresh-token")]
    public async Task Refresh_valid_token_rotates_and_re_sets_cookies(string path)
    {
        var repo = new FakeAuthRepository
        {
            RotateResult = new RotateResult("new-refresh-token", "u1"),
            UserById = new AuthUserRow("u1", "Ada", "ada@example.test", null, "role_x", FormMapsRoles.Student, null, true),
        };
        using var factory = CreateFactory(repo);
        using var client = factory.CreateClient();

        var request = new HttpRequestMessage(HttpMethod.Post, path);
        request.Headers.Add("Cookie", "refresh_token=old-refresh-token");
        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var setCookies = response.Headers.TryGetValues("Set-Cookie", out var cookies) ? cookies.ToList() : [];
        Assert.Contains(setCookies, c => c.StartsWith("access_token="));
        Assert.Contains(setCookies, c => c.StartsWith("refresh_token=new-refresh-token"));

        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Token refreshed successfully", doc.RootElement.GetProperty("message").GetString());
        var data = doc.RootElement.GetProperty("data");
        Assert.Equal("new-refresh-token", data.GetProperty("refreshToken").GetString());
        Assert.True(data.GetProperty("expiresIn").GetInt32() > 0);
        Assert.Equal(data.GetProperty("token").GetString(), data.GetProperty("accessToken").GetString());
    }

    [Fact]
    public async Task Refresh_missing_token_is_400()
    {
        using var factory = CreateFactory(new FakeAuthRepository());
        using var client = factory.CreateClient();

        var response = await client.PostAsync("/authapi/refresh", JsonBody(new { }));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Refresh token is required", doc.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task Refresh_invalid_token_is_401_and_clears_cookies()
    {
        var repo = new FakeAuthRepository { RotateResult = null };
        using var factory = CreateFactory(repo);
        using var client = factory.CreateClient();

        var request = new HttpRequestMessage(HttpMethod.Post, "/authapi/refresh");
        request.Headers.Add("Cookie", "refresh_token=stale-token");
        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Invalid or expired refresh token", doc.RootElement.GetProperty("message").GetString());
    }

    // ---- Logout ----

    [Fact]
    public async Task Logout_clears_cookies_and_revokes_all_tokens()
    {
        var repo = new FakeAuthRepository();
        using var factory = CreateFactory(repo);
        using var client = factory.CreateClient();

        var request = new HttpRequestMessage(HttpMethod.Delete, "/authapi/refresh");
        AddDevIdentity(request, userId: "caller-1", role: FormMapsRoles.Student);
        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("caller-1", repo.LastRevokeAllUserId);

        var setCookies = response.Headers.TryGetValues("Set-Cookie", out var cookies) ? cookies.ToList() : [];
        Assert.Contains(setCookies, c => c.StartsWith("access_token=") && c.Contains("expires="));

        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Refresh token revoked", doc.RootElement.GetProperty("message").GetString());
        Assert.True(doc.RootElement.GetProperty("data").GetProperty("Success").GetBoolean());
    }

    [Fact]
    public async Task Logout_without_identity_is_401()
    {
        using var factory = CreateFactory(new FakeAuthRepository());
        using var client = factory.CreateClient();

        var response = await client.SendAsync(new HttpRequestMessage(HttpMethod.Delete, "/authapi/refresh"));

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    // ---- Profile ----

    [Fact]
    public async Task Profile_requires_auth()
    {
        using var factory = CreateFactory(new FakeAuthRepository());
        using var client = factory.CreateClient();

        var response = await client.GetAsync("/authapi/profile");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Profile_returns_the_repository_shape()
    {
        var repo = new FakeAuthRepository
        {
            Profile = new ProfileRow("caller-1", "Ada", "ada@example.test", "role_x", FormMapsRoles.Student, "school-1", "active"),
        };
        using var factory = CreateFactory(repo);
        using var client = factory.CreateClient();

        var request = new HttpRequestMessage(HttpMethod.Get, "/authapi/profile");
        AddDevIdentity(request, userId: "caller-1", role: FormMapsRoles.Student, schoolId: "school-1");
        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = doc.RootElement.GetProperty("data");
        Assert.Equal("caller-1", data.GetProperty("id").GetString());
        Assert.Equal("active", data.GetProperty("subscriptionStatus").GetString());
        Assert.Equal(FormMapsRoles.Student, data.GetProperty("role").GetString());
    }

    [Fact]
    public async Task Profile_missing_user_is_404()
    {
        var repo = new FakeAuthRepository { Profile = null };
        using var factory = CreateFactory(repo);
        using var client = factory.CreateClient();

        var request = new HttpRequestMessage(HttpMethod.Get, "/authapi/profile");
        AddDevIdentity(request, userId: "caller-1", role: FormMapsRoles.Student);
        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("User not found", doc.RootElement.GetProperty("message").GetString());
    }

    // ---- Change password ----

    [Fact]
    public async Task ChangePassword_self_service_requires_old_password()
    {
        var repo = new FakeAuthRepository
        {
            UserById = new AuthUserRow("caller-1", "Ada", "ada@example.test", PasswordHasher.Hash("Original1$"), "role_x", FormMapsRoles.Student, null, true),
        };
        using var factory = CreateFactory(repo);
        using var client = factory.CreateClient();

        var request = new HttpRequestMessage(HttpMethod.Put, "/authapi/change-password")
        {
            Content = JsonBody(new { password = "NewPass1$" }),
        };
        AddDevIdentity(request, userId: "caller-1", role: FormMapsRoles.Student);
        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Current password required", doc.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task ChangePassword_self_service_wrong_old_password_is_400()
    {
        var repo = new FakeAuthRepository
        {
            UserById = new AuthUserRow("caller-1", "Ada", "ada@example.test", PasswordHasher.Hash("Original1$"), "role_x", FormMapsRoles.Student, null, true),
        };
        using var factory = CreateFactory(repo);
        using var client = factory.CreateClient();

        var request = new HttpRequestMessage(HttpMethod.Put, "/authapi/change-password")
        {
            Content = JsonBody(new { password = "NewPass1$", oldPassword = "wrong" }),
        };
        AddDevIdentity(request, userId: "caller-1", role: FormMapsRoles.Student);
        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Current password is incorrect", doc.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task ChangePassword_self_service_happy_path_revokes_sessions_and_returns_200()
    {
        var repo = new FakeAuthRepository
        {
            UserById = new AuthUserRow("caller-1", "Ada", "ada@example.test", PasswordHasher.Hash("Original1$"), "role_x", FormMapsRoles.Student, null, true),
        };
        using var factory = CreateFactory(repo);
        using var client = factory.CreateClient();

        var request = new HttpRequestMessage(HttpMethod.Put, "/authapi/change-password")
        {
            Content = JsonBody(new { password = "NewPass1$", oldPassword = "Original1$" }),
        };
        AddDevIdentity(request, userId: "caller-1", role: FormMapsRoles.Student);
        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("caller-1", repo.LastRevokeAllUserId);
        Assert.NotNull(repo.LastUpdatedPasswordHash);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Password changed successfully", doc.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task ChangePassword_weak_password_is_400_before_any_lookup()
    {
        var repo = new FakeAuthRepository();
        using var factory = CreateFactory(repo);
        using var client = factory.CreateClient();

        var request = new HttpRequestMessage(HttpMethod.Put, "/authapi/change-password")
        {
            Content = JsonBody(new { password = "weak" }),
        };
        AddDevIdentity(request, userId: "caller-1", role: FormMapsRoles.Student);
        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Null(repo.LastFindUserByIdCalledFor);
    }

    [Fact]
    public async Task ChangePassword_admin_action_role_checked_before_target_lookup()
    {
        // Non-privileged caller attempts to change someone else's password by email --
        // the 403 must fire WITHOUT ever calling FindUserByEmailAsync (item 1: role-check-before-lookup).
        var repo = new FakeAuthRepository();
        using var factory = CreateFactory(repo);
        using var client = factory.CreateClient();

        var request = new HttpRequestMessage(HttpMethod.Put, "/authapi/change-password")
        {
            Content = JsonBody(new { email = "target@example.test", password = "NewPass1$" }),
        };
        AddDevIdentity(request, userId: "caller-1", role: FormMapsRoles.Student);
        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Cannot change another user's password", doc.RootElement.GetProperty("message").GetString());
        Assert.False(repo.FindUserByEmailWasCalled);
    }

    [Fact]
    public async Task ChangePassword_school_admin_cross_school_target_collapses_to_404_not_403()
    {
        var repo = new FakeAuthRepository
        {
            UserByEmail = new AuthUserRow("target-1", "Target", "target@example.test", PasswordHasher.Hash("x"), "role_x", FormMapsRoles.Student, "other-school", true),
        };
        using var factory = CreateFactory(repo);
        using var client = factory.CreateClient();

        var request = new HttpRequestMessage(HttpMethod.Put, "/authapi/change-password")
        {
            Content = JsonBody(new { email = "target@example.test", password = "NewPass1$" }),
        };
        AddDevIdentity(request, userId: "caller-1", role: FormMapsRoles.SchoolAdmin, schoolId: "my-school");
        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Not found", doc.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task ChangePassword_super_admin_can_act_on_another_user_by_email()
    {
        var repo = new FakeAuthRepository
        {
            UserByEmail = new AuthUserRow("target-1", "Target", "target@example.test", PasswordHasher.Hash("x"), "role_x", FormMapsRoles.Student, null, true),
        };
        using var factory = CreateFactory(repo);
        using var client = factory.CreateClient();

        var request = new HttpRequestMessage(HttpMethod.Put, "/authapi/change-password")
        {
            Content = JsonBody(new { email = "target@example.test", password = "NewPass1$" }),
        };
        AddDevIdentity(request, userId: "caller-1", role: FormMapsRoles.SuperAdmin);
        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("target-1", repo.LastRevokeAllUserId);
    }

    // ---- Change email ----

    [Fact]
    public async Task ChangeEmail_normalizes_new_email_before_calling_the_repository()
    {
        var repo = new FakeAuthRepository
        {
            UserById = new AuthUserRow("caller-1", "Ada", "ada@example.test", null, "role_x", FormMapsRoles.Student, null, true),
        };
        using var factory = CreateFactory(repo);
        using var client = factory.CreateClient();

        var request = new HttpRequestMessage(HttpMethod.Put, "/authapi/change-email")
        {
            Content = JsonBody(new { userId = "caller-1", newEmail = "  NEW@EXAMPLE.TEST  " }),
        };
        AddDevIdentity(request, userId: "caller-1", role: FormMapsRoles.Student);
        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("new@example.test", repo.LastChangeEmailNewEmail);
    }

    [Fact]
    public async Task ChangeEmail_conflict_is_409()
    {
        var repo = new FakeAuthRepository
        {
            UserById = new AuthUserRow("caller-1", "Ada", "ada@example.test", null, "role_x", FormMapsRoles.Student, null, true),
            ChangeEmailResult = ChangeEmailResult.Conflict,
        };
        using var factory = CreateFactory(repo);
        using var client = factory.CreateClient();

        var request = new HttpRequestMessage(HttpMethod.Put, "/authapi/change-email")
        {
            Content = JsonBody(new { userId = "caller-1", newEmail = "taken@example.test" }),
        };
        AddDevIdentity(request, userId: "caller-1", role: FormMapsRoles.Student);
        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Email already in use", doc.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task ChangeEmail_non_privileged_caller_acting_on_another_user_is_403_before_lookup()
    {
        var repo = new FakeAuthRepository();
        using var factory = CreateFactory(repo);
        using var client = factory.CreateClient();

        var request = new HttpRequestMessage(HttpMethod.Put, "/authapi/change-email")
        {
            Content = JsonBody(new { userId = "someone-else", newEmail = "new@example.test" }),
        };
        AddDevIdentity(request, userId: "caller-1", role: FormMapsRoles.Student);
        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Null(repo.LastFindUserByIdCalledFor);
    }

    // ---- Change role ----

    [Fact]
    public async Task ChangeRole_requires_admin_users_permission()
    {
        using var factory = CreateFactory(new FakeAuthRepository());
        using var client = factory.CreateClient();

        var request = new HttpRequestMessage(HttpMethod.Put, "/authapi/change-role")
        {
            Content = JsonBody(new { userId = "u2", roleId = "role_admin" }),
        };
        AddDevIdentity(request, userId: "caller-1", role: FormMapsRoles.SchoolAdmin, permissions: "school:manage");
        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Insufficient permissions", doc.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task ChangeRole_target_not_found_is_404()
    {
        var repo = new FakeAuthRepository { UserById = null };
        using var factory = CreateFactory(repo);
        using var client = factory.CreateClient();

        var request = new HttpRequestMessage(HttpMethod.Put, "/authapi/change-role")
        {
            Content = JsonBody(new { userId = "missing", roleId = "role_admin" }),
        };
        AddDevIdentity(request, userId: "caller-1", role: FormMapsRoles.SuperAdmin, permissions: "admin:users");
        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("User not found", doc.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task ChangeRole_already_has_role_is_400_resolved_without_calling_repository()
    {
        var repo = new FakeAuthRepository
        {
            UserById = new AuthUserRow("u2", "Bob", "bob@example.test", null, "role_admin", FormMapsRoles.SuperAdmin, null, true),
        };
        using var factory = CreateFactory(repo);
        using var client = factory.CreateClient();

        var request = new HttpRequestMessage(HttpMethod.Put, "/authapi/change-role")
        {
            Content = JsonBody(new { userId = "u2", roleId = "role_admin" }),
        };
        AddDevIdentity(request, userId: "caller-1", role: FormMapsRoles.SuperAdmin, permissions: "admin:users");
        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("User already has this role", doc.RootElement.GetProperty("message").GetString());
        Assert.False(repo.ChangeRoleWasCalled);
    }

    [Fact]
    public async Task ChangeRole_repository_null_after_already_has_role_excluded_means_role_not_found()
    {
        var repo = new FakeAuthRepository
        {
            UserById = new AuthUserRow("u2", "Bob", "bob@example.test", null, "role_student", FormMapsRoles.Student, null, true),
            ChangeRoleResult = null,
        };
        using var factory = CreateFactory(repo);
        using var client = factory.CreateClient();

        var request = new HttpRequestMessage(HttpMethod.Put, "/authapi/change-role")
        {
            Content = JsonBody(new { userId = "u2", roleId = "role_unknown" }),
        };
        AddDevIdentity(request, userId: "caller-1", role: FormMapsRoles.SuperAdmin, permissions: "admin:users");
        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Role not found", doc.RootElement.GetProperty("message").GetString());
        Assert.True(repo.ChangeRoleWasCalled);
    }

    [Fact]
    public async Task ChangeRole_happy_path_is_200_with_the_result_shape()
    {
        var repo = new FakeAuthRepository
        {
            UserById = new AuthUserRow("u2", "Bob", "bob@example.test", null, "role_student", FormMapsRoles.Student, null, true),
            ChangeRoleResult = new ChangeRoleResult("u2", "Bob", "bob@example.test", "role_student", FormMapsRoles.Student, "role_admin", FormMapsRoles.SuperAdmin),
        };
        using var factory = CreateFactory(repo);
        using var client = factory.CreateClient();

        var request = new HttpRequestMessage(HttpMethod.Put, "/authapi/change-role")
        {
            Content = JsonBody(new { userId = "u2", roleId = "role_admin" }),
        };
        AddDevIdentity(request, userId: "caller-1", role: FormMapsRoles.SuperAdmin, permissions: "admin:users");
        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = doc.RootElement.GetProperty("data");
        Assert.Equal("role_admin", data.GetProperty("newRoleId").GetString());
        Assert.Equal(FormMapsRoles.SuperAdmin, data.GetProperty("newRoleName").GetString());
    }

    // ---- School admin registration completion ----

    [Fact]
    public async Task SchoolAdminRegistration_unknown_token_is_400_invalid_token()
    {
        var repo = new FakeAuthRepository { SchoolInvite = null };
        using var factory = CreateFactory(repo);
        using var client = factory.CreateClient();

        var response = await client.PostAsync("/authapi/school-admin/complete-registration",
            JsonBody(new { token = "bogus", password = "NewPass1$", name = "Ada" }));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Invalid invitation token", doc.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task SchoolAdminRegistration_expired_token_is_400_distinct_message()
    {
        var repo = new FakeAuthRepository
        {
            SchoolInvite = new SchoolInviteRow("school-1", "admin@example.test", DateTimeOffset.UtcNow.AddDays(-1)),
        };
        using var factory = CreateFactory(repo);
        using var client = factory.CreateClient();

        var response = await client.PostAsync("/authapi/school-admin/complete-registration",
            JsonBody(new { token = "expired-token", password = "NewPass1$", name = "Ada" }));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Invitation token has expired", doc.RootElement.GetProperty("message").GetString());
        Assert.False(repo.EnsureSchoolAdminRoleWasCalled);
    }

    [Fact]
    public async Task SchoolAdminRegistration_valid_token_creates_admin_normalizes_email_and_sets_access_cookie_only()
    {
        var repo = new FakeAuthRepository
        {
            SchoolInvite = new SchoolInviteRow("school-1", "  ADMIN@EXAMPLE.TEST  ", DateTimeOffset.UtcNow.AddDays(1)),
            EnsureSchoolAdminRoleId = "role_school_admin",
            UpsertedSchoolAdminUser = new AuthUserRow("new-user", "Ada", "admin@example.test", "hash", "role_school_admin", FormMapsRoles.SchoolAdmin, "school-1", true),
        };
        using var factory = CreateFactory(repo);
        using var client = factory.CreateClient();

        var response = await client.PostAsync("/authapi/school-admin/complete-registration",
            JsonBody(new { token = "valid-token", password = "NewPass1$", name = "Ada" }));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("admin@example.test", repo.LastUpsertSchoolAdminEmail);
        Assert.True(repo.ActivateSchoolWasCalledFor == "school-1");

        var setCookies = response.Headers.TryGetValues("Set-Cookie", out var cookies) ? cookies.ToList() : [];
        Assert.Contains(setCookies, c => c.StartsWith("access_token="));
        Assert.DoesNotContain(setCookies, c => c.StartsWith("refresh_token="));

        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = doc.RootElement.GetProperty("data");
        Assert.True(data.GetProperty("success").GetBoolean());
        Assert.Equal(FormMapsRoles.SchoolAdmin, data.GetProperty("user").GetProperty("role").GetProperty("name").GetString());
    }

    // ---- Forgot password ----

    [Fact]
    public async Task ForgotPassword_returns_200_when_email_does_not_exist()
    {
        var repo = new FakeAuthRepository { UserByEmail = null };
        using var factory = CreateFactory(repo);
        using var client = factory.CreateClient();

        var response = await client.PostAsync("/authapi/forgot-password", JsonBody(new { email = "nobody@example.test" }));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("If an account exists with this email, a reset link has been sent", doc.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task ForgotPassword_returns_200_when_email_exists_same_message_no_enumeration()
    {
        var repo = new FakeAuthRepository
        {
            UserByEmail = new AuthUserRow("u1", "Ada", "ada@example.test", "hash", "role_x", FormMapsRoles.Student, null, true),
        };
        using var factory = CreateFactory(repo);
        using var client = factory.CreateClient();

        var response = await client.PostAsync("/authapi/forgot-password", JsonBody(new { email = "ada@example.test" }));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("If an account exists with this email, a reset link has been sent", doc.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task ForgotPassword_responds_before_the_background_work_completes()
    {
        var repo = new FakeAuthRepository
        {
            UserByEmail = new AuthUserRow("u1", "Ada", "ada@example.test", "hash", "role_x", FormMapsRoles.Student, null, true),
            ForgotPasswordGate = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously),
        };
        using var factory = CreateFactory(repo);
        using var client = factory.CreateClient();

        var sw = System.Diagnostics.Stopwatch.StartNew();
        var response = await client.PostAsync("/authapi/forgot-password", JsonBody(new { email = "ada@example.test" }));
        sw.Stop();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        // The handler must not have awaited the gated background call -- if it had, this request
        // would still be pending right now (the gate is never released in this test).
        // The definitive proof is the flag assertion below (the response has already returned while
        // the background call is still blocked on a gate that is never released above this point).
        // The elapsed-time bound is a generous sanity check only -- WebApplicationFactory cold-start/
        // JIT overhead on the very first request in a test process can itself take a couple of
        // seconds, unrelated to whether the handler awaited the gated background call.
        Assert.True(sw.ElapsedMilliseconds < 15000, $"expected the response to return without awaiting the background task, took {sw.ElapsedMilliseconds}ms");
        Assert.False(repo.InvalidatePriorResetTokensWasCalled);

        // Release the gate and confirm the background work eventually runs (proves it's real
        // fire-and-forget work, not a no-op).
        repo.ForgotPasswordGate!.SetResult();
        var deadline = DateTime.UtcNow.AddSeconds(5);
        while (!repo.InvalidatePriorResetTokensWasCalled && DateTime.UtcNow < deadline)
        {
            await Task.Delay(20);
        }
        Assert.True(repo.InvalidatePriorResetTokensWasCalled, "expected the background forgot-password work to eventually run");
        Assert.True(repo.CreatePasswordResetTokenWasCalled);
    }

    [Fact]
    public async Task ForgotPassword_invalid_email_is_400()
    {
        using var factory = CreateFactory(new FakeAuthRepository());
        using var client = factory.CreateClient();

        var response = await client.PostAsync("/authapi/forgot-password", JsonBody(new { email = "not-an-email" }));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Invalid email", doc.RootElement.GetProperty("message").GetString());
    }

    // ---- Reset password ----

    [Fact]
    public async Task ResetPassword_unknown_token_is_400_and_never_calls_apply()
    {
        var repo = new FakeAuthRepository { ResetToken = null };
        using var factory = CreateFactory(repo);
        using var client = factory.CreateClient();

        var response = await client.PostAsync("/authapi/reset-password", JsonBody(new { token = "bogus", password = "NewPass1$" }));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Invalid or expired reset token", doc.RootElement.GetProperty("message").GetString());
        Assert.False(repo.ApplyPasswordResetWasCalled);
    }

    [Fact]
    public async Task ResetPassword_expired_token_is_400_and_never_calls_apply()
    {
        var repo = new FakeAuthRepository
        {
            ResetToken = new ResetTokenRow("rt1", "u1", DateTimeOffset.UtcNow.AddHours(-1), null, true),
        };
        using var factory = CreateFactory(repo);
        using var client = factory.CreateClient();

        var response = await client.PostAsync("/authapi/reset-password", JsonBody(new { token = "expired", password = "NewPass1$" }));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Invalid or expired reset token", doc.RootElement.GetProperty("message").GetString());
        Assert.False(repo.ApplyPasswordResetWasCalled);
    }

    [Fact]
    public async Task ResetPassword_already_used_token_is_400_and_never_calls_apply()
    {
        var repo = new FakeAuthRepository
        {
            ResetToken = new ResetTokenRow("rt1", "u1", DateTimeOffset.UtcNow.AddHours(1), DateTimeOffset.UtcNow.AddMinutes(-5), true),
        };
        using var factory = CreateFactory(repo);
        using var client = factory.CreateClient();

        var response = await client.PostAsync("/authapi/reset-password", JsonBody(new { token = "used", password = "NewPass1$" }));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.False(repo.ApplyPasswordResetWasCalled);
    }

    [Fact]
    public async Task ResetPassword_inactive_user_token_is_400_and_never_calls_apply()
    {
        var repo = new FakeAuthRepository
        {
            ResetToken = new ResetTokenRow("rt1", "u1", DateTimeOffset.UtcNow.AddHours(1), null, false),
        };
        using var factory = CreateFactory(repo);
        using var client = factory.CreateClient();

        var response = await client.PostAsync("/authapi/reset-password", JsonBody(new { token = "inactive", password = "NewPass1$" }));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.False(repo.ApplyPasswordResetWasCalled);
    }

    [Fact]
    public async Task ResetPassword_valid_token_calls_apply_with_the_validated_ids_and_returns_200()
    {
        var repo = new FakeAuthRepository
        {
            ResetToken = new ResetTokenRow("rt1", "u1", DateTimeOffset.UtcNow.AddHours(1), null, true),
        };
        using var factory = CreateFactory(repo);
        using var client = factory.CreateClient();

        var response = await client.PostAsync("/authapi/reset-password", JsonBody(new { token = "good-token", password = "NewPass1$" }));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.True(repo.ApplyPasswordResetWasCalled);
        Assert.Equal("rt1", repo.LastApplyResetTokenId);
        Assert.Equal("u1", repo.LastApplyUserId);
        // Legacy hardcodes "password-reset" as the revokedByIp marker for this specific flow --
        // NOT the caller's real client IP.
        Assert.Equal("password-reset", repo.LastApplyClientIp);

        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Password reset successfully", doc.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task ResetPassword_weak_password_is_400_before_any_token_lookup()
    {
        var repo = new FakeAuthRepository();
        using var factory = CreateFactory(repo);
        using var client = factory.CreateClient();

        var response = await client.PostAsync("/authapi/reset-password", JsonBody(new { token = "whatever", password = "weak" }));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.False(repo.FindResetTokenWasCalled);
    }

    // ---- helpers ----

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

    private static Factory CreateFactory(FakeAuthRepository repository)
    {
        Environment.SetEnvironmentVariable("JWT_SECRET", Secret);
        return new Factory(repository);
    }

    private sealed class Factory(FakeAuthRepository repository) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(Environments.Development);
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<IAuthRepository>();
                services.AddSingleton<IAuthRepository>(repository);

                services.RemoveAll<IEmailSender>();
                services.AddSingleton<IEmailSender>(new FakeEmailSender());

                services.RemoveAll<AccessTokenFactory>();
                services.AddSingleton(new AccessTokenFactory(Options.Create(new LegacyJwtOptions())));

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

    private sealed class FakeAuthRepository : IAuthRepository
    {
        public AuthUserRow? UserByEmail { get; set; }
        public AuthUserRow? UserById { get; set; }
        public LockoutStatus Lockout { get; set; } = new(false, null);
        public string Language { get; set; } = "en";
        public RotateResult? RotateResult { get; set; }
        public ProfileRow? Profile { get; set; }
        public ChangeEmailResult ChangeEmailResult { get; set; } = ChangeEmailResult.Ok;
        public ChangeRoleResult? ChangeRoleResult { get; set; }
        public SchoolInviteRow? SchoolInvite { get; set; }
        public string EnsureSchoolAdminRoleId { get; set; } = "role_school_admin";
        public AuthUserRow? UpsertedSchoolAdminUser { get; set; }
        public ResetTokenRow? ResetToken { get; set; }
        public TaskCompletionSource? ForgotPasswordGate { get; set; }

        public int RecordFailedLoginCallCount { get; private set; }
        public bool FindUserByEmailWasCalled { get; private set; }
        public string? LastFindUserByIdCalledFor { get; private set; }
        public string? LastRevokeAllUserId { get; private set; }
        public string? LastUpdatedPasswordHash { get; private set; }
        public string? LastChangeEmailNewEmail { get; private set; }
        public bool ChangeRoleWasCalled { get; private set; }
        public bool EnsureSchoolAdminRoleWasCalled { get; private set; }
        public string? LastUpsertSchoolAdminEmail { get; private set; }
        public string? ActivateSchoolWasCalledFor { get; private set; }
        public bool InvalidatePriorResetTokensWasCalled { get; private set; }
        public bool CreatePasswordResetTokenWasCalled { get; private set; }
        public bool FindResetTokenWasCalled { get; private set; }
        public bool ApplyPasswordResetWasCalled { get; private set; }
        public string? LastApplyResetTokenId { get; private set; }
        public string? LastApplyUserId { get; private set; }
        public string? LastApplyClientIp { get; private set; }

        public Task<AuthUserRow?> FindUserByEmailAsync(string normalizedEmail, CancellationToken cancellationToken = default)
        {
            FindUserByEmailWasCalled = true;
            return Task.FromResult(UserByEmail);
        }

        public Task<LockoutStatus> GetLockoutStatusAsync(string email, CancellationToken cancellationToken = default) =>
            Task.FromResult(Lockout);

        public Task<int> RecordFailedLoginAsync(string email, string clientIp, CancellationToken cancellationToken = default)
        {
            RecordFailedLoginCallCount++;
            return Task.FromResult(RecordFailedLoginCallCount);
        }

        public Task ClearLoginAttemptsAsync(string email, CancellationToken cancellationToken = default) => Task.CompletedTask;

        public Task<string> GetLanguageAsync(string userId, CancellationToken cancellationToken = default) => Task.FromResult(Language);

        public Task<string> CreateRefreshTokenAsync(string userId, string clientIp, CancellationToken cancellationToken = default) =>
            Task.FromResult("new-refresh-token-from-login");

        public Task<RotateResult?> RotateRefreshTokenAsync(string oldToken, string clientIp, CancellationToken cancellationToken = default) =>
            Task.FromResult(RotateResult);

        public Task RevokeAllRefreshTokensAsync(string userId, string clientIp, CancellationToken cancellationToken = default)
        {
            LastRevokeAllUserId = userId;
            return Task.CompletedTask;
        }

        public Task<ProfileRow?> GetProfileAsync(string userId, CancellationToken cancellationToken = default) => Task.FromResult(Profile);

        public Task UpdatePasswordAsync(string userId, string newHash, CancellationToken cancellationToken = default)
        {
            LastUpdatedPasswordHash = newHash;
            return Task.CompletedTask;
        }

        public Task<AuthUserRow?> FindUserByIdWithRoleAsync(string userId, CancellationToken cancellationToken = default)
        {
            LastFindUserByIdCalledFor = userId;
            return Task.FromResult(UserById);
        }

        public Task<ChangeEmailResult> ChangeEmailAsync(string userId, string newEmail, CancellationToken cancellationToken = default)
        {
            LastChangeEmailNewEmail = newEmail;
            return Task.FromResult(ChangeEmailResult);
        }

        public Task<ChangeRoleResult?> ChangeRoleAsync(string userId, string roleId, CancellationToken cancellationToken = default)
        {
            ChangeRoleWasCalled = true;
            return Task.FromResult(ChangeRoleResult);
        }

        public Task<SchoolInviteRow?> FindSchoolByInvitationTokenAsync(string token, CancellationToken cancellationToken = default) =>
            Task.FromResult(SchoolInvite);

        public Task<string> EnsureSchoolAdminRoleAsync(CancellationToken cancellationToken = default)
        {
            EnsureSchoolAdminRoleWasCalled = true;
            return Task.FromResult(EnsureSchoolAdminRoleId);
        }

        public Task<AuthUserRow> UpsertSchoolAdminUserAsync(
            string schoolId, string email, string name, string passwordHash, string roleId, string roleName,
            CancellationToken cancellationToken = default)
        {
            LastUpsertSchoolAdminEmail = email;
            return Task.FromResult(UpsertedSchoolAdminUser ?? new AuthUserRow("new-user", name, email, passwordHash, roleId, roleName, schoolId, true));
        }

        public Task ActivateSchoolAsync(string schoolId, CancellationToken cancellationToken = default)
        {
            ActivateSchoolWasCalledFor = schoolId;
            return Task.CompletedTask;
        }

        public async Task InvalidatePriorResetTokensAsync(string userId, CancellationToken cancellationToken = default)
        {
            if (ForgotPasswordGate is not null) await ForgotPasswordGate.Task;
            InvalidatePriorResetTokensWasCalled = true;
        }

        public Task CreatePasswordResetTokenAsync(string userId, string sha256Hex, TimeSpan lifetime, CancellationToken cancellationToken = default)
        {
            CreatePasswordResetTokenWasCalled = true;
            return Task.CompletedTask;
        }

        public Task<ResetTokenRow?> FindResetTokenAsync(string sha256Hex, CancellationToken cancellationToken = default)
        {
            FindResetTokenWasCalled = true;
            return Task.FromResult(ResetToken);
        }

        public Task ApplyPasswordResetAsync(string resetTokenId, string userId, string newHash, string clientIp, CancellationToken cancellationToken = default)
        {
            ApplyPasswordResetWasCalled = true;
            LastApplyResetTokenId = resetTokenId;
            LastApplyUserId = userId;
            LastApplyClientIp = clientIp;
            return Task.CompletedTask;
        }
    }
}
