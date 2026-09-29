using System.Text;

namespace FormMaps.Application.Email;

/// <summary>
/// Pure HTML email builders — faithful port of the live TS lib/email.ts template helpers (wrap/button/escapeHtml),
/// the senders this slice needs (sendEvaluationInviteEmail, sendAssessmentReminderEmail, sendReportEmail,
/// sendPasswordResetEmail), and the two auth notices (account-locked, password-changed; sendAccountLockedEmail /
/// sendPasswordChangedEmail in legacy). Deterministic given <see cref="EmailOptions"/> so the subjects, escaped
/// names, list items, and button URLs are byte-testable.
///
/// <para>BILINGUAL: every builder takes the recipient's language ("es" | "en", resolved by the caller with
/// <see cref="IEmailLanguageResolver"/> per the rule documented on <see cref="EmailLanguage"/>); omitted, it is
/// <see cref="EmailLanguage.Default"/> (Spanish). Every English and Spanish sentence here is textually identical to
/// its legacy lib/email.ts counterpart — change both together (EmailTemplatesTests / EmailTemplatesAuthTests pin
/// the same strings as the legacy email-bilingual.test.ts).</para>
/// </summary>
public sealed class EmailTemplates(EmailOptions options)
{
    // Brand palette — shared with the app + marketing site (lib/email.ts).
    private const string Navy = "#102B47";
    private const string Teal = "#2E9098";
    private const string Cream = "#F2F0E7";

    private static bool Es(string language) => EmailLanguage.OrDefault(language) == EmailLanguage.Spanish;

    /// <summary>"Hello Ana," / "Hola, Ana:" — and a greeting that still reads when the name is missing (legacy hello()).</summary>
    public static string Hello(string name, string language)
    {
        if (Es(language))
        {
            return string.IsNullOrEmpty(name) ? "Hola:" : $"Hola, {name}:";
        }

        return string.IsNullOrEmpty(name) ? "Hello," : $"Hello {name},";
    }

    /// <summary>360° evaluator invite — mirrors sendEvaluationInviteEmail. studentName is RAW in the subject
    /// (matches TS) and escaped in the body. <paramref name="language"/> is the EVALUATED STUDENT's, and the caller
    /// builds <paramref name="invitationUrl"/> with <see cref="EmailLanguage.EvaluatorInviteUrl"/> so the link
    /// carries the same lang. Tokens live 48h (TokenExpiryMs), so the copy says 48 hours (it used to say 7 days).</summary>
    public EmailMessage BuildEvaluationInvite(
        string evaluatorName, string studentName, string invitationUrl, string language = EmailLanguage.Default)
    {
        var es = Es(language);
        var student = string.IsNullOrEmpty(studentName) ? (es ? "el/la estudiante" : "the student") : studentName;
        var subject = es ? $"Solicitud de evaluación 360° para {student}" : $"360° Evaluation Request for {student}";
        var intro = es
            ? $"Te invitaron a completar una evaluación 360° de <strong>{EscapeHtml(student)}</strong>."
            : $"You have been invited to complete a 360° evaluation for <strong>{EscapeHtml(student)}</strong>.";
        var value = es
            ? "Tus comentarios son muy valiosos y ayudarán a orientar su desarrollo profesional."
            : "Your feedback is valuable and will help guide their career development.";
        var cta = es ? "Completar evaluación" : "Complete Evaluation";
        var footer = es
            ? "Este enlace vence en 48 horas. La evaluación toma aproximadamente 10 minutos."
            : "This link expires in 48 hours. The evaluation takes approximately 10 minutes.";
        var body =
            $"""
                <h2 style="color:#102B47">{Hello(EscapeHtml(evaluatorName), language)}</h2>
                <p>{intro}</p>
                <p>{value}</p>
                {Button(invitationUrl, cta)}
                <p>{footer}</p>
            """;
        return new EmailMessage(subject, Wrap(body, language));
    }

    /// <summary>Stable codes the school-admin pipeline sends as assessmentTypes (legacy ReminderAssessmentCode).</summary>
    public static string? ReminderAssessmentCode(string raw)
    {
        switch ((raw ?? string.Empty).Trim().ToLowerInvariant())
        {
            case "pca":
            case "pca (personal competence analysis)":
                return "pca";
            case "mil":
            case "mil (multiple intelligence lens)":
            case "mil (labor intelligence measurement)":
                return "mil";
            case "eval360":
            case "360":
            case "360 evaluation":
            case "360° evaluation":
                return "eval360";
            case "personality":
            case "personality assessment":
                return "personality";
            default:
                return null;
        }
    }

    /// <summary>Localised display name for a reminder code (legacy REMINDER_ASSESSMENT_NAMES).</summary>
    public static string ReminderAssessmentName(string code, string language) => (Es(language), code) switch
    {
        (false, "pca") => "PCA (Personal Competence Analysis)",
        (false, "mil") => "MIL (Labor Intelligence Measurement)",
        (false, "eval360") => "360° Evaluation",
        (false, "personality") => "Personality Assessment",
        (true, "pca") => "PCA (Análisis de Competencias Personales)",
        (true, "mil") => "MIL (Medición de Inteligencia Laboral)",
        (true, "eval360") => "Evaluación 360°",
        (true, "personality") => "Evaluación de personalidad",
        _ => code,
    };

    /// <summary>
    /// Localised, de-duplicated reminder list. Accepts the codes AND the English display strings the web client sent
    /// before it switched to codes (a browser still on the old bundle keeps working); anything else passes through
    /// as the caller's text (escaped by the builder). Mirrors legacy localizeReminderAssessments().
    /// </summary>
    public static IReadOnlyList<string> LocalizeReminderAssessments(IEnumerable<string> pending, string language)
    {
        var output = new List<string>();
        foreach (var raw in pending)
        {
            var code = ReminderAssessmentCode(raw);
            var label = code is null ? raw : ReminderAssessmentName(code, language);
            if (!output.Contains(label))
            {
                output.Add(label);
            }
        }

        return output;
    }

    /// <summary>Assessment reminder — mirrors sendAssessmentReminderEmail. Note schoolName IS escaped in the subject
    /// here (unlike the invite's raw studentName) — replicated exactly. <paramref name="language"/> is the student's.</summary>
    public EmailMessage BuildAssessmentReminder(
        string studentName, string schoolName, IReadOnlyList<string> pendingAssessments, string language = EmailLanguage.Default)
    {
        var es = Es(language);
        var list = new StringBuilder();
        foreach (var a in LocalizeReminderAssessments(pendingAssessments, language))
        {
            list.Append($"<li>{EscapeHtml(a)}</li>");
        }

        var subject = es
            ? $"FormMaps — Recordatorio de evaluaciones de {EscapeHtml(schoolName)}"
            : $"FormMaps — Assessment Reminder from {EscapeHtml(schoolName)}";
        var name = EscapeHtml(studentName);
        var hi = es ? (string.IsNullOrEmpty(name) ? "Hola:" : $"Hola, {name}:") : $"Hi {name},";
        var required = es
            ? "Tu colegio te pide completar las siguientes evaluaciones:"
            : "Your school requires you to complete the following assessments:";
        var please = es ? "Inicia sesión y complétalas lo antes posible." : "Please log in and complete them as soon as possible.";
        var cta = es ? "Ir a las evaluaciones" : "Go to Assessments";
        var body =
            $"""
                <h2 style="color:#102B47">{hi}</h2>
                <p>{required}</p>
                <ul>{list}</ul>
                <p>{please}</p>
                {Button(options.FrontendUrl + "/dashboard/assessments", cta)}
            """;
        return new EmailMessage(subject, Wrap(body, language));
    }

    /// <summary>Report-ready notification — mirrors sendReportEmail. studentName is RAW in the subject (matches TS)
    /// and escaped in the body, same asymmetry as BuildEvaluationInvite. The body is a FIXED canned paragraph (legacy
    /// report.ts only ever sent one literal) — now translated on both sides.</summary>
    public EmailMessage BuildReportEmail(string studentName, string language = EmailLanguage.Default)
    {
        var es = Es(language);
        var subject = es ? $"FormMaps — Informe de {studentName}" : $"FormMaps — Student Report for {studentName}";
        var heading = es ? $"Informe de {EscapeHtml(studentName)}" : $"Student Report: {EscapeHtml(studentName)}";
        var ready = es
            ? "Tu informe de evaluación más reciente está listo. Inicia sesión para ver todos tus resultados."
            : "Your latest assessment report is ready. Log in to view your full results.";
        var login = es ? "Inicia sesión para ver el informe completo:" : "Log in to view the full report:";
        var body =
            $"""
                <h2 style="color:#102B47">{heading}</h2>
                <p>{ready}</p>
                <p>{login} <a href="{options.FrontendUrl}/dashboard">{options.FrontendUrl}/dashboard</a></p>
            """;
        return new EmailMessage(subject, Wrap(body, language));
    }

    /// <summary>Password reset link — mirrors sendPasswordResetEmail. userName is always escaped (legacy used to
    /// interpolate it raw; it now escapes too, so both sides agree).</summary>
    public EmailMessage BuildPasswordReset(string userName, string resetUrl, string language = EmailLanguage.Default)
    {
        var es = Es(language);
        var subject = es ? "FormMaps — Restablecer contraseña" : "FormMaps — Password Reset";
        var requested = es ? "Recibimos una solicitud para restablecer tu contraseña." : "We received a request to reset your password.";
        var cta = es ? "Restablecer contraseña" : "Reset Password";
        var ignore = es
            ? "Si no la solicitaste, puedes ignorar este correo. El enlace vence en 1 hora."
            : "If you did not request this, you can safely ignore this email. The link expires in 1 hour.";
        var body =
            $"""
                <h2 style="color:#102B47">{Hello(EscapeHtml(userName), language)}</h2>
                <p>{requested}</p>
                {Button(resetUrl, cta)}
                <p>{ignore}</p>
            """;
        return new EmailMessage(subject, Wrap(body, language));
    }

    /// <summary>Account-lockout notice — mirrors sendAccountLockedEmail (legacy authService.login). Legacy sends a
    /// bare Arial/#333 div with an inline &lt;a&gt; around "resetting your password"; this port normalizes it onto the
    /// Wrap/Button primitives, so here the phrase is plain text followed by a button. Every sentence is otherwise
    /// the legacy copy. No user-controlled input (only the server-generated forgotPasswordUrl).</summary>
    public EmailMessage BuildAccountLocked(string forgotPasswordUrl, string language = EmailLanguage.Default)
    {
        var es = Es(language);
        var subject = es ? "FormMaps — Cuenta bloqueada" : "FormMaps — Account Locked";
        var heading = es ? "Cuenta bloqueada temporalmente" : "Account Temporarily Locked";
        var locked = es
            ? "Tu cuenta de FormMaps se bloqueó después de varios intentos fallidos de inicio de sesión. Se desbloqueará automáticamente en 15 minutos."
            : "Your FormMaps account was locked after multiple failed login attempts. It will be unlocked automatically in 15 minutes.";
        var advice = es
            ? "Si no fuiste tú, te recomendamos restablecer tu contraseña de inmediato."
            : "If this wasn't you, we recommend resetting your password immediately.";
        var cta = es ? "Restablecer contraseña" : "Reset Password";
        var body =
            $"""
                <h2 style="color:#102B47">{heading}</h2>
                <p>{locked}</p>
                <p>{advice}</p>
                {Button(forgotPasswordUrl, cta)}
                <p>{AutomatedSecurity(language)}</p>
            """;
        return new EmailMessage(subject, Wrap(body, language));
    }

    /// <summary>Password-changed notice — mirrors sendPasswordChangedEmail (legacy authService.changePassword). The
    /// name is escaped; same Wrap normalization as BuildAccountLocked. changedByAdmin picks the admin/self sentence
    /// exactly as legacy's isAdminAction does.</summary>
    public EmailMessage BuildPasswordChanged(string userName, bool changedByAdmin, string language = EmailLanguage.Default)
    {
        var es = Es(language);
        var subject = es ? "FormMaps — Contraseña cambiada" : "FormMaps — Password Changed";
        var heading = es ? "Contraseña cambiada" : "Password Changed";
        var name = EscapeHtml(userName);
        var hi = es ? (string.IsNullOrEmpty(name) ? "Hola:" : $"Hola, {name}:") : $"Hi {name},";
        var changed = es
            ? $"{(changedByAdmin ? "Un administrador cambió tu contraseña." : "Tu contraseña se actualizó correctamente.")} Si no hiciste este cambio, comunícate con soporte de inmediato."
            : $"Your password was {(changedByAdmin ? "changed by an administrator" : "successfully updated")}. If you did not make this change, please contact support immediately.";
        var body =
            $"""
                <h2 style="color:#102B47">{heading}</h2>
                <p>{hi}</p>
                <p>{changed}</p>
                <p>{AutomatedSecurity(language)}</p>
            """;
        return new EmailMessage(subject, Wrap(body, language));
    }

    private static string AutomatedSecurity(string language) => Es(language)
        ? "Esta es una notificación de seguridad automática de FormMaps."
        : "This is an automated security notification from FormMaps.";

    // ── template primitives (lib/email.ts wrap/button) ──────────────────

    /// <summary>Branded shell; <paramref name="language"/> only localises the footer (legacy wrap(body, undefined, lang)).</summary>
    public string Wrap(string body, string language = EmailLanguage.English)
    {
        var automated = Es(language)
            ? "Este es un mensaje automático de FormMaps. Por favor, no lo respondas."
            : "This is an automated message from FormMaps. Please do not reply.";
        return $"""
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
                    <p style="color:#8a8a8a;font-size:12px;margin:0">{automated}</p>
                    <p style="color:#b3b3b3;font-size:11px;margin:8px 0 0">{options.PostalAddress}</p>
                  </td></tr>
                </table>
              </td></tr>
            </table>
          </div>
        """;
    }

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
