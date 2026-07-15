namespace FormMaps.Application.Auth;

public static class TenantGucPlanResolver
{
    public static TenantGucPlan Resolve(RequestContext? context, bool allowMissingContextBypass = false)
    {
        if (context is null)
        {
            return allowMissingContextBypass ? TenantGucPlan.Bypass() : TenantGucPlan.Deny();
        }

        if (context.IsSystem || context.Actor?.IsSuperAdmin == true)
        {
            return TenantGucPlan.Bypass();
        }

        if (!string.IsNullOrWhiteSpace(context.Tenant?.UserId))
        {
            return TenantGucPlan.Identity(context.Tenant.SchoolId ?? string.Empty, context.Tenant.UserId);
        }

        return TenantGucPlan.Deny();
    }
}
