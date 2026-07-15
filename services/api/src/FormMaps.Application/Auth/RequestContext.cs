namespace FormMaps.Application.Auth;

public sealed record RequestContext(
    bool IsAuthenticated,
    RequestActor? Actor,
    TenantScope? Tenant,
    IReadOnlySet<string> Permissions,
    TokenSource TokenSource,
    bool IsDevelopmentOverride,
    string? FailureReason,
    bool IsSystem)
{
    public static RequestContext Anonymous(TokenSource tokenSource = TokenSource.None, string? failureReason = null)
    {
        return new RequestContext(
            IsAuthenticated: false,
            Actor: null,
            Tenant: null,
            Permissions: new HashSet<string>(StringComparer.Ordinal),
            TokenSource: tokenSource,
            IsDevelopmentOverride: false,
            FailureReason: failureReason,
            IsSystem: false);
    }

    public static RequestContext System()
    {
        return new RequestContext(
            IsAuthenticated: false,
            Actor: null,
            Tenant: null,
            Permissions: new HashSet<string>(StringComparer.Ordinal),
            TokenSource: TokenSource.None,
            IsDevelopmentOverride: false,
            FailureReason: null,
            IsSystem: true);
    }

    public static RequestContext Authenticated(
        RequestActor actor,
        string? schoolId,
        IEnumerable<string> permissions,
        TokenSource tokenSource,
        bool isDevelopmentOverride)
    {
        var tenant = new TenantScope(actor.UserId, schoolId, actor.IsSuperAdmin);

        return new RequestContext(
            IsAuthenticated: true,
            Actor: actor,
            Tenant: tenant,
            Permissions: permissions.ToHashSet(StringComparer.Ordinal),
            TokenSource: tokenSource,
            IsDevelopmentOverride: isDevelopmentOverride,
            FailureReason: null,
            IsSystem: false);
    }
}
