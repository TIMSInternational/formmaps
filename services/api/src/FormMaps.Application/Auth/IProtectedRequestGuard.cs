namespace FormMaps.Application.Auth;

public interface IProtectedRequestGuard
{
    GuardDecision RequireTenantContext(RequestContext context);

    GuardDecision RequireIdentity(RequestContext context);
}
