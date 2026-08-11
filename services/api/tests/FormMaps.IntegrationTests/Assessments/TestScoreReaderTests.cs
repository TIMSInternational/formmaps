using System.Text.Json;
using FormMaps.Application.Auth;
using FormMaps.Infrastructure.Assessments;
using FormMaps.Infrastructure.Data;
using Npgsql;

namespace FormMaps.IntegrationTests.Assessments;

/// <summary>
/// Real-DB (Testcontainers) tests for <see cref="TestScoreReader"/> — the test-scores reads. Pins the SAT/ACT
/// superscore over real rows, college-fit (never-computed vs classified colleges ordered by acceptance with
/// Decimal-as-number), the counselor-assignment / parent-link checks, and the full-row list shape (ISO-Z
/// timestamps + subScores jsonb passthrough + testType filter).
/// </summary>
public sealed class TestScoreReaderTests : IClassFixture<TestScoreDatabaseFixture>, IAsyncLifetime
{
    private readonly TestScoreDatabaseFixture _fixture;
    private NpgsqlDataSource _dataSource = null!;

    public TestScoreReaderTests(TestScoreDatabaseFixture fixture) => _fixture = fixture;

    public async Task InitializeAsync()
    {
        _dataSource = NpgsqlDataSource.Create(_fixture.ConnectionString);
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand(
            """TRUNCATE "student_test_scores","universities","counselor_student_assignments","student_parent_links" """, conn);
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task DisposeAsync() => await _dataSource.DisposeAsync();

    [Fact]
    public async Task Superscore_takes_best_sections_across_active_rows()
    {
        var user = NewUser();
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedSatAsync(conn, user, math: 700, reading: 600);
        await SeedSatAsync(conn, user, math: 650, reading: 720);
        await SeedActAsync(conn, user, 30, 31, 32, 33);

        var result = await Reader().GetSuperscoreAsync(Ctx(user));

        Assert.Equal(700, result.Sat!.SatMath);
        Assert.Equal(720, result.Sat.SatReading);
        Assert.Equal(1420, result.Sat.SatTotal);
        Assert.Equal(32, result.Act!.ActComposite); // round(126/4)
    }

    [Fact]
    public async Task CollegeFit_is_empty_without_sat_scores()
    {
        var user = NewUser();
        var result = await Reader().GetCollegeFitAsync(Ctx(user));

        Assert.Null(result.Superscore);
        Assert.Empty(result.Colleges);
    }

    [Fact]
    public async Task CollegeFit_classifies_and_orders_colleges_with_decimal_rate_as_number()
    {
        var user = NewUser();
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedSatAsync(conn, user, math: 720, reading: 700); // superscore 1420
        await SeedUniversityAsync(conn, "Selective", rate: 0.05m, m25: 700, r25: 700, m75: 780, r75: 780);   // reach (rate<0.15)
        await SeedUniversityAsync(conn, "Reachy", rate: 0.40m, m25: 730, r25: 730, m75: 790, r75: 790);      // sat25=1460>1420 -> reach
        await SeedUniversityAsync(conn, "Matchy", rate: 0.55m, m25: 680, r25: 690, m75: 760, r75: 760);      // sat25=1370<=1420<sat75 -> match
        await SeedUniversityAsync(conn, "Safe", rate: 0.75m, m25: 600, r25: 600, m75: 700, r75: 700);        // sat75=1400<=1420 -> safety
        await SeedUniversityAsync(conn, "NoBand", rate: 0.10m, m25: null, r25: 700, m75: 780, r75: 780);     // missing satMath25 -> excluded

        var result = await Reader().GetCollegeFitAsync(Ctx(user));

        Assert.Equal(1420, result.Superscore);
        Assert.Equal(4, result.Colleges.Count);                        // NoBand excluded
        Assert.Equal(new[] { "Selective", "Reachy", "Matchy", "Safe" }, result.Colleges.Select(c => c.Name).ToArray()); // acceptanceRate ASC
        Assert.Equal(0.05, result.Colleges[0].AcceptanceRate);          // Decimal -> number
        Assert.Equal("reach", result.Colleges[0].Fit);
        Assert.Equal("reach", result.Colleges[1].Fit);
        Assert.Equal("match", result.Colleges[2].Fit);
        Assert.Equal("safety", result.Colleges[3].Fit);
        Assert.Equal(1460, result.Colleges[1].Sat25);                   // 730+730
    }

    [Fact]
    public async Task Counselor_assignment_and_parent_link_checks()
    {
        var counselor = NewUser();
        var parent = NewUser();
        var inactiveParent = NewUser();
        var pendingParent = NewUser();
        var strangerParent = NewUser();
        var student = NewUser();
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedAssignmentAsync(conn, counselor, student, active: true);
        await SeedParentLinkAsync(conn, student, parent, active: true);
        await SeedParentLinkAsync(conn, student, inactiveParent, active: false);
        await SeedParentLinkAsync(conn, student, pendingParent, active: true, accepted: false);

        Assert.True(await Reader().HasActiveCounselorAssignmentAsync(Ctx(counselor), counselor, student));
        Assert.False(await Reader().HasActiveCounselorAssignmentAsync(Ctx(counselor), counselor, NewUser()));

        // formmaps#121. The gate matches parentUserId + isActive + isAccepted, and runs on a system session so the
        // answer is the same whoever asks — the assertions below deliberately run under the PARENT's own context
        // (a school-less identity that can see none of these rows) to prove the check does not depend on RLS
        // visibility. A gate that leaned on the caller's session would return false on the first line.
        Assert.True(await Reader().HasActiveParentLinkAsync(Ctx(parent), student, parent));
        Assert.False(await Reader().HasActiveParentLinkAsync(Ctx(inactiveParent), student, inactiveParent));
        Assert.False(await Reader().HasActiveParentLinkAsync(Ctx(pendingParent), student, pendingParent));
        Assert.False(await Reader().HasActiveParentLinkAsync(Ctx(strangerParent), student, strangerParent));
    }

    [Fact]
    public async Task ListActiveScores_returns_full_rows_filtered_ordered_with_isoZ_and_jsonb()
    {
        var user = NewUser();
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedFullScoreAsync(conn, user, "SAT", new DateTime(2025, 3, 1), satTotal: 1400, subScores: """{"essay":7}""");
        await SeedFullScoreAsync(conn, user, "ACT", new DateTime(2024, 3, 1), satTotal: null, subScores: null);
        await SeedFullScoreAsync(conn, user, "SAT", new DateTime(2023, 3, 1), satTotal: 1300, subScores: null, isActive: false); // excluded

        var all = await Reader().ListActiveScoresAsync(Ctx(user), user, testType: null);
        Assert.Equal(2, all.Count);
        Assert.Equal("SAT", all[0].TestType);                    // testDate DESC -> 2025 first
        Assert.Equal("2025-03-01T00:00:00.000Z", all[0].TestDate); // ISO-Z
        Assert.Equal(7, all[0].SubScores.GetProperty("essay").GetInt32()); // jsonb passthrough
        Assert.True(all[0].IsOfficial);
        Assert.Equal(1400, all[0].SatTotal);

        // The ACT row stored a SQL-NULL subScores -> surfaces as a JSON-null element (not an object).
        Assert.Equal(JsonValueKind.Null, all[1].SubScores.ValueKind);

        var satOnly = await Reader().ListActiveScoresAsync(Ctx(user), user, testType: "SAT");
        Assert.Single(satOnly);
        Assert.Equal("SAT", satOnly[0].TestType);
    }

    [Fact]
    public async Task ListActiveScores_sorts_a_null_testDate_first_and_serializes_it_null()
    {
        // Prisma `orderBy: { testDate: "desc" }` -> Postgres DESC = NULLS FIRST: a null-testDate row outranks
        // a dated one, and testDate surfaces as null.
        var user = NewUser();
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedFullScoreAsync(conn, user, "SAT", new DateTime(2025, 3, 1), satTotal: 1400, subScores: null);
        await SeedFullScoreAsync(conn, user, "ACT", testDate: null, satTotal: null, subScores: null);

        var all = await Reader().ListActiveScoresAsync(Ctx(user), user, testType: null);

        Assert.Equal(2, all.Count);
        Assert.Equal("ACT", all[0].TestType);   // null testDate sorts first (NULLS FIRST)
        Assert.Null(all[0].TestDate);
    }

    [Fact]
    public async Task CollegeFit_orders_null_acceptance_rate_last_and_serializes_it_null()
    {
        // A university with SAT bands but NULL acceptanceRate is included (the WHERE only filters bands) and,
        // under Prisma's implicit `asc` (Postgres ASC = NULLS LAST), sorts AFTER any rated university.
        var user = NewUser();
        await using var conn = await _dataSource.OpenConnectionAsync();
        await SeedSatAsync(conn, user, math: 720, reading: 700); // superscore 1420
        await SeedUniversityAsync(conn, "Rated", rate: 0.20m, m25: 700, r25: 700, m75: 780, r75: 780);
        await SeedUniversityAsync(conn, "NullRate", rate: null, m25: 600, r25: 600, m75: 700, r75: 700);

        var result = await Reader().GetCollegeFitAsync(Ctx(user));

        Assert.Equal(new[] { "Rated", "NullRate" }, result.Colleges.Select(c => c.Name).ToArray()); // null rate LAST
        Assert.Null(result.Colleges[1].AcceptanceRate);          // Decimal NULL -> null
        Assert.Equal("safety", result.Colleges[1].Fit);          // sat75=1400 <= 1420, rate null -> not reach
    }

    // ---------------------------------------------------------------- helpers

    private TestScoreReader Reader() =>
        new(new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()));

    private static string NewUser() => "u-" + Guid.NewGuid().ToString("N");

    private static RequestContext Ctx(string userId) =>
        RequestContext.Authenticated(
            new RequestActor(userId, "counselor", $"{userId}@e.st", "Test User"),
            schoolId: null, permissions: Array.Empty<string>(),
            tokenSource: TokenSource.DevelopmentHeader, isDevelopmentOverride: true);

    private static async Task SeedSatAsync(NpgsqlConnection conn, string userId, int? math, int? reading)
    {
        await using var cmd = new NpgsqlCommand(
            """INSERT INTO "student_test_scores" ("id","userId","testType","satMath","satReading","isActive") VALUES (@id,@uid,'SAT',@m,@r,true)""", conn);
        cmd.Parameters.AddWithValue("id", Guid.NewGuid().ToString());
        cmd.Parameters.AddWithValue("uid", userId);
        cmd.Parameters.AddWithValue("m", (object?)math ?? DBNull.Value);
        cmd.Parameters.AddWithValue("r", (object?)reading ?? DBNull.Value);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task SeedActAsync(NpgsqlConnection conn, string userId, int? e, int? m, int? r, int? s)
    {
        await using var cmd = new NpgsqlCommand(
            """INSERT INTO "student_test_scores" ("id","userId","testType","actEnglish","actMath","actReading","actScience","isActive") VALUES (@id,@uid,'ACT',@e,@m,@r,@s,true)""", conn);
        cmd.Parameters.AddWithValue("id", Guid.NewGuid().ToString());
        cmd.Parameters.AddWithValue("uid", userId);
        cmd.Parameters.AddWithValue("e", (object?)e ?? DBNull.Value);
        cmd.Parameters.AddWithValue("m", (object?)m ?? DBNull.Value);
        cmd.Parameters.AddWithValue("r", (object?)r ?? DBNull.Value);
        cmd.Parameters.AddWithValue("s", (object?)s ?? DBNull.Value);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task SeedFullScoreAsync(
        NpgsqlConnection conn, string userId, string testType, DateTime? testDate, int? satTotal, string? subScores, bool isActive = true)
    {
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "student_test_scores" ("id","userId","testType","testDate","satTotal","subScores","isSuperScore","isOfficial","isActive")
            VALUES (@id,@uid,@type,@date,@sat,@sub::jsonb,false,true,@active)
            """, conn);
        cmd.Parameters.AddWithValue("id", Guid.NewGuid().ToString());
        cmd.Parameters.AddWithValue("uid", userId);
        cmd.Parameters.AddWithValue("type", testType);
        cmd.Parameters.AddWithValue("date", testDate is { } d ? DateTime.SpecifyKind(d, DateTimeKind.Unspecified) : (object)DBNull.Value);
        cmd.Parameters.AddWithValue("sat", (object?)satTotal ?? DBNull.Value);
        cmd.Parameters.AddWithValue("sub", (object?)subScores ?? DBNull.Value);
        cmd.Parameters.AddWithValue("active", isActive);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task SeedUniversityAsync(
        NpgsqlConnection conn, string name, decimal? rate, int? m25, int? r25, int? m75, int? r75)
    {
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "universities" ("id","name","city","state","acceptanceRate","satMath25","satReading25","satMath75","satReading75")
            VALUES (@id,@name,'Anytown','CA',@rate,@m25,@r25,@m75,@r75)
            """, conn);
        cmd.Parameters.AddWithValue("id", Guid.NewGuid().ToString());
        cmd.Parameters.AddWithValue("name", name);
        cmd.Parameters.AddWithValue("rate", (object?)rate ?? DBNull.Value);
        cmd.Parameters.AddWithValue("m25", (object?)m25 ?? DBNull.Value);
        cmd.Parameters.AddWithValue("r25", (object?)r25 ?? DBNull.Value);
        cmd.Parameters.AddWithValue("m75", (object?)m75 ?? DBNull.Value);
        cmd.Parameters.AddWithValue("r75", (object?)r75 ?? DBNull.Value);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task SeedAssignmentAsync(NpgsqlConnection conn, string counselorId, string studentId, bool active)
    {
        await using var cmd = new NpgsqlCommand(
            """INSERT INTO "counselor_student_assignments" ("id","counselorId","studentId","isActive") VALUES (@id,@c,@s,@a)""", conn);
        cmd.Parameters.AddWithValue("id", Guid.NewGuid().ToString());
        cmd.Parameters.AddWithValue("c", counselorId);
        cmd.Parameters.AddWithValue("s", studentId);
        cmd.Parameters.AddWithValue("a", active);
        await cmd.ExecuteNonQueryAsync();
    }

    // formmaps#121: parentUserId is the identity the gate and the RLS policies both name, so it is now seeded
    // explicitly. parentEmail is derived rather than passed — nothing authorizes on it any more, and leaving it as
    // the parameter invited tests that pass an email where a user id is meant.
    private static async Task SeedParentLinkAsync(
        NpgsqlConnection conn, string studentId, string parentUserId, bool active, bool accepted = true)
    {
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "student_parent_links" ("id","studentId","parentUserId","parentEmail","isActive","isAccepted")
            VALUES (@id,@s,@p,@e,@a,@acc)
            """, conn);
        cmd.Parameters.AddWithValue("id", Guid.NewGuid().ToString());
        cmd.Parameters.AddWithValue("s", studentId);
        cmd.Parameters.AddWithValue("p", parentUserId);
        cmd.Parameters.AddWithValue("e", $"{parentUserId}@example.test");
        cmd.Parameters.AddWithValue("a", active);
        cmd.Parameters.AddWithValue("acc", accepted);
        await cmd.ExecuteNonQueryAsync();
    }
}
