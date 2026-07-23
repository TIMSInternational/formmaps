using FormMaps.Application.Assessments;
using FormMaps.Application.Auth;
using FormMaps.Application.SchoolAdmin;
using FormMaps.Application.SchoolStudents;
using FormMaps.Domain.Auth;

namespace FormMaps.Api.Endpoints;

/// <summary>
/// school:manage parent-link reads (FM-DOTNET-063 — routes/school-students.ts, mounted /api/v1/school-admin).
/// Second sub-slice of school-students: GET /parents (school-wide grouped parent roster + stats) and
/// GET /students/{studentId}/parents (the Guardians tab for one student). SHIPPED DARK (co-flips with the
/// school-students writes; both paths carry un-ported POST/DELETE siblings, Next matches path-not-method).
///
/// <para>Auth: RequireIdentity (401) → permission school:manage (403). /parents then resolves the caller's own
/// schoolId (no-school → 200 { success, data:[], total:0, totalPages:1 }). /students/{id}/parents uses the
/// studentInCallerSchool gate: Super Admin (RAW exact role) bypasses; otherwise the caller must have a school AND
/// the student must belong to it — any failure is the uniform 404 "Not found" (NOTE: "Not found", not the FM-062
/// "Student not found").</para>
/// </summary>
public static class SchoolStudentsParentsEndpoints
{
    public static IEndpointRouteBuilder MapSchoolStudentsParentsEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/school-admin").WithTags("SchoolStudentsParents");

        group.MapGet("/parents", GetParentsAsync);
        group.MapGet("/students/{studentId}/parents", GetStudentParentsAsync);

        return app;
    }

    private static async Task<IResult> GetParentsAsync(
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ISchoolAdminScopeResolver scope,
        ISchoolStudentsParentsReader reader,
        string? page,
        string? limit,
        string? search,
        CancellationToken cancellationToken)
    {
        var (context, error) = RequireSchoolManage(accessor, guard);
        if (error is not null)
        {
            return error;
        }

        var schoolId = await scope.ResolveSchoolIdAsync(context, cancellationToken);

        // No-school → 200 { success:true, data:[], total:0, totalPages:1 } (NO page/stats — the route's early return).
        if (string.IsNullOrEmpty(schoolId))
        {
            return Results.Ok(new { success = true, data = Array.Empty<object>(), total = 0, totalPages = 1 });
        }

        // page = max(1, parseInt||1); limit = min(100, max(1, parseInt||20)). search = qs?.trim() || undefined
        // (TRIMMED here — unlike GET /students) → empty-after-trim drops the filter.
        var pagination = PcaExamPagination.Resolve(page, limit);
        var trimmed = search?.Trim();
        var query = new ParentsListQuery(
            pagination.Page,
            pagination.Limit,
            pagination.Skip,
            Search: string.IsNullOrEmpty(trimmed) ? null : trimmed);

        var result = await reader.ListParentsAsync(context, schoolId, query, cancellationToken);

        // res.json({ success:true, ...result }) → { success, data, total, totalPages, page, stats }.
        return Results.Ok(new
        {
            success = true,
            data = result.Data.Select(ParentGroupJson),
            total = result.Total,
            totalPages = result.TotalPages,
            page = result.Page,
            stats = new
            {
                totalParents = result.Stats.TotalParents,
                linkedStudents = result.Stats.LinkedStudents,
                pendingInvites = result.Stats.PendingInvites
            }
        });
    }

    private static async Task<IResult> GetStudentParentsAsync(
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ISchoolAdminScopeResolver scope,
        ISchoolStudentsParentsReader reader,
        string studentId,
        CancellationToken cancellationToken)
    {
        var (context, error) = RequireSchoolManage(accessor, guard);
        if (error is not null)
        {
            return error;
        }

        if (!await StudentInCallerSchoolAsync(context, scope, reader, studentId, cancellationToken))
        {
            return NotFound();
        }

        var links = await reader.ListParentsForStudentAsync(context, studentId, cancellationToken);
        return Results.Ok(new { success = true, data = links.Select(StudentParentLinkJson) });
    }

    // studentInCallerSchool: Super Admin (RAW exact role, matching req.userRole === "Super Admin") bypasses; else the
    // caller must have a school AND the student must belong to it. Any miss → false → 404 "Not found".
    private static async Task<bool> StudentInCallerSchoolAsync(
        RequestContext context,
        ISchoolAdminScopeResolver scope,
        ISchoolStudentsParentsReader reader,
        string studentId,
        CancellationToken cancellationToken)
    {
        if (context.Actor?.Role == FormMapsRoles.SuperAdmin)
        {
            return true;
        }

        var callerSchoolId = await scope.ResolveSchoolIdAsync(context, cancellationToken);
        if (string.IsNullOrEmpty(callerSchoolId))
        {
            return false;
        }

        return await reader.IsStudentInCallerSchoolAsync(context, callerSchoolId, studentId, cancellationToken);
    }

    // A grouped parent exactly as legacy emits it.
    private static object ParentGroupJson(ParentGroup p) => new
    {
        id = p.Id,
        parentName = p.ParentName,
        parentEmail = p.ParentEmail,
        parentUserId = p.ParentUserId,
        isAccepted = p.IsAccepted,
        acceptedAt = p.AcceptedAt,
        createdDate = p.CreatedDate,
        students = p.Students.Select(s => new
        {
            id = s.Id,
            name = s.Name,
            email = s.Email,
            gradeLevel = s.GradeLevel
        })
    };

    // A single student's parent link (Guardians tab shape).
    private static object StudentParentLinkJson(StudentParentLinkView l) => new
    {
        id = l.Id,
        name = l.Name,
        email = l.Email,
        relationship = l.Relationship,
        status = l.Status,
        invitedAt = l.InvitedAt,
        acceptedAt = l.AcceptedAt,
        parentUserId = l.ParentUserId
    };

    private static IResult NotFound() =>
        Results.Json(new { success = false, message = "Not found" }, statusCode: StatusCodes.Status404NotFound);

    /// <summary>RequireIdentity (401) → permission school:manage (403). Error is non-null only for 401/403.</summary>
    private static (RequestContext Context, IResult? Error) RequireSchoolManage(
        IRequestContextAccessor accessor, IProtectedRequestGuard guard)
    {
        var context = accessor.Current;

        var decision = guard.RequireIdentity(context);
        if (!decision.Allowed)
        {
            return (context, Results.Json(
                new { success = false, code = decision.Code, message = decision.Message },
                statusCode: decision.StatusCode));
        }

        if (!context.Permissions.Contains(FormMapsPermissions.SchoolManage))
        {
            return (context, Results.Json(
                new { success = false, code = "missing_permission", message = "Insufficient permissions" },
                statusCode: StatusCodes.Status403Forbidden));
        }

        return (context, null);
    }
}
