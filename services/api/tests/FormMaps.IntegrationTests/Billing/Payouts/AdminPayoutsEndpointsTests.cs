using System.Net;
using System.Text;
using System.Text.Json;
using FormMaps.Api.Auth;
using FormMaps.Application.Auth;
using FormMaps.Application.Billing.Payouts;
using FormMaps.Domain.Auth;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;

namespace FormMaps.IntegrationTests.Billing.Payouts;

/// <summary>
/// Audit D3 — HTTP surface of the payout twin (repository faked; its DB behaviour is CoachPayoutRepositoryTests):
/// Super Admin only, month validation, MONTH_NOT_ENDED before any write, the Node response shapes, and the
/// Mark-as-paid body rules.
/// </summary>
public sealed class AdminPayoutsEndpointsTests
{
    [Theory]
    [InlineData(FormMapsRoles.Coach)]
    [InlineData(FormMapsRoles.SchoolAdmin)]
    public async Task Only_a_super_admin_reaches_the_routes(string role)
    {
        var repository = new FakeRepository();
        using var factory = new Factory(repository);
        using var client = factory.CreateClient();

        var monthly = await Send(client, HttpMethod.Get, "/api/v1/admin/payouts/monthly?month=2026-09", null, role);
        var generate = await Send(client, HttpMethod.Post, "/api/v1/admin/payouts/generate", new { month = "2026-09" }, role);
        var approve = await Send(client, HttpMethod.Post, "/api/v1/admin/payouts/p1/approve", new { }, role);

        Assert.All([monthly, generate, approve], r => Assert.Equal(HttpStatusCode.Forbidden, r.StatusCode));
        Assert.Equal(0, repository.Calls);
    }

    [Fact]
    public async Task Anonymous_is_401()
    {
        using var factory = new Factory(new FakeRepository());
        using var client = factory.CreateClient();
        var response = await client.GetAsync("/api/v1/admin/payouts/monthly?month=2026-09");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Theory]
    [InlineData("/api/v1/admin/payouts/monthly?month=2026-9")]
    [InlineData("/api/v1/admin/payouts/monthly")]
    public async Task Monthly_refuses_a_malformed_month(string path)
    {
        var repository = new FakeRepository();
        using var factory = new Factory(repository);
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Get, path, null);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("month must be YYYY-MM", (await Json(response)).GetProperty("message").GetString());
        Assert.Equal(0, repository.Calls);
    }

    [Fact]
    public async Task Monthly_returns_the_node_shape()
    {
        using var factory = new Factory(new FakeRepository());
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Get, "/api/v1/admin/payouts/monthly?month=2026-09", null);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var data = (await Json(response)).GetProperty("data");
        Assert.Equal("2026-09", data.GetProperty("month").GetString());
        var row = data.GetProperty("rows")[0];
        Assert.Equal(8000, row.GetProperty("netCents").GetInt64());
        Assert.Equal("pending", row.GetProperty("payout").GetProperty("status").GetString());
        Assert.Equal(JsonValueKind.Null, row.GetProperty("payout").GetProperty("paidAt").ValueKind);
        Assert.Equal(10000, data.GetProperty("totals").GetProperty("grossCents").GetInt64());
    }

    [Fact]
    public async Task Generate_refuses_a_bad_or_unfinished_month_before_touching_the_database()
    {
        var repository = new FakeRepository();
        using var factory = new Factory(repository);
        using var client = factory.CreateClient();

        var bad = await Send(client, HttpMethod.Post, "/api/v1/admin/payouts/generate", new { month = "Sept" });
        var future = await Send(client, HttpMethod.Post, "/api/v1/admin/payouts/generate", new { month = "2099-01" });

        Assert.Equal(HttpStatusCode.BadRequest, bad.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, future.StatusCode);
        Assert.Equal("MONTH_NOT_ENDED", (await Json(future)).GetProperty("code").GetString());
        Assert.Equal(0, repository.Calls);
    }

    [Fact]
    public async Task Generate_passes_the_actor_and_returns_the_counts()
    {
        var repository = new FakeRepository();
        using var factory = new Factory(repository);
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Post, "/api/v1/admin/payouts/generate", new { month = "2026-09" });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var data = (await Json(response)).GetProperty("data");
        Assert.Equal(2, data.GetProperty("created").GetInt32());
        Assert.Equal("2026-09", data.GetProperty("payouts").GetProperty("month").GetString());
        Assert.Equal(("root-1", "root@example.test"), (repository.LastActor!.UserId, repository.LastActor.Email));
    }

    [Fact]
    public async Task Mark_paid_validates_the_body_and_maps_not_pending_to_400()
    {
        var repository = new FakeRepository();
        using var factory = new Factory(repository);
        using var client = factory.CreateClient();

        var future = await Send(client, HttpMethod.Post, "/api/v1/admin/payouts/p1/approve", new { paidAt = "2099-01-01" });
        var notText = await Send(client, HttpMethod.Post, "/api/v1/admin/payouts/p1/approve", new { reference = 5 });
        Assert.Equal("paidAt cannot be in the future", (await Json(future)).GetProperty("message").GetString());
        Assert.Equal("reference must be text", (await Json(notText)).GetProperty("message").GetString());
        Assert.Equal(0, repository.Calls);

        var ok = await Send(client, HttpMethod.Post, "/api/v1/admin/payouts/p1/approve", new { paidAt = "2026-10-05", reference = " TRF-1 " });
        Assert.Equal(HttpStatusCode.OK, ok.StatusCode);
        Assert.Equal(("p1", new DateTime(2026, 10, 5, 12, 0, 0, DateTimeKind.Utc), "TRF-1"), (repository.LastPayoutId, repository.LastPaidAt, repository.LastReference));
        Assert.Equal("completed", (await Json(ok)).GetProperty("data").GetProperty("status").GetString());

        repository.NextMarkPaid = MarkPaidStatus.NotPending;
        var again = await Send(client, HttpMethod.Post, "/api/v1/admin/payouts/p1/approve", null);
        Assert.Equal(HttpStatusCode.BadRequest, again.StatusCode);
        Assert.Equal("Payout not found or not pending", (await Json(again)).GetProperty("message").GetString());
    }

    private static async Task<JsonElement> Json(HttpResponseMessage response) =>
        JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement.Clone();

    private static Task<HttpResponseMessage> Send(HttpClient client, HttpMethod method, string path, object? body, string role = FormMapsRoles.SuperAdmin)
    {
        var request = new HttpRequestMessage(method, path);
        if (body is not null) request.Content = new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json");
        request.Headers.Add(DevelopmentRequestContextFactory.UserIdHeader, "root-1");
        request.Headers.Add(DevelopmentRequestContextFactory.RoleHeader, role);
        request.Headers.Add(DevelopmentRequestContextFactory.EmailHeader, "root@example.test");
        request.Headers.Add(DevelopmentRequestContextFactory.NameHeader, "Root");
        request.Headers.Add(DevelopmentRequestContextFactory.PermissionsHeader, "admin:dashboard");
        return client.SendAsync(request);
    }

    private sealed class Factory(FakeRepository repository) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(Environments.Development);
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<ICoachPayoutRepository>();
                services.AddSingleton<ICoachPayoutRepository>(repository);
            });
        }
    }

    private sealed class FakeRepository : ICoachPayoutRepository
    {
        public int Calls { get; private set; }
        public PayoutAuditActor? LastActor { get; private set; }
        public string? LastPayoutId { get; private set; }
        public DateTime LastPaidAt { get; private set; }
        public string? LastReference { get; private set; }
        public MarkPaidStatus NextMarkPaid { get; set; } = MarkPaidStatus.Paid;

        private static MonthlyPayouts View(PayoutMonth month) =>
            MonthlyPayoutAssembler.Summarize(month,
            [
                new MonthlyPayoutRow("c-ana", "Ana", "ana@x", "USD", 2, 10000, 20m, 2000, 8000,
                    new PayoutView("p1", "pending", 10000, 2000, 8000, new DateTime(2026, 10, 2, 0, 0, 0, DateTimeKind.Utc), null, null), 0),
            ], new DateTime(2026, 10, 10, 0, 0, 0, DateTimeKind.Utc));

        public Task<MonthlyPayouts> GetMonthlyAsync(RequestContext context, PayoutMonth month, DateTime nowUtc, CancellationToken cancellationToken = default)
        {
            Calls++;
            return Task.FromResult(View(month));
        }

        public Task<GenerateOutcome> GenerateAsync(RequestContext context, PayoutMonth month, PayoutAuditActor actor, DateTime nowUtc, CancellationToken cancellationToken = default)
        {
            Calls++;
            LastActor = actor;
            return Task.FromResult(new GenerateOutcome(2, 0, 0, 0, View(month)));
        }

        public Task<MarkPaidOutcome> MarkPaidAsync(RequestContext context, string payoutId, DateTime paidAt, string? reference, PayoutAuditActor actor, CancellationToken cancellationToken = default)
        {
            Calls++;
            (LastPayoutId, LastPaidAt, LastReference) = (payoutId, paidAt, reference);
            return Task.FromResult(new MarkPaidOutcome(NextMarkPaid));
        }
    }
}
