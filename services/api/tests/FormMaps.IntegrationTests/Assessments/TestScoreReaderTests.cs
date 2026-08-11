using System.Text.Json;
using FormMaps.Application.Auth;
using FormMaps.Infrastructure.Assessments;
using FormMaps.Infrastructure.Data;
using FormMaps.IntegrationTests.TestSupport.Rls;
using Npgsql;

namespace FormMaps.IntegrationTests.Assessments;

/// <summary>
/// Real-DB (Testcontainers) tests for <see cref="TestScoreReader"/> — the test-scores reads. Pins the SAT/ACT
/// superscore over real rows, college-fit (never-computed vs classified colleges ordered by acceptance with
/// Decimal-as-number), the counselor-assignment / parent-link checks, and the full-row list shape (ISO-Z
/// timestamps + subScores jsonb passthrough + testType filter).
///
/// <para>formmaps#125: the production RLS policies are live here and the reader runs as a NOSUPERUSER
/// NOBYPASSRLS login. That is what makes the two authorization gates below mean anything — the parent gate is
/// the line formmaps#121 actually shipped broken, and under the old superuser fixture a gate on the caller's
/// session and a gate on a system session produced identical results.</para>
/// </summary>
public sealed class TestScoreReaderTests : IClassFixture<TestScoreDatabaseFixture>, IAsyncLifetime
{
    private const string School = "school-1";

    private readonly TestScoreDatabaseFixture _fixture;

    /// <summary>Restricted login. Everything the reader touches goes through this.</summary>
    private NpgsqlDataSource _dataSource = null!;

    /// <summary>Container superuser: seeding and assertions only. An assertion made through the policies
    /// cannot tell "row absent" from "row invisible", which is how an isolation test passes vacuously.</summary>
    private NpgsqlDataSource _adminDataSource = null!;

    public TestScoreReaderTests(TestScoreDatabaseFixture fixture) => _fixture = fixture;

    public async Task InitializeAsync()
    {
        _dataSource = NpgsqlDataSource.Create(_fixture.AppConnectionString);
        _adminDataSource = NpgsqlDataSource.Create(_fixture.AdminConnectionString);
        await _fixture.TruncateAsync(
            "users", "student_test_scores", "universities", "counselor_student_assignments", "student_parent_links");
    }

    public async Task DisposeAsync()
    {
        await _dataSource.DisposeAsync();
        await _adminDataSource.DisposeAsync();
    }

    [Fact]
    public async Task Harness_runs_as_a_restricted_login_with_the_production_policies_live()
    {
        // Tripwire for the whole file. If this login ever regains SUPERUSER/BYPASSRLS, or the policy set
        // shrinks, every isolation assertion below silently stops meaning anything. NOTE the data source: this
        // must be the APP login, not the admin one. (It briefly was the admin one during this conversion, and
        // this assertion is what caught it — which is the entire argument for having it.)
        await using var conn = await _dataSource.OpenConnectionAsync();
        Assert.False(await ProductionRlsPolicies.BypassesRlsAsync(conn), "the app login must not bypass RLS");
        Assert.Equal<string>(
            ["counselor_student_assignments", "student_parent_links", "student_test_scores", "users"],
            _fixture.AppliedPolicyTables);

        // universities is a global catalog, unpolicied in production. Asserting it keeps that omission an
        // explicit decision rather than something nobody noticed.
        await using var unpolicied = new NpgsqlCommand(
            "SELECT relrowsecurity FROM pg_class WHERE relname = 'universities'", conn);
        Assert.False((bool)(await unpolicied.ExecuteScalarAsync())!);
    }

    [Fact]
    public async Task Superscore_takes_best_sections_across_active_rows()
    {
        var user = NewUser();
        await using var conn = await _adminDataSource.OpenConnectionAsync();
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
        await using var conn = await _adminDataSource.OpenConnectionAsync();
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
        await using var conn = await _adminDataSource.OpenConnectionAsync();

        // formmaps#125 forced these user rows and this schoolId to appear. The counselor gate reads
        // counselor_student_assignments on the CALLER's session, and 003-fk-users.sql admits a caller to an
        // assignment only if they are the student or share the student's school — so it needs a counselor whose
        // token actually carries a schoolId, which is what production mints for school staff. The old fixture let
        // this test pass with schoolId: null, i.e. with a caller whose real-world equivalent would have been
        // denied by the database. Parents, by contrast, are minted school-LESS, which is the whole of #121.
        await SeedUserAsync(conn, student, School);
        await SeedUserAsync(conn, counselor, School);
        foreach (var p in new[] { parent, inactiveParent, pendingParent, strangerParent })
        {
            await SeedUserAsync(conn, p, schoolId: null);
        }

        await SeedAssignmentAsync(conn, counselor, student, active: true);
        await SeedParentLinkAsync(conn, student, parent, active: true);
        await SeedParentLinkAsync(conn, student, inactiveParent, active: false);
        await SeedParentLinkAsync(conn, student, pendingParent, active: true, accepted: false);

        Assert.True(await Reader().HasActiveCounselorAssignmentAsync(Ctx(counselor, School), counselor, student));
        Assert.False(await Reader().HasActiveCounselorAssignmentAsync(Ctx(counselor, School), counselor, NewUser()));

        // formmaps#121. The gate matches parentUserId + isActive + isAccepted. These four assertions pin the
        // PREDICATE — accepted vs inactive vs pending vs stranger — and nothing more.
        //
        // They do NOT prove the gate is independent of RLS visibility, and an earlier version of this comment
        // claimed they did. Measured: reverting HasActiveParentLinkAsync's system session to the caller's
        // `context` leaves every line here green, because 009-parent-links.sql admits a parent to their own
        // link row anyway. So this is a test that passes whether or not that half of the fix is present —
        // disclosed rather than dressed up, because a comment asserting a guarantee the assertions do not
        // deliver is how a vacuous test survives review. See the note on
        // Parent_sees_only_their_own_link_row_and_none_of_the_childs_data below for why the two halves of
        // #121 are not symmetric, and what would actually pin this one (a caller who is NOT the parentUserId).
        Assert.True(await Reader().HasActiveParentLinkAsync(Ctx(parent), student, parent));
        Assert.False(await Reader().HasActiveParentLinkAsync(Ctx(inactiveParent), student, inactiveParent));
        Assert.False(await Reader().HasActiveParentLinkAsync(Ctx(pendingParent), student, pendingParent));
        Assert.False(await Reader().HasActiveParentLinkAsync(Ctx(strangerParent), student, strangerParent));
    }

    [Fact]
    public async Task Parent_sees_only_their_own_link_row_and_none_of_the_childs_data()
    {
        // What the policies actually do for a school-less parent, stated directly — and the reason the two
        // halves of #121 are NOT symmetric, which is worth writing down because it changes what a test can
        // prove about each:
        //
        //   * the LINK row is visible to the parent, and only theirs. 009-parent-links.sql (shipped 2026-08-10)
        //     added parent_own_links_select FOR SELECT USING parentUserId = me. So HasActiveParentLinkAsync
        //     would now give the same answer on the caller's session as on a system one — measured: reverting
        //     that line to `context` leaves this whole file green. Its system session is defence in depth
        //     against 009 being rolled back, not the thing holding the gate up today.
        //   * the CHILD's rows are NOT visible, and cannot be made visible: a users policy that sub-selected
        //     student_parent_links would be mutually recursive with that table's own policy and Postgres
        //     rejects it at execution time. So every read of child DATA has to be system-scoped in code, which
        //     is what ListActiveScores_of_a_child_* below pins.
        //
        // The two assertions are therefore each other's negative control: one row class visible, the other not,
        // for the same caller in the same session.
        var parent = NewUser();
        var otherParent = NewUser();
        var student = NewUser();
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await SeedUserAsync(conn, student, School);
        await SeedUserAsync(conn, parent, schoolId: null);
        await SeedUserAsync(conn, otherParent, schoolId: null);
        await SeedParentLinkAsync(conn, student, parent, active: true);
        await SeedParentLinkAsync(conn, student, otherParent, active: true);

        await using var identity = await OpenIdentitySessionAsync(parent, schoolId: null);

        Assert.Equal(2L, await CountAsync(conn, """SELECT count(*) FROM "student_parent_links" """));   // truly there
        Assert.Equal(1L, await CountAsync(identity, """SELECT count(*) FROM "student_parent_links" """)); // only mine
        Assert.Equal(0L, await CountAsync(identity, """SELECT count(*) FROM "users" WHERE "id" = @p""", student));

        Assert.True(await Reader().HasActiveParentLinkAsync(Ctx(parent), student, parent));
        Assert.False(await Reader().HasActiveParentLinkAsync(Ctx(NewUser()), student, NewUser()));
    }

    [Fact]
    public async Task ListActiveScores_of_a_child_is_empty_on_the_parents_session_and_populated_on_a_system_one()
    {
        // THE LOAD-BEARING HALF of formmaps#121 on this surface, and the one a fixture without RLS could not
        // express at all. TestScoreEndpoints reads the child's scores with
        // `readContext = readAsParent ? RequestContext.System() : context` — this test is why that ternary is
        // not optional. student_test_scores is admitted to the owner or the owner's school; a parent is
        // neither, so the same call on the parent's own context returns an empty list and the child's scores
        // page renders blank, with no error anywhere. Both halves are asserted against the SAME seeded row.
        var parent = NewUser();
        var student = NewUser();
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await SeedUserAsync(conn, student, School);
        await SeedUserAsync(conn, parent, schoolId: null);
        await SeedParentLinkAsync(conn, student, parent, active: true);
        await SeedFullScoreAsync(conn, student, "SAT", new DateTime(2025, 3, 1), satTotal: 1400, subScores: null);

        Assert.Empty(await Reader().ListActiveScoresAsync(Ctx(parent), student, testType: null));
        Assert.Single(await Reader().ListActiveScoresAsync(RequestContext.System(), student, testType: null));
    }

    [Fact]
    public async Task Counselor_assignment_gate_denies_an_unassigned_same_school_counselor()
    {
        // Exercises the gate where RLS cannot do its job for it. A second counselor in the SAME school is
        // admitted to the assignment row by the policy's school branch, so only the repository's
        // "counselorId" = @counselorId denies them. A different-school counselor is the RLS half.
        var assigned = NewUser();
        var unassignedSameSchool = NewUser();
        var otherSchoolCounselor = NewUser();
        var student = NewUser();
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await SeedUserAsync(conn, student, School);
        await SeedUserAsync(conn, assigned, School);
        await SeedUserAsync(conn, unassignedSameSchool, School);
        await SeedUserAsync(conn, otherSchoolCounselor, "school-2");
        await SeedAssignmentAsync(conn, assigned, student, active: true);

        // Control: the policy really does admit the row to the unassigned same-school counselor...
        await using (var identity = await OpenIdentitySessionAsync(unassignedSameSchool, School))
        {
            Assert.Equal(1L, await CountAsync(identity, """SELECT count(*) FROM "counselor_student_assignments" """));
        }

        // ...and only the app-layer predicate denies them.
        Assert.True(await Reader().HasActiveCounselorAssignmentAsync(Ctx(assigned, School), assigned, student));
        Assert.False(await Reader().HasActiveCounselorAssignmentAsync(
            Ctx(unassignedSameSchool, School), unassignedSameSchool, student));

        // A counselor from another school is denied twice over — the row is not even visible to them.
        await using (var identity = await OpenIdentitySessionAsync(otherSchoolCounselor, "school-2"))
        {
            Assert.Equal(0L, await CountAsync(identity, """SELECT count(*) FROM "counselor_student_assignments" """));
        }

        Assert.False(await Reader().HasActiveCounselorAssignmentAsync(
            Ctx(otherSchoolCounselor, "school-2"), otherSchoolCounselor, student));
    }

    [Fact]
    public async Task ListActiveScores_is_scoped_to_the_named_student_even_within_one_school()
    {
        // ListActiveScoresAsync reads on the CALLER's session and is authorized by the endpoint, not by itself.
        // For a school-scoped caller RLS admits every score in the school (003-fk-users.sql), so the "userId"
        // predicate is the entire scope — this is the case that would leak a whole school's scores if that
        // predicate were ever dropped, and it is invisible to a superuser fixture.
        var counselor = NewUser();
        var studentA = NewUser();
        var studentB = NewUser();
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await SeedUserAsync(conn, counselor, School);
        await SeedUserAsync(conn, studentA, School);
        await SeedUserAsync(conn, studentB, School);
        await SeedFullScoreAsync(conn, studentA, "SAT", new DateTime(2025, 3, 1), satTotal: 1400, subScores: null);
        await SeedFullScoreAsync(conn, studentB, "SAT", new DateTime(2025, 3, 1), satTotal: 1500, subScores: null);

        await using (var identity = await OpenIdentitySessionAsync(counselor, School))
        {
            Assert.Equal(2L, await CountAsync(identity, """SELECT count(*) FROM "student_test_scores" """));
        }

        var a = await Reader().ListActiveScoresAsync(Ctx(counselor, School), studentA, testType: null);
        Assert.Equal([1400], a.Select(r => r.SatTotal));
        var b = await Reader().ListActiveScoresAsync(Ctx(counselor, School), studentB, testType: null);
        Assert.Equal([1500], b.Select(r => r.SatTotal));
    }

    [Fact]
    public async Task ListActiveScores_returns_nothing_across_a_school_boundary()
    {
        // The RLS half. Nothing in ListActiveScoresAsync stops a caller naming any userId they like, so the
        // policy IS the control here — and this is the assertion that would have gone green for the wrong
        // reason under the old fixture, where the superuser saw everything and the WHERE clause hid it.
        var outsider = NewUser();
        var student = NewUser();
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await SeedUserAsync(conn, outsider, "school-2");
        await SeedUserAsync(conn, student, School);
        await SeedFullScoreAsync(conn, student, "SAT", new DateTime(2025, 3, 1), satTotal: 1400, subScores: null);

        Assert.Empty(await Reader().ListActiveScoresAsync(Ctx(outsider, "school-2"), student, testType: null));
        // Positive half, same query, same row, a caller the policy admits.
        Assert.Single(await Reader().ListActiveScoresAsync(Ctx(student, School), student, testType: null));
    }

    [Fact]
    public async Task ListActiveScores_returns_full_rows_filtered_ordered_with_isoZ_and_jsonb()
    {
        var user = NewUser();
        await using var conn = await _adminDataSource.OpenConnectionAsync();
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
        await using var conn = await _adminDataSource.OpenConnectionAsync();
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
        await using var conn = await _adminDataSource.OpenConnectionAsync();
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

    /// <summary>
    /// <paramref name="schoolId"/> defaults to null, which is what production mints for a PARENT
    /// (routes/parent.ts) and is the identity every #121 assertion depends on. School staff must pass one
    /// explicitly — under the live policies a school-less "counselor" is denied, so the default would quietly
    /// make a staff test assert the wrong thing.
    /// </summary>
    private static RequestContext Ctx(string userId, string? schoolId = null) =>
        RequestContext.Authenticated(
            new RequestActor(userId, "counselor", $"{userId}@e.st", "Test User"),
            schoolId, permissions: Array.Empty<string>(),
            tokenSource: TokenSource.DevelopmentHeader, isDevelopmentOverride: true);

    /// <summary>
    /// A raw connection on the restricted login carrying the same GUCs the session factory sets for an
    /// Identity-mode caller — used to state what the POLICIES do, independently of any repository. Session-level
    /// rather than transaction-local because there is no transaction; safe only because Npgsql sends
    /// <c>DISCARD ALL</c> when a pooled connection is returned.
    /// </summary>
    private async Task<NpgsqlConnection> OpenIdentitySessionAsync(string userId, string? schoolId)
    {
        var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand(
            "SELECT set_config('app.current_school_id', @s, false), set_config('app.current_user_id', @u, false)", conn);
        cmd.Parameters.AddWithValue("s", schoolId ?? string.Empty);
        cmd.Parameters.AddWithValue("u", userId);
        await cmd.ExecuteNonQueryAsync();
        return conn;
    }

    private static async Task<long> CountAsync(NpgsqlConnection conn, string sql, string? p = null)
    {
        await using var cmd = new NpgsqlCommand(sql, conn);
        if (p is not null)
        {
            cmd.Parameters.AddWithValue("p", p);
        }

        return (long)(await cmd.ExecuteScalarAsync())!;
    }

    private static async Task SeedUserAsync(NpgsqlConnection conn, string id, string? schoolId)
    {
        await using var cmd = new NpgsqlCommand(
            """INSERT INTO "users" ("id","name","email","schoolId") VALUES (@id,@id,@id || '@e.st',@s)""", conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("s", (object?)schoolId ?? DBNull.Value);
        await cmd.ExecuteNonQueryAsync();
    }

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
