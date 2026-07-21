using System.Data.Common;
using System.Globalization;
using System.Text.Json;
using FormMaps.Application.SchoolProfile;

namespace FormMaps.Infrastructure.SchoolProfile;

/// <summary>
/// Shared full-row projection + reader for the <c>schools</c> table, used by BOTH the profile read
/// (getSchoolProfile) and the profile write (UPDATE … RETURNING). One projection+mapper keeps the read and write
/// paths from drifting on column order, enum/jsonb handling, or timestamp formatting. <c>status</c> comes back as
/// ::text (the real DB uses the SchoolStatus PG enum; the test harness a text column — ::text matches both);
/// <c>address</c> comes back as ::text (verbatim jsonb; SQL-null and jsonb 'null' both surface as a JSON-null
/// element); timestamps are ISO-Z; <c>email</c> = contactEmail ?? "".
/// </summary>
public static class SchoolProfileRowMapper
{
    /// <summary>The full schools projection (schema order); column order == <see cref="Read"/>.</summary>
    public const string Projection =
        "\"id\", \"name\", \"adminEmail\", \"contactEmail\", \"maxStudents\", \"serviceHoursRequired\", "
        + "\"details\", \"contractStartDate\", \"contractEndDate\", \"status\"::text AS \"status\", \"invitedAt\", "
        + "\"invitationToken\", \"invitationTokenExpiresAt\", \"notifyOnStudentSignup\", "
        + "\"notifyOnAssessmentComplete\", \"allowStudentSelfRegistration\", \"logoUrl\", "
        + "\"address\"::text AS \"address\", \"phone\", \"website\", \"timezone\", \"isActive\", \"createdBy\", "
        + "\"createdDate\", \"updatedBy\", \"updatedAt\", \"videoCallsEnabled\"";

    public static SchoolProfileDto Read(DbDataReader reader)
    {
        var contactEmail = reader.IsDBNull(3) ? null : reader.GetString(3);
        return new SchoolProfileDto(
            Id: reader.GetString(0),
            Name: reader.GetString(1),
            AdminEmail: reader.GetString(2),
            ContactEmail: contactEmail,
            MaxStudents: reader.GetInt32(4),
            ServiceHoursRequired: NullableInt(reader, 5),
            Details: reader.IsDBNull(6) ? null : reader.GetString(6),
            ContractStartDate: NullableIso(reader, 7),
            ContractEndDate: NullableIso(reader, 8),
            Status: reader.GetString(9),
            InvitedAt: NullableIso(reader, 10),
            InvitationToken: reader.IsDBNull(11) ? null : reader.GetString(11),
            InvitationTokenExpiresAt: NullableIso(reader, 12),
            NotifyOnStudentSignup: NullableBool(reader, 13),
            NotifyOnAssessmentComplete: NullableBool(reader, 14),
            AllowStudentSelfRegistration: NullableBool(reader, 15),
            LogoUrl: reader.IsDBNull(16) ? null : reader.GetString(16),
            Address: ReadJson(reader, 17),
            Phone: reader.IsDBNull(18) ? null : reader.GetString(18),
            Website: reader.IsDBNull(19) ? null : reader.GetString(19),
            Timezone: reader.IsDBNull(20) ? null : reader.GetString(20),
            IsActive: reader.GetBoolean(21),
            CreatedBy: reader.IsDBNull(22) ? null : reader.GetString(22),
            CreatedDate: IsoZ(reader.GetDateTime(23)),
            UpdatedBy: reader.IsDBNull(24) ? null : reader.GetString(24),
            UpdatedAt: IsoZ(reader.GetDateTime(25)),
            VideoCallsEnabled: reader.GetBoolean(26),
            // Expose the school's public contact email under `email` (adminEmail stays the login identity).
            Email: contactEmail ?? string.Empty);
    }

    private static int? NullableInt(DbDataReader reader, int ordinal) =>
        reader.IsDBNull(ordinal) ? null : reader.GetInt32(ordinal);

    private static bool? NullableBool(DbDataReader reader, int ordinal) =>
        reader.IsDBNull(ordinal) ? null : reader.GetBoolean(ordinal);

    private static string? NullableIso(DbDataReader reader, int ordinal) =>
        reader.IsDBNull(ordinal) ? null : IsoZ(reader.GetDateTime(ordinal));

    // jsonb-as-text → JsonElement (verbatim; SQL NULL and jsonb 'null' both surface as a JSON-null element).
    private static JsonElement ReadJson(DbDataReader reader, int ordinal)
    {
        var raw = reader.IsDBNull(ordinal) ? "null" : reader.GetString(ordinal);
        using var document = JsonDocument.Parse(raw);
        return document.RootElement.Clone();
    }

    private static string IsoZ(DateTime value) =>
        DateTime.SpecifyKind(value, DateTimeKind.Utc).ToString("yyyy-MM-ddTHH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);
}
