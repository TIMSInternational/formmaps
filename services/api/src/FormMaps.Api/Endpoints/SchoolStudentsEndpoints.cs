using FormMaps.Application.Assessments;
using FormMaps.Application.Auth;
using FormMaps.Application.SchoolAdmin;
using FormMaps.Application.SchoolStudents;
using FormMaps.Domain.Auth;

namespace FormMaps.Api.Endpoints;

/// <summary>
/// school:manage roster reads (FM-DOTNET-062 — routes/school-students.ts, mounted under /api/v1/school-admin).
/// The first sub-slice of school-students: GET /students (list), GET /students/{studentId} (detail),
/// GET /students/{studentId}/community-service. SHIPPED DARK — no next.config rewrite: /students/{studentId}
/// carries an un-ported DELETE (soft delete) and /students carries un-ported POST invites, and Next rewrites match
/// PATH-not-method, so a reads-only rewrite would misroute the writes (FM-047 precedent). The domain co-flips when
/// the writes land.
///
/// <para>Auth chain per endpoint: RequireIdentity (401) → permission <c>school:manage</c> (403) → resolve the
/// caller's own schoolId (getSchoolId). No-school handling DIFFERS per endpoint (faithful to the routes):
/// list → 200 with { success:true, data:{ data:[], total:0 } }; detail + community-service → 400 "No school".
/// The two detail/community reads return 404 "Student not found" for a missing OR cross-school student (uniform
/// IDOR-404). The list HAPPY path emits the service object VERBATIM ({ data,total,page,limit,totalPages }) with NO
/// success wrapper — deliberately asymmetric with its own no-school shape.</para>
/// </summary>
public static class SchoolStudentsEndpoints
{
    public static IEndpointRouteBuilder MapSchoolStudentsEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/school-admin").WithTags("SchoolStudents");

        group.MapGet("/students", GetStudentsAsync);
        group.MapGet("/students/{studentId}", GetStudentDetailAsync);
        group.MapGet("/students/{studentId}/community-service", GetStudentCommunityServiceAsync);

        return app;
    }

    private static async Task<IResult> GetStudentsAsync(
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ISchoolAdminScopeResolver scope,
        ISchoolStudentsReader reader,
        string? page,
        string? limit,
        string? search,
        CancellationToken cancellationToken)
    {
        var (context, schoolId, error) = await AuthorizeAsync(accessor, guard, scope, cancellationToken);
        if (error is not null)
        {
            return error;
        }

        // No-school → 200 { success:true, data:{ data:[], total:0 } } (the route's early return — NOTE the success
        // wrapper + inner {data,total}, deliberately different from the happy-path bare object below).
        if (string.IsNullOrEmpty(schoolId))
        {
            return Results.Ok(new { success = true, data = new { data = Array.Empty<object>(), total = 0 } });
        }

        // page = max(1, parseInt(page)||1); limit = min(100, max(1, parseInt(limit)||20)) — reuse the ratified clamp.
        // search = qs || undefined: empty string is JS-falsy → the OR filter is dropped.
        var pagination = PcaExamPagination.Resolve(page, limit);
        var query = new StudentListQuery(
            pagination.Page,
            pagination.Limit,
            pagination.Skip,
            Search: string.IsNullOrEmpty(search) ? null : search);

        var result = await reader.ListStudentsAsync(context, schoolId, query, cancellationToken);

        // res.json(result) — the SERVICE object VERBATIM: { data, total, page, limit, totalPages }. NO success key.
        return Results.Ok(new
        {
            data = result.Data.Select(StudentListJson),
            total = result.Total,
            page = result.Page,
            limit = result.Limit,
            totalPages = result.TotalPages
        });
    }

    private static async Task<IResult> GetStudentDetailAsync(
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ISchoolAdminScopeResolver scope,
        ISchoolStudentsReader reader,
        string studentId,
        CancellationToken cancellationToken)
    {
        var (context, schoolId, error) = await AuthorizeAsync(accessor, guard, scope, cancellationToken);
        if (error is not null)
        {
            return error;
        }

        if (string.IsNullOrEmpty(schoolId))
        {
            return NoSchool();
        }

        var detail = await reader.GetStudentDetailAsync(context, schoolId, studentId, cancellationToken);
        if (detail is null)
        {
            return StudentNotFound();
        }

        return Results.Ok(new
        {
            success = true,
            data = new
            {
                id = detail.Id,
                name = detail.Name,
                email = detail.Email,
                gradeLevel = detail.GradeLevel,
                status = detail.Status,
                gpa = detail.Gpa,
                alertCount = detail.AlertCount,
                lastActive = detail.LastActive,
                // Keys PCA/MIL/Eval360 must stay VERBATIM (legacy casing). Anonymous-object property names are
                // camelCased by the Web JSON policy ("PCA"→"pCA"); a Dictionary is not (DictionaryKeyPolicy is
                // null). Insertion order (PCA, MIL, Eval360) is the emit order.
                assessmentStatus = new Dictionary<string, string>
                {
                    ["PCA"] = detail.AssessmentStatus.Pca,
                    ["MIL"] = detail.AssessmentStatus.Mil,
                    ["Eval360"] = detail.AssessmentStatus.Eval360
                },
                creditProgress = new
                {
                    earned = detail.CreditProgress.Earned,
                    required = detail.CreditProgress.Required,
                    percentage = detail.CreditProgress.Percentage
                }
            }
        });
    }

    private static async Task<IResult> GetStudentCommunityServiceAsync(
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ISchoolAdminScopeResolver scope,
        ISchoolStudentsReader reader,
        string studentId,
        CancellationToken cancellationToken)
    {
        var (context, schoolId, error) = await AuthorizeAsync(accessor, guard, scope, cancellationToken);
        if (error is not null)
        {
            return error;
        }

        if (string.IsNullOrEmpty(schoolId))
        {
            return NoSchool();
        }

        var result = await reader.GetStudentCommunityServiceAsync(context, schoolId, studentId, cancellationToken);
        if (result is null)
        {
            return StudentNotFound();
        }

        return Results.Ok(new
        {
            success = true,
            data = new
            {
                entries = result.Entries.Select(CommunityServiceEntryJson),
                totalHoursRequired = result.TotalHoursRequired
            }
        });
    }

    // A roster row exactly as legacy emits it: the select fields in order + the derived status.
    private static object StudentListJson(StudentListItem s) => new
    {
        id = s.Id,
        name = s.Name,
        email = s.Email,
        roleName = s.RoleName,
        gradeLevel = s.GradeLevel,
        isActive = s.IsActive,
        createdDate = s.CreatedDate,
        status = s.Status
    };

    // A community_service_entries row as legacy emits it (raw Prisma passthrough) — every column in schema order.
    private static object CommunityServiceEntryJson(CommunityServiceEntryRow e) => new
    {
        id = e.Id,
        studentId = e.StudentId,
        schoolId = e.SchoolId,
        organization = e.Organization,
        description = e.Description,
        hours = e.Hours,
        date = e.Date,
        supervisorName = e.SupervisorName,
        supervisorEmail = e.SupervisorEmail,
        status = e.Status,
        note = e.Note,
        verifiedBy = e.VerifiedBy,
        verifiedAt = e.VerifiedAt,
        isActive = e.IsActive,
        createdBy = e.CreatedBy,
        createdDate = e.CreatedDate,
        updatedBy = e.UpdatedBy,
        updatedAt = e.UpdatedAt
    };

    private static IResult NoSchool() =>
        Results.Json(new { success = false, message = "No school" }, statusCode: StatusCodes.Status400BadRequest);

    private static IResult StudentNotFound() =>
        Results.Json(new { success = false, message = "Student not found" }, statusCode: StatusCodes.Status404NotFound);

    /// <summary>
    /// Shared guard chain: RequireIdentity (401) → permission school:manage (403) → resolve the caller's own
    /// schoolId (MAY be null/empty — each handler renders its own no-school shape). Error is non-null only for 401/403.
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
