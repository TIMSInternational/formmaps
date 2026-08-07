using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Hosting;
using Xunit.Abstractions;
using Xunit.Sdk;

namespace FormMaps.IntegrationTests.TestSupport;

/// <summary>
/// Negative control for <see cref="HostBuildCounter"/> (issue #36, Phase 0).
///
/// <para>
/// The failure this exists to catch: a counter wired to the wrong hook — a factory constructor, a
/// listener attach, a static initializer — still produces a number, and the number looks plausible.
/// The only assertion that distinguishes a real host counter from a plausible constant is an exact
/// one over a known host count, so this class starts EXACTLY TWO hosts and asserts the counter reads
/// exactly 2. Anything that increments per-something-else lands on 0, 1, or 4 and goes red.
/// </para>
///
/// <para>
/// SKIPPED UNLESS FORMMAPS_MEMPROBE_SELFCHECK=1. The counter is process-wide, so in a full parallel
/// run every other class's hosts inflate it and the exact assertion is meaningless — worse, it would
/// be flakily red for everyone else. Run it deliberately and alone:
/// </para>
/// <code>
/// FORMMAPS_MEMPROBE_SELFCHECK=1 dotnet test --filter FullyQualifiedName~HostBuildCounterSelfCheckTests
/// </code>
///
/// <para>
/// It also calls <see cref="HostBuildCounter.ResetCounts"/>, which is another reason it must not run
/// alongside a real measurement run: it would zero that run's totals mid-flight.
/// </para>
/// </summary>
[TestCaseOrderer(
    "FormMaps.IntegrationTests.TestSupport.AlphabeticalTestCaseOrderer",
    "FormMaps.IntegrationTests")]
public sealed class HostBuildCounterSelfCheckTests
{
    [SelfCheckFact]
    public async Task Step1_first_host_moves_the_counter_to_one()
    {
        HostBuildCounter.Attach();
        HostBuildCounter.ResetCounts();

        Assert.Equal(0, HostBuildCounter.Starts);

        await StartOneHostAsync();

        Assert.Equal(1, HostBuildCounter.Starts);
    }

    [SelfCheckFact]
    public async Task Step2_second_host_moves_the_counter_to_exactly_two()
    {
        // Step1 ran first (see the TestCaseOrderer) and left the counter at 1.
        Assert.Equal(1, HostBuildCounter.Starts);

        await StartOneHostAsync();

        Assert.Equal(2, HostBuildCounter.Starts);
    }

    /// <summary>
    /// Builds and STARTS one host, then makes one real request so the run cannot pass on a host that
    /// was constructed but never started.
    /// </summary>
    private static async Task StartOneHostAsync()
    {
        using var factory = new SelfCheckFactory();
        using var client = factory.CreateClient();

        // /health is unauthenticated; any 2xx/4xx is fine, the point is that the pipeline ran.
        using var response = await client.GetAsync("/health");
        Assert.NotEqual(0, (int)response.StatusCode);
    }

    private sealed class SelfCheckFactory : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
            => builder.UseEnvironment(Environments.Development);
    }
}

/// <summary>
/// A <see cref="FactAttribute"/> that skips itself unless FORMMAPS_MEMPROBE_SELFCHECK=1.
///
/// <para>
/// xunit 2.9.3 has no <c>Assert.Skip</c> — its <c>SkipException</c> is not public API — so dynamic
/// skipping is done the v2 way, by setting <see cref="FactAttribute.Skip"/> at discovery time. The
/// environment variable is read in the test process, so exporting it before <c>dotnet test</c> is what
/// arms these.
/// </para>
///
/// <para>
/// Deliberately not a plain <c>[Fact]</c> with a manual early return: an early return produces a
/// PASSING test that asserted nothing, which is how a broken counter gets a green tick. Skipped is
/// reported as skipped.
/// </para>
/// </summary>
public sealed class SelfCheckFactAttribute : FactAttribute
{
    public const string Variable = "FORMMAPS_MEMPROBE_SELFCHECK";

    public SelfCheckFactAttribute()
    {
        if (Environment.GetEnvironmentVariable(Variable) is not "1")
        {
            Skip = $"Set {Variable}=1 and run this class alone; the host counter is process-wide and " +
                   "a parallel suite run makes the exact assertion meaningless.";
        }
    }
}

/// <summary>
/// Orders test cases by method name so <c>Step1_</c> runs before <c>Step2_</c>. Class-scoped via the
/// <c>[TestCaseOrderer]</c> attribute on <see cref="HostBuildCounterSelfCheckTests"/> only — it is
/// deliberately not applied at assembly level, which would change ordering for every test here.
/// </summary>
public sealed class AlphabeticalTestCaseOrderer : ITestCaseOrderer
{
    public IEnumerable<TTestCase> OrderTestCases<TTestCase>(IEnumerable<TTestCase> testCases)
        where TTestCase : ITestCase
        => testCases.OrderBy(testCase => testCase.TestMethod.Method.Name, StringComparer.Ordinal);
}
