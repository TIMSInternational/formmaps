using FormMaps.Application.Assessments;
using FormMaps.Application.Auth;
using FormMaps.Application.SchoolAdmin;
using FormMaps.Application.SchoolReads;
using FormMaps.Domain.Auth;

namespace FormMaps.Api.Endpoints;

/// <summary>
/// school:manage method-unambiguous reads (FM-DOTNET-050 — routes/school.ts, mounted under /api/v1/school-admin).
/// The four GETs with no write sharing their path: /dashboard/stats, /counselor-assignments/all, /notes,
/// /counselor-workload.
///
/// <para>Auth chain per endpoint: RequireIdentity (401) → permission <c>school:manage</c> (403) → resolve the
/// caller's own schoolId (getSchoolId — a fresh users.schoolId read keyed on the caller). Unlike the school-admin
/// assessment router, NO-SCHOOL IS NOT AN ERROR here: when the resolved schoolId is null/empty each handler
/// returns 200 with its OWN per-endpoint empty default —
/// dashboard/stats → the SERVICE's 6-field zeros object (NOT the full 10-field object);
/// counselor-assignments/all → { data: [] }; notes → { data: { data: [], total: 0 } } (NO page/limit — distinct
/// from the reader's empty-students { data: [], total: 0, page, limit }); counselor-workload → { data: [] }.</para>
/// </summary>
public static class SchoolReadsEndpoints
{
    public static IEndpointRouteBuilder MapSchoolReadsEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/school-admin").WithTags("SchoolReads");

        group.MapGet("/dashboard/stats", GetDashboardStatsAsync);
        group.MapGet("/counselor-assignments/all", GetCounselorAssignmentsAllAsync);
        group.MapGet("/notes", GetNotesAsync);
        group.MapGet("/counselor-workload", GetCounselorWorkloadAsync);

        return app;
    }

    private static async Task<IResult> GetDashboardStatsAsync(
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ISchoolAdminScopeResolver scope,
        ISchoolReadsReader reader,
        CancellationToken cancellationToken)
    {
        var (context, schoolId, error) = await AuthorizeAsync(accessor, guard, scope, cancellationToken);
        if (error is not null)
        {
            return error;
        }

        // No-school → the SERVICE's SIX-field zeros object EXACTLY (getDashboardStats early return) — NOT the full
        // 10-field object. Field set + order mirror schoolService.ts:21.
        if (string.IsNullOrEmpty(schoolId))
        {
            return Results.Ok(new
            {
                success = true,
                data = new
                {
                    totalStudents = 0,
                    totalCounselors = 0,
                    totalCourses = 0,
                    assessmentCompletionRate = 0,
                    pendingRequests = 0,
                    upcomingSessions = 0
                }
            });
        }

        var stats = await reader.GetDashboardStatsAsync(context, schoolId, cancellationToken);
        return Results.Ok(new
        {
            success = true,
            data = new
            {
                totalStudents = stats.TotalStudents,
                activeStudents = stats.TotalStudents,   // legacy: activeStudents = totalStudents (same value)
                totalCounselors = stats.TotalCounselors,
                totalCourses = stats.TotalCourses,
                pendingInvites = stats.PendingRequests, // legacy: pendingInvites = pendingRequests (same value)
                pendingRequests = stats.PendingRequests,
                completedAssessments = stats.CompletedAssessments,
                assessmentCompletionRate = stats.AssessmentCompletionRate,
                averageScore = stats.AverageScore,
                upcomingSessions = 0
            }
        });
    }

    private static async Task<IResult> GetCounselorAssignmentsAllAsync(
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ISchoolAdminScopeResolver scope,
        ISchoolReadsReader reader,
        CancellationToken cancellationToken)
    {
        var (context, schoolId, error) = await AuthorizeAsync(accessor, guard, scope, cancellationToken);
        if (error is not null)
        {
            return error;
        }

        if (string.IsNullOrEmpty(schoolId))
        {
            return Results.Ok(new { success = true, data = Array.Empty<object>() });
        }

        var rows = await reader.GetAllCounselorAssignmentsAsync(context, schoolId, cancellationToken);
        return Results.Ok(new
        {
            success = true,
            data = rows.Select(r => new { studentId = r.StudentId, counselorId = r.CounselorId })
        });
    }

    private static async Task<IResult> GetNotesAsync(
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ISchoolAdminScopeResolver scope,
        ISchoolReadsReader reader,
        string? page,
        string? limit,
        string? search,
        string? type,
        CancellationToken cancellationToken)
    {
        var (context, schoolId, error) = await AuthorizeAsync(accessor, guard, scope, cancellationToken);
        if (error is not null)
        {
            return error;
        }

        // No-school → the HANDLER's { data: [], total: 0 } (NO page/limit) — distinct from the reader's
        // empty-students { data: [], total: 0, page, limit }.
        if (string.IsNullOrEmpty(schoolId))
        {
            return Results.Ok(new { success = true, data = new { data = Array.Empty<object>(), total = 0 } });
        }

        // page = max(1, parseInt(page)||1); limit = min(50, max(1, parseInt(limit)||20)). NaN AND 0 fall through to
        // the default (JS `||`). (PcaExamPagination.Resolve caps at 100 — /notes caps at 50, so resolve inline.)
        var parsedPage = PcaExamPagination.JsParseInt(page);
        var resolvedPage = Math.Max(1, parsedPage is null or 0 ? 1 : parsedPage.Value);
        var parsedLimit = PcaExamPagination.JsParseInt(limit);
        var resolvedLimit = Math.Min(50, Math.Max(1, parsedLimit is null or 0 ? 20 : parsedLimit.Value));
        var skip = (long)(resolvedPage - 1) * resolvedLimit;

        // search = qs || "" ; type = qs || "" — empty string is JS-falsy → the filter is dropped (reader treats
        // null/empty the same). Pass through verbatim otherwise (legacy does NOT escape %/_ in the search term).
        var query = new SchoolNotesQuery(
            resolvedPage,
            resolvedLimit,
            skip,
            Search: string.IsNullOrEmpty(search) ? null : search,
            Type: string.IsNullOrEmpty(type) ? null : type);

        var result = await reader.GetSchoolNotesAsync(context, schoolId, query, cancellationToken);
        return Results.Ok(new
        {
            success = true,
            data = new
            {
                data = result.Data.Select(NoteJson),
                total = result.Total,
                page = result.Page,
                limit = result.Limit
            }
        });
    }

    private static async Task<IResult> GetCounselorWorkloadAsync(
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ISchoolAdminScopeResolver scope,
        ISchoolReadsReader reader,
        CancellationToken cancellationToken)
    {
        var (context, schoolId, error) = await AuthorizeAsync(accessor, guard, scope, cancellationToken);
        if (error is not null)
        {
            return error;
        }

        if (string.IsNullOrEmpty(schoolId))
        {
            return Results.Ok(new { success = true, data = Array.Empty<object>() });
        }

        var rows = await reader.GetCounselorWorkloadAsync(context, schoolId, cancellationToken);
        return Results.Ok(new
        {
            success = true,
            data = rows.Select(r => new
            {
                id = r.Id,
                name = r.Name,
                email = r.Email,
                studentCount = r.StudentCount,
                sessionCount = r.SessionCount,
                noteCount = r.NoteCount,
                assignedStudents = r.AssignedStudents.Select(s => new
                {
                    id = s.Id,
                    name = s.Name,
                    email = s.Email,
                    gradeLevel = s.GradeLevel,
                    isActive = s.IsActive
                })
            })
        });
    }

    // A counselor_notes row as legacy emits it: every scalar column (camelCase) + nested student/author.
    private static object NoteJson(SchoolNote n) => new
    {
        id = n.Id,
        studentId = n.StudentId,
        authorId = n.AuthorId,
        type = n.Type,
        content = n.Content,
        isPrivate = n.IsPrivate,
        followUpDate = n.FollowUpDate,
        followUpCompleted = n.FollowUpCompleted,
        followUpCompletedAt = n.FollowUpCompletedAt,
        tags = n.Tags,
        isActive = n.IsActive,
        createdBy = n.CreatedBy,
        createdDate = n.CreatedDate,
        updatedBy = n.UpdatedBy,
        updatedAt = n.UpdatedAt,
        student = new { id = n.Student.Id, name = n.Student.Name, email = n.Student.Email },
        author = new { id = n.Author.Id, name = n.Author.Name, email = n.Author.Email }
    };

    /// <summary>
    /// Shared guard chain: RequireIdentity (401) → permission school:manage (403) → resolve the caller's own
    /// schoolId. The resolved schoolId MAY be null/empty — that is NOT an error here; each handler renders its own
    /// 200 empty default. Error is non-null ONLY for 401/403.
    /// </summary>
    private static async Task<(RequestContext Context, string? SchoolId, IResult? Error)> AuthorizeAsync(
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ISchoolAdminScopeResolver scope,
        CancellationToken cancellationToken)
    {
        var context = accessor.Current;

        var decision = guard.RequireIdentity(context);
        if (!decision.Allowed)
        {
            return (context, null, Results.Json(
                new { success = false, code = decision.Code, message = decision.Message },
                statusCode: decision.StatusCode));
        }

        if (!context.Permissions.Contains(FormMapsPermissions.SchoolManage))
        {
            return (context, null, Results.Json(
                new { success = false, code = "missing_permission", message = "Insufficient permissions" },
                statusCode: StatusCodes.Status403Forbidden));
        }

        var schoolId = await scope.ResolveSchoolIdAsync(context, cancellationToken);
        return (context, schoolId, null);
    }
}
