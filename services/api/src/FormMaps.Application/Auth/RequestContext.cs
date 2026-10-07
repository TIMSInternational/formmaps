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
    /// <summary>
    /// Super Admin only: the school opened via the X-Acting-School-Id header, already checked to exist by
    /// RequestContextMiddleware. Null for every other role, whose header is never read. Twin of the Node
    /// <c>req.actingSchoolId</c> (formmaps-platform api/src/lib/actingSchool.ts).
    /// </summary>
    public string? ActingSchoolId { get; init; }

    /// <summary>
    /// The same context acting on <paramref name="schoolId"/>: it becomes the tenant school too, so endpoints that
    /// read <c>Tenant.SchoolId</c> (the JWT claim's slot) act on it as well. Only a Super Admin may act as a school.
    /// </summary>
    public RequestContext WithActingSchool(string schoolId)
    {
        if (Actor?.IsSuperAdmin != true || Tenant is null)
        {
            throw new InvalidOperationException("Only an authenticated Super Admin can act as a school.");
        }

        return this with { ActingSchoolId = schoolId, Tenant = Tenant with { SchoolId = schoolId } };
    }

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
