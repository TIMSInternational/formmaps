using System.Text.Json;

namespace FormMaps.Application.SchoolUsers;

/// <summary>
/// The <c>.strict()</c> analogue for PUT /api/v1/school-admin/users/{userId}/role (formmaps#114).
///
/// <para><b>Why this class exists at all.</b> The Node twin gets its strictness free from
/// <c>z.object({...}).strict()</c>. System.Text.Json has no equivalent: its default binder SILENTLY IGNORES unknown
/// properties, which IS the pre-formmaps#79 failure mode — the frontend sent <c>{ role }</c> where the server read
/// <c>roleName</c>, the unknown key was stripped, and the handler fell through to a default that granted a role
/// nobody asked for. Binding this body to a POCO would reproduce that bug in .NET exactly, and a divergence here is
/// a privilege bug, not a formatting one. So all four checks are hand-written:</para>
/// <list type="number">
/// <item>the root must be a JSON object;</item>
/// <item><c>roleName</c> must be present, and a string;</item>
/// <item>NO property other than <c>roleName</c> may be present (the <c>.strict()</c> half);</item>
/// <item>the case-folded value must be in the allowlist (the formmaps#79 half — an enum, never a bare string,
/// because an unrecognised role silently defaulting is the same privilege grant as a missing key).</item>
/// </list>
///
/// <para>Pure and side-effect free so the rule can be unit tested (and mutation tested) without a database.</para>
/// </summary>
public static class RoleChangeRequest
{
    /// <summary>
    /// The ONLY roles a school admin may hand out — identical to the Node route's zod enum and to inviteStaff's
    /// validRoles. school_admin / Super Admin are excluded because a school admin minting another admin IS the
    /// privilege escalation this endpoint exists to prevent; student / parent are excluded because a role change
    /// must not convert staff into a student or back (student rows carry gradeLevel, counselor assignments and
    /// assessment data a bare roleName flip would orphan).
    /// </summary>
    public static readonly IReadOnlyList<string> AllowedRoles = ["counselor", "teacher", "staff", "coach"];

    /// <summary>
    /// Parses the request body. On success <see cref="RoleChangeParse.RoleName"/> is the LOWERCASED role (the Node
    /// schema's <c>.toLowerCase()</c> runs before the enum, so "Teacher" is accepted); on failure
    /// <see cref="RoleChangeParse.Error"/> carries the 400 message.
    /// </summary>
    public static RoleChangeParse Parse(JsonElement? body)
    {
        // Malformed JSON — the endpoint's ReadBodyAsync yields null. Same house 400 as grade-level.
        if (body is null)
        {
            return new RoleChangeParse(null, "Invalid request body");
        }

        var root = body.Value;
        if (root.ValueKind != JsonValueKind.Object)
        {
            return new RoleChangeParse(null, "Invalid request body");
        }

        // (3) .strict(): ANY extra property is a hard 400. Checked BEFORE the roleName lookup so that
        // `{ roleName: "staff", role: "school_admin" }` cannot smuggle a second field past a happy path.
        foreach (var property in root.EnumerateObject())
        {
            if (!string.Equals(property.Name, "roleName", StringComparison.Ordinal))
            {
                return new RoleChangeParse(null, $"Unrecognized key(s) in object: '{property.Name}'");
            }
        }

        // (2) present, and a string. An absent roleName is the frontend's historical `{ role }` payload arriving
        // here; it must never mean "use the default".
        if (!root.TryGetProperty("roleName", out var roleElement) || roleElement.ValueKind != JsonValueKind.String)
        {
            return new RoleChangeParse(null, "Required");
        }

        // (4) Length on the RAW string, then case-fold, then allowlist — in exactly that order, because
        // that is what the Node twin does and this endpoint is flag-co-flipped with it:
        //
        //     z.string().max(50).toLowerCase().pipe(z.enum([...]))    // routes/school.ts:87
        //
        // NOTE THE ABSENCE OF A TRIM, which is a correction rather than an oversight (formmaps#114
        // review). An earlier version called .Trim() before the allowlist, so `{"roleName":"  COACH  "}`
        // was a SUCCESSFUL ROLE CHANGE here while Node returned 400 — a reject-to-write flip on a
        // permission-bearing endpoint, triggered by nothing more than flipping
        // FORMMAPS_ROUTE_SCHOOL_USERS_TO_DOTNET. Node is what is live and .NET is still dark behind that
        // flag, so aligning .NET to Node removes the divergence with ZERO production behaviour change;
        // the opposite direction would have altered live behaviour to fix a bug that only exists here.
        //
        // The ORDER matters as much as the trim: zod applies .max(50) to the RAW string, so normalising
        // first would admit a 51-character padded value that the Node side rejects on length.
        var raw = roleElement.GetString() ?? string.Empty;
        if (raw.Length > 50)
        {
            return new RoleChangeParse(null, "Invalid role");
        }

        var roleName = raw.ToLowerInvariant();
        if (!AllowedRoles.Contains(roleName))
        {
            return new RoleChangeParse(null, "Invalid role");
        }

        return new RoleChangeParse(roleName, null);
    }
}

/// <summary>Outcome of <see cref="RoleChangeRequest.Parse"/>: exactly one of the two is non-null.</summary>
public sealed record RoleChangeParse(string? RoleName, string? Error);
