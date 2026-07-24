using System.Net;
using System.Text;
using System.Text.Json;
using FormMaps.Api.Auth;
using FormMaps.Application.Auth;
using FormMaps.Application.College;
using FormMaps.Domain.Auth;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;

namespace FormMaps.IntegrationTests.College;

/// <summary>
/// Guard + access-collapse + validation + wordCount parity + result mapping for college essays + comments
/// (FM-DOTNET-083; resolver + repo faked). Pins: anonymous → 401; list access-fail → 404 "Not found"; create 400
/// title, non-string title → 500, content wordCount (whitespace-only → 1, multi-word, "" → 0/null), truthy-non-string
/// content/prompt → 500, 201; update 404 "Essay not found" then access 404, content null / derived wordCount / explicit
/// override, invalid status/title/wordCount → deferred 500, 200; delete { success:true } only; comments 400 content,
/// non-string content → 500, 404 essay/access, author mapping; malformed/primitive body → 500.
/// </summary>
public class CollegeEssaysEndpointsTests
{
    private const string EssaysPath = "/api/v1/college/students/stu-1/essays";
    private const string EssayItemPath = "/api/v1/college/essays/e1";
    private const string CommentsPath = "/api/v1/college/essays/e1/comments";

    [Theory]
    [InlineData(EssaysPath, "GET")]
    [InlineData(EssaysPath, "POST")]
    [InlineData(EssayItemPath, "PUT")]
    [InlineData(EssayItemPath, "DELETE")]
    [InlineData(CommentsPath, "POST")]
    [InlineData(CommentsPath, "GET")]
    public async Task Anonymous_is_401(string path, string method)
    {
        using var factory = new Factory(new FakeResolver(), new FakeRepo());
        using var client = factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await client.SendAsync(new HttpRequestMessage(new HttpMethod(method), path))).StatusCode);
    }

    // ---- list essays ----

    [Fact]
    public async Task List_access_denied_is_404()
    {
        var response = await Send(new FakeResolver { Access = false }, new FakeRepo(), HttpMethod.Get, EssaysPath);
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("Not found", await Message(response));
    }

    [Fact]
    public async Task List_emits_count_wrapper()
    {
        var repo = new FakeRepo { Essays = [new EssayListRow(Essay("e1"), 3)] };
        var response = await Send(new FakeResolver(), repo, HttpMethod.Get, EssaysPath);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var row = doc.RootElement.GetProperty("data")[0];
        Assert.Equal(3, row.GetProperty("_count").GetProperty("comments").GetInt32());
    }

    // ---- create essay ----

    [Fact]
    public async Task Create_requires_title()
    {
        var response = await Send(new FakeResolver(), new FakeRepo(), HttpMethod.Post, EssaysPath, """{"content":"hi"}""");
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("title required", await Message(response));
    }

    [Fact]
    public async Task Create_non_string_title_is_500()
    {
        var response = await Send(new FakeResolver(), new FakeRepo(), HttpMethod.Post, EssaysPath, """{"title":5}""");
        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
    }

    [Fact]
    public async Task Create_whitespace_only_content_wordCount_is_1()
    {
        var repo = new FakeRepo();
        var response = await Send(new FakeResolver(), repo, HttpMethod.Post, EssaysPath, """{"title":"T","content":"   "}""");
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.Equal(1, repo.LastCreate!.WordCount);   // "   ".trim()="" → "".split(/\s+/)=[""] → 1
        Assert.Equal("   ", repo.LastCreate.Content);   // truthy string stored (NOT null)
    }

    [Fact]
    public async Task Create_multiword_content_wordCount_counts_runs()
    {
        var repo = new FakeRepo();
        await Send(new FakeResolver(), repo, HttpMethod.Post, EssaysPath, """{"title":"T","content":"  hello   world  "}""");
        Assert.Equal(2, repo.LastCreate!.WordCount); // trimmed + collapsed runs
    }

    [Fact]
    public async Task Create_empty_content_is_null_wordCount_0()
    {
        var repo = new FakeRepo();
        await Send(new FakeResolver(), repo, HttpMethod.Post, EssaysPath, """{"title":"T","content":""}""");
        Assert.Null(repo.LastCreate!.Content);      // "" falsy → content||null = null
        Assert.Equal(0, repo.LastCreate.WordCount);
    }

    [Fact]
    public async Task Create_truthy_nonstring_content_is_500()
    {
        var response = await Send(new FakeResolver(), new FakeRepo(), HttpMethod.Post, EssaysPath, """{"title":"T","content":5}""");
        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode); // 5.trim() → TypeError → 500
    }

    [Fact]
    public async Task Create_truthy_nonstring_prompt_is_500()
    {
        var response = await Send(new FakeResolver(), new FakeRepo(), HttpMethod.Post, EssaysPath, """{"title":"T","prompt":true}""");
        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode); // prompt||null → true → Prisma String? reject
    }

    [Fact]
    public async Task Create_access_denied_is_404()
    {
        var response = await Send(new FakeResolver { Access = false }, new FakeRepo(), HttpMethod.Post, EssaysPath, """{"title":"T"}""");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("Not found", await Message(response));
    }

    [Fact]
    public async Task Create_ok_coalesces_optional_fields_to_null()
    {
        var repo = new FakeRepo();
        var response = await Send(new FakeResolver(), repo, HttpMethod.Post, EssaysPath, """{"title":"T"}""");
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.Null(repo.LastCreate!.Prompt);
        Assert.Null(repo.LastCreate.EssayType);
        Assert.Null(repo.LastCreate.StudentApplicationId);
        Assert.Equal(0, repo.LastCreate.WordCount);
    }

    [Fact]
    public async Task Create_malformed_and_primitive_body_500()
    {
        Assert.Equal(HttpStatusCode.InternalServerError,
            (await Send(new FakeResolver(), new FakeRepo(), HttpMethod.Post, EssaysPath, "{bad")).StatusCode);
        Assert.Equal(HttpStatusCode.InternalServerError,
            (await Send(new FakeResolver(), new FakeRepo(), HttpMethod.Post, EssaysPath, "42")).StatusCode);
    }

    // ---- update essay ----

    [Fact]
    public async Task Update_missing_essay_is_404_essay_not_found()
    {
        var response = await Send(new FakeResolver(), new FakeRepo { Owner = null }, HttpMethod.Put, EssayItemPath, """{"title":"x"}""");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("Essay not found", await Message(response));
    }

    [Fact]
    public async Task Update_access_denied_is_404_not_found()
    {
        var response = await Send(new FakeResolver { Access = false }, new FakeRepo { Owner = "stu-1" }, HttpMethod.Put, EssayItemPath, """{"title":"x"}""");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("Not found", await Message(response));
    }

    [Fact]
    public async Task Update_content_null_sets_null_and_wordCount_0()
    {
        var repo = new FakeRepo { Owner = "stu-1" };
        await Send(new FakeResolver(), repo, HttpMethod.Put, EssayItemPath, """{"content":null}""");
        Assert.True(repo.LastUpdate!.HasContent);
        Assert.True(repo.LastUpdate.ContentIsNull);
        Assert.True(repo.LastUpdate.HasWordCount);
        Assert.Equal(0, repo.LastUpdate.WordCount);
    }

    [Fact]
    public async Task Update_content_derives_wordCount()
    {
        var repo = new FakeRepo { Owner = "stu-1" };
        await Send(new FakeResolver(), repo, HttpMethod.Put, EssayItemPath, """{"content":"hello world"}""");
        Assert.Equal(2, repo.LastUpdate!.WordCount);
        Assert.Equal("hello world", repo.LastUpdate.Content);
    }

    [Fact]
    public async Task Update_empty_content_stored_raw_not_null()
    {
        var repo = new FakeRepo { Owner = "stu-1" };
        await Send(new FakeResolver(), repo, HttpMethod.Put, EssayItemPath, """{"content":""}""");
        Assert.True(repo.LastUpdate!.HasContent);
        Assert.False(repo.LastUpdate.ContentIsNull); // "" stored RAW as "" (update asymmetry vs create → null)
        Assert.Equal("", repo.LastUpdate.Content);
        Assert.Equal(0, repo.LastUpdate.WordCount);
    }

    [Fact]
    public async Task Update_explicit_wordCount_overrides_content_derived()
    {
        var repo = new FakeRepo { Owner = "stu-1" };
        await Send(new FakeResolver(), repo, HttpMethod.Put, EssayItemPath, """{"content":"a b c","wordCount":99}""");
        Assert.Equal(99, repo.LastUpdate!.WordCount); // explicit wins (assigned last in legacy)
    }

    [Fact]
    public async Task Update_only_wordCount_sets_wordCount()
    {
        var repo = new FakeRepo { Owner = "stu-1" };
        await Send(new FakeResolver(), repo, HttpMethod.Put, EssayItemPath, """{"wordCount":7}""");
        Assert.True(repo.LastUpdate!.HasWordCount);
        Assert.False(repo.LastUpdate.HasContent);
        Assert.Equal(7, repo.LastUpdate.WordCount);
    }

    [Fact]
    public async Task Update_invalid_status_is_deferred_500()
    {
        var response = await Send(new FakeResolver(), new FakeRepo { Owner = "stu-1" }, HttpMethod.Put, EssayItemPath, """{"status":"bogus"}""");
        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
    }

    [Fact]
    public async Task Update_null_title_is_deferred_500()
    {
        var response = await Send(new FakeResolver(), new FakeRepo { Owner = "stu-1" }, HttpMethod.Put, EssayItemPath, """{"title":null}""");
        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode); // title NOT NULL → 500
    }

    [Fact]
    public async Task Update_noninteger_wordCount_is_deferred_500()
    {
        var response = await Send(new FakeResolver(), new FakeRepo { Owner = "stu-1" }, HttpMethod.Put, EssayItemPath, """{"wordCount":3.5}""");
        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode); // Int reject → 500
    }

    [Fact]
    public async Task Update_valid_status_ok()
    {
        var repo = new FakeRepo { Owner = "stu-1" };
        var response = await Send(new FakeResolver(), repo, HttpMethod.Put, EssayItemPath, """{"title":"New","status":"final_version"}""");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.True(repo.LastUpdate!.HasTitle);
        Assert.Equal("final_version", repo.LastUpdate.Status);
    }

    [Fact]
    public async Task Update_malformed_body_before_existence_404()
    {
        // express.json parses before the handler → malformed body 500s even when the essay is missing.
        var response = await Send(new FakeResolver(), new FakeRepo { Owner = null }, HttpMethod.Put, EssayItemPath, "{bad");
        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
    }

    // ---- delete essay ----

    [Fact]
    public async Task Delete_missing_essay_is_404_essay_not_found()
    {
        var response = await Send(new FakeResolver(), new FakeRepo { Owner = null }, HttpMethod.Delete, EssayItemPath);
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("Essay not found", await Message(response));
    }

    [Fact]
    public async Task Delete_ok_returns_success_only()
    {
        var response = await Send(new FakeResolver(), new FakeRepo { Owner = "stu-1" }, HttpMethod.Delete, EssayItemPath);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.True(doc.RootElement.GetProperty("success").GetBoolean());
        Assert.False(doc.RootElement.TryGetProperty("data", out _));
    }

    // ---- comments ----

    [Fact]
    public async Task Comment_missing_essay_is_404_essay_not_found()
    {
        var response = await Send(new FakeResolver(), new FakeRepo { Owner = null }, HttpMethod.Post, CommentsPath, """{"content":"c"}""");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("Essay not found", await Message(response));
    }

    [Fact]
    public async Task Comment_access_denied_is_404_not_found()
    {
        var response = await Send(new FakeResolver { Access = false }, new FakeRepo { Owner = "stu-1" }, HttpMethod.Post, CommentsPath, """{"content":"c"}""");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("Not found", await Message(response));
    }

    [Fact]
    public async Task Comment_requires_content()
    {
        var response = await Send(new FakeResolver(), new FakeRepo { Owner = "stu-1" }, HttpMethod.Post, CommentsPath, """{"content":""}""");
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("content required", await Message(response));
    }

    [Fact]
    public async Task Comment_non_string_content_is_500()
    {
        var response = await Send(new FakeResolver(), new FakeRepo { Owner = "stu-1" }, HttpMethod.Post, CommentsPath, """{"content":5}""");
        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
    }

    [Fact]
    public async Task Comment_ok_returns_201()
    {
        var repo = new FakeRepo { Owner = "stu-1" };
        var response = await Send(new FakeResolver(), repo, HttpMethod.Post, CommentsPath, """{"content":"looks good"}""");
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.Equal("looks good", repo.LastCommentContent);
        Assert.Equal("caller-1", repo.LastCommentAuthor); // authorId = caller
    }

    [Fact]
    public async Task Comments_list_includes_author()
    {
        var repo = new FakeRepo
        {
            Owner = "stu-1",
            Comments = [new CommentWithAuthor(Comment("cm1"), new CommentAuthorRef("u9", "Ms. Advisor", "counselor"))],
        };
        var response = await Send(new FakeResolver(), repo, HttpMethod.Get, CommentsPath);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var author = doc.RootElement.GetProperty("data")[0].GetProperty("author");
        Assert.Equal("Ms. Advisor", author.GetProperty("name").GetString());
        Assert.Equal("counselor", author.GetProperty("roleName").GetString());
    }

    // ---- helpers ----

    private static EssayRow Essay(string id) =>
        new(id, "stu-1", null, "Title", null, null, "draft", 0, null, true, null,
            "2026-01-01T00:00:00.000Z", null, "2026-01-01T00:00:00.000Z");

    private static CommentRow Comment(string id) =>
        new(id, "e1", "u9", "text", true, "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z");

    private static async Task<string?> Message(HttpResponseMessage response)
    {
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return doc.RootElement.GetProperty("message").GetString();
    }

    private static Task<HttpResponseMessage> Send(
        FakeResolver resolver, FakeRepo repo, HttpMethod method, string path, string? body = null)
    {
        var factory = new Factory(resolver, repo); // NOT `using` — must outlive the returned Task
        var client = factory.CreateClient();
        var request = new HttpRequestMessage(method, path);
        request.Headers.Add(DevelopmentRequestContextFactory.UserIdHeader, "caller-1");
        request.Headers.Add(DevelopmentRequestContextFactory.RoleHeader, FormMapsRoles.SchoolAdmin);
        request.Headers.Add(DevelopmentRequestContextFactory.EmailHeader, "c@example.test");
        request.Headers.Add(DevelopmentRequestContextFactory.NameHeader, "Caller");
        request.Headers.Add(DevelopmentRequestContextFactory.PermissionsHeader, "");
        if (body is not null)
        {
            request.Content = new StringContent(body, Encoding.UTF8, "application/json");
        }

        return client.SendAsync(request);
    }

    private sealed class Factory(FakeResolver resolver, FakeRepo repo) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(Environments.Development);
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<ICollegeAccessResolver>();
                services.RemoveAll<ICollegeEssaysRepository>();
                services.AddSingleton<ICollegeAccessResolver>(resolver);
                services.AddSingleton<ICollegeEssaysRepository>(repo);
            });
        }
    }

    private sealed class FakeResolver : ICollegeAccessResolver
    {
        public bool Access { get; init; } = true;
        public Task<bool> CanAccessAsync(RequestContext context, string studentId, CancellationToken ct = default) =>
            Task.FromResult(Access);
    }

    private sealed class FakeRepo : ICollegeEssaysRepository
    {
        public IReadOnlyList<EssayListRow> Essays { get; init; } = [];
        public string? Owner { get; init; } = "stu-1";
        public IReadOnlyList<CommentWithAuthor> Comments { get; init; } = [];

        public EssayCreateInput? LastCreate { get; private set; }
        public EssayUpdateFields? LastUpdate { get; private set; }
        public string? LastCommentContent { get; private set; }
        public string? LastCommentAuthor { get; private set; }

        public Task<IReadOnlyList<EssayListRow>> ListEssaysAsync(RequestContext context, string studentId, CancellationToken ct = default) =>
            Task.FromResult(Essays);

        public Task<EssayRow> CreateEssayAsync(RequestContext context, string callerId, EssayCreateInput input, CancellationToken ct = default)
        {
            LastCreate = input;
            return Task.FromResult(Essay(input.StudentId));
        }

        public Task<string?> FindActiveEssayOwnerAsync(RequestContext context, string id, CancellationToken ct = default) =>
            Task.FromResult(Owner);

        public Task<EssayRow> ApplyEssayUpdateAsync(RequestContext context, string callerId, string id, EssayUpdateFields fields, CancellationToken ct = default)
        {
            LastUpdate = fields;
            return Task.FromResult(Essay("e1"));
        }

        public Task SoftDeleteEssayAsync(RequestContext context, string callerId, string id, CancellationToken ct = default) =>
            Task.CompletedTask;

        public Task<CommentRow> AddCommentAsync(RequestContext context, string essayId, string authorId, string content, CancellationToken ct = default)
        {
            LastCommentContent = content;
            LastCommentAuthor = authorId;
            return Task.FromResult(Comment("cm-new"));
        }

        public Task<IReadOnlyList<CommentWithAuthor>> ListCommentsAsync(RequestContext context, string essayId, CancellationToken ct = default) =>
            Task.FromResult(Comments);
    }
}
