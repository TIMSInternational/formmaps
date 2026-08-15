using System.Text.Json;
using FormMaps.Application.Assessments;
using FormMaps.Infrastructure.Assessments;
using FormMaps.Infrastructure.Audit;
using FormMaps.Infrastructure.Data;
using Microsoft.Extensions.Logging.Abstractions;
using Npgsql;

namespace FormMaps.IntegrationTests.Assessments;

/// <summary>
/// Real-DB (Testcontainers) tests for <see cref="VocationalTakeService"/> — the external vocational rail (GET
/// form / POST submit / POST violations). Pins the atomic upsert+flip, the jsonb-skip-vs-scalar-null upsert
/// asymmetry, the semantic answer + require-all validation, the verb-dependent expiry (submit is here; GET's
/// 410 is proven at the endpoint), and the proctoring bound/merge/flag + expired-token gate.
/// </summary>
public sealed class VocationalTakeServiceTests : IClassFixture<TokenRailDatabaseFixture>, IAsyncLifetime
{
    private readonly TokenRailDatabaseFixture _fixture;
    private NpgsqlDataSource _dataSource = null!;

    public VocationalTakeServiceTests(TokenRailDatabaseFixture fixture) => _fixture = fixture;

    public async Task InitializeAsync()
    {
        _dataSource = NpgsqlDataSource.Create(_fixture.ConnectionString);
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand(
            """TRUNCATE "evaluation_groups","evaluation_feedbacks","vocational_responses","vocational_questions","vocational_instruments","vocational_results","users" CASCADE""", conn);
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task DisposeAsync() => await _dataSource.DisposeAsync();

    private VocationalTakeService Service()
    {
        var factory = new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier());
        var reader = new VocationalReader(factory);
        // Real AuditEventWriter (formmaps#52 Task 12): a rater's submission fires the best-effort recompute,
        // which now audits. token-rail-schema.sql carries the simplified audit_events table so that write
        // actually executes here instead of silently taking AuditEventWriter's fail-soft branch.
        var writer = new VocationalWriter(
            factory, reader, new CompleteProfileAssembler(factory),
            new AuditEventWriter(factory, NullLogger<AuditEventWriter>.Instance), NullLogger<VocationalWriter>.Instance);
        return new VocationalTakeService(factory, reader, writer, NullLogger<VocationalTakeService>.Instance);
    }

    // ---- submit ----

    [Fact]
    public async Task Submit_happy_upserts_all_responses_and_flips_the_group_atomically()
    {
        await SeedQuestionAsync(number: 1, type: "likert");
        await SeedQuestionAsync(number: 2, type: "ranking", optionsJson: """[{"value":"a"},{"value":"b"},{"value":"c"}]""");
        var groupId = await SeedGroupAsync(token: "vt", groupType: "teacher", expiryHours: 24, instrument: "vocational", instrumentVersion: "v1");

        var answers = Answers("""
            [ {"questionNumber":1,"type":"likert","ratingValue":5},
              {"questionNumber":2,"type":"ranking","rankingOrder":[{"value":"a","rank":1},{"value":"b","rank":2}]} ]
            """);
        var result = await Service().SubmitAsync("vt", answers);

        Assert.Equal(VocationalSubmitStatus.Ok, result.Status);
        Assert.Equal(2, result.Count);

        await using var conn = await _dataSource.OpenConnectionAsync();
        Assert.Equal(2, await CountAsync(conn, "SELECT count(*) FROM \"vocational_responses\" WHERE \"evaluationGroupId\" = @g", groupId));
        var (completed, tokenUsed) = await GroupFlagsAsync(conn, groupId);
        Assert.True(completed);
        Assert.True(tokenUsed);
    }

    [Fact]
    public async Task Submit_upsert_skips_jsonb_but_nulls_scalars_when_type_changes()
    {
        // Questionnaire #1 is likert. A STALE ranking response exists for (group, #1) with jsonb + textValue set.
        // Submitting #1 as likert must: set ratingValue, NULL textValue (scalar), but PRESERVE rankingOrder +
        // selectedValues (jsonb omitted from the write). Pins SPEC CORRECTION #5.
        await SeedQuestionAsync(number: 1, type: "likert");
        var groupId = await SeedGroupAsync(token: "va", groupType: "teacher", expiryHours: 24, instrument: "vocational", instrumentVersion: "v1");
        await SeedStaleResponseAsync(groupId, questionNumber: 1);

        var answers = Answers("""[ {"questionNumber":1,"type":"likert","ratingValue":4} ]""");
        Assert.Equal(VocationalSubmitStatus.Ok, (await Service().SubmitAsync("va", answers)).Status);

        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand(
            "SELECT \"type\",\"ratingValue\",\"textValue\",\"rankingOrder\"::text,\"selectedValues\"::text FROM \"vocational_responses\" WHERE \"evaluationGroupId\"=@g AND \"questionNumber\"=1", conn);
        cmd.Parameters.AddWithValue("g", groupId);
        await using var reader = await cmd.ExecuteReaderAsync();
        await reader.ReadAsync();
        Assert.Equal("likert", reader.GetString(0));
        Assert.Equal(4, reader.GetInt32(1));            // scalar written
        Assert.True(reader.IsDBNull(2));                // textValue NULLED (scalar N/A)
        Assert.False(reader.IsDBNull(3));               // rankingOrder PRESERVED (jsonb omitted)
        Assert.False(reader.IsDBNull(4));               // selectedValues PRESERVED
    }

    [Fact]
    public async Task Submit_bad_answer_when_ranking_value_not_in_options()
    {
        await SeedQuestionAsync(number: 1, type: "ranking", optionsJson: """[{"value":"a"},{"value":"b"}]""");
        await SeedGroupAsync(token: "vb", groupType: "teacher", expiryHours: 24, instrument: "vocational", instrumentVersion: "v1");
        var answers = Answers("""[ {"questionNumber":1,"type":"ranking","rankingOrder":[{"value":"ZZZ","rank":1}]} ]""");
        Assert.Equal(VocationalSubmitStatus.BadAnswer, (await Service().SubmitAsync("vb", answers)).Status);
    }

    [Fact]
    public async Task Submit_bad_answer_when_type_mismatches_questionnaire()
    {
        await SeedQuestionAsync(number: 1, type: "likert");
        await SeedGroupAsync(token: "vt2", groupType: "teacher", expiryHours: 24, instrument: "vocational", instrumentVersion: "v1");
        var answers = Answers("""[ {"questionNumber":1,"type":"open","textValue":"hi"} ]""");
        Assert.Equal(VocationalSubmitStatus.BadAnswer, (await Service().SubmitAsync("vt2", answers)).Status);
    }

    [Fact]
    public async Task Submit_incomplete_when_not_every_question_answered()
    {
        await SeedQuestionAsync(number: 1, type: "likert");
        await SeedQuestionAsync(number: 2, type: "likert");
        await SeedGroupAsync(token: "vi", groupType: "teacher", expiryHours: 24, instrument: "vocational", instrumentVersion: "v1");
        var answers = Answers("""[ {"questionNumber":1,"type":"likert","ratingValue":5} ]""");
        Assert.Equal(VocationalSubmitStatus.Incomplete, (await Service().SubmitAsync("vi", answers)).Status);
    }

    [Fact]
    public async Task Submit_already_completed_expired_notfound_and_invalid_group()
    {
        await SeedQuestionAsync(number: 1, type: "likert");
        var ok = Answers("""[ {"questionNumber":1,"type":"likert","ratingValue":5} ]""");

        await SeedGroupAsync(token: "done", groupType: "teacher", expiryHours: 24, instrument: "vocational", instrumentVersion: "v1", completed: true);
        Assert.Equal(VocationalSubmitStatus.AlreadyCompleted, (await Service().SubmitAsync("done", ok)).Status);

        await SeedGroupAsync(token: "exp", groupType: "teacher", expiryHours: -1, instrument: "vocational", instrumentVersion: "v1");
        Assert.Equal(VocationalSubmitStatus.Expired, (await Service().SubmitAsync("exp", ok)).Status);  // submit → expired (endpoint 404)

        await SeedGroupAsync(token: "notvoc", groupType: "teacher", expiryHours: 24, instrument: null, instrumentVersion: "v1");
        Assert.Equal(VocationalSubmitStatus.NotFound, (await Service().SubmitAsync("notvoc", ok)).Status);

        Assert.Equal(VocationalSubmitStatus.NotFound, (await Service().SubmitAsync("no-such-token", ok)).Status);

        await SeedGroupAsync(token: "other", groupType: "other", expiryHours: 24, instrument: "vocational", instrumentVersion: "v1");
        Assert.Equal(VocationalSubmitStatus.InvalidGroup, (await Service().SubmitAsync("other", ok)).Status);
    }

    [Fact]
    public async Task Submit_with_duplicate_question_number_does_not_500_and_uses_last_wins()
    {
        // vocational_questions.number has no unique constraint → a duplicate number is schema-permitted. The
        // questionnaire map must be last-wins (legacy Map), NOT ToDictionary (which throws → 500). Seed #1 twice:
        // ranking first (order 1), likert last (order 2) → byNum[1] = likert. A likert answer therefore clears the
        // TYPE check (last-wins; a ranking-wins map would return BadAnswer), and require-all (1 distinct vs 2 rows)
        // yields Incomplete — a clean 4xx, never a 500 from a throwing map.
        await SeedQuestionAsync(number: 1, type: "ranking", optionsJson: """[{"value":"a"}]""", order: 1);
        await SeedQuestionAsync(number: 1, type: "likert", order: 2);
        await SeedGroupAsync(token: "dup", groupType: "teacher", expiryHours: 24, instrument: "vocational", instrumentVersion: "v1");

        var answers = Answers("""[ {"questionNumber":1,"type":"likert","ratingValue":5} ]""");
        var result = await Service().SubmitAsync("dup", answers); // must not throw (would be a 500)
        Assert.Equal(VocationalSubmitStatus.Incomplete, result.Status);
    }

    // ---- GET form ----

    [Fact]
    public async Task GetForm_open_returns_questionnaire_and_completed_short_circuits()
    {
        await SeedUserAsync("stu-1", "s@x.com", "Grace");
        await SeedQuestionAsync(number: 1, type: "likert");
        await SeedGroupAsync(token: "gf", groupType: "teacher", expiryHours: 24, instrument: "vocational", instrumentVersion: "v1", evaluatedUserId: "stu-1");

        var open = await Service().GetFormAsync("gf");
        Assert.Equal(VocationalFormStatus.Ok, open.Status);
        Assert.Equal("teacher", open.Group);
        Assert.Equal("Grace", open.StudentName);
        Assert.Single(open.Questions!);

        await SeedGroupAsync(token: "gfc", groupType: "teacher", expiryHours: 24, instrument: "vocational", instrumentVersion: "v1", completed: true);
        Assert.Equal(VocationalFormStatus.Completed, (await Service().GetFormAsync("gfc")).Status);
    }

    [Fact]
    public async Task GetForm_expired_notfound_invalidgroup()
    {
        await SeedGroupAsync(token: "e", groupType: "teacher", expiryHours: -1, instrument: "vocational", instrumentVersion: "v1");
        Assert.Equal(VocationalFormStatus.Expired, (await Service().GetFormAsync("e")).Status);  // GET → expired (endpoint 410)

        await SeedGroupAsync(token: "nv", groupType: "teacher", expiryHours: 24, instrument: null, instrumentVersion: "v1");
        Assert.Equal(VocationalFormStatus.NotFound, (await Service().GetFormAsync("nv")).Status);

        await SeedGroupAsync(token: "o", groupType: "other", expiryHours: 24, instrument: "vocational", instrumentVersion: "v1");
        Assert.Equal(VocationalFormStatus.InvalidGroup, (await Service().GetFormAsync("o")).Status);
    }

    // ---- violations ----

    [Fact]
    public async Task Violations_bounds_defaults_merges_and_flags()
    {
        var groupId = await SeedGroupAsync(token: "vv", groupType: "teacher", expiryHours: 24, instrument: "vocational", instrumentVersion: "v1");

        // One well-formed + one missing-fields element (defaults: type "unknown", details "").
        var raw = Json("""[ {"type":"blur","timestamp":"t1","details":"d"}, {} ]""");
        var result = await Service().SaveViolationsAsync("vv", raw);
        Assert.True(result.Found);
        Assert.Equal(2, result.Saved);
        Assert.Equal(2, result.ViolationCount);

        await using var conn = await _dataSource.OpenConnectionAsync();
        var stored = await ScalarStringAsync(conn, "SELECT \"violations\"::text FROM \"evaluation_groups\" WHERE \"id\"=@g", groupId);
        using var doc = JsonDocument.Parse(stored);
        Assert.Equal("unknown", doc.RootElement[1].GetProperty("type").GetString());   // default
        Assert.Equal(string.Empty, doc.RootElement[1].GetProperty("details").GetString());

        // A second flush merges (cumulative) and crosses the flag threshold (>=3).
        var result2 = await Service().SaveViolationsAsync("vv", Json("""[ {"type":"copy","timestamp":"t2"} ]"""));
        Assert.Equal(3, result2.ViolationCount);
        var flag = await ScalarBoolAsync(conn, "SELECT \"flag_for_review\" FROM \"evaluation_groups\" WHERE \"id\"=@g", groupId);
        Assert.True(flag);
    }

    [Fact]
    public async Task Violations_on_expired_token_is_not_found()
    {
        await SeedGroupAsync(token: "vex", groupType: "teacher", expiryHours: -1, instrument: "vocational", instrumentVersion: "v1");
        var result = await Service().SaveViolationsAsync("vex", Json("""[ {"type":"blur"} ]"""));
        Assert.False(result.Found);
    }

    // ---- seed helpers ----

    private static IReadOnlyList<VocationalAnswerInput> Answers(string json)
    {
        var list = new List<VocationalAnswerInput>();
        using var doc = JsonDocument.Parse(json);
        foreach (var a in doc.RootElement.EnumerateArray())
        {
            var type = a.GetProperty("type").GetString()!;
            var number = a.GetProperty("questionNumber").GetInt32();
            List<VocationalRankingEntry>? ranking = null;
            List<string>? selected = null;
            int? rating = null;
            string? text = null;
            if (a.TryGetProperty("ratingValue", out var r))
            {
                rating = r.GetInt32();
            }

            if (a.TryGetProperty("textValue", out var t))
            {
                text = t.GetString();
            }

            if (a.TryGetProperty("rankingOrder", out var ro))
            {
                ranking = ro.EnumerateArray().Select(e => new VocationalRankingEntry(e.GetProperty("value").GetString()!, e.GetProperty("rank").GetInt32())).ToList();
            }

            if (a.TryGetProperty("selectedValues", out var sv))
            {
                selected = sv.EnumerateArray().Select(e => e.GetString()!).ToList();
            }

            list.Add(new VocationalAnswerInput(number, type, rating, ranking, selected, text));
        }

        return list;
    }

    private static JsonElement Json(string json)
    {
        using var doc = JsonDocument.Parse(json);
        return doc.RootElement.Clone();
    }

    private async Task SeedQuestionAsync(int number, string type, string? optionsJson = null, int? order = null)
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand("""
            INSERT INTO "vocational_questions" ("id","instrumentId","number","type","block","options","order")
            VALUES (@id,'vi-1',@number,@type,'b',@options::jsonb,@order)
            """, conn);
        cmd.Parameters.AddWithValue("id", Guid.NewGuid().ToString());
        cmd.Parameters.AddWithValue("number", number);
        cmd.Parameters.AddWithValue("type", type);
        cmd.Parameters.AddWithValue("options", (object?)optionsJson ?? DBNull.Value);
        cmd.Parameters.AddWithValue("order", order ?? number);
        await cmd.ExecuteNonQueryAsync();
    }

    private async Task<string> SeedGroupAsync(
        string token, string groupType, int expiryHours, string? instrument, string? instrumentVersion,
        bool completed = false, string evaluatedUserId = "stu-1")
    {
        var id = "eg-" + Guid.NewGuid().ToString("N");
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand("""
            INSERT INTO "evaluation_groups"
                ("id","evaluatorName","evaluatorEmail","relation","groupType","evaluatedUserId","invitationToken",
                 "tokenExpiryDate","isEvaluationCompleted","instrument","instrumentVersion")
            VALUES (@id,'Rater','r@x.com','Teacher',@groupType,@uid,@token,@expiry,@completed,@instrument,@iv)
            """, conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("groupType", groupType);
        cmd.Parameters.AddWithValue("uid", evaluatedUserId);
        cmd.Parameters.AddWithValue("token", token);
        cmd.Parameters.AddWithValue("expiry", DateTime.SpecifyKind(DateTimeOffset.UtcNow.AddHours(expiryHours).UtcDateTime, DateTimeKind.Unspecified));
        cmd.Parameters.AddWithValue("completed", completed);
        cmd.Parameters.AddWithValue("instrument", (object?)instrument ?? DBNull.Value);
        cmd.Parameters.AddWithValue("iv", (object?)instrumentVersion ?? DBNull.Value);
        await cmd.ExecuteNonQueryAsync();
        return id;
    }

    private async Task SeedStaleResponseAsync(string groupId, int questionNumber)
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand("""
            INSERT INTO "vocational_responses"
                ("id","evaluationGroupId","instrumentVersion","group","questionNumber","type","ratingValue","rankingOrder","selectedValues","textValue")
            VALUES (@id,@g,'v1','teacher',@num,'ranking',NULL,@ro::jsonb,@sv::jsonb,'old-text')
            """, conn);
        cmd.Parameters.AddWithValue("id", Guid.NewGuid().ToString());
        cmd.Parameters.AddWithValue("g", groupId);
        cmd.Parameters.AddWithValue("num", questionNumber);
        cmd.Parameters.AddWithValue("ro", """[{"value":"a","rank":1}]""");
        cmd.Parameters.AddWithValue("sv", """["x"]""");
        await cmd.ExecuteNonQueryAsync();
    }

    private async Task SeedUserAsync(string id, string email, string name)
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand("""INSERT INTO "users" ("id","email","name") VALUES (@id,@email,@name)""", conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("email", email);
        cmd.Parameters.AddWithValue("name", name);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task<int> CountAsync(NpgsqlConnection conn, string sql, string groupId)
    {
        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("g", groupId);
        return (int)(long)(await cmd.ExecuteScalarAsync())!;
    }

    private static async Task<(bool Completed, bool TokenUsed)> GroupFlagsAsync(NpgsqlConnection conn, string groupId)
    {
        await using var cmd = new NpgsqlCommand("SELECT \"isEvaluationCompleted\",\"isTokenUsed\" FROM \"evaluation_groups\" WHERE \"id\"=@g", conn);
        cmd.Parameters.AddWithValue("g", groupId);
        await using var reader = await cmd.ExecuteReaderAsync();
        await reader.ReadAsync();
        return (reader.GetBoolean(0), reader.GetBoolean(1));
    }

    private static async Task<string> ScalarStringAsync(NpgsqlConnection conn, string sql, string groupId)
    {
        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("g", groupId);
        return (string)(await cmd.ExecuteScalarAsync())!;
    }

    private static async Task<bool> ScalarBoolAsync(NpgsqlConnection conn, string sql, string groupId)
    {
        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("g", groupId);
        return (bool)(await cmd.ExecuteScalarAsync())!;
    }
}
