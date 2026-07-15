using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace FormMaps.Api.Security;

public static class JsonBodySanitizer
{
    private static readonly HashSet<string> SkipKeys = new(StringComparer.OrdinalIgnoreCase)
    {
        "password",
        "newPassword",
        "oldPassword",
        "currentPassword",
        "token",
        "refreshToken",
        "invitationToken",
        "secret",
        "webhookSecret",
        "apiKey"
    };

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public static string SanitizeJson(string json)
    {
        var node = JsonNode.Parse(json);
        if (node is null)
        {
            return json;
        }

        SanitizeNode(node, key: null);
        return node.ToJsonString(JsonOptions);
    }

    private static void SanitizeNode(JsonNode node, string? key)
    {
        switch (node)
        {
            case JsonObject jsonObject:
                foreach (var property in jsonObject.ToArray())
                {
                    if (property.Value is not null)
                    {
                        SanitizeNode(property.Value, property.Key);
                    }
                }

                break;
            case JsonArray jsonArray:
                foreach (var item in jsonArray)
                {
                    if (item is not null)
                    {
                        SanitizeNode(item, key: null);
                    }
                }

                break;
            case JsonValue jsonValue when !ShouldSkip(key) &&
                jsonValue.TryGetValue<string>(out var stringValue):
                jsonValue.ReplaceWith(StripHtml(stringValue));
                break;
        }
    }

    private static bool ShouldSkip(string? key)
    {
        return key is not null && SkipKeys.Contains(key);
    }

    private static string StripHtml(string value)
    {
        return Regex.Replace(
            value,
            "<[^>]*>",
            string.Empty,
            RegexOptions.CultureInvariant,
            TimeSpan.FromMilliseconds(100));
    }
}
