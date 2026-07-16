using System.Net;
using System.Text.Json;
using FormMaps.Api.Auth;
using FormMaps.Application.Auth;
using FormMaps.Application.Reports;
using FormMaps.Domain.Auth;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;

namespace FormMaps.IntegrationTests.Reports;

public class CoachingReportEndpointsTests
{
    private const string CallerUserId = "user-123";

    [Fact]
    public async Task CoachingReport_denies_anonymous_requests()
    {
        var reader = new FakeCoachingReportReader();
        var guard = new FakeUserAccessGuard(allow: true);
        using var factory = new CoachingReportApiFactory(reader, guard);
        using var client = factory.CreateClient();

        var response = await client.GetAsync($"/api/v1/reports/coaching/{CallerUserId}");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal(0, guard.CallCount);
        Assert.Equal(0, reader.CallCount);
    }

    [Fact]
    public async Task CoachingReport_returns_report_for_self_access()
    {
        var reader = new FakeCoachingReportReader();
        var guard = new FakeUserAccessGuard(allow: true);
        using var factory = new CoachingReportApiFactory(reader, guard);
        using var client = factory.CreateClient();
        using var request = BuildAuthenticatedRequest(
            targetUserId: CallerUserId,
            role: FormMapsRoles.Student,
            schoolId: null);

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(1, guard.CallCount);
        Assert.Equal(CallerUserId, guard.LastTargetUserId);
        Assert.Equal(1, reader.CallCount);
        Assert.Equal(CallerUserId, reader.LastTargetUserId);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var root = document.RootElement;
        Assert.True(root.GetProperty("success").GetBoolean());

        var data = root.GetProperty("data");
        Assert.Equal("student-1", data.GetProperty("studentId").GetString());
        Assert.Equal("Ada Student", data.GetProperty("studentName").GetString());
        Assert.Equal(2, data.GetProperty("totalSessions").GetInt32());
        Assert.Equal(1, data.GetProperty("completedSessions").GetInt32());
        Assert.Equal(15000, data.GetProperty("totalSpent").GetInt64());
        Assert.Equal("USD", data.GetProperty("currency").GetString());
        Assert.Equal(3, data.GetProperty("reviewsGiven").GetInt32());

        var sessions = data.GetProperty("sessions");
        Assert.Equal(2, sessions.GetArrayLength());

        var first = sessions[0];
        Assert.Equal("booking-1", first.GetProperty("id").GetString());
        Assert.Equal("Coach Carol", first.GetProperty("coachName").GetString());
        Assert.Equal("Career", first.GetProperty("coachSpecialization").GetString());
        Assert.Equal("completed", first.GetProperty("status").GetString());
        Assert.Equal(15000, first.GetProperty("amount").GetInt64());

        // Second session has a null amount (must serialize as JSON null, key present).
        var second = sessions[1];
        Assert.Equal(JsonValueKind.Null, second.GetProperty("amount").ValueKind);

        // Parity-critical: sensitive booking + coach fields must NEVER appear.
        foreach (var session in sessions.EnumerateArray())
        {
            Assert.False(session.TryGetProperty("paymentIntentId", out _));
            Assert.False(session.TryGetProperty("coachNotes", out _));
            Assert.False(session.TryGetProperty("notes", out _));
            Assert.False(session.TryGetProperty("meetingLink", out _));
            Assert.False(session.TryGetProperty("cancellationReason", out _));
            Assert.False(session.TryGetProperty("hourlyRate", out _));
            Assert.False(session.TryGetProperty("platformCommission", out _));
            Assert.False(session.TryGetProperty("email", out _));
        }

        Assert.True(data.TryGetProperty("generatedAt", out _));
    }

    [Fact]
    public async Task CoachingReport_returns_not_found_when_non_privileged_reads_other_user()
    {
        var reader = new FakeCoachingReportReader();
        var guard = new FakeUserAccessGuard(allow: false);
        using var factory = new CoachingReportApiFactory(reader, guard);
        using var client = factory.CreateClient();
        using var request = BuildAuthenticatedRequest(
            targetUserId: "other-user",
            role: FormMapsRoles.Student,
            schoolId: null);

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal(1, guard.CallCount);
        Assert.Equal("other-user", guard.LastTargetUserId);
        Assert.Equal(0, reader.CallCount);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.False(document.RootElement.GetProperty("success").GetBoolean());
        Assert.Equal("Not found", document.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task CoachingReport_returns_report_for_privileged_caller_when_access_granted()
    {
        var reader = new FakeCoachingReportReader();
        var guard = new FakeUserAccessGuard(allow: true);
        using var factory = new CoachingReportApiFactory(reader, guard);
        using var client = factory.CreateClient();
        using var request = BuildAuthenticatedRequest(
            targetUserId: "other-user",
            role: FormMapsRoles.Counselor,
            schoolId: "school-123");

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(1, guard.CallCount);
        Assert.Equal(1, reader.CallCount);
        Assert.Equal("other-user", reader.LastTargetUserId);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.True(document.RootElement.GetProperty("success").GetBoolean());
    }

    [Fact]
    public async Task CoachingReport_returns_not_found_when_target_user_missing()
    {
        var reader = new FakeCoachingReportReader { ReturnNull = true };
        var guard = new FakeUserAccessGuard(allow: true);
        using var factory = new CoachingReportApiFactory(reader, guard);
        using var client = factory.CreateClient();
        using var request = BuildAuthenticatedRequest(
            targetUserId: "ghost-user",
            role: FormMapsRoles.SuperAdmin,
            schoolId: null);

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal(1, guard.CallCount);
        Assert.Equal(1, reader.CallCount);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.False(document.RootElement.GetProperty("success").GetBoolean());
        Assert.Equal("Not found", document.RootElement.GetProperty("message").GetString());
    }

    private static HttpRequestMessage BuildAuthenticatedRequest(
        string targetUserId,
        string role,
        string? schoolId)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, $"/api/v1/reports/coaching/{targetUserId}");
        request.Headers.Add(DevelopmentRequestContextFactory.UserIdHeader, CallerUserId);
        request.Headers.Add(DevelopmentRequestContextFactory.RoleHeader, role);
        request.Headers.Add(DevelopmentRequestContextFactory.EmailHeader, "user@example.test");
        request.Headers.Add(DevelopmentRequestContextFactory.NameHeader, "Test User");
        request.Headers.Add(DevelopmentRequestContextFactory.PermissionsHeader, FormMapsPermissions.ProfileRead);

        if (!string.IsNullOrWhiteSpace(schoolId))
        {
            request.Headers.Add(DevelopmentRequestContextFactory.SchoolIdHeader, schoolId);
        }

        return request;
    }

    private sealed class CoachingReportApiFactory(
        FakeCoachingReportReader reader,
        FakeUserAccessGuard guard) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(Environments.Development);
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<ICoachingReportReader>();
                services.AddSingleton<ICoachingReportReader>(reader);
                services.RemoveAll<IUserAccessGuard>();
                services.AddSingleton<IUserAccessGuard>(guard);
            });
        }
    }

    private sealed class FakeUserAccessGuard(bool allow) : IUserAccessGuard
    {
        public int CallCount { get; private set; }

        public RequestContext? LastCaller { get; private set; }

        public string? LastTargetUserId { get; private set; }

        public Task<bool> CanAccessUserAsync(
            RequestContext caller,
            string targetUserId,
            CancellationToken cancellationToken = default)
        {
            CallCount++;
            LastCaller = caller;
            LastTargetUserId = targetUserId;
            return Task.FromResult(allow);
        }
    }

    private sealed class FakeCoachingReportReader : ICoachingReportReader
    {
        public int CallCount { get; private set; }

        public RequestContext? LastContext { get; private set; }

        public string? LastTargetUserId { get; private set; }

        public bool ReturnNull { get; init; }

        public Task<CoachingReport?> ReadAsync(
            RequestContext requestContext,
            string targetUserId,
            CancellationToken cancellationToken = default)
        {
            CallCount++;
            LastContext = requestContext;
            LastTargetUserId = targetUserId;

            if (ReturnNull)
            {
                return Task.FromResult<CoachingReport?>(null);
            }

            var sessions = new List<CoachingSession>
            {
                new(
                    Id: "booking-1",
                    CoachName: "Coach Carol",
                    CoachSpecialization: "Career",
                    Date: new DateTimeOffset(2026, 6, 2, 0, 0, 0, TimeSpan.Zero),
                    Status: "completed",
                    Amount: 15000),
                new(
                    Id: "booking-2",
                    CoachName: "Coach Dan",
                    CoachSpecialization: "Study Skills",
                    Date: new DateTimeOffset(2026, 6, 1, 0, 0, 0, TimeSpan.Zero),
                    Status: "pending",
                    Amount: null),
            };

            var report = new CoachingReport(
                StudentId: "student-1",
                StudentName: "Ada Student",
                TotalSessions: 2,
                CompletedSessions: 1,
                TotalSpent: 15000,
                Currency: "USD",
                ReviewsGiven: 3,
                Sessions: sessions,
                GeneratedAt: new DateTimeOffset(2026, 7, 15, 12, 0, 0, TimeSpan.Zero));

            return Task.FromResult<CoachingReport?>(report);
        }
    }
}
