using System.Text.Json;
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
        group.MapPut("/assessments/config", PutConfigAsync);
        group.MapGet("/assessments/status", GetStatusAsync);
        group.MapGet("/assessments/schedule", GetScheduleAsync);
        group.MapPut("/assessments/schedule", PutScheduleAsync);
        group.MapGet("/assessments/pipeline", GetPipelineAsync);
        group.MapPost("/assessments/send-reminders", PostSendRemindersAsync);
        group.MapPost("/assessments/setup-360", PostSetup360Async);

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

    private static async Task<IResult> PutConfigAsync(
        HttpContext http,
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ISchoolAdminScopeResolver scope,
        ISchoolAdminWriter writer,
        CancellationToken cancellationToken)
    {
        var (context, schoolId, error) = await AuthorizeAsync(accessor, guard, scope, cancellationToken);
        if (error is not null)
        {
            return error;
        }

        var body = await ReadBodyAsync(http, cancellationToken);
        if (body is null)
        {
            return Results.Json(new { success = false, message = "Invalid request body" }, statusCode: StatusCodes.Status400BadRequest);
        }

        if (!TryParseConfigPatch(body.Value, out var patch, out var parseError))
        {
            // Architecturally-correct divergence: legacy has no body validation and would pass a wrong-typed
            // value to Prisma -> DB error -> 500. We reject the malformed field up front with a 400.
            return Results.Json(new { success = false, message = parseError }, statusCode: StatusCodes.Status400BadRequest);
        }

        // userId = the authenticated caller (legacy getSchoolUser().userId is the caller's own id).
        var userId = context.Tenant?.UserId ?? string.Empty;
        var config = await writer.UpdateAssessmentConfigAsync(context, schoolId!, userId, patch, cancellationToken);

        // Deliberate DOUBLE-wrap ({ data: { data } }) — matches the GET config route.
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

    private static async Task<IResult> PutScheduleAsync(
        HttpContext http,
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ISchoolAdminScopeResolver scope,
        ISchoolAdminWriter writer,
        CancellationToken cancellationToken)
    {
        var (context, schoolId, error) = await AuthorizeAsync(accessor, guard, scope, cancellationToken);
        if (error is not null)
        {
            return error;
        }

        var body = await ReadBodyAsync(http, cancellationToken);
        if (body is null)
        {
            return Results.Json(new { success = false, message = "Invalid request body" }, statusCode: StatusCodes.Status400BadRequest);
        }

        // Route guard: `schedules` must be an array (legacy `!Array.isArray(schedules)` -> 400).
        if (!body.Value.TryGetProperty("schedules", out var schedulesEl) || schedulesEl.ValueKind != JsonValueKind.Array)
        {
            return Results.Json(new { success = false, message = "schedules array required" }, statusCode: StatusCodes.Status400BadRequest);
        }

        if (!TryParseScheduleItems(schedulesEl, out var items, out var parseError))
        {
            return Results.Json(new { success = false, message = parseError }, statusCode: StatusCodes.Status400BadRequest);
        }

        // req.userId (nullable) is the createdBy/updatedBy actor.
        var userId = context.Tenant?.UserId;
        var rows = await writer.UpsertSchedulesAsync(context, schoolId!, userId, items, cancellationToken);

        // Deliberate SINGLE-wrap (matches the GET schedule route shape).
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

    private static async Task<IResult> PostSendRemindersAsync(
        HttpContext http,
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ISchoolAdminScopeResolver scope,
        ISchoolAdminEmailWriter emailWriter,
        CancellationToken cancellationToken)
    {
        var (context, schoolId, error) = await AuthorizeAsync(accessor, guard, scope, cancellationToken);
        if (error is not null)
        {
            return error;
        }

        var body = await ReadBodyAsync(http, cancellationToken);
        if (body is null)
        {
            return Results.Json(new { success = false, message = "Invalid request body" }, statusCode: StatusCodes.Status400BadRequest);
        }

        // Legacy validation order: studentIds array+non-empty, then assessmentTypes array+non-empty, then >100.
        var studentIds = ReadStringArray(body.Value, "studentIds");
        if (studentIds is null || studentIds.Count == 0)
        {
            return Results.Json(new { success = false, message = "studentIds required" }, statusCode: StatusCodes.Status400BadRequest);
        }

        var assessmentTypes = ReadStringArray(body.Value, "assessmentTypes");
        if (assessmentTypes is null || assessmentTypes.Count == 0)
        {
            return Results.Json(new { success = false, message = "assessmentTypes required" }, statusCode: StatusCodes.Status400BadRequest);
        }

        if (studentIds.Count > 100)
        {
            return Results.Json(new { success = false, message = "Maximum 100 students per batch" }, statusCode: StatusCodes.Status400BadRequest);
        }

        var result = await emailWriter.SendRemindersAsync(context, schoolId!, studentIds, assessmentTypes, cancellationToken);
        if (result is null)
        {
            return Results.Json(new { success = false, message = "School not found" }, statusCode: StatusCodes.Status404NotFound);
        }

        return Results.Ok(new { success = true, data = new { sent = result.Sent, failed = result.Failed, total = result.Total } });
    }

    private static async Task<IResult> PostSetup360Async(
        HttpContext http,
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ISchoolAdminScopeResolver scope,
        ISchoolAdminEmailWriter emailWriter,
        CancellationToken cancellationToken)
    {
        var (context, schoolId, error) = await AuthorizeAsync(accessor, guard, scope, cancellationToken);
        if (error is not null)
        {
            return error;
        }

        var body = await ReadBodyAsync(http, cancellationToken);
        if (body is null)
        {
            return Results.Json(new { success = false, message = "Invalid request body" }, statusCode: StatusCodes.Status400BadRequest);
        }

        // studentIds = body.studentIds || []  (missing/non-array -> empty); gradeLevel = body.gradeLevel (number else null).
        var studentIds = ReadStringArray(body.Value, "studentIds") ?? [];
        int? gradeLevel = body.Value.TryGetProperty("gradeLevel", out var gl)
            && gl.ValueKind == JsonValueKind.Number && gl.TryGetInt32(out var g) ? g : null;

        if (studentIds.Count > 100)
        {
            return Results.Json(new { success = false, message = "Maximum 100 students per batch" }, statusCode: StatusCodes.Status400BadRequest);
        }

        var userId = context.Tenant?.UserId;
        var result = await emailWriter.Setup360Async(context, schoolId!, userId, studentIds, gradeLevel, cancellationToken);
        if (result is null)
        {
            return Results.Json(new { success = false, message = "No students to setup" }, statusCode: StatusCodes.Status400BadRequest);
        }

        return Results.Ok(new
        {
            success = true,
            data = new
            {
                created = result.Created,
                skipped = result.Skipped,
                emailsSent = result.EmailsSent,
                studentsProcessed = result.StudentsProcessed
            }
        });
    }

    // Read a JSON array property as its string elements; null when the property is missing or not an array
    // (legacy `Array.isArray(x)` gate). Non-string elements are skipped (student ids are string uuids).
    private static List<string>? ReadStringArray(JsonElement body, string prop)
    {
        if (!body.TryGetProperty(prop, out var el) || el.ValueKind != JsonValueKind.Array)
        {
            return null;
        }

        var list = new List<string>();
        foreach (var item in el.EnumerateArray())
        {
            if (item.ValueKind == JsonValueKind.String)
            {
                list.Add(item.GetString()!);
            }
        }

        return list;
    }

    // updateAssessmentConfig body is untyped (no zod). PATCH: only provided keys are written; aiWeights only
    // when JS-truthy. Wrong-typed provided fields are rejected 400 (legacy would 500 at the DB — see PutConfig).
    private static bool TryParseConfigPatch(JsonElement body, out AssessmentConfigPatch patch, out string error)
    {
        patch = default!;
        error = string.Empty;
        bool hasWs = false, hasWe = false, hasRp = false, hasAss = false, hasRdb = false, hasAiw = false;
        string? ws = null, we = null, rp = null, aiwJson = null;
        bool ass = false;
        int rdb = 0;

        if (body.ValueKind == JsonValueKind.Object)
        {
            if (body.TryGetProperty("assessmentWindowStart", out var wsEl))
            {
                if (wsEl.ValueKind is not (JsonValueKind.String or JsonValueKind.Null)) { error = "assessmentWindowStart must be a string"; return false; }
                hasWs = true; ws = wsEl.ValueKind == JsonValueKind.String ? wsEl.GetString() : null;
            }

            if (body.TryGetProperty("assessmentWindowEnd", out var weEl))
            {
                if (weEl.ValueKind is not (JsonValueKind.String or JsonValueKind.Null)) { error = "assessmentWindowEnd must be a string"; return false; }
                hasWe = true; we = weEl.ValueKind == JsonValueKind.String ? weEl.GetString() : null;
            }

            if (body.TryGetProperty("retakePolicy", out var rpEl))
            {
                if (rpEl.ValueKind != JsonValueKind.String) { error = "retakePolicy must be a string"; return false; }
                hasRp = true; rp = rpEl.GetString();
            }

            if (body.TryGetProperty("allowSelfSchedule", out var assEl))
            {
                if (assEl.ValueKind is not (JsonValueKind.True or JsonValueKind.False)) { error = "allowSelfSchedule must be a boolean"; return false; }
                hasAss = true; ass = assEl.GetBoolean();
            }

            if (body.TryGetProperty("reminderDaysBefore", out var rdbEl))
            {
                if (rdbEl.ValueKind != JsonValueKind.Number || !rdbEl.TryGetInt32(out rdb)) { error = "reminderDaysBefore must be an integer"; return false; }
                hasRdb = true;
            }

            // `if (body.aiWeights)` — JS truthiness: skip null/false/0/"" ; otherwise store JSON.stringify(value).
            if (body.TryGetProperty("aiWeights", out var aiwEl) && IsTruthy(aiwEl))
            {
                hasAiw = true; aiwJson = JsonSerializer.Serialize(aiwEl);
            }
        }

        patch = new AssessmentConfigPatch(hasWs, ws, hasWe, we, hasRp, rp, hasAss, ass, hasRdb, rdb, hasAiw, aiwJson);
        return true;
    }

    // upsertSchedules: skip any item missing a truthy gradeLevel/assessmentType/startDate/endDate (legacy `!s.x`;
    // gradeLevel 0 is falsy -> skipped). A structurally-complete item with an UNPARSEABLE date -> 400 (legacy
    // `new Date("bad")` -> Invalid Date -> Prisma -> 500; we reject cleanly up front).
    private static bool TryParseScheduleItems(JsonElement schedulesEl, out List<ScheduleUpsertItem> items, out string error)
    {
        items = [];
        error = string.Empty;

        foreach (var el in schedulesEl.EnumerateArray())
        {
            if (el.ValueKind != JsonValueKind.Object) { continue; }

            // gradeLevel: truthy integer (0 / missing / non-number -> skip).
            if (!el.TryGetProperty("gradeLevel", out var gradeEl) || gradeEl.ValueKind != JsonValueKind.Number
                || !gradeEl.TryGetInt32(out var gradeLevel) || gradeLevel == 0)
            {
                continue;
            }

            if (!TryTruthyString(el, "assessmentType", out var type)) { continue; }
            if (!TryTruthyString(el, "startDate", out var startRaw)) { continue; }
            if (!TryTruthyString(el, "endDate", out var endRaw)) { continue; }

            if (!TryParseDate(startRaw, out var start)) { error = "Invalid startDate"; return false; }
            if (!TryParseDate(endRaw, out var end)) { error = "Invalid endDate"; return false; }

            items.Add(new ScheduleUpsertItem(gradeLevel, type, start, end));
        }

        return true;
    }

    private static bool TryTruthyString(JsonElement obj, string name, out string value)
    {
        value = string.Empty;
        if (!obj.TryGetProperty(name, out var el) || el.ValueKind != JsonValueKind.String) { return false; }
        var s = el.GetString();
        if (string.IsNullOrEmpty(s)) { return false; }
        value = s;
        return true;
    }

    // `new Date(s)` semantics: parse as an instant, normalized to UTC wall-clock (Kind=Unspecified for the
    // timestamp(3)-without-tz column). A bare date "2026-03-01" -> 2026-03-01T00:00:00Z, matching JS.
    private static bool TryParseDate(string raw, out DateTime value)
    {
        value = default;
        if (!DateTimeOffset.TryParse(raw, System.Globalization.CultureInfo.InvariantCulture,
                System.Globalization.DateTimeStyles.AssumeUniversal | System.Globalization.DateTimeStyles.AdjustToUniversal, out var dto))
        {
            return false;
        }

        value = DateTime.SpecifyKind(dto.UtcDateTime, DateTimeKind.Unspecified);
        return true;
    }

    // JS truthiness for the aiWeights guard: false for null/false/0/"" ; true otherwise (objects/arrays incl. empty).
    private static bool IsTruthy(JsonElement el) => el.ValueKind switch
    {
        JsonValueKind.Null => false,
        JsonValueKind.False => false,
        JsonValueKind.Undefined => false,
        JsonValueKind.String => !string.IsNullOrEmpty(el.GetString()),
        JsonValueKind.Number => el.TryGetDouble(out var d) && d != 0,
        _ => true
    };

    private static readonly JsonElement EmptyObject = JsonDocument.Parse("{}").RootElement.Clone();

    // Returns EmptyObject for an empty/whitespace body (legacy express.json() yields {} for an empty body), or
    // null when the body is present-but-malformed JSON — the caller then returns 400 (legacy routes malformed
    // JSON to the body-parser error handler BEFORE the route runs, so no write happens; treating it as {} would
    // instead upsert a phantom defaults row). Reads the raw body so empty vs malformed can be distinguished.
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
