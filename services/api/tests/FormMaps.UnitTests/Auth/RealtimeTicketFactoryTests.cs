using System.IdentityModel.Tokens.Jwt;
using FormMaps.Api.Auth;
using FormMaps.Application.Auth;
using Microsoft.Extensions.Options;

namespace FormMaps.UnitTests.Auth;

public sealed class RealtimeTicketFactoryTests
{
    [Fact]
    public void CreateTicket_mints_a_short_lived_token_carrying_the_actors_identity()
    {
        Environment.SetEnvironmentVariable("JWT_SECRET", "formmaps-test-secret-that-is-at-least-32-bytes");
        var factory = new RealtimeTicketFactory(Options.Create(new LegacyJwtOptions
        {
            Issuer = "formmaps-api", Audience = "formmaps-frontend", ClockSkew = TimeSpan.Zero,
        }));
        var actor = new RequestActor("user-123", "student", "user@test.dev", "Test User");

        var ticket = factory.CreateTicket(actor);

        Assert.NotNull(ticket);
        var jwt = new JwtSecurityTokenHandler().ReadJwtToken(ticket);
        Assert.Equal("user-123", jwt.Subject);
        Assert.True(jwt.ValidTo <= DateTime.UtcNow.AddSeconds(65));
        Assert.True(jwt.ValidTo > DateTime.UtcNow.AddSeconds(30));
    }

    [Fact]
    public void CreateTicket_returns_null_when_JWT_SECRET_is_unset()
    {
        Environment.SetEnvironmentVariable("JWT_SECRET", null);
        var factory = new RealtimeTicketFactory(Options.Create(new LegacyJwtOptions
        {
            Issuer = "formmaps-api", Audience = "formmaps-frontend", ClockSkew = TimeSpan.Zero,
        }));

        var ticket = factory.CreateTicket(new RequestActor("user-123", "student", null, null));

        Assert.Null(ticket);
    }
}
