using FormMaps.Application.Auth;
using FormMaps.Application.Migration;
using FormMaps.Api.Auth;

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

        return services;
    }
}
