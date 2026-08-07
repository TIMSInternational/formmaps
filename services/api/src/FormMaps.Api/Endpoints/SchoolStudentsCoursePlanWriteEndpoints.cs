using System.Text.Json;
using FormMaps.Application.Auth;
using FormMaps.Application.SchoolAdmin;
using FormMaps.Application.SchoolStudents;
using FormMaps.Domain.Auth;

namespace FormMaps.Api.Endpoints;

/// <summary>
/// school:manage school-admin course-plan WRITES (formmaps#107 — routes/school-students.ts:187/209, mounted
/// /api/v1/school-admin). Third WRITE sub-slice: POST /students/{studentId}/course-plan/courses + DELETE
/// /students/{studentId}/course-plan/courses/{enrollmentId}. Both were added to Node by the #94 fix and existed
/// NOWHERE in .NET, so flipping the school-admin course-plan route flag without them would re-open #94 (the page's
/// "add course" / "remove course" buttons 404ing). SHIPPED DARK on purpose — this slice adds NO next.config.ts
/// rewrite and NO FORMMAPS_ROUTE_* flag; wiring one is a separate, separately-confirmed decision.
///
/// <para>ORDER IS LOAD-BEARING and mirrors legacy exactly: RequireIdentity (401) → school:manage (403) →
/// studentInCallerSchool (404 "Not found") → courseId presence (400 "courseId required"). The 404 gate runs BEFORE
/// the body check, so a cross-school caller POSTing <c>{}</c> gets 404 "Not found" and learns nothing about whether
/// the student exists — NOT 400 "courseId required". Then: the STUDENT's school (400 "Student has no school") →
/// that school's current academic year (400 "No current academic year") → INSERT → 201 with the full raw row.</para>
///
/// <para>The 201 body is the raw plan row and nothing else: legacy does <c>res.status(201).json({ success, data:
/// plan })</c> straight off the Prisma create, with no school_courses join — enriching it here would diverge.</para>
/// </summary>
public static class SchoolStudentsCoursePlanWriteEndpoints
{
    public static IEndpointRouteBuilder MapSchoolStudentsCoursePlanWriteEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/school-admin").WithTags("SchoolStudentsCoursePlanWrite");

        group.MapPost("/students/{studentId}/course-plan/courses", AddCourseAsync);
        group.MapDelete("/students/{studentId}/course-plan/courses/{enrollmentId}", RemoveCourseAsync);

        return app;
    }

    private static async Task<IResult> AddCourseAsync(
        HttpContext http,
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ISchoolAdminScopeResolver scope,
        ISchoolStudentsCoursePlanReader reader,
        ISchoolStudentsCoursePlanWriter writer,
        string studentId,
        CancellationToken cancellationToken)
    {
        var (context, error) = RequireSchoolManage(accessor, guard);
        if (error is not null)
        {
            return error;
        }

        // FIRST gate — before ANY body inspection. Legacy checks studentInCallerSchool then `!req.body?.courseId`.
        if (!await StudentInCallerSchoolAsync(context, scope, reader, studentId, cancellationToken))
        {
            return NotFound();
        }

        // primitive/malformed body → express strict throws → 500 (no write). Empty/array → {} → courseId absent →
        // 400 below. (DOCUMENTED LOW divergence, shared with FM-065/066: legacy's express.json() is app-level so a
        // malformed body 500s BEFORE the guards; here the guards win. Strictly safer — it leaks nothing.)
        var body = await ReadBodyAsync(http, cancellationToken);
        if (body is null)
        {
            return InternalError();
        }

        var b = body.Value;

        // `if (!req.body?.courseId)` — JS-falsy (absent/null/""/0/false) → 400. Then `qs(req.body.courseId)`.
        if (!b.TryGetProperty("courseId", out var courseIdElement) || !IsJsTruthy(courseIdElement))
        {
            return Results.Json(
                new { success = false, message = "courseId required" }, statusCode: StatusCodes.Status400BadRequest);
        }

        var result = await writer.CreateCoursePlanCourseAsync(
            context, studentId, Qs(courseIdElement), ResolveTerm(b), context.Actor?.UserId, cancellationToken);

        return result.Status switch
        {
            CoursePlanCourseCreateStatus.NoStudentSchool => Results.Json(
                new { success = false, message = "Student has no school" }, statusCode: StatusCodes.Status400BadRequest),
            CoursePlanCourseCreateStatus.NoCurrentAcademicYear => Results.Json(
                new { success = false, message = "No current academic year" }, statusCode: StatusCodes.Status400BadRequest),
            _ => Results.Json(
                new { success = true, data = PlanRowJson(result.Row!) }, statusCode: StatusCodes.Status201Created),
        };
    }

    private static async Task<IResult> RemoveCourseAsync(
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ISchoolAdminScopeResolver scope,
        ISchoolStudentsCoursePlanReader reader,
        ISchoolStudentsCoursePlanWriter writer,
        string studentId,
        string enrollmentId,
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

        var deleted = await writer.DeleteCoursePlanCourseAsync(context, studentId, enrollmentId, cancellationToken);

        // deleted.count === 0 → 404 "Not found" (a wrong id OR a right id belonging to a DIFFERENT student).
        return deleted ? Results.Ok(new { success = true }) : NotFound();
    }

    // studentInCallerSchool: Super Admin (RAW exact role, matching req.userRole === "Super Admin") bypasses; else the
    // caller must have a school AND the student must belong to it. Any miss → false → 404 "Not found".
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

    /// <summary>
    /// <c>term: req.body.semester || req.body.term</c>. semester wins when JS-truthy; otherwise term is used
    /// verbatim (INCLUDING an empty string, which Prisma writes as ''); absent/null on both → null → SQL NULL.
    /// (DOCUMENTED LOW divergence, matching FM-066's counselorNote precedent: a NON-string value 500s in legacy on
    /// Prisma's String? validation but is treated as absent here — unreachable from the UI, and skipping it avoids
    /// persisting a garbage term.)
    /// </summary>
    private static string? ResolveTerm(JsonElement body)
    {
        if (body.TryGetProperty("semester", out var semester)
            && semester.ValueKind == JsonValueKind.String
            && !string.IsNullOrEmpty(semester.GetString()))
        {
            return semester.GetString();
        }

        if (body.TryGetProperty("term", out var term) && term.ValueKind == JsonValueKind.String)
        {
            return term.GetString();
        }

        return null;
    }

    /// <summary>
    /// lib/query.ts <c>qs</c>: an array yields <c>String(val[0] ?? "")</c>; anything else non-nullish yields
    /// <c>String(val)</c>. Only reached for a JS-truthy value (so never false/0/""/null). An empty ARRAY is truthy in
    /// JS yet qs-stringifies to "" — that path is preserved.
    /// </summary>
    private static string Qs(JsonElement value) => value.ValueKind switch
    {
        JsonValueKind.String => value.GetString()!,
        JsonValueKind.Number => value.GetRawText(),
        JsonValueKind.True => "true",
        JsonValueKind.Array => value.GetArrayLength() == 0 ? string.Empty : Qs(value[0]),
        JsonValueKind.Object => "[object Object]",
        _ => value.GetRawText(),
    };

    // A student_course_plans row as legacy emits it (raw Prisma passthrough) — prisma schema field order, so `term`
    // precedes `courseId`. NO school_courses enrichment: legacy returns the bare created row.
    private static object PlanRowJson(StudentCoursePlanRow p) => new
    {
        id = p.Id,
        studentId = p.StudentId,
        schoolId = p.SchoolId,
        academicYearId = p.AcademicYearId,
        term = p.Term,
        courseId = p.CourseId,
        status = p.Status,
        sortOrder = p.SortOrder,
        notes = p.Notes,
        isActive = p.IsActive,
        createdBy = p.CreatedBy,
        createdDate = p.CreatedDate,
        updatedBy = p.UpdatedBy,
        updatedAt = p.UpdatedAt
    };

    private static readonly JsonElement EmptyObject = JsonDocument.Parse("{}").RootElement.Clone();

    // Mirror express.json({strict:true}): empty body → {}; a top-level ARRAY is accepted but exposes no fields →
    // treat as {}; a top-level PRIMITIVE is rejected and MALFORMED JSON throws → both → null → 500.
    private static async Task<JsonElement?> ReadBodyAsync(HttpContext http, CancellationToken cancellationToken)
    {
        using var streamReader = new StreamReader(http.Request.Body);
        var raw = await streamReader.ReadToEndAsync(cancellationToken);
        if (string.IsNullOrWhiteSpace(raw))
        {
            return EmptyObject;
        }

        try
        {
            using var document = JsonDocument.Parse(raw);
            var root = document.RootElement;
            return root.ValueKind switch
            {
                JsonValueKind.Object => root.Clone(),
                JsonValueKind.Array => EmptyObject,
                _ => null, // primitive → express strict rejects → 500
            };
        }
        catch (JsonException)
        {
            return null; // malformed → express throws → 500
        }
    }

    // JS truthiness of a JSON value: falsy only for false, 0, "", null; everything else (incl. objects/arrays) truthy.
    private static bool IsJsTruthy(JsonElement el) => el.ValueKind switch
    {
        JsonValueKind.String => !string.IsNullOrEmpty(el.GetString()),
        JsonValueKind.Number => !(el.TryGetDouble(out var n) && n == 0),
        JsonValueKind.True => true,
        JsonValueKind.False => false,
        JsonValueKind.Null => false,
        _ => true, // Object / Array
    };

    private static IResult InternalError() =>
        Results.Json(new { success = false, message = "Internal server error" }, statusCode: StatusCodes.Status500InternalServerError);

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
