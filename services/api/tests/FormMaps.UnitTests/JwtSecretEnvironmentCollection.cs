namespace FormMaps.UnitTests;

/// <summary>
/// Serializes every unit-test class that MUTATES the process-wide JWT_SECRET environment variable
/// (xUnit runs different collections in parallel, and Environment.SetEnvironmentVariable is
/// process-global — two such classes interleaving can make either read the other's value mid-test).
/// Same problem the integration suite already guards with its own JwtSecretCollection. Apply
/// <c>[Collection(JwtSecretEnvironmentCollection.Name)]</c> to any class that sets JWT_SECRET.
/// </summary>
[CollectionDefinition(Name)]
public sealed class JwtSecretEnvironmentCollection
{
    public const string Name = "jwt-secret-environment";
}
