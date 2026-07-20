using FormMaps.Application.Assessments;

namespace FormMaps.UnitTests.Assessments;

/// <summary>
/// Unit pins for <see cref="ExternalEmailNormalization.NormalizeEmail"/> (port of lib/emailNormalize.ts) — the
/// canonicalization behind the external 360 submit-feedback email-match guard.
/// </summary>
public sealed class ExternalEmailNormalizationTests
{
    [Theory]
    [InlineData("  Andres@Gmail.com  ", "andres@gmail.com")]           // trim + lowercase
    [InlineData("mailto:andres@gmail.com", "andres@gmail.com")]        // strip leading mailto:
    [InlineData("MAILTO:Andres@Gmail.com", "andres@gmail.com")]        // mailto: is case-insensitive
    [InlineData("<andres@gmail.com>", "andres@gmail.com")]             // strip angle brackets
    [InlineData("mailto:<Andres@Gmail.com>", "andres@gmail.com")]      // combined
    [InlineData("<<andres@gmail.com>>", "andres@gmail.com")]           // repeated brackets
    public void Normalizes(string raw, string expected) =>
        Assert.Equal(expected, ExternalEmailNormalization.NormalizeEmail(raw));

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    public void Empty_or_null_is_empty_string(string? raw) =>
        Assert.Equal(string.Empty, ExternalEmailNormalization.NormalizeEmail(raw));
}
