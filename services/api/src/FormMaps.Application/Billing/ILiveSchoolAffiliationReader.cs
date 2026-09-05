using FormMaps.Application.Auth;

namespace FormMaps.Application.Billing;

/// <summary>
/// Wave 3 billing-subscription-parity (formmaps#108 comment). Reads the LIVE users."schoolId" column
/// for a single user under the caller's own tenant-scoped RLS session -- the same convention as
/// <see cref="ILiveCustomerReader"/> and <see cref="ILiveSubscriptionReader"/>, NOT
/// RequestContext.System(). GET /status needs it because legacy api/src/routes/user.ts:304-311 does
/// <c>prisma.user.findUnique({ where: { id: req.userId }, select: { schoolId: true } })</c> and
/// short-circuits ANY school-affiliated user to <c>hasActiveSubscription: true</c> before reading
/// user_subscriptions at all. Deliberately a live DB lookup rather than RequestContext.Tenant.SchoolId
/// off the JWT, because that is what legacy does here (same reasoning as
/// IAuthAdminRepository.GetUserSchoolIdAsync and SubscriptionGuard's own users read). Returns null when
/// the users row has no schoolId or does not exist -- both fall through to the subscription read, exactly
/// as legacy's <c>user?.schoolId</c> does. Read-only: Node owns all writes to users until cutover.
/// </summary>
public interface ILiveSchoolAffiliationReader
{
    Task<string?> GetSchoolIdAsync(RequestContext context, string userId, CancellationToken cancellationToken = default);
}
