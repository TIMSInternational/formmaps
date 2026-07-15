using FormMaps.Api;
using FormMaps.Api.Auth;
using FormMaps.Api.Endpoints;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddFormMapsApplication(builder.Configuration);

var app = builder.Build();

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

app.Run();

internal sealed record VersionResponse(
    string Service,
    string Runtime,
    string Environment);

public partial class Program;
