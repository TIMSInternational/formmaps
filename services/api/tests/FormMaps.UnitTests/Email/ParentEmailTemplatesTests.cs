using FormMaps.Application.Email;
using Xunit;

namespace FormMaps.UnitTests.Email;

/// <summary>
/// audit 2026-10-09 C8b/C8: the parent-portal invitation and the "you've been linked" notice the student parent-invite
/// now sends. Copy is textually identical to legacy lib/email.ts sendParentInviteEmail (48h → "2 days") /
/// sendParentLinkedNotificationEmail, in both languages; names are escaped in the body.
/// </summary>
public sealed class ParentEmailTemplatesTests
{
    private static readonly EmailTemplates Templates = new(new EmailOptions(
        "noreply@formmaps.com", "https://app.formmaps.com", "https://app.formmaps.ai", "logo", "postal-addr", "us-east-1"));

    [Fact]
    public void Invite_english()
    {
        var m = Templates.BuildParentInvite("Ana", "Kid <b>", "https://app.formmaps.ai/parent/onboarding?token=t1", "en");
        Assert.Equal("FormMaps — Parent Portal Access for Kid <b>", m.Subject);
        Assert.Contains("Hello Ana,", m.Html);
        Assert.Contains("You have been invited to access the parent portal for <strong>Kid &lt;b&gt;</strong>.", m.Html);
        Assert.Contains("Set Up Parent Account", m.Html);
        Assert.Contains("href=\"https://app.formmaps.ai/parent/onboarding?token=t1\"", m.Html);
        Assert.Contains("This invitation link expires in 2 days.", m.Html);
    }

    [Fact]
    public void Invite_spanish_is_the_default_and_handles_missing_names()
    {
        var m = Templates.BuildParentInvite("", "", "https://x/parent/onboarding?token=t1");
        Assert.Equal("FormMaps — Acceso al portal de padres para tu hijo/a", m.Subject);
        Assert.Contains("Hola:", m.Html);
        Assert.Contains("Crear mi cuenta", m.Html);
        Assert.Contains("Este enlace de invitación vence en 2 días.", m.Html);
    }

    [Fact]
    public void Linked_notice_both_languages()
    {
        var en = Templates.BuildParentLinked("", "Kid", "en");
        Assert.Equal("FormMaps — You've been linked to Kid", en.Subject);
        Assert.Contains("Hello Parent,", en.Html);
        Assert.Contains("href=\"https://app.formmaps.com/parent\"", en.Html);
        Assert.Contains("If you did not expect this, please contact the school.", en.Html);
        Assert.DoesNotContain("token=", en.Html);

        var es = Templates.BuildParentLinked("Ana", "", "es");
        Assert.Equal("FormMaps — Tu cuenta quedó vinculada a un/a estudiante", es.Subject);
        Assert.Contains("Hola, Ana:", es.Html);
        Assert.Contains("Abrir el portal de padres", es.Html);
    }
}
