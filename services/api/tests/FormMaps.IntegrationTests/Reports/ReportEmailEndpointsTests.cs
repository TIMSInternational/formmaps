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
