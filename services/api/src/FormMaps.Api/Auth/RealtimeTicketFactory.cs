using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using FormMaps.Application.Auth;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

namespace FormMaps.Api.Auth;

/// <summary>
/// Mints a short-lived (30s TTL, ~60s effective once ClockSkew is counted — see
/// <see cref="TicketLifetime"/>) JWT for the sole purpose of authenticating the SignalR hub connection —
/// the frontend cannot read the httpOnly session cookie (deliberately, for XSS hardening), so it cannot
/// hand the real session JWT to SignalR's accessTokenFactory directly. This ticket is fetched via a
/// normal same-origin, cookie-authenticated REST call, then used only for the cross-origin hub connect.
/// Signs with the SAME secret/issuer/audience as the long-lived session JWT (JWT_SECRET, LegacyJwtOptions)
/// so it validates through the exact same path as LegacyJwtRequestContextFactory -- including the
/// existing ValidateLifetime=true/RequireExpirationTime=true enforcement, which is what makes the TTL
/// actually binding rather than a hint. Note that it also means the same ClockSkew applies here as to a
/// session JWT, which is why <see cref="TicketLifetime"/> is 30s rather than the effective 60s target.
///
/// The TTL is a backstop, not the only defense: the ticket also carries a distinguishing
/// <see cref="ScopeClaimType"/>=<see cref="HubScopeClaimValue"/> claim. LegacyJwtRequestContextFactory
/// rejects any token carrying that claim when the request path is NOT /hubs/messages -- otherwise, since
/// this ticket shares the full session JWT's issuer/audience/secret and only differs by TTL, it would be
/// a fully valid Authorization: Bearer credential against ANY RequireIdentity REST endpoint for its
/// lifetime if it leaked via browser history, a proxy log, or a Referer header.
/// </summary>
public sealed class RealtimeTicketFactory(IOptions<LegacyJwtOptions> options)
{
    public const string ScopeClaimType = "scope";
    public const string HubScopeClaimValue = "hub";

    /// <summary>
    /// 30s, NOT the 60s this ticket is colloquially described as -- and the difference is deliberate.
    /// LegacyJwtOptions.ClockSkew (30s) is applied to every token by
    /// LegacyJwtRequestContextFactory.BuildValidationParameters, this one included, so the window in
    /// which a ticket is actually accepted is TTL + skew. A 60s TTL therefore bought ~90s of real
    /// runway (measured in Task 9's adversarial review: a ticket still connected 61s after minting).
    /// Halving the TTL puts 30 + 30 back on the ~60s the design intended, without touching the global
    /// skew -- which must stay non-zero, since it also covers `nbf` and a ticket is routinely minted by
    /// one instance and validated by another behind the load balancer.
    ///
    /// Consequence for callers: the /realtime-ticket response reports expiresIn = 30. Anything that
    /// hard-codes 60 against this is wrong. Pinned end to end by RealtimeTicketEndpointTests
    /// .Ticket_effective_hub_window_is_bounded_at_about_60_seconds_including_clock_skew.
    /// </summary>
    public static readonly TimeSpan TicketLifetime = TimeSpan.FromSeconds(30);
    private const string JwtSecretEnvironmentVariable = "JWT_SECRET";
    private readonly LegacyJwtOptions jwtOptions = options.Value;

    /// <summary>
    /// Resolves the signing secret through the SAME precedence the validating side uses --
    /// <see cref="LegacyJwtRequestContextFactory.ResolveSecret"/>: <c>LegacyJwt:SecretOverride</c>
    /// first, then the <c>JWT_SECRET</c> environment variable.
    ///
    /// formmaps#41. This method previously read the environment variable ONLY, ignoring
    /// SecretOverride. Configuring an override would therefore have signed tickets with one key
    /// and validated them with another, and every realtime ticket would fail validation --
    /// meaning EVERY SignalR hub connection silently stops working. The symptom is nasty: REST is
    /// unaffected and the frontend's 15s poll fallback keeps messages flowing, so it presents as
    /// "messaging feels laggy" rather than "the hub is down", and would be attributed to almost
    /// anything else.
    ///
    /// Keeping the two resolutions textually identical is the point. If one gains a source, the
    /// other must too.
    /// </summary>
    private string? ResolveSecret()
    {
        return string.IsNullOrWhiteSpace(jwtOptions.SecretOverride)
            ? Environment.GetEnvironmentVariable(JwtSecretEnvironmentVariable)
            : jwtOptions.SecretOverride;
    }

    public string? CreateTicket(RequestActor actor)
    {
        var secret = ResolveSecret();
        if (string.IsNullOrWhiteSpace(secret)) return null;

        var handler = new JwtSecurityTokenHandler();
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret));
        var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
        var now = DateTime.UtcNow;

        var token = new JwtSecurityToken(
            issuer: jwtOptions.Issuer,
            audience: jwtOptions.Audience,
            claims:
            [
                new Claim(JwtRegisteredClaimNames.Sub, actor.UserId),
                new Claim("role", actor.Role),
                new Claim(ScopeClaimType, HubScopeClaimValue),
            ],
            notBefore: now,
            expires: now.Add(TicketLifetime),
            signingCredentials: credentials);

        return handler.WriteToken(token);
    }
}
