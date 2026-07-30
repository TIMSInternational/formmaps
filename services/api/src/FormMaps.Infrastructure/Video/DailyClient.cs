using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using FormMaps.Application.Video;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace FormMaps.Infrastructure.Video;

public sealed class DailyClient(
    HttpClient httpClient, IConfiguration configuration, TimeProvider timeProvider, ILogger<DailyClient> logger)
    : IDailyClient
{
    private string? ApiKey => configuration["DAILY_API_KEY"];

    public bool IsConfigured => !string.IsNullOrWhiteSpace(ApiKey);

    public async Task<string> EnsureRoomUrlAsync(string roomName, CancellationToken cancellationToken = default)
    {
        var fallbackUrl = $"https://formmaps.daily.co/{roomName}";
        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Post, "rooms/")
            {
                Content = JsonContent.Create(new
                {
                    name = roomName,
                    privacy = "private",
                    properties = new
                    {
                        exp = timeProvider.GetUtcNow().ToUnixTimeSeconds() + 7200,
                        enable_chat = true,
                        enable_screenshare = true,
                        start_audio_off = false,
                        start_video_off = false,
                        max_participants = 10,
                    },
                }),
            };
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", ApiKey);

            using var response = await httpClient.SendAsync(request, cancellationToken);
            var payload = await response.Content.ReadFromJsonAsync<JsonElement>(cancellationToken: cancellationToken);

            if (payload.TryGetProperty("error", out _)
                && payload.TryGetProperty("info", out var info)
                && info.ValueKind == JsonValueKind.String
                && (info.GetString() ?? string.Empty).Contains("already exists", StringComparison.Ordinal))
            {
                return fallbackUrl;
            }

            return payload.TryGetProperty("url", out var url) && url.ValueKind == JsonValueKind.String
                ? url.GetString()!
                : fallbackUrl;
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or JsonException)
        {
            logger.LogWarning(ex, "Daily.co room creation failed for {RoomName}; falling back to deterministic URL", roomName);
            return fallbackUrl;
        }
    }

    public async Task<string?> CreateMeetingTokenAsync(
        string roomName, string userId, string userName, bool isOwner, CancellationToken cancellationToken = default)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, "meeting-tokens")
        {
            Content = JsonContent.Create(new
            {
                properties = new
                {
                    room_name = roomName,
                    user_name = userName,
                    user_id = userId,
                    is_owner = isOwner,
                    exp = timeProvider.GetUtcNow().ToUnixTimeSeconds() + 7200,
                },
            }),
        };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", ApiKey);

        using var response = await httpClient.SendAsync(request, cancellationToken); // deliberately unguarded
        var payload = await response.Content.ReadFromJsonAsync<JsonElement>(cancellationToken: cancellationToken);
        return payload.TryGetProperty("token", out var token) && token.ValueKind == JsonValueKind.String
            ? token.GetString()
            : null;
    }
}
