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

        // 30s, not 60s: LegacyJwtOptions.ClockSkew (30s) is added on validation, so a 60s TTL yielded a
        // ~90s effective window. See RealtimeTicketFactory.TicketLifetime. The end-to-end consequence is
        // pinned by RealtimeTicketEndpointTests
        // .Ticket_effective_hub_window_is_bounded_at_about_60_seconds_including_clock_skew.
        Assert.True(jwt.ValidTo <= DateTime.UtcNow.AddSeconds(35), $"ValidTo was {jwt.ValidTo:O}");
        Assert.True(jwt.ValidTo > DateTime.UtcNow.AddSeconds(15), $"ValidTo was {jwt.ValidTo:O}");
    }

    [Fact]
    public void CreateTicket_carries_a_distinguishing_hub_scope_claim()
    {
        // The ticket shares its secret/issuer/audience with a full session JWT and differs only by TTL
        // -- without this claim, a leaked ticket would be a fully valid Bearer credential against ANY
        // RequireIdentity REST endpoint for its short life, not just the hub. See
        // LegacyJwtRequestContextFactory's rejection of this claim off the /hubs/messages path.
        Environment.SetEnvironmentVariable("JWT_SECRET", "formmaps-test-secret-that-is-at-least-32-bytes");
        var factory = new RealtimeTicketFactory(Options.Create(new LegacyJwtOptions
        {
            Issuer = "formmaps-api", Audience = "formmaps-frontend", ClockSkew = TimeSpan.Zero,
        }));

        var ticket = factory.CreateTicket(new RequestActor("user-123", "student", null, null));

        var jwt = new JwtSecurityTokenHandler().ReadJwtToken(ticket);
        var scopeClaim = jwt.Claims.SingleOrDefault(c => c.Type == RealtimeTicketFactory.ScopeClaimType);
        Assert.NotNull(scopeClaim);
        Assert.Equal(RealtimeTicketFactory.HubScopeClaimValue, scopeClaim!.Value);
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
