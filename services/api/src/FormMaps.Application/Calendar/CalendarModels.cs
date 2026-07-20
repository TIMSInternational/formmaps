namespace FormMaps.Application.Calendar;

/// <summary>
/// An academic_terms row (full passthrough), nested under its academic year. Mirrors the legacy
/// getAcademicYears include: <c>terms: { where:{isActive:true}, orderBy:{sortOrder:"asc"} }</c>.
/// Serialized with the Web camelCase property policy; timestamps ISO-Z.
/// </summary>
public sealed record AcademicTermRow(
    string Id,
    string AcademicYearId,
    string Name,
    string StartDate,
    string EndDate,
    int SortOrder,
    bool IsActive,
    string? CreatedBy,
    string CreatedDate,
    string? UpdatedBy,
    string UpdatedAt);

/// <summary>
/// An academic_years row (full passthrough) with its active terms nested (sortOrder ASC). Mirrors legacy
/// getAcademicYears (schoolGradesService.ts): where schoolId+isActive, orderBy startDate DESC.
/// </summary>
public sealed record AcademicYearRow(
    string Id,
    string SchoolId,
    string Name,
    string StartDate,
    string EndDate,
    bool IsCurrent,
    bool IsActive,
    string? CreatedBy,
    string CreatedDate,
    string? UpdatedBy,
    string UpdatedAt,
    IReadOnlyList<AcademicTermRow> Terms);

/// <summary>
/// An assessment_periods row (full passthrough). assessmentTypes is a Postgres text[] -> a JSON string array.
/// Mirrors legacy getAssessmentPeriods: where schoolId+isActive, orderBy startDate ASC (NOT filtered by year —
/// the year param is only a gate for the empty-return; see CalendarReader).
/// </summary>
public sealed record AssessmentPeriodRow(
    string Id,
    string SchoolId,
    string TermId,
    string Name,
    string StartDate,
    string EndDate,
    IReadOnlyList<string> AssessmentTypes,
    bool IsActive,
    string? CreatedBy,
    string CreatedDate,
    string? UpdatedBy,
    string UpdatedAt);

/// <summary>
/// A holidays row (full passthrough). endDate is nullable (emit JSON null, never ""). Mirrors legacy
/// getHolidays: where schoolId+isActive, orderBy date ASC.
/// </summary>
public sealed record HolidayRow(
    string Id,
    string SchoolId,
    string AcademicYearId,
    string Name,
    string Date,
    string? EndDate,
    string Type,
    bool IsActive,
    string? CreatedBy,
    string CreatedDate,
    string? UpdatedBy,
    string UpdatedAt);
