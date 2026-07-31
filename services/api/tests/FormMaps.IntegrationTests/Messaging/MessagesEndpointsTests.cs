// services/api/tests/FormMaps.IntegrationTests/Messaging/MessagesEndpointsTests.cs
using System.Net;
using System.Text;
using System.Text.Json;
using FormMaps.Api.Auth;
using FormMaps.Application.Auth;
using FormMaps.Application.Messaging;
using FormMaps.Domain.Auth;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;

namespace FormMaps.IntegrationTests.Messaging;

/// <summary>
/// HTTP-level coverage for MessagesEndpoints (routes/messages.ts, 8 endpoints under /api/v1/messages),
/// mirroring VideoEndpointsTests's style: a WebApplicationFactory&lt;Program&gt; with a swapped-in fake
/// repository, exercised via dev-header identity, asserting status codes and response shapes.
///
/// This file intentionally does NOT re-cover ground already owned elsewhere in Messaging/:
/// - Repository/SQL behaviour (blocking, RLS, preview truncation, outbox rows, ...) lives in the
///   per-endpoint Testcontainers suites (MessagesSendMessageTests, MessagesCreateConversationTests, etc.)
///   against a real Postgres via MessagingDatabaseFixture.
/// - The realtime-ticket endpoint's TTL/expiry/hub-connection behaviour is covered end-to-end by
///   RealtimeTicketEndpointTests; only its identity gate is re-asserted here for parity with the other
///   7 endpoints.
/// - The counselorId/recipientId authorization-routing edge cases are covered by
///   MessagesEndpointAdversarialTests.
/// </summary>
public class MessagesEndpointsTests
{
    [Theory]
    [InlineData("/api/v1/messages/unread-count", "GET")]
    [InlineData("/api/v1/messages/contacts", "GET")]
    [InlineData("/api/v1/messages/conversations", "GET")]
    [InlineData("/api/v1/messages/conversations", "POST")]
    [InlineData("/api/v1/messages/conversations/c1", "GET")]
    [InlineData("/api/v1/messages/conversations/c1", "POST")]
    [InlineData("/api/v1/messages/broadcast", "POST")]
    [InlineData("/api/v1/messages/realtime-ticket", "POST")]
    public async Task Anonymous_is_401(string path, string method)
    {
        using var factory = new Factory(new FakeRepo());
        using var client = factory.CreateClient();
        var response = await client.SendAsync(new HttpRequestMessage(new HttpMethod(method), path));
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Unread_count_returns_the_repository_value()
    {
        var repo = new FakeRepo { UnreadCount = 4 };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Get, "/api/v1/messages/unread-count");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(4, doc.RootElement.GetProperty("data").GetProperty("unreadCount").GetInt32());
        Assert.Equal("caller-1", repo.LastUserId);
    }

    [Fact]
    public async Task Contacts_passes_through_role_school_and_search_query_param()
    {
        var repo = new FakeRepo { Contacts = [new ContactRow("c1", "Coach", "c@x.test", "counselor")] };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Get, "/api/v1/messages/contacts?search=coa", role: FormMapsRoles.Counselor, schoolId: "school-1");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = doc.RootElement.GetProperty("data");
        Assert.Equal(1, data.GetArrayLength());
        Assert.Equal("Coach", data[0].GetProperty("name").GetString());
        Assert.Equal("counselor", repo.LastRole);
        Assert.Equal("school-1", repo.LastSchoolId);
        Assert.Equal("coa", repo.LastSearch);
    }

    [Fact]
    public async Task List_conversations_uses_the_full_row_shape()
    {
        var repo = new FakeRepo
        {
            Conversations = [new ConversationSummary("conv-1", "u2", "Peer", "u2@x.test", "hi", DateTime.Parse("2026-01-01T00:00:00Z"), 2)],
        };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Get, "/api/v1/messages/conversations");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var row = doc.RootElement.GetProperty("data")[0];
        Assert.Equal("conv-1", row.GetProperty("id").GetString());
        Assert.Equal("u2", row.GetProperty("otherParticipant").GetProperty("id").GetString());
        Assert.Equal(2, row.GetProperty("unreadCount").GetInt32());
    }

    [Theory]
    [InlineData("""{"recipientId":"r1"}""")]
    [InlineData("""{"counselorId":"r1"}""")]
    public async Task Create_conversation_accepts_recipientId_or_counselorId_alias(string body)
    {
        var repo = new FakeRepo
        {
            CreateResult = new CreateConversationResult(
                CreateConversationStatus.Created,
                new ConversationSummary("new-conv", "r1", "Peer", "r1@x.test", null, null, 0),
                null),
        };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Post, "/api/v1/messages/conversations", body: body);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.Equal("r1", repo.LastTargetId);
    }

    [Fact]
    public async Task Create_conversation_missing_recipient_id_is_400()
    {
        using var factory = new Factory(new FakeRepo());
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Post, "/api/v1/messages/conversations", body: "{}");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("recipientId is required", doc.RootElement.GetProperty("message").GetString());
    }

    [Theory]
    [InlineData(CreateConversationStatus.Created, HttpStatusCode.Created)]
    [InlineData(CreateConversationStatus.Existing, HttpStatusCode.OK)]
    [InlineData(CreateConversationStatus.Blocked, HttpStatusCode.Forbidden)]
    [InlineData(CreateConversationStatus.Forbidden, HttpStatusCode.Forbidden)]
    [InlineData(CreateConversationStatus.RecipientNotFound, HttpStatusCode.BadRequest)]
    public async Task Create_conversation_maps_status_to_http(CreateConversationStatus status, HttpStatusCode expected)
    {
        var data = status is CreateConversationStatus.Created or CreateConversationStatus.Existing
            ? new ConversationSummary("conv-1", "r1", "Peer", "r1@x.test", null, null, 0)
            : null;
        var repo = new FakeRepo { CreateResult = new CreateConversationResult(status, data, "reason") };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Post, "/api/v1/messages/conversations", body: """{"recipientId":"r1"}""");

        Assert.Equal(expected, response.StatusCode);
    }

    [Fact]
    public async Task Get_conversation_messages_not_found_is_404()
    {
        var repo = new FakeRepo { MessagesResult = new ConversationMessagesResult(ConversationMessagesStatus.NotFound, null) };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Get, "/api/v1/messages/conversations/missing");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Get_conversation_messages_returns_the_paginated_shape()
    {
        var page = new ConversationMessagesPage(
            [new MessageRow("m1", "conv-1", "u2", "Peer", "hello", DateTime.Parse("2026-01-01T00:01:00Z"), DateTime.Parse("2026-01-01T00:00:00Z"))],
            Total: 1, Page: 1, Limit: 50, TotalPages: 1);
        var repo = new FakeRepo { MessagesResult = new ConversationMessagesResult(ConversationMessagesStatus.Ok, page) };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Get, "/api/v1/messages/conversations/conv-1");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = doc.RootElement.GetProperty("data");
        Assert.Equal(1, data.GetProperty("total").GetInt32());
        var message = data.GetProperty("data")[0];
        Assert.Equal("m1", message.GetProperty("id").GetString());
        Assert.Equal("hello", message.GetProperty("content").GetString());
        Assert.True(message.TryGetProperty("readAt", out _));
    }

    [Fact]
    public async Task Get_conversation_messages_clamps_page_and_limit()
    {
        var page = new ConversationMessagesPage([], Total: 0, Page: 1, Limit: 100, TotalPages: 0);
        var repo = new FakeRepo { MessagesResult = new ConversationMessagesResult(ConversationMessagesStatus.Ok, page) };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Get, "/api/v1/messages/conversations/conv-1?page=0&limit=99999");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(1, repo.LastPage);
        Assert.Equal(100, repo.LastLimit);
    }

    [Fact]
    public async Task Send_message_empty_content_is_400()
    {
        using var factory = new Factory(new FakeRepo());
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Post, "/api/v1/messages/conversations/conv-1", body: """{"content":""}""");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Send_message_over_5000_characters_is_400()
    {
        using var factory = new Factory(new FakeRepo());
        using var client = factory.CreateClient();

        var body = JsonSerializer.Serialize(new { content = new string('x', 5001) });
        var response = await Send(client, HttpMethod.Post, "/api/v1/messages/conversations/conv-1", body: body);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Send_message_not_found_is_404()
    {
        var repo = new FakeRepo { SendResult = new SendMessageResult(SendMessageStatus.NotFound, null, null, null, null, null) };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Post, "/api/v1/messages/conversations/missing", body: """{"content":"hi"}""");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Send_message_blocked_is_403()
    {
        var repo = new FakeRepo { SendResult = new SendMessageResult(SendMessageStatus.Blocked, null, null, null, null, null) };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Post, "/api/v1/messages/conversations/conv-1", body: """{"content":"hi"}""");

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("You cannot message this user", doc.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task Send_message_happy_path_is_201_with_the_message_shape()
    {
        var message = new MessageRow("m1", "conv-1", "caller-1", "Caller", "hello there", null, DateTime.Parse("2026-01-01T00:00:00Z"));
        var repo = new FakeRepo
        {
            SendResult = new SendMessageResult(SendMessageStatus.Sent, message, "u2", "u2@x.test", "Caller", "hello there"),
        };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Post, "/api/v1/messages/conversations/conv-1", body: """{"content":"hello there"}""");

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = doc.RootElement.GetProperty("data");
        Assert.Equal("m1", data.GetProperty("id").GetString());
        Assert.Equal("hello there", data.GetProperty("content").GetString());
        Assert.Equal("caller-1", repo.LastUserId);
        Assert.Equal("conv-1", repo.LastConversationId);
        Assert.Equal("hello there", repo.LastContent);
    }

    [Fact]
    public async Task Broadcast_rejects_roles_outside_the_allow_list()
    {
        using var factory = new Factory(new FakeRepo());
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Post, "/api/v1/messages/broadcast",
            body: """{"recipientGroup":"students","content":"hi all"}""", role: FormMapsRoles.Student, schoolId: "school-1");

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Only school admins and counselors can broadcast", doc.RootElement.GetProperty("message").GetString());
    }

    [Theory]
    [InlineData("""{"recipientGroup":"not-a-group","content":"hi"}""")]
    [InlineData("""{"recipientGroup":"students","content":""}""")]
    [InlineData("""{}""")]
    public async Task Broadcast_invalid_body_is_400(string body)
    {
        using var factory = new Factory(new FakeRepo());
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Post, "/api/v1/messages/broadcast",
            body: body, role: FormMapsRoles.Counselor, schoolId: "school-1");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Broadcast_without_a_school_is_400_even_for_an_allowed_role()
    {
        using var factory = new Factory(new FakeRepo());
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Post, "/api/v1/messages/broadcast",
            body: """{"recipientGroup":"students","content":"hi all"}""", role: FormMapsRoles.Counselor, schoolId: null);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("No school linked", doc.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task Broadcast_happy_path_is_200_with_the_recipient_count()
    {
        var repo = new FakeRepo { BroadcastCount = 12 };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Post, "/api/v1/messages/broadcast",
            body: """{"recipientGroup":"students","content":"hi all"}""", role: FormMapsRoles.Counselor, schoolId: "school-1");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(12, doc.RootElement.GetProperty("data").GetProperty("recipientCount").GetInt32());
        Assert.Equal("students", repo.LastRecipientGroup);
        Assert.Equal("school-1", repo.LastSchoolId);
        Assert.Equal("counselor", repo.LastRole);
    }

    // Unlike Video/most other domains, Messages does not hand-parse the body via JsonDocument -- it binds
    // CreateConversationRequest/SendMessageRequest/BroadcastRequest straight off minimal API's implicit
    // JSON parameter. On a malformed or shape-mismatched body that binder itself 400s before the handler
    // (and therefore before guard.RequireIdentity/the repository) run -- confirmed by capturing the raw
    // response: Microsoft.AspNetCore.Http.BadHttpRequestException, never a 500. The response body in that
    // path is a framework diagnostic dump rather than the house `{"message": ...}` shape other domains'
    // hand-rolled parsing produces, so only the status code is asserted here.
    [Theory]
    [InlineData("/api/v1/messages/conversations")]
    [InlineData("/api/v1/messages/conversations/conv-1")]
    [InlineData("/api/v1/messages/broadcast")]
    public async Task Malformed_json_body_is_400_not_500(string path)
    {
        using var factory = new Factory(new FakeRepo());
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Post, path, body: "{not valid json", role: FormMapsRoles.Counselor, schoolId: "school-1");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Theory]
    [InlineData("/api/v1/messages/conversations")]
    [InlineData("/api/v1/messages/conversations/conv-1")]
    [InlineData("/api/v1/messages/broadcast")]
    public async Task Array_json_body_is_400_not_500(string path)
    {
        using var factory = new Factory(new FakeRepo());
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Post, path, body: "[]", role: FormMapsRoles.Counselor, schoolId: "school-1");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    // ---- helpers ----

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

    private sealed class Factory(IMessagesRepository repository) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(Environments.Development);
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<IMessagesRepository>();
                services.AddSingleton(repository);
            });
        }
    }

    private sealed class FakeRepo : IMessagesRepository
    {
        public int UnreadCount { get; init; }
        public IReadOnlyList<ContactRow> Contacts { get; init; } = [];
        public IReadOnlyList<ConversationSummary> Conversations { get; init; } = [];
        public CreateConversationResult CreateResult { get; init; } =
            new(CreateConversationStatus.Created, new ConversationSummary("id", "other", null, "o@x.test", null, null, 0), null);
        public ConversationMessagesResult MessagesResult { get; init; } =
            new(ConversationMessagesStatus.Ok, new ConversationMessagesPage([], 0, 1, 50, 0));
        public SendMessageResult SendResult { get; init; } =
            new(SendMessageStatus.Sent, new MessageRow("id", "conv", "caller-1", "Caller", "hi", null, DateTime.UtcNow), "other", "o@x.test", "Caller", "hi");
        public int BroadcastCount { get; init; }

        public string? LastUserId { get; private set; }
        public string? LastRole { get; private set; }
        public string? LastSchoolId { get; private set; }
        public string? LastSearch { get; private set; }
        public string? LastTargetId { get; private set; }
        public string? LastConversationId { get; private set; }
        public string? LastContent { get; private set; }
        public string? LastRecipientGroup { get; private set; }
        public int LastPage { get; private set; }
        public int LastLimit { get; private set; }

        public Task<int> GetUnreadCountAsync(RequestContext context, string userId, CancellationToken cancellationToken = default)
        {
            LastUserId = userId;
            return Task.FromResult(UnreadCount);
        }

        public Task<IReadOnlyList<ContactRow>> GetContactsAsync(
            RequestContext context, string userId, string role, string? schoolId, string? search,
            CancellationToken cancellationToken = default)
        {
            (LastUserId, LastRole, LastSchoolId, LastSearch) = (userId, role, schoolId, search);
            return Task.FromResult(Contacts);
        }

        public Task<IReadOnlyList<ConversationSummary>> ListConversationsAsync(
            RequestContext context, string userId, CancellationToken cancellationToken = default)
        {
            LastUserId = userId;
            return Task.FromResult(Conversations);
        }

        public Task<CreateConversationResult> CreateConversationAsync(
            RequestContext context, string userId, string role, string? schoolId, string targetId,
            CancellationToken cancellationToken = default)
        {
            (LastUserId, LastRole, LastSchoolId, LastTargetId) = (userId, role, schoolId, targetId);
            return Task.FromResult(CreateResult);
        }

        public Task<ConversationMessagesResult> GetConversationMessagesAsync(
            RequestContext context, string userId, string conversationId, int page, int limit,
            CancellationToken cancellationToken = default)
        {
            (LastUserId, LastConversationId, LastPage, LastLimit) = (userId, conversationId, page, limit);
            return Task.FromResult(MessagesResult);
        }

        public Task<SendMessageResult> SendMessageAsync(
            RequestContext context, string userId, string conversationId, string content,
            CancellationToken cancellationToken = default)
        {
            (LastUserId, LastConversationId, LastContent) = (userId, conversationId, content);
            return Task.FromResult(SendResult);
        }

        public Task<int> BroadcastAsync(
            RequestContext context, string userId, string role, string schoolId, string recipientGroup, string content,
            CancellationToken cancellationToken = default)
        {
            (LastUserId, LastRole, LastSchoolId, LastRecipientGroup, LastContent) = (userId, role, schoolId, recipientGroup, content);
            return Task.FromResult(BroadcastCount);
        }
    }
}
