using Npgsql;

namespace FormMaps.IntegrationTests.Assessments;

/// <summary>
/// Proof that the Testcontainers harness boots and the LIA schema applies — a trivial round-trip
/// (insert a session + a response, read them back). Validates Docker + the DDL before the write-rail
/// tests build on it.
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
        await Exec(
            connection,
            "INSERT INTO lia_responses (id, session_id, question_id, subtest, item_number, is_correct, updated_at) " +
            "VALUES ('r1', 's1', 'q1', 'pattern_recognition'::\"LiaSubtest\", 1, true, now())");

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

    private static async Task Exec(NpgsqlConnection connection, string sql)
    {
        await using var cmd = new NpgsqlCommand(sql, connection);
        await cmd.ExecuteNonQueryAsync();
    }
}
