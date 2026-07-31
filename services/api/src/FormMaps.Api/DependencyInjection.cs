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

        return services;
    }
}
