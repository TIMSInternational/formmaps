using FormMaps.Application.Security;
using FormMaps.Infrastructure.Security;

namespace FormMaps.UnitTests.Security;

/// <summary>
/// AES-256-GCM field cipher (FM-DOTNET-087) — parity with the live TS lib/fieldEncrypt.ts. The load-bearing test is
/// <see cref="Decrypts_a_known_Node_produced_value"/>: a value produced by Node's <c>encryptField</c> (16-byte IV
/// AES-256-GCM, iv:tag:ciphertext hex) must decrypt here — proof the .NET BouncyCastle GCM matches OpenSSL's
/// non-96-bit-IV construction so a .NET-written iSAMS credential round-trips through the Node sync path. Also pins:
/// the emitted format (16-byte IV → isEncrypted true), round-trip, both key-derivation branches (64-hex + base64),
/// per-call IV randomness, and the lazy missing-key throw.
/// </summary>
public sealed class AesGcmFieldCipherTests
{
    // Golden vector generated with Node crypto (createCipheriv aes-256-gcm) — the SAME 32-byte key expressed as
    // 64-hex and as base64; a fixed 16-byte IV; a Unicode plaintext (accent + emoji) to exercise UTF-8.
    private const string KeyHex = "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
    private const string KeyBase64 = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=";
    private const string Plaintext = "isams-secret-Ápi-Key-\U0001f511";
    private const string NodeValue =
        "aabbccddeeff00112233445566778899:870ec032b54e8e77291824ee27f19854:2dca796feff0fcb7d25dcb227075cd8ad9f6d8dfc7973f8072ca";

    private static AesGcmFieldCipher Cipher(string? key) => new(new FieldEncryptionOptions(key));

    [Fact]
    public void Decrypts_a_known_Node_produced_value()
    {
        Assert.Equal(Plaintext, Cipher(KeyHex).Decrypt(NodeValue));
    }

    [Fact]
    public void Base64_key_derives_the_same_32_bytes_as_hex()
    {
        // The base64 form of the same key must decrypt the Node vector identically (base64 → first-32-bytes branch).
        Assert.Equal(Plaintext, Cipher(KeyBase64).Decrypt(NodeValue));
    }

    [Theory]
    [InlineData("")]
    [InlineData("a")]
    [InlineData("Bearer sk-1234567890")]
    [InlineData("unicode éüñ \U0001f511 end")]
    public void Round_trips_plaintext(string plaintext)
    {
        var cipher = Cipher(KeyHex);
        Assert.Equal(plaintext, cipher.Decrypt(cipher.Encrypt(plaintext)));
    }

    [Fact]
    public void Encrypt_emits_node_format_with_16_byte_iv()
    {
        var value = Cipher(KeyHex).Encrypt("secret");
        var parts = value.Split(':');

        Assert.Equal(3, parts.Length);
        Assert.Equal(32, parts[0].Length);                     // 16-byte IV → 32 hex chars
        Assert.Equal(32, parts[1].Length);                     // 16-byte (128-bit) tag → 32 hex chars
        Assert.Equal(value.ToLowerInvariant(), value);         // lowercase hex, like Node's toString("hex")
        Assert.True(Cipher(KeyHex).IsEncrypted(value));        // Node isEncrypted recognises a 16-byte IV
    }

    [Fact]
    public void Encrypt_uses_a_fresh_iv_each_call()
    {
        var cipher = Cipher(KeyHex);
        Assert.NotEqual(cipher.Encrypt("secret"), cipher.Encrypt("secret"));
    }

    [Theory]
    [InlineData("aabbccddeeff00112233445566778899:870ec032b54e8e77291824ee27f19854:2dca", true)] // 16-byte IV
    [InlineData("aabbccddeeff001122334455:tag:ct", false)]  // 12-byte IV (24 hex) → NOT recognised (Node parity)
    [InlineData("nothex0011223344556677889900aabb:tag:ct", false)] // non-hex first part
    [InlineData("aabb:tag", false)]                          // only 2 parts
    public void IsEncrypted_matches_node(string value, bool expected)
    {
        Assert.Equal(expected, Cipher(KeyHex).IsEncrypted(value));
    }

    [Fact]
    public void Missing_key_throws_only_on_encrypt_not_construction()
    {
        var cipher = Cipher(null);                 // construction must NOT throw (lazy key derivation)
        Assert.Throws<InvalidOperationException>(() => cipher.Encrypt("secret"));
    }

    [Fact]
    public void Tampered_ciphertext_fails_the_tag_check()
    {
        var cipher = Cipher(KeyHex);
        var value = cipher.Encrypt("secret");
        var parts = value.Split(':');
        // Flip the last ciphertext nibble → GCM tag verification must fail.
        var tampered = $"{parts[0]}:{parts[1]}:{parts[2][..^1]}{(parts[2][^1] == '0' ? '1' : '0')}";
        Assert.ThrowsAny<Exception>(() => cipher.Decrypt(tampered));
    }
}
