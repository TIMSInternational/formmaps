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
app.MapExamEndpoints();
app.MapLiaEndpoints();
app.MapMilEndpoints();
app.MapPersonalityEndpoints();
app.MapAssessmentTimelineEndpoints();
app.MapVocationalEndpoints();
app.MapTestScoreEndpoints();
app.MapSchoolAdminEndpoints();
app.MapQuestion360Endpoints();

app.Run();

internal sealed record VersionResponse(
    string Service,
    string Runtime,
    string Environment);

public partial class Program;
