using FormMaps.Domain.Auth;

namespace FormMaps.Application.Auth;

public sealed record RequestActor(
    string UserId,
    string Role,
    string? Email,
    string? Name)
{
    public string NormalizedRole => FormMapsRoles.Normalize(Role);

    public bool IsSuperAdmin => NormalizedRole == FormMapsRoles.SuperAdmin;
}
