using FormMaps.Application.Auth;
using FormMaps.Application.Messaging;
using FormMaps.Application.Migration;
using FormMaps.Api.Auth;
using FormMaps.Api.Realtime;
using FormMaps.Infrastructure;

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

        return services;
    }
}
