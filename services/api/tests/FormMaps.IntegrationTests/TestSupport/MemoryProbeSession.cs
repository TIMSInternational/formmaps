using System.Globalization;
using System.Runtime.CompilerServices;
using System.Text.Json;

namespace FormMaps.IntegrationTests.TestSupport;

/// <summary>
/// Assembly-scoped lifetime for the #36 Phase 0 instrumentation: arms the host counter and the memory
/// probe when the test assembly loads, and writes the summary out when the process exits.
///
/// <para>
/// WHY A MODULE INITIALIZER AND NOT AN XUNIT ASSEMBLY FIXTURE. xunit v2 has no assembly fixture; the
/// usual workaround is <c>[assembly: TestFramework(...)]</c> with a custom
/// <c>XunitTestFramework</c>/executor. That attribute rewires discovery and execution for EVERY test in
/// this assembly, so a mistake in it does not fail the probe, it fails the whole suite for everyone
/// working in this project. A <see cref="ModuleInitializerAttribute"/> plus
/// <c>AppDomain.ProcessExit</c> gives the same two hooks — before any test, after all tests — with a
/// blast radius of exactly this file.
/// </para>
///
/// <para>
/// INERT BY DEFAULT. Nothing happens unless FORMMAPS_MEMPROBE=1. With the variable unset the module
/// initializer reads one environment variable and returns, no listener is attached, no thread is
/// started, and no file is written.
/// </para>
///
/// <para>Environment variables:</para>
/// <list type="bullet">
///   <item><description>FORMMAPS_MEMPROBE=1 — arm the probe.</description></item>
///   <item><description>FORMMAPS_MEMPROBE_DIR — output directory. Default: <c>TestResults</c> under the current directory, which for vstest is the test assembly's bin folder. Pass an absolute path.</description></item>
///   <item><description>FORMMAPS_MEMPROBE_EVERY — sample every N host starts. Default 25.</description></item>
///   <item><description>FORMMAPS_MEMPROBE_BACKSTOP_S — wall-clock backstop sample interval in seconds. Default 30.</description></item>
/// </list>
/// </summary>
public static class MemoryProbeSession
{
    public const string EnabledVariable = "FORMMAPS_MEMPROBE";
    public const string DirectoryVariable = "FORMMAPS_MEMPROBE_DIR";
    public const string IntervalVariable = "FORMMAPS_MEMPROBE_EVERY";
    public const string BackstopVariable = "FORMMAPS_MEMPROBE_BACKSTOP_S";

    private const long DefaultEveryNHostStarts = 25;
    private const int DefaultBackstopSeconds = 30;

    private static readonly Lock Gate = new();
    private static MemoryProbe? _probe;
    private static DateTimeOffset _startedAtUtc;
    private static int _exitHandled;

    /// <summary>The live probe, or null when the session is not armed.</summary>
    public static MemoryProbe? Probe
    {
        get { lock (Gate) { return _probe; } }
    }

    /// <summary>True when FORMMAPS_MEMPROBE=1 armed this session.</summary>
    public static bool IsEnabled => Probe is not null;

    [ModuleInitializer]
    public static void Initialize()
    {
        if (Environment.GetEnvironmentVariable(EnabledVariable) is not "1")
        {
            return;
        }

        lock (Gate)
        {
            if (_probe is not null)
            {
                return;
            }

            var directory = Environment.GetEnvironmentVariable(DirectoryVariable);
            if (string.IsNullOrWhiteSpace(directory))
            {
                directory = Path.Combine(Directory.GetCurrentDirectory(), "TestResults");
            }

            var probe = new MemoryProbe(
                Path.Combine(directory, "memory.csv"),
                ReadPositiveLong(IntervalVariable, DefaultEveryNHostStarts),
                TimeSpan.FromSeconds(ReadPositiveLong(BackstopVariable, DefaultBackstopSeconds)));

            _startedAtUtc = DateTimeOffset.UtcNow;
            _probe = probe;

            HostBuildCounter.HostStarted += probe.OnHostStarted;
            HostBuildCounter.Attach();

            AppDomain.CurrentDomain.ProcessExit += (_, _) => Finish();

            probe.SampleNow("session-start");

            Console.WriteLine(
                $"[memory-probe] armed. csv={probe.CsvPath} every={ReadPositiveLong(IntervalVariable, DefaultEveryNHostStarts)} host starts");
        }
    }

    /// <summary>
    /// Takes a final sample and writes <c>summary.json</c> next to the CSV. Idempotent; runs on
    /// ProcessExit, and can be called directly when a run is being torn down deliberately.
    /// </summary>
    public static void Finish()
    {
        if (Interlocked.Exchange(ref _exitHandled, 1) != 0)
        {
            return;
        }

        MemoryProbe? probe;
        lock (Gate)
        {
            probe = _probe;
        }

        if (probe is null)
        {
            return;
        }

        try
        {
            probe.SampleNow("session-end");

            var summary = new
            {
                startedAtUtc = _startedAtUtc,
                endedAtUtc = DateTimeOffset.UtcNow,
                durationSeconds = (DateTimeOffset.UtcNow - _startedAtUtc).TotalSeconds,
                hostStarts = HostBuildCounter.Starts,
                hostStops = HostBuildCounter.Stops,
                liveHosts = HostBuildCounter.Live,
                activeTimers = Timer.ActiveCount,
                gen2Collections = GC.CollectionCount(2),
                managedBytesAfterFullGc = GC.GetTotalMemory(forceFullCollection: true),
                samples = probe.SampleCount,
                csv = probe.CsvPath,
            };

            var summaryPath = Path.Combine(
                Path.GetDirectoryName(probe.CsvPath) ?? ".",
                "summary.json");

            File.WriteAllText(
                summaryPath,
                JsonSerializer.Serialize(summary, new JsonSerializerOptions { WriteIndented = true }));

            Console.WriteLine(
                $"[memory-probe] host starts={summary.hostStarts} stops={summary.hostStops} " +
                $"timers={summary.activeTimers} managed={summary.managedBytesAfterFullGc} " +
                $"csv={probe.CsvPath} summary={summaryPath}");
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[memory-probe] finish failed: {ex.GetType().Name}: {ex.Message}");
        }
        finally
        {
            HostBuildCounter.HostStarted -= probe.OnHostStarted;
            probe.Dispose();
        }
    }

    private static long ReadPositiveLong(string variable, long fallback)
    {
        var raw = Environment.GetEnvironmentVariable(variable);
        return long.TryParse(raw, NumberStyles.Integer, CultureInfo.InvariantCulture, out var parsed) && parsed >= 1
            ? parsed
            : fallback;
    }
}
