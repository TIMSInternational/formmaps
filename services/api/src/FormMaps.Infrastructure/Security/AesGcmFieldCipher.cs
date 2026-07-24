using System.Security.Cryptography;
using System.Text;
using FormMaps.Application.Security;
using Org.BouncyCastle.Crypto.Engines;
using Org.BouncyCastle.Crypto.Modes;
using Org.BouncyCastle.Crypto.Parameters;

namespace FormMaps.Infrastructure.Security;

/// <summary>
/// AES-256-GCM field cipher — a byte-compatible port of the live TS <c>lib/fieldEncrypt.ts</c>. Output is
/// <c>iv:authTag:ciphertext</c> (lowercase-hex, colon-separated), 16-byte IV + 128-bit tag, so a value written
/// here round-trips through Node's <c>decryptField</c> and is recognised by Node's <c>isEncrypted</c> (which
/// requires a 16-byte IV). Uses BouncyCastle's <see cref="GcmBlockCipher"/> because .NET's native
/// <see cref="AesGcm"/> rejects any nonce that is not 12 bytes, whereas Node uses a 16-byte IV; BouncyCastle
/// performs the same standard GHASH-based J0 derivation as OpenSSL for a non-96-bit IV, so the outputs match.
///
/// <para>The 32-byte key is derived lazily (first encrypt/decrypt) via Node's <c>getKey()</c> rule: a 64-char
/// all-hex value ⇒ the raw hex bytes; otherwise base64-decode and take the first 32 bytes. A cipher instance is
/// created per operation (BouncyCastle's GCM object is single-use / not thread-safe); only the key is cached.</para>
/// </summary>
public sealed class AesGcmFieldCipher : IFieldCipher
{
    private const int IvLengthBytes = 16;       // Node IV_LENGTH — a 16-byte IV → 32 hex chars (isEncrypted gate).
    private const int AuthTagLengthBytes = 16;  // Node AUTH_TAG_LENGTH — 128-bit GCM tag.
    private const int MacBits = AuthTagLengthBytes * 8;

    private readonly Lazy<byte[]> _key;

    public AesGcmFieldCipher(FieldEncryptionOptions options)
    {
        // Lazy: mirrors Node calling getKey() inside encryptField/decryptField (NOT at module load), so a missing
        // key only throws when an encrypting write runs — never at construction / for an anonymous request.
        _key = new Lazy<byte[]>(() => DeriveKey(options.Key));
    }

    public string Encrypt(string plaintext)
    {
        var iv = new byte[IvLengthBytes];
        RandomNumberGenerator.Fill(iv);

        var cipher = new GcmBlockCipher(new AesEngine());
        cipher.Init(forEncryption: true, new AeadParameters(new KeyParameter(_key.Value), MacBits, iv));

        var input = Encoding.UTF8.GetBytes(plaintext);
        var buffer = new byte[cipher.GetOutputSize(input.Length)];
        var written = cipher.ProcessBytes(input, 0, input.Length, buffer, 0);
        cipher.DoFinal(buffer, written);

        // BouncyCastle appends the 16-byte tag after the ciphertext; Node's format is iv:TAG:CIPHERTEXT, so split
        // the trailing tag off and emit it in the middle position.
        var ciphertextLength = buffer.Length - AuthTagLengthBytes;
        var ciphertext = buffer.AsSpan(0, ciphertextLength);
        var tag = buffer.AsSpan(ciphertextLength, AuthTagLengthBytes);

        return string.Concat(
            Convert.ToHexStringLower(iv), ":",
            Convert.ToHexStringLower(tag), ":",
            Convert.ToHexStringLower(ciphertext));
    }

    public string Decrypt(string encrypted)
    {
        var parts = encrypted.Split(':');
        if (parts.Length != 3)
        {
            throw new FormatException("Invalid encrypted field format");
        }

        var iv = Convert.FromHexString(parts[0]);
        var tag = Convert.FromHexString(parts[1]);
        var ciphertext = Convert.FromHexString(parts[2]);

        var cipher = new GcmBlockCipher(new AesEngine());
        cipher.Init(forEncryption: false, new AeadParameters(new KeyParameter(_key.Value), MacBits, iv));

        // GCM decrypt in BouncyCastle expects ciphertext || tag concatenated.
        var input = new byte[ciphertext.Length + tag.Length];
        Buffer.BlockCopy(ciphertext, 0, input, 0, ciphertext.Length);
        Buffer.BlockCopy(tag, 0, input, ciphertext.Length, tag.Length);

        var buffer = new byte[cipher.GetOutputSize(input.Length)];
        var written = cipher.ProcessBytes(input, 0, input.Length, buffer, 0);
        written += cipher.DoFinal(buffer, written); // throws InvalidCipherTextException on a failed tag check.

        return Encoding.UTF8.GetString(buffer, 0, written);
    }

    public bool IsEncrypted(string value)
    {
        var parts = value.Split(':');
        return parts.Length == 3 && parts[0].Length == IvLengthBytes * 2 && IsHex(parts[0]);
    }

    // Node getKey(): a 64-char all-hex string ⇒ Buffer.from(key,"hex"); otherwise Buffer.from(key,"base64") then
    // .subarray(0,32). A 32-byte result is required by AES-256; anything else surfaces as a BouncyCastle key-length
    // error, mirroring Node's createCipheriv throwing on a bad key. (Base64 parsing is .NET-strict re padding vs
    // Node's lenient decoder — a documented edge for malformed keys; a real key is clean 64-hex or padded base64.)
    private static byte[] DeriveKey(string? key)
    {
        if (string.IsNullOrEmpty(key))
        {
            throw new InvalidOperationException("FIELD_ENCRYPTION_KEY environment variable is required");
        }

        if (key.Length == 64 && IsHex(key))
        {
            return Convert.FromHexString(key);
        }

        var decoded = Convert.FromBase64String(key);
        return decoded.Length > 32 ? decoded[..32] : decoded;
    }

    private static bool IsHex(string value)
    {
        if (value.Length == 0)
        {
            return false;
        }

        foreach (var c in value)
        {
            if (!Uri.IsHexDigit(c))
            {
                return false;
            }
        }

        return true;
    }
}
