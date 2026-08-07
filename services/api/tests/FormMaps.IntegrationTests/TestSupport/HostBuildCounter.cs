using System.Diagnostics.Tracing;

namespace FormMaps.IntegrationTests.TestSupport;

/// <summary>
/// Counts ASP.NET Core host starts/stops in this test process (issue #36, Phase 0).
///
/// <para>
/// WHY AN EVENT LISTENER AND NOT A BASE CLASS. The suite builds a host per TEST via ~681
/// <c>new SomeFactory()</c> sites spread over 67 test classes. Instrumenting that by editing a shared
/// base class does not exist as an option (there is no shared base), and editing 67 classes is exactly
/// the restructure Phase 0 is supposed to *measure before* committing to. So the counter observes hosts
/// completely out of band: <c>Microsoft.AspNetCore.Hosting</c> is an <see cref="EventSource"/> that
/// writes <c>HostStart</c> from <c>GenericWebHostService.StartAsync</c> and <c>HostStop</c> from its
/// <c>StopAsync</c>. Subscribing to it counts every host any test starts, no matter which factory
/// subclass produced it, and changes zero production or test behaviour.
/// </para>
///
/// <para>
/// READ <see cref="Live"/> CAREFULLY. <c>WebApplicationFactory.Dispose()</c> disposes the host; it does
/// not <c>StopAsync</c> it. So <c>HostStop</c> is expected to stay at or near zero even for a perfectly
/// behaved suite, and a large <see cref="Live"/> is NOT by itself proof of a leak. The number that
/// matters for #36 is <see cref="Starts"/> — it is the multiplier applied to any per-host retention.
/// </para>
///
/// <para>
/// Off unless <see cref="Attach"/> is called. <see cref="MemoryProbeSession"/> calls it only when
/// FORMMAPS_MEMPROBE=1, so a normal suite run is byte-for-byte unaffected.
/// </para>
/// </summary>
public static class HostBuildCounter
{
    internal const string HostingEventSourceName = "Microsoft.AspNetCore.Hosting";
    private const string HostStartEventName = "HostStart";
    private const string HostStopEventName = "HostStop";

    private static readonly Lock Gate = new();

    private static long _starts;
    private static long _stops;
    private static Listener? _listener;

    /// <summary>Hosts that reached <c>GenericWebHostService.StartAsync</c> since the listener attached.</summary>
    public static long Starts => Interlocked.Read(ref _starts);

    /// <summary>Hosts that reached <c>GenericWebHostService.StopAsync</c>. See the class remarks before using.</summary>
    public static long Stops => Interlocked.Read(ref _stops);

    /// <summary>Started minus stopped. See the class remarks — this is not a leak count.</summary>
    public static long Live => Starts - Stops;

    /// <summary>True once the process is observing host lifecycle events.</summary>
    public static bool IsAttached
    {
        get { lock (Gate) { return _listener is not null; } }
    }

    /// <summary>Raised after each host start, with the new total. Kept cheap: handlers must not block.</summary>
    public static event Action<long>? HostStarted;

    /// <summary>Idempotent. Starts observing; safe to call from a module initializer.</summary>
    public static void Attach()
    {
        lock (Gate)
        {
            _listener ??= new Listener();
        }
    }

    /// <summary>Idempotent. Stops observing and leaves the totals readable.</summary>
    public static void Detach()
    {
        Listener? listener;
        lock (Gate)
        {
            listener = _listener;
            _listener = null;
        }

        listener?.Dispose();
    }

    /// <summary>
    /// Zeroes the totals. Exists for the self-check, which needs a baseline it can subtract; production
    /// measurement runs never call it.
    /// </summary>
    public static void ResetCounts()
    {
        Interlocked.Exchange(ref _starts, 0);
        Interlocked.Exchange(ref _stops, 0);
    }

    private sealed class Listener : EventListener
    {
        protected override void OnEventSourceCreated(EventSource eventSource)
        {
            // Note: this can fire from the base EventListener constructor, before this instance's own
            // fields are assigned. Touch nothing instance-scoped here.
            if (eventSource.Name == HostingEventSourceName)
            {
                EnableEvents(eventSource, EventLevel.Informational);
            }
        }

        protected override void OnEventWritten(EventWrittenEventArgs eventData)
        {
            // HostingEventSource also emits RequestStart/RequestStop, which cannot be filtered out by
            // keyword because none of its events declare keywords. Discriminating by name here is the
            // only option; the cost is one string compare per HTTP request in the test suite.
            switch (eventData.EventName)
            {
                case HostStartEventName:
                    var total = Interlocked.Increment(ref _starts);
                    HostStarted?.Invoke(total);
                    break;
                case HostStopEventName:
                    Interlocked.Increment(ref _stops);
                    break;
            }
        }
    }
}
