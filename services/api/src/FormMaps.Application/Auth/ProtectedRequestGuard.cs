using FormMaps.Domain.Auth;

namespace FormMaps.Application.Auth;

public sealed class ProtectedRequestGuard : IProtectedRequestGuard
{
    public GuardDecision RequireTenantContext(RequestContext context)
    {
        if (!context.IsAuthenticated || context.Actor is null)
        {
            return GuardDecision.Deny(401, "missing_identity", "Authenticated identity is required.");
        }

        if (context.Tenant is null || string.IsNullOrWhiteSpace(context.Tenant.UserId))
        {
            return GuardDecision.Deny(403, "missing_tenant_context", "Tenant context is required.");
        }

        if (!context.Actor.IsSuperAdmin &&
            FormMapsRoles.RequiresSchoolContext(context.Actor.Role) &&
            string.IsNullOrWhiteSpace(context.Tenant.SchoolId))
        {
            return GuardDecision.Deny(403, "missing_school_context", "School-scoped roles require school context.");
        }

        return GuardDecision.Allow();
    }
}
