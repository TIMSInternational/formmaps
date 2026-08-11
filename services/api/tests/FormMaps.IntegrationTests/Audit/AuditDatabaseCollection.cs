namespace FormMaps.IntegrationTests.Audit;

/// <summary>
/// Shares one Testcontainers Postgres instance (<see cref="AuditDatabaseFixture" />) across every test
/// in the Audit namespace — the writer tests here, the immutability tests, and the reader tests.
/// Separate file rather than a tail on the fixture, matching <c>BillingDatabaseCollection</c>.
/// </summary>
[CollectionDefinition(nameof(AuditDatabaseCollection))]
public sealed class AuditDatabaseCollection : ICollectionFixture<AuditDatabaseFixture>
{
}
