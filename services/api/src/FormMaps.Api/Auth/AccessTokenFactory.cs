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
/// The "permissions" claim is written as a single claim whose value is a JSON-serialized string
/// array (e.g. <c>["a","b"]</c>), NOT System.IdentityModel.Tokens.Jwt's JsonClaimValueTypes.JsonArray
/// value type. This matches exactly what LegacyJwtRequestContextFactory.ParsePermissionClaim already
/// parses from Node-issued tokens (a value starting with '[' is JSON-array-deserialized; anything
/// else is treated as one literal permission) -- see LegacyJwtRequestContextFactoryTests, which pins
/// both a JSON-array-string single claim and repeated single-value claims as already-supported
/// shapes. A token from this factory MUST validate unchanged through LegacyJwtRequestContextFactory
/// -- see AccessTokenFactoryTests for the enforced round-trip.
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
                new Claim("permissions", permissionsJson),
            ],
            notBefore: now,
            expires: now.AddSeconds(ExpiresInSeconds),
            signingCredentials: credentials);

        return handler.WriteToken(token);
    }
}
