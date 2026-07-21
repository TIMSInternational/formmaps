using System.Text.Json;
using System.Text.RegularExpressions;

namespace FormMaps.Application.SchoolProfile;

/// <summary>
/// Pure, allow-listed builder for a School profile update — a faithful port of buildSchoolProfileUpdate
/// (schoolService.ts). This is the mass-assignment GUARD: only the fixed literal columns below are ever emitted,
/// so unknown body keys (adminEmail, maxStudents, plan, id, isActive, …) can NEVER be written. Strings are bounded
/// (JS slice(0,max)); a non-string scalar is skipped; the editable public <c>email</c> maps to <c>contactEmail</c>
/// (empty→NULL clear, valid→set, invalid-non-empty→ignored); <c>address</c> is a FULL jsonb replace (partial
/// address intentionally clears the omitted fields). No DB access — unit-testable, no side effects.
/// </summary>
public static partial class SchoolProfileUpdateBuilder
{
    // The ONLY scalar columns this update may write, each with its JS slice(0,max) bound (name/details/phone/
    // website/timezone/logoUrl). contactEmail and address are handled separately below.
    private static readonly (string Column, int Max)[] ScalarBounds =
    [
        ("name", 200),
        ("details", 2000),
        ("phone", 50),
        ("website", 300),
        ("timezone", 100),
        ("logoUrl", 1000),
    ];

    // Address is rebuilt from EXACTLY these five sub-fields in this order (legacy ADDRESS_FIELDS).
    private static readonly string[] AddressFields = ["street", "city", "state", "country", "postalCode"];

    /// <summary>Build the allow-listed column set from an untyped request body (a no-op empty body → no columns).</summary>
    public static IReadOnlyList<SchoolProfileColumn> Build(JsonElement body)
    {
        var columns = new List<SchoolProfileColumn>();
        if (body.ValueKind != JsonValueKind.Object)
        {
            return columns;
        }

        // Scalars: legacy `if (body[k] !== undefined)` = key present; then boundStr writes ONLY a JSON string.
        foreach (var (column, max) in ScalarBounds)
        {
            if (body.TryGetProperty(column, out var element))
            {
                var bounded = BoundStr(element, max);
                if (bounded is not null)
                {
                    columns.Add(new SchoolProfileColumn(column, bounded, IsJsonb: false));
                }
            }
        }

        // email → contactEmail. Present-and-non-string collapses to "" (legacy `typeof === "string" ? trim : ""`),
        // which CLEARS contactEmail to NULL — same as an explicit empty string. A valid address is stored
        // (sliced 200); an invalid non-empty address is ignored (not written).
        if (body.TryGetProperty("email", out var emailElement))
        {
            var raw = emailElement.ValueKind == JsonValueKind.String
                ? emailElement.GetString()!.Trim()
                : string.Empty;

            if (raw.Length == 0)
            {
                columns.Add(new SchoolProfileColumn("contactEmail", null, IsJsonb: false)); // explicit clear → NULL
            }
            else if (IsValidEmail(raw))
            {
                columns.Add(new SchoolProfileColumn("contactEmail", Slice(raw, 200), IsJsonb: false));
            }
            // invalid, non-empty email → ignored (not written)
        }

        // address: FULL REPLACE (not deep merge). Legacy gate: `body.address && typeof === object && !Array` —
        // JSON Object kind excludes null and arrays exactly. Each of the five sub-fields is included ONLY when it
        // is a string (bounded 200); omitted fields are intentionally dropped (partial address clears the rest).
        if (body.TryGetProperty("address", out var addressElement) && addressElement.ValueKind == JsonValueKind.Object)
        {
            // Postgres jsonb normalizes key order, so a plain map is byte-equivalent to the legacy object.
            var address = new Dictionary<string, string>(StringComparer.Ordinal);
            foreach (var field in AddressFields)
            {
                if (addressElement.TryGetProperty(field, out var fieldElement))
                {
                    var bounded = BoundStr(fieldElement, 200);
                    if (bounded is not null)
                    {
                        address[field] = bounded;
                    }
                }
            }

            columns.Add(new SchoolProfileColumn("address", JsonSerializer.Serialize(address), IsJsonb: true));
        }

        return columns;
    }

    // boundStr: a JSON string sliced to max (JS slice(0,max)); anything else → null (skip).
    private static string? BoundStr(JsonElement element, int max) =>
        element.ValueKind == JsonValueKind.String ? Slice(element.GetString()!, max) : null;

    private static string Slice(string value, int max) => value.Length > max ? value[..max] : value;

    // Port of isValidEmail (lib/emailNormalize.ts): a single @, no whitespace/@/colon on either side, a dotted
    // domain with a 2+ char TLD. Deliberately stricter than a generic email check (rejects x@localhost).
    private static bool IsValidEmail(string email) => EmailRegex().IsMatch(email);

    [GeneratedRegex(@"^[^\s@:]+@[^\s@:]+\.[^\s@:]{2,}$")]
    private static partial Regex EmailRegex();
}
