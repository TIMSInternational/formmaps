using System.Text.RegularExpressions;

namespace FormMaps.Api.Security;

public static class RequestLogRedactor
{
    public static string RedactUrl(string rawUrl)
    {
        return Regex.Replace(
            rawUrl,
            "([?&](?:token|access_token|refresh_token)=)[^&]*",
            "$1[REDACTED]",
            RegexOptions.IgnoreCase | RegexOptions.CultureInvariant,
            TimeSpan.FromMilliseconds(100));
    }
}
