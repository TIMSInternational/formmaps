using FormMaps.Application.Auth;
using Xunit;

namespace FormMaps.UnitTests.Auth;

public class SessionPolicyTests
{
    private static readonly DateTime Now = new(2026, 9, 28, 12, 0, 0, DateTimeKind.Utc);

    [Theory]
    [InlineData(null, null, 12)]         // nothing configured -> 12h
    [InlineData("8", null, 8)]           // Auth:SessionMaxHours
    [InlineData(null, "24", 24)]         // SESSION_MAX_HOURS, the Node service's env name
    [InlineData("6", "24", 6)]           // config wins over env
    [InlineData("0", "24", 24)]          // invalid config falls through to env
    [InlineData("-3", null, 12)]         // negative -> default
    [InlineData("twelve", "abc", 12)]    // garbage everywhere -> default, never a startup failure
    [InlineData(" 10 ", null, 10)]       // whitespace tolerated
    [InlineData("1.5", null, 12)]        // whole hours only
    public void FromSettings_ResolvesHours_WithFallbackToTwelve(string? configured, string? env, int expectedHours)
    {
        Assert.Equal(TimeSpan.FromHours(expectedHours), SessionPolicy.FromSettings(configured, env).MaxSessionLength);
    }

    [Fact]
    public void Default_IsTwelveHours()
    {
        Assert.Equal(TimeSpan.FromHours(12), SessionPolicy.Default.MaxSessionLength);
    }

    [Fact]
    public void NewDeadline_IsNowPlusTheMaxSession()
    {
        Assert.Equal(Now.AddHours(12), SessionPolicy.Default.NewDeadline(Now));
    }

    [Fact]
    public void CapRotation_InheritsAnEarlierDeadline()
    {
        var signIn = Now.AddHours(3);
        Assert.Equal(signIn, SessionPolicy.Default.CapRotation(signIn, Now));
    }

    [Fact]
    public void CapRotation_CapsALegacyFourteenDayToken_ToOneSessionFromNow()
    {
        Assert.Equal(Now.AddHours(12), SessionPolicy.Default.CapRotation(Now.AddDays(14), Now));
    }

    [Fact]
    public void CapRotation_NeverExtends_UnderALongerPolicy()
    {
        var signIn = Now.AddMinutes(30);
        Assert.Equal(signIn, new SessionPolicy(TimeSpan.FromDays(7)).CapRotation(signIn, Now));
    }

    [Fact]
    public void Constructor_RejectsANonPositiveLength()
    {
        Assert.Throws<ArgumentOutOfRangeException>(() => new SessionPolicy(TimeSpan.Zero));
    }
}
