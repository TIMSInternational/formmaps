using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using FormMaps.Application.Auth;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

namespace FormMaps.Api.Auth;

public sealed class LegacyJwtRequestContextFactory(
    IOptions<LegacyJwtOptions> options,
    IHostEnvironment environment)
{
    private const string AccessTokenCookieName = "access_token";
    private const string JwtSecretEnvironmentVariable = "JWT_SECRET";
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private readonly LegacyJwtOptions jwtOptions = options.Value;
    private readonly JwtSecurityTokenHandler tokenHandler = new()
    {
        MapInboundClaims = false
    };

    public RequestContext Create(HttpContext httpContext)
    {
        var token = ExtractToken(httpContext.Request);

        if (!token.HasValue)
        {
            if (environment.IsDevelopment() &&
                DevelopmentRequestContextFactory.TryCreate(httpContext.Request.Headers, out var developmentContext))
            {
                return developmentContext;
            }

            return RequestContext.Anonymous(TokenSource.None, "no_token");
        }

        var secret = ResolveSecret();
        if (string.IsNullOrWhiteSpace(secret))
        {
            return RequestContext.Anonymous(token.Source, "jwt_secret_not_configured");
        }

        try
        {
            var principal = tokenHandler.ValidateToken(
                token.Value,
                BuildValidationParameters(secret),
                out _);

            // A realtime ticket (RealtimeTicketFactory) shares this same secret/issuer/audience as a
            // full session JWT and differs only by its short TTL and this scope claim -- reject it
            // outright off the hub path so a leaked ticket (browser history, proxy log, Referer header)
            // can't be replayed as a normal Bearer credential against other endpoints for its ~60s life.
            if (IsHubScopedTicket(principal) && !httpContext.Request.Path.StartsWithSegments("/hubs/messages"))
            {
                return RequestContext.Anonymous(token.Source, "hub_ticket_used_outside_hub_path");
            }

            return BuildContext(principal, token.Source);
        }
        catch (SecurityTokenExpiredException)
        {
            return RequestContext.Anonymous(token.Source, "token_expired");
        }
        catch (SecurityTokenException)
        {
            return RequestContext.Anonymous(token.Source, "invalid_token");
        }
        catch (ArgumentException)
        {
            return RequestContext.Anonymous(token.Source, "invalid_token");
        }
    }

    private RequestContext BuildContext(ClaimsPrincipal principal, TokenSource tokenSource)
    {
        var userId = ReadClaim(principal, JwtRegisteredClaimNames.Sub, ClaimTypes.NameIdentifier);
        var role = ReadClaim(principal, "role", ClaimTypes.Role);

        if (string.IsNullOrWhiteSpace(userId) || string.IsNullOrWhiteSpace(role))
        {
            return RequestContext.Anonymous(tokenSource, "missing_required_claims");
        }

        var actor = new RequestActor(
            UserId: userId,
            Role: role,
            Email: EmptyToNull(ReadClaim(principal, JwtRegisteredClaimNames.Email, ClaimTypes.Email, "email")),
            Name: EmptyToNull(ReadClaim(principal, JwtRegisteredClaimNames.Name, ClaimTypes.Name, "name")));

        return RequestContext.Authenticated(
            actor,
            EmptyToNull(ReadClaim(principal, "schoolId")),
            ReadPermissions(principal),
            tokenSource,
            isDevelopmentOverride: false);
    }

    private TokenValidationParameters BuildValidationParameters(string secret)
    {
        return new TokenValidationParameters
        {
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret)),
            ValidateIssuer = true,
            ValidIssuer = jwtOptions.Issuer,
            ValidateAudience = true,
            ValidAudience = jwtOptions.Audience,
            ValidateLifetime = true,
            RequireExpirationTime = true,
            RequireSignedTokens = true,
            ClockSkew = jwtOptions.ClockSkew,
            AlgorithmValidator = static (algorithm, _, _, _) =>
                string.Equals(algorithm, SecurityAlgorithms.HmacSha256, StringComparison.Ordinal)
        };
    }

    private string? ResolveSecret()
    {
        return string.IsNullOrWhiteSpace(jwtOptions.SecretOverride)
            ? Environment.GetEnvironmentVariable(JwtSecretEnvironmentVariable)
            : jwtOptions.SecretOverride;
    }

    private static ExtractedToken ExtractToken(HttpRequest request)
    {
        if (request.Cookies.TryGetValue(AccessTokenCookieName, out var cookieToken) &&
            !string.IsNullOrWhiteSpace(cookieToken))
        {
            return new ExtractedToken(TokenSource.AccessCookie, cookieToken);
        }

        var authorization = request.Headers.Authorization.ToString();
        if (authorization.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
        {
            var bearerToken = authorization["Bearer ".Length..].Trim();
            if (!string.IsNullOrWhiteSpace(bearerToken))
            {
                return new ExtractedToken(TokenSource.AuthorizationBearer, bearerToken);
            }
        }

        // Browsers cannot set custom headers on a native WebSocket upgrade — SignalR's JS client sends
        // the accessTokenFactory value as an ?access_token= query parameter instead for exactly this
        // reason. Scoped to the hub path only: query strings can leak via logs/proxies, so this fallback
        // must never apply to ordinary REST calls, which always have a header/cookie alternative.
        if (request.Path.StartsWithSegments("/hubs/messages") &&
            request.Query.TryGetValue("access_token", out var queryToken) &&
            !string.IsNullOrWhiteSpace(queryToken))
        {
            return new ExtractedToken(TokenSource.AuthorizationBearer, queryToken.ToString());
        }

        return ExtractedToken.None;
    }

    private static bool IsHubScopedTicket(ClaimsPrincipal principal) =>
        string.Equals(
            principal.FindFirst(RealtimeTicketFactory.ScopeClaimType)?.Value,
            RealtimeTicketFactory.HubScopeClaimValue,
            StringComparison.Ordinal);

    private static string? ReadClaim(ClaimsPrincipal principal, params string[] claimTypes)
    {
        foreach (var claimType in claimTypes)
        {
            var value = principal.FindFirst(claimType)?.Value;
            if (!string.IsNullOrWhiteSpace(value))
            {
                return value;
            }
        }

        return null;
    }

    private static string? EmptyToNull(string? value)
    {
        return string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    }

    private static IReadOnlySet<string> ReadPermissions(ClaimsPrincipal principal)
    {
        var permissions = new HashSet<string>(StringComparer.Ordinal);

        foreach (var claim in principal.FindAll("permissions"))
        {
            foreach (var permission in ParsePermissionClaim(claim.Value))
            {
                permissions.Add(permission);
            }
        }

        return permissions;
    }

    private static IEnumerable<string> ParsePermissionClaim(string raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            yield break;
        }

        var trimmed = raw.Trim();
        if (trimmed.StartsWith("[", StringComparison.Ordinal))
        {
            string[]? parsed;
            try
            {
                parsed = JsonSerializer.Deserialize<string[]>(trimmed, JsonOptions);
            }
            catch (JsonException)
            {
                yield break;
            }

            if (parsed is null)
            {
                yield break;
            }

            foreach (var value in parsed)
            {
                if (!string.IsNullOrWhiteSpace(value))
                {
                    yield return value.Trim();
                }
            }

            yield break;
        }

        yield return trimmed;
    }

    private sealed record ExtractedToken(TokenSource Source, string? Value)
    {
        public static readonly ExtractedToken None = new(TokenSource.None, null);

        public bool HasValue => !string.IsNullOrWhiteSpace(Value);
    }
}
