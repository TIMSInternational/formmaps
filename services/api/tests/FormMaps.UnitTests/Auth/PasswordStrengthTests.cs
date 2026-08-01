using FormMaps.Application.Auth;

namespace FormMaps.UnitTests.Auth;

public class PasswordStrengthTests
{
    [Theory]
    [InlineData("short1A!", null)] // exactly 8 chars, valid
    [InlineData("Valid123!", null)]
    [InlineData("nouppercase1!", "Password must contain an uppercase letter")]
    [InlineData("NOLOWERCASE1!", "Password must contain a lowercase letter")]
    [InlineData("NoDigitsHere!", "Password must contain a digit")]
    [InlineData("NoSpecial123", "Password must contain a special character")]
    [InlineData("Sh0rt!", "Password must be at least 8 characters")]
    public void Validate_MatchesLegacyRules(string password, string? expectedError)
    {
        Assert.Equal(expectedError, PasswordStrength.Validate(password));
    }
}
