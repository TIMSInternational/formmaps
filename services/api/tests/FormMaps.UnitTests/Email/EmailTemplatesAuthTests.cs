using FormMaps.Application.Email;
using Xunit;

namespace FormMaps.UnitTests.Email;

/// <summary>
/// Byte-parity tests for the three auth email templates ported from legacy:
///   - PasswordReset  ← sendPasswordResetEmail (lib/email.ts:267)
///   - AccountLocked  ← inline lockout-notification HTML in authService.ts login() (~line 83)
///   - PasswordChanged← inline password-changed-notification HTML in authService.ts changePassword() (~line 225)
/// Pins subjects exactly as legacy, confirms EscapeHtml is applied to the user-controlled userName
/// field (XSS prevention — a real security requirement, not a formatting nicety), and confirms
/// resetUrl/forgotPasswordUrl are rendered verbatim via the Button(...) primitive.
/// </summary>
public sealed class EmailTemplatesAuthTests
{
    private static EmailTemplates Templates() => new(new EmailOptions(
        "noreply@formmaps.com", "https://app.formmaps.com", "https://app.formmaps.ai", "logo", "postal-addr", "us-east-1"));

    [Fact]
    public void PasswordReset_subject_matches_legacy_and_escapes_userName()
    {
        var msg = Templates().BuildPasswordReset(
            "<script>alert(1)</script>",
            "https://app.formmaps.com/reset-password?token=abc123");

        // Subject: exact legacy string (lib/email.ts:268 — em dash, "FormMaps — Password Reset").
        Assert.Equal("FormMaps — Password Reset", msg.Subject);

        // userName must be HTML-escaped — a name like <script> must never render unescaped in the email body.
        Assert.DoesNotContain("<script>alert(1)</script>", msg.Html);
        Assert.Contains("&lt;script&gt;alert(1)&lt;/script&gt;", msg.Html);

        // resetUrl appears verbatim via Button(...).
        Assert.Contains("https://app.formmaps.com/reset-password?token=abc123", msg.Html);
        Assert.Contains("Reset Password", msg.Html);

        // Legacy body copy preserved.
        Assert.Contains("We received a request to reset your password.", msg.Html);
        Assert.Contains("If you did not request this, you can safely ignore this email. The link expires in 1 hour.", msg.Html);
    }

    [Fact]
    public void AccountLocked_subject_matches_legacy_and_renders_forgotPasswordUrl_via_button()
    {
        var msg = Templates().BuildAccountLocked("https://app.formmaps.com/forgot-password");

        // Subject: exact legacy string (authService.ts:83 — "FormMaps — Account Locked").
        Assert.Equal("FormMaps — Account Locked", msg.Subject);

        // forgotPasswordUrl appears verbatim via Button(...).
        Assert.Contains("https://app.formmaps.com/forgot-password", msg.Html);

        // Legacy body copy preserved.
        Assert.Contains("Account Temporarily Locked", msg.Html);
        Assert.Contains("Your FormMaps account was locked after multiple failed login attempts. It will be unlocked automatically in 15 minutes.", msg.Html);
        Assert.Contains("This is an automated security notification from FormMaps.", msg.Html);
    }

    [Fact]
    public void PasswordChanged_subject_matches_legacy_and_escapes_userName_selfService()
    {
        var msg = Templates().BuildPasswordChanged("<b>Pat</b> & Co", changedByAdmin: false);

        // Subject: exact legacy string (authService.ts:225 — "FormMaps — Password Changed").
        Assert.Equal("FormMaps — Password Changed", msg.Subject);

        // userName must be HTML-escaped.
        Assert.DoesNotContain("<b>Pat</b>", msg.Html);
        Assert.Contains("&lt;b&gt;Pat&lt;/b&gt; &amp; Co", msg.Html);

        // Self-service phrasing (matches legacy's isAdminAction ? ... : "successfully updated").
        Assert.Contains("successfully updated", msg.Html);
        Assert.DoesNotContain("changed by an administrator", msg.Html);

        Assert.Contains("If you did not make this change, please contact support immediately.", msg.Html);
        Assert.Contains("This is an automated security notification from FormMaps.", msg.Html);
    }

    [Fact]
    public void PasswordChanged_admin_action_uses_admin_phrasing()
    {
        var msg = Templates().BuildPasswordChanged("Pat", changedByAdmin: true);

        Assert.Contains("changed by an administrator", msg.Html);
        Assert.DoesNotContain("successfully updated", msg.Html);
    }
}
