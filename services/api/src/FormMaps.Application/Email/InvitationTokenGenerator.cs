using System.Buffers.Text;
using System.Security.Cryptography;

namespace FormMaps.Application.Email;

/// <summary>
/// Port of legacy generateInvitationToken (lib/auth.ts): <c>crypto.randomBytes(32).toString("base64url")</c>.
/// 32 cryptographically-random bytes → unpadded URL-safe base64 (base64url). Not previously ported — the FM-043
/// token rail only READS/validates invitationToken; setup-360 is the first .NET path that MINTS one.
/// </summary>
public static class InvitationTokenGenerator
{
    public static string Generate()
    {
        Span<byte> bytes = stackalloc byte[32];
        RandomNumberGenerator.Fill(bytes);
        return Base64Url.EncodeToString(bytes);
    }
}
