using FormMaps.Application.Auth;

namespace FormMaps.UnitTests.Auth;

public class PasswordHasherTests
{
    [Fact]
    public void Hash_ProducesBcryptFormatHash_WorkFactor12()
    {
        var hash = PasswordHasher.Hash("Correct1!Horse");
        Assert.StartsWith("$2", hash); // $2a$/$2b$/$2y$
        Assert.Contains("$12$", hash);
    }

    [Fact]
    public void Verify_CorrectPassword_ReturnsValidTrue()
    {
        var hash = PasswordHasher.Hash("Correct1!Horse");
        var result = PasswordHasher.Verify("Correct1!Horse", hash);
        Assert.True(result.Valid);
        Assert.False(result.IsLegacyFormat);
    }

    [Fact]
    public void Verify_WrongPassword_ReturnsValidFalse()
    {
        var hash = PasswordHasher.Hash("Correct1!Horse");
        var result = PasswordHasher.Verify("WrongPassword1!", hash);
        Assert.False(result.Valid);
    }

    [Fact]
    public void Verify_LegacyNonBcryptHash_IsRejectedAsLegacyFormat_NeverThrows()
    {
        // Any hash not prefixed $2a$/$2b$/$2y$ — mirrors isLegacySha256Hash. Must never throw
        // (BCrypt.Verify on a malformed hash would throw without this guard).
        var result = PasswordHasher.Verify("anything", "5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d");
        Assert.False(result.Valid);
        Assert.True(result.IsLegacyFormat);
    }

    [Fact]
    public void Verify_CrossCompatibleWithLegacyBcryptjsHash()
    {
        // Fixture hash produced by legacy bcryptjs (formmaps-platform/api/src/lib/auth.ts,
        // bcrypt.hashSync("Correct1!Horse", 12)), regenerated for real via:
        //   node -e "const bcrypt=require('bcryptjs'); console.log(bcrypt.hashSync('Correct1!Horse',12));"
        // run against the actual legacy node_modules/bcryptjs install — proves BCrypt.Net-Next
        // and bcryptjs are truly interoperable, not just "the same algorithm name".
        const string legacyHash = "$2b$12$T5uQslphiMAO9wlKAjtQfuIvGpLt3.EqwrVeDCWhRd.aG0JQ1jlJu";
        var result = PasswordHasher.Verify("Correct1!Horse", legacyHash);
        Assert.True(result.Valid);
        Assert.False(result.IsLegacyFormat);
    }
}
