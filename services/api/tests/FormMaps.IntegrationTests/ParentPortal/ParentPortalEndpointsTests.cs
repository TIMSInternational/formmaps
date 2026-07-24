using System.Net;
using System.Text.Json;
using FormMaps.Api.Auth;
using FormMaps.Application.Auth;
using FormMaps.Application.ParentPortal;
using FormMaps.Domain.Auth;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;

namespace FormMaps.IntegrationTests.ParentPortal;

/// <summary>
/// Guard + pagination + result mapping for the parent portal self-scoped surface (FM-DOTNET-078; repo faked). Pins:
/// anonymous → 401 on every route; profile `{...user, children}` shape (+ absent-user → just children); notifications
/// page/limit clamp (Math.max(1,·)/Math.min(50,·), parseInt JS falsiness) + unreadOnly=="true" + {data:{data,total,
/// page,limit}}; mark-read 403 "Access denied" on false / {success} on true; read-all {updatedCount}; pending shape;
/// delete-link 403 on false / {success} on true.
/// </summary>
public class ParentPortalEndpointsTests
{
    private const string Profile = "/api/v1/parent/profile";
    private const string Notifications = "/api/v1/parent/notifications";
    private const string ReadAll = "/api/v1/parent/notifications/read-all";
    private const string MarkRead = "/api/v1/parent/notifications/n1/read";
    private const string Pending = "/api/v1/parent/evaluations/pending";
    private const string DeleteLink = "/api/v1/parent/link1";

    [Theory]
    [InlineData(Profile, "GET")]
    [InlineData(Notifications, "GET")]
    [InlineData(ReadAll, "PUT")]
    [InlineData(MarkRead, "PUT")]
    [InlineData(Pending, "GET")]
    [InlineData(DeleteLink, "DELETE")]
    public async Task Anonymous_is_401(string path, string method)
    {
        using var factory = new Factory(new FakeRepo());
        using var client = factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await client.SendAsync(new HttpRequestMessage(new HttpMethod(method), path))).StatusCode);
    }

    // ---- profile ----

    [Fact]
    public async Task Profile_spreads_user_and_children()
    {
        var repo = new FakeRepo
        {
            Profile = new ParentProfile(true, "p1", "Parent", "p@e.st",
                [new ParentChild("s1", "Kid", 10, "mother")]),
        };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Get, Profile);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = doc.RootElement.GetProperty("data");
        Assert.Equal("p1", data.GetProperty("id").GetString());
        Assert.Equal("p@e.st", data.GetProperty("email").GetString());
        var child = data.GetProperty("children")[0];
        Assert.Equal("s1", child.GetProperty("studentId").GetString());
        Assert.Equal("Kid", child.GetProperty("studentName").GetString());
        Assert.Equal(10, child.GetProperty("gradeLevel").GetInt32());
        Assert.Equal("mother", child.GetProperty("relationship").GetString());
    }

    [Fact]
    public async Task Profile_absent_user_emits_only_children()
    {
        var repo = new FakeRepo { Profile = new ParentProfile(false, null, null, null, []) };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Get, Profile);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = doc.RootElement.GetProperty("data");
        Assert.False(data.TryGetProperty("id", out _));       // ...null contributes no user keys
        Assert.True(data.TryGetProperty("children", out var c));
        Assert.Equal(0, c.GetArrayLength());
    }

    // ---- notifications ----

    [Fact]
    public async Task Notifications_default_paging_and_envelope()
    {
        var repo = new FakeRepo { Notifications = ([SampleNotif("n1")], 7) };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Get, Notifications);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = doc.RootElement.GetProperty("data");
        Assert.Equal(7, data.GetProperty("total").GetInt32());
        Assert.Equal(1, data.GetProperty("page").GetInt32());
        Assert.Equal(20, data.GetProperty("limit").GetInt32());
        Assert.Equal(1, data.GetProperty("data").GetArrayLength());
        Assert.False(repo.LastUnreadOnly);
        Assert.Equal(0, repo.LastSkip);
        Assert.Equal(20, repo.LastTake);
    }

    [Theory]
    [InlineData("?page=3&limit=10", 3, 10, 20)]      // skip=(3-1)*10=20
    [InlineData("?limit=999", 1, 50, 0)]              // Math.min(50, ·)
    [InlineData("?limit=0", 1, 20, 0)]                // 0 || 20 → 20
    [InlineData("?page=abc", 1, 20, 0)]              // parseInt NaN → 1
    [InlineData("?page=0", 1, 20, 0)]                // 0 || 1 → 1
    public async Task Notifications_pagination_clamp(string qs, int page, int limit, long skip)
    {
        var repo = new FakeRepo { Notifications = ([], 0) };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Get, Notifications + qs);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = doc.RootElement.GetProperty("data");
        Assert.Equal(page, data.GetProperty("page").GetInt32());
        Assert.Equal(limit, data.GetProperty("limit").GetInt32());
        Assert.Equal(skip, repo.LastSkip);
        Assert.Equal(limit, repo.LastTake);
    }

    [Theory]
    [InlineData("?unreadOnly=true", true)]
    [InlineData("?unreadOnly=1", false)]   // only the literal "true"
    [InlineData("", false)]
    public async Task Notifications_unreadOnly_only_literal_true(string qs, bool expected)
    {
        var repo = new FakeRepo { Notifications = ([], 0) };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();
        await Send(client, HttpMethod.Get, Notifications + qs);
        Assert.Equal(expected, repo.LastUnreadOnly);
    }

    [Fact]
    public async Task MarkRead_false_is_403_access_denied()
    {
        var repo = new FakeRepo { MarkRead = false };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Put, MarkRead);
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Access denied", doc.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task MarkRead_true_is_success_no_data()
    {
        var repo = new FakeRepo { MarkRead = true };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Put, MarkRead);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.True(doc.RootElement.GetProperty("success").GetBoolean());
        Assert.False(doc.RootElement.TryGetProperty("data", out _));
    }

    [Fact]
    public async Task ReadAll_returns_updated_count()
    {
        var repo = new FakeRepo { ReadAllCount = 4 };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Put, ReadAll);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(4, doc.RootElement.GetProperty("data").GetProperty("updatedCount").GetInt32());
    }

    // ---- pending evaluations ----

    [Fact]
    public async Task Pending_maps_shape()
    {
        var repo = new FakeRepo { Pending = [new PendingEvaluation("e1", "Kid", "2026-05-01T00:00:00.000Z", "tok")] };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Get, Pending);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var e = doc.RootElement.GetProperty("data")[0];
        Assert.Equal("e1", e.GetProperty("evaluationId").GetString());
        Assert.Equal("Kid", e.GetProperty("studentName").GetString());
        Assert.Equal("2026-05-01T00:00:00.000Z", e.GetProperty("deadline").GetString());
        Assert.Equal("tok", e.GetProperty("token").GetString());
    }

    // ---- delete link ----

    [Fact]
    public async Task DeleteLink_false_is_403()
    {
        var repo = new FakeRepo { Delete = false };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Delete, DeleteLink);
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Access denied", doc.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task DeleteLink_true_is_success()
    {
        var repo = new FakeRepo { Delete = true };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();
        Assert.Equal(HttpStatusCode.OK, (await Send(client, HttpMethod.Delete, DeleteLink)).StatusCode);
    }

    // ---- helpers ----

    private static NotificationRow SampleNotif(string id) => new(
        id, "parent-1", "info", "T", "M", false, null, null, null, true, null,
        "2026-01-01T00:00:00.000Z", null, "2026-01-01T00:00:00.000Z");

    private static Task<HttpResponseMessage> Send(HttpClient client, HttpMethod method, string path)
    {
        var request = new HttpRequestMessage(method, path);
        request.Headers.Add(DevelopmentRequestContextFactory.UserIdHeader, "parent-1");
        request.Headers.Add(DevelopmentRequestContextFactory.RoleHeader, "parent");
        request.Headers.Add(DevelopmentRequestContextFactory.EmailHeader, "p@example.test");
        request.Headers.Add(DevelopmentRequestContextFactory.NameHeader, "Parent");
        request.Headers.Add(DevelopmentRequestContextFactory.PermissionsHeader, "");
        return client.SendAsync(request);
    }

    private sealed class Factory(FakeRepo repo) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(Environments.Development);
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<IParentPortalRepository>();
                services.AddSingleton<IParentPortalRepository>(repo);
            });
        }
    }

    private sealed class FakeRepo : IParentPortalRepository
    {
        public ParentProfile Profile { get; init; } = new(true, "parent-1", "Parent", "p@e.st", []);
        public (IReadOnlyList<NotificationRow> Rows, int Total) Notifications { get; init; } = ([], 0);
        public bool MarkRead { get; init; } = true;
        public int ReadAllCount { get; init; }
        public IReadOnlyList<PendingEvaluation> Pending { get; init; } = [];
        public bool Delete { get; init; } = true;

        public bool LastUnreadOnly { get; private set; }
        public long LastSkip { get; private set; }
        public int LastTake { get; private set; }

        public Task<ParentProfile> GetProfileAsync(RequestContext context, string userId, CancellationToken ct = default) =>
            Task.FromResult(Profile);

        public Task<(IReadOnlyList<NotificationRow> Rows, int Total)> ListNotificationsAsync(
            RequestContext context, string userId, bool unreadOnly, long skip, int take, CancellationToken ct = default)
        {
            LastUnreadOnly = unreadOnly;
            LastSkip = skip;
            LastTake = take;
            return Task.FromResult(Notifications);
        }

        public Task<bool> MarkNotificationReadAsync(RequestContext context, string userId, string notificationId, CancellationToken ct = default) =>
            Task.FromResult(MarkRead);

        public Task<int> MarkAllNotificationsReadAsync(RequestContext context, string userId, CancellationToken ct = default) =>
            Task.FromResult(ReadAllCount);

        public Task<IReadOnlyList<PendingEvaluation>> ListPendingEvaluationsAsync(RequestContext context, string userId, CancellationToken ct = default) =>
            Task.FromResult(Pending);

        public Task<bool> DeleteLinkAsync(RequestContext context, string userId, string parentLinkId, CancellationToken ct = default) =>
            Task.FromResult(Delete);
    }
}
