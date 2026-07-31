using FormMaps.Api;
using FormMaps.Api.Auth;
using FormMaps.Api.Endpoints;
using FormMaps.Api.Security;

var builder = WebApplication.CreateBuilder(args);

builder.AddFormMapsApiSecurity();
builder.Services.AddFormMapsApplication(builder.Configuration);

var app = builder.Build();

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
app.MapSchoolProfileEndpoints();
app.MapSchoolUsersEndpoints();
app.MapCounselorDashboardEndpoints();
app.MapCounselorCaseloadEndpoints();
app.MapCounselorAvailabilityEndpoints();
app.MapCounselorAlertsEndpoints();
app.MapCounselorSessionsEndpoints();
app.MapVideoEndpoints();
app.MapMessagesEndpoints();
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
