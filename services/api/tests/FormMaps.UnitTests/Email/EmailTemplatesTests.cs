using FormMaps.Application.Email;
using Xunit;

namespace FormMaps.UnitTests.Email;

/// <summary>
/// Byte-parity tests for the email templates ported from lib/email.ts. Pins the load-bearing bits: subjects
/// (invite = RAW studentName; reminder = ESCAPED schoolName — matching the TS asymmetry), body escaping via the
/// exact 5-char map, list items, and button URLs (reminder → frontend /dashboard/assessments).
/// </summary>
public sealed class EmailTemplatesTests
{
    private static EmailTemplates Templates() => new(new EmailOptions(
        "noreply@formmaps.com", "https://app.formmaps.com", "https://app.formmaps.ai", "logo", "postal-addr", "us-east-1"));

    [Fact]
    public void EscapeHtml_matches_the_legacy_5_char_map()
    {
        Assert.Equal("&amp;&lt;&gt;&quot;&#x27;", EmailTemplates.EscapeHtml("&<>\"'"));
        Assert.Equal("plain text 123", EmailTemplates.EscapeHtml("plain text 123"));
    }

    [Fact]
    public void EvaluationInvite_subject_is_raw_studentName_body_escapes_both_names()
    {
        var msg = Templates().BuildEvaluationInvite("Pat & <Parent>", "Ana \"A\"",
            "https://app.formmaps.ai/evaluation/evaluator?token=abc123");

        // Subject: studentName is RAW (matches TS `360° Evaluation Request for ${studentName}` — no escapeHtml).
        Assert.Equal("360° Evaluation Request for Ana \"A\"", msg.Subject);

        // Body: both names escaped.
        Assert.Contains("Hello Pat &amp; &lt;Parent&gt;,", msg.Html);
        Assert.Contains("Ana &quot;A&quot;", msg.Html);
        Assert.Contains("https://app.formmaps.ai/evaluation/evaluator?token=abc123", msg.Html);
        Assert.Contains("Complete Evaluation", msg.Html);
        Assert.Contains("This link expires in 7 days", msg.Html);
        // Branded shell present.
        Assert.Contains("postal-addr", msg.Html);
    }

    [Fact]
    public void AssessmentReminder_subject_escapes_schoolName_and_lists_escaped_assessments()
    {
        var msg = Templates().BuildAssessmentReminder("Ben", "Acme & Co", ["PCA", "MIL <x>"]);

        // Subject: schoolName IS escaped here (unlike the invite's raw studentName).
        Assert.Equal("FormMaps — Assessment Reminder from Acme &amp; Co", msg.Subject);

        Assert.Contains("Hi Ben,", msg.Html);
        Assert.Contains("<li>PCA</li>", msg.Html);
        Assert.Contains("<li>MIL &lt;x&gt;</li>", msg.Html);
        Assert.Contains("https://app.formmaps.com/dashboard/assessments", msg.Html);
        Assert.Contains("Go to Assessments", msg.Html);
    }

    [Fact]
    public void ReportEmail_subject_is_raw_studentName_body_escapes_name_and_links_to_dashboard()
    {
        var msg = Templates().BuildReportEmail("Ana \"A\" & Co");

        Assert.Equal("FormMaps — Student Report for Ana \"A\" & Co", msg.Subject);
        Assert.Contains("Student Report: Ana &quot;A&quot; &amp; Co", msg.Html);
        Assert.Contains("Your latest assessment report is ready. Log in to view your full results.", msg.Html);
        Assert.Contains("https://app.formmaps.com/dashboard", msg.Html);
        Assert.Contains("postal-addr", msg.Html); // branded shell present
    }
}
