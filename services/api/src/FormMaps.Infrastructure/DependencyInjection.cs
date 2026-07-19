using FormMaps.Application.Assessments;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;
using FormMaps.Application.Reports;
using FormMaps.Infrastructure.Assessments;
using FormMaps.Infrastructure.Auth;
using FormMaps.Infrastructure.Data;
using FormMaps.Infrastructure.Reports;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
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
        services.AddScoped<IExamSessionReader, ExamSessionReader>();
        services.AddScoped<IExamCatalogReader, ExamCatalogReader>();
        services.AddScoped<IExamConfigReader, ExamConfigReader>();
        services.AddScoped<IExamStatisticsReader, ExamStatisticsReader>();
        services.AddScoped<IExamHistoryReader, ExamHistoryReader>();
        services.AddScoped<IAllResultsReader, AllResultsReader>();
        services.AddScoped<ILiaResultReader, LiaResultReader>();
        services.AddScoped<ILiaSessionWriter, LiaSessionWriter>();
        services.AddScoped<IPersonalitySessionWriter, PersonalitySessionWriter>();
        services.AddScoped<IPcaExamWriter, PcaExamWriter>();
        services.AddScoped<IVocationalWriter, VocationalWriter>();
        services.AddScoped<IVocationalReader, VocationalReader>();
        services.AddScoped<IMilResultReader, MilResultReader>();
        services.AddScoped<IPersonalityResultReader, PersonalityResultReader>();
        services.AddScoped<IPersonalitySessionReader, PersonalitySessionReader>();
        services.AddScoped<IAssessmentTimelineReader, AssessmentTimelineReader>();
        services.AddScoped<ICompleteProfileAssembler, CompleteProfileAssembler>();
        services.AddScoped<ITestScoreReader, TestScoreReader>();
        services.AddScoped<IUserAccessGuard, UserAccessGuard>();

        // Subscription entitlement gate (legacy requireSubscription). Grace window is env-tunable
        // (SUBSCRIPTION_GRACE_DAYS, default 7) — matching legacy's env override.
        var graceDays = int.TryParse(configuration["SUBSCRIPTION_GRACE_DAYS"], out var parsedGrace) && parsedGrace > 0
            ? parsedGrace
            : SubscriptionAccess.DefaultGraceDays;
        services.AddScoped<ISubscriptionGuard>(sp =>
            new SubscriptionGuard(
                sp.GetRequiredService<IFormMapsDatabaseSessionFactory>(),
                sp.GetRequiredService<ILogger<SubscriptionGuard>>(),
                graceDays));

        return services;
    }
}
