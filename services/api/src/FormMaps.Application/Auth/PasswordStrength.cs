using System.Text.RegularExpressions;

namespace FormMaps.Application.Auth;

/// <summary>Pure port of legacy validatePasswordStrength (lib/auth.ts). Order of checks matters —
/// legacy returns the FIRST failing message, and callers surface it verbatim to the user.</summary>
public static partial class PasswordStrength
{
    public static string? Validate(string password)
    {
        if (password.Length < 8) return "Password must be at least 8 characters";
        if (!UppercaseRegex().IsMatch(password)) return "Password must contain an uppercase letter";
        if (!LowercaseRegex().IsMatch(password)) return "Password must contain a lowercase letter";
        if (!DigitRegex().IsMatch(password)) return "Password must contain a digit";
        if (!SpecialCharRegex().IsMatch(password)) return "Password must contain a special character";
        return null;
    }

    [GeneratedRegex("[A-Z]")]
    private static partial Regex UppercaseRegex();

    [GeneratedRegex("[a-z]")]
    private static partial Regex LowercaseRegex();

    [GeneratedRegex(@"\d")]
    private static partial Regex DigitRegex();

    [GeneratedRegex(@"[!@#$%^&*()_\-+=\[\]{};:'"",.<>?/\\|`~]")]
    private static partial Regex SpecialCharRegex();
}
