using System.Net;
using System.Text;
using System.Text.Json;
using FormMaps.Api.Auth;
using FormMaps.Application.Auth;
using FormMaps.Application.Counselor;
using FormMaps.Domain.Auth;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;

namespace FormMaps.IntegrationTests.Counselor;

/// <summary>
/// Guard + auth-asymmetry + body-coercion + result mapping for the counselor notes CRUD (FM-DOTNET-072; repo faked).
/// Pins: anonymous → 401; GET/POST/DELETE inline role check (counselor/school_admin/Super Admin, no counselor:notes
/// needed); PUT/complete-followup require counselor:notes; counselor access 404; GET envelope + author{name}/authorName
/// shape + clamps + type forwarding; POST JS-|| defaults + Prisma-type 500s + 201; PUT deferred InvalidBody + field
/// forwarding; NotAuthorized → 403 "Not authorized"; complete-followup subset; malformed body → 500.
/// </summary>
public class CounselorNotesEndpointsTests
{
    private const string NotesPath = "/api/v1/counselor/students/s1/notes";
    private const string NotePath = "/api/v1/counselor/notes/note1";
    private const string CompletePath = "/api/v1/counselor/notes/note1/complete-followup";

    [Theory]
    [InlineData(NotesPath, "GET")]
    [InlineData(NotesPath, "POST")]
    [InlineData(NotePath, "PUT")]
    [InlineData(NotePath, "DELETE")]
    [InlineData(CompletePath, "PUT")]
    public async Task Anonymous_is_401(string path, string method)
    {
        using var factory = new Factory(new FakeRepo());
        using var client = factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await client.SendAsync(new HttpRequestMessage(new HttpMethod(method), path))).StatusCode);
    }

    [Theory]
    [InlineData(NotesPath, "GET")]
    [InlineData(NotesPath, "POST")]
    [InlineData(NotePath, "DELETE")]
    public async Task Inline_role_rejects_non_staff_roles(string path, string method)
    {
        using var factory = new Factory(new FakeRepo());
        using var client = factory.CreateClient();
        var response = await Send(client, new HttpMethod(method), path, role: FormMapsRoles.Student, body: method == "POST" ? "{\"content\":\"x\"}" : null);
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Insufficient permissions", doc.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task Inline_role_endpoints_do_not_require_counselor_notes_permission()
    {
        var repo = new FakeRepo { Access = true, Page = new NotesPage([], 0) };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();
        // counselor role, an UNRELATED permission → still 200 (role-based, not permission-based).
        var response = await Send(client, HttpMethod.Get, NotesPath, permission: FormMapsPermissions.ReportsRead);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Theory]
    [InlineData(NotePath, "PUT")]
    [InlineData(CompletePath, "PUT")]
    public async Task Permission_endpoints_require_counselor_notes(string path, string method)
    {
        using var factory = new Factory(new FakeRepo());
        using var client = factory.CreateClient();
        var response = await Send(client, new HttpMethod(method), path, permission: FormMapsPermissions.ReportsRead, body: "{}");
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    // ---- GET ----

    [Fact]
    public async Task Get_counselor_without_access_is_404()
    {
        var repo = new FakeRepo { Access = false };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Get, NotesPath);
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Not found", doc.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task Get_admin_skips_access_check_and_returns_envelope()
    {
        var repo = new FakeRepo { Access = false, Page = new NotesPage([SampleItem("note1", "Author")], Total: 3) };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();

        // school_admin: NO access check even though Access=false.
        var response = await Send(client, HttpMethod.Get, NotesPath + "?limit=2", role: FormMapsRoles.SchoolAdmin);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = doc.RootElement.GetProperty("data");
        Assert.Equal(3, data.GetProperty("total").GetInt32());
        Assert.Equal(2, data.GetProperty("totalPages").GetInt32()); // ceil(3/2)
        var row = data.GetProperty("data")[0];
        Assert.Equal("note1", row.GetProperty("id").GetString());
        Assert.Equal("Author", row.GetProperty("authorName").GetString());
        Assert.Equal("Author", row.GetProperty("author").GetProperty("name").GetString());
    }

    [Theory]
    [InlineData("?limit=999", 50)]
    [InlineData("?limit=abc", 20)]
    [InlineData("", 20)]
    public async Task Get_limit_is_clamped(string query, int expected)
    {
        var repo = new FakeRepo { Access = true };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();
        await Send(client, HttpMethod.Get, NotesPath + query);
        Assert.Equal(expected, repo.LastLimit);
    }

    [Theory]
    [InlineData("?type=academic", "academic")]
    [InlineData("", null)]
    public async Task Get_type_is_forwarded(string query, string? expected)
    {
        var repo = new FakeRepo { Access = true };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();
        await Send(client, HttpMethod.Get, NotesPath + query);
        Assert.Equal(expected, repo.LastTypeFilter);
    }

    // ---- POST ----

    [Fact]
    public async Task Post_returns_the_author_joined_shape_so_the_client_can_cache_it()
    {
        // formmaps#89 has the client drop this response straight into its React Query cache
        // in place of the optimistic row, instead of invalidating and refetching. That makes
        // the shape load-bearing: any field the LIST endpoint returns and this one omits
        // blanks out on the just-created note until something else forces a refetch.
        //
        // `authorName` is the field that actually differed. Node gained the same join in
        // formmaps#89; this keeps the .NET port at parity, so flipping
        // FORMMAPS_ROUTE_COUNSELOR_NOTES_TO_DOTNET cannot reintroduce the gap.
        var repo = new FakeRepo { Access = true };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Post, NotesPath, body: """{"content":"hi"}""");
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);

        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var row = doc.RootElement.GetProperty("data");
        Assert.Equal("Author", row.GetProperty("authorName").GetString());
        Assert.Equal("Author", row.GetProperty("author").GetProperty("name").GetString());
        // createdDate, not createdAt — the client renders the note's date from it.
        Assert.True(row.TryGetProperty("createdDate", out _));
        Assert.False(row.TryGetProperty("createdAt", out _));
    }

    [Fact]
    public async Task Post_applies_defaults_and_returns_201()
    {
        var repo = new FakeRepo { Access = true };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Post, NotesPath, body: """{"content":"hi"}""");
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.Equal("general", repo.LastCreate!.Type);   // || "general"
        Assert.False(repo.LastCreate.IsPrivate);            // || false
        Assert.Empty(repo.LastCreate.Tags);                 // || []
        Assert.Null(repo.LastCreate.FollowUpDate);
        Assert.Equal("hi", repo.LastCreate.Content);

        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        // Create DOES carry the author as of formmaps#89 — this used to assert the opposite,
        // mirroring Node's old no-join behaviour. Node now joins too, so the parity target
        // moved; see Post_returns_the_author_joined_shape_so_the_client_can_cache_it.
        Assert.True(doc.RootElement.GetProperty("data").TryGetProperty("author", out _));
    }

    [Fact]
    public async Task Post_counselor_without_access_is_404_before_body_500()
    {
        var repo = new FakeRepo { Access = false };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();
        // A valid-JSON but content-less body would 500 IF reached; access 404 wins.
        var response = await Send(client, HttpMethod.Post, NotesPath, body: "{}");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Theory]
    [InlineData("""{}""")]                    // content missing → Prisma 500
    [InlineData("""{"content":5}""")]         // content non-string → 500
    [InlineData("""{"content":null}""")]      // content null → 500
    [InlineData("""{"content":"x","type":5}""")]     // truthy non-string type → 500
    [InlineData("""{"content":"x","isPrivate":5}""")] // truthy non-bool isPrivate → 500
    [InlineData("""{"content":"x","tags":"nope"}""")] // non-array tags → 500
    [InlineData("""{"content":"x","tags":[5]}""")]    // non-string element → 500
    [InlineData("""{"content":"x","followUpDate":"garbage"}""")] // invalid date → 500
    public async Task Post_prisma_type_violations_are_500(string body)
    {
        var repo = new FakeRepo { Access = true };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Post, NotesPath, body: body);
        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
    }

    [Theory]
    [InlineData("5")]           // primitive
    [InlineData("{\"a\":")]     // malformed
    public async Task Post_malformed_or_primitive_body_is_500(string body)
    {
        var repo = new FakeRepo { Access = true };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Post, NotesPath, body: body);
        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
    }

    [Fact]
    public async Task Post_content_empty_string_is_valid()
    {
        var repo = new FakeRepo { Access = true };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Post, NotesPath, body: """{"content":""}""");
        Assert.Equal(HttpStatusCode.Created, response.StatusCode); // "" is a valid string (no || default)
        Assert.Equal("", repo.LastCreate!.Content);
    }

    // ---- PUT ----

    [Fact]
    public async Task Put_forwards_only_present_fields()
    {
        var repo = new FakeRepo { Update = new UpdateNoteResult(UpdateNoteOutcome.Ok, SampleRow("note1")) };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();

        await Send(client, HttpMethod.Put, NotePath, body: """{"content":"changed","tags":["a"]}""");
        Assert.True(repo.LastFieldsValid);
        Assert.True(repo.LastFields!.HasContent);
        Assert.Equal("changed", repo.LastFields.Content);
        Assert.True(repo.LastFields.HasTags);
        Assert.False(repo.LastFields.HasType);      // absent → not written
        Assert.False(repo.LastFields.HasFollowUpDate);
    }

    [Theory]
    [InlineData("""{"content":5}""")]        // non-string → invalid
    [InlineData("""{"type":null}""")]        // present null → invalid
    [InlineData("""{"isPrivate":"x"}""")]    // non-bool → invalid
    [InlineData("""{"followUpDate":"garbage"}""")] // invalid date → invalid
    public async Task Put_type_invalid_body_sets_fieldsValid_false(string body)
    {
        var repo = new FakeRepo { Update = new UpdateNoteResult(UpdateNoteOutcome.InvalidBody, null) };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Put, NotePath, body: body);
        Assert.False(repo.LastFieldsValid);                      // endpoint flagged it
        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode); // repo maps InvalidBody → 500
    }

    [Fact]
    public async Task Put_not_authorized_is_403()
    {
        var repo = new FakeRepo { Update = new UpdateNoteResult(UpdateNoteOutcome.NotAuthorized, null) };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Put, NotePath, body: "{}");
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Not authorized", doc.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task Put_ok_returns_row_without_author()
    {
        var repo = new FakeRepo { Update = new UpdateNoteResult(UpdateNoteOutcome.Ok, SampleRow("note1")) };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Put, NotePath, body: "{}");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = doc.RootElement.GetProperty("data");
        Assert.Equal("note1", data.GetProperty("id").GetString());
        Assert.False(data.TryGetProperty("author", out _));
    }

    [Fact]
    public async Task Put_malformed_body_is_500()
    {
        using var factory = new Factory(new FakeRepo());
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Put, NotePath, body: "5");
        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
    }

    // ---- DELETE ----

    [Theory]
    [InlineData(FormMapsRoles.Counselor, true)]
    [InlineData(FormMapsRoles.SchoolAdmin, false)]
    [InlineData(FormMapsRoles.SuperAdmin, false)]
    public async Task Delete_forwards_counselor_flag(string role, bool expectedIsCounselor)
    {
        var repo = new FakeRepo { Delete = SimpleWriteOutcome.Ok };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Delete, NotePath, role: role);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(expectedIsCounselor, repo.LastCallerIsCounselor);
    }

    [Fact]
    public async Task Delete_not_authorized_is_403()
    {
        var repo = new FakeRepo { Delete = SimpleWriteOutcome.NotAuthorized };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Delete, NotePath);
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Not authorized", doc.RootElement.GetProperty("message").GetString());
    }

    // ---- complete-followup ----

    [Fact]
    public async Task Complete_followup_ok_returns_subset()
    {
        var repo = new FakeRepo
        {
            Complete = new CompleteFollowUpResult(false, new CompleteFollowUpData("note1", true, "2026-07-23T12:00:00.000Z")),
        };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Put, CompletePath, body: "{}");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = doc.RootElement.GetProperty("data");
        Assert.Equal("note1", data.GetProperty("id").GetString());
        Assert.True(data.GetProperty("followUpCompleted").GetBoolean());
        Assert.Equal("2026-07-23T12:00:00.000Z", data.GetProperty("followUpCompletedAt").GetString());
        Assert.False(data.TryGetProperty("content", out _)); // only the subset
    }

    [Fact]
    public async Task Complete_followup_not_authorized_is_403()
    {
        var repo = new FakeRepo { Complete = new CompleteFollowUpResult(true, null) };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Put, CompletePath, body: "{}");
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Not authorized", doc.RootElement.GetProperty("message").GetString());
    }

    // ---- helpers ----

    private static NoteRow SampleRow(string id) => new(
        id, "s1", "counselor-1", "general", "content", false, null, false, null,
        ["a"], true, null, "2026-01-01T00:00:00.000Z", null, "2026-01-01T00:00:00.000Z");

    private static NoteListItem SampleItem(string id, string? authorName) => new(SampleRow(id), authorName);

    private static Task<HttpResponseMessage> Send(
        HttpClient client, HttpMethod method, string path, string? body = null,
        string permission = FormMapsPermissions.CounselorNotes, string role = FormMapsRoles.Counselor)
    {
        var request = new HttpRequestMessage(method, path);
        request.Headers.Add(DevelopmentRequestContextFactory.UserIdHeader, "counselor-1");
        request.Headers.Add(DevelopmentRequestContextFactory.RoleHeader, role);
        request.Headers.Add(DevelopmentRequestContextFactory.EmailHeader, "c@example.test");
        request.Headers.Add(DevelopmentRequestContextFactory.NameHeader, "Counselor");
        request.Headers.Add(DevelopmentRequestContextFactory.PermissionsHeader, permission);
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
                services.RemoveAll<ICounselorNotesRepository>();
                services.AddSingleton<ICounselorNotesRepository>(repo);
            });
        }
    }

    private sealed class FakeRepo : ICounselorNotesRepository
    {
        public bool Access { get; init; }
        public NotesPage Page { get; init; } = new([], 0);
        public UpdateNoteResult Update { get; init; } = new(UpdateNoteOutcome.Ok, null);
        public SimpleWriteOutcome Delete { get; init; } = SimpleWriteOutcome.Ok;
        public CompleteFollowUpResult Complete { get; init; } = new(false, new CompleteFollowUpData("note1", true, null));

        public string? LastTypeFilter { get; private set; }
        public int LastLimit { get; private set; }
        public CreateNoteInput? LastCreate { get; private set; }
        public bool LastFieldsValid { get; private set; }
        public UpdateNoteFields? LastFields { get; private set; }
        public bool LastCallerIsCounselor { get; private set; }

        public Task<bool> HasCounselorStudentAccessAsync(
            RequestContext context, string counselorId, string studentId, CancellationToken cancellationToken = default) =>
            Task.FromResult(Access);

        public Task<NotesPage> ListAsync(
            RequestContext context, string studentId, string? typeFilter, int page, int limit,
            CancellationToken cancellationToken = default)
        {
            LastTypeFilter = typeFilter;
            LastLimit = limit;
            return Task.FromResult(Page);
        }

        public Task<NoteListItem> CreateAsync(
            RequestContext context, string studentId, string authorId, CreateNoteInput input,
            CancellationToken cancellationToken = default)
        {
            LastCreate = input;
            return Task.FromResult(SampleItem("created", "Author"));
        }

        public Task<UpdateNoteResult> UpdateAsync(
            RequestContext context, string noteId, string callerId, bool fieldsValid, UpdateNoteFields fields,
            CancellationToken cancellationToken = default)
        {
            LastFieldsValid = fieldsValid;
            LastFields = fields;
            return Task.FromResult(Update);
        }

        public Task<SimpleWriteOutcome> SoftDeleteAsync(
            RequestContext context, string noteId, string callerId, bool callerIsCounselor,
            CancellationToken cancellationToken = default)
        {
            LastCallerIsCounselor = callerIsCounselor;
            return Task.FromResult(Delete);
        }

        public Task<CompleteFollowUpResult> CompleteFollowUpAsync(
            RequestContext context, string noteId, string callerId, CancellationToken cancellationToken = default) =>
            Task.FromResult(Complete);
    }
}
