using FormMaps.Application.CareerFit;
using FormMaps.Application.CareerFit.Adapters;
using FormMaps.Infrastructure.CareerFit;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace FormMaps.IntegrationTests.CareerFit;

/// <summary>
/// FM-CF-010 (d): the evaluator and its seams resolve from the REAL composition root (Program.cs →
/// AddFormMapsApplication → AddFormMapsInfrastructure) — Scoped, on the process's single rule set, with
/// the NoData 360 adapter — and nothing about them is reachable over HTTP yet (FM-CF-012). The host build
/// also re-runs the FM-CF-003 startup check for free.
/// </summary>
public class CareerFitCompositionTests
{
    [Fact]
    public void Evaluator_reader_writer_and_360_adapter_resolve_from_the_composition_root()
    {
        using var factory = new ApiFactory();
        using var scope = factory.Services.CreateScope();
        var services = scope.ServiceProvider;

        var evaluator = services.GetRequiredService<ICareerFitEvaluator>();
        Assert.IsType<CareerFitEvaluator>(evaluator);
        Assert.IsType<CareerFitInputReader>(services.GetRequiredService<ICareerFitInputReader>());
        Assert.IsType<CareerFitRunWriter>(services.GetRequiredService<ICareerFitRunWriter>());
        Assert.Same(NoDataV360Adapter.Instance, services.GetRequiredService<IV360Adapter>());

        // One rule set per process, already loaded and resolved by the startup check.
        var provider = services.GetRequiredService<ICareerFitRulesProvider>();
        Assert.Equal(CareerFitRulesProvider.DefaultRulesVersion, provider.RulesVersion);
        Assert.Equal(14, provider.ResolvedFamilies.Count);
        Assert.Same(provider, factory.Services.GetRequiredService<ICareerFitRulesProvider>());

        // Scoped: a second scope gets a different evaluator over the same singleton rule set.
        using var other = factory.Services.CreateScope();
        Assert.NotSame(evaluator, other.ServiceProvider.GetRequiredService<ICareerFitEvaluator>());
    }

    [Fact]
    public async Task No_careerfit_route_is_mapped_yet()
    {
        // FM-CF-012 owns the seven endpoints and the FORMMAPS_ROUTE_CAREERFIT_TO_DOTNET flag. Until then a
        // request to the obvious path must fall through to 404, not to an unauthenticated evaluator.
        using var factory = new ApiFactory();
        using var client = factory.CreateClient();

        var response = await client.PostAsync("/api/v1/careerfit/evaluate", content: null);

        Assert.Equal(System.Net.HttpStatusCode.NotFound, response.StatusCode);
    }

    /// <summary>
    /// The production host with the production registrations (AuditServiceRegistrationTests' shape): a
    /// connection string the data source never opens, and ValidateOnBuild / ValidateScopes so a captive
    /// dependency or a missing registration fails the host, not a later request.
    /// </summary>
    private sealed class ApiFactory : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(Environments.Development);
            builder.UseSetting("ConnectionStrings:FormMaps", "Host=localhost;Database=unused;Username=unused;Password=unused");
            builder.UseDefaultServiceProvider((_, options) =>
            {
                options.ValidateOnBuild = true;
                options.ValidateScopes = true;
            });
        }
    }
}
