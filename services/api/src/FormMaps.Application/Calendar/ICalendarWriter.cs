using FormMaps.Application.Auth;

namespace FormMaps.Application.Calendar;

/// <summary>
/// School academic-calendar WRITES (FM-DOTNET-048), faithful port of the calendar mutations in
/// schoolGradesService.ts (createAcademicYear / setCurrentAcademicYear / deleteAcademicYear /
/// updateAcademicYear / createAssessmentPeriod / deleteAssessmentPeriod / updateAssessmentPeriod /
/// createHolidays / deleteHoliday). Every operation runs under the caller's WRITABLE session, scoped by the
/// schoolId the endpoint already resolved via getSchoolUser. These tables carry NO RLS policy, so every
/// WHERE/INSERT carries the explicit schoolId (load-bearing — the same rationale as CalendarReader).
///
/// PARITY: createdBy / updatedBy are NEVER populated (legacy prisma create/update omit them). Only id (uuid),
/// createdDate (Now on insert), and updatedAt (Now on insert AND update) are written. Deletes are HARD deletes.
/// </summary>
public interface ICalendarWriter
{
    /// <summary>POST /calendar/academic-years — INSERT the year + its nested terms (sortOrder = array index).</summary>
    Task<CalendarCreatedRow> CreateAcademicYearAsync(
        RequestContext context, string schoolId, CreateAcademicYearInput input, CancellationToken cancellationToken = default);

    /// <summary>
    /// PUT /calendar/academic-years/:id/set-current — ownership check FIRST (foreign/nonexistent id must not
    /// clear the school's current flag), THEN clear all + set the one. Returns false (404) when not owned.
    /// </summary>
    Task<bool> SetCurrentAcademicYearAsync(
        RequestContext context, string schoolId, string yearId, CancellationToken cancellationToken = default);

    /// <summary>DELETE /calendar/academic-years/:id — HARD delete terms then the year (holidays cascade via FK).</summary>
    Task<bool> DeleteAcademicYearAsync(
        RequestContext context, string schoolId, string yearId, CancellationToken cancellationToken = default);

    /// <summary>PUT /calendar/academic-years/:id — PATCH the year; when terms provided, replace them all.</summary>
    Task<bool> UpdateAcademicYearAsync(
        RequestContext context, string schoolId, string yearId, UpdateAcademicYearInput input, CancellationToken cancellationToken = default);

    /// <summary>
    /// POST /calendar/assessment-periods — termId fallback to the current year's FIRST term; null (400) when
    /// no term resolvable.
    /// </summary>
    Task<CalendarCreatedRow?> CreateAssessmentPeriodAsync(
        RequestContext context, string schoolId, CreateAssessmentPeriodInput input, CancellationToken cancellationToken = default);

    /// <summary>DELETE /calendar/assessment-periods/:id — HARD delete. Returns false (404) when not owned.</summary>
    Task<bool> DeleteAssessmentPeriodAsync(
        RequestContext context, string schoolId, string periodId, CancellationToken cancellationToken = default);

    /// <summary>PUT /calendar/assessment-periods/:id — PATCH. Returns false (404) when not owned.</summary>
    Task<bool> UpdateAssessmentPeriodAsync(
        RequestContext context, string schoolId, string periodId, UpdateAssessmentPeriodInput input, CancellationToken cancellationToken = default);

    /// <summary>
    /// POST /calendar/holidays — resolve the academic year (current else latest by startDate DESC); null (400)
    /// when none. Normalize + bound-500 + drop-invalid, then INSERT. Returns the inserted count (0 when all
    /// dropped, still success).
    /// </summary>
    Task<int?> CreateHolidaysAsync(
        RequestContext context, string schoolId, IReadOnlyList<HolidayInputDto> holidays, CancellationToken cancellationToken = default);

    /// <summary>DELETE /calendar/holidays/:id — HARD delete. Returns false (404) when not owned.</summary>
    Task<bool> DeleteHolidayAsync(
        RequestContext context, string schoolId, string holidayId, CancellationToken cancellationToken = default);
}

/// <summary>The minimal create result the endpoints echo: <c>{ id, name }</c> (or just <c>{ id }</c>).</summary>
public sealed record CalendarCreatedRow(string Id, string Name);

/// <summary>A term to create under an academic year. Dates are already parsed (Kind=Unspecified UTC wall-clock).</summary>
public sealed record AcademicTermInput(string Name, DateTime StartDate, DateTime EndDate);

/// <summary>createAcademicYear body — name + parsed dates + the (possibly empty) nested terms.</summary>
public sealed record CreateAcademicYearInput(
    string Name, DateTime StartDate, DateTime EndDate, IReadOnlyList<AcademicTermInput> Terms);

/// <summary>
/// updateAcademicYear PATCH view. Name null -> keep existing (legacy <c>body.name ?? ay.name</c>). Has*Date
/// gates the truthy <c>body.x ? new Date(x) : undefined</c> conditional set. HasTerms mirrors
/// <c>Array.isArray(body.terms)</c> (replace-all when true; the list may be empty -> delete-all + insert none).
/// </summary>
public sealed record UpdateAcademicYearInput(
    string? Name,
    bool HasStartDate, DateTime StartDate,
    bool HasEndDate, DateTime EndDate,
    bool HasTerms, IReadOnlyList<AcademicTermInput> Terms);

/// <summary>createAssessmentPeriod body — TermId null triggers the current-year first-term fallback.</summary>
public sealed record CreateAssessmentPeriodInput(
    string? TermId, string Name, DateTime StartDate, DateTime EndDate, IReadOnlyList<string> AssessmentTypes);

/// <summary>
/// updateAssessmentPeriod PATCH view. HasTermId/Name mirror the nullish <c>body.x ?? ap.x</c> (keep on
/// absent/null); Has*Date the truthy conditional; HasAssessmentTypes the <c>body.assessmentTypes ?? undefined</c>.
/// </summary>
public sealed record UpdateAssessmentPeriodInput(
    bool HasTermId, string? TermId,
    string? Name,
    bool HasStartDate, DateTime StartDate,
    bool HasEndDate, DateTime EndDate,
    bool HasAssessmentTypes, IReadOnlyList<string> AssessmentTypes);

/// <summary>
/// One raw holiday input (as sent). Normalization (trim/slice, date parse, endDate strictly-after gate,
/// type default) happens in the writer's port of normalizeHolidayInput so it runs AFTER the academic-year gate.
/// </summary>
public sealed record HolidayInputDto(string? Name, string? Date, string? EndDate, string? Type);
