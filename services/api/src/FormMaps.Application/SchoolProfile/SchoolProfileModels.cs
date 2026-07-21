using System.Text.Json;

namespace FormMaps.Application.SchoolProfile;

/// <summary>
/// The full <c>schools</c> row as legacy getSchoolProfile / updateSchoolProfile return it (a verbatim Prisma
/// model passthrough) PLUS the editable public <c>email</c> alias (= contactEmail ?? ""). Every column is emitted
/// camelCase on the wire; timestamps are ISO-Z; <see cref="Address"/> is the raw jsonb passthrough (a
/// <see cref="JsonElement"/>, JSON-null when the column is SQL null). <c>adminEmail</c> is exposed (legacy spreads
/// the whole row) but is NOT editable via PUT (only the <c>email</c>→contactEmail mapping is).
/// </summary>
public sealed record SchoolProfileDto(
    string Id,
    string Name,
    string AdminEmail,
    string? ContactEmail,
    int MaxStudents,
    int? ServiceHoursRequired,
    string? Details,
    string? ContractStartDate,
    string? ContractEndDate,
    string Status,
    string? InvitedAt,
    string? InvitationToken,
    string? InvitationTokenExpiresAt,
    bool? NotifyOnStudentSignup,
    bool? NotifyOnAssessmentComplete,
    bool? AllowStudentSelfRegistration,
    string? LogoUrl,
    JsonElement Address,
    string? Phone,
    string? Website,
    string? Timezone,
    bool IsActive,
    string? CreatedBy,
    string CreatedDate,
    string? UpdatedBy,
    string UpdatedAt,
    bool VideoCallsEnabled,
    string Email);

/// <summary>
/// The composed GET /settings payload (legacy getSettings). <see cref="MaxStudents"/> is the coalesced value
/// (<c>maxStudents || 300</c>) reused for BOTH school.maxStudents and the top-level maxStudents; <see cref="Plan"/>
/// is always "Standard" (there is no <c>plan</c> column on the School model — legacy casts a non-existent field and
/// falls back). Notify/self-registration flags carry their <c>?? default</c> (null-only) coalescing; timezone its
/// <c>|| default</c> (JS-truthiness) coalescing.
/// </summary>
public sealed record SchoolSettings(
    string Name,
    int CurrentStudents,
    int MaxStudents,
    string Plan,
    string? AdminId,
    string? AdminName,
    string? AdminEmail,
    bool NotifyOnStudentSignup,
    bool NotifyOnAssessmentComplete,
    bool AllowStudentSelfRegistration,
    string Timezone);

/// <summary>
/// The PUT /settings return payload (legacy updateSettings) — the RAW updated-row values (NO coalescing): a flag
/// never set and not provided reads back null; timezone can be null. <see cref="MaxStudents"/> is the raw non-null
/// column.
/// </summary>
public sealed record SchoolSettingsUpdateResult(
    bool? NotifyOnStudentSignup,
    bool? NotifyOnAssessmentComplete,
    bool? AllowStudentSelfRegistration,
    string? Timezone,
    int MaxStudents);

/// <summary>
/// One allow-listed column the PUT /school/profile update will write. <see cref="Column"/> is ALWAYS a fixed
/// literal from <see cref="SchoolProfileUpdateBuilder"/> (never a caller-supplied key — the mass-assignment guard);
/// <see cref="Value"/> is null for an explicit clear (contactEmail→NULL); <see cref="IsJsonb"/> flags the address
/// full-replace so the writer casts the parameter <c>::jsonb</c>.
/// </summary>
public sealed record SchoolProfileColumn(string Column, object? Value, bool IsJsonb);

/// <summary>
/// The validated PUT /settings patch (allow-list). Each <c>Has*</c> gate means "write this column". The notify /
/// self-registration flags map to nullable <c>Boolean?</c> columns and are written when the body carried an actual
/// JSON boolean OR JSON null (legacy <c>if (body.x !== undefined) data.x = body.x</c> — null is present, written as
/// NULL); a present bool value is carried, a present JSON null carries <c>null</c>. Timezone is written only when the
/// body carried a truthy (non-empty) JSON string.
/// </summary>
public sealed record SchoolSettingsPatch(
    bool HasNotifyOnStudentSignup, bool? NotifyOnStudentSignup,
    bool HasNotifyOnAssessmentComplete, bool? NotifyOnAssessmentComplete,
    bool HasAllowStudentSelfRegistration, bool? AllowStudentSelfRegistration,
    bool HasTimezone, string? Timezone);
