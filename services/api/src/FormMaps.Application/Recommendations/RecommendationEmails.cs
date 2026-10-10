using System.Globalization;
using FormMaps.Application.Email;

namespace FormMaps.Application.Recommendations;

/// <summary>
/// Letter-of-recommendation email templates — port of services/recommendationEmails.ts. Every user-controlled value
/// (names, relationship, message, decline reason) is HTML-escaped before interpolation, exactly as legacy does; the
/// shell is the shared <see cref="EmailTemplates.Wrap"/> / <see cref="EmailTemplates.Button"/> branding.
///
/// <para>The button target is <c>{frontendBaseUrl()}/login</c>, i.e. <see cref="EmailOptions.InviteBaseUrl"/>. Audit F
/// moved both legacy (recommendationEmails.ts) and this port off the dead <c>.ai</c> fallback onto the live app.</para>
///
/// <para>DIVERGENCE RECORDED, NOT MADE: legacy renders the due date and the submitted date with JavaScript's
/// <c>Date.prototype.toLocaleDateString()</c> — i.e. the Node process's ICU default locale AND its local timezone.
/// Reproducing "whatever the container happens to be configured as" is not portable, so this renders the en-US
/// default shape (M/d/yyyy) from the UTC value. Under the deployed configuration (TZ unset ⇒ UTC, no LANG ⇒ en-US)
/// the two agree; a container with a non-UTC TZ or a non-en locale would differ by a day boundary or a format.
/// Spanish dates are d/M/yyyy from the UTC value on BOTH sides (deterministic, the Colombian order).</para>
///
/// <para>BILINGUAL: each builder takes the RECIPIENT's language (the recommender's for the request, the student's for
/// the three replies) per <see cref="EmailLanguage"/>. Every sentence is textually identical to the legacy
/// recommendationEmails.ts COPY table — change both together.</para>
/// </summary>
public sealed class RecommendationEmails(EmailTemplates templates, EmailOptions options)
{
    private string LoginUrl => $"{options.InviteBaseUrl}/login";

    private static bool Es(string language) => EmailLanguage.OrDefault(language) == EmailLanguage.Spanish;

    /// <summary>sendRequestEmail — to the recommender when a student asks (recommendationEmails.ts).</summary>
    public EmailMessage BuildRequest(
        string? recommenderName, string studentName, string relationship, string requestMessage, DateTime? dueDate,
        string language = EmailLanguage.Default)
    {
        var es = Es(language);
        var student = string.IsNullOrEmpty(studentName) ? (es ? "Un/a estudiante" : "A student") : studentName;
        // NOTE the escaping quirk, ported verbatim: legacy escapes the ALREADY-composed dueDateStr, so the leading
        // " Due date: " literal passes through escapeHtml too. Harmless (no metacharacters), but it is what runs.
        var dueDateStr = dueDate is null
            ? ""
            : es ? $" Fecha límite: {LocaleDate(dueDate.Value, language)}." : $" Due date: {LocaleDate(dueDate.Value, language)}.";
        var subject = es
            ? $"FormMaps — Solicitud de carta de recomendación de {student}"
            : $"FormMaps — Letter of Recommendation Request from {student}";
        var hello = EmailTemplates.Hello(EmailTemplates.EscapeHtml(recommenderName ?? ""), language);
        var requested = es
            ? $"<strong>{EmailTemplates.EscapeHtml(student)}</strong> te pidió una carta de recomendación."
            : $"<strong>{EmailTemplates.EscapeHtml(student)}</strong> has requested a letter of recommendation from you.";
        var relationshipLabel = es ? "Relación:" : "Relationship:";
        var messageLabel = es ? "Mensaje:" : "Message:";
        var please = es
            ? "Inicia sesión en FormMaps para aceptar o rechazar esta solicitud."
            : "Please log in to FormMaps to accept or decline this request.";
        var cta = es ? "Responder a la solicitud" : "Respond to Request";
        var body =
            $"""

                  <h2 style="color:#102B47">{hello}</h2>
                  <p>{requested}</p>
                  <p><strong>{relationshipLabel}</strong> {EmailTemplates.EscapeHtml(relationship)}</p>
                  <p><strong>{messageLabel}</strong> {EmailTemplates.EscapeHtml(requestMessage)}{EmailTemplates.EscapeHtml(dueDateStr)}</p>
                  <p>{please}</p>
                  {EmailTemplates.Button(LoginUrl, cta)}

            """;
        return new EmailMessage(subject, templates.Wrap(body, language));
    }

    /// <summary>sendRespondEmail — to the student on accept/decline (recommendationEmails.ts).</summary>
    public EmailMessage BuildRespond(
        string? studentName, string? recommenderName, bool accepted, string? declineReason,
        string language = EmailLanguage.Default)
    {
        var es = Es(language);
        var recommender = EmailTemplates.EscapeHtml(recommenderName ?? (es ? "Tu recomendador/a" : "Your recommender"));
        var student = EmailTemplates.EscapeHtml(studentName ?? "");
        var cta = es ? "Ver mis solicitudes" : "View My Requests";

        if (accepted)
        {
            var goodNews = es
                ? (string.IsNullOrEmpty(student) ? "¡Buenas noticias!" : $"¡Buenas noticias, {student}!")
                : (string.IsNullOrEmpty(student) ? "Good news!" : $"Good news, {student}!");
            var acceptedLine = es
                ? $"""<strong>{recommender}</strong> <strong style="color:#16a34a">aceptó</strong> tu solicitud de carta de recomendación."""
                : $"""<strong>{recommender}</strong> has <strong style="color:#16a34a">accepted</strong> your letter of recommendation request.""";
            var next = es
                ? "Empezará a trabajar en tu carta. Te avisaremos cuando la haya enviado."
                : "They will begin working on your letter. You will be notified once it has been submitted.";
            var acceptBody =
                $"""

                        <h2 style="color:#102B47">{goodNews}</h2>
                        <p>{acceptedLine}</p>
                        <p>{next}</p>
                        {EmailTemplates.Button(LoginUrl, cta)}

                """;
            return new EmailMessage(
                es ? "FormMaps — Aceptaron tu solicitud de carta de recomendación" : "FormMaps — Your Recommendation Request was Accepted",
                templates.Wrap(acceptBody, language));
        }

        // JS truthiness: an EMPTY decline reason renders no reason paragraph at all (`opts.declineReason ? ... : ""`).
        var reasonHtml = string.IsNullOrEmpty(declineReason)
            ? ""
            : $"<p><strong>{(es ? "Motivo:" : "Reason:")}</strong> {EmailTemplates.EscapeHtml(declineReason)}</p>";
        var declinedLine = es
            ? $"""<strong>{recommender}</strong> <strong style="color:#dc2626">rechazó</strong> tu solicitud de carta de recomendación."""
            : $"""<strong>{recommender}</strong> has <strong style="color:#dc2626">declined</strong> your letter of recommendation request.""";
        var declinedNext = es ? "Puedes pedírsela a otra persona." : "You may wish to reach out to another recommender.";
        var declineBody =
            $"""

                  <h2 style="color:#102B47">{EmailTemplates.Hello(student, language)}</h2>
                  <p>{declinedLine}</p>
                  {reasonHtml}
                  <p>{declinedNext}</p>
                  {EmailTemplates.Button(LoginUrl, cta)}

            """;
        return new EmailMessage(
            es ? "FormMaps — Rechazaron tu solicitud de carta de recomendación" : "FormMaps — Your Recommendation Request was Declined",
            templates.Wrap(declineBody, language));
    }

    /// <summary>sendSubmittedEmail — to the student once the letter exists (recommendationEmails.ts).</summary>
    public EmailMessage BuildSubmitted(
        string? studentName, string? recommenderName, DateTime submittedOn, string language = EmailLanguage.Default)
    {
        var es = Es(language);
        var student = EmailTemplates.EscapeHtml(studentName ?? "");
        var greatNews = es
            ? (string.IsNullOrEmpty(student) ? "¡Excelentes noticias!" : $"¡Excelentes noticias, {student}!")
            : (string.IsNullOrEmpty(student) ? "Great news!" : $"Great news, {student}!");
        var recommender = EmailTemplates.EscapeHtml(recommenderName ?? (es ? "Tu recomendador/a" : "Your recommender"));
        var submittedLine = es
            ? $"""<strong>{recommender}</strong> <strong style="color:#16a34a">envió</strong> tu carta de recomendación."""
            : $"""<strong>{recommender}</strong> has <strong style="color:#16a34a">submitted</strong> your letter of recommendation.""";
        var submittedOnLine = es
            ? $"Fecha de envío: {LocaleDate(submittedOn, language)}"
            : $"Submitted on: {LocaleDate(submittedOn, language)}";
        var body =
            $"""

                  <h2 style="color:#102B47">{greatNews}</h2>
                  <p>{submittedLine}</p>
                  <p>{submittedOnLine}</p>
                  {EmailTemplates.Button(LoginUrl, es ? "Ver mis solicitudes" : "View My Requests")}

            """;
        return new EmailMessage(
            es ? "FormMaps — Ya enviaron tu carta de recomendación" : "FormMaps — Your Letter of Recommendation has been Submitted",
            templates.Wrap(body, language));
    }

    /// <summary>en: the en-US default of JS <c>toLocaleDateString()</c> (M/d/yyyy, no leading zeros). es: d/M/yyyy.</summary>
    private static string LocaleDate(DateTime value, string language) =>
        value.ToString(Es(language) ? "d/M/yyyy" : "M/d/yyyy", CultureInfo.InvariantCulture);
}
