using System.Text.Json;
using FormMaps.Application.Auth;
using FormMaps.Application.SchoolAdmin;
using FormMaps.Application.SchoolStudents;
using FormMaps.Domain.Auth;

namespace FormMaps.Api.Endpoints;

/// <summary>
/// school:manage school-students review WRITES (FM-DOTNET-066 — routes/school-students.ts, mounted
/// /api/v1/school-admin). Second WRITE sub-slice: PUT /community-service/{entryId}/verify + PUT
/// /students/{studentId}/course-plan/change-requests/{requestId}/review. SHIPPED DARK.
///
/// <para>verify: RequireIdentity → school:manage → zod body {status ∈ {verified,rejected}, note? ≤1000} (400
/// "Invalid request body") → callerSchoolId = Super Admin ? null : own school (non-admin no-school → 400 "No
/// school") → 404 "Entry not found". review: RequireIdentity → school:manage → validate body.status ∈
/// {approved,rejected,pending} when present (400 "Invalid status") → studentInCallerSchool → 404 "Not found" →
/// 404 "Request not found".</para>
/// </summary>
public static class SchoolStudentsReviewEndpoints
{
    private static readonly HashSet<string> VerifyStatuses = new(StringComparer.Ordinal) { "verified", "rejected" };
    private static readonly HashSet<string> ReviewStatuses = new(StringComparer.Ordinal) { "approved", "rejected", "pending" };

    public static IEndpointRouteBuilder MapSchoolStudentsReviewEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/school-admin").WithTags("SchoolStudentsReview");

        group.MapPut("/community-service/{entryId}/verify", VerifyCommunityServiceAsync);
        group.MapPut("/students/{studentId}/course-plan/change-requests/{requestId}/review", ReviewChangeRequestAsync);

        return app;
    }

    private static async Task<IResult> VerifyCommunityServiceAsync(
        HttpContext http,
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ISchoolAdminScopeResolver scope,
        ISchoolStudentsReviewWriter writer,
        string entryId,
        CancellationToken cancellationToken)
    {
        var (context, error) = RequireSchoolManage(accessor, guard);
        if (error is not null)
        {
            return error;
        }

        // A primitive/malformed body → express strict/throw → 500 (no write). An empty/array body → {} → zod
        // .object() fails on the missing status → 400. zod: { status ∈ {verified,rejected}, note? string.max(1000) }.
        var body = await ReadBodyAsync(http, cancellationToken);
        if (body is null)
        {
            return InternalError();
        }

        var b = body.Value;
        if (!b.TryGetProperty("status", out var s) || s.ValueKind != JsonValueKind.String
            || !VerifyStatuses.Contains(s.GetString()!)
            || !TryReadOptionalBoundedString(b, "note", 1000, out var note))
        {
            return Results.Json(new { success = false, message = "Invalid request body" }, statusCode: StatusCodes.Status400BadRequest);
        }

        var isSuperAdmin = context.Actor?.Role == FormMapsRoles.SuperAdmin;
        var callerSchoolId = isSuperAdmin ? null : await scope.ResolveSchoolIdAsync(context, cancellationToken);
        if (!isSuperAdmin && string.IsNullOrEmpty(callerSchoolId))
        {
            return NoSchool();
        }

        var entry = await writer.VerifyCommunityServiceAsync(
            context, entryId, context.Actor!.UserId, callerSchoolId, s.GetString()!, note, cancellationToken);
        return entry is null
            ? Results.Json(new { success = false, message = "Entry not found" }, statusCode: StatusCodes.Status404NotFound)
            : Results.Ok(new { success = true, data = CommunityServiceEntryJson(entry) });
    }

    private static async Task<IResult> ReviewChangeRequestAsync(
        HttpContext http,
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ISchoolAdminScopeResolver scope,
        ISchoolStudentsReviewWriter writer,
        string studentId,
        string requestId,
        CancellationToken cancellationToken)
    {
        var (context, error) = RequireSchoolManage(accessor, guard);
        if (error is not null)
        {
            return error;
        }

        // primitive/malformed body → 500 (no write); empty/array → {} → status absent → proceeds (metadata write).
        var body = await ReadBodyAsync(http, cancellationToken);
        if (body is null)
        {
            return InternalError();
        }

        var b = body.Value;

        // Faithful `if (req.body.status && !VALID.includes(status))` + Prisma-on-falsy. absent → omit; a JS-truthy
        // VALID string label → set; a JS-truthy invalid value (bad string OR ANY non-string) → 400 "Invalid status";
        // a JS-FALSY present value (""/0/false/null) → passed to the writer as "" so the enum cast fails (500) AFTER
        // the 404 gates, matching legacy skipping the 400 then Prisma rejecting data.status = falsy.
        string? status = null;
        if (b.TryGetProperty("status", out var st))
        {
            if (IsJsTruthy(st))
            {
                if (st.ValueKind == JsonValueKind.String && ReviewStatuses.Contains(st.GetString()!))
                {
                    status = st.GetString();
                }
                else
                {
                    return Results.Json(new { success = false, message = "Invalid status" }, statusCode: StatusCodes.Status400BadRequest);
                }
            }
            else
            {
                status = "";
            }
        }

        if (!await StudentInCallerSchoolAsync(context, scope, writer, studentId, cancellationToken))
        {
            return NotFound();
        }

        // counselorNote: `if (counselorNote)` — a non-empty string is written; else omitted. (DOCUMENTED accepted LOW
        // divergence: a JS-truthy NON-string counselorNote — 123/true/{} — 500s in legacy Prisma but is simply
        // omitted here [200]; unreachable via the UI, and the lenient path avoids persisting a garbage value.)
        string? counselorNote = null;
        if (b.TryGetProperty("counselorNote", out var cn) && cn.ValueKind == JsonValueKind.String)
        {
            var value = cn.GetString();
            counselorNote = string.IsNullOrEmpty(value) ? null : value;
        }

        var cr = await writer.ReviewChangeRequestAsync(
            context, context.Actor!.UserId, studentId, requestId, status, counselorNote, cancellationToken);
        return cr is null
            ? Results.Json(new { success = false, message = "Request not found" }, statusCode: StatusCodes.Status404NotFound)
            : Results.Ok(new { success = true, data = ChangeRequestJson(cr) });
    }

    // studentInCallerSchool: Super Admin (raw exact) bypasses; else caller must have a school AND the student must
    // belong to it. Any miss → 404 "Not found".
    private static async Task<bool> StudentInCallerSchoolAsync(
        RequestContext context, ISchoolAdminScopeResolver scope, ISchoolStudentsReviewWriter writer,
        string studentId, CancellationToken cancellationToken)
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

        return await writer.IsStudentInCallerSchoolAsync(context, callerSchoolId, studentId, cancellationToken);
    }

    // zod string.max(1000).optional(): absent → out null (ok); a string ≤1000 → out it; present-non-string or >1000 → false.
    private static bool TryReadOptionalBoundedString(JsonElement body, string name, int max, out string? value)
    {
        value = null;
        if (!body.TryGetProperty(name, out var el))
        {
            return true;
        }

        if (el.ValueKind != JsonValueKind.String)
        {
            return false;
        }

        var raw = el.GetString();
        if (raw is not null && raw.Length > max)
        {
            return false;
        }

        value = raw;
        return true;
    }

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

    private static readonly JsonElement EmptyObject = JsonDocument.Parse("{}").RootElement.Clone();

    // Mirror express.json({strict:true}) + zod: empty body → {}; a top-level ARRAY is accepted by express but exposes
    // no fields → treat as {} (field access yields undefined); a top-level PRIMITIVE is rejected by strict parsing and
    // MALFORMED JSON throws → both map to null → the endpoint returns 500 (legacy global handler). Guarding the object
    // shape also avoids JsonElement.TryGetProperty throwing on a non-object (the codebase-wide ValueKind==Object guard).
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

    private static IResult NoSchool() =>
        Results.Json(new { success = false, message = "No school" }, statusCode: StatusCodes.Status400BadRequest);

    private static IResult NotFound() =>
        Results.Json(new { success = false, message = "Not found" }, statusCode: StatusCodes.Status404NotFound);

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
