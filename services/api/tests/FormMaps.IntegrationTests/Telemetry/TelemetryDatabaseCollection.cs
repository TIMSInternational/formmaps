namespace FormMaps.IntegrationTests.Telemetry;

/// <summary>
/// One Postgres container for both telemetry DB suites. A collection rather than two
/// <c>IClassFixture</c>s: the two classes share the same two tables and TRUNCATE between tests, and
/// xunit runs a collection's classes serially, which is what makes that reset safe.
/// </summary>
[CollectionDefinition(Name)]
public sealed class TelemetryDatabaseCollection : ICollectionFixture<TelemetryDatabaseFixture>
{
    public const string Name = "telemetry-database";
}
