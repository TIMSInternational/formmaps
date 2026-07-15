namespace FormMaps.Application.Auth;

public sealed record TenantScope(
    string UserId,
    string? SchoolId,
    bool IsSuperAdmin);
