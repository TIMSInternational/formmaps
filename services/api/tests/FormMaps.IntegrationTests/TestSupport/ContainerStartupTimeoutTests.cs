using System.Diagnostics;
using System.Reflection;
using DotNet.Testcontainers.Builders;
using DotNet.Testcontainers.Configurations;
using Testcontainers.PostgreSql;

namespace FormMaps.IntegrationTests.TestSupport;

/// <summary>
/// Guards the two independent things that keep an unproductive run from becoming an unkillable one:
/// a finite Testcontainers readiness bound (<see cref="ContainerStartupTimeout"/>), and the
/// blame-hang properties in FormMaps.IntegrationTests.csproj that abort a run which has stopped
/// completing tests.
///
/// <para>
/// THEY FIX DIFFERENT THINGS AND NEITHER IS REDUNDANT. The readiness bound covers a wedged container
/// — real, reproduced (no bound: still starting at 75 s; bound applied: TimeoutException at 21.5 s),
/// and NOT what issue #36 turned out to be. #36 is host-construction cost: a full-project run on
/// 2026-08-10 saw host-building tests go 4.0 s -> 50.2 s mean while pure-Postgres tests stayed flat at
/// ~30 ms, then stop completing entirely with 7 host-building tests from 7 namespaces in flight. No
/// timeout on a container can bound that, which is why the csproj half exists.
/// </para>
///
/// <para>
/// HONEST SCOPE OF THE BEHAVIOURAL TEST. <see cref="A_container_that_never_becomes_ready_fails_instead_of_hanging"/>
/// uses a LOCAL per-strategy timeout, not the global. That is deliberate: the global is a static
/// shared by every collection in a parallel run, so a test that temporarily lowered it would apply
/// that lower bound to every other fixture starting a container at the same moment and turn a loaded
/// CI box red at random; and driving the real 3-minute global end to end would cost 3 minutes of wall
/// clock on every run. Note what that means — this test does NOT prove the global reaches the
/// fixtures' call shape. That was established out of band on 2026-08-10 by running the same
/// unsatisfiable probe with NO local timeout under an env override, in both directions; the numbers
/// are recorded on <see cref="ContainerStartupTimeout"/>. If you change how the bound is installed,
/// re-run that, because these tests will stay green through a global that is set and ignored.
/// </para>
/// </summary>
public sealed class ContainerStartupTimeoutTests
{
    [Fact]
    public void Container_startup_wait_is_bounded()
    {
        var configured = TestcontainersSettings.WaitStrategyTimeout;

        Assert.True(
            configured.HasValue,
            $"TestcontainersSettings.WaitStrategyTimeout is null, which is Testcontainers' default and " +
            $"means NO TIMEOUT — the readiness poll runs forever. Every database fixture in this suite " +
            $"starts its container with a bare StartAsync() and no CancellationToken, so nothing else " +
            $"bounds it: one container that never reports ready parks its collection permanently, holds " +
            $"the container open, and the run never exits (measured with this class removed: still " +
            $"starting at 75 s, no exception). Restore the " +
            $"[ModuleInitializer] on {nameof(ContainerStartupTimeout)}.{nameof(ContainerStartupTimeout.Initialize)}.");

        Assert.True(
            configured!.Value > TimeSpan.Zero && configured.Value != Timeout.InfiniteTimeSpan,
            $"TestcontainersSettings.WaitStrategyTimeout is {configured.Value}, which is not a usable " +
            "bound. Timeout.InfiniteTimeSpan reopens #36 outright; a zero or negative value times every " +
            "container out instantly and turns the whole suite red.");

        Assert.Equal(ContainerStartupTimeout.Applied, configured.Value);
    }

    /// <summary>
    /// The mechanism, pinned against the real library rather than asserted in a comment.
    ///
    /// <para>
    /// The wait strategy here can never be satisfied, which models the failure #36 actually exhibits:
    /// the container starts fine (Docker reports it Up, and it sits there idle for as long as you care
    /// to watch) but the readiness probe never passes. <c>CancellationToken.None</c> is passed on
    /// purpose — it is exactly what all ~56 fixtures pass — so the ONLY thing that can end this call is
    /// a configured timeout. Without one this test would hang forever, which is the whole point.
    /// </para>
    /// </summary>
    [Fact]
    public async Task A_container_that_never_becomes_ready_fails_instead_of_hanging()
    {
        var bound = TimeSpan.FromSeconds(15);

        await using var container = new PostgreSqlBuilder()
            .WithImage("postgres:16-alpine")
            .WithWaitStrategy(Wait.ForUnixContainer()
                .UntilFileExists("/formmaps/this/readiness/marker/never/appears", waitStrategyModifier: w => w.WithTimeout(bound)))
            .Build();

        var stopwatch = Stopwatch.StartNew();

        await Assert.ThrowsAsync<TimeoutException>(() => container.StartAsync(CancellationToken.None));

        stopwatch.Stop();

        // Generous upper bound: this asserts "it terminated near the bound", not a precise duration.
        // A tight assertion here would be exactly the load-sensitive timing test that
        // services/api/scripts/measure-integration-suite.sh exists to refuse.
        Assert.True(
            stopwatch.Elapsed < bound + TimeSpan.FromMinutes(2),
            $"The unsatisfiable readiness wait took {stopwatch.Elapsed} against a {bound} bound. The " +
            "timeout is not being honoured, so container startup is effectively unbounded again.");
    }

    /// <summary>
    /// The #36 half: the blame-hang properties in FormMaps.IntegrationTests.csproj are what make a run
    /// that has stopped completing tests ABORT with a Sequence_*.xml naming the tests in flight, rather
    /// than sit silently forever. Verified on 2026-08-10 by running a deliberately unkillable test with
    /// no blame arguments on the command line at all: vstest aborted it from the csproj alone.
    ///
    /// <para>
    /// Reached through <c>[AssemblyMetadata]</c> because MSBuild properties are otherwise invisible at
    /// runtime — there is no API that reports "this assembly was configured with VSTestBlameHang". The
    /// csproj threads the property value into assembly metadata precisely so this test can see it, so
    /// deleting the PropertyGroup empties the value and turns this red. Do not "simplify" the metadata
    /// item away: on its own it looks like dead weight, and without it the properties can be dropped by
    /// anyone tidying the csproj and nothing anywhere notices.
    /// </para>
    /// </summary>
    [Fact]
    public void Run_is_aborted_when_it_stops_completing_tests()
    {
        var value = typeof(ContainerStartupTimeoutTests).Assembly
            .GetCustomAttributes<AssemblyMetadataAttribute>()
            .SingleOrDefault(a => a.Key == "FormMapsBlameHangTimeout")
            ?.Value;

        Assert.False(
            string.IsNullOrWhiteSpace(value),
            "VSTestBlameHangTimeout is not set in FormMaps.IntegrationTests.csproj, so `dotnet test` on " +
            "this project no longer terminates when it stops making progress — it just goes quiet, which " +
            "is the observation that got issue #36 filed as a hang in the first place. This suite builds " +
            "~1,200 ASP.NET hosts in one process and gets slower as it goes; without this it prints " +
            "nothing and never exits, and you learn nothing about why. Restore the PropertyGroup.");

        // Sanity-check the shape rather than pin the exact number, so tuning the timeout is not a test
        // edit. vstest accepts 1h/10m/90s/milliseconds; anything empty or zero-ish disables the abort.
        Assert.Matches(@"^\d+(ms|s|m|h)?$", value!);
        Assert.DoesNotMatch(@"^0+(ms|s|m|h)?$", value!);
    }
}
