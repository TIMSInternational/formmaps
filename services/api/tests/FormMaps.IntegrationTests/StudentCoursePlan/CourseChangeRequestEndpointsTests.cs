using System.Net;
using System.Text;
using System.Text.Json;
using FormMaps.Api.Auth;
using FormMaps.Application.Auth;
using FormMaps.Application.StudentCoursePlan;
using FormMaps.Domain.Auth;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;

namespace FormMaps.IntegrationTests.StudentCoursePlan;

/// <summary>
/// Guard + result mapping for the student course change-requests CRUD (FM-DOTNET-085; repo faked). Pins: anonymous →
/// 401; POST 201 + data / 400 NoSchool / 500 InvalidBody / 500 malformed-or-primitive; GET { data, total, page, limit,
/// totalPages } envelope + the no-school { data:[], total:0, totalPages:0 } shape; DELETE 400 NoSchool / 400 "Cannot
/// cancel" / 200.
/// </summary>
public class CourseChangeRequestEndpointsTests
{
    private const string ListPath = "/api/v1/student/course-plan/change-requests";
    private const string ItemPath = "/api/v1/student/course-plan/change-requests/cr1";

    [Theory]
    [InlineData(ListPath, "POST")]
    [InlineData(ListPath, "GET")]
    [InlineData(ItemPath, "DELETE")]
    public async Task Anonymous_is_401(string path, string method)
    {
        using var factory = new Factory(new FakeRepo());
        using var client = factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await client.SendAsync(new HttpRequestMessage(new HttpMethod(method), path))).StatusCode);
    }

    [Fact]
    public async Task Post_created_is_201_with_row()
    {
        var repo = new FakeRepo { Create = new CreateChangeRequestOutcome(CreateChangeRequestStatus.Created, SampleRow("cr1")) };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Post, ListPath, body: """{"courseId":"c1","action":"add"}""");
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("cr1", doc.RootElement.GetProperty("data").GetProperty("id").GetString());
        Assert.Equal("0", doc.RootElement.GetProperty("data").GetProperty("credits").GetString()); // decimal string
    }

    [Fact]
    public async Task Post_no_school_is_400_message()
    {
        var repo = new FakeRepo { Create = new CreateChangeRequestOutcome(CreateChangeRequestStatus.NoSchool, null) };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Post, ListPath, body: """{"courseId":"c1","action":"add"}""");
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("You are not affiliated with a school", doc.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task Post_invalid_body_is_500()
    {
        var repo = new FakeRepo { Create = new CreateChangeRequestOutcome(CreateChangeRequestStatus.InvalidBody, null) };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Post, ListPath, body: """{"action":"add"}""");
        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
    }

    [Theory]
    [InlineData("{\"a\":")] // malformed
    [InlineData("5")]        // primitive
    public async Task Post_malformed_or_primitive_is_500(string body)
    {
        using var factory = new Factory(new FakeRepo { Create = new CreateChangeRequestOutcome(CreateChangeRequestStatus.Created, SampleRow("cr1")) });
        using var client = factory.CreateClient();
        Assert.Equal(HttpStatusCode.InternalServerError, (await Send(client, HttpMethod.Post, ListPath, body: body)).StatusCode);
    }

    [Fact]
    public async Task Get_envelope_shape()
    {
        var repo = new FakeRepo { View = new ChangeRequestsView(true, [SampleRow("cr1"), SampleRow("cr2")], 5) };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Get, ListPath + "?page=1&limit=2");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = doc.RootElement.GetProperty("data");
        Assert.Equal(2, data.GetProperty("data").GetArrayLength());
        Assert.Equal(5, data.GetProperty("total").GetInt32());
        Assert.Equal(1, data.GetProperty("page").GetInt32());
        Assert.Equal(2, data.GetProperty("limit").GetInt32());
        Assert.Equal(3, data.GetProperty("totalPages").GetInt32()); // ceil(5/2)
    }

    [Fact]
    public async Task Get_clamps_page_and_limit_in_echoed_envelope()
    {
        // page=0 → max(1, falsyOr(0,1)) = 1; limit=999 → min(50, max(1,999)) = 50 (the 50-cap, not the shared 100).
        var repo = new FakeRepo { View = new ChangeRequestsView(true, [], 0) };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Get, ListPath + "?page=0&limit=999");
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = doc.RootElement.GetProperty("data");
        Assert.Equal(1, data.GetProperty("page").GetInt32());
        Assert.Equal(50, data.GetProperty("limit").GetInt32());
    }

    [Fact]
    public async Task Get_no_school_empty_envelope()
    {
        var repo = new FakeRepo { View = new ChangeRequestsView(false, [], 0) };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Get, ListPath);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = doc.RootElement.GetProperty("data");
        Assert.Equal(0, data.GetProperty("data").GetArrayLength());
        Assert.Equal(0, data.GetProperty("total").GetInt32());
        Assert.Equal(0, data.GetProperty("totalPages").GetInt32());
    }

    [Fact]
    public async Task Delete_no_school_is_400()
    {
        var repo = new FakeRepo { Delete = DeleteChangeRequestStatus.NoSchool };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Delete, ItemPath);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("You are not affiliated with a school", doc.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task Delete_cannot_cancel_is_400_message()
    {
        var repo = new FakeRepo { Delete = DeleteChangeRequestStatus.CannotCancel };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Delete, ItemPath);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Cannot cancel", doc.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task Delete_ok_is_200()
    {
        var repo = new FakeRepo { Delete = DeleteChangeRequestStatus.Cancelled };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Delete, ItemPath);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.True(doc.RootElement.GetProperty("success").GetBoolean());
    }

    // ---- helpers ----

    private static CourseChangeRequestRow SampleRow(string id) => new(
        id, "student-1", "school-1", "c1", null, null, "0", 9, null, "add", null, null, "pending",
        null, null, null, true, null, "2026-01-01T00:00:00.000Z", null, "2026-01-01T00:00:00.000Z");

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
                services.RemoveAll<ICourseChangeRequestRepository>();
                services.AddSingleton<ICourseChangeRequestRepository>(repo);
            });
        }
    }

    private sealed class FakeRepo : ICourseChangeRequestRepository
    {
        public CreateChangeRequestOutcome Create { get; init; } = new(CreateChangeRequestStatus.Created, SampleRow("cr1"));
        public ChangeRequestsView View { get; init; } = new(true, [], 0);
        public DeleteChangeRequestStatus Delete { get; init; } = DeleteChangeRequestStatus.Cancelled;

        public Task<CreateChangeRequestOutcome> CreateAsync(RequestContext context, string studentId, JsonElement body, CancellationToken ct = default) =>
            Task.FromResult(Create);

        public Task<ChangeRequestsView> ListAsync(RequestContext context, string studentId, string? status, int page, int limit, CancellationToken ct = default) =>
            Task.FromResult(View);

        public Task<DeleteChangeRequestStatus> DeleteAsync(RequestContext context, string studentId, string requestId, CancellationToken ct = default) =>
            Task.FromResult(Delete);
    }
}
