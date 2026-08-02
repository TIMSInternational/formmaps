using System.IdentityModel.Tokens.Jwt;
using FormMaps.Api.Auth;
using FormMaps.Application.Auth;
using Microsoft.Extensions.Options;
using System.Text;
using Microsoft.IdentityModel.Tokens;

namespace FormMaps.UnitTests.Auth;

public sealed class RealtimeTicketFactoryTests
{
    /// <summary>
    /// formmaps#41 regression. The ticket factory must resolve its signing secret through the SAME
    /// precedence as the validating side (LegacyJwtRequestContextFactory.ResolveSecret):
    /// LegacyJwt:SecretOverride first, then JWT_SECRET.
    ///
    /// Before the fix this read the environment variable only. With an override configured, tickets
    /// were signed with the env secret and validated against the override, so EVERY hub connection
    /// failed -- while REST kept working and the 15s poll fallback masked it as "messaging feels
    /// laggy" rather than "the hub is down".
    ///
    /// Asserts on the actual signature, not merely that a token came back: the ticket must verify
    /// under the override key and must NOT verify under the environment key.
    /// </summary>
    [Fact]
    public void CreateTicket_signs_with_SecretOverride_when_configured_not_the_environment_variable()
    {
        const string envSecret = "env-secret-that-is-at-least-32-bytes-long!!";
        const string overrideSecret = "override-secret-at-least-32-bytes-long!!!!";
        var previous = Environment.GetEnvironmentVariable("JWT_SECRET");
        try
        {
            Environment.SetEnvironmentVariable("JWT_SECRET", envSecret);
            var factory = new RealtimeTicketFactory(Options.Create(new LegacyJwtOptions
            {
                Issuer = "formmaps-api",
                Audience = "formmaps-frontend",
                ClockSkew = TimeSpan.Zero,
                SecretOverride = overrideSecret,
            }));

            var ticket = factory.CreateTicket(new RequestActor("user-123", "student", "user@test.dev", "Test User"));
            Assert.NotNull(ticket);

            Assert.True(VerifiesUnder(ticket!, overrideSecret), "ticket should verify under SecretOverride");
            Assert.False(VerifiesUnder(ticket!, envSecret), "ticket must NOT verify under the env secret when an override is set");
        }
        finally
        {
            Environment.SetEnvironmentVariable("JWT_SECRET", previous);
        }
    }

    /// <summary>Falls back to JWT_SECRET when no override is configured -- the common path.</summary>
    [Fact]
    public void CreateTicket_falls_back_to_the_environment_variable_when_no_override_is_set()
    {
        const string envSecret = "env-secret-that-is-at-least-32-bytes-long!!";
        var previous = Environment.GetEnvironmentVariable("JWT_SECRET");
        try
        {
            Environment.SetEnvironmentVariable("JWT_SECRET", envSecret);
            var factory = new RealtimeTicketFactory(Options.Create(new LegacyJwtOptions
            {
                Issuer = "formmaps-api",
                Audience = "formmaps-frontend",
                ClockSkew = TimeSpan.Zero,
                SecretOverride = null,
            }));

            var ticket = factory.CreateTicket(new RequestActor("user-123", "student", "user@test.dev", "Test User"));
            Assert.NotNull(ticket);
            Assert.True(VerifiesUnder(ticket!, envSecret), "ticket should verify under JWT_SECRET");
        }
        finally
        {
            Environment.SetEnvironmentVariable("JWT_SECRET", previous);
        }
    }

    private static bool VerifiesUnder(string token, string secret)
    {
        try
        {
            new JwtSecurityTokenHandler().ValidateToken(token, new TokenValidationParameters
            {
                ValidateIssuerSigningKey = true,
                IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret)),
                ValidateIssuer = false,
                ValidateAudience = false,
                ValidateLifetime = false,
            }, out _);
            return true;
        }
        catch (SecurityTokenException)
        {
            return false;
        }
    }

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
