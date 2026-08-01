namespace FormMaps.Application.Auth;

public readonly record struct PasswordVerifyResult(bool Valid, bool IsLegacyFormat);

/// <summary>
/// Pure port of legacy api/src/lib/auth.ts hashPassword/verifyPassword. Work factor pinned to 12
/// to match bcryptjs exactly — BCrypt.Net-Next and bcryptjs both produce/accept standard $2a$/$2b$
/// modular crypt format, so hashes are cross-compatible in either direction.
/// </summary>
public static class PasswordHasher
{
    private const int WorkFactor = 12;

    public static string Hash(string password) => BCrypt.Net.BCrypt.HashPassword(password, WorkFactor);

    public static PasswordVerifyResult Verify(string password, string hash)
    {
        if (IsLegacyNonBcryptHash(hash))
        {
            // Mirrors isLegacySha256Hash: any hash not in bcrypt modular crypt format is treated
            // as invalid, forcing a reset. Never call BCrypt.Verify on a non-bcrypt string — it throws.
            return new PasswordVerifyResult(Valid: false, IsLegacyFormat: true);
        }

        var valid = BCrypt.Net.BCrypt.Verify(password, hash);
        return new PasswordVerifyResult(Valid: valid, IsLegacyFormat: false);
    }

    private static bool IsLegacyNonBcryptHash(string hash) =>
        !hash.StartsWith("$2a$", StringComparison.Ordinal) &&
        !hash.StartsWith("$2b$", StringComparison.Ordinal) &&
        !hash.StartsWith("$2y$", StringComparison.Ordinal);
}
