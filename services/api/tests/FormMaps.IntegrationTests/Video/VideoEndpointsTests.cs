// services/api/tests/FormMaps.IntegrationTests/Video/VideoEndpointsTests.cs
using System.Net;
using System.Text;
using System.Text.Json;
using FormMaps.Api.Auth;
using FormMaps.Application.Auth;
using FormMaps.Application.Video;
using FormMaps.Domain.Auth;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;

namespace FormMaps.IntegrationTests.Video;

public class VideoEndpointsTests
{
    [Theory]
    [InlineData("/api/v1/video/enabled", "GET")]
    [InlineData("/api/v1/video/sessions", "GET")]
    [InlineData("/api/v1/video/sessions/s1", "GET")]
    [InlineData("/api/v1/video/signature", "POST")]
    [InlineData("/api/v1/video/sessions", "POST")]
    [InlineData("/api/v1/video/sessions/s1/end", "POST")]
    [InlineData("/api/v1/video/sessions/s1/start", "POST")]
    public async Task Anonymous_is_401(string path, string method)
    {
        using var factory = new Factory(new FakeRepo(), new FakeDaily());
        using var client = factory.CreateClient();
        var response = await client.SendAsync(new HttpRequestMessage(new HttpMethod(method), path));
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Get_session_not_found_then_forbidden_then_ok()
    {
        var repo = new FakeRepo();
        using var factory = new Factory(repo, new FakeDaily());
        using var client = factory.CreateClient();

        Assert.Equal(HttpStatusCode.NotFound, (await Send(client, HttpMethod.Get, "/api/v1/video/sessions/missing")).StatusCode);

        repo.Row = SampleRow("s1", counselorId: "someone-else", studentId: "another");
        Assert.Equal(HttpStatusCode.Forbidden, (await Send(client, HttpMethod.Get, "/api/v1/video/sessions/s1")).StatusCode);

        repo.Row = SampleRow("s1", counselorId: "caller-1", studentId: "another");
        var ok = await Send(client, HttpMethod.Get, "/api/v1/video/sessions/s1");
        Assert.Equal(HttpStatusCode.OK, ok.StatusCode);
        using var doc = JsonDocument.Parse(await ok.Content.ReadAsStringAsync());
        Assert.False(doc.RootElement.GetProperty("data").TryGetProperty("topic", out _)); // detail shape omits topic/notes/completedAt
    }

    [Fact]
    public async Task List_uses_full_row_shape()
    {
        var repo = new FakeRepo { Rows = [SampleRow("s1", "caller-1", "st1")] };
        using var factory = new Factory(repo, new FakeDaily());
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Get, "/api/v1/video/sessions");
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var row = doc.RootElement.GetProperty("data")[0];
        Assert.True(row.TryGetProperty("topic", out _));
        Assert.True(row.TryGetProperty("completedAt", out _));
    }

    [Theory]
    [InlineData(true, true)]
    [InlineData(false, false)]
    public async Task Enabled_reflects_school_flag(bool videoEnabled, bool expected)
    {
        var repo = new FakeRepo { VideoEnabled = videoEnabled };
        using var factory = new Factory(repo, new FakeDaily());
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Get, "/api/v1/video/enabled", role: FormMapsRoles.Counselor, schoolId: "school-1");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(expected, doc.RootElement.GetProperty("data").GetProperty("enabled").GetBoolean());
    }

    [Fact]
    public async Task Signature_returns_503_when_daily_not_configured()
    {
        using var factory = new Factory(new FakeRepo(), new FakeDaily { Configured = false });
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Post, "/api/v1/video/signature", body: """{"sessionName":"room-x","role":0}""");
        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
    }

    [Fact]
    public async Task Signature_returns_502_when_no_token()
    {
        var repo = new FakeRepo { RoomLookup = SampleRow("s1", "caller-1", "st1", meetingLink: "room-x") };
        using var factory = new Factory(repo, new FakeDaily { Configured = true, Token = null });
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Post, "/api/v1/video/signature", body: """{"sessionName":"room-x","role":0}""");
        Assert.Equal(HttpStatusCode.BadGateway, response.StatusCode);
    }

    [Fact]
    public async Task Signature_happy_path()
    {
        var repo = new FakeRepo { RoomLookup = SampleRow("s1", "caller-1", "st1", meetingLink: "room-x") };
        using var factory = new Factory(repo, new FakeDaily { Configured = true, Token = "tok-1", RoomUrl = "https://formmaps.daily.co/room-x" });
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Post, "/api/v1/video/signature", body: """{"sessionName":"room-x","role":0}""");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("tok-1", doc.RootElement.GetProperty("data").GetProperty("signature").GetString());
    }

    [Theory]
    [InlineData("/api/v1/video/signature")]
    [InlineData("/api/v1/video/sessions")]
    public async Task Malformed_json_body_is_400_not_500(string path)
    {
        var repo = new FakeRepo { VideoEnabled = true };
        using var factory = new Factory(repo, new FakeDaily());
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Post, path, body: "{not valid json", role: FormMapsRoles.Counselor, schoolId: "school-1");
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Invalid request body", doc.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task Signature_returns_403_when_video_disabled_before_room_lookup()
    {
        // RoomLookup intentionally left null: a 403 here (rather than the 404 a room-lookup miss would
        // produce) proves the school-enabled check runs BEFORE FindByRoomNameAsync, not after.
        var repo = new FakeRepo { VideoEnabled = false };
        using var factory = new Factory(repo, new FakeDaily());
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Post, "/api/v1/video/signature", body: """{"sessionName":"room-x","role":0}""", role: FormMapsRoles.Counselor, schoolId: "school-1");
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Video calls are not enabled for your school", doc.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task Create_session_returns_403_when_video_disabled_before_participant_lookup()
    {
        // Participant intentionally left null: a 403 here (rather than the 404 a participant-lookup miss
        // would produce) proves the school-enabled check runs BEFORE FindParticipantCandidateAsync.
        var repo = new FakeRepo { VideoEnabled = false };
        using var factory = new Factory(repo, new FakeDaily());
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Post, "/api/v1/video/sessions", body: """{"participantId":"p1"}""", role: FormMapsRoles.Counselor, schoolId: "school-1");
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Video calls are not enabled for your school", doc.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task Create_session_role_gate_is_403_school_mismatch_is_404()
    {
        var repo = new FakeRepo { Participant = new VideoParticipantCandidate("p1", "Peer", "p@x.test", "school-1") };
        using var factory = new Factory(repo, new FakeDaily());
        using var client = factory.CreateClient();

        var studentAttempt = await Send(client, HttpMethod.Post, "/api/v1/video/sessions", body: """{"participantId":"p1"}""", role: FormMapsRoles.Student);
        Assert.Equal(HttpStatusCode.Forbidden, studentAttempt.StatusCode);

        var mismatched = await Send(client, HttpMethod.Post, "/api/v1/video/sessions", body: """{"participantId":"p1"}""", role: FormMapsRoles.Counselor, schoolId: "school-2");
        Assert.Equal(HttpStatusCode.NotFound, mismatched.StatusCode);
    }

    [Fact]
    public async Task Create_session_counselor_requires_active_assignment()
    {
        var repo = new FakeRepo { Participant = new VideoParticipantCandidate("p1", "Peer", "p@x.test", "school-1"), HasAssignment = false };
        using var factory = new Factory(repo, new FakeDaily());
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Post, "/api/v1/video/sessions", body: """{"participantId":"p1"}""", role: FormMapsRoles.Counselor, schoolId: "school-1");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Create_session_happy_path_is_201()
    {
        var repo = new FakeRepo
        {
            Participant = new VideoParticipantCandidate("p1", "Peer", "p@x.test", "school-1"),
            HasAssignment = true,
            Created = new CreatedVideoSession("new-id", "formmaps-abc", "2026-01-01T00:00:00.000Z"),
        };
        using var factory = new Factory(repo, new FakeDaily());
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Post, "/api/v1/video/sessions", body: """{"participantId":"p1"}""", role: FormMapsRoles.Counselor, schoolId: "school-1");
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
    }

    [Theory]
    [InlineData(SessionMutationOutcomeKind.NotFound, HttpStatusCode.NotFound)]
    [InlineData(SessionMutationOutcomeKind.Forbidden, HttpStatusCode.Forbidden)]
    [InlineData(SessionMutationOutcomeKind.Ok, HttpStatusCode.OK)]
    public async Task End_maps_outcome_to_status(SessionMutationOutcomeKind outcome, HttpStatusCode expected)
    {
        var repo = new FakeRepo { EndOutcome = outcome };
        using var factory = new Factory(repo, new FakeDaily());
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Post, "/api/v1/video/sessions/s1/end");
        Assert.Equal(expected, response.StatusCode);
    }

    [Theory]
    [InlineData(SessionMutationOutcomeKind.NotFound, HttpStatusCode.NotFound)]
    [InlineData(SessionMutationOutcomeKind.Forbidden, HttpStatusCode.Forbidden)]
    [InlineData(SessionMutationOutcomeKind.NotScheduled, HttpStatusCode.BadRequest)]
    [InlineData(SessionMutationOutcomeKind.Ok, HttpStatusCode.OK)]
    public async Task Start_maps_outcome_to_status(SessionMutationOutcomeKind outcome, HttpStatusCode expected)
    {
        var repo = new FakeRepo { StartOutcome = (outcome, outcome == SessionMutationOutcomeKind.Ok ? "room-1" : null) };
        using var factory = new Factory(repo, new FakeDaily());
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Post, "/api/v1/video/sessions/s1/start");
        Assert.Equal(expected, response.StatusCode);
    }

    // ---- helpers ----

    private static VideoSessionRow SampleRow(string id, string counselorId, string studentId, string meetingLink = "link") =>
        new(id, meetingLink, "video_active", "Video Call", "", "2026-01-01T00:00:00.000Z", "2026-01-01T01:00:00.000Z",
            null, counselorId, "Coach", "c@x.test", studentId, "Student", "s@x.test");

    private static Task<HttpResponseMessage> Send(
        HttpClient client, HttpMethod method, string path, string? body = null,
        string role = "counselor", string userId = "caller-1", string? schoolId = null)
    {
        var request = new HttpRequestMessage(method, path);
        request.Headers.Add(DevelopmentRequestContextFactory.UserIdHeader, userId);
        request.Headers.Add(DevelopmentRequestContextFactory.RoleHeader, role);
        request.Headers.Add(DevelopmentRequestContextFactory.EmailHeader, "caller@example.test");
        request.Headers.Add(DevelopmentRequestContextFactory.NameHeader, "Caller");
        if (schoolId is not null) request.Headers.Add(DevelopmentRequestContextFactory.SchoolIdHeader, schoolId);
        if (body is not null) request.Content = new StringContent(body, Encoding.UTF8, "application/json");
        return client.SendAsync(request);
    }

    private sealed class Factory(FakeRepo repo, FakeDaily daily) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(Environments.Development);
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<IVideoSessionsRepository>();
                services.AddSingleton<IVideoSessionsRepository>(repo);
                services.RemoveAll<IDailyClient>();
                services.AddSingleton<IDailyClient>(daily);
            });
        }
    }

    private sealed class FakeRepo : IVideoSessionsRepository
    {
        public bool VideoEnabled { get; init; } = true;
        public VideoSessionRow? Row { get; set; }
        public IReadOnlyList<VideoSessionRow> Rows { get; set; } = [];
        public VideoSessionRow? RoomLookup { get; init; }
        public VideoParticipantCandidate? Participant { get; init; }
        public bool HasAssignment { get; init; }
        public CreatedVideoSession Created { get; init; } = new("id", "formmaps-x", "2026-01-01T00:00:00.000Z");
        public SessionMutationOutcomeKind EndOutcome { get; init; } = SessionMutationOutcomeKind.Ok;
        public (SessionMutationOutcomeKind Kind, string? SessionName) StartOutcome { get; init; } = (SessionMutationOutcomeKind.Ok, "room");

        public Task<bool> IsVideoEnabledForSchoolAsync(RequestContext context, string schoolId, CancellationToken ct = default) => Task.FromResult(VideoEnabled);
        public Task<IReadOnlyList<VideoSessionRow>> ListForUserAsync(RequestContext context, string userId, CancellationToken ct = default) => Task.FromResult(Rows);
        public Task<VideoSessionRow?> GetByIdAsync(RequestContext context, string sessionId, CancellationToken ct = default) => Task.FromResult(Row);
        public Task<VideoSessionRow?> FindByRoomNameAsync(RequestContext context, string roomName, CancellationToken ct = default) => Task.FromResult(RoomLookup);
        public Task<VideoParticipantCandidate?> FindParticipantCandidateAsync(RequestContext context, string userId, CancellationToken ct = default) => Task.FromResult(Participant);
        public Task<bool> HasActiveCounselorAssignmentAsync(RequestContext context, string counselorId, string studentId, CancellationToken ct = default) => Task.FromResult(HasAssignment);
        public Task<CreatedVideoSession> CreateAsync(RequestContext context, string counselorId, string studentId, CancellationToken ct = default) => Task.FromResult(Created);
        public Task<SessionMutationOutcomeKind> EndAsync(RequestContext context, string sessionId, string callerId, CancellationToken ct = default) => Task.FromResult(EndOutcome);
        public Task<(SessionMutationOutcomeKind Kind, string? SessionName)> StartAsync(RequestContext context, string sessionId, string callerId, CancellationToken ct = default) => Task.FromResult(StartOutcome);
    }

    private sealed class FakeDaily : IDailyClient
    {
        public bool Configured { get; init; } = true;
        public string? Token { get; init; } = "tok";
        public string RoomUrl { get; init; } = "https://formmaps.daily.co/room";

        public bool IsConfigured => Configured;
        public Task<string> EnsureRoomUrlAsync(string roomName, CancellationToken ct = default) => Task.FromResult(RoomUrl);
        public Task<string?> CreateMeetingTokenAsync(string roomName, string userId, string userName, bool isOwner, CancellationToken ct = default) => Task.FromResult(Token);
    }
}
