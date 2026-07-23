using System.Net;
using System.Text;
using System.Text.Json;
using FormMaps.Api.Auth;
using FormMaps.Application.Auth;
using FormMaps.Application.StudentPortfolio;
using FormMaps.Domain.Auth;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;

namespace FormMaps.IntegrationTests.StudentPortfolio;

/// <summary>
/// Guard + validation-forwarding + result mapping for the student portfolio CRUD (FM-DOTNET-073; repo faked). Pins:
/// anonymous → 401; GET list envelope + clamps + type forwarding; summary shape; POST 201 + zod-400 (first message) +
/// non-object → "Expected object, received &lt;type&gt;" + malformed → 500; PUT 404 "Item not found" + 200; DELETE 404 +
/// 200 "Portfolio item deleted successfully".
/// </summary>
public class StudentPortfolioEndpointsTests
{
    private const string ListPath = "/api/v1/student/portfolio";
    private const string SummaryPath = "/api/v1/student/portfolio/summary";
    private const string ItemPath = "/api/v1/student/portfolio/item1";

    [Theory]
    [InlineData(ListPath, "GET")]
    [InlineData(SummaryPath, "GET")]
    [InlineData(ListPath, "POST")]
    [InlineData(ItemPath, "PUT")]
    [InlineData(ItemPath, "DELETE")]
    public async Task Anonymous_is_401(string path, string method)
    {
        using var factory = new Factory(new FakeRepo());
        using var client = factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await client.SendAsync(new HttpRequestMessage(new HttpMethod(method), path))).StatusCode);
    }

    [Fact]
    public async Task Get_list_envelope_and_clamps()
    {
        var repo = new FakeRepo { Page = new PortfolioPage([SampleRow("item1")], Total: 3) };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Get, ListPath + "?limit=999&type=volunteer");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(50, repo.LastLimit);              // min(50, …)
        Assert.Equal("volunteer", repo.LastType);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = doc.RootElement.GetProperty("data");
        Assert.Equal(3, data.GetProperty("total").GetInt32());
        Assert.Equal(1, data.GetProperty("totalPages").GetInt32()); // ceil(3/50)=1
    }

    [Fact]
    public async Task Get_summary_shape()
    {
        var byType = new Dictionary<string, int> { ["volunteer"] = 2, ["work"] = 1 };
        var repo = new FakeRepo { Summary = new PortfolioSummary(3, byType, 8.5, 20.0, ["x", "y"], 2) };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Get, SummaryPath);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = doc.RootElement.GetProperty("data");
        Assert.Equal(3, data.GetProperty("totalItems").GetInt32());
        Assert.Equal(2, data.GetProperty("byType").GetProperty("volunteer").GetInt32());
        Assert.Equal(8.5, data.GetProperty("totalHoursPerWeek").GetDouble());
        Assert.Equal(2, data.GetProperty("categories").GetInt32());
        Assert.Equal(2, data.GetProperty("skills").GetArrayLength());
    }

    [Fact]
    public async Task Post_valid_returns_201_and_row_shape()
    {
        var repo = new FakeRepo();
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Post, ListPath, body: """{"title":"Robotics","hoursPerWeek":5.5}""");
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.True(repo.LastCreate!.HasTitle);
        Assert.Equal("Robotics", repo.LastCreate.Title);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = doc.RootElement.GetProperty("data");
        Assert.Equal("item1", data.GetProperty("id").GetString());
        Assert.Equal("5.5", data.GetProperty("hoursPerWeek").GetString()); // Decimal → JSON string
    }

    [Theory]
    [InlineData("""{}""", "Required")]                                  // title required
    [InlineData("""{"title":""}""", "String must contain at least 1 character(s)")]
    [InlineData("[]", "Expected object, received array")]              // array is accepted by express.json → zod 400
    public async Task Post_validation_failures_are_400_with_message(string body, string message)
    {
        using var factory = new Factory(new FakeRepo());
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Post, ListPath, body: body);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(message, doc.RootElement.GetProperty("message").GetString());
    }

    [Theory]
    [InlineData("{\"a\":")]  // malformed
    [InlineData("5")]        // top-level primitive → express.json({strict:true}) rejects pre-route → 500
    [InlineData("\"x\"")]
    [InlineData("true")]
    public async Task Post_malformed_or_primitive_body_is_500(string body)
    {
        using var factory = new Factory(new FakeRepo());
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Post, ListPath, body: body);
        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
    }

    [Fact]
    public async Task Put_not_found_is_404()
    {
        var repo = new FakeRepo { Update = null };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Put, ItemPath, body: """{"title":"x"}""");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Item not found", doc.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task Put_ok_returns_row()
    {
        var repo = new FakeRepo { Update = SampleRow("item1") };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Put, ItemPath, body: """{"title":"x"}""");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("item1", doc.RootElement.GetProperty("data").GetProperty("id").GetString());
    }

    [Fact]
    public async Task Put_validation_failure_is_400()
    {
        using var factory = new Factory(new FakeRepo());
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Put, ItemPath, body: """{"title":5}""");
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Expected string, received number", doc.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task Delete_not_found_is_404()
    {
        var repo = new FakeRepo { Delete = false };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Delete, ItemPath);
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Delete_ok_returns_message()
    {
        var repo = new FakeRepo { Delete = true };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Delete, ItemPath);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Portfolio item deleted successfully", doc.RootElement.GetProperty("message").GetString());
    }

    // ---- helpers ----

    private static PortfolioRow SampleRow(string id)
    {
        using var doc = JsonDocument.Parse("[]");
        return new PortfolioRow(id, "student-1", "activity", "Title", null, null, null, false, null, null,
            "5.5", null, [], [], doc.RootElement.Clone(), "other", null, true, null,
            "2026-01-01T00:00:00.000Z", null, "2026-01-01T00:00:00.000Z");
    }

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
                services.RemoveAll<IStudentPortfolioRepository>();
                services.AddSingleton<IStudentPortfolioRepository>(repo);
            });
        }
    }

    private sealed class FakeRepo : IStudentPortfolioRepository
    {
        public PortfolioPage Page { get; init; } = new([], 0);
        public PortfolioSummary Summary { get; init; } = new(0, new Dictionary<string, int>(), 0, 0, [], 0);
        public PortfolioRow? Update { get; init; } = SampleRow("item1");
        public bool Delete { get; init; } = true;

        public string? LastType { get; private set; }
        public int LastLimit { get; private set; }
        public PortfolioInput? LastCreate { get; private set; }

        public Task<PortfolioPage> ListAsync(
            RequestContext context, string studentId, string? type, int page, int limit,
            CancellationToken cancellationToken = default)
        {
            LastType = type;
            LastLimit = limit;
            return Task.FromResult(Page);
        }

        public Task<PortfolioSummary> GetSummaryAsync(
            RequestContext context, string studentId, CancellationToken cancellationToken = default) =>
            Task.FromResult(Summary);

        public Task<PortfolioRow> CreateAsync(
            RequestContext context, string studentId, PortfolioInput input, CancellationToken cancellationToken = default)
        {
            LastCreate = input;
            return Task.FromResult(SampleRow("item1"));
        }

        public Task<PortfolioRow?> UpdateAsync(
            RequestContext context, string studentId, string itemId, PortfolioInput input,
            CancellationToken cancellationToken = default) => Task.FromResult(Update);

        public Task<bool> SoftDeleteAsync(
            RequestContext context, string studentId, string itemId, CancellationToken cancellationToken = default) =>
            Task.FromResult(Delete);
    }
}
