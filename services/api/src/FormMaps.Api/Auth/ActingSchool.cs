using System.Text.RegularExpressions;

namespace FormMaps.Api.Auth;

/// <summary>
/// Super Admin "act as a school". A Super Admin belongs to no school, so every school-admin endpoint resolved
/// "my school" to null. The web app sends the school the Super Admin opened in this header; RequestContextMiddleware
/// honours it ONLY for the Super Admin. Twin of formmaps-platform api/src/lib/actingSchool.ts — same header, same
/// id shapes, same 400 "Unknown school".
/// </summary>
public static partial class ActingSchool
{
    public const string HeaderName = "X-Acting-School-Id";
    public const string UnknownSchoolMessage = "Unknown school";

    // Production holds three id shapes: UUIDs, 24-hex Mongo ObjectIds, and seeded slugs like "test-school-1". The
    // existence check is the real check; this only keeps junk (spaces, quotes, very long values) away from it.
    [GeneratedRegex("^[A-Za-z0-9_-]{1,64}$", RegexOptions.CultureInvariant)]
    private static partial Regex SchoolIdShape();

    public static bool IsSchoolIdShape(string value) => SchoolIdShape().IsMatch(value);

    public static string? ReadHeader(HttpRequest request)
    {
        var value = request.Headers[HeaderName].ToString().Trim();
        return value.Length == 0 ? null : value;
    }
}
