using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using FormMaps.Application.Auth;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

namespace FormMaps.Api.Auth;

/// <summary>
/// Mints a short-lived (60s) JWT for the sole purpose of authenticating the SignalR hub connection —
/// the frontend cannot read the httpOnly session cookie (deliberately, for XSS hardening), so it cannot
/// hand the real session JWT to SignalR's accessTokenFactory directly. This ticket is fetched via a
/// normal same-origin, cookie-authenticated REST call, then used only for the cross-origin hub connect.
/// Signs with the SAME secret/issuer/audience as the long-lived session JWT (JWT_SECRET, LegacyJwtOptions)
/// so it validates through the exact same path as LegacyJwtRequestContextFactory -- including the
/// existing ValidateLifetime=true/RequireExpirationTime=true enforcement, which is what makes the 60s
/// TTL actually binding rather than a hint.
///
/// The 60s TTL is a backstop, not the only defense: the ticket also carries a distinguishing
/// <see cref="ScopeClaimType"/>=<see cref="HubScopeClaimValue"/> claim. LegacyJwtRequestContextFactory
/// rejects any token carrying that claim when the request path is NOT /hubs/messages -- otherwise, since
/// this ticket shares the full session JWT's issuer/audience/secret and only differs by TTL, it would be
/// a fully valid Authorization: Bearer credential against ANY RequireIdentity REST endpoint for its ~60s
/// lifetime if it leaked via browser history, a proxy log, or a Referer header.
/// </summary>
public sealed class RealtimeTicketFactory(IOptions<LegacyJwtOptions> options)
{
    public const string ScopeClaimType = "scope";
    public const string HubScopeClaimValue = "hub";

    private static readonly TimeSpan TicketLifetime = TimeSpan.FromSeconds(60);
    private const string JwtSecretEnvironmentVariable = "JWT_SECRET";
    private readonly LegacyJwtOptions jwtOptions = options.Value;

    public string? CreateTicket(RequestActor actor)
    {
        var secret = Environment.GetEnvironmentVariable(JwtSecretEnvironmentVariable);
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
