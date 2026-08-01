using FormMaps.Application.Auth;
using Xunit;

namespace FormMaps.UnitTests.Auth;

public class RefreshTokenGeneratorTests
{
    [Fact]
    public void Generate_ProducesUnique64ByteBase64UrlStrings()
    {
        var a = RefreshTokenGenerator.Generate();
        var b = RefreshTokenGenerator.Generate();
        Assert.NotEqual(a, b);
        Assert.DoesNotContain('+', a);
        Assert.DoesNotContain('/', a);
    }
}
