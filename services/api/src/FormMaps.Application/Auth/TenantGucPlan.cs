namespace FormMaps.Application.Auth;

public enum TenantGucPlanMode
{
    Bypass,
    Deny,
    Identity
}

public sealed record TenantGucPlan(
    TenantGucPlanMode Mode,
    string? SchoolId = null,
    string? UserId = null)
{
    public static TenantGucPlan Bypass()
    {
        return new TenantGucPlan(TenantGucPlanMode.Bypass);
    }

    public static TenantGucPlan Deny()
    {
        return new TenantGucPlan(TenantGucPlanMode.Deny);
    }

    public static TenantGucPlan Identity(string schoolId, string userId)
    {
        return new TenantGucPlan(TenantGucPlanMode.Identity, schoolId, userId);
    }
}
