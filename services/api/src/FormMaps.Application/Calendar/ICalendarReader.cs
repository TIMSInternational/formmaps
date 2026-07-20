using FormMaps.Application.Auth;

namespace FormMaps.Application.Calendar;

/// <summary>
/// School academic-calendar reads (legacy routes/school-grades.ts calendar GETs ->
/// schoolGradesService getAcademicYears / getAssessmentPeriods / getHolidays). All school-scoped to the
/// resolved schoolId under the caller's read-only session. No IDOR surface (no client-supplied resource id).
/// </summary>
public interface ICalendarReader
{
    Task<IReadOnlyList<AcademicYearRow>> GetAcademicYearsAsync(
        RequestContext context, string schoolId, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<AssessmentPeriodRow>> GetAssessmentPeriodsAsync(
        RequestContext context, string schoolId, string? academicYearId, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<HolidayRow>> GetHolidaysAsync(
        RequestContext context, string schoolId, CancellationToken cancellationToken = default);
}
