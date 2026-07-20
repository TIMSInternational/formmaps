using System.Data;
using System.Data.Common;
using System.Globalization;
using System.Text.Json;
using System.Text.Json.Nodes;
using FormMaps.Application.Assessments;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;
using Microsoft.Extensions.Logging;

namespace FormMaps.Infrastructure.Assessments;

/// <summary>
/// The external vocational take rail (legacy routes/vocationalTake.ts + vocationalTakeService.ts /
/// proctoring-service.ts): GET form (read), POST submit (atomic upsert+flip write), POST violations (write).
/// NON-TENANT, FAIL-CLOSED — every session is opened with <see cref="RequestContext.System()"/> (GUC bypass);
/// the token-validated group.id is the ONLY access gate. Reuses the shipped questionnaire read
/// (<see cref="IVocationalReader"/>) and the best-effort score recompute (<see cref="IVocationalWriter"/>).
/// </summary>
public sealed class VocationalTakeService(
    IFormMapsDatabaseSessionFactory databaseSessionFactory,
    IVocationalReader vocationalReader,
    IVocationalWriter vocationalWriter,
    ILogger<VocationalTakeService> logger) : IVocationalTakeService
{
    public async Task<VocationalFormResult> GetFormAsync(string token, CancellationToken cancellationToken = default)
    {
        var system = RequestContext.System();
        GroupRow? group;
        string? studentName;
        await using (var session = await databaseSessionFactory.OpenReadOnlyAsync(system, cancellationToken))
        {
            group = await ResolveByTokenAsync(session, token, requireUnexpired: false, cancellationToken);
            if (group is null || group.Instrument != "vocational")
            {
                return new VocationalFormResult(VocationalFormStatus.NotFound);
            }

            if (group.TokenExpiryDate < DateTime.UtcNow)
            {
                return new VocationalFormResult(VocationalFormStatus.Expired);
            }

            if (group.IsEvaluationCompleted)
            {
                return new VocationalFormResult(VocationalFormStatus.Completed, EvaluatorName: group.EvaluatorName);
            }

            var completedGroup = Evaluation360Scoring.NormalizeGroupType(group.GroupType);
            if (completedGroup == "other")
            {
                return new VocationalFormResult(VocationalFormStatus.InvalidGroup);
            }

            studentName = await LoadUserNameAsync(session, group.EvaluatedUserId, cancellationToken);
        }

        var g = Evaluation360Scoring.NormalizeGroupType(group.GroupType);
        var questions = await vocationalReader.GetQuestionnaireAsync(system, g, cancellationToken);
        return new VocationalFormResult(
            VocationalFormStatus.Ok,
            Group: g,
            InstrumentVersion: group.InstrumentVersion,
            EvaluatorName: group.EvaluatorName,
            StudentName: studentName,
            Questions: questions);
    }

    public async Task<VocationalSubmitResult> SubmitAsync(
        string token, IReadOnlyList<VocationalAnswerInput> answers, CancellationToken cancellationToken = default)
    {
        var system = RequestContext.System();

        // Guard + questionnaire load (read). Resolve, gate order: not-found → expired → already-completed →
        // invalid-group. Then per-answer semantic validation + require-all, BEFORE any write.
        GroupRow group;
        IReadOnlyList<QuestionnaireItem> questions;
        await using (var readSession = await databaseSessionFactory.OpenReadOnlyAsync(system, cancellationToken))
        {
            var resolved = await ResolveByTokenAsync(readSession, token, requireUnexpired: false, cancellationToken);
            if (resolved is null || resolved.Instrument != "vocational")
            {
                return new VocationalSubmitResult(VocationalSubmitStatus.NotFound);
            }

            if (resolved.TokenExpiryDate < DateTime.UtcNow)
            {
                return new VocationalSubmitResult(VocationalSubmitStatus.Expired);
            }

            if (resolved.IsEvaluationCompleted)
            {
                return new VocationalSubmitResult(VocationalSubmitStatus.AlreadyCompleted);
            }

            if (Evaluation360Scoring.NormalizeGroupType(resolved.GroupType) == "other")
            {
                return new VocationalSubmitResult(VocationalSubmitStatus.InvalidGroup);
            }

            group = resolved;
            var g = Evaluation360Scoring.NormalizeGroupType(group.GroupType);
            questions = await vocationalReader.GetQuestionnaireAsync(system, g, cancellationToken);
        }

        // last-wins on a duplicate question number (legacy `new Map(questions.map(q => [q.number, q]))`).
        // vocational_questions.number has NO unique constraint (schema.prisma) → duplicates are schema-permitted,
        // so ToDictionary (throw-on-dup) would be a reachable 500 on this anonymous write path.
        var byNum = new Dictionary<int, QuestionnaireItem>();
        foreach (var q in questions)
        {
            byNum[q.Number] = q;
        }

        foreach (var answer in answers)
        {
            if (!byNum.TryGetValue(answer.QuestionNumber, out var question) || question.Type != answer.Type)
            {
                return new VocationalSubmitResult(VocationalSubmitStatus.BadAnswer);
            }

            if (!AnswerMatchesOptions(answer, question))
            {
                return new VocationalSubmitResult(VocationalSubmitStatus.BadAnswer);
            }
        }

        // require-all: every question answered exactly once (all answers reference valid questions above, so a
        // distinct questionNumber count == question count iff the set is complete).
        if (answers.Select(a => a.QuestionNumber).Distinct().Count() != questions.Count)
        {
            return new VocationalSubmitResult(VocationalSubmitStatus.Incomplete);
        }

        var groupKey = Evaluation360Scoring.NormalizeGroupType(group.GroupType);
        var instrumentVersion = group.InstrumentVersion ?? string.Empty;

        // ONE transaction: all upserts + the completion flip are atomic (legacy $transaction).
        await using (var writeSession = await databaseSessionFactory.OpenWritableAsync(system, cancellationToken))
        {
            foreach (var answer in answers)
            {
                var dimensionKey = byNum[answer.QuestionNumber].DimensionKey;
                await UpsertResponseAsync(writeSession, group.Id, groupKey, instrumentVersion, answer, dimensionKey, cancellationToken);
            }

            await FlipGroupCompletedAsync(writeSession, group.Id, cancellationToken);
            await writeSession.CommitAsync(cancellationToken);
        }

        // Best-effort recompute (reuses the shipped writer). NEVER fails a successful submission.
        try
        {
            await vocationalWriter.RecomputeScoreAsync(system, group.EvaluatedUserId, cancellationToken);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Vocational auto-recompute after submit failed (non-fatal)");
        }

        logger.LogInformation("audit.evaluation.vocational.submitted evaluationGroupId={GroupId} count={Count}", group.Id, answers.Count);
        return new VocationalSubmitResult(VocationalSubmitStatus.Ok, answers.Count);
    }

    public async Task<ViolationsResult> SaveViolationsAsync(
        string token, JsonElement rawViolations, CancellationToken cancellationToken = default)
    {
        var now = NowMs();
        var incoming = ProctoringViolations.Bound(rawViolations, IsoZ(now));

        await using var session = await databaseSessionFactory.OpenWritableAsync(RequestContext.System(), cancellationToken);

        // Reject expired links too (mirrors the take-flow gate) so a stale token cannot keep mutating violations.
        string groupId;
        JsonElement? existing;
        await using (var command = Command(session,
            "SELECT \"id\", \"violations\"::text FROM \"evaluation_groups\" " +
            "WHERE \"invitationToken\" = @token AND \"isActive\" = true AND \"tokenExpiryDate\" > @now LIMIT 1"))
        {
            AddParameter(command, "token", token);
            AddTimestamp(command, "now", now);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            if (!await reader.ReadAsync(cancellationToken))
            {
                return new ViolationsResult(false);
            }

            groupId = reader.GetString(0);
            existing = reader.IsDBNull(1) ? null : Parse(reader.GetString(1));
        }

        var merge = ProctoringViolations.Merge(existing, incoming);
        await using (var update = Command(session, """
            UPDATE "evaluation_groups"
            SET "violations" = @violations::jsonb, "violation_count" = @count, "flag_for_review" = @flag, "updatedAt" = @now
            WHERE "id" = @id
            """))
        {
            AddParameter(update, "id", groupId);
            AddParameter(update, "violations", merge.All.ToJsonString());
            AddParameter(update, "count", merge.Count);
            AddParameter(update, "flag", merge.Flag);
            AddTimestamp(update, "now", NowMs());
            await update.ExecuteNonQueryAsync(cancellationToken);
        }

        await session.CommitAsync(cancellationToken);
        logger.LogInformation("audit.evaluation.vocational.violations groupId={GroupId} newCount={New} totalCount={Total} flag={Flag}",
            groupId, incoming.Count, merge.Count, merge.Flag);
        return new ViolationsResult(true, incoming.Count, merge.Count);
    }

    // ---- semantic answer validation (legacy submitVocational validation loop) ----

    private static bool AnswerMatchesOptions(VocationalAnswerInput answer, QuestionnaireItem question)
    {
        switch (answer.Type)
        {
            case "ranking":
            {
                var options = OptionValues(question.Options);
                var order = answer.RankingOrder ?? Array.Empty<VocationalRankingEntry>();
                var values = order.Select(o => o.Value).ToList();
                var ranks = order.Select(o => o.Rank).ToList();
                if (values.Any(v => !options.Contains(v)))
                {
                    return false;
                }

                return values.Distinct().Count() == values.Count && ranks.Distinct().Count() == ranks.Count;
            }

            case "multi_select":
            {
                var options = OptionValues(question.Options);
                return (answer.SelectedValues ?? Array.Empty<string>()).All(options.Contains);
            }

            case "single_select":
            {
                var options = OptionValues(question.Options);
                return options.Contains(answer.TextValue ?? string.Empty);
            }

            default:
                // likert range + open non-empty are enforced by the edge (zod) validation.
                return true;
        }
    }

    // legacy optionValues(options): Array.isArray(options) ? options.map(o => o.value) : []
    private static HashSet<string> OptionValues(JsonElement options)
    {
        var values = new HashSet<string>(StringComparer.Ordinal);
        if (options.ValueKind != JsonValueKind.Array)
        {
            return values;
        }

        foreach (var element in options.EnumerateArray())
        {
            if (element.ValueKind == JsonValueKind.Object
                && element.TryGetProperty("value", out var value)
                && value.ValueKind == JsonValueKind.String)
            {
                values.Add(value.GetString()!);
            }
        }

        return values;
    }

    // ---- upsert (jsonb-skip-when-N/A vs scalar-null-when-N/A asymmetry) ----

    private async Task UpsertResponseAsync(
        FormMapsDatabaseSession session, string groupId, string groupKey, string instrumentVersion,
        VocationalAnswerInput answer, string? dimensionKey, CancellationToken cancellationToken)
    {
        var isRanking = answer.Type == "ranking";
        var isMultiSelect = answer.Type == "multi_select";

        // Scalar cols (ratingValue, textValue) are ALWAYS written (null when N/A). jsonb cols (rankingOrder,
        // selectedValues) are OMITTED when N/A → on re-upsert the prior value is preserved (legacy `undefined`).
        var columns = new List<string> { "id", "evaluationGroupId", "questionNumber", "instrumentVersion", "group", "dimensionKey", "type", "ratingValue", "textValue" };
        var values = new List<string> { "@id", "@egid", "@qnum", "@iv", "@grp", "@dk", "@type", "@rv", "@tv" };
        var updates = new List<string>
        {
            "\"instrumentVersion\" = EXCLUDED.\"instrumentVersion\"",
            "\"group\" = EXCLUDED.\"group\"",
            "\"dimensionKey\" = EXCLUDED.\"dimensionKey\"",
            "\"type\" = EXCLUDED.\"type\"",
            "\"ratingValue\" = EXCLUDED.\"ratingValue\"",
            "\"textValue\" = EXCLUDED.\"textValue\"",
        };

        if (isRanking)
        {
            columns.Add("rankingOrder");
            values.Add("@ro::jsonb");
            updates.Add("\"rankingOrder\" = EXCLUDED.\"rankingOrder\"");
        }

        if (isMultiSelect)
        {
            columns.Add("selectedValues");
            values.Add("@sv::jsonb");
            updates.Add("\"selectedValues\" = EXCLUDED.\"selectedValues\"");
        }

        columns.Add("createdDate");
        values.Add("@createdDate");
        columns.Add("updatedAt");
        values.Add("@updatedAt");
        updates.Add("\"updatedAt\" = EXCLUDED.\"updatedAt\"");

        var columnList = string.Join(", ", columns.Select(c => $"\"{c}\""));
        var valueList = string.Join(", ", values);
        var updateList = string.Join(", ", updates);
        var sql = $"INSERT INTO \"vocational_responses\" ({columnList}) VALUES ({valueList}) " +
                  $"ON CONFLICT (\"evaluationGroupId\", \"questionNumber\") DO UPDATE SET {updateList}";

        var now = NowMs();
        await using var command = Command(session, sql);
        AddParameter(command, "id", Guid.NewGuid().ToString());
        AddParameter(command, "egid", groupId);
        AddParameter(command, "qnum", answer.QuestionNumber);
        AddParameter(command, "iv", instrumentVersion);
        AddParameter(command, "grp", groupKey);
        AddNullableParameter(command, "dk", dimensionKey);
        AddParameter(command, "type", answer.Type);
        AddNullableParameter(command, "rv", answer.Type == "likert" ? answer.RatingValue : null);
        AddNullableParameter(command, "tv", answer.Type is "single_select" or "open" ? answer.TextValue : null);
        if (isRanking)
        {
            AddParameter(command, "ro", RankingOrderJson(answer.RankingOrder));
        }

        if (isMultiSelect)
        {
            AddParameter(command, "sv", StringArrayJson(answer.SelectedValues));
        }

        AddTimestamp(command, "createdDate", now);
        AddTimestamp(command, "updatedAt", now);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    private static string RankingOrderJson(IReadOnlyList<VocationalRankingEntry>? order)
    {
        var array = new JsonArray();
        foreach (var entry in order ?? Array.Empty<VocationalRankingEntry>())
        {
            array.Add(new JsonObject { ["value"] = entry.Value, ["rank"] = entry.Rank });
        }

        return array.ToJsonString();
    }

    private static string StringArrayJson(IReadOnlyList<string>? values)
    {
        var array = new JsonArray();
        foreach (var value in values ?? Array.Empty<string>())
        {
            array.Add(value);
        }

        return array.ToJsonString();
    }

    private static async Task FlipGroupCompletedAsync(
        FormMapsDatabaseSession session, string groupId, CancellationToken cancellationToken)
    {
        await using var command = Command(session, """
            UPDATE "evaluation_groups"
            SET "isTokenUsed" = true, "tokenUsedDate" = @now,
                "isEvaluationCompleted" = true, "evaluationCompletedDate" = @now, "updatedAt" = @now
            WHERE "id" = @id
            """);
        AddParameter(command, "id", groupId);
        AddTimestamp(command, "now", NowMs());
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    // ---- group resolution ----

    private sealed record GroupRow(
        string Id, string GroupType, string EvaluatorName, string EvaluatedUserId,
        string? Instrument, string? InstrumentVersion, DateTime TokenExpiryDate, bool IsEvaluationCompleted);

    private static async Task<GroupRow?> ResolveByTokenAsync(
        FormMapsDatabaseSession session, string token, bool requireUnexpired, CancellationToken cancellationToken)
    {
        var sql = "SELECT \"id\", \"groupType\", \"evaluatorName\", \"evaluatedUserId\", \"instrument\", " +
                  "\"instrumentVersion\", \"tokenExpiryDate\", \"isEvaluationCompleted\" " +
                  "FROM \"evaluation_groups\" WHERE \"invitationToken\" = @token AND \"isActive\" = true"
                  + (requireUnexpired ? " AND \"tokenExpiryDate\" > @now" : string.Empty)
                  + " LIMIT 1";
        await using var command = Command(session, sql);
        AddParameter(command, "token", token);
        if (requireUnexpired)
        {
            AddTimestamp(command, "now", NowMs());
        }

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return null;
        }

        return new GroupRow(
            Id: reader.GetString(0),
            GroupType: reader.GetString(1),
            EvaluatorName: reader.GetString(2),
            EvaluatedUserId: reader.GetString(3),
            Instrument: reader.IsDBNull(4) ? null : reader.GetString(4),
            InstrumentVersion: reader.IsDBNull(5) ? null : reader.GetString(5),
            TokenExpiryDate: reader.GetDateTime(6),
            IsEvaluationCompleted: reader.GetBoolean(7));
    }

    private static async Task<string?> LoadUserNameAsync(
        FormMapsDatabaseSession session, string userId, CancellationToken cancellationToken)
    {
        await using var command = Command(session, "SELECT \"name\" FROM \"users\" WHERE \"id\" = @id LIMIT 1");
        AddParameter(command, "id", userId);
        var value = await command.ExecuteScalarAsync(cancellationToken);
        return value as string;
    }

    // ---- helpers ----

    private static JsonElement Parse(string raw)
    {
        using var document = JsonDocument.Parse(raw);
        return document.RootElement.Clone();
    }

    private static DbCommand Command(FormMapsDatabaseSession session, string sql)
    {
        var command = session.Connection.CreateCommand();
        command.Transaction = session.Transaction;
        command.CommandText = sql;
        return command;
    }

    private static void AddParameter(DbCommand command, string name, object value)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = name;
        parameter.Value = value;
        command.Parameters.Add(parameter);
    }

    private static void AddNullableParameter(DbCommand command, string name, object? value)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = name;
        parameter.Value = value ?? DBNull.Value;
        command.Parameters.Add(parameter);
    }

    private static void AddTimestamp(DbCommand command, string name, DateTime value)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = name;
        parameter.DbType = DbType.DateTime2;
        parameter.Value = value;
        command.Parameters.Add(parameter);
    }

    private static DateTime NowMs()
    {
        var value = DateTimeOffset.UtcNow.UtcDateTime;
        return new DateTime(value.Ticks - (value.Ticks % TimeSpan.TicksPerMillisecond), DateTimeKind.Unspecified);
    }

    private static string IsoZ(DateTime value) =>
        DateTime.SpecifyKind(value, DateTimeKind.Utc).ToString("yyyy-MM-ddTHH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);
}
