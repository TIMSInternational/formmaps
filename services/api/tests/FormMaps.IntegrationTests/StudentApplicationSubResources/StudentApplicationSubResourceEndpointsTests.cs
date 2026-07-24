using System.Net;
using System.Text;
using System.Text.Json;
using FormMaps.Api.Auth;
using FormMaps.Application.Auth;
using FormMaps.Application.StudentApplicationSubResources;
using FormMaps.Domain.Auth;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;

namespace FormMaps.IntegrationTests.StudentApplicationSubResources;

/// <summary>
/// Guard + required-field + raw-body-resolution + result mapping for application essays + checklist (FM-DOTNET-077;
/// repo faked). Pins: anonymous → 401 on every route; POST required-field 400 (before ownership) + malformed/primitive
/// → 500 + deferred type-500 (truthy-non-string, non-int wordLimit, bad create-date) after ownership; create-date
/// <c>x ? new Date(x)</c> semantics; GET null → 404; PUT AppNotFound/EssayNotFound/ItemNotFound 404 + InvalidBody 500
/// + Ok 200 forwarding present fields (present-null nullable → SetNull, NOT NULL null → invalid, PUT wordLimit 0 →
/// value, isCompleted non-bool → invalid, PUT date number → invalid, array body → empty valid update).
/// </summary>
public class StudentApplicationSubResourceEndpointsTests
{
    private const string EssaysPath = "/api/v1/student/applications/app1/essays";
    private const string EssayItemPath = "/api/v1/student/applications/app1/essays/e1";
    private const string ChecklistPath = "/api/v1/student/applications/app1/checklist";
    private const string ChecklistItemPath = "/api/v1/student/applications/app1/checklist/c1";

    [Theory]
    [InlineData(EssaysPath, "POST")]
    [InlineData(EssaysPath, "GET")]
    [InlineData(EssayItemPath, "PUT")]
    [InlineData(ChecklistPath, "POST")]
    [InlineData(ChecklistPath, "GET")]
    [InlineData(ChecklistItemPath, "PUT")]
    public async Task Anonymous_is_401(string path, string method)
    {
        using var factory = new Factory(new FakeRepo());
        using var client = factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await client.SendAsync(new HttpRequestMessage(new HttpMethod(method), path))).StatusCode);
    }

    // ---- essays: create ----

    [Fact]
    public async Task Post_essay_valid_returns_201_and_forwards_fields()
    {
        var repo = new FakeRepo();
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Post, EssaysPath,
            """{"title":"Why us","prompt":"p","wordLimit":650,"dueDate":"2026-05-01T00:00:00.000Z"}""");
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.True(repo.LastEssayCreateValid);
        Assert.Equal("Why us", repo.LastEssayInput!.Title);
        Assert.Equal("p", repo.LastEssayInput.Prompt);
        Assert.Equal(650, repo.LastEssayInput.WordLimit);
        Assert.Equal(new DateTime(2026, 5, 1, 0, 0, 0, DateTimeKind.Utc), repo.LastEssayInput.DueDate);
    }

    [Theory]
    [InlineData("""{}""")]
    [InlineData("""{"title":""}""")]
    [InlineData("""{"title":null}""")]
    [InlineData("""{"title":0}""")]
    [InlineData("""{"title":false}""")]
    [InlineData("[]")]
    public async Task Post_essay_missing_title_is_400(string body)
    {
        using var factory = new Factory(new FakeRepo());
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Post, EssaysPath, body);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("title is required", doc.RootElement.GetProperty("message").GetString());
    }

    [Theory]
    [InlineData("{\"title\":")]  // malformed
    [InlineData("5")]            // primitive
    public async Task Post_essay_malformed_or_primitive_is_500(string body)
    {
        using var factory = new Factory(new FakeRepo());
        using var client = factory.CreateClient();
        Assert.Equal(HttpStatusCode.InternalServerError,
            (await Send(client, HttpMethod.Post, EssaysPath, body)).StatusCode);
    }

    [Theory]
    [InlineData("""{"title":5}""")]                    // truthy non-string title
    [InlineData("""{"title":"t","prompt":7}""")]        // truthy non-string prompt
    [InlineData("""{"title":"t","wordLimit":5.5}""")]   // non-integer wordLimit
    [InlineData("""{"title":"t","wordLimit":"650"}""")] // string wordLimit
    [InlineData("""{"title":"t","dueDate":"garbage"}""")] // invalid create-date
    [InlineData("""{"title":"t","dueDate":{}}""")]      // object date → Invalid
    public async Task Post_essay_deferred_type_error_flags_invalid_and_500(string body)
    {
        // Ownership passes (repo returns InvalidBody when valid=false), so the endpoint must forward valid=false.
        var repo = new FakeRepo { EssayCreate = new EssayCreateResult(SubResourceCreateOutcome.InvalidBody, null) };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Post, EssaysPath, body);
        Assert.False(repo.LastEssayCreateValid);
        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
    }

    [Theory]
    [InlineData("""{"title":"t"}""", null)]               // absent → null
    [InlineData("""{"title":"t","prompt":""}""", null)]   // "" falsy → null
    [InlineData("""{"title":"t","prompt":"hi"}""", "hi")] // string → value
    public async Task Post_essay_prompt_or_null(string body, string? expected)
    {
        var repo = new FakeRepo();
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();
        await Send(client, HttpMethod.Post, EssaysPath, body);
        Assert.True(repo.LastEssayCreateValid);
        Assert.Equal(expected, repo.LastEssayInput!.Prompt);
    }

    [Fact]
    public async Task Post_essay_wordLimit_zero_coalesces_to_null()
    {
        var repo = new FakeRepo();
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();
        await Send(client, HttpMethod.Post, EssaysPath, """{"title":"t","wordLimit":0}""");
        Assert.True(repo.LastEssayCreateValid);
        Assert.Null(repo.LastEssayInput!.WordLimit); // 0 || null → null
    }

    [Fact]
    public async Task Post_essay_application_not_found_is_404()
    {
        var repo = new FakeRepo { EssayCreate = new EssayCreateResult(SubResourceCreateOutcome.NotFound, null) };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Post, EssaysPath, """{"title":"t"}""");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Application not found", doc.RootElement.GetProperty("message").GetString());
    }

    // ---- essays: list / update ----

    [Fact]
    public async Task Get_essays_null_is_404()
    {
        var repo = new FakeRepo { EssayList = null };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Get, EssaysPath);
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Application not found", doc.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task Get_essays_returns_rows()
    {
        var repo = new FakeRepo { EssayList = [SampleEssay("e1"), SampleEssay("e2")] };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Get, EssaysPath);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(2, doc.RootElement.GetProperty("data").GetArrayLength());
        Assert.Equal(1, doc.RootElement.GetProperty("data")[0].GetProperty("draftVersion").GetInt32());
    }

    [Fact]
    public async Task Put_essay_app_not_found_is_404_application()
    {
        var repo = new FakeRepo { EssayUpdate = new EssayUpdateResult(EssayUpdateOutcome.AppNotFound, null) };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Put, EssayItemPath, """{"title":"x"}""");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Application not found", doc.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task Put_essay_essay_not_found_is_404_essay()
    {
        var repo = new FakeRepo { EssayUpdate = new EssayUpdateResult(EssayUpdateOutcome.EssayNotFound, null) };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Put, EssayItemPath, """{"title":"x"}""");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Essay not found", doc.RootElement.GetProperty("message").GetString());
    }

    [Theory]
    [InlineData("""{"title":5}""")]         // non-string on NOT NULL
    [InlineData("""{"title":null}""")]      // null on NOT NULL
    [InlineData("""{"status":null}""")]     // null on NOT NULL status
    [InlineData("""{"wordLimit":"x"}""")]   // string on Int?
    [InlineData("""{"wordLimit":3000000000}""")] // int4 overflow
    [InlineData("""{"dueDate":5}""")]       // PUT date number → Prisma DateTime reject
    [InlineData("""{"dueDate":true}""")]    // PUT date bool → reject
    public async Task Put_essay_invalid_body_flags_invalid_and_500(string body)
    {
        var repo = new FakeRepo { EssayUpdate = new EssayUpdateResult(EssayUpdateOutcome.InvalidBody, null) };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Put, EssayItemPath, body);
        Assert.False(repo.LastEssayUpdateValid);
        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
    }

    [Fact]
    public async Task Put_essay_ok_forwards_present_fields()
    {
        var repo = new FakeRepo { EssayUpdate = new EssayUpdateResult(EssayUpdateOutcome.Ok, SampleEssay("e1")) };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Put, EssayItemPath,
            """{"prompt":null,"wordLimit":0,"currentDraft":"draft","dueDate":"2026-06-01T00:00:00.000Z"}""");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.True(repo.LastEssayUpdateValid);
        var f = repo.LastEssayFields!;
        Assert.True(f.HasPrompt);
        Assert.True(f.PromptIsNull);           // present null → SetNull
        Assert.True(f.HasWordLimit);
        Assert.False(f.WordLimitIsNull);
        Assert.Equal(0, f.WordLimit);          // PUT wordLimit 0 → stored value (no || coalesce)
        Assert.True(f.HasCurrentDraft);
        Assert.Equal("draft", f.CurrentDraft);
        Assert.True(f.HasDueDate);
        Assert.False(f.DueDateIsNull);
        Assert.False(f.HasTitle);
    }

    [Fact]
    public async Task Put_essay_array_body_is_empty_valid_update()
    {
        var repo = new FakeRepo { EssayUpdate = new EssayUpdateResult(EssayUpdateOutcome.Ok, SampleEssay("e1")) };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Put, EssayItemPath, "[]");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.True(repo.LastEssayUpdateValid);
        Assert.False(repo.LastEssayFields!.HasTitle);
    }

    // ---- checklist ----

    [Fact]
    public async Task Post_checklist_valid_returns_201_with_defaults()
    {
        var repo = new FakeRepo();
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Post, ChecklistPath, """{"itemName":"Transcript"}""");
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.True(repo.LastChecklistCreateValid);
        Assert.Equal("Transcript", repo.LastChecklistInput!.ItemName);
        Assert.Equal("other", repo.LastChecklistInput.Category); // default
        Assert.Null(repo.LastChecklistInput.DueDate);
        Assert.Null(repo.LastChecklistInput.Notes);
    }

    [Theory]
    [InlineData("""{}""")]
    [InlineData("""{"itemName":""}""")]
    [InlineData("""{"itemName":null}""")]
    public async Task Post_checklist_missing_itemName_is_400(string body)
    {
        using var factory = new Factory(new FakeRepo());
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Post, ChecklistPath, body);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("itemName is required", doc.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task Post_checklist_category_truthy_non_string_is_500()
    {
        var repo = new FakeRepo { ChecklistCreate = new ChecklistCreateResult(SubResourceCreateOutcome.InvalidBody, null) };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Post, ChecklistPath, """{"itemName":"x","category":5}""");
        Assert.False(repo.LastChecklistCreateValid);
        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
    }

    [Fact]
    public async Task Post_checklist_category_falsy_defaults_to_other()
    {
        var repo = new FakeRepo();
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();
        await Send(client, HttpMethod.Post, ChecklistPath, """{"itemName":"x","category":""}""");
        Assert.True(repo.LastChecklistCreateValid);
        Assert.Equal("other", repo.LastChecklistInput!.Category);
    }

    [Fact]
    public async Task Get_checklist_null_is_404()
    {
        var repo = new FakeRepo { ChecklistList = null };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();
        Assert.Equal(HttpStatusCode.NotFound, (await Send(client, HttpMethod.Get, ChecklistPath)).StatusCode);
    }

    [Fact]
    public async Task Put_checklist_item_not_found_is_404_checklist()
    {
        var repo = new FakeRepo { ChecklistUpdate = new ChecklistUpdateResult(ChecklistUpdateOutcome.ItemNotFound, null) };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Put, ChecklistItemPath, """{"itemName":"x"}""");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Checklist item not found", doc.RootElement.GetProperty("message").GetString());
    }

    [Theory]
    [InlineData("""{"isCompleted":"yes"}""")] // non-bool on NOT NULL Bool
    [InlineData("""{"isCompleted":null}""")]  // null on NOT NULL Bool
    [InlineData("""{"itemName":null}""")]     // null on NOT NULL
    [InlineData("""{"category":7}""")]        // non-string on NOT NULL
    [InlineData("""{"dueDate":5}""")]         // PUT date number → reject
    public async Task Put_checklist_invalid_body_flags_invalid_and_500(string body)
    {
        var repo = new FakeRepo { ChecklistUpdate = new ChecklistUpdateResult(ChecklistUpdateOutcome.InvalidBody, null) };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Put, ChecklistItemPath, body);
        Assert.False(repo.LastChecklistUpdateValid);
        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
    }

    [Fact]
    public async Task Put_checklist_ok_forwards_present_fields()
    {
        var repo = new FakeRepo { ChecklistUpdate = new ChecklistUpdateResult(ChecklistUpdateOutcome.Ok, SampleChecklist("c1")) };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Put, ChecklistItemPath, """{"isCompleted":true,"notes":null}""");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.True(repo.LastChecklistUpdateValid);
        var f = repo.LastChecklistFields!;
        Assert.True(f.HasIsCompleted);
        Assert.True(f.IsCompleted);
        Assert.True(f.HasNotes);
        Assert.True(f.NotesIsNull);
        Assert.False(f.HasItemName);
    }

    // ---- helpers ----

    private static EssayRow SampleEssay(string id) => new(
        id, "app1", "Title", null, null, null, 1, "not_started", null, true, null,
        "2026-01-01T00:00:00.000Z", null, "2026-01-01T00:00:00.000Z");

    private static ChecklistRow SampleChecklist(string id) => new(
        id, "app1", "Item", "other", false, null, null, null, true, null,
        "2026-01-01T00:00:00.000Z", null, "2026-01-01T00:00:00.000Z");

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
                services.RemoveAll<IApplicationSubResourceRepository>();
                services.AddSingleton<IApplicationSubResourceRepository>(repo);
            });
        }
    }

    private sealed class FakeRepo : IApplicationSubResourceRepository
    {
        public EssayCreateResult EssayCreate { get; init; } = new(SubResourceCreateOutcome.Ok, SampleEssay("e1"));
        public IReadOnlyList<EssayRow>? EssayList { get; init; } = [];
        public EssayUpdateResult EssayUpdate { get; init; } = new(EssayUpdateOutcome.Ok, SampleEssay("e1"));
        public ChecklistCreateResult ChecklistCreate { get; init; } = new(SubResourceCreateOutcome.Ok, SampleChecklist("c1"));
        public IReadOnlyList<ChecklistRow>? ChecklistList { get; init; } = [];
        public ChecklistUpdateResult ChecklistUpdate { get; init; } = new(ChecklistUpdateOutcome.Ok, SampleChecklist("c1"));

        public CreateEssayInput? LastEssayInput { get; private set; }
        public bool LastEssayCreateValid { get; private set; }
        public EssayUpdateFields? LastEssayFields { get; private set; }
        public bool LastEssayUpdateValid { get; private set; }
        public CreateChecklistInput? LastChecklistInput { get; private set; }
        public bool LastChecklistCreateValid { get; private set; }
        public ChecklistUpdateFields? LastChecklistFields { get; private set; }
        public bool LastChecklistUpdateValid { get; private set; }

        public Task<EssayCreateResult> CreateEssayAsync(RequestContext context, string studentId, string appId, CreateEssayInput input, bool valid, CancellationToken ct = default)
        {
            LastEssayInput = input;
            LastEssayCreateValid = valid;
            return Task.FromResult(EssayCreate);
        }

        public Task<IReadOnlyList<EssayRow>?> ListEssaysAsync(RequestContext context, string studentId, string appId, CancellationToken ct = default) =>
            Task.FromResult(EssayList);

        public Task<EssayUpdateResult> UpdateEssayAsync(RequestContext context, string studentId, string appId, string essayId, bool valid, EssayUpdateFields fields, CancellationToken ct = default)
        {
            LastEssayFields = fields;
            LastEssayUpdateValid = valid;
            return Task.FromResult(EssayUpdate);
        }

        public Task<ChecklistCreateResult> CreateChecklistAsync(RequestContext context, string studentId, string appId, CreateChecklistInput input, bool valid, CancellationToken ct = default)
        {
            LastChecklistInput = input;
            LastChecklistCreateValid = valid;
            return Task.FromResult(ChecklistCreate);
        }

        public Task<IReadOnlyList<ChecklistRow>?> ListChecklistAsync(RequestContext context, string studentId, string appId, CancellationToken ct = default) =>
            Task.FromResult(ChecklistList);

        public Task<ChecklistUpdateResult> UpdateChecklistAsync(RequestContext context, string studentId, string appId, string checklistId, bool valid, ChecklistUpdateFields fields, CancellationToken ct = default)
        {
            LastChecklistFields = fields;
            LastChecklistUpdateValid = valid;
            return Task.FromResult(ChecklistUpdate);
        }
    }
}
