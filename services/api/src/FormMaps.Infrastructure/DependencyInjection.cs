using Amazon;
using Amazon.SimpleEmailV2;
using FormMaps.Application.Assessments;
using FormMaps.Application.Auth;
using FormMaps.Application.Calendar;
using FormMaps.Application.CourseImport;
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
using FormMaps.Application.IsamsWrites;
using FormMaps.Application.Security;
using FormMaps.Application.Resumes;
using FormMaps.Application.Storage;
using FormMaps.Application.Uploads;
using FormMaps.Application.SchoolReads;
using FormMaps.Application.SchoolStudents;
using FormMaps.Application.SchoolUsers;
using FormMaps.Application.SchoolCourses;
using FormMaps.Application.Counselor;
using FormMaps.Application.AcademicGaps;
using FormMaps.Application.College;
using FormMaps.Application.CommunityService;
using FormMaps.Application.StudentApplications;
using FormMaps.Application.StudentApplicationSubResources;
using FormMaps.Application.ParentPortal;
using FormMaps.Application.ParentChildReads;
using FormMaps.Application.StudentCoursePlan;
using FormMaps.Application.StudentParents;
using FormMaps.Application.StudentPortfolio;
using FormMaps.Application.Video;
using FormMaps.Application.Messaging;
using FormMaps.Infrastructure.Assessments;
using FormMaps.Infrastructure.Auth;
using FormMaps.Infrastructure.Calendar;
using FormMaps.Infrastructure.CourseImport;
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
using FormMaps.Infrastructure.IsamsWrites;
using FormMaps.Infrastructure.Security;
using FormMaps.Infrastructure.Resumes;
using FormMaps.Infrastructure.Storage;
using FormMaps.Infrastructure.Uploads;
using Amazon.S3;
using FormMaps.Infrastructure.SchoolReads;
using FormMaps.Infrastructure.SchoolStudents;
using FormMaps.Infrastructure.SchoolUsers;
using FormMaps.Infrastructure.SchoolCourses;
using FormMaps.Infrastructure.Counselor;
using FormMaps.Infrastructure.AcademicGaps;
using FormMaps.Infrastructure.College;
using FormMaps.Infrastructure.CommunityService;
using FormMaps.Infrastructure.StudentApplications;
using FormMaps.Infrastructure.StudentApplicationSubResources;
using FormMaps.Infrastructure.ParentPortal;
using FormMaps.Infrastructure.ParentChildReads;
using FormMaps.Infrastructure.StudentCoursePlan;
using FormMaps.Infrastructure.StudentParents;
using FormMaps.Infrastructure.StudentPortfolio;
using FormMaps.Infrastructure.Video;
using FormMaps.Infrastructure.Messaging;
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
        services.AddScoped<IReportEmailRecipientReader, ReportEmailRecipientReader>();
        services.AddScoped<IExamSessionReader, ExamSessionReader>();
        services.AddScoped<IExamCatalogReader, ExamCatalogReader>();
        services.AddScoped<IExamConfigReader, ExamConfigReader>();
        services.AddScoped<IExamStatisticsReader, ExamStatisticsReader>();
        services.AddScoped<IExamHistoryReader, ExamHistoryReader>();
        services.AddScoped<IAllResultsReader, AllResultsReader>();
        services.AddScoped<ILiaResultReader, LiaResultReader>();
        // Singleton cache + Scoped resolver: the lia_questions natural-key -> real-uuid map is static
        // reference data that must survive across requests (one query per process, not per answer),
        // but the resolver that loads it needs the Scoped session factory. See LiaQuestionIdResolver.
        services.AddSingleton<LiaQuestionCatalogCache>();
        services.AddScoped<ILiaQuestionIdResolver, LiaQuestionIdResolver>();
        services.AddScoped<ILiaSessionWriter, LiaSessionWriter>();
        services.AddScoped<ILiaSessionReader, LiaSessionReader>();
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
        // FM-DOTNET-062: school:manage roster reads (GET /students list, /students/{id} detail,
        // /students/{id}/community-service). READS-ONLY first sub-slice of school-students.ts; writes stay Node.
        services.AddScoped<ISchoolStudentsReader, SchoolStudentsReader>();
        // FM-DOTNET-063: school:manage parent-link reads (GET /parents grouped roster+stats, GET
        // /students/{id}/parents Guardians tab). READS-ONLY; parent writes stay Node for now.
        services.AddScoped<ISchoolStudentsParentsReader, SchoolStudentsParentsReader>();
        // FM-DOTNET-064: course-planning reads (GET course-plan, change-requests, course-request-deadline).
        services.AddScoped<ISchoolStudentsCoursePlanReader, SchoolStudentsCoursePlanReader>();
        // FM-DOTNET-065: school:manage non-SES writes (DELETE /students/{id} soft delete, PUT /course-request-deadline).
        services.AddScoped<ISchoolStudentsWriter, SchoolStudentsWriter>();
        // FM-DOTNET-066: school:manage review writes (PUT /community-service/{id}/verify, PUT .../change-requests/{id}/review).
        services.AddScoped<ISchoolStudentsReviewWriter, SchoolStudentsReviewWriter>();
        services.AddScoped<ICounselorDashboardReader, CounselorDashboardReader>();
        services.AddScoped<ICounselorCaseloadReader, CounselorCaseloadReader>();
        services.AddScoped<ICounselorAvailabilityRepository, CounselorAvailabilityRepository>();
        services.AddScoped<ICounselorAlertsRepository, CounselorAlertsRepository>();
        services.AddScoped<ICounselorSessionsRepository, CounselorSessionsRepository>();
        services.AddScoped<ICounselorNotesRepository, CounselorNotesRepository>();
        // Domain 7a: video-call sessions (FM-091..097 — routes/video.ts, 7 of 9 endpoints; schedule/cancel stay
        // Node for their calendar-sync side effect).
        services.AddScoped<IVideoSessionsRepository, VideoSessionsRepository>();
        // Domain 7b: messaging (FM-DOTNET-098+; routes/messages.ts, all 7 endpoints under /api/v1/messages).
        services.AddScoped<IMessagesRepository, MessagesRepository>();
        // Domain 9a: subscription-billing shadow infrastructure (webhook -> shadow tables only, no live writes).
        services.AddScoped<FormMaps.Application.Billing.IBillingShadowRepository, FormMaps.Infrastructure.Billing.BillingShadowRepository>();
        services.AddScoped<FormMaps.Application.Billing.IStripeWebhookVerifier, FormMaps.Infrastructure.Billing.StripeWebhookVerifier>();
        // Domain 9a: hourly reconciliation (BillingReconciliationWorker in FormMaps.Workers) diffing
        // shadow_user_subscriptions against user_subscriptions — the safety net that catches a bug in
        // the webhook write path above before real users are affected.
        services.AddScoped<FormMaps.Application.Billing.IBillingReconciliationService, FormMaps.Infrastructure.Billing.BillingReconciliationService>();
        // Domain 9a Task 7: GET /api/v1/billing/status — read-only reader of the LIVE user_subscriptions
        // table via the caller's own tenant-scoped RLS session (not System()), used by this task's endpoint
        // and Tasks 8-10's checkout/cancel/portal endpoints to read current status before acting.
        services.AddScoped<FormMaps.Application.Billing.ILiveSubscriptionReader, FormMaps.Infrastructure.Billing.LiveSubscriptionReader>();
        // Domain 9a Task 8: IStripeGateway (real Stripe.net wrapper, used by POST /checkout-session and
        // the checkout.session.completed webhook retrofit) + IPlanReader (subscription_plans lookup for
        // that same endpoint).
        services.AddScoped<FormMaps.Application.Billing.IStripeGateway, FormMaps.Infrastructure.Billing.StripeGateway>();
        services.AddScoped<FormMaps.Application.Billing.IPlanReader, FormMaps.Infrastructure.Billing.PlanReader>();
        // Domain 9a Task 8 fix round 1: ILiveCustomerReader -- read-only reader of the LIVE
        // users."stripeCustomerId" column (caller's own tenant-scoped RLS session), consumed by
        // StripeGateway.GetOrCreateCustomerAsync to look up an existing Stripe customer before creating one.
        services.AddScoped<FormMaps.Application.Billing.ILiveCustomerReader, FormMaps.Infrastructure.Billing.LiveCustomerReader>();
        // Domain 7a: Daily.co video-provider client (FM-094). First HttpClient-based external integration in
        // this codebase — 15s timeout matches legacy's AbortSignal.timeout(15000).
        services.AddHttpClient<IDailyClient, DailyClient>(client =>
        {
            client.BaseAddress = new Uri("https://api.daily.co/v1/");
            client.Timeout = TimeSpan.FromSeconds(15);
        });
        // FM-DOTNET-080: academic-gaps 3 non-AI reads (summary / student detail / recommendations).
        services.AddScoped<IAcademicGapsReader, AcademicGapsReader>();
        services.AddScoped<IStudentPortfolioRepository, StudentPortfolioRepository>();
        services.AddScoped<IStudentApplicationRepository, StudentApplicationRepository>();
        // FM-DOTNET-081: college applications CRUD (routes/college.ts Feature 1) + the shared getStudentAccess rail.
        services.AddScoped<ICollegeAccessResolver, CollegeAccessResolver>();
        services.AddScoped<ICollegeApplicationsRepository, CollegeApplicationsRepository>();
        // FM-DOTNET-082: college search + favorites (routes/college.ts Feature 2).
        services.AddScoped<ICollegeFavoritesRepository, CollegeFavoritesRepository>();
        // FM-DOTNET-083: college essays + comments (routes/college.ts Feature 3) — completes the college.ts mini-phase.
        services.AddScoped<ICollegeEssaysRepository, CollegeEssaysRepository>();
        services.AddScoped<ICommunityServiceRepository, CommunityServiceRepository>();
        // FM-DOTNET-084: student course-planning CRUD (routes/course-plan.ts) — GET /course-plan + POST/DELETE
        // /course-plan/courses. Change-requests + recommendations + eligibility on the same router stay Node (later slices).
        services.AddScoped<IStudentCoursePlanRepository, StudentCoursePlanRepository>();
        // FM-DOTNET-085: student course change-requests CRUD (routes/course-plan.ts L92-143) — sub-slice 2/3.
        services.AddScoped<ICourseChangeRequestRepository, CourseChangeRequestRepository>();
        // FM-DOTNET-086: course-plan recommendations + eligibility compute reads — completes the course-plan.ts mini-phase.
        services.AddScoped<ICoursePlanComputeReader, CoursePlanComputeReader>();
        services.AddScoped<IStudentParentRepository, StudentParentRepository>();
        // FM-DOTNET-077: application essays + checklist (non-AI sub-resources). AI siblings (essay ai-review,
        // checklist generate) stay in Node (Bedrock).
        services.AddScoped<IApplicationSubResourceRepository, ApplicationSubResourceRepository>();
        // FM-DOTNET-078: parent portal self-scoped surface (profile, notifications, evaluations/pending, delete-link).
        // Onboarding (auth-cookie), invite/resend (SES), and child-link reads stay in Node.
        services.AddScoped<IParentPortalRepository, ParentPortalRepository>();
        // FM-DOTNET-079: parent child-link-scoped reads (children/:id/progress + course-plan). course-plan reads the
        // plan/target/course-plan on a System (RLS-bypass) session, mirroring legacy runAsSystem.
        services.AddScoped<IParentChildReader, ParentChildReader>();
        // FM-DOTNET-053: iSAMS integration READS (status + jobs). READS-ONLY — configure/sync/test stay in Node
        // (vendor boundary). No vendor HTTP client / field-encryption code.
        services.AddScoped<IIsamsReadsReader, IsamsReadsReader>();
        // FM-DOTNET-087: iSAMS CONFIGURE write (POST /integrations/isams). The only iSAMS write ported — a
        // self-contained isamsConfig upsert + AES-256-GCM credential encryption. sync/test stay in Node (SSRF-
        // hardened vendor client; sync creates user rows). The field cipher is a byte-compatible port of
        // lib/fieldEncrypt.ts (16-byte IV so Node's isEncrypted/decryptField round-trip); Singleton = stateless
        // (only the derived key is cached, lazily, so a missing FIELD_ENCRYPTION_KEY never bricks startup).
        services.AddSingleton(new FieldEncryptionOptions(configuration["FIELD_ENCRYPTION_KEY"]));
        services.AddSingleton<IFieldCipher, AesGcmFieldCipher>();
        services.AddScoped<IIsamsConfigWriter, IsamsConfigWriter>();
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
        // FM-DOTNET-059: course bulk-import CORE — POST /courses/import (202) + GET /courses/import/:jobId (courses:write).
        // The .NET write-owner for school_course_import_jobs + school_course_import_errors + the upsert into
        // school_courses. /download-failures is DEFERRED to FM-060 (stays Node). Atomic-import ratified divergence.
        services.AddScoped<ICourseImportReader, CourseImportReader>();
        services.AddScoped<ICourseImportWriter, CourseImportWriter>();
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

        // FM-DOTNET-088: object storage (S3) + routes/upload.ts — the FIRST file-upload surface in .NET. Port of
        // lib/s3.ts (PutObject ContentDisposition=attachment + 24h presigned GET). The S3 client uses the SAME
        // factory-lambda pattern as SES so credential resolution is deferred to first use (uploads are dark until
        // the flag flips) — a pre-constructed client would resolve creds at boot and brick the whole service.
        var objectStorageOptions = new ObjectStorageOptions(
            Bucket: EnvOr(configuration, "S3_BUCKET", "formmaps-platform-uploads"),
            Region: EnvOr(configuration, "AWS_REGION", EmailOptions.DefaultAwsRegion));
        services.AddSingleton(objectStorageOptions);
        services.AddSingleton<IAmazonS3>(
            _ => new AmazonS3Client(RegionEndpoint.GetBySystemName(objectStorageOptions.Region)));
        services.AddScoped<IObjectStorage, S3ObjectStorage>();
        services.AddScoped<IUploadRepository, UploadRepository>();

        // FM-DOTNET-089: resume section + template writes (routes/resume.ts, /api/resume). Self-scoped jsonb-array
        // manipulation; resumes has NO RLS so ownership is code-only. The resume CRUD + cross-user + AI routes stay Node.
        services.AddScoped<IResumeSectionsRepository, ResumeSectionsRepository>();

        // FM-DOTNET-090: resume CRUD list + create (routes/resume.ts, /api/resume). Self-scoped by userId (no RLS);
        // GET / lists the caller's active resumes, POST / creates one (full 22-col Prisma row passthrough).
        services.AddScoped<IResumeRepository, ResumeRepository>();

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
