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
/// Guard + access-collapse + validation + result mapping for college search + favorites (FM-DOTNET-082; resolver +
/// repo faked). Pins: anonymous → 401; search 200 + parseFloat filter parsing; list access-fail → 404 "Not found";
/// POST 400 required universityId + non-string universityId → 500 + 409 "Already in list" + InvalidBody → 500 + 201;
/// PUT/DELETE missing/access → 404, PUT deferred fit-500, DELETE { success:true }; malformed/primitive body → 500.
/// </summary>
public class CollegeFavoritesEndpointsTests
{
    private const string SearchPath = "/api/v1/college/search";
    private const string ListPath = "/api/v1/college/students/stu-1/list";
    private const string ItemPath = "/api/v1/college/list/fav1";

    [Theory]
    [InlineData(SearchPath, "GET")]
    [InlineData(ListPath, "GET")]
    [InlineData(ListPath, "POST")]
    [InlineData(ItemPath, "PUT")]
    [InlineData(ItemPath, "DELETE")]
    public async Task Anonymous_is_401(string path, string method)
    {
        using var factory = new Factory(new FakeResolver(), new FakeRepo());
        using var client = factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await client.SendAsync(new HttpRequestMessage(new HttpMethod(method), path))).StatusCode);
    }

    [Fact]
    public async Task Search_returns_rows_and_parses_parseFloat_filter()
    {
        var repo = new FakeRepo { Search = [SearchRow("u1"), SearchRow("u2")] };
        var response = await Send(new FakeResolver(), repo, HttpMethod.Get,
            SearchPath + "?q=mit&state=MA&minAdmRate=0.4&maxAdmRate=0.6");
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(2, doc.RootElement.GetProperty("data").GetArrayLength());
        Assert.Equal("mit", repo.LastFilter!.Query);
        Assert.Equal("MA", repo.LastFilter.State);
        Assert.Equal(0.4, repo.LastFilter.MinAcceptanceRate);
        Assert.Equal(0.6, repo.LastFilter.MaxAcceptanceRate);
    }

    [Fact]
    public async Task Search_empty_filters_are_null()
    {
        var repo = new FakeRepo();
        await Send(new FakeResolver(), repo, HttpMethod.Get, SearchPath + "?q=&minAdmRate=");
        Assert.Null(repo.LastFilter!.Query);            // "" falsy → no filter
        Assert.Null(repo.LastFilter.MinAcceptanceRate); // "" falsy → no filter
    }

    [Fact]
    public async Task List_access_denied_is_404()
    {
        var response = await Send(new FakeResolver { Access = false }, new FakeRepo(), HttpMethod.Get, ListPath);
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("Not found", await Message(response));
    }

    [Fact]
    public async Task Add_requires_universityId()
    {
        var response = await Send(new FakeResolver(), new FakeRepo(), HttpMethod.Post, ListPath, """{"fitClassification":"reach"}""");
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("universityId required", await Message(response));
    }

    [Fact]
    public async Task Add_non_string_universityId_is_500()
    {
        var response = await Send(new FakeResolver(), new FakeRepo(), HttpMethod.Post, ListPath, """{"universityId":5}""");
        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode); // truthy non-string → Prisma 500 at findUnique
    }

    [Fact]
    public async Task Add_already_in_list_is_409()
    {
        var repo = new FakeRepo { Add = new AddToListResult(AddToListOutcome.AlreadyInList, null) };
        var response = await Send(new FakeResolver(), repo, HttpMethod.Post, ListPath, """{"universityId":"u1"}""");
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("Already in list", await Message(response));
    }

    [Fact]
    public async Task Add_invalid_fit_is_500_but_only_forwards_when_not_already_in_list()
    {
        var repo = new FakeRepo { Add = new AddToListResult(AddToListOutcome.InvalidBody, null) };
        var response = await Send(new FakeResolver(), repo, HttpMethod.Post, ListPath, """{"universityId":"u1","fitClassification":5}""");
        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        Assert.False(repo.LastFitValid); // non-string fit flagged invalid, forwarded for the repo to gate after the 409 check
    }

    [Fact]
    public async Task Add_ok_returns_201()
    {
        var repo = new FakeRepo { Add = new AddToListResult(AddToListOutcome.Ok, Fav("new")) };
        var response = await Send(new FakeResolver(), repo, HttpMethod.Post, ListPath, """{"universityId":"u1","fitClassification":"reach"}""");
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.True(repo.LastFitValid);
        Assert.True(repo.LastHasFit);
    }

    [Fact]
    public async Task Update_missing_or_access_denied_is_404()
    {
        Assert.Equal(HttpStatusCode.NotFound,
            (await Send(new FakeResolver(), new FakeRepo { Owner = null }, HttpMethod.Put, ItemPath, """{"fitClassification":"x"}""")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,
            (await Send(new FakeResolver { Access = false }, new FakeRepo { Owner = "stu-1" }, HttpMethod.Put, ItemPath, """{"fitClassification":"x"}""")).StatusCode);
    }

    [Fact]
    public async Task Update_invalid_fit_is_deferred_500()
    {
        var response = await Send(new FakeResolver(), new FakeRepo { Owner = "stu-1" }, HttpMethod.Put, ItemPath, """{"fitClassification":5}""");
        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
    }

    [Fact]
    public async Task Update_ok_returns_row()
    {
        var repo = new FakeRepo { Owner = "stu-1" };
        var response = await Send(new FakeResolver(), repo, HttpMethod.Put, ItemPath, """{"fitClassification":"reach"}""");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.True(repo.LastHasFit);
        Assert.Equal("reach", repo.LastFit);
    }

    [Fact]
    public async Task Delete_ok_returns_success_only()
    {
        var response = await Send(new FakeResolver(), new FakeRepo { Owner = "stu-1" }, HttpMethod.Delete, ItemPath);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.True(doc.RootElement.GetProperty("success").GetBoolean());
        Assert.False(doc.RootElement.TryGetProperty("data", out _));
    }

    [Fact]
    public async Task Add_malformed_and_primitive_body_500()
    {
        Assert.Equal(HttpStatusCode.InternalServerError,
            (await Send(new FakeResolver(), new FakeRepo(), HttpMethod.Post, ListPath, "{bad")).StatusCode);
        Assert.Equal(HttpStatusCode.InternalServerError,
            (await Send(new FakeResolver(), new FakeRepo(), HttpMethod.Post, ListPath, "42")).StatusCode);
    }

    // ---- helpers ----

    private static readonly JsonElement EmptyJson = JsonDocument.Parse("{}").RootElement.Clone();

    private static UniversitySearchRow SearchRow(string id) =>
        new(id, "Uni", "City", "ST", 0.5, null, null, null, null, null, null, null, null, EmptyJson, null, "private", "https://x.edu");

    private static FavoriteRow Fav(string id) =>
        new(id, "stu-1", "u1", "2026-01-01T00:00:00.000Z", null, null, true, null, "2026-01-01T00:00:00.000Z", null, "2026-01-01T00:00:00.000Z");

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
                services.RemoveAll<ICollegeFavoritesRepository>();
                services.AddSingleton<ICollegeAccessResolver>(resolver);
                services.AddSingleton<ICollegeFavoritesRepository>(repo);
            });
        }
    }

    private sealed class FakeResolver : ICollegeAccessResolver
    {
        public bool Access { get; init; } = true;
        public Task<bool> CanAccessAsync(RequestContext context, string studentId, CancellationToken ct = default) =>
            Task.FromResult(Access);
    }

    private sealed class FakeRepo : ICollegeFavoritesRepository
    {
        public IReadOnlyList<UniversitySearchRow> Search { get; init; } = [];
        public string? Owner { get; init; } = "stu-1";
        public AddToListResult Add { get; init; } = new(AddToListOutcome.Ok, null);

        public UniversitySearchFilter? LastFilter { get; private set; }
        public bool LastFitValid { get; private set; }
        public bool LastHasFit { get; private set; }
        public string? LastFit { get; private set; }

        public Task<IReadOnlyList<UniversitySearchRow>> SearchAsync(RequestContext context, UniversitySearchFilter filter, CancellationToken ct = default)
        {
            LastFilter = filter;
            return Task.FromResult(Search);
        }

        public Task<IReadOnlyList<FavoriteWithUniversity>> ListFavoritesAsync(RequestContext context, string studentId, CancellationToken ct = default) =>
            Task.FromResult<IReadOnlyList<FavoriteWithUniversity>>([]);

        public Task<AddToListResult> AddToListAsync(RequestContext context, string studentId, string universityId, bool fitValid, bool hasFit, bool fitIsNull, string? fit, string callerId, CancellationToken ct = default)
        {
            LastFitValid = fitValid;
            LastHasFit = hasFit;
            return Task.FromResult(Add.Outcome == AddToListOutcome.Ok && Add.Row is null
                ? new AddToListResult(AddToListOutcome.Ok, Fav("created"))
                : Add);
        }

        public Task<string?> FindActiveFavoriteOwnerAsync(RequestContext context, string id, CancellationToken ct = default) =>
            Task.FromResult(Owner);

        public Task<FavoriteRow> UpdateFitAsync(RequestContext context, string id, bool hasFit, bool fitIsNull, string? fit, string callerId, CancellationToken ct = default)
        {
            LastHasFit = hasFit;
            LastFit = fit;
            return Task.FromResult(Fav(id));
        }

        public Task SoftDeleteFavoriteAsync(RequestContext context, string id, string callerId, CancellationToken ct = default) =>
            Task.CompletedTask;
    }
}
