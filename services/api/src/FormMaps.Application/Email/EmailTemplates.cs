using System.Text;

namespace FormMaps.Application.Email;

/// <summary>
/// Pure HTML email builders — faithful port of the live TS lib/email.ts template helpers (wrap/button/escapeHtml),
/// the senders this slice needs (sendEvaluationInviteEmail, sendAssessmentReminderEmail, sendReportEmail,
/// sendPasswordResetEmail), and the two inline auth-notification templates embedded at their call sites in
/// authService.ts (account-locked, password-changed). Deterministic given <see cref="EmailOptions"/> so the
/// subjects, escaped names, list items, and button URLs are byte-testable.
/// </summary>
public sealed class EmailTemplates(EmailOptions options)
{
    // Brand palette — shared with the app + marketing site (lib/email.ts).
    private const string Navy = "#102B47";
    private const string Teal = "#2E9098";
    private const string Cream = "#F2F0E7";

    /// <summary>360° evaluator invite — mirrors sendEvaluationInviteEmail (email.ts:204). studentName is RAW in
    /// the subject (matches TS) and escaped in the body.</summary>
    public EmailMessage BuildEvaluationInvite(string evaluatorName, string studentName, string invitationUrl)
    {
        var subject = $"360° Evaluation Request for {studentName}";
        var body =
            $"""
                <h2 style="color:#102B47">Hello {EscapeHtml(evaluatorName)},</h2>
                <p>You have been invited to complete a 360° evaluation for <strong>{EscapeHtml(studentName)}</strong>.</p>
                <p>Your feedback is valuable and will help guide their career development.</p>
                {Button(invitationUrl, "Complete Evaluation")}
                <p>This link expires in 7 days. The evaluation takes approximately 10 minutes.</p>
            """;
        return new EmailMessage(subject, Wrap(body));
    }

    /// <summary>Assessment reminder — mirrors sendAssessmentReminderEmail (email.ts:251). Note schoolName IS
    /// escaped in the subject here (unlike the invite's raw studentName) — replicated exactly.</summary>
    public EmailMessage BuildAssessmentReminder(string studentName, string schoolName, IReadOnlyList<string> pendingAssessments)
    {
        var list = new StringBuilder();
        foreach (var a in pendingAssessments)
        {
            list.Append($"<li>{EscapeHtml(a)}</li>");
        }

        var subject = $"FormMaps — Assessment Reminder from {EscapeHtml(schoolName)}";
        var body =
            $"""
                <h2 style="color:#102B47">Hi {EscapeHtml(studentName)},</h2>
                <p>Your school requires you to complete the following assessments:</p>
                <ul>{list}</ul>
                <p>Please log in and complete them as soon as possible.</p>
                {Button(options.FrontendUrl + "/dashboard/assessments", "Go to Assessments")}
            """;
        return new EmailMessage(subject, Wrap(body));
    }

    /// <summary>Report-ready notification — mirrors sendReportEmail (email.ts:243). studentName is RAW in the
    /// subject (matches TS) and escaped in the body, same asymmetry as BuildEvaluationInvite. The body content is
    /// a FIXED canned paragraph in legacy (report.ts always passes the same literal reportHtml) — not a
    /// caller-supplied parameter, so it isn't one here either.</summary>
    public EmailMessage BuildReportEmail(string studentName)
    {
        var subject = $"FormMaps — Student Report for {studentName}";
        var body =
            $"""
                <h2 style="color:#102B47">Student Report: {EscapeHtml(studentName)}</h2>
                <p>Your latest assessment report is ready. Log in to view your full results.</p>
                <p>Log in to view the full report: <a href="{options.FrontendUrl}/dashboard">{options.FrontendUrl}/dashboard</a></p>
            """;
        return new EmailMessage(subject, Wrap(body));
    }

    /// <summary>Password reset link — mirrors sendPasswordResetEmail (email.ts:267-274). NOTE: legacy interpolates
    /// {name} into this body RAW (no escapeHtml call, unlike every other sender in email.ts) — a latent XSS gap.
    /// This port deliberately deviates and always escapes userName, per the plan's explicit security requirement;
    /// subject and all other copy are byte-faithful.</summary>
    public EmailMessage BuildPasswordReset(string userName, string resetUrl)
    {
        const string subject = "FormMaps — Password Reset";
        var body =
            $"""
                <h2 style="color:#102B47">Hello {EscapeHtml(userName)},</h2>
                <p>We received a request to reset your password.</p>
                {Button(resetUrl, "Reset Password")}
                <p>If you did not request this, you can safely ignore this email. The link expires in 1 hour.</p>
            """;
        return new EmailMessage(subject, Wrap(body));
    }

    /// <summary>Account-lockout notice — mirrors the inline HTML sent from authService.ts login() right after a
    /// 5th failed attempt locks the account (~line 83-90). Legacy sends this as a bare, unwrapped
    /// Arial/#333 div (not via wrap()/button()) with a plain inline &lt;a&gt; link — this port normalizes it onto
    /// the same Wrap/Button/Navy primitives the rest of this file already uses (per the plan's explicit
    /// instruction), preserving every line of legacy copy verbatim. No user-controlled input here (only the
    /// server-generated forgotPasswordUrl), so there is nothing to escape.</summary>
    public EmailMessage BuildAccountLocked(string forgotPasswordUrl)
    {
        const string subject = "FormMaps — Account Locked";
        var body =
            $"""
                <h2 style="color:#102B47">Account Temporarily Locked</h2>
                <p>Your FormMaps account was locked after multiple failed login attempts. It will be unlocked automatically in 15 minutes.</p>
                <p>If this wasn't you, we recommend resetting your password immediately.</p>
                {Button(forgotPasswordUrl, "Reset Password")}
                <p>This is an automated security notification from FormMaps.</p>
            """;
        return new EmailMessage(subject, Wrap(body));
    }

    /// <summary>Password-changed notice — mirrors the inline HTML sent from authService.ts changePassword()
    /// (~line 225-232). Legacy already escapes the name (escapeHtml(user.name)), so that part carries over as-is;
    /// same Wrap/Navy normalization as BuildAccountLocked applies here (legacy is a bare unwrapped div). The
    /// changedByAdmin ternary ("changed by an administrator" vs "successfully updated") matches legacy's
    /// isAdminAction check exactly.</summary>
    public EmailMessage BuildPasswordChanged(string userName, bool changedByAdmin)
    {
        const string subject = "FormMaps — Password Changed";
        var reason = changedByAdmin ? "changed by an administrator" : "successfully updated";
        var body =
            $"""
                <h2 style="color:#102B47">Password Changed</h2>
                <p>Hi {EscapeHtml(userName)},</p>
                <p>Your password was {reason}. If you did not make this change, please contact support immediately.</p>
                <p>This is an automated security notification from FormMaps.</p>
            """;
        return new EmailMessage(subject, Wrap(body));
    }

    // ── template primitives (lib/email.ts wrap/button) ──────────────────

    public string Wrap(string body) =>
        $"""
        <div style="margin:0;padding:0;background:{Cream};">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:{Cream};padding:24px 12px;">
              <tr><td align="center">
                <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 4px rgba(16,43,71,0.10);">
                  <tr><td style="background:{Navy};padding:22px 32px;text-align:center;">
                    <img src="{options.LogoUrl}" alt="FormMaps" height="30" style="height:30px;display:inline-block;border:0;" />
                  </td></tr>
                  <tr><td style="padding:32px;font-family:'Poppins',Helvetica,Arial,sans-serif;color:{Navy};font-size:15px;line-height:1.65;">
                    {body}
                  </td></tr>
                  <tr><td style="padding:18px 32px;border-top:1px solid #ececec;font-family:Helvetica,Arial,sans-serif;">
                    <p style="color:#8a8a8a;font-size:12px;margin:0">This is an automated message from FormMaps. Please do not reply.</p>
                    <p style="color:#b3b3b3;font-size:11px;margin:8px 0 0">{options.PostalAddress}</p>
                  </td></tr>
                </table>
              </td></tr>
            </table>
          </div>
        """;

    public static string Button(string url, string label) =>
        $"""
        <div style="text-align:center;margin:28px 0">
            <a href="{url}" style="background:#102B47;color:#ffffff;padding:13px 34px;text-decoration:none;border-radius:10px;display:inline-block;font-weight:700;font-family:'Poppins',Helvetica,Arial,sans-serif">{label}</a>
          </div>
          <p style="color:#2E9098;word-break:break-all;font-size:12px;text-align:center">{url}</p>
        """;

    /// <summary>Exact port of lib/sanitize.ts escapeHtml — the 5-char map ('→&#x27;), NOT HtmlEncoder.Default
    /// (which over-encodes). Byte-parity with the stored/sent HTML matters for template tests.</summary>
    public static string EscapeHtml(string input)
    {
        var sb = new StringBuilder(input.Length);
        foreach (var ch in input)
        {
            sb.Append(ch switch
            {
                '&' => "&amp;",
                '<' => "&lt;",
                '>' => "&gt;",
                '"' => "&quot;",
                '\'' => "&#x27;",
                _ => ch.ToString(),
            });
        }

        return sb.ToString();
    }
}
