using System.Net;
using System.Text;
using System.Text.Json;
using FormMaps.Api.Auth;
using FormMaps.Application.Auth;
using FormMaps.Application.Email;
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
/// Pins: anonymous → 401; GET rows (no invitationToken); POST invite parentEmail required (falsy → 400) / non-string →
/// 500 / defaults; DELETE 404 "Link not found" / 200; POST resend 404. audit 2026-10-09 C8b: invite/resend EMAIL the
/// link to the parent and answer { id, emailSent } / { emailSent } with no URL or token; C8: Attached → linked notice
/// + alreadyLinked, AlreadyLinked → no email, SelfLink → 400. The email sender + language resolver are faked.
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
        var raw = await response.Content.ReadAsStringAsync();
        using var doc = JsonDocument.Parse(raw);
        Assert.Equal(1, doc.RootElement.GetProperty("data").GetArrayLength());
        Assert.False(doc.RootElement.GetProperty("data")[0].TryGetProperty("invitationToken", out _));
        Assert.DoesNotContain("SECRET-TOKEN", raw);
    }

    [Fact]
    public async Task Invite_emails_the_parent_and_returns_id_and_emailSent_only()
    {
        var repo = new FakeRepo { Invite = Outcome(ParentInviteKind.Invited, token: "tok123") };
        var mail = new FakeMail();
        using var factory = new Factory(repo, mail);
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Post, InvitePath, body: """{"parentEmail":" Mom@Example.COM "}""");
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.Equal("mom@example.com", repo.LastEmail);   // trimmed + lowercased
        Assert.Equal("", repo.LastName);                    // || ""
        Assert.Equal("", repo.LastRelation);                // not supplied → repo defaults/keeps
        var raw = await response.Content.ReadAsStringAsync();
        Assert.DoesNotContain("tok123", raw);
        Assert.DoesNotContain("invitationUrl", raw);
        using var doc = JsonDocument.Parse(raw);
        var data = doc.RootElement.GetProperty("data");
        Assert.Equal("link1", data.GetProperty("id").GetString());
        Assert.True(data.GetProperty("emailSent").GetBoolean());
        Assert.Equal(2, data.EnumerateObject().Count());

        var sent = Assert.Single(mail.Sent);
        Assert.Equal("mom@example.com", sent.To);
        Assert.Contains("/parent/onboarding?token=tok123", sent.Html);
        Assert.Equal("FormMaps — Parent Portal Access for Kid", sent.Subject); // inviter (student) language = en
        Assert.Equal("student-1", mail.LanguageAskedFor);
    }

    [Fact]
    public async Task Invite_reports_emailSent_false_when_the_mailer_fails()
    {
        var repo = new FakeRepo { Invite = Outcome(ParentInviteKind.Invited, token: "tok123") };
        using var factory = new Factory(repo, new FakeMail { Succeeds = false });
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Post, InvitePath, body: """{"parentEmail":"a@b.com"}""");
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.False(doc.RootElement.GetProperty("data").GetProperty("emailSent").GetBoolean());
    }

    [Fact]
    public async Task Invite_attached_sends_the_linked_notice_in_the_parents_language()
    {
        var repo = new FakeRepo { Invite = Outcome(ParentInviteKind.Attached, parentUserId: "parent-user-1") };
        var mail = new FakeMail();
        using var factory = new Factory(repo, mail);
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Post, InvitePath, body: """{"parentEmail":"mom@example.com"}""");
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = doc.RootElement.GetProperty("data");
        Assert.True(data.GetProperty("alreadyLinked").GetBoolean());
        Assert.True(data.GetProperty("emailSent").GetBoolean());
        var sent = Assert.Single(mail.Sent);
        Assert.Equal("FormMaps — You've been linked to Kid", sent.Subject);
        Assert.DoesNotContain("onboarding", sent.Html);
        Assert.Equal("parent-user-1", mail.LanguageAskedFor);
    }

    [Fact]
    public async Task Invite_already_linked_sends_nothing()
    {
        var repo = new FakeRepo { Invite = Outcome(ParentInviteKind.AlreadyLinked) };
        var mail = new FakeMail();
        using var factory = new Factory(repo, mail);
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Post, InvitePath, body: """{"parentEmail":"mom@example.com"}""");
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.False(doc.RootElement.GetProperty("data").GetProperty("emailSent").GetBoolean());
        Assert.True(doc.RootElement.GetProperty("data").GetProperty("alreadyLinked").GetBoolean());
        Assert.Empty(mail.Sent);
    }

    [Fact]
    public async Task Invite_self_link_is_400_and_sends_nothing()
    {
        var repo = new FakeRepo { Invite = Outcome(ParentInviteKind.SelfLink) };
        var mail = new FakeMail();
        using var factory = new Factory(repo, mail);
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Post, InvitePath, body: """{"parentEmail":"s@example.test"}""");
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("SELF_LINK", doc.RootElement.GetProperty("code").GetString());
        Assert.Empty(mail.Sent);
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
        var repo = new FakeRepo { Resend = ParentResendOutcome.NotFound };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Post, ResendPath);
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Resend_emails_a_fresh_link_and_returns_emailSent_only()
    {
        var repo = new FakeRepo
        {
            Resend = new ParentResendOutcome(ParentResendKind.Reissued, "newtok", "mom@x.com", "Mom", "Kid", null, "inviter-1"),
        };
        var mail = new FakeMail();
        using var factory = new Factory(repo, mail);
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Post, ResendPath);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var raw = await response.Content.ReadAsStringAsync();
        Assert.DoesNotContain("newtok", raw);
        using var doc = JsonDocument.Parse(raw);
        Assert.True(doc.RootElement.GetProperty("data").GetProperty("emailSent").GetBoolean());
        var sent = Assert.Single(mail.Sent);
        Assert.Equal("mom@x.com", sent.To);
        Assert.Contains("/parent/onboarding?token=newtok", sent.Html);
        Assert.Equal("inviter-1", mail.LanguageAskedFor); // the original inviter's language
    }

    [Fact]
    public async Task Resend_attached_sends_the_linked_notice()
    {
        var repo = new FakeRepo
        {
            Resend = new ParentResendOutcome(ParentResendKind.Attached, null, "mom@x.com", "Mom", "Kid", "parent-user-1", "student-1"),
        };
        var mail = new FakeMail();
        using var factory = new Factory(repo, mail);
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Post, ResendPath);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.True(doc.RootElement.GetProperty("data").GetProperty("alreadyLinked").GetBoolean());
        Assert.Equal("FormMaps — You've been linked to Kid", Assert.Single(mail.Sent).Subject);
    }

    // ---- helpers ----

    private static ParentLinkRow SampleRow(string id) => new(
        id, "student-1", "mom@x.com", "Mom", null, "parent", "SECRET-TOKEN", "2026-08-01T00:00:00.000Z", false, null,
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

    private static ParentInviteOutcome Outcome(ParentInviteKind kind, string? token = null, string? parentUserId = null) =>
        new(kind, kind == ParentInviteKind.SelfLink ? null : "link1", token, parentUserId, "Mom", "Kid");

    private sealed class Factory(FakeRepo repo, FakeMail? mail = null) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            var fake = mail ?? new FakeMail();
            builder.UseEnvironment(Environments.Development);
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<IStudentParentRepository>();
                services.AddSingleton<IStudentParentRepository>(repo);
                services.RemoveAll<IEmailSender>();
                services.AddSingleton<IEmailSender>(fake);
                services.RemoveAll<IEmailLanguageResolver>();
                services.AddSingleton<IEmailLanguageResolver>(fake);
            });
        }
    }

    /// <summary>Records sends (never touches SES) and answers "en" for every language lookup.</summary>
    private sealed class FakeMail : IEmailSender, IEmailLanguageResolver
    {
        public bool Succeeds { get; init; } = true;

        public List<(string To, string Subject, string Html)> Sent { get; } = [];

        public string? LanguageAskedFor { get; private set; }

        public Task<bool> SendAsync(string to, string subject, string html, CancellationToken cancellationToken = default)
        {
            Sent.Add((to, subject, html));
            return Task.FromResult(Succeeds);
        }

        public Task<string> ForUserAsync(string? userId, CancellationToken cancellationToken = default)
        {
            LanguageAskedFor = userId;
            return Task.FromResult(EmailLanguage.English);
        }

        public Task<IReadOnlyDictionary<string, string>> ForUsersAsync(
            IReadOnlyCollection<string> userIds, CancellationToken cancellationToken = default) =>
            Task.FromResult<IReadOnlyDictionary<string, string>>(userIds.ToDictionary(id => id, _ => EmailLanguage.English));
    }

    private sealed class FakeRepo : IStudentParentRepository
    {
        public IReadOnlyList<ParentLinkRow> List { get; init; } = [];
        public ParentInviteOutcome Invite { get; init; } = new(ParentInviteKind.Invited, "link1", "tok", null, "", "Kid");
        public bool Delete { get; init; } = true;
        public ParentResendOutcome Resend { get; init; } = ParentResendOutcome.NotFound;

        public string? LastEmail { get; private set; }
        public string? LastName { get; private set; }
        public string? LastRelation { get; private set; }

        public Task<IReadOnlyList<ParentLinkRow>> ListAsync(RequestContext context, string studentId, CancellationToken ct = default) =>
            Task.FromResult(List);

        public Task<ParentInviteOutcome> InviteOrAttachAsync(RequestContext context, string studentId, string parentEmail, string parentName, string relation, CancellationToken ct = default)
        {
            LastEmail = parentEmail;
            LastName = parentName;
            LastRelation = relation;
            return Task.FromResult(Invite);
        }

        public Task<bool> DeleteLinkAsync(RequestContext context, string studentId, string parentLinkId, CancellationToken ct = default) =>
            Task.FromResult(Delete);

        public Task<ParentResendOutcome> ResendAsync(RequestContext context, string studentId, string parentLinkId, CancellationToken ct = default) =>
            Task.FromResult(Resend);
    }
}
