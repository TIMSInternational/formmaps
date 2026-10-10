using FormMaps.Api.Endpoints;
using FormMaps.Application.Email;

namespace FormMaps.UnitTests.StudentParents;

/// <summary>Audit F: invite links must never fall back to the dead app.formmaps.ai domain.</summary>
public sealed class ParentInvitationUrlTests
{
    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void Unset_base_url_falls_back_to_the_live_app(string? configured)
    {
        Assert.Equal("https://app.formmaps.com/parent/onboarding?token=t1", StudentParentEndpoints.ParentInvitationUrl(configured, "t1"));
    }

    [Fact]
    public void Configured_base_url_is_used_with_trailing_slashes_stripped()
    {
        Assert.Equal("https://staging.example.test/parent/onboarding?token=t1",
            StudentParentEndpoints.ParentInvitationUrl(" https://staging.example.test// ", "t1"));
    }

    [Fact]
    public void Email_invite_base_defaults_to_the_live_app()
    {
        Assert.Equal("https://app.formmaps.com", EmailOptions.DefaultInviteBaseUrl);
        Assert.Equal(EmailOptions.DefaultFrontendUrl, EmailOptions.DefaultInviteBaseUrl);
    }
}
