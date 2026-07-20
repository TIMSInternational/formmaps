using System.Text.Json;
using System.Text.Json.Nodes;
using FormMaps.Application.Auth;

namespace FormMaps.Application.Assessments;

/// <summary>Outcome status for a question360 catalog write (legacy routes/question360.ts POST / PUT / activate / deactivate).</summary>
public enum Question360WriteStatus
{
    /// <summary>Row created (POST /) — HTTP 201.</summary>
    Created,

    /// <summary>Row updated (PUT /:id, activate, deactivate) — HTTP 200.</summary>
    Ok,

    /// <summary>Body failed validation — HTTP 400 with the first-error <see cref="Question360WriteOutcome.Message"/>.</summary>
    ValidationError,

    /// <summary>
    /// The id matched no row (UPDATE affected 0). Legacy has NO existence check — Prisma throws P2025 → the route
    /// catch returns 500 "Internal server error" (NOT 404; the catalog has no IDOR/ownership concern). The endpoint
    /// maps this to that same 500. Flagged as a candidate 404-upgrade for review.
    /// </summary>
    Missing,
}

/// <summary>Result of a create/update/activate/deactivate: the full row on success, or the first validation message.</summary>
public sealed record Question360WriteOutcome(Question360WriteStatus Status, Question360Row? Row, string? Message);

/// <summary>Outcome of a soft-delete (legacy DELETE /:id): the child-guard, the missing (→500) branch, or success.</summary>
public enum Question360DeleteStatus
{
    /// <summary>Soft-deleted (isActive=false) — HTTP 200 <c>{ success: true }</c> (no data key).</summary>
    Deleted,

    /// <summary>Refused: the question has active sub-questions — HTTP 400 "Cannot delete: has active sub-questions".</summary>
    ChildGuard,

    /// <summary>id matched no row (UPDATE affected 0) — legacy P2025 → 500 (same as <see cref="Question360WriteStatus.Missing"/>).</summary>
    Missing,
}

/// <summary>Result of POST /bulk-create — always HTTP 200 with the per-item report (no transaction, no rollback).</summary>
public sealed record Question360BulkResult(int CreatedCount, int TotalRequested, IReadOnlyList<JsonObject> Errors);

/// <summary>The validated, present columns of a question360 write body, in schema-declaration order (create materializes the defaults).</summary>
public sealed class Question360WriteFields
{
    public required IReadOnlyList<Question360Column> Columns { get; init; }
}

/// <summary>One column → DB-ready value (a string, int, bool, or <see cref="DBNull"/> for a null parentQuestionId).</summary>
public sealed record Question360Column(string Name, object Value);

/// <summary>Validation result: Ok + parsed fields, or the first Zod-equivalent error message.</summary>
public sealed record Question360ValidationResult(bool Ok, string? Message, Question360WriteFields? Fields)
{
    public static Question360ValidationResult Success(Question360WriteFields fields) => new(true, null, fields);

    public static Question360ValidationResult Failure(string message) => new(false, message, null);
}

/// <summary>
/// Port of the zod <c>questionSchema</c> (create + each bulk-create item) and <c>updateQuestionSchema</c> (PUT /:id,
/// a partial of the same 7 fields with NO defaults) in routes/question360.ts. Returns the FIRST failing field's
/// message in schema-declaration order (== legacy <c>parsed.error.errors[0].message</c>). ⚠️ <c>isActive</c> is
/// DELIBERATELY absent from the update schema (mass-assignment / privilege guard — activation flows only through the
/// dedicated activate/deactivate/delete routes); the update validator never binds it. Field order:
/// questionEnglishText, questionSpanishText, category, relationType, questionNumber, isSubQuestion, parentQuestionId.
/// </summary>
public static class Question360Validation
{
    // create: questionSchema. Every required field present; isSubQuestion default false, parentQuestionId default null.
    public static Question360ValidationResult ValidateCreate(JsonElement body) => Validate(body, isCreate: true);

    // update: updateQuestionSchema = questionSchema.partial() (all optional, NO defaults, NO isActive).
    public static Question360ValidationResult ValidateUpdate(JsonElement body) => Validate(body, isCreate: false);

    private static Question360ValidationResult Validate(JsonElement body, bool isCreate)
    {
        // z.object(...) / z.object(...).partial(): a non-object body is rejected outright.
        if (body.ValueKind != JsonValueKind.Object)
        {
            return Question360ValidationResult.Failure($"Expected object, received {ZodType(body)}");
        }

        var columns = new List<Question360Column>();

        // The four .min(1) strings, in order (english/spanish max 1000; category/relationType max 100).
        foreach (var (name, max) in TextFields)
        {
            if (TryGet(body, name, out var value))
            {
                var error = ValidateString(value, max);
                if (error is not null)
                {
                    return Question360ValidationResult.Failure(error);
                }

                columns.Add(new Question360Column(name, value.GetString()!));
            }
            else if (isCreate)
            {
                return Question360ValidationResult.Failure("Required");
            }
        }

        // questionNumber — z.number().int().positive().
        if (TryGet(body, "questionNumber", out var questionNumber))
        {
            var error = ValidateQuestionNumber(questionNumber, out var parsed);
            if (error is not null)
            {
                return Question360ValidationResult.Failure(error);
            }

            columns.Add(new Question360Column("questionNumber", parsed));
        }
        else if (isCreate)
        {
            return Question360ValidationResult.Failure("Required");
        }

        // isSubQuestion — z.boolean().optional().default(false).
        if (TryGet(body, "isSubQuestion", out var isSubQuestion))
        {
            if (isSubQuestion.ValueKind is not (JsonValueKind.True or JsonValueKind.False))
            {
                return Question360ValidationResult.Failure($"Expected boolean, received {ZodType(isSubQuestion)}");
            }

            columns.Add(new Question360Column("isSubQuestion", isSubQuestion.GetBoolean()));
        }
        else if (isCreate)
        {
            columns.Add(new Question360Column("isSubQuestion", false)); // zod default
        }

        // parentQuestionId — z.string().nullable().optional().default(null).
        if (TryGet(body, "parentQuestionId", out var parentQuestionId))
        {
            if (parentQuestionId.ValueKind == JsonValueKind.Null)
            {
                columns.Add(new Question360Column("parentQuestionId", DBNull.Value));
            }
            else if (parentQuestionId.ValueKind == JsonValueKind.String)
            {
                columns.Add(new Question360Column("parentQuestionId", parentQuestionId.GetString()!));
            }
            else
            {
                return Question360ValidationResult.Failure($"Expected string, received {ZodType(parentQuestionId)}");
            }
        }
        else if (isCreate)
        {
            columns.Add(new Question360Column("parentQuestionId", DBNull.Value)); // zod default null
        }

        return Question360ValidationResult.Success(new Question360WriteFields { Columns = columns });
    }

    // The four required .min(1) text fields with their .max(...) bound, in schema-declaration order.
    private static readonly (string Name, int Max)[] TextFields =
    [
        ("questionEnglishText", 1000),
        ("questionSpanishText", 1000),
        ("category", 100),
        ("relationType", 100),
    ];

    private static string? ValidateString(JsonElement value, int max)
    {
        if (value.ValueKind != JsonValueKind.String)
        {
            return $"Expected string, received {ZodType(value)}";
        }

        var length = value.GetString()!.Length;
        if (length < 1)
        {
            return "String must contain at least 1 character(s)";
        }

        if (length > max)
        {
            return $"String must contain at most {max} character(s)";
        }

        return null;
    }

    // z.number().int().positive(): type, then integer, then > 0 — first failure wins. zod has NO upper bound, so a
    // value beyond Int32 (e.g. 9999999999) still validates; it is carried as a long so the INSERT into the int4
    // column is rejected by Postgres (22003) → 500 (single) / "Failed to create question" (bulk), matching legacy
    // (zod passes, Prisma/Postgres rejects). Never cast to int here — that would silently wrap.
    private static string? ValidateQuestionNumber(JsonElement value, out long parsed)
    {
        parsed = 0;
        if (value.ValueKind != JsonValueKind.Number)
        {
            return $"Expected number, received {ZodType(value)}";
        }

        var d = value.GetDouble();
        if (d != Math.Truncate(d) || double.IsInfinity(d))
        {
            return "Expected integer, received float";
        }

        if (d <= 0)
        {
            return "Number must be greater than 0";
        }

        // Carry as long (int8); an in-range value casts to int4 fine, an out-of-range one triggers 22003 at INSERT.
        parsed = d >= long.MaxValue ? long.MaxValue : (long)d;
        return null;
    }

    private static bool TryGet(JsonElement body, string name, out JsonElement value) =>
        body.TryGetProperty(name, out value);

    private static string ZodType(JsonElement value) => value.ValueKind switch
    {
        JsonValueKind.Object => "object",
        JsonValueKind.Array => "array",
        JsonValueKind.String => "string",
        JsonValueKind.Number => "number",
        JsonValueKind.True or JsonValueKind.False => "boolean",
        JsonValueKind.Null => "null",
        _ => "undefined",
    };
}

/// <summary>
/// Write-owner for the question360 catalog writes (legacy routes/question360.ts POST / PUT /:id / activate /
/// deactivate / DELETE /:id / bulk-create). The table is a GLOBAL reference bank — no tenant scope, no ownership;
/// the only gate is the endpoint's <c>evaluations:manage</c> permission. <c>createdBy</c>/<c>updatedBy</c> are
/// never populated (faithful to legacy). Runs under the caller's writable RLS session.
/// </summary>
public interface IQuestion360Writer
{
    Task<Question360WriteOutcome> CreateAsync(RequestContext context, JsonElement body, CancellationToken cancellationToken = default);

    Task<Question360WriteOutcome> UpdateAsync(RequestContext context, string id, JsonElement body, CancellationToken cancellationToken = default);

    /// <summary>Set isActive = <paramref name="isActive"/> (activate/deactivate). Missing id → 500 (legacy P2025).</summary>
    Task<Question360WriteOutcome> SetActiveAsync(RequestContext context, string id, bool isActive, CancellationToken cancellationToken = default);

    Task<Question360DeleteStatus> DeleteAsync(RequestContext context, string id, CancellationToken cancellationToken = default);

    /// <summary>Bulk create from a JSON array; per-item validation + independent insert (no transaction/rollback).</summary>
    Task<Question360BulkResult> BulkCreateAsync(RequestContext context, JsonElement array, CancellationToken cancellationToken = default);
}
