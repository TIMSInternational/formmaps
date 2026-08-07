using FormMaps.Api;
using FormMaps.Api.Auth;
using FormMaps.Api.Endpoints;
using FormMaps.Api.Realtime;
using FormMaps.Api.Security;
using Microsoft.AspNetCore.ResponseCompression;

var builder = WebApplication.CreateBuilder(args);

builder.AddFormMapsApiSecurity();
builder.Services.AddFormMapsApplication(builder.Configuration);

// formmaps#86. This API served every JSON response uncompressed. Measured against
// prod rather than assumed: GET /api/v1/migration/roadmap returned 1743 bytes with
// no Content-Encoding even when the request offered `gzip, br`. gzip cuts that exact
// payload 63%, brotli 71%.
//
// MimeTypes is set EXPLICITLY instead of using ResponseCompressionDefaults, which
// includes text/plain. SignalR's long-polling fallback (/hubs/messages) uses
// text/plain, and compressing a streaming transport is how you get a hub that
// appears to connect and then delivers nothing. Restricting to JSON covers the
// actual problem and cannot reach the hub. It also cannot touch uploads or the
// resume PDF, which is a redirect to a presigned S3 URL — those bytes never pass
// through this middleware at all.
builder.Services.AddResponseCompression(options =>
{
    // Both legs of the normal path are HTTPS (browser -> Vercel -> App Runner), so
    // without this the middleware would do nothing in production. The BREACH
    // consideration that makes this opt-in applies to responses mixing a secret with
    // attacker-controlled input reflected in the same body; these are token-authed
    // JSON APIs behind CORS, not HTML echoing form input. Deliberate, not a default.
    options.EnableForHttps = true;
    options.MimeTypes = ["application/json", "application/json; charset=utf-8", "text/csv"];
    options.Providers.Add<BrotliCompressionProvider>();
    options.Providers.Add<GzipCompressionProvider>();
});

var app = builder.Build();

// Before the security/exception middleware so it wraps error responses too, and
// well before the endpoints — registered after them it would never see their output.
app.UseResponseCompression();

app.UseFormMapsApiSecurity();
app.UseMiddleware<RequestContextMiddleware>();

app.MapGet("/", () => Results.Redirect("/health"));

app.MapGet("/health", () => Results.Ok(new
{
    service = "formmaps-api",
    status = "ok"
}));

app.MapGet("/version", () => Results.Ok(new VersionResponse(
    Service: "formmaps-api",
    Runtime: Environment.Version.ToString(),
    Environment: app.Environment.EnvironmentName)));

app.MapMigrationEndpoints();
app.MapRequestContextEndpoints();
app.MapReportEndpoints();
app.MapReportEmailEndpoints();
app.MapExamEndpoints();
app.MapLiaEndpoints();
app.MapMilEndpoints();
app.MapPersonalityEndpoints();
app.MapAssessmentTimelineEndpoints();
app.MapVocationalEndpoints();
app.MapTestScoreEndpoints();
app.MapSchoolAdminEndpoints();
app.MapSchoolAnalyticsEndpoints();
app.MapSchoolReadsEndpoints();
app.MapSchoolStudentsEndpoints();
app.MapSchoolStudentsParentsEndpoints();
app.MapSchoolStudentsCoursePlanEndpoints();
app.MapSchoolStudentsWriteEndpoints();
app.MapSchoolStudentsReviewEndpoints();
app.MapSchoolStudentsCoursePlanWriteEndpoints();
app.MapSchoolProfileEndpoints();
app.MapSchoolUsersEndpoints();
app.MapCounselorDashboardEndpoints();
app.MapCounselorCaseloadEndpoints();
app.MapCounselorAvailabilityEndpoints();
app.MapCounselorAlertsEndpoints();
app.MapCounselorSessionsEndpoints();
app.MapVideoEndpoints();
app.MapMessagesEndpoints();
app.MapAuthEndpoints();
app.MapAuthAdminEndpoints();
app.MapBillingWebhookEndpoints();
app.MapBillingEndpoints();
app.MapHub<MessagesHub>("/hubs/messages").RequireCors(FormMaps.Api.Security.ApiSecurityExtensions.CorsPolicyName);
app.MapCounselorNotesEndpoints();
app.MapAcademicGapsEndpoints();
app.MapStudentPortfolioEndpoints();
app.MapStudentApplicationEndpoints();
app.MapStudentApplicationSubResourceEndpoints();
app.MapCollegeApplicationEndpoints();
app.MapCollegeFavoritesEndpoints();
app.MapCollegeEssaysEndpoints();
app.MapCommunityServiceEndpoints();
app.MapStudentCoursePlanEndpoints();
app.MapCourseChangeRequestEndpoints();
app.MapCoursePlanComputeEndpoints();
app.MapStudentParentEndpoints();
app.MapParentPortalEndpoints();
app.MapParentChildReadEndpoints();
app.MapSchoolCoursesEndpoints();
app.MapIsamsReadsEndpoints();
app.MapIsamsWriteEndpoints();
app.MapUploadEndpoints();
app.MapResumeSectionsEndpoints();
app.MapResumeCrudEndpoints();
app.MapResumeCrossUserEndpoints();
app.MapCurriculumFrameworksEndpoints();
app.MapDataMappingsEndpoints();
app.MapPrerequisitesEndpoints();
app.MapPathwaysEndpoints();
app.MapCourseImportEndpoints();
app.MapGradebookEndpoints();
app.MapCalendarEndpoints();
app.MapQuestion360Endpoints();
app.MapVocationalTakeEndpoints();
app.MapEvaluationExternalEndpoints();

app.Run();

internal sealed record VersionResponse(
    string Service,
    string Runtime,
    string Environment);

public partial class Program;
