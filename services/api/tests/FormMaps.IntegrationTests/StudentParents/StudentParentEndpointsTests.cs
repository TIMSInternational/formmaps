using System.Net;
using System.Text;
using System.Text.Json;
using FormMaps.Api.Auth;
using FormMaps.Application.Auth;
using FormMaps.Application.StudentParents;
using FormMaps.Domain.Auth;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;

namespace FormMaps.IntegrationTests.StudentParents;

/// <summary>
/// Guard + invite-body-resolution + result mapping for the student parent-links CRUD (FM-DOTNET-076; repo faked).
/// Pins: anonymous → 401; GET rows; POST invite parentEmail required (falsy → 400) / non-string → 500 / defaults /
/// Duplicate → 500 / 201 + invitationUrl; DELETE 404 "Link not found" / 200; POST resend 404 / 200 + invitationUrl.
/// </summary>
public class StudentParentEndpointsTests
{
    private const string ListPath = "/api/v1/student/parents";
    private const string InvitePath = "/api/v1/student/parents/invite";
    private const string ItemPath = "/api/v1/student/parents/link1";
    private const string ResendPath = "/api/v1/student/parents/link1/resend";

    [Theory]
    [InlineData(ListPath, "GET")]
    [InlineData(InvitePath, "POST")]
    [InlineData(ItemPath, "DELETE")]
    [InlineData(ResendPath, "POST")]
    public async Task Anonymous_is_401(string path, string method)
    {
        using var factory = new Factory(new FakeRepo());
        using var client = factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await client.SendAsync(new HttpRequestMessage(new HttpMethod(method), path))).StatusCode);
    }

    [Fact]
    public async Task List_returns_rows()
    {
        var repo = new FakeRepo { List = [SampleRow("link1")] };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Get, ListPath);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(1, doc.RootElement.GetProperty("data").GetArrayLength());
    }

    [Fact]
    public async Task Invite_valid_returns_201_with_url_and_defaults()
    {
        var repo = new FakeRepo { Create = new CreateInviteResult(false, "link1", "tok123") };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Post, InvitePath, body: """{"parentEmail":"Mom@Example.COM"}""");
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.Equal("mom@example.com", repo.LastEmail);   // lowercased
        Assert.Equal("", repo.LastName);                    // || ""
        Assert.Equal("parent", repo.LastRelation);          // || "parent"
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = doc.RootElement.GetProperty("data");
        Assert.Equal("link1", data.GetProperty("id").GetString());
        Assert.EndsWith("/parent/onboarding?token=tok123", data.GetProperty("invitationUrl").GetString());
    }

    [Theory]
    [InlineData("""{}""")]                       // parentEmail absent
    [InlineData("""{"parentEmail":""}""")]       // empty string (falsy)
    [InlineData("""{"parentEmail":null}""")]     // null (falsy)
    [InlineData("[]")]                            // array → no keys → absent
    public async Task Invite_missing_email_is_400(string body)
    {
        using var factory = new Factory(new FakeRepo());
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Post, InvitePath, body: body);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("parentEmail required", doc.RootElement.GetProperty("message").GetString());
    }

    [Theory]
    [InlineData("""{"parentEmail":5}""")]                                  // non-string → toLowerCase throws
    [InlineData("""{"parentEmail":"a@b.com","parentName":5}""")]           // non-string name → Prisma String
    [InlineData("""{"parentEmail":"a@b.com","relation":true}""")]          // non-string relation
    public async Task Invite_non_string_field_is_500(string body)
    {
        using var factory = new Factory(new FakeRepo());
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Post, InvitePath, body: body);
        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
    }

    [Fact]
    public async Task Invite_duplicate_is_500()
    {
        var repo = new FakeRepo { Create = new CreateInviteResult(true, null, null) };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Post, InvitePath, body: """{"parentEmail":"a@b.com"}""");
        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
    }

    [Theory]
    [InlineData("5")]
    [InlineData("{\"a\":")]
    public async Task Invite_malformed_or_primitive_is_500(string body)
    {
        using var factory = new Factory(new FakeRepo());
        using var client = factory.CreateClient();
        Assert.Equal(HttpStatusCode.InternalServerError, (await Send(client, HttpMethod.Post, InvitePath, body: body)).StatusCode);
    }

    [Fact]
    public async Task Delete_not_found_is_404()
    {
        var repo = new FakeRepo { Delete = false };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Delete, ItemPath);
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Link not found", doc.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task Delete_ok_is_200()
    {
        var repo = new FakeRepo { Delete = true };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();
        Assert.Equal(HttpStatusCode.OK, (await Send(client, HttpMethod.Delete, ItemPath)).StatusCode);
    }

    [Fact]
    public async Task Resend_not_found_is_404()
    {
        var repo = new FakeRepo { Resend = null };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Post, ResendPath);
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Resend_ok_returns_url()
    {
        var repo = new FakeRepo { Resend = "newtok" };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Post, ResendPath);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.EndsWith("/parent/onboarding?token=newtok", doc.RootElement.GetProperty("data").GetProperty("invitationUrl").GetString());
    }

    // ---- helpers ----

    private static ParentLinkRow SampleRow(string id) => new(
        id, "student-1", "mom@x.com", "Mom", null, "parent", "tok", "2026-08-01T00:00:00.000Z", false, null,
        "student-1", true, null, "2026-01-01T00:00:00.000Z", null, "2026-01-01T00:00:00.000Z");

    private static Task<HttpResponseMessage> Send(HttpClient client, HttpMethod method, string path, string? body = null)
    {
        var request = new HttpRequestMessage(method, path);
        request.Headers.Add(DevelopmentRequestContextFactory.UserIdHeader, "student-1");
        request.Headers.Add(DevelopmentRequestContextFactory.RoleHeader, FormMapsRoles.Student);
        request.Headers.Add(DevelopmentRequestContextFactory.EmailHeader, "s@example.test");
        request.Headers.Add(DevelopmentRequestContextFactory.NameHeader, "Student");
        request.Headers.Add(DevelopmentRequestContextFactory.PermissionsHeader, "");
        if (body is not null)
        {
            request.Content = new StringContent(body, Encoding.UTF8, "application/json");
        }

        return client.SendAsync(request);
    }

    private sealed class Factory(FakeRepo repo) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(Environments.Development);
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<IStudentParentRepository>();
                services.AddSingleton<IStudentParentRepository>(repo);
            });
        }
    }

    private sealed class FakeRepo : IStudentParentRepository
    {
        public IReadOnlyList<ParentLinkRow> List { get; init; } = [];
        public CreateInviteResult Create { get; init; } = new(false, "link1", "tok");
        public bool Delete { get; init; } = true;
        public string? Resend { get; init; } = "tok";

        public string? LastEmail { get; private set; }
        public string? LastName { get; private set; }
        public string? LastRelation { get; private set; }

        public Task<IReadOnlyList<ParentLinkRow>> ListAsync(RequestContext context, string studentId, CancellationToken ct = default) =>
            Task.FromResult(List);

        public Task<CreateInviteResult> CreateInviteAsync(RequestContext context, string studentId, string parentEmail, string parentName, string relation, CancellationToken ct = default)
        {
            LastEmail = parentEmail;
            LastName = parentName;
            LastRelation = relation;
            return Task.FromResult(Create);
        }

        public Task<bool> DeleteLinkAsync(RequestContext context, string studentId, string parentLinkId, CancellationToken ct = default) =>
            Task.FromResult(Delete);

        public Task<string?> ResendAsync(RequestContext context, string studentId, string parentLinkId, CancellationToken ct = default) =>
            Task.FromResult(Resend);
    }
}
