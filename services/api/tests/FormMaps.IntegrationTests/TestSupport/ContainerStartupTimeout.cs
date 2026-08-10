using System.Globalization;
using System.Runtime.CompilerServices;
using DotNet.Testcontainers.Configurations;

namespace FormMaps.IntegrationTests.TestSupport;

/// <summary>
/// Puts a finite bound on every Testcontainers readiness wait in this test process, so a container
/// that never becomes ready FAILS the test that owns it instead of hanging the whole run.
///
/// <para>
/// READ THIS FIRST — THIS IS NOT THE CAUSE OF #36. An earlier revision of this file claimed it was.
/// A monitored full-project run on 2026-08-10 measured otherwise: the mean duration of tests that
/// build an ASP.NET host climbed 4.0 s -> 50.2 s across the run while tests that only touch Postgres
/// stayed FLAT at ~30 ms, and the 7 tests in flight when the run stopped completing were in 7
/// different namespaces and were all host-building endpoint tests. No container was wedged. #36 is
/// the cost of building ~1,200 ASP.NET hosts in one process; the bound on that lives in the
/// blame-hang properties in FormMaps.IntegrationTests.csproj and in the sharded CI matrix. Do not
/// delete this class on discovering that — it closes a real and separate latent hang, below.
/// </para>
///
/// <para>
/// THE (SEPARATE) BUG THIS CLOSES. Every one of the ~58 database fixtures in this suite builds its
/// container with a bare <c>new PostgreSqlBuilder().WithImage("postgres:16-alpine").Build()</c> and
/// starts it with a bare <c>await _container.StartAsync()</c> — no wait strategy, no startup timeout,
/// and critically no <see cref="CancellationToken"/>. Testcontainers' default
/// <see cref="TestcontainersSettings.WaitStrategyTimeout"/> is <c>null</c>, which does not mean "some
/// sensible default", it means NO TIMEOUT. The readiness loop then polls forever.
/// </para>
///
/// <para>
/// MEASURED END TO END AGAINST 4.6.0, both directions, 2026-08-10. The probe is a container built the
/// way the fixtures build theirs — an unsatisfiable readiness wait with NO per-strategy timeout and
/// <c>CancellationToken.None</c>, so the global is the only thing that can possibly end it, raced
/// against a 75 s referee that observes without bounding. With this class removed from the assembly:
/// <c>WaitStrategyTimeout</c> read back <c>null</c> and the start was STILL RUNNING at 75 s, no
/// exception. With this class present and the env override set to 20 s: <see cref="TimeoutException"/>
/// at 21.5 s. The bound comes from here, and it reaches the fixtures' own call shape — which the
/// earlier, weaker evidence for this file (a wait strategy carrying its OWN local timeout) did not
/// actually establish.
/// </para>
///
/// <para>
/// WHY A GLOBAL SETTING AND NOT 56 EDITS. <see cref="TestcontainersSettings.WaitStrategyTimeout"/> is
/// static and process-wide, so this one assignment covers every existing fixture AND every fixture
/// anyone adds later without them having to know this failure mode exists. Threading a token through
/// 56 <c>StartAsync()</c> call sites would fix today's fixtures and silently fail to cover tomorrow's.
/// </para>
///
/// <para>
/// WHAT THIS IS NOT. It is not a fix for suite SLOWNESS, and it deliberately does not touch
/// parallelism — see <see cref="SuiteParallelismGuardTests"/>, which documents why serializing the
/// suite is 2.03x slower and is the wrong response to #36. The value of this change is purely that a
/// wedged container now produces a named failing test instead of an unkillable run: a failure carries
/// information, a hang carries none.
/// </para>
///
/// <para>
/// PULL TIME IS NOT COVERED, ON PURPOSE. Testcontainers pulls the image before the readiness wait
/// begins, so a cold <c>docker pull</c> on a slow network does not burn this budget. The timeout
/// applies only to the post-start readiness poll, which is why a value this tight is safe.
/// </para>
/// </summary>
public static class ContainerStartupTimeout
{
    /// <summary>Escape hatch for CI, so tuning this needs no code change. Parsed as whole seconds.</summary>
    public const string TimeoutSecondsVariable = "FORMMAPS_CONTAINER_STARTUP_TIMEOUT_S";

    /// <summary>
    /// Three minutes. Chosen to be far above any legitimate readiness wait and far below "forever".
    ///
    /// <para>
    /// The headroom is not a guess. Across 31 readiness waits sampled from a full-suite run on a box at
    /// load average 52 on 12 cores — a deliberately awful machine, four times oversubscribed — the
    /// SLOWEST healthy <c>postgres:16-alpine</c> reported ready in 4.12 s, and the mean was 2.15 s. Three
    /// minutes is roughly 44x that worst case, so a container that has not reported ready by then is not
    /// slow, it is wedged.
    /// </para>
    ///
    /// <para>
    /// Do not tighten this to make the suite "fail faster". The margin is the entire point: a false
    /// timeout on a loaded CI runner is a flaky test, flaky tests get muted, and a muted test puts us
    /// back where #36 started. The cost of the margin is bounded and paid only on a genuine wedge.
    /// </para>
    /// </summary>
    public static readonly TimeSpan DefaultTimeout = TimeSpan.FromMinutes(3);

    /// <summary>The value this class actually applied, for the guard test to assert on.</summary>
    public static TimeSpan Applied { get; private set; }

    [ModuleInitializer]
    public static void Initialize()
    {
        // Runs before any fixture constructs a container, because touching any type in this assembly
        // triggers it. Same hook MemoryProbeSession uses, and for the same reason: xunit v2 has no
        // assembly fixture, and [assembly: TestFramework] would rewire discovery for the whole suite.
        Applied = ResolveTimeout();
        TestcontainersSettings.WaitStrategyTimeout = Applied;
    }

    private static TimeSpan ResolveTimeout()
    {
        var raw = Environment.GetEnvironmentVariable(TimeoutSecondsVariable);

        // A malformed or non-positive override falls back to the default rather than throwing. A throw
        // here happens inside a module initializer, which surfaces as a TypeInitializationException on
        // an unrelated test and is a genuinely awful thing to debug. Zero and negative are rejected
        // too: TimeSpan.Zero would time every container out instantly and turn the whole suite red.
        if (int.TryParse(raw, NumberStyles.Integer, CultureInfo.InvariantCulture, out var seconds) && seconds > 0)
        {
            return TimeSpan.FromSeconds(seconds);
        }

        return DefaultTimeout;
    }
}
