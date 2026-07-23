using System.Globalization;
using System.Text.Json;
using FormMaps.Application.Auth;
using FormMaps.Application.SchoolAdmin;
using FormMaps.Application.SchoolStudents;
using FormMaps.Domain.Auth;

namespace FormMaps.Api.Endpoints;

/// <summary>
/// school:manage school-students WRITES (FM-DOTNET-065 — routes/school-students.ts, mounted /api/v1/school-admin).
/// First WRITE sub-slice (non-SES DB writes): DELETE /students/{studentId} (soft delete) + PUT
/// /course-request-deadline (upsert). SHIPPED DARK (co-flips with the reads; GET on the same paths lives in the
/// FM-062/064 read groups — Next matches path-not-method).
///
/// <para>Auth: RequireIdentity (401) → permission school:manage (403) → resolve the caller's own schoolId
/// (no-school → 400 "No school"). DELETE → 404 "Student not found" for a missing/cross-school student. The deadline
/// PUT parses <c>body.deadline || null</c> as a date (invalid string → 500 "Internal server error", reproducing the
/// legacy Invalid-Date→Prisma-throw).</para>
/// </summary>
public static class SchoolStudentsWriteEndpoints
{
    public static IEndpointRouteBuilder MapSchoolStudentsWriteEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/school-admin").WithTags("SchoolStudentsWrite");

        group.MapDelete("/students/{studentId}", DeleteStudentAsync);
        group.MapPut("/course-request-deadline", PutCourseRequestDeadlineAsync);

        return app;
    }

    private static async Task<IResult> DeleteStudentAsync(
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ISchoolAdminScopeResolver scope,
        ISchoolStudentsWriter writer,
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

        var deleted = await writer.DeleteStudentAsync(context, schoolId, studentId, cancellationToken);
        return deleted
            ? Results.Ok(new { success = true, data = new { studentId } })
            : Results.Json(new { success = false, message = "Student not found" }, statusCode: StatusCodes.Status404NotFound);
    }

    private static async Task<IResult> PutCourseRequestDeadlineAsync(
        HttpContext http,
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ISchoolAdminScopeResolver scope,
        ISchoolStudentsWriter writer,
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

        // MALFORMED JSON (not empty): legacy express.json() throws → global handler → 500 "Internal server error",
        // NO write. Distinguish it from an EMPTY body (express treats empty as {} → deadline null → clears). ReadBody
        // returns null ONLY for a malformed payload; an empty/whitespace body returns the empty-object sentinel.
        var body = await ReadBodyAsync(http, cancellationToken);
        if (body is null)
        {
            return Results.Json(new { success = false, message = "Internal server error" }, statusCode: StatusCodes.Status500InternalServerError);
        }

        // Reproduce `req.body.deadline || null` (JS falsy → null) then `deadline ? new Date(deadline) : null`. A
        // JS-falsy value (absent/null/""/0/false) → null; else new Date(value): string parsed, number = epoch ms,
        // true = new Date(1), object/array → Invalid Date → 500 (Prisma throw). Invalid/out-of-range → 500.
        if (!TryResolveDeadline(body, out var deadline))
        {
            return Results.Json(new { success = false, message = "Internal server error" }, statusCode: StatusCodes.Status500InternalServerError);
        }

        var stored = await writer.UpdateCourseRequestDeadlineAsync(context, schoolId, deadline, cancellationToken);
        return Results.Ok(new { success = true, data = new { deadline = stored } });
    }

    // Max |ms| for a valid JS Date (TimeClip = ±8.64e15). Beyond → new Date(n) is Invalid → 500.
    private const long JsMaxTimeMs = 8_640_000_000_000_000L;

    /// <summary>
    /// Resolve body.deadline the way legacy does: <c>req.body.deadline || null</c> then
    /// <c>deadline ? new Date(deadline) : null</c>. Returns false (→ 500) only for a truthy value that produces an
    /// Invalid Date (unparseable string, object/array, or an out-of-range number). Out-param is the UTC instant or
    /// null. NOTE (documented LOW): the string branch uses .NET's parser, whose accept/reject set differs from JS
    /// <c>new Date(string)</c> on pathological non-ISO strings (e.g. "2026" / "12:00"); the frontend only ever sends
    /// an ISO date-picker string, for which the two agree on a UTC prod server.
    /// </summary>
    private static bool TryResolveDeadline(JsonElement? body, out DateTime? deadline)
    {
        deadline = null;
        if (body is not { } b || !b.TryGetProperty("deadline", out var d))
        {
            return true; // absent → null
        }

        switch (d.ValueKind)
        {
            case JsonValueKind.Null:
            case JsonValueKind.False:
                return true; // JS-falsy → null

            case JsonValueKind.String:
                var raw = d.GetString();
                if (string.IsNullOrEmpty(raw))
                {
                    return true; // "" is falsy → null
                }

                if (!DateTimeOffset.TryParse(raw, CultureInfo.InvariantCulture,
                        DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out var parsed))
                {
                    return false; // new Date("garbage") = Invalid → 500
                }

                deadline = parsed.UtcDateTime;
                return true;

            case JsonValueKind.Number:
                // new Date(n): n=0 is falsy (|| null → null); else n ms since epoch (TimeClip range).
                if (!d.TryGetDouble(out var n) || n == 0)
                {
                    return n == 0; // 0 → null (ok); unparseable number → 500
                }

                if (double.IsNaN(n) || Math.Abs(n) > JsMaxTimeMs)
                {
                    return false; // out of range → Invalid → 500
                }

                deadline = DateTimeOffset.FromUnixTimeMilliseconds((long)n).UtcDateTime;
                return true;

            case JsonValueKind.True:
                deadline = DateTimeOffset.FromUnixTimeMilliseconds(1).UtcDateTime; // new Date(true) = new Date(1)
                return true;

            default:
                return false; // object/array → new Date(obj) = Invalid → 500
        }
    }

    private static readonly JsonElement EmptyObject = JsonDocument.Parse("{}").RootElement.Clone();

    // Returns the empty-object sentinel for an empty/whitespace body (express.json → {}); the parsed root for valid
    // JSON; and null ONLY for MALFORMED JSON (express.json throws → the endpoint maps null → 500, no write).
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
                JsonValueKind.Array => EmptyObject, // express accepts arrays; no field access → deadline absent
                _ => null,                          // primitive → express strict rejects → 500
            };
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static IResult NoSchool() =>
        Results.Json(new { success = false, message = "No school" }, statusCode: StatusCodes.Status400BadRequest);

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
