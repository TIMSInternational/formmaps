using FormMaps.Application.Auth;

namespace FormMaps.Api.Auth;

public static class DevelopmentRequestContextFactory
{
    public const string UserIdHeader = "X-FormMaps-Dev-User-Id";
    public const string RoleHeader = "X-FormMaps-Dev-Role";
    public const string SchoolIdHeader = "X-FormMaps-Dev-School-Id";
    public const string EmailHeader = "X-FormMaps-Dev-Email";
    public const string NameHeader = "X-FormMaps-Dev-Name";
    public const string PermissionsHeader = "X-FormMaps-Dev-Permissions";

    public static bool TryCreate(IHeaderDictionary headers, out RequestContext context)
    {
        var userId = headers[UserIdHeader].ToString();
        var role = headers[RoleHeader].ToString();

        if (string.IsNullOrWhiteSpace(userId) || string.IsNullOrWhiteSpace(role))
        {
            context = RequestContext.Anonymous(TokenSource.None, "development_headers_missing");
            return false;
        }

        var actor = new RequestActor(
            UserId: userId,
            Role: role,
            Email: EmptyToNull(headers[EmailHeader].ToString()),
            Name: EmptyToNull(headers[NameHeader].ToString()));

        context = RequestContext.Authenticated(
            actor,
            EmptyToNull(headers[SchoolIdHeader].ToString()),
            ParsePermissions(headers[PermissionsHeader].ToString()),
            TokenSource.DevelopmentHeader,
            isDevelopmentOverride: true);

        return true;
    }

    private static string? EmptyToNull(string value)
    {
        return string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    }

    private static IReadOnlySet<string> ParsePermissions(string raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return new HashSet<string>(StringComparer.Ordinal);
        }

        return raw.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .ToHashSet(StringComparer.Ordinal);
    }
}
