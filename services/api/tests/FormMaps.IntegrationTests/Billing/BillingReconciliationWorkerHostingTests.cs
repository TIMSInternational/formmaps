using FormMaps.Api;
using FormMaps.Application.Billing;
using FormMaps.Application.Data;
using FormMaps.Infrastructure.Billing;
using FormMaps.Infrastructure.Data;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Npgsql;
using Xunit;

namespace FormMaps.IntegrationTests.Billing;

/// <summary>
/// formmaps#99. Two things are pinned here, and they are pinned SEPARATELY on purpose:
///
/// <para>(1) <see cref="BillingReconciliationWorkerRegistrationTests"/> — the API's own service collection
/// yields EXACTLY ONE <see cref="IHostedService"/> of type <see cref="BillingReconciliationWorker"/>. Before
/// this issue the worker lived in FormMaps.Workers, a project services/api/Dockerfile never publishes and for
/// which no image / App Runner service exists, so the hourly job had never run in ANY deployed environment:
/// Domain 9a's shadow mode was write-only and #44's observation window was measuring nothing. "Exactly one"
/// also catches the opposite failure — a double registration would double every reconciliation query.</para>
///
/// <para>(2) <see cref="BillingReconciliationWorkerGuardTests"/> — the startup guard. It must skip when
/// public.shadow_user_subscriptions is absent (still the case in prod), and it must NOT skip when the table
/// is present. The second half is the negative control: without it, a guard that had been accidentally
/// hard-wired to "always skip" — i.e. a worker permanently disabled in every environment, the exact bug this
/// issue is fixing — would pass every other assertion in this file.</para>
/// </summary>
public class BillingReconciliationWorkerRegistrationTests
{
    [Fact]
    public void ApiServiceCollection_RegistersExactlyOneBillingReconciliationWorkerHostedService()
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                // Never opened by this test — AddFormMapsInfrastructure builds NpgsqlDataSource from a
                // factory lambda, so nothing connects during registration or resolution.
                ["DATABASE_URL"] = "Host=localhost;Port=1;Username=x;Password=x;Database=x",
            })
            .Build();

        var services = new ServiceCollection();
        services.AddLogging();
        services.AddSingleton<IConfiguration>(configuration);
        services.AddFormMapsApplication(configuration);

        using var provider = services.BuildServiceProvider();
        var hostedServices = provider.GetServices<IHostedService>().ToList();

        Assert.Single(hostedServices.OfType<BillingReconciliationWorker>());
    }
}

[Collection(nameof(BillingDatabaseCollection))]
public class BillingReconciliationWorkerGuardTests(BillingDatabaseFixture fixture)
{
    /// <summary>A database in the SAME Testcontainers instance that billing-shadow-schema.sql was never applied to — i.e. production today.</summary>
    private const string ShadowlessDatabase = "billing_reconciliation_guard_no_shadow";

    [Fact]
    public async Task ExecuteAsync_ShadowTablesAbsent_SkipsReconciliationAndLogsOnce()
    {
        await using var shadowless = await ShadowlessDatabaseHandle.CreateAsync(fixture.ConnectionString);

        var (spy, log) = await RunOneTickAsync(shadowless.SessionFactory);

        Assert.Equal(0, spy.CallCount);
        var warning = Assert.Single(log.Entries, e => e.Level == LogLevel.Warning);
        Assert.Contains("shadow_user_subscriptions", warning.Message, StringComparison.Ordinal);
        Assert.Contains("does not exist", warning.Message, StringComparison.Ordinal);
        Assert.DoesNotContain(log.Entries, e => e.Level == LogLevel.Error);
    }

    /// <summary>
    /// NEGATIVE CONTROL for the test above. Same single tick, same fake TimeProvider, only the database
    /// differs: the shadow tables exist (BillingDatabaseFixture applies billing-shadow-schema.sql), so the
    /// guard must let the loop through and IBillingReconciliationService must actually be called. If this
    /// goes red while the skip test stays green, the guard is disabling the worker unconditionally.
    /// </summary>
    [Fact]
    public async Task ExecuteAsync_ShadowTablesPresent_CallsReconciliationService()
    {
        await fixture.ResetAsync();

        var (spy, log) = await RunOneTickAsync(fixture.SessionFactory);

        Assert.Equal(1, spy.CallCount);
        Assert.DoesNotContain(log.Entries, e => e.Level == LogLevel.Warning);
    }

    /// <summary>
    /// Drives EXACTLY ONE loop iteration. The spy cancels the host token the instant it is called, so the
    /// worker's <c>Task.Delay(1 hour, timeProvider, stoppingToken)</c> completes as cancelled and the while
    /// loop exits; the fake TimeProvider's timer never fires, so a regression that ignored the token could
    /// only hang, never spin — and <c>WaitAsync</c> turns that hang into a failure instead of a stuck run.
    /// </summary>
    private static async Task<(SpyReconciliationService Spy, CapturingLogger Log)> RunOneTickAsync(
        IFormMapsDatabaseSessionFactory sessionFactory)
    {
        using var cts = new CancellationTokenSource();
        var spy = new SpyReconciliationService(cts.Cancel);

        var services = new ServiceCollection();
        services.AddSingleton(sessionFactory);
        services.AddSingleton<IBillingReconciliationService>(spy);
        await using var provider = services.BuildServiceProvider();

        var log = new CapturingLogger();
        using var worker = new BillingReconciliationWorker(
            provider.GetRequiredService<IServiceScopeFactory>(), log, new NeverFiringTimeProvider());

        await worker.StartAsync(cts.Token);
        await worker.ExecuteTask!.WaitAsync(TimeSpan.FromSeconds(60), CancellationToken.None);

        return (spy, log);
    }

    private sealed class SpyReconciliationService(Action onCall) : IBillingReconciliationService
    {
        public int CallCount { get; private set; }

        public Task<ReconciliationResult> ReconcileAsync(CancellationToken cancellationToken = default)
        {
            CallCount++;
            onCall();
            return Task.FromResult(new ReconciliationResult(0, Array.Empty<ReconciliationMismatch>()));
        }
    }

    /// <summary>TimeProvider whose timers NEVER fire — the 1-hour interval must not gate the test.</summary>
    private sealed class NeverFiringTimeProvider : TimeProvider
    {
        public override ITimer CreateTimer(TimerCallback callback, object? state, TimeSpan dueTime, TimeSpan period) =>
            new NoopTimer();

        private sealed class NoopTimer : ITimer
        {
            public bool Change(TimeSpan dueTime, TimeSpan period) => true;

            public void Dispose()
            {
            }

            public ValueTask DisposeAsync() => ValueTask.CompletedTask;
        }
    }

    private sealed record LogEntry(LogLevel Level, string Message);

    private sealed class CapturingLogger : ILogger<BillingReconciliationWorker>
    {
        public List<LogEntry> Entries { get; } = [];

        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;

        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(
            LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter) =>
            Entries.Add(new LogEntry(logLevel, formatter(state, exception)));
    }

    /// <summary>
    /// Creates (and drops) a throwaway database inside the fixture's ALREADY-RUNNING Postgres container, so
    /// the "tables absent" case does not need a second container and does not mutate the shared fixture
    /// schema that the other Billing test classes depend on.
    /// </summary>
    private sealed class ShadowlessDatabaseHandle : IAsyncDisposable
    {
        private readonly string _adminConnectionString;
        private readonly NpgsqlDataSource _dataSource;

        private ShadowlessDatabaseHandle(string adminConnectionString, NpgsqlDataSource dataSource)
        {
            _adminConnectionString = adminConnectionString;
            _dataSource = dataSource;
        }

        public IFormMapsDatabaseSessionFactory SessionFactory =>
            new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier());

        public static async Task<ShadowlessDatabaseHandle> CreateAsync(string adminConnectionString)
        {
            await DropAsync(adminConnectionString);
            await ExecuteOnServerAsync(adminConnectionString, $"""CREATE DATABASE "{ShadowlessDatabase}" """);

            var target = new NpgsqlConnectionStringBuilder(adminConnectionString) { Database = ShadowlessDatabase };
            return new ShadowlessDatabaseHandle(adminConnectionString, NpgsqlDataSource.Create(target.ConnectionString));
        }

        public async ValueTask DisposeAsync()
        {
            await _dataSource.DisposeAsync();
            await DropAsync(_adminConnectionString);
        }

        private static Task DropAsync(string adminConnectionString) =>
            ExecuteOnServerAsync(adminConnectionString, $"""DROP DATABASE IF EXISTS "{ShadowlessDatabase}" WITH (FORCE)""");

        /// <summary>CREATE/DROP DATABASE cannot run inside a transaction block, so each statement goes out on its own command.</summary>
        private static async Task ExecuteOnServerAsync(string adminConnectionString, string sql)
        {
            await using var connection = new NpgsqlConnection(adminConnectionString);
            await connection.OpenAsync();
            await using var command = new NpgsqlCommand(sql, connection);
            await command.ExecuteNonQueryAsync();
        }
    }
}
