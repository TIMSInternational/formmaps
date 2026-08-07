using System.Diagnostics;
using System.Globalization;
using System.Text;

namespace FormMaps.IntegrationTests.TestSupport;

/// <summary>
/// Samples process memory on a host-start clock and appends one CSV row per sample (issue #36, Phase 0).
///
/// <para>
/// THE SAMPLING CLOCK IS HOST STARTS, NOT TESTS. Counting tests would mean an assembly-level xunit
/// <c>TestFramework</c> override, which changes discovery for every test in this assembly — unacceptable
/// while other work is in flight in the same project. Host starts are the right clock anyway: #36's whole
/// thesis is that cost scales with hosts built, and the suite builds one per test.
/// </para>
///
/// <para>
/// Sampling is done on a dedicated background thread, never inside the <c>EventSource</c> callback.
/// A sample forces a full blocking GC; doing that while holding EventSource internal locks is a good way
/// to manufacture a hang and then spend a day investigating the instrument instead of the bug.
/// </para>
///
/// <para>
/// COST OF THE INSTRUMENT. <c>GC.GetTotalMemory(forceFullCollection: true)</c> is a full blocking gen2
/// collection. At the default interval of every 25 host starts on a 2,368-test suite that is ~95 forced
/// collections, and it perturbs both timing and the very retention being measured (a forced collection
/// reclaims garbage that a natural run would have been sitting on). Numbers from a probe-on run are
/// therefore a LOWER bound on retention and an UPPER bound on wall clock. Do not quote a probe-on wall
/// clock as the suite's runtime.
/// </para>
/// </summary>
public sealed class MemoryProbe : IDisposable
{
    private const string Header =
        "sample,timestamp_utc,elapsed_s,reason,host_starts,host_stops,live_hosts,active_timers," +
        "gc_gen0,gc_gen1,gc_gen2,managed_bytes_after_full_gc,gen2_size_bytes,heap_committed_bytes," +
        "working_set_bytes,gc_total_pause_ms,threads";

    private readonly string _csvPath;
    private readonly long _everyNHostStarts;
    private readonly TimeSpan _backstopInterval;
    private readonly Stopwatch _clock = Stopwatch.StartNew();
    private readonly SemaphoreSlim _wake = new(0);
    private readonly CancellationTokenSource _shutdown = new();
    private readonly Thread _sampler;
    private readonly Lock _writeGate = new();

    private long _sampleIndex;
    private long _lastSampledAtHostStart = -1;
    private string _pendingReason = "start";
    private int _disposed;

    /// <param name="csvPath">Absolute path of the CSV to append to. Its directory is created if missing.</param>
    /// <param name="everyNHostStarts">Take a sample every N host starts. Must be &gt;= 1.</param>
    /// <param name="backstopInterval">
    /// Also sample on this wall-clock interval, so a run that stalls without starting new hosts still
    /// leaves a trace rather than a gap that has to be guessed at afterwards.
    /// </param>
    public MemoryProbe(string csvPath, long everyNHostStarts, TimeSpan backstopInterval)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(csvPath);
        ArgumentOutOfRangeException.ThrowIfLessThan(everyNHostStarts, 1);

        _csvPath = csvPath;
        _everyNHostStarts = everyNHostStarts;
        _backstopInterval = backstopInterval;

        var directory = Path.GetDirectoryName(csvPath);
        if (!string.IsNullOrEmpty(directory))
        {
            Directory.CreateDirectory(directory);
        }

        if (!File.Exists(_csvPath) || new FileInfo(_csvPath).Length == 0)
        {
            File.WriteAllText(_csvPath, Header + Environment.NewLine);
        }

        _sampler = new Thread(SamplerLoop)
        {
            IsBackground = true,
            Name = "formmaps-memory-probe",
        };
        _sampler.Start();
    }

    /// <summary>Path the probe is appending to. Printed at the end of the run so it is not hunted for.</summary>
    public string CsvPath => _csvPath;

    /// <summary>Number of rows this probe has written.</summary>
    public long SampleCount => Interlocked.Read(ref _sampleIndex);

    /// <summary>Hook for <see cref="HostBuildCounter.HostStarted"/>. Never blocks the caller.</summary>
    public void OnHostStarted(long totalStarts)
    {
        if (totalStarts % _everyNHostStarts != 0)
        {
            return;
        }

        if (Interlocked.Exchange(ref _lastSampledAtHostStart, totalStarts) == totalStarts)
        {
            return;
        }

        RequestSample("hosts");
    }

    /// <summary>Queues a sample. Returns immediately; the background thread does the work.</summary>
    public void RequestSample(string reason)
    {
        Volatile.Write(ref _pendingReason, reason);
        if (_wake.CurrentCount == 0)
        {
            try
            {
                _wake.Release();
            }
            catch (ObjectDisposedException)
            {
                // Racing with Dispose. A dropped sample at shutdown is not worth a crashed test run.
            }
        }
    }

    /// <summary>Takes a sample on the CALLING thread and blocks until it is on disk.</summary>
    public void SampleNow(string reason) => WriteSample(reason);

    private void SamplerLoop()
    {
        while (!_shutdown.IsCancellationRequested)
        {
            bool woken;
            try
            {
                woken = _wake.Wait(_backstopInterval, _shutdown.Token);
            }
            catch (OperationCanceledException)
            {
                return;
            }
            catch (ObjectDisposedException)
            {
                return;
            }

            if (_shutdown.IsCancellationRequested)
            {
                return;
            }

            try
            {
                WriteSample(woken ? Volatile.Read(ref _pendingReason) : "interval");
            }
            catch (Exception ex)
            {
                // The probe must never be able to fail a test run. Losing a sample is acceptable;
                // taking the suite down with it is not.
                Console.Error.WriteLine($"[memory-probe] sample failed: {ex.GetType().Name}: {ex.Message}");
            }
        }
    }

    private void WriteSample(string reason)
    {
        // Order matters: force the collection first, then read everything else, so gen2 size and managed
        // bytes describe the same post-collection state.
        var managedBytes = GC.GetTotalMemory(forceFullCollection: true);
        var info = GC.GetGCMemoryInfo();
        var gen2Size = info.GenerationInfo.Length > 2 ? info.GenerationInfo[2].SizeAfterBytes : -1;

        using var process = Process.GetCurrentProcess();

        var row = new StringBuilder()
            .Append(Interlocked.Increment(ref _sampleIndex).ToString(CultureInfo.InvariantCulture)).Append(',')
            .Append(DateTime.UtcNow.ToString("O", CultureInfo.InvariantCulture)).Append(',')
            .Append(_clock.Elapsed.TotalSeconds.ToString("F3", CultureInfo.InvariantCulture)).Append(',')
            .Append(reason).Append(',')
            .Append(HostBuildCounter.Starts.ToString(CultureInfo.InvariantCulture)).Append(',')
            .Append(HostBuildCounter.Stops.ToString(CultureInfo.InvariantCulture)).Append(',')
            .Append(HostBuildCounter.Live.ToString(CultureInfo.InvariantCulture)).Append(',')
            .Append(Timer.ActiveCount.ToString(CultureInfo.InvariantCulture)).Append(',')
            .Append(GC.CollectionCount(0).ToString(CultureInfo.InvariantCulture)).Append(',')
            .Append(GC.CollectionCount(1).ToString(CultureInfo.InvariantCulture)).Append(',')
            .Append(GC.CollectionCount(2).ToString(CultureInfo.InvariantCulture)).Append(',')
            .Append(managedBytes.ToString(CultureInfo.InvariantCulture)).Append(',')
            .Append(gen2Size.ToString(CultureInfo.InvariantCulture)).Append(',')
            .Append(info.TotalCommittedBytes.ToString(CultureInfo.InvariantCulture)).Append(',')
            .Append(process.WorkingSet64.ToString(CultureInfo.InvariantCulture)).Append(',')
            .Append(GC.GetTotalPauseDuration().TotalMilliseconds.ToString("F1", CultureInfo.InvariantCulture)).Append(',')
            .Append(process.Threads.Count.ToString(CultureInfo.InvariantCulture))
            .ToString();

        lock (_writeGate)
        {
            File.AppendAllText(_csvPath, row + Environment.NewLine);
        }
    }

    public void Dispose()
    {
        if (Interlocked.Exchange(ref _disposed, 1) != 0)
        {
            return;
        }

        _shutdown.Cancel();
        _sampler.Join(TimeSpan.FromSeconds(10));
        _shutdown.Dispose();
        _wake.Dispose();
    }
}
