using FormMaps.Application.Migration;

namespace FormMaps.Api.Endpoints;

public static class MigrationEndpoints
{
    public static IEndpointRouteBuilder MapMigrationEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/migration")
            .WithTags("Migration");

        group.MapGet("/roadmap", (IMigrationRoadmapProvider roadmapProvider) =>
            Results.Ok(new
            {
                success = true,
                data = roadmapProvider.GetRoadmap()
            }));

        return app;
    }
}
