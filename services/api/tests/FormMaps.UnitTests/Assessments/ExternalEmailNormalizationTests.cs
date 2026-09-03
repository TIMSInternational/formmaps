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

/// <summary>
/// Table pins for <see cref="ExternalEmailNormalization.IsValidZodEmail"/> -- the shared port of zod v3's
/// <c>z.string().email()</c> that also backs /authapi signup, change-email and forgot-password (Wave 3
/// A3: those routes accepted "a@b", "john doe@x", "a@b c" and, for signup, any non-blank string).
/// Every expectation below was produced by running zod 3.25.76 itself
/// (formmaps-platform/api/node_modules/zod) over the same input, so this table IS the legacy acceptance
/// set, quirks included: zod's regex is ASCII-only (unicode local parts / IDN labels are rejected, only
/// punycode passes), a domain label may END in a hyphen ("a@x-.com" passes), the TLD must be 2+ letters,
/// and no trimming happens before the check (padded input is rejected, not normalized).
/// </summary>
public sealed class ExternalEmailNormalizationIsValidZodEmailTests
{
    [Theory]
    // the everyday shapes
    [InlineData("a@b.co")]
    [InlineData("john.doe@example.com")]
    [InlineData("first.last@x.com")]
    [InlineData("john+tag@example.com")]            // plus-addressing
    [InlineData("a+@x.com")]
    [InlineData("a-@x.com")]
    [InlineData("-a@x.com")]
    [InlineData("a_b-c@x.com")]
    [InlineData("a'b@x.com")]                       // apostrophe (O'Brien) is in zod's local-part class
    [InlineData("'a@x.com")]
    [InlineData("JOHN@EXAMPLE.COM")]                // case-insensitive
    [InlineData("a@b.CO")]
    [InlineData("a@b.co.uk")]
    [InlineData("a@sub.dom.example.museum")]
    [InlineData("a@x-y.com")]
    [InlineData("a@xn--80ak6aa92e.com")]            // IDN only as punycode
    [InlineData("a@x-.com")]                        // zod quirk: a label may end in '-'
    public void Accepts_what_zod_accepts(string raw) =>
        Assert.True(ExternalEmailNormalization.IsValidZodEmail(raw));

    [Theory]
    // the three strings the old AuthEndpoints.LooksLikeEmail let through
    [InlineData("a@b")]                             // no dot in domain
    [InlineData("john doe@x")]                      // space in local part
    [InlineData("a@b c")]                           // space in domain
    // null / blank / no-@ / two-@
    [InlineData(null)]
    [InlineData("")]
    [InlineData("ab")]
    [InlineData("@x.com")]
    [InlineData("a@")]
    [InlineData("a@b@x.com")]
    // no trimming: padded or line-terminated input is rejected outright
    [InlineData(" a@b.co")]
    [InlineData("a@b.co ")]
    [InlineData("  NEW@EXAMPLE.TEST  ")]
    [InlineData("a@b.co\n")]                        // JS `$` is end-of-input; .NET `$` would allow a trailing \n
    [InlineData("a@b.co\r\n")]
    [InlineData("a\tb@x.com")]
    // dots
    [InlineData(".a@x.com")]                        // leading dot
    [InlineData("a.@x.com")]                        // trailing dot before @
    [InlineData("a..b@x.com")]                      // consecutive dots
    [InlineData("a@x..com")]
    [InlineData("a@.x.com")]
    [InlineData("a@x.com.")]
    // domain shape
    [InlineData("a@b.c")]                           // TLD needs 2+ letters
    [InlineData("a@x.c0m")]                         // TLD letters only
    [InlineData("a@x.123")]
    [InlineData("a@x.1co")]
    [InlineData("a@x.c-m")]
    [InlineData("a@-x.com")]                        // a label may not START with '-'
    [InlineData("a@x.com-")]
    [InlineData("a@x_y.com")]
    [InlineData("a@1.2")]
    [InlineData("a@[1.2.3.4]")]
    // local-part characters outside zod's class
    [InlineData("a'@x.com")]                        // last char before @ may not be ' or .
    [InlineData("a!b@x.com")]
    [InlineData("a#b@x.com")]
    [InlineData("a/b@x.com")]
    [InlineData("a=b@x.com")]
    [InlineData("a`b@x.com")]
    [InlineData("\"quoted\"@x.com")]
    // unicode: zod's regex is ASCII-only, so these are rejected (deliberate parity with legacy, not a bug)
    [InlineData("josé@example.com")]
    [InlineData("user@exämple.com")]
    [InlineData("日本@example.com")]
    [InlineData("x@x.xn--p1ai")]                    // punycode is fine as a label but not as the TLD (digits/hyphen)
    [InlineData("a١@x.com")]                   // Arabic-Indic digit: JS [0-9] is ASCII-only, .NET \d is not
    [InlineData("a@x.coK")]                    // Kelvin sign: JS /i does not fold it onto 'k'
    [InlineData("a@x.coſ")]                    // long s: JS /i does not fold it onto 's'
    [InlineData("a@x.coİ")]                    // dotted capital I: JS /i does not fold it onto 'i'
    public void Rejects_what_zod_rejects(string? raw) =>
        Assert.False(ExternalEmailNormalization.IsValidZodEmail(raw));
}
