using System.Text.Json;
using FormMaps.Application.Assessments;
using FormMaps.Application.Auth;
using FormMaps.Application.SchoolAdmin;
using FormMaps.Application.SchoolUsers;
using FormMaps.Domain.Auth;

namespace FormMaps.Api.Endpoints;

/// <summary>
/// school:users cluster (FM-DOTNET-052 — routes/school.ts, mounted under /api/v1/school-admin): GET /users,
/// PUT /users/:userId/grade-level, POST+DELETE /counselors/:counselorId/assign-students,
/// GET /counselors/:counselorId/students. All five gate on permission <c>school:users</c> (distinct from the FM-050
/// reads / FM-051 profile which gate on <c>school:manage</c>).
///
/// <para>No-school handling DIFFERS per route: the two GET reads (/users, /counselors/:id/students) return 200 with
/// { data: [], total: 0 } (NO page/limit); the two WRITE routes (assign/unassign) return 400 "No school";
/// grade-level does NOT resolve the caller's schoolId at all (the service reads admin+target schoolIds itself). The
/// route <c>data</c> envelope wraps the raw service result verbatim — including the nested {success:true} for
/// unassign (legacy <c>res.json({ success:true, data:result })</c> where result is itself {success:true}).</para>
///
/// <para><b>formmaps#114 adds a SIXTH route to the cluster: PUT /users/{userId}/role.</b> Same flag
/// (FORMMAPS_ROUTE_SCHOOL_USERS_TO_DOTNET co-flips the whole cluster, so this route exists in BOTH backends or the
/// UI breaks on flip), same <c>school:users</c> gate, same AuthorizeIdentityAndPermission path as grade-level.
/// Its authorization rule is the point of it: see <see cref="PutRoleAsync"/> and
/// <see cref="FormMaps.Application.SchoolUsers.RoleChangeGuard"/>.</para>
/// </summary>
public static class SchoolUsersEndpoints
{
    public static IEndpointRouteBuilder MapSchoolUsersEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/school-admin").WithTags("SchoolUsers");

        group.MapGet("/users", GetUsersAsync);
        group.MapPut("/users/{userId}/grade-level", PutGradeLevelAsync);
        group.MapPut("/users/{userId}/role", PutRoleAsync);
        group.MapPost("/counselors/{counselorId}/assign-students", PostAssignStudentsAsync);
        group.MapDelete("/counselors/{counselorId}/assign-students", DeleteAssignStudentsAsync);
        group.MapGet("/counselors/{counselorId}/students", GetCounselorStudentsAsync);

        return app;
    }

    // ---------------------------------------------------------------- GET /users

    private static async Task<IResult> GetUsersAsync(
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ISchoolAdminScopeResolver scope,
        ISchoolUsersReader reader,
        string? page,
        string? limit,
        string? role,
        string? search,
        CancellationToken cancellationToken)
    {
        var (context, schoolId, error) = await AuthorizeWithScopeAsync(accessor, guard, scope, cancellationToken);
        if (error is not null)
        {
            return error;
        }

        // No-school → { data: [], total: 0 } — NO page/limit/totalPages (matches school.ts:53 exactly).
        if (string.IsNullOrEmpty(schoolId))
        {
            return Results.Ok(new { success = true, data = new { data = Array.Empty<object>(), total = 0 } });
        }

        var (resolvedPage, resolvedLimit, skip) = ResolvePagination(page, limit);
        var query = new SchoolUsersQuery(
            resolvedPage,
            resolvedLimit,
            skip,
            Role: string.IsNullOrEmpty(role) ? null : role,
            Search: string.IsNullOrEmpty(search) ? null : search);

        var result = await reader.ListSchoolUsersAsync(context, schoolId, query, cancellationToken);
        return Results.Ok(new
        {
            success = true,
            data = new
            {
                data = result.Data.Select(UserJson),
                total = result.Total,
                page = result.Page,
                limit = result.Limit,
                totalPages = result.TotalPages
            }
        });
    }

    // ---------------------------------------------------------------- PUT /users/{userId}/grade-level

    private static async Task<IResult> PutGradeLevelAsync(
        HttpContext http,
        string userId,
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ISchoolUsersWriter writer,
        CancellationToken cancellationToken)
    {
        // grade-level does NOT resolve the caller schoolId (the writer reads admin+target schoolIds itself).
        var (context, error) = AuthorizeIdentityAndPermission(accessor, guard);
        if (error is not null)
        {
            return error;
        }

        var body = await ReadBodyAsync(http, cancellationToken);
        if (body is null)
        {
            // Malformed JSON. Legacy body-parser 400s before the handler; we surface the sanctioned house 400
            // (FM-051 precedent). An empty/whitespace body is {} → gradeLevel absent (handled below), not malformed.
            return Results.Json(new { success = false, message = "Invalid request body" }, statusCode: StatusCodes.Status400BadRequest);
        }

        // body.gradeLevel: present → coerce to the DB value (GradeLevelParser); absent → null (legacy
        // parseInt(undefined)||null). The RESPONSE echoes the RAW token verbatim, or omits the key when absent.
        var hasGrade = body.Value.ValueKind == JsonValueKind.Object
            && body.Value.TryGetProperty("gradeLevel", out var gradeElement);
        var rawGrade = hasGrade ? body.Value.GetProperty("gradeLevel") : default;
        var dbValue = hasGrade ? GradeLevelParser.ParseDbValue(rawGrade) : null;

        var status = await writer.UpdateUserGradeLevelAsync(context, context.Actor!.UserId, userId, dbValue, cancellationToken);
        if (status == GradeLevelUpdateStatus.CrossSchool)
        {
            return Results.Json(
                new { success = false, message = "Cannot modify users from another school" },
                statusCode: StatusCodes.Status403Forbidden);
        }

        // { userId, gradeLevel } — gradeLevel echoes the RAW body token (string stays string, number stays number);
        // omitted entirely when the body had no gradeLevel key (JS undefined).
        return hasGrade
            ? Results.Ok(new { success = true, data = new { userId, gradeLevel = rawGrade } })
            : Results.Ok(new { success = true, data = new { userId } });
    }

    // ---------------------------------------------------------------- PUT /users/{userId}/role

    /// <summary>
    /// formmaps#114. A school admin may move a STAFF member between STAFF roles inside their OWN school, and nothing
    /// else. Five guards: G1 the <c>school:users</c> permission (below); G2 self / G3 tenant / G5 the target's
    /// CURRENT role (<see cref="FormMaps.Application.SchoolUsers.RoleChangeGuard"/>, inside the writer's session);
    /// G4 the destination allowlist (<see cref="RoleChangeRequest"/>).
    ///
    /// <para><b>Strictness is hand-written, and that is deliberate.</b> Node gets it from
    /// <c>z.object({...}).strict()</c>. System.Text.Json IGNORES unknown properties by default, which is precisely
    /// the pre-formmaps#79 failure mode — so binding this body to a POCO would reproduce that privilege bug in .NET.
    /// <see cref="RoleChangeRequest.Parse"/> rejects a non-object root, an absent/non-string roleName, ANY extra
    /// property, and any value outside the allowlist.</para>
    ///
    /// <para><b>Known parity gap, flagged rather than hidden:</b> the Node route also writes an
    /// <c>audit_logs</c> row (USER_ROLE_CHANGE) and revokes the target's refresh tokens. .NET has NO audit_logs
    /// writer and NO revocation helper anywhere in services/api/src, so both disappear the moment the flag flips.
    /// Tracked as a follow-up; not silently absorbed here.</para>
    /// </summary>
    private static async Task<IResult> PutRoleAsync(
        HttpContext http,
        string userId,
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ISchoolUsersWriter writer,
        CancellationToken cancellationToken)
    {
        // Same authorize path as grade-level (NOT AuthorizeWithScopeAsync): the writer reads BOTH schoolIds itself,
        // so pre-resolving the caller's would be a second, divergent source of truth for G3.
        var (context, error) = AuthorizeIdentityAndPermission(accessor, guard);
        if (error is not null)
        {
            return error;
        }

        var parsed = RoleChangeRequest.Parse(await ReadBodyAsync(http, cancellationToken));
        if (parsed.Error is not null)
        {
            return Results.Json(new { success = false, message = parsed.Error }, statusCode: StatusCodes.Status400BadRequest);
        }

        var result = await writer.UpdateUserRoleAsync(context, context.Actor!.UserId, userId, parsed.RoleName!, cancellationToken);

        // ONE arm per guard, so no guard can be silently folded into another. Messages and codes are pinned to the
        // Node twin's, character for character.
        return result.Status switch
        {
            RoleUpdateStatus.SelfChange => Forbidden("Cannot change your own role"),
            RoleUpdateStatus.CrossSchool => Forbidden("Cannot modify users from another school"),
            RoleUpdateStatus.ProtectedAdminTarget => Forbidden("Cannot change an administrator's role"),
            RoleUpdateStatus.ProtectedStudentTarget => Forbidden("Cannot change a student's role"),
            RoleUpdateStatus.TargetNotFound => Results.Json(
                new { success = false, message = "User not found" }, statusCode: StatusCodes.Status404NotFound),
            RoleUpdateStatus.RoleNotFound => Results.Json(
                new { success = false, message = "Role not found" }, statusCode: StatusCodes.Status400BadRequest),
            RoleUpdateStatus.NoChange => Results.Json(
                new { success = false, message = "User already has this role" }, statusCode: StatusCodes.Status400BadRequest),
            _ => Results.Ok(new
            {
                success = true,
                data = new { userId, roleName = result.RoleName, previousRoleName = result.PreviousRoleName }
            }),
        };
    }

    private static IResult Forbidden(string message) =>
        Results.Json(new { success = false, message }, statusCode: StatusCodes.Status403Forbidden);

    // ---------------------------------------------------------------- POST/DELETE /counselors/{counselorId}/assign-students

    private static Task<IResult> PostAssignStudentsAsync(
        HttpContext http,
        string counselorId,
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ISchoolAdminScopeResolver scope,
        ISchoolUsersWriter writer,
        CancellationToken cancellationToken) =>
        AssignOrUnassignAsync(http, counselorId, accessor, guard, scope, cancellationToken, async (context, schoolId, ids) =>
        {
            var result = await writer.AssignStudentsAsync(context, schoolId, counselorId, ids, context.Actor!.UserId, cancellationToken);
            return result.Error is not null
                ? Results.Json(new { success = false, message = result.Error }, statusCode: StatusCodes.Status400BadRequest)
                : Results.Ok(new { success = true, data = new { assigned = result.Assigned, counselorId = result.CounselorId } });
        });

    private static Task<IResult> DeleteAssignStudentsAsync(
        HttpContext http,
        string counselorId,
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ISchoolAdminScopeResolver scope,
        ISchoolUsersWriter writer,
        CancellationToken cancellationToken) =>
        AssignOrUnassignAsync(http, counselorId, accessor, guard, scope, cancellationToken, async (context, schoolId, ids) =>
        {
            var result = await writer.UnassignStudentsAsync(context, schoolId, counselorId, ids, cancellationToken);
            return result.Error is not null
                ? Results.Json(new { success = false, message = result.Error }, statusCode: StatusCodes.Status400BadRequest)
                // Legacy result IS { success: true } → wrapped as { success: true, data: { success: true } }.
                : Results.Ok(new { success = true, data = new { success = true } });
        });

    // Shared route body for POST + DELETE: identical guards (school:users; no-school 400; studentIds[] array check;
    // normalize error 400), then the method-specific write. The write endpoints route by PATH not method.
    private static async Task<IResult> AssignOrUnassignAsync(
        HttpContext http,
        string counselorId,
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ISchoolAdminScopeResolver scope,
        CancellationToken cancellationToken,
        Func<RequestContext, string, IReadOnlyList<string>, Task<IResult>> write)
    {
        var (context, schoolId, error) = await AuthorizeWithScopeAsync(accessor, guard, scope, cancellationToken);
        if (error is not null)
        {
            return error;
        }

        if (string.IsNullOrEmpty(schoolId))
        {
            return Results.Json(new { success = false, message = "No school" }, statusCode: StatusCodes.Status400BadRequest);
        }

        // const { studentIds } = req.body; if (!Array.isArray(studentIds)) → 400. A malformed body, a non-object
        // root, an absent studentIds, or a non-array studentIds ALL collapse to "studentIds[] required" (legacy: a
        // body-parser 400 or the route's own 400 — either way a 400; we use the route's shape/message uniformly).
        var body = await ReadBodyAsync(http, cancellationToken);
        if (body is null
            || body.Value.ValueKind != JsonValueKind.Object
            || !body.Value.TryGetProperty("studentIds", out var studentIdsElement)
            || studentIdsElement.ValueKind != JsonValueKind.Array)
        {
            return Results.Json(new { success = false, message = "studentIds[] required" }, statusCode: StatusCodes.Status400BadRequest);
        }

        var normalization = StudentIdNormalizer.Normalize(studentIdsElement.EnumerateArray().ToList());
        if (normalization.Error is not null)
        {
            return Results.Json(new { success = false, message = normalization.Error }, statusCode: StatusCodes.Status400BadRequest);
        }

        return await write(context, schoolId, normalization.Ids);
    }

    // ---------------------------------------------------------------- GET /counselors/{counselorId}/students

    private static async Task<IResult> GetCounselorStudentsAsync(
        string counselorId,
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ISchoolAdminScopeResolver scope,
        ISchoolUsersReader reader,
        string? page,
        string? limit,
        CancellationToken cancellationToken)
    {
        var (context, schoolId, error) = await AuthorizeWithScopeAsync(accessor, guard, scope, cancellationToken);
        if (error is not null)
        {
            return error;
        }

        // No-school → { data: [], total: 0 } (NO page/limit) — matches school.ts:115.
        if (string.IsNullOrEmpty(schoolId))
        {
            return Results.Ok(new { success = true, data = new { data = Array.Empty<object>(), total = 0 } });
        }

        var (resolvedPage, resolvedLimit, skip) = ResolvePagination(page, limit);
        var result = await reader.GetCounselorStudentsAsync(context, schoolId, counselorId, resolvedPage, resolvedLimit, skip, cancellationToken);
        if (result.Error is not null)
        {
            return Results.Json(new { success = false, message = result.Error }, statusCode: StatusCodes.Status403Forbidden);
        }

        return Results.Ok(new
        {
            success = true,
            data = new
            {
                data = result.Data.Select(StudentJson),
                total = result.Total,
                page = result.Page,
                limit = result.Limit,
                totalPages = result.TotalPages
            }
        });
    }

    // ---------------------------------------------------------------- JSON shapes

    // Legacy spread order: the selected columns, then the two added fields (status, joinedAt). joinedAt = createdDate
    // (the SAME ISO-Z string). gradeLevel is number|null.
    private static object UserJson(SchoolUserRow u) => new
    {
        id = u.Id,
        name = u.Name,
        email = u.Email,
        roleName = u.RoleName,
        gradeLevel = u.GradeLevel,
        isActive = u.IsActive,
        createdDate = u.CreatedDate,
        status = u.IsActive ? "active" : "inactive",
        joinedAt = u.CreatedDate
    };

    private static object StudentJson(CounselorStudentRow s) => new
    {
        id = s.Id,
        name = s.Name,
        email = s.Email,
        gradeLevel = s.GradeLevel,
        createdDate = s.CreatedDate
    };

    // ---------------------------------------------------------------- pagination

    // page = max(1, JsParseInt(page)||1); limit = min(50, max(1, JsParseInt(limit)||20)). NaN AND 0 fall through to
    // the default (JS `||`). Caps at 50 (NOT the shared PcaExamPagination.Resolve cap of 100), so resolve inline —
    // identical to SchoolReadsEndpoints /notes.
    private static (int Page, int Limit, long Skip) ResolvePagination(string? page, string? limit)
    {
        var parsedPage = PcaExamPagination.JsParseInt(page);
        var resolvedPage = Math.Max(1, parsedPage is null or 0 ? 1 : parsedPage.Value);
        var parsedLimit = PcaExamPagination.JsParseInt(limit);
        var resolvedLimit = Math.Min(50, Math.Max(1, parsedLimit is null or 0 ? 20 : parsedLimit.Value));
        return (resolvedPage, resolvedLimit, (long)(resolvedPage - 1) * resolvedLimit);
    }

    // ---------------------------------------------------------------- body reader + guards

    private static readonly JsonElement EmptyObject = JsonDocument.Parse("{}").RootElement.Clone();

    // EmptyObject for an empty/whitespace body (express.json() yields {}); null when present-but-malformed JSON.
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
            return document.RootElement.Clone();
        }
        catch (JsonException)
        {
            return null;
        }
    }

    // Identity (401) + school:users permission (403) only — no scope resolution (used by grade-level).
    private static (RequestContext Context, IResult? Error) AuthorizeIdentityAndPermission(
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

        if (!context.Permissions.Contains(FormMapsPermissions.SchoolUsers))
        {
            return (context, Results.Json(
                new { success = false, code = "missing_permission", message = "Insufficient permissions" },
                statusCode: StatusCodes.Status403Forbidden));
        }

        return (context, null);
    }

    // Identity (401) + school:users (403) + resolve the caller's own schoolId. The resolved schoolId MAY be
    // null/empty — that is NOT an error here; each handler renders its own no-school behavior (200 empty / 400).
    private static async Task<(RequestContext Context, string? SchoolId, IResult? Error)> AuthorizeWithScopeAsync(
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ISchoolAdminScopeResolver scope,
        CancellationToken cancellationToken)
    {
        var (context, error) = AuthorizeIdentityAndPermission(accessor, guard);
        if (error is not null)
        {
            return (context, null, error);
        }

        var schoolId = await scope.ResolveSchoolIdAsync(context, cancellationToken);
        return (context, schoolId, null);
    }
}
