using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

namespace FormMaps.Api.Auth;

public sealed record AccessTokenClaims(
    string UserId, string Name, string Email, string Role, string SchoolId, IReadOnlyList<string> Permissions);

/// <summary>
/// Mints the full session JWT -- same secret/issuer/audience as <see cref="RealtimeTicketFactory"/>
/// (shared JWT_SECRET env var and LegacyJwtOptions read by the already-live verification path), but
/// with the full claim shape (name/email/schoolId/permissions) and the configurable session TTL,
/// not the 30s hub-ticket TTL.
///
/// The "permissions" claim is written with JsonClaimValueTypes.JsonArray so the wire payload carries a
/// real JSON array -- <c>"permissions":["a","b"]</c> -- which is byte-for-byte the shape Node's
/// <c>jwt.sign({ permissions: string[] })</c> produces (legacy lib/auth.ts generateAccessToken). That
/// direction is the one that matters: after FORMMAPS_ROUTE_AUTH_TO_DOTNET flips, every route still
/// owned by Node validates THIS token, and Node's authenticate middleware assigns the claim straight to
/// <c>req.permissions</c> and calls <c>.includes(permission)</c> on it. Written as a plain string claim
/// (the previous shape) that became a substring test over <c>"[\"a\",\"b\"]"</c> and a string
/// leaked to the SPA through GET /api/v1/user/me where a string[] is expected. On the .NET read side
/// JwtSecurityTokenHandler expands the array into repeated single-value "permissions" claims, which
/// LegacyJwtRequestContextFactory.ParsePermissionClaim already accepts (see
/// LegacyJwtRequestContextFactoryTests). A token from this factory MUST validate unchanged through
/// LegacyJwtRequestContextFactory AND decode to a JSON array on the wire -- both are enforced by
/// AccessTokenFactoryTests.
/// </summary>
public sealed class AccessTokenFactory(IOptions<LegacyJwtOptions> options)
{
    private const string JwtSecretEnvironmentVariable = "JWT_SECRET";
    private const string ExpiresInMinutesEnvironmentVariable = "JWT_EXPIRES_IN_MINUTES";
    private readonly LegacyJwtOptions jwtOptions = options.Value;

    public int ExpiresInSeconds
    {
        get
        {
            var raw = Environment.GetEnvironmentVariable(ExpiresInMinutesEnvironmentVariable);
            var minutes = int.TryParse(raw, out var parsed) && parsed > 0 ? parsed : 60;
            return minutes * 60;
        }
    }

    public string CreateAccessToken(AccessTokenClaims claims)
    {
        var secret = Environment.GetEnvironmentVariable(JwtSecretEnvironmentVariable)
            ?? throw new InvalidOperationException("JWT_SECRET is not configured.");

        var handler = new JwtSecurityTokenHandler();
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret));
        var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
        var now = DateTime.UtcNow;
        var permissionsJson = JsonSerializer.Serialize(claims.Permissions);

        var token = new JwtSecurityToken(
            issuer: jwtOptions.Issuer,
            audience: jwtOptions.Audience,
            claims:
            [
                new Claim(JwtRegisteredClaimNames.Sub, claims.UserId),
                new Claim("name", claims.Name),
                new Claim("email", claims.Email),
                new Claim("role", claims.Role),
                new Claim("schoolId", claims.SchoolId),
                new Claim("permissions", permissionsJson, JsonClaimValueTypes.JsonArray),
            ],
            notBefore: now,
            expires: now.AddSeconds(ExpiresInSeconds),
            signingCredentials: credentials);

        return handler.WriteToken(token);
    }
}
