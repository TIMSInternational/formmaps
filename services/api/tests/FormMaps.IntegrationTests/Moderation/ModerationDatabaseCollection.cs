namespace FormMaps.IntegrationTests.Moderation;

/// <summary>
/// One Postgres container for both moderation DB suites. A collection rather than two
/// <c>IClassFixture</c>s: the two classes share seeded tables and TRUNCATE between tests, and xunit runs a
/// collection's classes serially, which is what makes that reset safe.
/// </summary>
[CollectionDefinition(Name)]
public sealed class ModerationDatabaseCollection : ICollectionFixture<ModerationDatabaseFixture>
{
    public const string Name = "moderation-database";
}
