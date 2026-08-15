using FormMaps.Application.Assessments;
using FormMaps.Application.Auth;
using FormMaps.Application.Messaging;
using FormMaps.Application.Migration;
using FormMaps.Api.Auth;
using FormMaps.Api.Insights;
using FormMaps.Api.Realtime;
using FormMaps.Infrastructure;
using FormMaps.Infrastructure.Billing;

namespace FormMaps.Api;

public static class DependencyInjection
{
    public static IServiceCollection AddFormMapsApplication(this IServiceCollection services, IConfiguration configuration)
    {
        services.Configure<LegacyJwtOptions>(configuration.GetSection(LegacyJwtOptions.SectionName));
        services.AddSingleton<LegacyJwtRequestContextFactory>();
        services.AddScoped<IRequestContextAccessor, RequestContextAccessor>();
        services.AddSingleton<IProtectedRequestGuard, ProtectedRequestGuard>();
        services.AddSingleton<IMigrationRoadmapProvider, MigrationRoadmapProvider>();
        services.AddFormMapsInfrastructure(configuration);

        // Task 7: realtime push (SignalR MessagesHub). Registered here, not FormMaps.Infrastructure's
        // DependencyInjection, because SignalRMessagesNotifier lives in the Api layer (it depends on
        // Microsoft.AspNetCore.SignalR) -- Infrastructure cannot reference Api (the reference direction
        // is Api -> Infrastructure, see FormMaps.Api.csproj). MessagesRepository (Infrastructure) still
        // resolves IMessagesRealtimeNotifier fine since this whole method is the app's composition root.
        services.AddSignalR();
        services.AddScoped<IMessagesRealtimeNotifier, SignalRMessagesNotifier>();
        services.AddScoped<RealtimeTicketFactory>();

        // Domain 10 (Auth) Task 14: AccessTokenFactory lives in FormMaps.Api.Auth (Api layer, like
        // RealtimeTicketFactory above), so it's registered here rather than in
        // FormMaps.Infrastructure's DependencyInjection (which cannot reference the Api project --
        // see the SignalR comment above for the reference-direction rule). It only depends on
        // IOptions<LegacyJwtOptions> (already bound above) and holds no per-request state, so
        // Singleton is safe -- same lifetime as the sibling LegacyJwtRequestContextFactory, which
        // reads the same options type.
        services.AddSingleton<AccessTokenFactory>();

        // formmaps#144: the polyglot insights trigger — the funnel signal legacy fires after 360
        // feedback submits and LIA completions, which the .NET assessment writes were dropping.
        // The implementation lives in the Api layer (like SignalRMessagesNotifier above) because
        // minting the short-lived legacy JWT needs LegacyJwtOptions + System.IdentityModel.Tokens.Jwt,
        // which Infrastructure cannot reference; EvaluationExternalService/LiaSessionWriter
        // (Infrastructure) consume it through FormMaps.Application's IInsightsTrigger, resolved here
        // at the composition root. 5s timeout: Node's generate-insights handler only runs the
        // completion-gate queries inline (generation is backgrounded server-side), so a healthy call
        // is sub-second — the cap bounds the post-commit latency a Node outage can add to an
        // assessment write before the trigger's own catch logs the loud Error and lets the write
        // succeed.
        services.AddSingleton(new InsightsTriggerOptions(configuration["LEGACY_API_BASE_URL"]));
        services.AddHttpClient<IInsightsTrigger, LegacyApiInsightsTrigger>(client =>
        {
            client.Timeout = TimeSpan.FromSeconds(5);
        });

        // formmaps#99: Domain 9a's hourly shadow-vs-live reconciliation. It lived in FormMaps.Workers,
        // which services/api/Dockerfile NEVER publishes (it publishes only src/FormMaps.Api) and for
        // which no image / App Runner service exists -- so the job had never run in any deployed
        // environment and #44's pre-cutover observation window was measuring nothing. The worker now
        // lives in FormMaps.Infrastructure.Billing and is hosted by the API process itself, in the
        // existing container, off the existing DATABASE_URL secret -- no new Dockerfile, ECR repo or
        // service. It is registered HERE, not in FormMaps.Infrastructure's DependencyInjection: which
        // process actually RUNS a BackgroundService is a composition-root decision, and
        // AddFormMapsInfrastructure is shared by two roots (this one and FormMaps.Workers/Program.cs,
        // which keeps its own AddHostedService<BillingReconciliationWorker>() call). Note the stale
        // comment at FormMaps.Infrastructure/DependencyInjection.cs still says the worker lives in
        // FormMaps.Workers -- it no longer does. Double-registering is harmless if it ever happens
        // anyway: AddHostedService uses TryAddEnumerable, which de-dupes on (IHostedService, impl type).
        // The worker no-ops (one log, then exit) when public.shadow_user_subscriptions is absent, which
        // is still the case in production -- see BillingReconciliationWorker.ShadowTablesExistAsync.
        services.AddHostedService<BillingReconciliationWorker>();

        return services;
    }
}
