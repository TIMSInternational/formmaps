using FormMaps.Application.Assessments;
using FormMaps.Application.Auth;
using FormMaps.Application.Counselor;
using FormMaps.Domain.Auth;

namespace FormMaps.Api.Endpoints;

/// <summary>
/// Counselor dashboard self-contained reads (FM-DOTNET-067 — routes/counselor.ts, mounted /api/v1/counselor). The
/// FIRST counselor slice. Four <c>counselor:dashboard</c> reads: GET /dashboard, GET /dashboard/change-requests, and
/// the identical GET /me/students/{studentId} + GET /students/{studentId}. All GET-only → cleanly rewritable.
///
/// <para>Guard (all four): RequireIdentity (401) → <c>counselor:dashboard</c> permission (else 403
/// "Insufficient permissions"). The student-detail pair additionally requires an active counselor→student assignment
/// (miss → 404 "Not found") before loading the student (miss → 404 "Student not found"). The enriched caseload
/// GET /me/students (listEnrichedStudents) is DEFERRED to its own slice; onboarding verify/complete stay in Node.</para>
/// </summary>
public static class CounselorDashboardEndpoints
{
    public static IEndpointRouteBuilder MapCounselorDashboardEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/counselor").WithTags("CounselorDashboard");

        group.MapGet("/dashboard", GetDashboardAsync);
        group.MapGet("/dashboard/change-requests", GetChangeRequestsAsync);
        group.MapGet("/me/students/{studentId}", GetStudentDetailAsync);
        group.MapGet("/students/{studentId}", GetStudentDetailAsync);

        return app;
    }

    private static async Task<IResult> GetDashboardAsync(
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ICounselorDashboardReader reader,
        CancellationToken cancellationToken)
    {
        var (context, error) = RequireCounselorDashboard(accessor, guard);
        if (error is not null)
        {
            return error;
        }

        var result = await reader.GetDashboardAsync(context, context.Actor!.UserId, cancellationToken);

        return Results.Ok(new
        {
            success = true,
            data = new
            {
                totalStudents = result.TotalStudents,
                pendingRequests = result.PendingRequests,
                upcomingSessions = result.UpcomingSessions,
                followUps = result.FollowUps,
                overdueFollowUps = result.OverdueFollowUps,
                pendingFollowUpsList = result.PendingFollowUpsList.Select(NoteJson),
                recentNotes = result.RecentNotes.Select(NoteJson)
            }
        });
    }

    private static async Task<IResult> GetChangeRequestsAsync(
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ICounselorDashboardReader reader,
        string? limit,
        CancellationToken cancellationToken)
    {
        var (context, error) = RequireCounselorDashboard(accessor, guard);
        if (error is not null)
        {
            return error;
        }

        // limit = Math.min(100, Math.max(1, parseInt(qs(limit)) || 30)) — the vetted JS-parity clamp.
        var clampedLimit = PcaExamPagination.Resolve(null, limit, defaultLimit: 30).Limit;

        var result = await reader.GetDashboardChangeRequestsAsync(
            context, context.Actor!.UserId, clampedLimit, cancellationToken);

        return Results.Ok(new
        {
            success = true,
            data = new { data = result.Data.Select(ChangeRequestJson), total = result.Total }
        });
    }

    private static async Task<IResult> GetStudentDetailAsync(
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ICounselorDashboardReader reader,
        string studentId,
        CancellationToken cancellationToken)
    {
        var (context, error) = RequireCounselorDashboard(accessor, guard);
        if (error is not null)
        {
            return error;
        }

        // ensureCounselorStudentAccess: no active assignment → the endpoint's outer catch returns 404 "Not found".
        if (!await reader.HasActiveAssignmentAsync(context, context.Actor!.UserId, studentId, cancellationToken))
        {
            return Results.Json(new { success = false, message = "Not found" }, statusCode: StatusCodes.Status404NotFound);
        }

        var student = await reader.GetStudentDetailAsync(context, studentId, cancellationToken);
        if (student is null)
        {
            return Results.Json(
                new { success = false, message = "Student not found" }, statusCode: StatusCodes.Status404NotFound);
        }

        return Results.Ok(new
        {
            success = true,
            data = new
            {
                id = student.Id,
                name = student.Name,
                email = student.Email,
                gradeLevel = student.GradeLevel,
                schoolId = student.SchoolId,
                createdDate = student.CreatedDate
            }
        });
    }

    // noteView: { id, studentId, studentName, type, content, followUpDate, createdAt }.
    private static object NoteJson(CounselorDashboardNote n) => new
    {
        id = n.Id,
        studentId = n.StudentId,
        studentName = n.StudentName,
        type = n.Type,
        content = n.Content,
        followUpDate = n.FollowUpDate,
        createdAt = n.CreatedAt
    };

    // A change-request row: the raw course_change_requests columns PLUS the nested student:{name} (RAW) AND
    // studentName (name || "Student") — legacy spreads `...r` (which carries the `student` include) then adds studentName.
    private static object ChangeRequestJson(CounselorChangeRequestRow r) => new
    {
        id = r.Id,
        studentId = r.StudentId,
        schoolId = r.SchoolId,
        courseId = r.CourseId,
        courseCode = r.CourseCode,
        courseName = r.CourseName,
        credits = r.Credits,
        gradeLevel = r.GradeLevel,
        semester = r.Semester,
        action = r.Action,
        dueDate = r.DueDate,
        studentNote = r.StudentNote,
        status = r.Status,
        counselorNote = r.CounselorNote,
        reviewedBy = r.ReviewedBy,
        reviewedAt = r.ReviewedAt,
        isActive = r.IsActive,
        createdBy = r.CreatedBy,
        createdDate = r.CreatedDate,
        updatedBy = r.UpdatedBy,
        updatedAt = r.UpdatedAt,
        student = new { name = r.StudentName },
        studentName = string.IsNullOrEmpty(r.StudentName) ? "Student" : r.StudentName
    };

    /// <summary>RequireIdentity (401) → <c>counselor:dashboard</c> permission (else 403 "Insufficient permissions").</summary>
    private static (RequestContext Context, IResult? Error) RequireCounselorDashboard(
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

        if (!context.Permissions.Contains(FormMapsPermissions.CounselorDashboard))
        {
            return (context, Results.Json(
                new { success = false, code = "missing_permission", message = "Insufficient permissions" },
                statusCode: StatusCodes.Status403Forbidden));
        }

        return (context, null);
    }
}
