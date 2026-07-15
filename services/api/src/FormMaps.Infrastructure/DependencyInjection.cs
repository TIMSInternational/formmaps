using FormMaps.Application.Data;
using FormMaps.Infrastructure.Data;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Npgsql;

namespace FormMaps.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddFormMapsInfrastructure(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        services.Configure<FormMapsDatabaseOptions>(
            configuration.GetSection(FormMapsDatabaseOptions.SectionName));

        services.AddSingleton(sp =>
        {
            var options = sp.GetRequiredService<IOptions<FormMapsDatabaseOptions>>().Value;
            var connectionString = FormMapsConnectionStringResolver.Resolve(configuration, options);
            return NpgsqlDataSource.Create(connectionString);
        });

        services.AddSingleton<RlsSessionContextApplier>();
        services.AddScoped<IFormMapsDatabaseSessionFactory, NpgsqlFormMapsDatabaseSessionFactory>();

        return services;
    }
}
