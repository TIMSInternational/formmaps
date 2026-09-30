using FormMaps.Application.Email;
using FormMaps.Application.Recommendations;
using Xunit;

namespace FormMaps.UnitTests.Email;

/// <summary>
/// Every .NET transactional email exists in English AND Spanish, and the copy is textually identical to the legacy
/// Node templates (the same subjects/sentences are pinned by fp-main api/src/__tests__/email-bilingual.test.ts).
/// Also pins the language rule (<see cref="EmailLanguage"/>), the 360° evaluator link's lang parameter, and the
/// reminder's code → name mapping (codes AND the old English display strings).
/// </summary>
public sealed class EmailTemplatesBilingualTests
{
    private static readonly EmailOptions Options = new(
        "noreply@formmaps.com", "https://app.formmaps.com", "https://app.formmaps.ai", "logo", "postal-addr", "us-east-1");

    private static EmailTemplates Templates() => new(Options);

    private static RecommendationEmails Recommendations() => new(Templates(), Options);

    // ---- the rule ----

    [Theory]
    [InlineData("es", "es")]
    [InlineData("spanish", "es")]
    [InlineData("Español", "es")]
    [InlineData("es-CO", "es")]
    [InlineData("sp", "es")]
    [InlineData("en", "en")]
    [InlineData("English", "en")]
    [InlineData("fr", null)]
    [InlineData(null, null)]
    public void Normalize_maps_saved_values(string? raw, string? expected) =>
        Assert.Equal(expected, EmailLanguage.Normalize(raw));

    [Fact]
    public void Default_is_Spanish_and_OrDefault_falls_back_to_it()
    {
        Assert.Equal("es", EmailLanguage.Default);
        Assert.Equal("es", EmailLanguage.OrDefault(null));
        Assert.Equal("es", EmailLanguage.OrDefault("klingon"));
        Assert.Equal("en", EmailLanguage.OrDefault("en"));
    }

    [Fact]
    public void Evaluator_link_carries_lang()
    {
        Assert.Equal("https://x/evaluation/evaluator?token=t&lang=es", EmailLanguage.EvaluatorInviteUrl("https://x", "t", "es"));
        Assert.Equal("https://x/evaluation/evaluator?token=t&lang=en", EmailLanguage.EvaluatorInviteUrl("https://x", "t", "english"));
        Assert.Equal("https://x/evaluation/evaluator?token=t&lang=es", EmailLanguage.EvaluatorInviteUrl("https://x", "t", "??"));
    }

    // ---- 360° evaluator invite ----

    [Fact]
    public void EvaluationInvite_Spanish()
    {
        var msg = Templates().BuildEvaluationInvite("Marta", "Ana", EmailLanguage.EvaluatorInviteUrl("https://x", "tok", "es"), "es");
        Assert.Equal("Solicitud de evaluación 360° para Ana", msg.Subject);
        Assert.Contains("Hola, Marta:", msg.Html);
        Assert.Contains("Te invitaron a completar una evaluación 360° de <strong>Ana</strong>.", msg.Html);
        Assert.Contains("Tus comentarios son muy valiosos y ayudarán a orientar su desarrollo profesional.", msg.Html);
        Assert.Contains("Completar evaluación", msg.Html);
        Assert.Contains("Este enlace vence en 48 horas. La evaluación toma aproximadamente 10 minutos.", msg.Html);
        Assert.Contains("Este es un mensaje automático de FormMaps. Por favor, no lo respondas.", msg.Html);
        Assert.Contains("token=tok&lang=es", msg.Html);
        Assert.DoesNotContain("Hello", msg.Html);
    }

    [Fact]
    public void EvaluationInvite_English_and_default_is_Spanish()
    {
        var en = Templates().BuildEvaluationInvite("Pat", "Ana", "u", "en");
        Assert.Equal("360° Evaluation Request for Ana", en.Subject);
        Assert.Contains("Hello Pat,", en.Html);
        Assert.Contains("This is an automated message from FormMaps. Please do not reply.", en.Html);

        Assert.Equal("Solicitud de evaluación 360° para Ana", Templates().BuildEvaluationInvite("Pat", "Ana", "u").Subject);
        Assert.Equal("Solicitud de evaluación 360° para el/la estudiante", Templates().BuildEvaluationInvite("Pat", "", "u", "es").Subject);
        Assert.Contains("Hola:", Templates().BuildEvaluationInvite("", "Ana", "u", "es").Html);
    }

    // ---- assessment reminder ----

    [Theory]
    [InlineData("pca", "pca")]
    [InlineData("MIL", "mil")]
    [InlineData("eval360", "eval360")]
    [InlineData("personality", "personality")]
    [InlineData("PCA (Personal Competence Analysis)", "pca")]
    [InlineData("MIL (Multiple Intelligence Lens)", "mil")]
    [InlineData("360 Evaluation", "eval360")]
    [InlineData("Personality Assessment", "personality")]
    [InlineData("Something else", null)]
    public void Reminder_accepts_codes_and_the_old_display_strings(string raw, string? code) =>
        Assert.Equal(code, EmailTemplates.ReminderAssessmentCode(raw));

    [Fact]
    public void Reminder_Spanish_from_codes()
    {
        var msg = Templates().BuildAssessmentReminder("Ana", "Colegio A&B", ["pca", "mil", "eval360", "personality"], "es");
        Assert.Equal("FormMaps — Recordatorio de evaluaciones de Colegio A&amp;B", msg.Subject);
        Assert.Contains("Hola, Ana:", msg.Html);
        Assert.Contains("Tu colegio te pide completar las siguientes evaluaciones:", msg.Html);
        Assert.Contains("<li>PCA (Análisis de Competencias Personales)</li>", msg.Html);
        Assert.Contains("<li>MIL (Medición de Inteligencia Laboral)</li>", msg.Html);
        Assert.Contains("<li>Evaluación 360°</li>", msg.Html);
        Assert.Contains("<li>Evaluación de personalidad</li>", msg.Html);
        Assert.Contains("Inicia sesión y complétalas lo antes posible.", msg.Html);
        Assert.Contains("Ir a las evaluaciones", msg.Html);
    }

    [Fact]
    public void Reminder_English_from_old_strings_never_shows_the_wrong_MIL_expansion_and_dedupes()
    {
        var msg = Templates().BuildAssessmentReminder("Ben", "Acme",
            ["MIL (Multiple Intelligence Lens)", "mil", "360 Evaluation", "Personality Assessment"], "en");
        Assert.Contains("<li>MIL (Labor Intelligence Measurement)</li>", msg.Html);
        Assert.Single(System.Text.RegularExpressions.Regex.Matches(msg.Html, "Labor Intelligence Measurement"));
        Assert.Contains("<li>360° Evaluation</li>", msg.Html);
        Assert.Contains("<li>Personality Assessment</li>", msg.Html);
        Assert.DoesNotContain("Multiple Intelligence Lens", msg.Html);
    }

    // ---- report / security ----

    [Fact]
    public void ReportEmail_Spanish()
    {
        var msg = Templates().BuildReportEmail("Ana", "es");
        Assert.Equal("FormMaps — Informe de Ana", msg.Subject);
        Assert.Contains("Tu informe de evaluación más reciente está listo. Inicia sesión para ver todos tus resultados.", msg.Html);
        Assert.Contains("Inicia sesión para ver el informe completo:", msg.Html);
    }

    [Fact]
    public void PasswordReset_Spanish()
    {
        var msg = Templates().BuildPasswordReset("<b>Ana</b>", "https://x/forgot-password?token=t", "es");
        Assert.Equal("FormMaps — Restablecer contraseña", msg.Subject);
        Assert.Contains("Hola, &lt;b&gt;Ana&lt;/b&gt;:", msg.Html);
        Assert.Contains("Recibimos una solicitud para restablecer tu contraseña.", msg.Html);
        Assert.Contains("Si no la solicitaste, puedes ignorar este correo. El enlace vence en 1 hora.", msg.Html);
    }

    [Fact]
    public void AccountLocked_Spanish()
    {
        var msg = Templates().BuildAccountLocked("https://x/forgot-password", "es");
        Assert.Equal("FormMaps — Cuenta bloqueada", msg.Subject);
        Assert.Contains("Cuenta bloqueada temporalmente", msg.Html);
        Assert.Contains("Tu cuenta de FormMaps se bloqueó después de varios intentos fallidos de inicio de sesión. Se desbloqueará automáticamente en 15 minutos.", msg.Html);
        Assert.Contains("Si no fuiste tú, te recomendamos restablecer tu contraseña de inmediato.", msg.Html);
        Assert.Contains("Esta es una notificación de seguridad automática de FormMaps.", msg.Html);
    }

    [Fact]
    public void PasswordChanged_Spanish_admin_and_self()
    {
        var admin = Templates().BuildPasswordChanged("Ana", changedByAdmin: true, language: "es");
        Assert.Equal("FormMaps — Contraseña cambiada", admin.Subject);
        Assert.Contains("Hola, Ana:", admin.Html);
        Assert.Contains("Un administrador cambió tu contraseña. Si no hiciste este cambio, comunícate con soporte de inmediato.", admin.Html);
        var self = Templates().BuildPasswordChanged("Ana", changedByAdmin: false, language: "es");
        Assert.Contains("Tu contraseña se actualizó correctamente.", self.Html);
    }

    // ---- letters of recommendation ----

    [Fact]
    public void Recommendation_request_Spanish_and_English()
    {
        var due = new DateTime(2026, 11, 5, 12, 0, 0, DateTimeKind.Utc);
        var es = Recommendations().BuildRequest("Sra. Díaz", "Ana", "Docente", "Gracias", due, "es");
        Assert.Equal("FormMaps — Solicitud de carta de recomendación de Ana", es.Subject);
        Assert.Contains("<strong>Ana</strong> te pidió una carta de recomendación.", es.Html);
        Assert.Contains("<strong>Relación:</strong> Docente", es.Html);
        Assert.Contains("Gracias Fecha límite: 5/11/2026.", es.Html);
        Assert.Contains("Responder a la solicitud", es.Html);

        var en = Recommendations().BuildRequest("Ms. Diaz", "", "Teacher", "Thanks", due, "en");
        Assert.Equal("FormMaps — Letter of Recommendation Request from A student", en.Subject);
        Assert.Contains("Thanks Due date: 11/5/2026.", en.Html);
    }

    [Fact]
    public void Recommendation_replies_Spanish()
    {
        var accepted = Recommendations().BuildRespond("Ana", "Sra. Díaz", accepted: true, declineReason: null, language: "es");
        Assert.Equal("FormMaps — Aceptaron tu solicitud de carta de recomendación", accepted.Subject);
        Assert.Contains("¡Buenas noticias, Ana!", accepted.Html);

        var declined = Recommendations().BuildRespond("Ana", null, accepted: false, declineReason: "Sin tiempo", language: "es");
        Assert.Equal("FormMaps — Rechazaron tu solicitud de carta de recomendación", declined.Subject);
        Assert.Contains("<strong>Tu recomendador/a</strong>", declined.Html);
        Assert.Contains("<strong>Motivo:</strong> Sin tiempo", declined.Html);

        var submitted = Recommendations().BuildSubmitted("Ana", "Sra. Díaz", new DateTime(2026, 1, 9, 12, 0, 0, DateTimeKind.Utc), "es");
        Assert.Equal("FormMaps — Ya enviaron tu carta de recomendación", submitted.Subject);
        Assert.Contains("Fecha de envío: 9/1/2026", submitted.Html);
        Assert.Contains("Ver mis solicitudes", submitted.Html);
    }

    [Fact]
    public void Recommendation_replies_English_unchanged()
    {
        Assert.Equal("FormMaps — Your Recommendation Request was Accepted",
            Recommendations().BuildRespond("Ana", "Ms. Diaz", true, null, "en").Subject);
        Assert.Equal("FormMaps — Your Recommendation Request was Declined",
            Recommendations().BuildRespond("Ana", "Ms. Diaz", false, null, "en").Subject);
        Assert.Equal("FormMaps — Your Letter of Recommendation has been Submitted",
            Recommendations().BuildSubmitted("Ana", "Ms. Diaz", DateTime.UtcNow, "en").Subject);
    }
}
