using System.Security.Cryptography;

namespace FormMaps.Application.Auth;

/// <summary>Port of legacy generateRefreshTokenString (lib/auth.ts) — 64 cryptographically random
/// bytes, base64url-encoded. Opaque DB-stored token, NOT a JWT.</summary>
public static class RefreshTokenGenerator
{
    public static string Generate()
    {
        var bytes = RandomNumberGenerator.GetBytes(64);
        return Convert.ToBase64String(bytes).Replace('+', '-').Replace('/', '_').TrimEnd('=');
    }
}
