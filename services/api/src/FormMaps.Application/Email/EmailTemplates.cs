using System.Text;

namespace FormMaps.Application.Email;

/// <summary>
/// Pure HTML email builders — faithful port of the live TS lib/email.ts template helpers (wrap/button/escapeHtml)
/// and the two senders this slice needs (sendEvaluationInviteEmail, sendAssessmentReminderEmail). Deterministic
/// given <see cref="EmailOptions"/> so the subjects, escaped names, list items, and button URLs are byte-testable.
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
