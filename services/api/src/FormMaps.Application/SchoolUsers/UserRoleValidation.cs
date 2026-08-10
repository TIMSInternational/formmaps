using System.Text.Json;

namespace FormMaps.Application.SchoolUsers;

/// <summary>
/// Port of routes/school.ts's <c>userRoleSchema</c> (formmaps#114), the body schema for
/// PUT /api/v1/school-admin/users/:userId/role:
///
/// <code>
/// z.object({
///   roleName: z.string().max(50).toLowerCase().pipe(z.enum(["counselor","teacher","staff","coach"])),
/// }).strict()
/// </code>
///
/// <para>Three things about that schema are load-bearing and are reproduced exactly here:</para>
/// <list type="number">
///   <item>The wire field is <c>roleName</c>, NOT <c>role</c>. apps/web's schoolProfileService was already
///   sending <c>{ role }</c> to this URL, so a lenient object would silently strip the key and fall through
///   to a default — formmaps#79 verbatim.</item>
///   <item><c>.strict()</c> turns that same mistake into a loud 400 instead of a silent strip.</item>
///   <item>The enum is an allowlist, not a bare string: it is what stops a school admin minting another
///   school_admin. It constrains the DESTINATION role only; the guard on the target's CURRENT role is G5,
///   in the writer, and is NOT redundant with this one.</item>
/// </list>
///
/// <para><b>zod issue ordering.</b> The route surfaces <c>parsed.error.errors[0].message</c>. In zod v3's
/// ZodObject._parse the per-shape-key validators run (and push their issues) in the <c>pairs</c> loop BEFORE
/// the <c>unknownKeys === "strict"</c> extra-key check, so for a body like <c>{ role: "teacher" }</c> the
/// FIRST issue is roleName's own "Required", not the unrecognized-key message. That ordering is pinned by
/// the unit tests.</para>
///
/// <para><b>Documented divergence.</b> express.json() defaults to <c>strict: true</c>, so a top-level JSON
/// scalar (<c>7</c>, <c>"x"</c>, <c>true</c>, <c>null</c>) never reaches the legacy handler — body-parser
/// 400s first. Here it reaches the validator and comes back as zod's "Expected object, received number".
/// Both are 400s; only the message text differs. Same call made by StudentApplicationValidation.</para>
/// </summary>
public static class UserRoleValidation
{
    /// <summary>ROLE_CHANGE_ALLOWED, in schema-declaration order (the enum's message renders them in this order).</summary>
    public static readonly string[] AllowedRoles = ["counselor", "teacher", "staff", "coach"];

    private static readonly string EnumExpected = string.Join(" | ", AllowedRoles.Select(r => $"'{r}'"));

    public static UserRoleValidationResult Validate(JsonElement body)
    {
        if (body.ValueKind != JsonValueKind.Object)
        {
            return UserRoleValidationResult.Failure($"Expected object, received {ZodType(body)}");
        }

        // ---- shape key: roleName (runs BEFORE the .strict() extra-key check, per ZodObject._parse) ----
        if (!body.TryGetProperty("roleName", out var element))
        {
            // invalid_type with received === undefined renders as the bare "Required".
            return UserRoleValidationResult.Failure("Required");
        }

        if (element.ValueKind != JsonValueKind.String)
        {
            return UserRoleValidationResult.Failure($"Expected string, received {ZodType(element)}");
        }

        var raw = element.GetString()!;
        if (raw.Length > 50)
        {
            return UserRoleValidationResult.Failure("String must contain at most 50 character(s)");
        }

        // .toLowerCase() is a transform, so it runs AFTER .max(50) and BEFORE the piped enum — which means the
        // enum's "received" is the LOWERCASED token, not what the client sent. Invariant lowercasing: zod calls
        // JS String.prototype.toLowerCase(), which is locale-independent; ToLowerInvariant is its match (a
        // culture-sensitive ToLower() would map Turkish 'I' differently and reject a valid role on a tr-TR host).
        var lowered = raw.ToLowerInvariant();
        if (Array.IndexOf(AllowedRoles, lowered) < 0)
        {
            return UserRoleValidationResult.Failure($"Invalid enum value. Expected {EnumExpected}, received '{lowered}'");
        }

        // ---- .strict(): unrecognized keys, reported only once every shape key has passed ----
        var extraKeys = body.EnumerateObject()
            .Select(p => p.Name)
            .Where(n => !string.Equals(n, "roleName", StringComparison.Ordinal))
            .ToList();
        if (extraKeys.Count > 0)
        {
            // util.joinValues(keys, ", ") — each key single-quoted.
            return UserRoleValidationResult.Failure(
                $"Unrecognized key(s) in object: {string.Join(", ", extraKeys.Select(k => $"'{k}'"))}");
        }

        return UserRoleValidationResult.Success(lowered);
    }

    private static string ZodType(JsonElement value) => value.ValueKind switch
    {
        JsonValueKind.Object => "object",
        JsonValueKind.Array => "array",
        JsonValueKind.String => "string",
        JsonValueKind.Number => "number",
        JsonValueKind.True or JsonValueKind.False => "boolean",
        JsonValueKind.Null => "null",
        _ => "undefined",
    };
}

/// <summary>userRoleSchema.safeParse outcome: the lowercased, allowlisted roleName, or the first zod-equivalent message.</summary>
public sealed record UserRoleValidationResult(bool Ok, string? Message, string? RoleName)
{
    public static UserRoleValidationResult Success(string roleName) => new(true, null, roleName);

    public static UserRoleValidationResult Failure(string message) => new(false, message, null);
}
