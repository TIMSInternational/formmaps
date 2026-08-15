using FormMaps.Application.Audit;
using FormMaps.Infrastructure.Audit;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace FormMaps.IntegrationTests.Audit;

/// <summary>
/// The composition root for formmaps#52. Proves the REAL container — the one Program.cs builds — can
/// hand out <see cref="IAuditEventWriter" /> and <see cref="IAuditEventReader" />.
/// </summary>
/// <remarks>
/// <para>
/// WHY THIS FILE EXISTS. Deleting either <c>services.AddScoped&lt;...&gt;</c> line for these two from
/// <c>FormMaps.Infrastructure.DependencyInjection</c> breaks production outright —
/// <c>GET /api/v1/audit/events</c> cannot construct its handler and every request to it 500s — and,
/// until this file was added, turned exactly ZERO tests red. <c>AuditEndpointsTests</c> does
/// <c>RemoveAll&lt;IAuditEventReader&gt;()</c> + <c>AddSingleton(fake)</c>, so it supplies the
/// registration it is supposedly relying on; every other audit test news up
/// <see cref="AuditEventWriter" /> / <see cref="AuditEventReader" /> directly against the Testcontainers
/// fixture. The concrete classes were exhaustively covered and the wiring was not covered at all.
/// </para>
/// <para>
/// NO SUBSTITUTION, ON PURPOSE. This factory deliberately does NOT call
/// <c>ConfigureTestServices</c> to swap anything audit-related in; the moment it did, it would be
/// testing itself again. The only thing it injects is a syntactically valid connection string, because
/// the <c>NpgsqlDataSource</c> singleton these services transitively depend on resolves one at
/// construction time. Nothing here opens a connection: <c>NpgsqlDataSource.Create</c> parses the string
/// and connects lazily, so no database — and certainly no real one — is contacted.
/// </para>
/// <para>
/// <c>ValidateOnBuild</c> + <c>ValidateScopes</c> are the point of the exercise rather than decoration.
/// Together they turn the container itself into the assertion: <c>ValidateOnBuild</c> walks every
/// registration's constructor graph at build time, so a missing dependency ANYWHERE in the app fails
/// here rather than on the first request that needs it, and <c>ValidateScopes</c> makes a captive
/// dependency (a Singleton holding one of these Scoped services, which would pin one request's DB
/// session for the process lifetime) an error instead of a subtle production bug.
/// </para>
/// </remarks>
public class AuditServiceRegistrationTests
{
    /// <summary>
    /// Parsed, never dialled. See the class remarks — <c>NpgsqlDataSource.Create</c> is lazy, and
    /// nothing in this file executes a command.
    /// </summary>
    private const string UnusedConnectionString =
        "Host=127.0.0.1;Port=1;Database=formmaps_never_connected;Username=unused;Password=unused";

    [Fact]
    public void RealContainer_ResolvesTheAuditWriter_ToTheProductionImplementation()
    {
        using var factory = new RealServicesApiFactory();
        using var scope = factory.Services.CreateScope();

        var writer = scope.ServiceProvider.GetRequiredService<IAuditEventWriter>();

        // GetRequiredService alone would already fail on a deleted registration. The concrete-type
        // assertion is the second half: it is what stops a future "AddScoped<IAuditEventWriter,
        // NoOpAuditEventWriter>()" — the exact shape a debugging session leaves behind — from
        // satisfying this test while production silently stops recording anything.
        Assert.IsType<AuditEventWriter>(writer);
    }

    [Fact]
    public void RealContainer_ResolvesTheAuditReader_ToTheProductionImplementation()
    {
        using var factory = new RealServicesApiFactory();
        using var scope = factory.Services.CreateScope();

        var reader = scope.ServiceProvider.GetRequiredService<IAuditEventReader>();

        Assert.IsType<AuditEventReader>(reader);
    }

    /// <summary>
    /// Both in one scope, because the endpoint's handler and the retrofitted writers live in the same
    /// request scope and a per-service test cannot see a scoping mistake that only shows up when both
    /// are alive at once.
    /// </summary>
    [Fact]
    public void RealContainer_ResolvesBothAuditServices_InASingleRequestScope()
    {
        using var factory = new RealServicesApiFactory();
        using var scope = factory.Services.CreateScope();

        Assert.NotNull(scope.ServiceProvider.GetRequiredService<IAuditEventWriter>());
        Assert.NotNull(scope.ServiceProvider.GetRequiredService<IAuditEventReader>());
    }

    /// <summary>
    /// Scoped, not Singleton. Both services hold an <c>IFormMapsDatabaseSessionFactory</c>, so a
    /// Singleton here is a captive dependency — one request's session factory retained for the life of
    /// the process. <c>ValidateScopes</c> catches that on the way in, but only if the registration is
    /// reached; asserting the lifetime directly pins the intent even if the graph changes shape.
    /// </summary>
    [Theory]
    [InlineData(typeof(IAuditEventWriter))]
    [InlineData(typeof(IAuditEventReader))]
    public void AuditServices_AreRegisteredScoped(Type serviceType)
    {
        using var factory = new RealServicesApiFactory();

        // Resolving from the ROOT provider must fail for a Scoped service under ValidateScopes. That
        // is a stronger statement than reading a ServiceDescriptor back out of an IServiceCollection,
        // because it is the runtime behaviour rather than the declaration.
        var exception = Assert.Throws<InvalidOperationException>(
            () => factory.Services.GetRequiredService(serviceType));

        Assert.Contains("scoped service", exception.Message, StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>
    /// The production host, with the production service registrations, and nothing swapped out.
    /// </summary>
    private sealed class RealServicesApiFactory : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(Environments.Development);
            builder.UseSetting("ConnectionStrings:FormMaps", UnusedConnectionString);
            builder.UseDefaultServiceProvider((_, options) =>
            {
                options.ValidateOnBuild = true;
                options.ValidateScopes = true;
            });
        }
    }
}
