using System.Globalization;
using FormMaps.Application.Email;

namespace FormMaps.Application.Recommendations;

/// <summary>
/// Letter-of-recommendation email templates — port of services/recommendationEmails.ts. Every user-controlled value
/// (names, relationship, message, decline reason) is HTML-escaped before interpolation, exactly as legacy does; the
/// shell is the shared <see cref="EmailTemplates.Wrap"/> / <see cref="EmailTemplates.Button"/> branding.
///
/// <para>The button target is <c>{FRONTEND_BASE_URL || "https://app.formmaps.ai"}/login</c>. That is
/// <see cref="EmailOptions.InviteBaseUrl"/> — the RAW, non-trailing-slash-stripped variant with the <c>.ai</c>
/// fallback — NOT <see cref="EmailOptions.FrontendUrl"/> (whose fallback is <c>.com</c>). Legacy declares its own
/// module-level constant with the .ai fallback (recommendationEmails.ts:11), so this is the matching one.</para>
///
/// <para>DIVERGENCE RECORDED, NOT MADE: legacy renders the due date and the submitted date with JavaScript's
/// <c>Date.prototype.toLocaleDateString()</c> — i.e. the Node process's ICU default locale AND its local timezone.
/// Reproducing "whatever the container happens to be configured as" is not portable, so this renders the en-US
/// default shape (M/d/yyyy) from the UTC value. Under the deployed configuration (TZ unset ⇒ UTC, no LANG ⇒ en-US)
/// the two agree; a container with a non-UTC TZ or a non-en locale would differ by a day boundary or a format.</para>
/// </summary>
public sealed class RecommendationEmails(EmailTemplates templates, EmailOptions options)
{
    private string LoginUrl => $"{options.InviteBaseUrl}/login";

    /// <summary>sendRequestEmail — to the recommender when a student asks (recommendationEmails.ts:13).</summary>
    public EmailMessage BuildRequest(
        string? recommenderName, string studentName, string relationship, string requestMessage, DateTime? dueDate)
    {
        // NOTE the escaping quirk, ported verbatim: legacy escapes the ALREADY-composed dueDateStr, so the leading
        // " Due date: " literal passes through escapeHtml too. Harmless (no metacharacters), but it is what runs.
        var dueDateStr = dueDate is null ? "" : $" Due date: {LocaleDate(dueDate.Value)}.";
        var subject = $"FormMaps — Letter of Recommendation Request from {studentName}";
        var body =
            $"""

                  <h2 style="color:#102B47">Hello {EmailTemplates.EscapeHtml(recommenderName ?? "")},</h2>
                  <p><strong>{EmailTemplates.EscapeHtml(studentName)}</strong> has requested a letter of recommendation from you.</p>
                  <p><strong>Relationship:</strong> {EmailTemplates.EscapeHtml(relationship)}</p>
                  <p><strong>Message:</strong> {EmailTemplates.EscapeHtml(requestMessage)}{EmailTemplates.EscapeHtml(dueDateStr)}</p>
                  <p>Please log in to FormMaps to accept or decline this request.</p>
                  {EmailTemplates.Button(LoginUrl, "Respond to Request")}

            """;
        return new EmailMessage(subject, templates.Wrap(body));
    }

    /// <summary>sendRespondEmail — to the student on accept/decline (recommendationEmails.ts:37).</summary>
    public EmailMessage BuildRespond(string? studentName, string? recommenderName, bool accepted, string? declineReason)
    {
        var recommender = EmailTemplates.EscapeHtml(recommenderName ?? "Your recommender");
        var student = EmailTemplates.EscapeHtml(studentName ?? "");

        if (accepted)
        {
            var acceptBody =
                $"""

                        <h2 style="color:#102B47">Good news, {student}!</h2>
                        <p><strong>{recommender}</strong> has <strong style="color:#16a34a">accepted</strong> your letter of recommendation request.</p>
                        <p>They will begin working on your letter. You will be notified once it has been submitted.</p>
                        {EmailTemplates.Button(LoginUrl, "View My Requests")}

                """;
            return new EmailMessage("FormMaps — Your Recommendation Request was Accepted", templates.Wrap(acceptBody));
        }

        // JS truthiness: an EMPTY decline reason renders no reason paragraph at all (`opts.declineReason ? ... : ""`).
        var reasonHtml = string.IsNullOrEmpty(declineReason)
            ? ""
            : $"<p><strong>Reason:</strong> {EmailTemplates.EscapeHtml(declineReason)}</p>";
        var declineBody =
            $"""

                  <h2 style="color:#102B47">Hello {student},</h2>
                  <p><strong>{recommender}</strong> has <strong style="color:#dc2626">declined</strong> your letter of recommendation request.</p>
                  {reasonHtml}
                  <p>You may wish to reach out to another recommender.</p>
                  {EmailTemplates.Button(LoginUrl, "View My Requests")}

            """;
        return new EmailMessage("FormMaps — Your Recommendation Request was Declined", templates.Wrap(declineBody));
    }

    /// <summary>sendSubmittedEmail — to the student once the letter exists (recommendationEmails.ts:74).</summary>
    public EmailMessage BuildSubmitted(string? studentName, string? recommenderName, DateTime submittedOn)
    {
        var body =
            $"""

                  <h2 style="color:#102B47">Great news, {EmailTemplates.EscapeHtml(studentName ?? "")}!</h2>
                  <p><strong>{EmailTemplates.EscapeHtml(recommenderName ?? "Your recommender")}</strong> has <strong style="color:#16a34a">submitted</strong> your letter of recommendation.</p>
                  <p>Submitted on: {LocaleDate(submittedOn)}</p>
                  {EmailTemplates.Button(LoginUrl, "View My Requests")}

            """;
        return new EmailMessage("FormMaps — Your Letter of Recommendation has been Submitted", templates.Wrap(body));
    }

    /// <summary>The en-US default of JS <c>toLocaleDateString()</c>: M/d/yyyy, no leading zeros.</summary>
    private static string LocaleDate(DateTime value) =>
        value.ToString("M/d/yyyy", CultureInfo.InvariantCulture);
}
