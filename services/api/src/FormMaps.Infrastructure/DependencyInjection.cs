using FormMaps.Application.Auth;
using FormMaps.Application.Data;
using FormMaps.Application.Reports;
using FormMaps.Infrastructure.Auth;
using FormMaps.Infrastructure.Data;
using FormMaps.Infrastructure.Reports;
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
        services.AddScoped<ISchoolBenchmarkReportReader, SchoolBenchmarkReportReader>();
        services.AddScoped<IUserReportReader, UserReportReader>();
        services.AddScoped<IPcaReportReader, PcaReportReader>();
        services.AddScoped<ILiaReportReader, LiaReportReader>();
        services.AddScoped<ITimelineReportReader, TimelineReportReader>();
        services.AddScoped<ICoachingReportReader, CoachingReportReader>();
        services.AddScoped<IEvaluationReportReader, EvaluationReportReader>();
        services.AddScoped<IUserAccessGuard, UserAccessGuard>();

        return services;
    }
}
