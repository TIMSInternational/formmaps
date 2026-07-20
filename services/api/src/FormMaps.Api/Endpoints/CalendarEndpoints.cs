using FormMaps.Application.Auth;
using FormMaps.Application.Calendar;
using FormMaps.Application.SchoolAdmin;
using FormMaps.Domain.Auth;

namespace FormMaps.Api.Endpoints;

/// <summary>
/// School academic-calendar reads (legacy routes/school-grades.ts GET /calendar/academic-years,
/// /assessment-periods, /holidays, mounted under /api/v1/school-admin). Guard chain: RequireIdentity ->
/// permission "calendar:manage" (403) -> resolve the caller's schoolId via getSchoolUser (400 "No school").
/// ⚠️ Permission is calendar:manage (SuperAdmin + SchoolAdmin only), NOT school:manage. Response is
/// DOUBLE-wrapped { success, data: { data: [...] } } (unlike the gradebook single-wrap).
/// </summary>
public static class CalendarEndpoints
{
    public static IEndpointRouteBuilder MapCalendarEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/v1/school-admin/calendar/academic-years", GetAcademicYearsAsync).WithTags("Calendar");
        app.MapGet("/api/v1/school-admin/calendar/assessment-periods", GetAssessmentPeriodsAsync).WithTags("Calendar");
        app.MapGet("/api/v1/school-admin/calendar/holidays", GetHolidaysAsync).WithTags("Calendar");
        return app;
    }

    private static async Task<IResult> GetAcademicYearsAsync(
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ISchoolAdminScopeResolver scope,
        ICalendarReader reader,
        CancellationToken cancellationToken)
    {
        var (schoolId, error) = await AuthorizeAsync(accessor, guard, scope, cancellationToken);
        if (error is not null)
        {
            return error;
        }

        var years = await reader.GetAcademicYearsAsync(accessor.Current, schoolId!, cancellationToken);
        return DoubleWrapped(years);
    }

    private static async Task<IResult> GetAssessmentPeriodsAsync(
        HttpContext http,
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ISchoolAdminScopeResolver scope,
        ICalendarReader reader,
        CancellationToken cancellationToken)
    {
        var (schoolId, error) = await AuthorizeAsync(accessor, guard, scope, cancellationToken);
        if (error is not null)
        {
            return error;
        }

        // qs(req.query.academicYearId) || undefined — first value, empty string treated as absent.
        var academicYearId = http.Request.Query["academicYearId"].FirstOrDefault();
        if (string.IsNullOrEmpty(academicYearId))
        {
            academicYearId = null;
        }

        var periods = await reader.GetAssessmentPeriodsAsync(accessor.Current, schoolId!, academicYearId, cancellationToken);
        return DoubleWrapped(periods);
    }

    private static async Task<IResult> GetHolidaysAsync(
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ISchoolAdminScopeResolver scope,
        ICalendarReader reader,
        CancellationToken cancellationToken)
    {
        var (schoolId, error) = await AuthorizeAsync(accessor, guard, scope, cancellationToken);
        if (error is not null)
        {
            return error;
        }

        var holidays = await reader.GetHolidaysAsync(accessor.Current, schoolId!, cancellationToken);
        return DoubleWrapped(holidays);
    }

    // DOUBLE-wrap: { success:true, data:{ data:<array> } } (legacy school-grades.ts calendar routes).
    private static IResult DoubleWrapped(object rows) =>
        Results.Ok(new { success = true, data = new { data = rows } });

    // RequireIdentity -> permission "calendar:manage" (403) -> resolve schoolId (400 "No school").
    private static async Task<(string? SchoolId, IResult? Error)> AuthorizeAsync(
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ISchoolAdminScopeResolver scope,
        CancellationToken cancellationToken)
    {
        var context = accessor.Current;

        var decision = guard.RequireIdentity(context);
        if (!decision.Allowed)
        {
            return (null, Results.Json(
                new { success = false, code = decision.Code, message = decision.Message },
                statusCode: decision.StatusCode));
        }

        if (!context.Permissions.Contains(FormMapsPermissions.CalendarManage))
        {
            return (null, Results.Json(
                new { success = false, code = "missing_permission", message = "Insufficient permissions" },
                statusCode: StatusCodes.Status403Forbidden));
        }

        var schoolId = await scope.ResolveSchoolIdAsync(context, cancellationToken);
        if (string.IsNullOrEmpty(schoolId))
        {
            return (null, Results.Json(
                new { success = false, message = "No school" },
                statusCode: StatusCodes.Status400BadRequest));
        }

        return (schoolId, null);
    }
}
