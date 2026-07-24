namespace FormMaps.Application.Security;

/// <summary>
/// Field-level encryption for at-rest secrets (currently the iSAMS API credentials written by the configure
/// endpoint). Faithful port of the live TS <c>lib/fieldEncrypt.ts</c>: AES-256-GCM, output format
/// <c>iv:authTag:ciphertext</c> (all lowercase-hex, colon-separated) with a 16-byte IV and a 16-byte (128-bit)
/// auth tag, key from <c>FIELD_ENCRYPTION_KEY</c> (64-hex ⇒ raw bytes; else base64 ⇒ first 32 bytes).
///
/// <para><b>Why the format matters.</b> The .NET service only ENCRYPTS (on POST /integrations/isams). The stored
/// value is later read + DECRYPTED by the Node iSAMS <c>sync</c> path, which stays polyglot. So a .NET-produced
/// value MUST (a) decrypt cleanly through Node's <c>decryptField</c> and (b) be recognised by Node's
/// <c>isEncrypted</c> — which requires exactly a 16-byte IV (32 hex chars). .NET's native
/// <see cref="System.Security.Cryptography.AesGcm"/> only accepts a 12-byte nonce, so the implementation uses
/// BouncyCastle's GCM (arbitrary IV length, standard GHASH-based J0 derivation — identical to OpenSSL/Node).</para>
///
/// <para><see cref="Decrypt"/> and <see cref="IsEncrypted"/> are not used by production write code; they exist so
/// the parity tests can round-trip a value and assert a known Node-produced ciphertext decrypts here.</para>
/// </summary>
public interface IFieldCipher
{
    /// <summary>Encrypt UTF-8 <paramref name="plaintext"/> → <c>iv:authTag:ciphertext</c> (all lowercase-hex).</summary>
    string Encrypt(string plaintext);

    /// <summary>Decrypt a value produced by <see cref="Encrypt"/> or Node's <c>encryptField</c>. Throws on a bad
    /// format or a failed auth-tag check (tamper) — mirrors Node's throwing <c>decryptField</c>.</summary>
    string Decrypt(string encrypted);

    /// <summary>Node <c>isEncrypted</c>: 3 colon-parts and part[0] is hex of exactly 32 chars (a 16-byte IV).</summary>
    bool IsEncrypted(string value);
}

/// <summary>
/// The raw <c>FIELD_ENCRYPTION_KEY</c> as configured (env/IConfiguration), bound once in DI. Nullable: the key is
/// derived lazily on first encrypt/decrypt (mirroring Node's <c>getKey()</c> called inside encryptField), so a
/// service booted WITHOUT the key still starts and serves every other route — the missing-key error only surfaces
/// if an encrypting write actually runs (which is dark until the cutover flag flips).
/// </summary>
public sealed record FieldEncryptionOptions(string? Key);
