using Npgsql;

namespace FormMaps.IntegrationTests.Assessments;

/// <summary>
/// Proof that the Testcontainers harness boots and the LIA schema applies — a trivial round-trip
/// (insert a session + a response, read them back). Validates Docker + the DDL before the write-rail
/// tests build on it. Also pins the two properties of the harness that make FK-shaped bugs detectable
/// at all: the static <c>lia_questions</c> catalog is seeded, and <c>lia_responses.question_id</c>
/// actually enforces <c>lia_responses_question_id_fkey</c> against it.
/// </summary>
public sealed class LiaWriteHarnessProofTests : IClassFixture<LiaWriteDatabaseFixture>
{
    private readonly LiaWriteDatabaseFixture _fixture;

    public LiaWriteHarnessProofTests(LiaWriteDatabaseFixture fixture) => _fixture = fixture;

    [Fact]
    public async Task Harness_boots_schema_applies_and_a_session_round_trips()
    {
        await using var connection = new NpgsqlConnection(_fixture.ConnectionString);
        await connection.OpenAsync();

        await Exec(connection, "INSERT INTO users (id, name, email) VALUES ('u1', 'Test', 't@e.st')");
        await Exec(
            connection,
            "INSERT INTO lia_assessment_sessions (id, user_id, status, updated_at) " +
            "VALUES ('s1', 'u1', 'in_progress'::\"LiaSessionStatus\", now())");
        // A REAL seeded lia_questions.id — an invented one would violate lia_responses_question_id_fkey
        // (see the FK-enforcement test below, which pins exactly that).
        await Exec(
            connection,
            "INSERT INTO lia_responses (id, session_id, question_id, subtest, item_number, is_correct, updated_at) " +
            $"VALUES ('r1', 's1', '{_fixture.QuestionId("pattern_recognition", 1, isPractice: false)}', " +
            "'pattern_recognition'::\"LiaSubtest\", 1, true, now())");

        await using var cmd = new NpgsqlCommand(
            "SELECT s.\"status\"::text, count(r.id) " +
            "FROM lia_assessment_sessions s LEFT JOIN lia_responses r ON r.session_id = s.id " +
            "WHERE s.id = 's1' GROUP BY s.\"status\"",
            connection);
        await using var rdr = await cmd.ExecuteReaderAsync();

        Assert.True(await rdr.ReadAsync());
        Assert.Equal("in_progress", rdr.GetString(0));
        Assert.Equal(1, rdr.GetInt64(1));
    }

    /// <summary>
    /// The harness seeds one lia_questions row per embedded-bank entry. If this ever goes red, the
    /// resolver under test has no catalog to resolve against and every question-serving path would throw
    /// its catalog-drift error.
    /// </summary>
    [Fact]
    public async Task Question_catalog_is_seeded_from_the_embedded_bank()
    {
        await using var connection = new NpgsqlConnection(_fixture.ConnectionString);
        await connection.OpenAsync();

        await using var cmd = new NpgsqlCommand("SELECT count(*) FROM lia_questions", connection);
        var rows = (long)(await cmd.ExecuteScalarAsync())!;

        Assert.Equal(FormMaps.Application.Assessments.LiaAnswerScoring.BuildQuestionBank().Count, (int)rows);
        Assert.Equal(_fixture.SeededQuestionCount, (int)rows);
    }

    /// <summary>
    /// THE regression pin for the whole class of bug that shipped past nine task reviews: the harness
    /// used to omit lia_questions and this FK entirely, so it silently accepted any question_id string.
    /// Production has always enforced it, so a synthesized id meant a Postgres 23503 and a 500 on every
    /// single /answer and /timeout call. If someone drops the FK from lia-schema.sql again, this fails.
    /// </summary>
    [Fact]
    public async Task A_question_id_with_no_lia_questions_row_violates_the_foreign_key()
    {
        await using var connection = new NpgsqlConnection(_fixture.ConnectionString);
        await connection.OpenAsync();

        await Exec(connection, "INSERT INTO users (id, name, email) VALUES ('u2', 'Test', 't2@e.st')");
        await Exec(
            connection,
            "INSERT INTO lia_assessment_sessions (id, user_id, status, updated_at) " +
            "VALUES ('s2', 'u2', 'in_progress'::\"LiaSessionStatus\", now())");

        // The exact shape the old code synthesized: "{subtest}:{itemNumber}:{practice|assessment}".
        var error = await Assert.ThrowsAsync<PostgresException>(() => Exec(
            connection,
            "INSERT INTO lia_responses (id, session_id, question_id, subtest, item_number, is_correct, updated_at) " +
            "VALUES ('r2', 's2', 'pattern_recognition:1:assessment', 'pattern_recognition'::\"LiaSubtest\", 1, true, now())"));

        Assert.Equal("23503", error.SqlState); // foreign_key_violation
        Assert.Equal("lia_responses_question_id_fkey", error.ConstraintName);
    }

    private static async Task Exec(NpgsqlConnection connection, string sql)
    {
        await using var cmd = new NpgsqlCommand(sql, connection);
        await cmd.ExecuteNonQueryAsync();
    }
}
