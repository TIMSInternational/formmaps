using System.Data.Common;
using FormMaps.Application.Assessments;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;

namespace FormMaps.Infrastructure.Assessments;

/// <summary>
/// Reads the authed test-scores surface (legacy routes/test-scores.ts) under the caller's read-only RLS
/// session. Superscore/college-fit derive from the caller's own active SAT/ACT scores (self-scoped via the
/// request actor); the student-view list is a plain read the endpoint authorizes first. Decimal acceptanceRate
/// is emitted as a JSON number (::double precision), subScores jsonb passes through verbatim, timestamps ISO-Z.
/// </summary>
public sealed class TestScoreReader(IFormMapsDatabaseSessionFactory databaseSessionFactory) : ITestScoreReader
{
    public async Task<SuperscoreResult> GetSuperscoreAsync(RequestContext context, CancellationToken cancellationToken = default)
    {
        var userId = context.Actor!.UserId;
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);

        await using var command = Command(session, """
            SELECT "testType", "satMath", "satReading", "actEnglish", "actMath", "actReading", "actScience"
            FROM "student_test_scores" WHERE "userId" = @uid AND "isActive" = true
            """);
        AddParameter(command, "uid", userId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);

        var scores = new List<SuperscoreInput>();
        while (await reader.ReadAsync(cancellationToken))
        {
            scores.Add(new SuperscoreInput(
                TestType: reader.GetString(0),
                SatMath: NullableInt(reader, 1),
                SatReading: NullableInt(reader, 2),
                ActEnglish: NullableInt(reader, 3),
                ActMath: NullableInt(reader, 4),
                ActReading: NullableInt(reader, 5),
                ActScience: NullableInt(reader, 6)));
        }

        return TestScoreComputations.Superscore(scores);
    }

    public async Task<CollegeFitResult> GetCollegeFitAsync(RequestContext context, CancellationToken cancellationToken = default)
    {
        var userId = context.Actor!.UserId;
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);

        int? bestMath = null, bestReading = null;
        await using (var command = Command(session, """
            SELECT "satMath", "satReading" FROM "student_test_scores"
            WHERE "userId" = @uid AND "testType" = 'SAT' AND "isActive" = true
            """))
        {
            AddParameter(command, "uid", userId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            var maths = new List<int?>();
            var readings = new List<int?>();
            while (await reader.ReadAsync(cancellationToken))
            {
                maths.Add(NullableInt(reader, 0));
                readings.Add(NullableInt(reader, 1));
            }

            bestMath = TestScoreComputations.MaxOrNull(maths);
            bestReading = TestScoreComputations.MaxOrNull(readings);
        }

        if (bestMath is null || bestReading is null)
        {
            return new CollegeFitResult(null, []);
        }

        var superscore = bestMath.Value + bestReading.Value;

        var colleges = new List<CollegeFitEntry>();
        await using (var command = Command(session, """
            SELECT "id", "name", "city", "state", "acceptanceRate"::double precision AS "acceptanceRate",
                   "satMath25", "satReading25", "satMath75", "satReading75"
            FROM "universities"
            WHERE "satMath25" IS NOT NULL AND "satReading25" IS NOT NULL
              AND "satMath75" IS NOT NULL AND "satReading75" IS NOT NULL
            ORDER BY "acceptanceRate" ASC NULLS LAST, "id" ASC
            LIMIT 12
            """))
        {
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                var acceptanceRate = reader.IsDBNull(4) ? (double?)null : reader.GetDouble(4);
                var sat25 = reader.GetInt32(5) + reader.GetInt32(6);
                var sat75 = reader.GetInt32(7) + reader.GetInt32(8);
                colleges.Add(new CollegeFitEntry(
                    Id: reader.GetString(0),
                    Name: reader.GetString(1),
                    City: reader.GetString(2),
                    State: reader.IsDBNull(3) ? null : reader.GetString(3),
                    AcceptanceRate: acceptanceRate,
                    Sat25: sat25,
                    Sat75: sat75,
                    Fit: TestScoreComputations.ClassifyFit(superscore, sat25, sat75, acceptanceRate)));
            }
        }

        return new CollegeFitResult(superscore, colleges);
    }

    public async Task<bool> HasActiveCounselorAssignmentAsync(
        RequestContext context, string counselorId, string studentId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        await using var command = Command(session, """
            SELECT 1 FROM "counselor_student_assignments"
            WHERE "counselorId" = @counselorId AND "studentId" = @studentId AND "isActive" = true LIMIT 1
            """);
        AddParameter(command, "counselorId", counselorId);
        AddParameter(command, "studentId", studentId);
        return await command.ExecuteScalarAsync(cancellationToken) is not null;
    }

    public async Task<bool> HasActiveParentLinkAsync(
        RequestContext context, string studentId, string parentEmail, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        await using var command = Command(session, """
            SELECT 1 FROM "student_parent_links"
            WHERE "studentId" = @studentId AND "parentEmail" = @parentEmail AND "isActive" = true LIMIT 1
            """);
        AddParameter(command, "studentId", studentId);
        AddParameter(command, "parentEmail", parentEmail);
        return await command.ExecuteScalarAsync(cancellationToken) is not null;
    }

    public async Task<IReadOnlyList<TestScoreRow>> ListActiveScoresAsync(
        RequestContext context, string userId, string? testType, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);

        // Optional testType filter; legacy orderBy testDate desc = Postgres DESC default NULLS FIRST, plus a
        // deterministic id tie-break (legacy has none) so ties are stable. Shared full-row projection with the
        // write path (TestScoreRowMapper) so reads and writes can't drift on columns/jsonb/timestamps.
        var sql = $"""
            SELECT {TestScoreRowMapper.Projection}
            FROM "student_test_scores"
            WHERE "userId" = @uid AND "isActive" = true
            """
            + (testType is null ? string.Empty : "\n  AND \"testType\" = @testType")
            + "\nORDER BY \"testDate\" DESC NULLS FIRST, \"id\" ASC";

        await using var command = Command(session, sql);
        AddParameter(command, "uid", userId);
        if (testType is not null)
        {
            AddParameter(command, "testType", testType);
        }

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        var rows = new List<TestScoreRow>();
        while (await reader.ReadAsync(cancellationToken))
        {
            rows.Add(TestScoreRowMapper.Read(reader));
        }

        return rows;
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

    private static int? NullableInt(DbDataReader reader, int ordinal) =>
        reader.IsDBNull(ordinal) ? null : reader.GetInt32(ordinal);
}
