using FormMaps.Application.Assessments;
using FormMaps.Application.Auth;
using FormMaps.Application.SchoolAdmin;
using FormMaps.Application.SchoolStudents;
using FormMaps.Domain.Auth;

namespace FormMaps.Api.Endpoints;

/// <summary>
/// Course-planning reads (FM-DOTNET-064 — routes/school-students.ts, mounted /api/v1/school-admin). Third sub-slice
/// of school-students: GET /students/{studentId}/course-plan, GET /students/{studentId}/course-plan/change-requests,
/// GET /course-request-deadline. SHIPPED DARK (co-flips with the writes; /course-request-deadline carries an
/// un-ported PUT, the change-requests path an un-ported review PUT — Next matches path-not-method).
///
/// <para>Auth DIFFERS: the two /course-plan reads are ROLE-gated (RequireIdentity → role ∈ {school_admin, Super
/// Admin} RAW exact → else 403 "Forbidden") then studentInCallerSchool (Super-Admin bypass, else student-in-caller-
/// school; miss → 404 "Not found"). /course-request-deadline is school:manage (→ 403) then resolve caller school
/// (no-school → 400 "No school").</para>
/// </summary>
public static class SchoolStudentsCoursePlanEndpoints
{
    public static IEndpointRouteBuilder MapSchoolStudentsCoursePlanEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/school-admin").WithTags("SchoolStudentsCoursePlan");

        group.MapGet("/students/{studentId}/course-plan", GetCoursePlanAsync);
        group.MapGet("/students/{studentId}/course-plan/change-requests", GetChangeRequestsAsync);
        group.MapGet("/course-request-deadline", GetCourseRequestDeadlineAsync);

        return app;
    }

    private static async Task<IResult> GetCoursePlanAsync(
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ISchoolAdminScopeResolver scope,
        ISchoolStudentsCoursePlanReader reader,
        string studentId,
        CancellationToken cancellationToken)
    {
        var (context, error) = RequireCoursePlanRole(accessor, guard);
        if (error is not null)
        {
            return error;
        }

        if (!await StudentInCallerSchoolAsync(context, scope, reader, studentId, cancellationToken))
        {
            return NotFound();
        }

        var result = await reader.GetStudentCoursePlanAsync(context, studentId, cancellationToken);
        if (result is null)
        {
            // No-school / missing student → the minimal early-return shape (plan has ONLY enrollments).
            return Results.Ok(new { success = true, data = new { plan = new { enrollments = Array.Empty<object>() }, recommendations = Array.Empty<object>() } });
        }

        return Results.Ok(new
        {
            success = true,
            data = new
            {
                plan = new
                {
                    studentId = result.StudentId,
                    gradeLevel = result.GradeLevel,
                    enrollments = result.Enrollments.Select(EnrollmentJson),
                    graduationProgress = new
                    {
                        totalCreditsEarned = result.TotalCreditsEarned,
                        totalCreditsRequired = result.TotalCreditsRequired,
                        isOnTrack = result.IsOnTrack
                    }
                },
                recommendations = Array.Empty<object>()
            }
        });
    }

    private static async Task<IResult> GetChangeRequestsAsync(
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ISchoolAdminScopeResolver scope,
        ISchoolStudentsCoursePlanReader reader,
        string studentId,
        string? status,
        CancellationToken cancellationToken)
    {
        var (context, error) = RequireCoursePlanRole(accessor, guard);
        if (error is not null)
        {
            return error;
        }

        if (!await StudentInCallerSchoolAsync(context, scope, reader, studentId, cancellationToken))
        {
            return NotFound();
        }

        // status = qs(status) || undefined → empty string drops the filter.
        var result = await reader.GetStudentChangeRequestsAsync(
            context, studentId, string.IsNullOrEmpty(status) ? null : status, cancellationToken);

        return Results.Ok(new
        {
            success = true,
            data = new { data = result.Data.Select(ChangeRequestJson), total = result.Total }
        });
    }

    private static async Task<IResult> GetCourseRequestDeadlineAsync(
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ISchoolAdminScopeResolver scope,
        ISchoolStudentsCoursePlanReader reader,
        CancellationToken cancellationToken)
    {
        var context = accessor.Current;

        var decision = guard.RequireIdentity(context);
        if (!decision.Allowed)
        {
            return Results.Json(new { success = false, code = decision.Code, message = decision.Message }, statusCode: decision.StatusCode);
        }

        if (!context.Permissions.Contains(FormMapsPermissions.SchoolManage))
        {
            return Results.Json(
                new { success = false, code = "missing_permission", message = "Insufficient permissions" },
                statusCode: StatusCodes.Status403Forbidden);
        }

        var schoolId = await scope.ResolveSchoolIdAsync(context, cancellationToken);
        if (string.IsNullOrEmpty(schoolId))
        {
            return Results.Json(new { success = false, message = "No school" }, statusCode: StatusCodes.Status400BadRequest);
        }

        var deadline = await reader.GetCourseRequestDeadlineAsync(context, schoolId, cancellationToken);
        return Results.Ok(new { success = true, data = new { deadline } });
    }

    // studentInCallerSchool: Super Admin (raw exact) bypasses; else caller must have a school AND the student must
    // belong to it. Any miss → false → 404 "Not found".
    private static async Task<bool> StudentInCallerSchoolAsync(
        RequestContext context,
        ISchoolAdminScopeResolver scope,
        ISchoolStudentsCoursePlanReader reader,
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

    // An enrollment: graded rows carry a `grade` key; plan rows do NOT (the legacy object-shape asymmetry).
    private static object EnrollmentJson(CoursePlanEnrollment e) => e.IsGraded
        ? new
        {
            id = e.Id,
            courseId = e.CourseId,
            courseCode = e.CourseCode,
            courseName = e.CourseName,
            credits = e.Credits,
            category = e.Category,
            gradeLevel = e.GradeLevel,
            semester = e.Semester,
            status = e.Status,
            grade = e.Grade
        }
        : new
        {
            id = e.Id,
            courseId = e.CourseId,
            courseCode = e.CourseCode,
            courseName = e.CourseName,
            credits = e.Credits,
            category = e.Category,
            gradeLevel = e.GradeLevel,
            semester = e.Semester,
            status = e.Status
        };

    // A course_change_requests row as legacy emits it (raw Prisma passthrough) — every column in schema order.
    private static object ChangeRequestJson(CourseChangeRequestRow r) => new
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
        updatedAt = r.UpdatedAt
    };

    private static IResult NotFound() =>
        Results.Json(new { success = false, message = "Not found" }, statusCode: StatusCodes.Status404NotFound);

    /// <summary>RequireIdentity (401) → role ∈ {school_admin, Super Admin} (raw exact) → else 403 "Forbidden".</summary>
    private static (RequestContext Context, IResult? Error) RequireCoursePlanRole(
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

        var role = context.Actor?.Role;
        if (role != FormMapsRoles.SchoolAdmin && role != FormMapsRoles.SuperAdmin)
        {
            return (context, Results.Json(
                new { success = false, message = "Forbidden" },
                statusCode: StatusCodes.Status403Forbidden));
        }

        return (context, null);
    }
}
