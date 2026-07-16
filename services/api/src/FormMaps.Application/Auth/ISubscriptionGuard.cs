namespace FormMaps.Application.Auth;

/// <summary>
/// Reproduces the legacy <c>requireSubscription</c> middleware. Runs AFTER RequireIdentity: reads
/// the caller's OWN roleName + schoolId from the DB (NOT the JWT), lets every non-student and every
/// school-affiliated student through, and gates only school-less individual students on an
/// access-granting subscription (see <see cref="SubscriptionAccess"/>).
/// </summary>
public interface ISubscriptionGuard
{
    Task<GuardDecision> RequireSubscriptionAsync(
        RequestContext context,
        CancellationToken cancellationToken = default);
}
