using System.Net;
using System.Text;
using FormMaps.Infrastructure.Video;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;

namespace FormMaps.UnitTests.Video;

public sealed class DailyClientTests
{
    [Fact]
    public void IsConfigured_reflects_DAILY_API_KEY()
    {
        Assert.True(Client(apiKey: "key-123").IsConfigured);
        Assert.False(Client(apiKey: null).IsConfigured);
        Assert.False(Client(apiKey: "   ").IsConfigured);
    }

    [Fact]
    public async Task EnsureRoomUrl_returns_daily_url_on_success()
    {
        var handler = new FakeHandler(_ => Json("""{"url":"https://formmaps.daily.co/real-room"}"""));
        var client = Client(apiKey: "key", handler);

        Assert.Equal("https://formmaps.daily.co/real-room", await client.EnsureRoomUrlAsync("real-room"));
    }

    [Fact]
    public async Task EnsureRoomUrl_falls_back_on_already_exists_error()
    {
        var handler = new FakeHandler(_ => Json("""{"error":"invalid-request-error","info":"a room with name room-x already exists"}"""));
        var client = Client(apiKey: "key", handler);

        Assert.Equal("https://formmaps.daily.co/room-x", await client.EnsureRoomUrlAsync("room-x"));
    }

    [Fact]
    public async Task EnsureRoomUrl_falls_back_on_transport_failure()
    {
        var handler = new FakeHandler(_ => throw new HttpRequestException("boom"));
        var client = Client(apiKey: "key", handler);

        Assert.Equal("https://formmaps.daily.co/room-x", await client.EnsureRoomUrlAsync("room-x"));
    }

    [Fact]
    public async Task CreateMeetingToken_returns_token_or_null()
    {
        var withToken = Client(apiKey: "key", new FakeHandler(_ => Json("""{"token":"abc123"}""")));
        Assert.Equal("abc123", await withToken.CreateMeetingTokenAsync("room", "u1", "Name", isOwner: true));

        var withoutToken = Client(apiKey: "key", new FakeHandler(_ => Json("""{}""")));
        Assert.Null(await withoutToken.CreateMeetingTokenAsync("room", "u1", "Name", isOwner: true));
    }

    [Fact]
    public async Task CreateMeetingToken_propagates_transport_failure()
    {
        var client = Client(apiKey: "key", new FakeHandler(_ => throw new HttpRequestException("boom")));
        await Assert.ThrowsAsync<HttpRequestException>(() => client.CreateMeetingTokenAsync("room", "u1", "Name", true));
    }

    // ---- helpers ----

    private static DailyClient Client(string? apiKey, FakeHandler? handler = null)
    {
        var httpClient = new HttpClient(handler ?? new FakeHandler(_ => Json("{}"))) { BaseAddress = new Uri("https://api.daily.co/v1/") };
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(apiKey is null ? [] : new Dictionary<string, string?> { ["DAILY_API_KEY"] = apiKey })
            .Build();
        return new DailyClient(httpClient, configuration, TimeProvider.System, NullLogger<DailyClient>.Instance);
    }

    private static HttpResponseMessage Json(string body) =>
        new(HttpStatusCode.OK) { Content = new StringContent(body, Encoding.UTF8, "application/json") };

    private sealed class FakeHandler(Func<HttpRequestMessage, HttpResponseMessage> respond) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) =>
            Task.FromResult(respond(request));
    }
}
