using System.Text.Json;
using FormMaps.Application.Auth;
using FormMaps.Application.Graduation;
using FormMaps.Application.SchoolAdmin;
using FormMaps.Domain.Auth;

namespace FormMaps.Api.Endpoints;

/// <summary>
/// The GRADUATION half of legacy routes/school-grades.ts (index.ts:346, mounted /api/v1/school-admin) — six
/// routes, all under FORMMAPS_ROUTE_GRADUATION_TO_DOTNET (issue #55).
///
/// SCOPE, precisely: the calendar half of that same legacy file (12 routes, /calendar/*) is ALREADY .NET under
/// FORMMAPS_ROUTE_SCHOOL_ADMIN_CALENDAR_TO_DOTNET and is not touched here; the grade-import half
/// (/grades/import*) stays in Node. Every path below is under the /graduation/ segment, which is disjoint from
/// both — the rewrite entries must be equally specific so this flag cannot shadow the calendar's.
///
/// Guard chain, same as CalendarEndpoints but a DIFFERENT permission: RequireIdentity -> permission
/// <c>graduation:manage</c> (403) -> resolve the caller's schoolId via getSchoolUser (400 "No school").
/// graduation:manage is held by SuperAdmin + SchoolAdmin only (RolePermissions.cs), same set as calendar:manage.
/// Envelope is SINGLE-wrapped <c>{ success, data }</c> throughout — note this differs from the calendar half's
/// double wrap, and is what legacy does on these six.
///
/// PARITY NOTE (same ratified divergence as FM-DOTNET-048 on this router): up-front body validation returns 400
/// for a missing or wrong-typed structurally-required field where legacy hands it to Prisma and 500s. The PUT is
/// deliberately NOT tightened the same way — legacy normalizes almost everything there (missing name -> "",
/// missing type -> "custom", Number(x) || 0), so those defaults are reproduced rather than rejected.
/// </summary>
public static class GraduationRulesEndpoints
{
    public static IEndpointRouteBuilder MapGraduationRulesEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/school-admin/graduation").WithTags("Graduation");

        group.MapGet("/rules", GetRulesAsync);
        group.MapPost("/rules", PostRulesAsync);
        group.MapPut("/rules/{ruleSetId}", PutRulesAsync);
        group.MapGet("/progress", GetProgressListAsync);
        group.MapGet("/progress/{studentId}", GetStudentProgressAsync);
        group.MapGet("/gap-analysis/{studentId}", GetGapAnalysisAsync);

        return app;
    }

    // ---------------------------------------------------------------- rules

    // school-grades.ts:166-173. `data` is null (200) when the school has no current year or no active rule set.
    private static async Task<IResult> GetRulesAsync(
        HttpContext http, IRequestContextAccessor accessor, IProtectedRequestGuard guard,
        ISchoolAdminScopeResolver scope, IGraduationRulesReader reader, CancellationToken cancellationToken)
    {
        var (context, schoolId, error) = await AuthorizeAsync(accessor, guard, scope, cancellationToken);
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

        var ruleSet = await reader.GetRulesAsync(context, schoolId!, academicYearId, cancellationToken);
        return Results.Ok(new { success = true, data = ruleSet is null ? null : RuleSetJson(ruleSet) });
    }

    // school-grades.ts:175-182. 201 with only the id.
    private static async Task<IResult> PostRulesAsync(
        HttpContext http, IRequestContextAccessor accessor, IProtectedRequestGuard guard,
        ISchoolAdminScopeResolver scope, IGraduationRulesWriter writer, CancellationToken cancellationToken)
    {
        var (context, schoolId, error) = await AuthorizeAsync(accessor, guard, scope, cancellationToken);
        if (error is not null)
        {
            return error;
        }

        var body = await ReadBodyAsync(http, cancellationToken);
        if (body is null)
        {
            return BadRequest("Invalid request body");
        }

        if (!GraduationRulesBody.TryParseCreate(body.Value, out var input, out var message))
        {
            return BadRequest(message);
        }

        var id = await writer.CreateRulesAsync(context, schoolId!, input, cancellationToken);
        return Results.Json(new { success = true, data = new { id } }, statusCode: StatusCodes.Status201Created);
    }

    // school-grades.ts:184-193.
    private static async Task<IResult> PutRulesAsync(
        string ruleSetId, HttpContext http, IRequestContextAccessor accessor, IProtectedRequestGuard guard,
        ISchoolAdminScopeResolver scope, IGraduationRulesWriter writer, CancellationToken cancellationToken)
    {
        var (context, schoolId, error) = await AuthorizeAsync(accessor, guard, scope, cancellationToken);
        if (error is not null)
        {
            return error;
        }

        var body = await ReadBodyAsync(http, cancellationToken);
        if (body is null)
        {
            return BadRequest("Invalid request body");
        }

        if (!GraduationRulesBody.TryParseUpdate(body.Value, out var input, out var message))
        {
            return BadRequest(message);
        }

        var updated = await writer.UpdateRulesAsync(
            context, schoolId!, context.Actor!.UserId, ruleSetId, input, cancellationToken);

        return updated
            ? Results.Ok(new { success = true, data = new { id = ruleSetId } })
            : NotFound("Rule set not found");
    }

    // ---------------------------------------------------------------- progress

    // school-grades.ts:195-204.
    private static async Task<IResult> GetProgressListAsync(
        HttpContext http, IRequestContextAccessor accessor, IProtectedRequestGuard guard,
        ISchoolAdminScopeResolver scope, IGraduationRulesReader reader, CancellationToken cancellationToken)
    {
        var (context, schoolId, error) = await AuthorizeAsync(accessor, guard, scope, cancellationToken);
        if (error is not null)
        {
            return error;
        }

        // Math.max(1, parseInt(qs(page)) || 1) / Math.min(100, Math.max(1, parseInt(qs(limit)) || 20)).
        // Note the `||`: parseInt("0") is 0, which is FALSY, so limit=0 becomes 20 rather than being clamped to 1.
        var page = Math.Max(1, JsParseIntOr(Query(http, "page"), 1));
        var limit = Math.Min(100, Math.Max(1, JsParseIntOr(Query(http, "limit"), 20)));

        var result = await reader.GetProgressListAsync(
            context, schoolId!, page, limit, Query(http, "status"), Query(http, "sortBy"), cancellationToken);

        return Results.Ok(new
        {
            success = true,
            data = new
            {
                data = result.Data.Select(r => new
                {
                    studentId = r.StudentId,
                    studentName = r.StudentName,
                    gradeLevel = r.GradeLevel,
                    creditsCompleted = r.CreditsCompleted,
                    creditsRequired = r.CreditsRequired,
                    progressPercent = r.ProgressPercent,
                    status = r.Status
                }).ToList(),
                total = result.Total,
                page = result.Page,
                limit = result.Limit,
                totalPages = result.TotalPages
            }
        });
    }

    // school-grades.ts:206-214. THREE shapes: 404, the two-key { studentId, message }, and the full rollup.
    private static async Task<IResult> GetStudentProgressAsync(
        string studentId, IRequestContextAccessor accessor, IProtectedRequestGuard guard,
        ISchoolAdminScopeResolver scope, IGraduationRulesReader reader, CancellationToken cancellationToken)
    {
        var (context, schoolId, error) = await AuthorizeAsync(accessor, guard, scope, cancellationToken);
        if (error is not null)
        {
            return error;
        }

        var result = await reader.GetStudentProgressAsync(context, schoolId!, studentId, cancellationToken);

        return result.Outcome switch
        {
            GraduationProgressOutcome.NotFound => NotFound("Student not found"),
            GraduationProgressOutcome.Message =>
                Results.Ok(new { success = true, data = new { studentId = result.StudentId, message = result.Message } }),
            _ => Results.Ok(new
            {
                success = true,
                data = new
                {
                    studentId = result.StudentId,
                    studentName = result.StudentName,
                    ruleSetId = result.RuleSetId,
                    totalCreditsEarned = result.TotalCreditsEarned,
                    totalCreditsRequired = result.TotalCreditsRequired,
                    overallProgress = result.OverallProgress,
                    onTrack = result.OnTrack,
                    categoryProgress = result.CategoryProgress.Select(c => new
                    {
                        category = c.Category,
                        earned = c.Earned,
                        required = c.Required,
                        progress = c.Progress,
                        met = c.Met
                    }).ToList(),
                    specialRequirementProgress = result.SpecialRequirementProgress.Select(s => new
                    {
                        id = s.Id,
                        name = s.Name,
                        type = s.Type,
                        required = s.Required,
                        unit = s.Unit,
                        completed = s.Completed,
                        note = s.Note
                    }).ToList()
                }
            }),
        };
    }

    // school-grades.ts:216-224. The no-year / no-rules branch emits ONLY { studentId, gaps, recommendations } —
    // no studentName, no ruleSetId, no summary. That is a different object, not the Ok shape with nulls.
    private static async Task<IResult> GetGapAnalysisAsync(
        string studentId, IRequestContextAccessor accessor, IProtectedRequestGuard guard,
        ISchoolAdminScopeResolver scope, IGraduationRulesReader reader, CancellationToken cancellationToken)
    {
        var (context, schoolId, error) = await AuthorizeAsync(accessor, guard, scope, cancellationToken);
        if (error is not null)
        {
            return error;
        }

        var result = await reader.GetGapAnalysisAsync(context, schoolId!, studentId, cancellationToken);

        return result.Outcome switch
        {
            GapAnalysisOutcome.NotFound => NotFound("Student not found"),
            GapAnalysisOutcome.Empty => Results.Ok(new
            {
                success = true,
                data = new { studentId = result.StudentId, gaps = Array.Empty<object>(), recommendations = Array.Empty<object>() }
            }),
            _ => Results.Ok(new
            {
                success = true,
                data = new
                {
                    studentId = result.StudentId,
                    studentName = result.StudentName,
                    ruleSetId = result.RuleSetId,
                    gaps = result.Gaps.Select(g => new
                    {
                        category = g.Category,
                        earned = g.Earned,
                        required = g.Required,
                        needed = g.Needed,
                        severity = g.Severity
                    }).ToList(),
                    recommendations = result.Recommendations.Select(r => new
                    {
                        category = r.Category,
                        needed = r.Needed,
                        suggestedCourses = r.SuggestedCourses.Select(c => new
                        {
                            id = c.Id,
                            code = c.Code,
                            name = c.Name,
                            credits = c.Credits,
                            department = c.Department
                        }).ToList()
                    }).ToList(),
                    summary = result.Summary
                }
            }),
        };
    }

    // ---------------------------------------------------------------- projections

    // Full Prisma passthrough. Every Decimal (totalCreditsRequired, minCredits, value) is a STRING — legacy never
    // coerces them on this route, so they reach the client as decimal.js strings. DIVERGENCE NOT MADE: coercing
    // them to numbers would be the obvious tidy-up and would change the wire type on flip.
    private static object RuleSetJson(GraduationRuleSetRow r) => new
    {
        id = r.Id,
        schoolId = r.SchoolId,
        academicYearId = r.AcademicYearId,
        totalCreditsRequired = r.TotalCreditsRequired,
        isActive = r.IsActive,
        createdBy = r.CreatedBy,
        createdDate = r.CreatedDate,
        updatedBy = r.UpdatedBy,
        updatedAt = r.UpdatedAt,
        categoryRequirements = r.CategoryRequirements.Select(c => new
        {
            id = c.Id,
            ruleSetId = c.RuleSetId,
            category = c.Category,
            minCredits = c.MinCredits,
            requiredCourses = c.RequiredCourses,
            electivesAllowed = c.ElectivesAllowed,
            sortOrder = c.SortOrder,
            isActive = c.IsActive,
            createdBy = c.CreatedBy,
            createdDate = c.CreatedDate,
            updatedBy = c.UpdatedBy,
            updatedAt = c.UpdatedAt
        }).ToList(),
        specialRequirements = r.SpecialRequirements.Select(s => new
        {
            id = s.Id,
            ruleSetId = s.RuleSetId,
            name = s.Name,
            type = s.Type,
            value = s.Value,
            unit = s.Unit,
            description = s.Description,
            isActive = s.IsActive,
            createdBy = s.CreatedBy,
            createdDate = s.CreatedDate,
            updatedBy = s.UpdatedBy,
            updatedAt = s.UpdatedAt
        }).ToList()
    };

    // ---------------------------------------------------------------- guard + plumbing

    private static async Task<(RequestContext Context, string? SchoolId, IResult? Error)> AuthorizeAsync(
        IRequestContextAccessor accessor, IProtectedRequestGuard guard, ISchoolAdminScopeResolver scope,
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

        if (!context.Permissions.Contains(FormMapsPermissions.GraduationManage))
        {
            return (context, null, Results.Json(
                new { success = false, code = "missing_permission", message = "Insufficient permissions" },
                statusCode: StatusCodes.Status403Forbidden));
        }

        var schoolId = await scope.ResolveSchoolIdAsync(context, cancellationToken);
        if (string.IsNullOrEmpty(schoolId))
        {
            return (context, null, Results.Json(
                new { success = false, message = "No school" },
                statusCode: StatusCodes.Status400BadRequest));
        }

        return (context, schoolId, null);
    }

    private static string? Query(HttpContext http, string name)
    {
        var value = http.Request.Query[name].FirstOrDefault();
        return string.IsNullOrEmpty(value) ? null : value;
    }

    /// <summary>
    /// <c>parseInt(qs(x)) || fallback</c>. JS parseInt takes the leading integer of the string and ignores the
    /// rest ("3abc" -> 3, "3.7" -> 3, "abc" -> NaN, "" -> NaN); NaN AND 0 are both falsy, so either takes the
    /// fallback. Leading whitespace and a sign are allowed.
    /// </summary>
    internal static int JsParseIntOr(string? raw, int fallback)
    {
        if (string.IsNullOrEmpty(raw))
        {
            return fallback;
        }

        var span = raw.AsSpan().TrimStart();
        var index = 0;
        if (index < span.Length && (span[index] == '+' || span[index] == '-'))
        {
            index++;
        }

        var start = index;
        while (index < span.Length && char.IsAsciiDigit(span[index]))
        {
            index++;
        }

        if (index == start || !int.TryParse(span[..index], out var value))
        {
            return fallback;
        }

        return value == 0 ? fallback : value;
    }

    private static IResult BadRequest(string message) =>
        Results.Json(new { success = false, message }, statusCode: StatusCodes.Status400BadRequest);

    private static IResult NotFound(string message) =>
        Results.Json(new { success = false, message }, statusCode: StatusCodes.Status404NotFound);

    private static readonly JsonElement EmptyObject = JsonDocument.Parse("{}").RootElement.Clone();

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
}
