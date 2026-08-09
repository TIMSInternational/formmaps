using System.Reflection;
using System.Text.Json;

namespace FormMaps.IntegrationTests.TestSupport;

/// <summary>
/// Locks in the two parallelism decisions issue #36 arrived at, so neither can be undone by accident
/// (issue #36, Phase 0 follow-up).
///
/// <para>
/// WHY THIS EXISTS. #36 was filed as "the integration suite hangs". It does not hang -- a monitored
/// full-project run makes continuous forward progress from first test to last. What it does is get
/// SLOWER as it goes, because the suite builds one full ASP.NET Core host per test across ~2,400
/// tests and per-host resources accumulate in a single process. Two things make that read as a hang:
/// a quiet logger prints nothing until the final summary, and
/// <c>RealtimeTicketEndpointTests.Ticket_effective_hub_window_is_bounded_at_about_60_seconds_including_clock_skew</c>
/// deliberately sleeps ~65 seconds of wall clock, producing a genuine ~70-second window of dead air.
/// </para>
///
/// <para>
/// THE TRAP THIS BLOCKS. The intuitive response to "it hangs" is
/// <c>[assembly: CollectionBehavior(DisableTestParallelization = true)]</c> -- serialize everything
/// and see if the deadlock goes away. That is wrong twice over. It is wrong as a FIX: measured
/// back-to-back on the 121-test #36 lab set, serialized ran 2.03x SLOWER than parallel, with 121/121
/// passing both ways. Roughly doubling suite wall clock breaks the 75-minute job cap and every
/// 30-minute shard cap in .github/workflows/formmaps-api-ci.yml. (Only the RATIO is quoted on
/// purpose: those runs were taken on a loaded machine, and per
/// services/api/scripts/measure-integration-suite.sh no absolute second-count from a loaded box is
/// certifiable. The A/B ran back to back under comparable load, so the ratio survives what the raw
/// numbers do not.) And it is wrong as a DIAGNOSTIC: the failure mode is not a
/// nondeterministic deadlock that serialization would expose, it is monotonic per-host retention in
/// one process. Serializing builds exactly the same ~2,400 hosts and retains exactly as much, just
/// sequentially. So it costs an hour of CI to prove nothing.
/// </para>
///
/// <para>
/// THE NARROW SERIALIZATION THAT MUST SURVIVE. <see cref="JwtSecretCollection"/> is a different
/// thing entirely and is load-bearing: it serializes only the handful of classes that read or write
/// the process-wide <c>JWT_SECRET</c> environment variable, which is what actually fixed the
/// intermittent failure in formmaps#37. A well-meaning "we decided against disabling parallelization"
/// cleanup that strips that attribute too would reopen #37. Hence the second test below -- this class
/// guards the boundary in BOTH directions: blanket serialization must not appear, and the narrow
/// serialization must not disappear.
/// </para>
///
/// <para>
/// These are declarative checks over attributes and runner config rather than a timing test on
/// purpose. A timing assertion would be flaky on a loaded machine, and load contamination is exactly
/// what corrupted the earlier rounds of #36 analysis -- see services/api/scripts/measure-integration-suite.sh,
/// which refuses to certify a number at all when the box is busy.
/// </para>
/// </summary>
public sealed class SuiteParallelismGuardTests
{
    private static Assembly SuiteAssembly => typeof(SuiteParallelismGuardTests).Assembly;

    [Fact]
    public void Suite_does_not_disable_test_parallelization_assembly_wide()
    {
        var behavior = SuiteAssembly.GetCustomAttribute<CollectionBehaviorAttribute>();

        // Coerced to a non-nullable bool deliberately. `behavior?.DisableTestParallelization` is a
        // bool?, and xunit's Assert.False(bool?) FAILS on null -- so the no-attribute case (which is
        // the state this test wants) would report red. Verified the hard way.
        Assert.False(
            behavior?.DisableTestParallelization == true,
            "[assembly: CollectionBehavior(DisableTestParallelization = true)] is present on " +
            "FormMaps.IntegrationTests. Remove it. Measured back-to-back on the #36 lab set, serializing " +
            "the suite is 2.03x SLOWER, with 121/121 passing either way -- roughly doubling suite wall " +
            "clock against the 75-minute job cap and the 30-minute shard caps in formmaps-api-ci.yml. It " +
            "also proves nothing about #36: the suite does not deadlock, it accumulates one ASP.NET " +
            "Core host per test, and serializing builds the same number of hosts. If you are adding " +
            "this to chase a hang, read the class remarks first -- the ~70 s of dead air you are " +
            "probably looking at is a deliberate wall-clock sleep in " +
            "RealtimeTicketEndpointTests.Ticket_effective_hub_window_is_bounded_at_about_60_seconds_including_clock_skew.");
    }

    /// <summary>
    /// Same avenue, different door: <c>"parallelizeTestCollections": false</c> in
    /// <c>xunit.runner.json</c> has exactly the same effect as the assembly attribute, while being
    /// invisible to anyone grepping the C# for <c>CollectionBehavior</c>.
    ///
    /// <para>
    /// Checks <see cref="AppContext.BaseDirectory"/> -- the test OUTPUT directory -- and not the project
    /// source directory, because that is where xunit itself reads the file from. This project ships no
    /// runner config and no csproj rule to copy one, so a <c>xunit.runner.json</c> dropped next to the
    /// .csproj never reaches the output directory and is inert for xunit and for this test alike
    /// (verified by mutation: source-dir only = no effect and green; output dir = red). Checking the
    /// source path instead would report red on a file that changes nothing.
    /// </para>
    /// </summary>
    [Fact]
    public void Runner_configuration_does_not_disable_collection_parallelism()
    {
        var configPath = Path.Combine(AppContext.BaseDirectory, "xunit.runner.json");
        if (!File.Exists(configPath))
        {
            // The project ships no runner config at all, which is the state this test wants.
            return;
        }

        using var document = JsonDocument.Parse(
            File.ReadAllText(configPath),
            new JsonDocumentOptions { CommentHandling = JsonCommentHandling.Skip, AllowTrailingCommas = true });

        if (!document.RootElement.TryGetProperty("parallelizeTestCollections", out var setting))
        {
            return;
        }

        Assert.True(
            setting.ValueKind is not JsonValueKind.False,
            $"\"parallelizeTestCollections\": false in {configPath} serializes the whole integration " +
            "suite, which is 2.03x slower and blows the CI shard caps. See the remarks on " +
            $"{nameof(SuiteParallelismGuardTests)} for the measurements.");
    }

    /// <summary>
    /// The formmaps#37 containment. Not a style preference -- without it,
    /// <c>ApiSecurityUtilityTests.Startup_validation_rejects_missing_jwt_secret_in_production</c>
    /// asserts that JWT_SECRET is ABSENT while a concurrently-running class is setting it, and fails
    /// intermittently.
    /// </summary>
    [Fact]
    public void Jwt_secret_collection_is_still_serialized()
    {
        var definition = typeof(JwtSecretCollection).GetCustomAttribute<CollectionDefinitionAttribute>();

        Assert.True(
            definition is not null,
            $"{nameof(JwtSecretCollection)} has lost its [CollectionDefinition] attribute, so the " +
            "classes that claim membership via [Collection(nameof(JwtSecretCollection))] are no longer " +
            "serialized against each other. This reopens formmaps#37.");

        Assert.True(
            definition!.DisableParallelization,
            $"{nameof(JwtSecretCollection)} no longer sets DisableParallelization = true. That flag is " +
            "the entire point of the collection: it serializes the classes that mutate the " +
            "process-wide JWT_SECRET environment variable. Removing it reopens the intermittent " +
            "failure in formmaps#37. Note this is NARROW serialization of a handful of classes and is " +
            "unrelated to -- and must not be confused with -- assembly-wide DisableTestParallelization, " +
            "which the other tests in this class exist to block.");
    }

    /// <summary>
    /// The membership half of the #37 containment (formmaps#112).
    ///
    /// <para>
    /// <see cref="Jwt_secret_collection_is_still_serialized"/> guards the collection DEFINITION. On its
    /// own that is only half a guard, and the missing half was found by mutation: deleting
    /// <c>[Collection(nameof(JwtSecretCollection))]</c> from
    /// <see cref="Security.ApiSecurityUtilityTests"/> -- the very class #37 was filed about -- left the
    /// definition intact and this whole class GREEN. A serialization lock that nothing joins locks
    /// nothing, so a routine "these attributes look redundant" cleanup could reopen #37 with a fully
    /// passing suite.
    /// </para>
    ///
    /// <para>
    /// The roster is pinned BY NAME rather than derived, because membership is decided by whether a
    /// class touches the process-wide <c>JWT_SECRET</c> environment variable -- a fact about method
    /// BODIES that reflection cannot see without IL analysis. The count assertion is what keeps the
    /// pin honest in the other direction: joining the collection without listing the class here fails,
    /// which forces the roster to be reviewed rather than silently outgrown.
    /// </para>
    ///
    /// <para>
    /// Deliberately NOT on the roster: <c>Billing.BillingEndpointsTests</c> mentions
    /// <see cref="JwtSecretScope"/> only in a doc comment, and scopes <c>FRONTEND_BASE_URL</c> rather
    /// than <c>JWT_SECRET</c> -- so it has nothing to serialize against and correctly stays in its own
    /// collection. A grep for "JWT_SECRET" alone reports it as a member and is wrong; check what the
    /// class actually MUTATES before adding anything below.
    /// </para>
    /// </summary>
    [Fact]
    public void Jwt_secret_collection_membership_is_intact()
    {
        // Every class that reads or writes the process-wide JWT_SECRET. Verified against the suite
        // source when formmaps#112 was fixed.
        string[] expectedMembers =
        [
            "FormMaps.IntegrationTests.Auth.AccessTokenFactoryTests",
            "FormMaps.IntegrationTests.Auth.AuthAdminEndpointsTests",
            "FormMaps.IntegrationTests.Auth.AuthEndpointsTests",
            "FormMaps.IntegrationTests.Auth.CrossIssuerInteropTests",
            "FormMaps.IntegrationTests.Messaging.MessagesEndpointAdversarialTests",
            "FormMaps.IntegrationTests.Messaging.RealtimeTicketEndpointTests",
            "FormMaps.IntegrationTests.Security.ApiSecurityUtilityTests",
        ];

        // Read via CustomAttributeData, not GetCustomAttribute<CollectionAttribute>(): xunit 2.x's
        // CollectionAttribute exposes NO public Name property, so the collection name is reachable
        // only as the constructor argument. (Compiling against `.Name` fails outright -- found the
        // hard way.) This form also survives the v2 -> v3 upgrade, where the property does exist.
        static bool IsMember(Type type) =>
            type.GetCustomAttributesData().Any(a =>
                a.AttributeType == typeof(CollectionAttribute)
                && a.ConstructorArguments.Count == 1
                && a.ConstructorArguments[0].Value as string == nameof(JwtSecretCollection));

        foreach (var typeName in expectedMembers)
        {
            var type = SuiteAssembly.GetType(typeName);

            Assert.True(
                type is not null,
                $"{typeName} is on the {nameof(JwtSecretCollection)} roster but no longer exists in the " +
                "suite. If it was renamed or removed on purpose, update the roster in " +
                $"{nameof(SuiteParallelismGuardTests)}.{nameof(Jwt_secret_collection_membership_is_intact)} " +
                "-- do not delete the entry without checking whether its JWT_SECRET usage moved somewhere else.");

            Assert.True(
                IsMember(type!),
                $"{typeName} has lost [Collection(nameof({nameof(JwtSecretCollection)}))]. That class reads " +
                "or writes the process-wide JWT_SECRET environment variable, so without the attribute it " +
                "runs in parallel with the other members and reopens the intermittent failure in " +
                "formmaps#37 -- for example ApiSecurityUtilityTests asserting JWT_SECRET is ABSENT while " +
                "another class is concurrently setting it. The attribute is not redundant with the " +
                "[CollectionDefinition] on JwtSecretCollection: the definition supplies the lock, these " +
                "attributes are what join it.");
        }

        // The reverse direction: a class that joins the collection without being listed above. Left
        // unchecked, the roster silently stops describing reality and this test decays into a
        // seven-name tautology.
        var actualMembers = SuiteAssembly.GetTypes().Where(IsMember).Select(t => t.FullName!).OrderBy(n => n).ToArray();

        Assert.True(
            actualMembers.Length == expectedMembers.Length,
            $"{nameof(JwtSecretCollection)} membership has changed. Expected {expectedMembers.Length} " +
            $"classes, found {actualMembers.Length}:\n  {string.Join("\n  ", actualMembers)}\n" +
            "If a new class legitimately touches JWT_SECRET, add it to the roster in this test. If it " +
            "does not touch JWT_SECRET, it should not be in this collection at all -- joining it " +
            "needlessly serializes the class against six others and costs suite wall clock.");
    }
}
