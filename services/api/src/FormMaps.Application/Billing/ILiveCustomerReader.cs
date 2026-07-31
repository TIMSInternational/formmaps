using FormMaps.Application.Auth;

namespace FormMaps.Application.Billing;

/// <summary>
/// Domain 9a Task 8 fix round 1. Reads the LIVE users."stripeCustomerId" column for a single user under
/// the caller's own tenant-scoped RLS session (mirrors ILiveSubscriptionReader -- NOT
/// RequestContext.System(), since this is a user-facing read of legacy Node-owned data, not .NET-internal
/// shadow-table data). Confirmed real column: legacy Node's Prisma schema (formmaps-platform
/// api/prisma/schema.prisma) declares <c>User.stripeCustomerId String? @unique</c> on the <c>users</c>
/// table (see @@map("users")), and api/src/services/stripeService.ts's own getOrCreateCustomer reads this
/// exact column before ever calling Stripe's CustomerService.CreateAsync. Read-only: Node still owns all
/// writes to users until cutover -- see IStripeGateway.GetOrCreateCustomerAsync's doc comment for the
/// resulting limitation on newly-created customer ids.
/// </summary>
public interface ILiveCustomerReader
{
    Task<string?> GetStripeCustomerIdAsync(RequestContext context, string userId, CancellationToken cancellationToken = default);
}
