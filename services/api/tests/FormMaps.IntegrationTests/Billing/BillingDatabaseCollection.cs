using Xunit;

namespace FormMaps.IntegrationTests.Billing;

/// <summary>
/// Shares one Testcontainers Postgres instance (BillingDatabaseFixture) across all tests in the
/// collection — needed for BillingWebhookEndpointTests, which takes the fixture via constructor
/// injection (xunit requires membership in a declared collection for that, not just IClassFixture).
/// </summary>
[CollectionDefinition(nameof(BillingDatabaseCollection))]
public sealed class BillingDatabaseCollection : ICollectionFixture<BillingDatabaseFixture>
{
}
