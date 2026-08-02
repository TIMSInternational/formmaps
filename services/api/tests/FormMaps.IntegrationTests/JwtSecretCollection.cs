namespace FormMaps.IntegrationTests;

/// <summary>
/// Serializes every test class that reads or writes the process-wide <c>JWT_SECRET</c> environment
/// variable. xUnit runs distinct collections in parallel but never two classes within one
/// collection, so membership here is what actually removes the race.
///
/// Why this exists (formmaps#37): <c>StartupEnvironmentValidator.Validate</c> falls back to reading
/// <c>Environment.GetEnvironmentVariable("JWT_SECRET")</c>, and six test classes set that same
/// process-wide variable. With the project's default parallelism they raced, and
/// <c>ApiSecurityUtilityTests.Startup_validation_rejects_missing_jwt_secret_in_production</c> failed
/// intermittently -- it asserts the variable is ABSENT, which any concurrently-running setter breaks.
///
/// Deliberately a bare collection with no <c>ICollectionFixture</c>: the shared resource being
/// guarded is process state, not an object needing construction. Only these classes serialize
/// against each other; the rest of the suite still runs in parallel, unlike a blanket
/// <c>[assembly: CollectionBehavior(DisableTestParallelization = true)]</c>.
///
/// Serialization alone is NOT sufficient -- a class that leaves the variable set leaks into the
/// next class in the collection, and the missing-secret assertion above would still fail. Every
/// member must therefore also restore the prior value, via <see cref="JwtSecretScope"/> or an
/// equivalent try/finally. The long-term fix is moving off process-wide env vars onto an injectable
/// options seam; this closes the race without that refactor.
/// </summary>
[CollectionDefinition(nameof(JwtSecretCollection), DisableParallelization = true)]
public sealed class JwtSecretCollection
{
}

/// <summary>
/// Sets <c>JWT_SECRET</c> for the lifetime of the scope and restores whatever was there before --
/// including restoring "unset" when it was previously unset, which is the case
/// <c>ApiSecurityUtilityTests</c> depends on. Pass <c>null</c> to explicitly unset for the scope.
/// </summary>
public sealed class JwtSecretScope : IDisposable
{
    private const string VariableName = "JWT_SECRET";
    private readonly string? previousValue;

    public JwtSecretScope(string? value)
    {
        previousValue = Environment.GetEnvironmentVariable(VariableName);
        Environment.SetEnvironmentVariable(VariableName, value);
    }

    public void Dispose() => Environment.SetEnvironmentVariable(VariableName, previousValue);
}
