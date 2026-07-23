using Amazon;
using Amazon.SimpleEmailV2;
using FormMaps.Application.Assessments;
using FormMaps.Application.Auth;
using FormMaps.Application.Calendar;
using FormMaps.Application.CurriculumFrameworks;
using FormMaps.Application.Data;
using FormMaps.Application.DataMappings;
using FormMaps.Application.Pathways;
using FormMaps.Application.Prerequisites;
using FormMaps.Application.Email;
using FormMaps.Application.Reports;
using FormMaps.Application.Gradebook;
using FormMaps.Application.SchoolAdmin;
using FormMaps.Application.SchoolAnalytics;
using FormMaps.Application.SchoolProfile;
using FormMaps.Application.IsamsReads;
using FormMaps.Application.SchoolReads;
using FormMaps.Application.SchoolUsers;
using FormMaps.Application.SchoolCourses;
using FormMaps.Infrastructure.Assessments;
using FormMaps.Infrastructure.Auth;
using FormMaps.Infrastructure.Calendar;
using FormMaps.Infrastructure.CurriculumFrameworks;
using FormMaps.Infrastructure.DataMappings;
using FormMaps.Infrastructure.Pathways;
using FormMaps.Infrastructure.Prerequisites;
using FormMaps.Infrastructure.Data;
using FormMaps.Infrastructure.Email;
using FormMaps.Infrastructure.Reports;
using FormMaps.Infrastructure.Gradebook;
using FormMaps.Infrastructure.SchoolAdmin;
using FormMaps.Infrastructure.SchoolAnalytics;
using FormMaps.Infrastructure.SchoolProfile;
using FormMaps.Infrastructure.IsamsReads;
using FormMaps.Infrastructure.SchoolReads;
using FormMaps.Infrastructure.SchoolUsers;
using FormMaps.Infrastructure.SchoolCourses;
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
        services.AddScoped<ITestScoreWriter, TestScoreWriter>();
        services.AddScoped<ISchoolAdminScopeResolver, SchoolAdminScopeResolver>();
        services.AddScoped<ISchoolAdminReader, SchoolAdminReader>();
        // FM-DOTNET-049: school-analytics reads (overview / trends / performance-trends / top-performers).
        services.AddScoped<ISchoolAnalyticsReader, SchoolAnalyticsReader>();
        // FM-DOTNET-050: school:manage reads (dashboard/stats, counselor-assignments/all, notes, counselor-workload).
        services.AddScoped<ISchoolReadsReader, SchoolReadsReader>();
        // FM-DOTNET-051: school:manage profile + settings reads/writes (school/profile, settings) — the .NET
        // write-owner for the schools table's profile/settings columns.
        services.AddScoped<ISchoolProfileReader, SchoolProfileReader>();
        services.AddScoped<ISchoolProfileWriter, SchoolProfileWriter>();
        // FM-DOTNET-052: school:users cluster (list users, grade-level write, counselor assign/unassign, counselor
        // students). The .NET write-owner for users.gradeLevel + counselor_student_assignments via school:users routes.
        services.AddScoped<ISchoolUsersReader, SchoolUsersReader>();
        services.AddScoped<ISchoolUsersWriter, SchoolUsersWriter>();
        // FM-DOTNET-054: school-courses GET /courses (framework+enrollment merge read) + POST /courses (create).
        // SCOPE = these two only; the .NET write-owner for INSERTs into school_courses via POST /courses.
        services.AddScoped<ISchoolCoursesReader, SchoolCoursesReader>();
        services.AddScoped<ISchoolCoursesWriter, SchoolCoursesWriter>();
        // FM-DOTNET-053: iSAMS integration READS (status + jobs). READS-ONLY — configure/sync/test stay in Node
        // (vendor boundary). No vendor HTTP client / field-encryption code.
        services.AddScoped<IIsamsReadsReader, IsamsReadsReader>();
        // FM-DOTNET-055: curriculum:manage frameworks reads/writes (the four /curriculum/frameworks endpoints). The
        // .NET write-owner for curriculum_frameworks (enable) + school_framework_course_overrides (customize).
        services.AddScoped<ICurriculumFrameworksReader, CurriculumFrameworksReader>();
        services.AddScoped<ICurriculumFrameworksWriter, CurriculumFrameworksWriter>();
        // FM-DOTNET-056: school:data-mapping GET /data-mappings + POST /data-mappings + POST /data-mappings/bulk-approve
        // (routes/school-courses.ts). SCOPE = these three only; PUT/DELETE /:id + /ai-suggest (Bedrock) stay Node. The
        // .NET write-owner for INSERTs + bulk status-approve on data_mappings.
        services.AddScoped<IDataMappingsReader, DataMappingsReader>();
        services.AddScoped<IDataMappingsWriter, DataMappingsWriter>();
        // FM-DOTNET-057: prerequisites — GET /courses/:courseId/prerequisite-chain (courses:read), PUT
        // /courses/:courseId/prerequisites (courses:write), GET /prerequisites/{check,eligible,missing}
        // (curriculum:manage). The .NET write-owner for the school_courses prerequisites/corequisites columns via the PUT.
        services.AddScoped<IPrerequisitesReader, PrerequisitesReader>();
        services.AddScoped<IPrerequisitesWriter, PrerequisitesWriter>();
        // FM-DOTNET-058: derived course pathways — GET /courses/pathways (curriculum:manage). Read-only derivation of
        // root→leaf chains over the transitively-reduced prereq DAG (schoolCoursesService.ts computePathways). No writes.
        services.AddScoped<IPathwaysReader, PathwaysReader>();
        services.AddScoped<IGradebookReader, GradebookReader>();
        services.AddScoped<ICalendarReader, CalendarReader>();
        services.AddScoped<ICalendarWriter, CalendarWriter>();
        services.AddScoped<ISchoolAdminWriter, SchoolAdminWriter>();

        // Outbound email (SES v2) — the FIRST outbound integration. EmailOptions mirrors lib/email.ts env constants.
        var emailOptions = new EmailOptions(
            FromEmail: EnvOr(configuration, "SES_FROM_EMAIL", EmailOptions.DefaultFromEmail),
            FrontendUrl: StripTrailingSlash(EnvOr(configuration, "FRONTEND_BASE_URL", EmailOptions.DefaultFrontendUrl)),
            InviteBaseUrl: EnvOr(configuration, "FRONTEND_BASE_URL", EmailOptions.DefaultInviteBaseUrl),
            LogoUrl: EnvOr(configuration, "EMAIL_LOGO_URL", EmailOptions.DefaultLogoUrl),
            PostalAddress: EnvOr(configuration, "COMPANY_POSTAL_ADDRESS", EmailOptions.DefaultPostalAddress),
            AwsRegion: EnvOr(configuration, "AWS_REGION", EmailOptions.DefaultAwsRegion));
        services.AddSingleton(emailOptions);
        services.AddSingleton(new EmailTemplates(emailOptions));
        // Factory lambda (NOT a pre-constructed instance) so the SES client — and its eager credential
        // resolution — is built on FIRST RESOLVE (only when an email endpoint runs, which is dark until the
        // flag flips), never at startup. A pre-constructed client would resolve creds at boot and brick the
        // ENTIRE service in any env without resolvable AWS creds.
        services.AddSingleton<IAmazonSimpleEmailServiceV2>(
            _ => new AmazonSimpleEmailServiceV2Client(RegionEndpoint.GetBySystemName(emailOptions.AwsRegion)));
        services.AddScoped<IEmailSender, SesEmailSender>();
        services.AddScoped<ISchoolAdminEmailWriter, SchoolAdminEmailWriter>();

        services.AddSingleton(TimeProvider.System);
        services.AddScoped<IQuestion360Reader, Question360Reader>();
        services.AddScoped<IQuestion360Writer, Question360Writer>();
        services.AddScoped<IEvaluationExternalService, EvaluationExternalService>();
        services.AddScoped<IVocationalTakeService, VocationalTakeService>();
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

    // Legacy `process.env.X || default` — a missing OR empty/whitespace value falls back to the default.
    private static string EnvOr(IConfiguration configuration, string key, string fallback)
    {
        var value = configuration[key];
        return string.IsNullOrWhiteSpace(value) ? fallback : value;
    }

    private static string StripTrailingSlash(string value) => value.TrimEnd('/');
}
