using FormMaps.Application.Assessments;
using FormMaps.Application.Auth;
using FormMaps.Application.SchoolAdmin;
using FormMaps.Domain.Auth;

namespace FormMaps.Api.Endpoints;

/// <summary>
/// School-admin assessment reads (legacy /api/v1/school-admin, routes/school-assessments.ts) — sub-slice 1:
/// the six straightforward school-scoped reads. Every endpoint: RequireIdentity -> requirePermission
/// "school:manage" (403) -> resolve the caller's schoolId via getSchoolUser (400 "No school" when absent).
/// The rich /results/{studentId} report, /results/export (CSV), and /assessments/pipeline are deferred to a
/// follow-up; /assessments/insights (Bedrock) stays polyglot (never ported).
/// </summary>
public static class SchoolAdminEndpoints
{
    private const int MaxIdLength = 100;

    public static IEndpointRouteBuilder MapSchoolAdminEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/school-admin").WithTags("SchoolAdmin");

        group.MapGet("/evaluations/overview", GetEvaluationsOverviewAsync);
        group.MapGet("/results", GetResultsAsync);
        // Literal /results/export and the more-specific /results/{studentId}/pca-status both outrank the
        // /results/{studentId} param route in ASP.NET route precedence (registration order is irrelevant).
        group.MapGet("/results/export", GetResultsExportAsync);
        group.MapGet("/results/{studentId}/pca-status", GetStudentPcaStatusAsync);
        group.MapGet("/results/{studentId}", GetStudentReportAsync);
        group.MapGet("/assessments/config", GetConfigAsync);
        group.MapGet("/assessments/status", GetStatusAsync);
        group.MapGet("/assessments/schedule", GetScheduleAsync);
        group.MapGet("/assessments/pipeline", GetPipelineAsync);

        return app;
    }

    private static async Task<IResult> GetEvaluationsOverviewAsync(
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ISchoolAdminScopeResolver scope,
        ISchoolAdminReader reader,
        CancellationToken cancellationToken)
    {
        var (context, schoolId, error) = await AuthorizeAsync(accessor, guard, scope, cancellationToken);
        if (error is not null)
        {
            return error;
        }

        var rows = await reader.GetEvaluationsOverviewAsync(context, schoolId!, cancellationToken);
        return Results.Ok(new
        {
            success = true,
            data = rows.Select(r => new
            {
                studentId = r.StudentId,
                totalEvaluators = r.TotalEvaluators,
                completedEvaluators = r.CompletedEvaluators,
                selfCompleted = r.SelfCompleted
            })
        });
    }

    private static async Task<IResult> GetResultsAsync(
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ISchoolAdminScopeResolver scope,
        ISchoolAdminReader reader,
        string? page,
        string? limit,
        string? search,
        string? gradeLevel,
        CancellationToken cancellationToken)
    {
        var (context, schoolId, error) = await AuthorizeAsync(accessor, guard, scope, cancellationToken);
        if (error is not null)
        {
            return error;
        }

        var pagination = PcaExamPagination.Resolve(page, limit, defaultLimit: 20);
        // req.query.search ? qs(search) : undefined  (empty string is JS-falsy -> undefined).
        var resolvedSearch = string.IsNullOrEmpty(search) ? null : search;
        // req.query.gradeLevel ? parseInt(...) : undefined, then service `if (opts.gradeLevel)` drops NaN/0.
        int? resolvedGrade = null;
        if (!string.IsNullOrEmpty(gradeLevel))
        {
            var parsed = PcaExamPagination.JsParseInt(gradeLevel);
            if (parsed is not null and not 0)
            {
                resolvedGrade = parsed;
            }
        }

        var query = new ResultsListQuery(pagination.Page, pagination.Limit, pagination.Skip, resolvedSearch, resolvedGrade);
        var result = await reader.GetResultsListAsync(context, schoolId!, query, cancellationToken);

        return Results.Ok(new
        {
            success = true,
            data = new
            {
                data = result.Data.Select(r => new
                {
                    studentId = r.StudentId,
                    name = r.Name,
                    email = r.Email,
                    gradeLevel = r.GradeLevel,
                    completedAssessments = r.CompletedAssessments,
                    averageScore = r.AverageScore,
                    pcaStatus = r.PcaStatus
                }),
                total = result.Total,
                page = result.Page,
                limit = result.Limit,
                totalPages = result.TotalPages
            }
        });
    }

    private static async Task<IResult> GetStudentPcaStatusAsync(
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ISchoolAdminScopeResolver scope,
        ISchoolAdminReader reader,
        string studentId,
        CancellationToken cancellationToken)
    {
        var (context, schoolId, error) = await AuthorizeAsync(accessor, guard, scope, cancellationToken);
        if (error is not null)
        {
            return error;
        }

        var bounded = studentId.Length > MaxIdLength ? studentId[..MaxIdLength] : studentId;
        var status = await reader.GetStudentPcaCompletionAsync(context, schoolId!, bounded, cancellationToken);
        if (status is null)
        {
            return StudentNotFound();
        }

        return Results.Ok(new { success = true, data = new { completed = status.Completed } });
    }

    private static async Task<IResult> GetConfigAsync(
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ISchoolAdminScopeResolver scope,
        ISchoolAdminReader reader,
        CancellationToken cancellationToken)
    {
        var (context, schoolId, error) = await AuthorizeAsync(accessor, guard, scope, cancellationToken);
        if (error is not null)
        {
            return error;
        }

        var config = await reader.GetAssessmentConfigAsync(context, schoolId!, cancellationToken);

        // Deliberate DOUBLE-wrap ({ data: { data } }) — legacy config route wraps the payload once more.
        return Results.Ok(new
        {
            success = true,
            data = new
            {
                data = new
                {
                    assessmentWindowStart = config.AssessmentWindowStart,
                    assessmentWindowEnd = config.AssessmentWindowEnd,
                    retakePolicy = config.RetakePolicy,
                    allowSelfSchedule = config.AllowSelfSchedule,
                    reminderDaysBefore = config.ReminderDaysBefore,
                    aiWeights = config.AiWeights
                }
            }
        });
    }

    private static async Task<IResult> GetStatusAsync(
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ISchoolAdminScopeResolver scope,
        ISchoolAdminReader reader,
        CancellationToken cancellationToken)
    {
        var (context, schoolId, error) = await AuthorizeAsync(accessor, guard, scope, cancellationToken);
        if (error is not null)
        {
            return error;
        }

        var status = await reader.GetAssessmentStatusAsync(context, schoolId!, cancellationToken);

        // Deliberate SINGLE-wrap (NOT { data: { data } }): a past fix — the double-wrap made the home widget
        // read undefined -> all zeros.
        return Results.Ok(new
        {
            success = true,
            data = new
            {
                totalStudents = status.TotalStudents,
                notStarted = status.NotStarted,
                inProgress = status.InProgress,
                completed = status.Completed,
                completionRate = status.CompletionRate
            }
        });
    }

    private static async Task<IResult> GetScheduleAsync(
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ISchoolAdminScopeResolver scope,
        ISchoolAdminReader reader,
        CancellationToken cancellationToken)
    {
        var (context, schoolId, error) = await AuthorizeAsync(accessor, guard, scope, cancellationToken);
        if (error is not null)
        {
            return error;
        }

        var rows = await reader.GetSchedulesAsync(context, schoolId!, cancellationToken);
        return Results.Ok(new
        {
            success = true,
            data = rows.Select(r => new
            {
                id = r.Id,
                schoolId = r.SchoolId,
                gradeLevel = r.GradeLevel,
                assessmentType = r.AssessmentType,
                startDate = r.StartDate,
                endDate = r.EndDate,
                isActive = r.IsActive,
                createdBy = r.CreatedBy,
                createdDate = r.CreatedDate,
                updatedBy = r.UpdatedBy,
                updatedAt = r.UpdatedAt
            })
        });
    }

    private static async Task<IResult> GetStudentReportAsync(
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ISchoolAdminScopeResolver scope,
        ISchoolAdminReader reader,
        string studentId,
        CancellationToken cancellationToken)
    {
        var (context, schoolId, error) = await AuthorizeAsync(accessor, guard, scope, cancellationToken);
        if (error is not null)
        {
            return error;
        }

        // No length bound here (unlike pca-status): the report lookup key is passed verbatim to the
        // parameterized WHERE id=@id AND schoolId=@school — a too-long non-matching id 404s naturally (faithful
        // to legacy's full-id findUnique), and truncating would risk a real id that is a 100-char prefix of a
        // longer requested value false-matching.
        var report = await reader.GetStudentReportAsync(context, schoolId!, studentId, cancellationToken);
        if (report is null)
        {
            return StudentNotFound();
        }

        return Results.Ok(new
        {
            success = true,
            data = new
            {
                version = report.Version,
                generatedAt = report.GeneratedAt,
                student = new
                {
                    id = report.Student.Id,
                    name = report.Student.Name,
                    email = report.Student.Email,
                    gradeLevel = report.Student.GradeLevel
                },
                completion = new
                {
                    lia = report.Completion.Lia,
                    disc = report.Completion.Disc,
                    eval360 = report.Completion.Eval360,
                    overall = report.Completion.Overall
                },
                pca = new
                {
                    completed = report.Pca.Completed,
                    evaluationCount = report.Pca.EvaluationCount,
                    lastCompletedDate = report.Pca.LastCompletedDate
                },
                mil = new
                {
                    completedCount = report.Mil.CompletedCount,
                    averageScore = report.Mil.AverageScore,
                    sessions = report.Mil.Sessions.Select(s => new
                    {
                        id = s.Id,
                        examName = s.ExamName,
                        status = s.Status,
                        completed = s.Completed,
                        scorePercentage = s.ScorePercentage,
                        startTime = s.StartTime,
                        endTime = s.EndTime
                    })
                },
                evaluation360 = new
                {
                    total = report.Evaluation360.Total,
                    completed = report.Evaluation360.Completed,
                    groups = report.Evaluation360.Groups.Select(g => new
                    {
                        id = g.Id,
                        groupType = g.GroupType,
                        evaluatorName = g.EvaluatorName,
                        isCompleted = g.IsCompleted,
                        completedDate = g.CompletedDate
                    })
                }
            }
        });
    }

    private static async Task<IResult> GetResultsExportAsync(
        HttpContext http,
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ISchoolAdminScopeResolver scope,
        ISchoolAdminReader reader,
        CancellationToken cancellationToken)
    {
        var (context, schoolId, error) = await AuthorizeAsync(accessor, guard, scope, cancellationToken);
        if (error is not null)
        {
            return error;
        }

        var csv = await reader.ExportResultsCsvAsync(context, schoolId!, cancellationToken);
        // Legacy sets Content-Type: text/csv (no charset) + the attachment disposition, then res.send(csv).
        http.Response.ContentType = "text/csv";
        http.Response.Headers.ContentDisposition = "attachment; filename=results-export.csv";
        await http.Response.WriteAsync(csv, cancellationToken);
        return Results.Empty;
    }

    private static async Task<IResult> GetPipelineAsync(
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ISchoolAdminScopeResolver scope,
        ISchoolAdminReader reader,
        string? grade,
        string? status,
        CancellationToken cancellationToken)
    {
        var (context, schoolId, error) = await AuthorizeAsync(accessor, guard, scope, cancellationToken);
        if (error is not null)
        {
            return error;
        }

        // grade = req.query.grade ? parseInt(qs(grade)) : null  (the reader applies JS `if (grade)` truthiness).
        int? resolvedGrade = string.IsNullOrEmpty(grade) ? null : PcaExamPagination.JsParseInt(grade);
        // statusFilter = qs(req.query.status)  (undefined -> "").
        var statusFilter = status ?? string.Empty;

        var rows = await reader.GetAssessmentPipelineAsync(context, schoolId!, resolvedGrade, statusFilter, cancellationToken);
        return Results.Ok(new
        {
            success = true,
            data = rows.Select(r => new
            {
                id = r.Id,
                name = r.Name,
                email = r.Email,
                gradeLevel = r.GradeLevel,
                // Emit the dictionary directly: legacy pca keys are the verbatim EXAM_TYPES names (PascalCase),
                // and Web-default JSON leaves DictionaryKeyPolicy null so keys are NOT camelCased; the reader
                // builds the dict in EXAM_TYPES insertion order, which STJ preserves.
                pca = r.Pca,
                mil = r.Mil,
                eval360 = r.Eval360,
                eval360Detail = new { total = r.Eval360Detail.Total, completed = r.Eval360Detail.Completed }
            })
        });
    }

    /// <summary>
    /// The shared school-admin guard chain: RequireIdentity -> permission "school:manage" (403) -> resolve
    /// the caller's schoolId (400 "No school"). Returns the resolved (context, schoolId) or an error IResult.
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
        if (string.IsNullOrEmpty(schoolId))
        {
            return (context, null, Results.Json(
                new { success = false, message = "No school" },
                statusCode: StatusCodes.Status400BadRequest));
        }

        return (context, schoolId, null);
    }

    private static IResult StudentNotFound() =>
        Results.Json(new { success = false, message = "Student not found" }, statusCode: StatusCodes.Status404NotFound);
}
