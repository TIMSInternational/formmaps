using FormMaps.Application.Migration;

namespace FormMaps.Api;

public static class DependencyInjection
{
    public static IServiceCollection AddFormMapsApplication(this IServiceCollection services)
    {
        services.AddSingleton<IMigrationRoadmapProvider, MigrationRoadmapProvider>();

        return services;
    }
}
