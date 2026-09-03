using FormMaps.Application.Auth;
using FormMaps.Application.Data;
using FormMaps.Domain.Auth;
using FormMaps.Infrastructure.Data;
using FormMaps.IntegrationTests.TestSupport.Rls;
using Npgsql;

namespace FormMaps.IntegrationTests.CareerFit;

/// <summary>
/// FM-CF-002. The only proof that <c>infra/aws/sql/careerfit-schema.sql</c> does what its header claims: two
/// tenant-scoped tables whose RLS behaves exactly like the platform's other student-data tables, applied verbatim
/// from the file that <c>formmaps-sql-apply.yml</c> will run, exercised through the REAL session factory as a
/// NOSUPERUSER NOBYPASSRLS login (formmaps#125).
/// </summary>
/// <remarks>
/// <para>
/// Every read goes through <see cref="NpgsqlFormMapsDatabaseSessionFactory"/> with a <see cref="RequestContext"/>,
/// so what is tested is the GUCs the service actually sets for each kind of caller (Identity / Bypass / Deny —
/// <see cref="TenantGucPlanResolver"/>), not a hand-set session. Seeding and every row-state assertion are on the
/// admin (superuser) connection: a policy-filtered assertion cannot distinguish "row absent" from "row invisible"
/// and passes for the wrong reason.
/// </para>
/// <para>
/// Every case has its negative control over the SAME seed: the caller who must see the row and the caller who must
/// not. Where the platform's policy admits more than the product's per-user rule does (a same-school classmate, an
/// unassigned same-school counselor), the test says so by name rather than asserting a denial the policy does not
/// make — the platform's design is "per-user authz stays in app code" (003-fk-users.sql), and pretending
/// otherwise here would be the exact kind of vacuous green formmaps#125 is about.
/// </para>
/// </remarks>
public sealed class CareerFitRlsTests : IClassFixture<CareerFitDatabaseFixture>, IAsyncLifetime
{
    private const string SchoolA = "school-a";
    private const string SchoolB = "school-b";

    private const string StudentA1 = "student-a1";
    private const string StudentA2 = "student-a2";           // classmate of A1, same school, no relationship
    private const string StudentB1 = "student-b1";
    private const string SoloStudent = "student-solo";       // no school at all (individual account)
    private const string CounselorA = "counselor-a";         // school A, ASSIGNED to A1
    private const string CounselorA2 = "counselor-a2";       // school A, NOT assigned to anyone
    private const string CounselorB = "counselor-b";         // school B, with a (wrong) assignment row to A1
    private const string AdminA = "admin-a";
    private const string AdminB = "admin-b";
    private const string ParentOfA1 = "parent-a1";           // no school, linked to A1 via student_parent_links
    private const string SuperAdmin = "super-admin";

    private static readonly Guid RunA1 = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid RunA2 = Guid.Parse("22222222-2222-2222-2222-222222222222");
    private static readonly Guid RunB1 = Guid.Parse("33333333-3333-3333-3333-333333333333");
    private static readonly Guid RunSolo = Guid.Parse("44444444-4444-4444-4444-444444444444");

    private static readonly string[] AllTables =
    [
        "careerfit_family_results", "careerfit_runs", "student_parent_links", "counselor_student_assignments",
        "users", "schools",
    ];

    private readonly CareerFitDatabaseFixture _fixture;

    /// <summary>Restricted login (NOSUPERUSER NOBYPASSRLS) — everything under test.</summary>
    private NpgsqlDataSource _dataSource = null!;

    /// <summary>Container superuser — seeding and row-state assertions only.</summary>
    private NpgsqlDataSource _adminDataSource = null!;

    public CareerFitRlsTests(CareerFitDatabaseFixture fixture) => _fixture = fixture;

    public async Task InitializeAsync()
    {
        _dataSource = NpgsqlDataSource.Create(_fixture.AppConnectionString);
        _adminDataSource = NpgsqlDataSource.Create(_fixture.AdminConnectionString);
        await _fixture.TruncateAsync(AllTables);
        await SeedAsync();
    }

    public async Task DisposeAsync()
    {
        await _dataSource.DisposeAsync();
        await _adminDataSource.DisposeAsync();
    }

    // ---- harness proof (formmaps#125) ----

    [Fact]
    public async Task Harness_runs_as_a_restricted_login_with_the_production_policies_live()
    {
        // NOTE the data source: the APP login, not the admin one. Every isolation claim below is conditional on this.
        await using (var conn = await _dataSource.OpenConnectionAsync())
        {
            Assert.False(await ProductionRlsPolicies.BypassesRlsAsync(conn), "the app login must not bypass RLS");
        }

        // What the VENDORED files applied — the platform tables only (pca_results joined the list with FM-CF-010's
        // source rows; the two session tables have no vendored policy). The CareerFit tables cannot appear here
        // (see the fixture remarks), which is exactly why the next assertion reads the catalog instead.
        Assert.Equal<string>(
            ["counselor_student_assignments", "pca_results", "student_parent_links", "users"],
            _fixture.AppliedPolicyTables);

        // What infra/aws/sql/careerfit-schema.sql applied: ENABLE + FORCE, one tenant_isolation policy per table,
        // with BOTH halves (USING and WITH CHECK) present. Enabled-but-not-forced would let the table owner bypass;
        // a USING-only policy would let any admitted session write rows it cannot read back.
        await using var admin = await _adminDataSource.OpenConnectionAsync();
        foreach (var table in new[] { "careerfit_runs", "careerfit_family_results" })
        {
            await using var posture = new NpgsqlCommand(
                """
                SELECT c.relrowsecurity, c.relforcerowsecurity,
                       (SELECT count(*) FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = c.relname),
                       (SELECT bool_and(p.qual IS NOT NULL AND p.with_check IS NOT NULL)
                          FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = c.relname),
                       (SELECT bool_and(p.policyname = 'tenant_isolation')
                          FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = c.relname)
                FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE n.nspname = 'public' AND c.relname = @table
                """, admin);
            posture.Parameters.AddWithValue("table", table);
            await using var reader = await posture.ExecuteReaderAsync();
            Assert.True(await reader.ReadAsync(), $"{table} does not exist — the production DDL was not applied");
            Assert.True(reader.GetBoolean(0), $"{table}: ENABLE ROW LEVEL SECURITY missing");
            Assert.True(reader.GetBoolean(1), $"{table}: FORCE ROW LEVEL SECURITY missing");
            Assert.Equal(1L, reader.GetInt64(2));
            Assert.True(reader.GetBoolean(3), $"{table}: policy must carry both USING and WITH CHECK");
            Assert.True(reader.GetBoolean(4), $"{table}: policy must be named tenant_isolation like every platform policy");
        }
    }

    [Fact]
    public async Task Production_ddl_is_idempotent_on_a_second_apply()
    {
        // The file's header says "safe to run multiple times", and apply.sh's audit trusts that claim. Apply it a
        // second time on a database where every object already exists, then prove nothing doubled or vanished and
        // the seed survived (a DROP TABLE hiding in a re-apply would take the rows with it).
        await using var admin = await _adminDataSource.OpenConnectionAsync();
        await using (var reapply = new NpgsqlCommand(CareerFitDatabaseFixture.LoadProductionDdl(), admin))
        {
            await reapply.ExecuteNonQueryAsync();
        }

        Assert.Equal(2L, await ScalarAsync(admin,
            "SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename LIKE 'careerfit_%'"));
        Assert.Equal(2L, await ScalarAsync(admin,
            """SELECT count(*) FROM pg_indexes WHERE tablename = 'careerfit_runs' AND indexname LIKE 'careerfit_runs_%_idx'"""));
        Assert.Equal(4L, await ScalarAsync(admin, """SELECT count(*) FROM "careerfit_runs" """));
        Assert.Equal(8L, await ScalarAsync(admin, """SELECT count(*) FROM "careerfit_family_results" """));
    }

    // ---- self ----

    [Fact]
    public async Task Student_reads_own_run_and_not_one_from_another_school_or_from_a_no_school_user()
    {
        var visible = await VisibleRunsAsync(Student(StudentA1, SchoolA));

        Assert.Contains(RunA1, visible);
        Assert.DoesNotContain(RunB1, visible);     // other school: neither branch matches
        Assert.DoesNotContain(RunSolo, visible);   // NULL schoolId row: only its owner and bypass can reach it

        // Negative control over the same seed, from the other side: B1 sees its own and not A1's.
        var fromB = await VisibleRunsAsync(Student(StudentB1, SchoolB));
        Assert.Contains(RunB1, fromB);
        Assert.DoesNotContain(RunA1, fromB);
    }

    [Fact]
    public async Task No_school_users_run_is_reachable_only_by_its_owner_and_by_bypass()
    {
        // The reason "schoolId" is nullable: individual students exist outside any tenant. Their rows must still be
        // theirs — and nobody else's, because the '' guard on the school branch stops a no-school session matching
        // anything and a NULL row column matches nothing.
        Assert.Equal(new[] { RunSolo }, await VisibleRunsAsync(Student(SoloStudent, schoolId: null)));

        Assert.DoesNotContain(RunSolo, await VisibleRunsAsync(SchoolAdmin(AdminA, SchoolA)));
        Assert.DoesNotContain(RunSolo, await VisibleRunsAsync(SchoolAdmin(AdminB, SchoolB)));
        Assert.Contains(RunSolo, await VisibleRunsAsync(SuperAdminContext()));
    }

    // ---- the school branch: who it admits, and who it does not ----

    [Fact]
    public async Task Assigned_counselor_reads_the_students_run()
    {
        var visible = await VisibleRunsAsync(Counselor(CounselorA, SchoolA));

        Assert.Contains(RunA1, visible);
        Assert.DoesNotContain(RunB1, visible);
    }

    [Fact]
    public async Task Same_school_caller_is_admitted_by_the_policy_so_the_endpoint_gate_is_not_optional()
    {
        // THE TRAP the conversion guide names. The platform's school branch admits every caller whose tenant is the
        // row's school — 003-fk-users.sql: "per-user authz stays in app code". No production policy branches on
        // counselor_student_assignments, and careerfit-schema.sql mirrors that so a counselor's access to a
        // CareerFit run is decided by the same rule as their access to the student's PCA session. This test states
        // the admission on real data so FM-CF-012's endpoints cannot assume the database will do their gate for
        // them; if this ever starts failing, the policy has diverged from the platform, not the other way round.
        var unassignedCounselor = await VisibleRunsAsync(Counselor(CounselorA2, SchoolA));
        Assert.Contains(RunA1, unassignedCounselor);

        var classmate = await VisibleRunsAsync(Student(StudentA2, SchoolA));
        Assert.Contains(RunA1, classmate);

        // And the negative control: the same callers are still denied across the school boundary.
        Assert.DoesNotContain(RunB1, unassignedCounselor);
        Assert.DoesNotContain(RunB1, classmate);
    }

    [Fact]
    public async Task Cross_school_counselor_sees_nothing_even_with_a_matching_assignment_row()
    {
        // The assignment row (CounselorB -> StudentA1) exists and would satisfy an app-layer "am I assigned?" check.
        // Only the policy denies here: CounselorB's tenant is school B, the run's is school A.
        var visible = await VisibleRunsAsync(Counselor(CounselorB, SchoolB));

        Assert.DoesNotContain(RunA1, visible);
        Assert.Equal(new[] { RunB1 }, visible);
    }

    [Fact]
    public async Task Same_school_admin_reads_and_other_school_admin_does_not()
    {
        Assert.Contains(RunA1, await VisibleRunsAsync(SchoolAdmin(AdminA, SchoolA)));

        var otherSchool = await VisibleRunsAsync(SchoolAdmin(AdminB, SchoolB));
        Assert.DoesNotContain(RunA1, otherSchool);
        Assert.DoesNotContain(RunA2, otherSchool);
        Assert.Equal(new[] { RunB1 }, otherSchool);
    }

    [Fact]
    public async Task Parent_is_not_admitted_even_when_linked()
    {
        // Parents are created with no schoolId and the CareerFit policy has no parent branch — the same position as
        // every other student-data table (009-parent-links.sql admits parents to the LINK row only). Stated here so
        // that a parent-portal surface for CareerFit is known to need runAsSystem plus its own link check, the
        // formmaps#121 lesson, rather than discovered as a blank page.
        Assert.Empty(await VisibleRunsAsync(Parent(ParentOfA1)));
    }

    // ---- bypass ----

    [Fact]
    public async Task Super_admin_and_system_see_every_run_through_bypass()
    {
        var all = new[] { RunA1, RunA2, RunB1, RunSolo }.OrderBy(g => g).ToArray();

        await using (var session = await Factory().OpenReadOnlyAsync(SuperAdminContext()))
        {
            // The session factory resolved the super-admin to Bypass, so this is the GUC path production takes.
            Assert.Equal(TenantGucPlanMode.Bypass, session.TenantGucPlan.Mode);
            Assert.Equal(all, await ReadRunIdsAsync(session));
        }

        await using (var session = await Factory().OpenReadOnlyAsync(RequestContext.System()))
        {
            Assert.Equal(TenantGucPlanMode.Bypass, session.TenantGucPlan.Mode);
            Assert.Equal(all, await ReadRunIdsAsync(session));
        }
    }

    [Fact]
    public async Task Anonymous_context_sees_nothing()
    {
        // Deny mode sets app.bypass_rls = 'off' and no user GUC at all: no branch can match.
        await using var session = await Factory().OpenReadOnlyAsync(RequestContext.Anonymous());
        Assert.Equal(TenantGucPlanMode.Deny, session.TenantGucPlan.Mode);
        Assert.Empty(await ReadRunIdsAsync(session));
        Assert.Equal(0L, await CountFamilyResultsAsync(session));
    }

    // ---- the child table inherits the run's isolation (004-fk-parent.sql idiom) ----

    [Fact]
    public async Task Family_results_are_visible_exactly_when_their_run_is()
    {
        // careerfit_family_results has no owner or school column; its policy is EXISTS(parent), and the parent's
        // policy filters that sub-select. Two families were seeded per run.
        await using (var session = await Factory().OpenReadOnlyAsync(SchoolAdmin(AdminB, SchoolB)))
        {
            Assert.Equal(2L, await CountFamilyResultsAsync(session));                       // RunB1's only
            Assert.Equal(0L, await CountFamilyResultsAsync(session, RunA1));
        }

        await using (var session = await Factory().OpenReadOnlyAsync(Student(StudentA1, SchoolA)))
        {
            Assert.Equal(4L, await CountFamilyResultsAsync(session));                       // RunA1 + RunA2 (school branch)
            Assert.Equal(2L, await CountFamilyResultsAsync(session, RunA1));
            Assert.Equal(0L, await CountFamilyResultsAsync(session, RunB1));
        }

        await using (var session = await Factory().OpenReadOnlyAsync(SuperAdminContext()))
        {
            Assert.Equal(8L, await CountFamilyResultsAsync(session));
        }
    }

    // ---- WITH CHECK: writes are scoped the same way as reads ----

    [Fact]
    public async Task Student_can_write_own_run_but_not_one_owned_by_a_student_of_another_school()
    {
        var factory = Factory();
        var ownRun = Guid.NewGuid();

        await using (var session = await factory.OpenWritableAsync(Student(StudentA1, SchoolA)))
        {
            Assert.Equal(1, await InsertRunAsync(session, ownRun, StudentA1, SchoolA));
            await session.CommitAsync();
        }

        await using (var admin = await _adminDataSource.OpenConnectionAsync())
        {
            Assert.Equal(1L, await ScalarAsync(admin, $"""SELECT count(*) FROM "careerfit_runs" WHERE "id" = '{ownRun}' """));
        }

        // Same login, same GUCs, a row whose owner AND school are both outside the caller's scope: WITH CHECK
        // rejects it. The SqlState is asserted so a missing GRANT (also 42501, but from a different subsystem) or a
        // typo cannot be mistaken for the policy doing its job — the message text is the disambiguator here.
        var foreignRun = Guid.NewGuid();
        await using (var session = await factory.OpenWritableAsync(Student(StudentA1, SchoolA)))
        {
            var ex = await Assert.ThrowsAsync<PostgresException>(() => InsertRunAsync(session, foreignRun, StudentB1, SchoolB));
            Assert.Equal(PostgresErrorCodes.InsufficientPrivilege, ex.SqlState);
            Assert.Contains("row-level security policy", ex.MessageText);
        }

        await using (var admin = await _adminDataSource.OpenConnectionAsync())
        {
            Assert.Equal(0L, await ScalarAsync(admin, $"""SELECT count(*) FROM "careerfit_runs" WHERE "id" = '{foreignRun}' """));
        }
    }

    [Fact]
    public async Task Family_result_cannot_be_written_under_a_run_the_caller_cannot_see()
    {
        // The nested policy's WITH CHECK: EXISTS(parent) is evaluated under the caller's session, so a child row for
        // an invisible run fails exactly like a read of it returns nothing.
        await using var session = await Factory().OpenWritableAsync(Student(StudentA1, SchoolA));

        var ex = await Assert.ThrowsAsync<PostgresException>(() => InsertFamilyResultAsync(session, RunB1, familyId: 9));
        Assert.Equal(PostgresErrorCodes.InsufficientPrivilege, ex.SqlState);
        Assert.Contains("row-level security policy", ex.MessageText);
    }

    // ---- shape guards the engine relies on ----

    [Theory]
    [InlineData("competency_gate", "INVALID")]
    [InlineData("careerfit360_confidence", "UNKNOWN")]
    [InlineData("convergence_level", "MAYBE")]
    public async Task Family_result_rejects_a_reference_value_the_engine_cannot_parse(string column, string value)
    {
        // The enum columns are constrained to CareerFitEnums.ToReferenceValue()'s exact strings. A row that
        // Parse*() would throw on must never be storable — the audit trail is only evidence if it round-trips.
        await using var admin = await _adminDataSource.OpenConnectionAsync();
        await using var insert = new NpgsqlCommand(FamilyResultInsertSql(overrideColumn: column), admin);
        insert.Parameters.AddWithValue("runId", RunA1);
        insert.Parameters.AddWithValue("familyId", (short)9);
        insert.Parameters.AddWithValue("override", value);

        var ex = await Assert.ThrowsAsync<PostgresException>(() => insert.ExecuteNonQueryAsync());
        Assert.Equal(PostgresErrorCodes.CheckViolation, ex.SqlState);
    }

    [Fact]
    public async Task Run_rejects_a_disc_graph_outside_the_three_tims_graphs_and_a_duplicate_family()
    {
        await using var admin = await _adminDataSource.OpenConnectionAsync();

        await using (var badGraph = new NpgsqlCommand(
            """
            INSERT INTO "careerfit_runs" ("userId", "schoolId", "rulesVersion", "discGraph", "inputs", "inputQuality")
            VALUES (@u, @s, '1.0.0-draft.1', 4, '{}'::jsonb, '{}'::jsonb)
            """, admin))
        {
            badGraph.Parameters.AddWithValue("u", StudentA1);
            badGraph.Parameters.AddWithValue("s", SchoolA);
            var ex = await Assert.ThrowsAsync<PostgresException>(() => badGraph.ExecuteNonQueryAsync());
            Assert.Equal(PostgresErrorCodes.CheckViolation, ex.SqlState);
        }

        // unique(runId, familyId): one row per family per run, so a second write of the same family is a bug, not
        // an update path (there is no update path — dotnet-service-role.sql section 4.7).
        await using (var duplicate = new NpgsqlCommand(FamilyResultInsertSql(), admin))
        {
            duplicate.Parameters.AddWithValue("runId", RunA1);
            duplicate.Parameters.AddWithValue("familyId", (short)1);
            var ex = await Assert.ThrowsAsync<PostgresException>(() => duplicate.ExecuteNonQueryAsync());
            Assert.Equal(PostgresErrorCodes.UniqueViolation, ex.SqlState);
        }
    }

    // ---- erasure ----

    [Fact]
    public async Task Hard_deleting_a_user_takes_their_runs_and_the_family_rows_under_them()
    {
        // GDPR erasure (formmaps#78) HARD-deletes the users row — legacy adminService.ts:458 does it under
        // runAsSystem + tenantGucOp, i.e. bypass — and a CareerFit run is derived data ABOUT that user: their
        // DISC profile, their MIL percentiles and their competency levels are all inside "inputs". So the run
        // must go with them. Before this test careerfit_runs."userId" had no ON DELETE action, which meant the
        // FIRST erasure of any student who had ever been evaluated failed with 23503 and left the erasure
        // half-done.
        await using var admin = await _adminDataSource.OpenConnectionAsync();
        Assert.Equal(2L, await ScalarAsync(admin, $"""SELECT count(*) FROM "careerfit_family_results" WHERE "runId" = '{RunA1}' """));

        await using (var erase = new NpgsqlCommand($"""DELETE FROM "users" WHERE "id" = '{StudentA1}' """, admin))
        {
            await erase.ExecuteNonQueryAsync();
        }

        // The run goes with the user, and its family rows go with the run (they already cascaded from "runId").
        Assert.Equal(0L, await ScalarAsync(admin, $"""SELECT count(*) FROM "careerfit_runs" WHERE "id" = '{RunA1}' """));
        Assert.Equal(0L, await ScalarAsync(admin, $"""SELECT count(*) FROM "careerfit_family_results" WHERE "runId" = '{RunA1}' """));

        // Nobody else's evidence moved: three runs and six family rows survive.
        Assert.Equal(3L, await ScalarAsync(admin, """SELECT count(*) FROM "careerfit_runs" """));
        Assert.Equal(6L, await ScalarAsync(admin, """SELECT count(*) FROM "careerfit_family_results" """));
    }

    [Fact]
    public async Task Deleting_a_school_is_still_refused_while_its_runs_exist()
    {
        // The counterpart decision, stated so the cascade above is not read as "CareerFit rows are disposable".
        // "schoolId" keeps its default NO ACTION: a school is not a data subject, erasing one is not a GDPR
        // right, and silently dropping every run of every student in it would destroy other people's evidence.
        await using var admin = await _adminDataSource.OpenConnectionAsync();
        await using var drop = new NpgsqlCommand($"""DELETE FROM "schools" WHERE "id" = '{SchoolA}' """, admin);

        var ex = await Assert.ThrowsAsync<PostgresException>(() => drop.ExecuteNonQueryAsync());
        Assert.Equal(PostgresErrorCodes.ForeignKeyViolation, ex.SqlState);
    }

    [Fact]
    public async Task Re_applying_the_ddl_upgrades_a_pre_erasure_foreign_key_and_then_leaves_it_alone()
    {
        // The case the guarded ALTER exists for: a database created BEFORE the erasure decision carries the
        // constraint with the default NO ACTION, and CREATE TABLE IF NOT EXISTS cannot change it. Put the
        // schema back into exactly that state, re-apply the production file, and the constraint is upgraded.
        // Then re-apply AGAIN: the guard sees confdeltype 'c' and does nothing, which is what keeps the file's
        // "safe to run multiple times" header claim true of a drop-and-re-add block.
        await using var admin = await _adminDataSource.OpenConnectionAsync();
        await ExecAsync(admin,
            """
            ALTER TABLE "careerfit_runs" DROP CONSTRAINT "careerfit_runs_userId_fkey";
            ALTER TABLE "careerfit_runs" ADD CONSTRAINT "careerfit_runs_userId_fkey"
                FOREIGN KEY ("userId") REFERENCES "users" ("id");
            """);
        Assert.Equal("a", await UserIdDeleteActionAsync(admin));      // 'a' = NO ACTION, the pre-decision state

        await ExecAsync(admin, CareerFitDatabaseFixture.LoadProductionDdl());
        Assert.Equal("c", await UserIdDeleteActionAsync(admin));      // 'c' = CASCADE

        await ExecAsync(admin, CareerFitDatabaseFixture.LoadProductionDdl());
        Assert.Equal("c", await UserIdDeleteActionAsync(admin));
        Assert.Equal(1L, await ScalarAsync(admin,
            """
            SELECT count(*) FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
            WHERE t.relname = 'careerfit_runs' AND c.contype = 'f' AND c.confrelid = '"users"'::regclass
            """));
    }

    // ---- contexts ----

    private static RequestContext Student(string userId, string? schoolId) => Ctx(userId, FormMapsRoles.Student, schoolId);

    private static RequestContext Counselor(string userId, string schoolId) => Ctx(userId, FormMapsRoles.Counselor, schoolId);

    private static RequestContext SchoolAdmin(string userId, string schoolId) => Ctx(userId, FormMapsRoles.SchoolAdmin, schoolId);

    private static RequestContext Parent(string userId) => Ctx(userId, FormMapsRoles.Parent, schoolId: null);

    /// <summary>Super admins are minted without a school; TenantGucPlanResolver turns the role into Bypass regardless.</summary>
    private static RequestContext SuperAdminContext() => Ctx(SuperAdmin, FormMapsRoles.SuperAdmin, schoolId: null);

    private static RequestContext Ctx(string userId, string role, string? schoolId) =>
        RequestContext.Authenticated(
            new RequestActor(userId, role, $"{userId}@e.st", userId),
            schoolId, permissions: [],
            tokenSource: TokenSource.DevelopmentHeader, isDevelopmentOverride: true);

    // ---- helpers ----

    private IFormMapsDatabaseSessionFactory Factory() =>
        new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier());

    private async Task<Guid[]> VisibleRunsAsync(RequestContext context)
    {
        await using var session = await Factory().OpenReadOnlyAsync(context);
        return await ReadRunIdsAsync(session);
    }

    private static async Task<Guid[]> ReadRunIdsAsync(FormMapsDatabaseSession session)
    {
        var command = session.Connection.CreateCommand();
        command.Transaction = session.Transaction;
        command.CommandText = """SELECT "id" FROM "careerfit_runs" """;
        var ids = new List<Guid>();
        await using var reader = await command.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            ids.Add(reader.GetGuid(0));
        }

        // Sorted on the .NET side: Postgres orders uuid bytewise, System.Guid by component, and the two disagree
        // for arbitrary values. Callers compare against .NET-sorted expectations.
        return ids.OrderBy(g => g).ToArray();
    }

    private static async Task<long> CountFamilyResultsAsync(FormMapsDatabaseSession session, Guid? runId = null)
    {
        var command = (NpgsqlCommand)session.Connection.CreateCommand();
        command.Transaction = (NpgsqlTransaction)session.Transaction;
        command.CommandText = runId is null
            ? """SELECT count(*) FROM "careerfit_family_results" """
            : """SELECT count(*) FROM "careerfit_family_results" WHERE "runId" = @runId""";
        if (runId is not null)
        {
            command.Parameters.AddWithValue("runId", runId.Value);
        }

        return (long)(await command.ExecuteScalarAsync())!;
    }

    private static async Task<int> InsertRunAsync(FormMapsDatabaseSession session, Guid id, string userId, string? schoolId)
    {
        var command = (NpgsqlCommand)session.Connection.CreateCommand();
        command.Transaction = (NpgsqlTransaction)session.Transaction;
        command.CommandText =
            """
            INSERT INTO "careerfit_runs" ("id", "userId", "schoolId", "rulesVersion", "discGraph", "inputs", "inputQuality")
            VALUES (@id, @userId, @schoolId, '1.0.0-draft.1', 2, '{"pca":{}}'::jsonb, '{"coverage":1}'::jsonb)
            """;
        command.Parameters.AddWithValue("id", id);
        command.Parameters.AddWithValue("userId", userId);
        command.Parameters.AddWithValue("schoolId", (object?)schoolId ?? DBNull.Value);
        return await command.ExecuteNonQueryAsync();
    }

    private static async Task<int> InsertFamilyResultAsync(FormMapsDatabaseSession session, Guid runId, short familyId)
    {
        var command = (NpgsqlCommand)session.Connection.CreateCommand();
        command.Transaction = (NpgsqlTransaction)session.Transaction;
        command.CommandText = FamilyResultInsertSql();
        command.Parameters.AddWithValue("runId", runId);
        command.Parameters.AddWithValue("familyId", familyId);
        return await command.ExecuteNonQueryAsync();
    }

    /// <summary>
    /// A complete, valid family row (every NOT NULL column, every enum at a reference value). With
    /// <paramref name="overrideColumn"/> set, that one column takes the <c>@override</c> parameter instead so a
    /// CHECK can be poked without rewriting the statement.
    /// </summary>
    private static string FamilyResultInsertSql(string? overrideColumn = null)
    {
        var values = new Dictionary<string, string>
        {
            ["pca_route_fit"] = "71.5",
            ["pca_winning_route"] = "'DIRECTOR'",
            ["competency_fit"] = "88.0",
            ["competency_gate"] = "'SATISFIED'",
            ["pca_index"] = "78.1",
            ["mil_fit"] = "63.2",
            ["mil_gate"] = "'CONDITIONED'",
            ["personality_fit"] = "70.0",
            ["personality_winning_route"] = "'ENTJ_LIKE'",
            ["careerfit360"] = "66.6",
            ["careerfit360_consensus"] = "NULL",
            ["careerfit360_confidence"] = "'NOT_DETERMINABLE'",
            ["final_gate"] = "'CONDITIONED'",
            ["convergence_level"] = "'PARTIAL'",
            ["careerfit_absolute"] = "69.4",
            ["careerfit_relative"] = "NULL",
            ["rank_position"] = "NULL",
            ["audit"] = "'{\"audit_inputs\":{},\"convergence_detail\":{},\"critical_gaps\":[]}'::jsonb",
        };
        if (overrideColumn is not null)
        {
            values[overrideColumn] = "@override";
        }

        var columns = string.Join(", ", values.Keys.Select(k => $"\"{k}\""));
        return $"""
            INSERT INTO "careerfit_family_results" ("runId", "familyId", {columns})
            VALUES (@runId, @familyId, {string.Join(", ", values.Values)})
            """;
    }

    /// <summary>pg_constraint.confdeltype for careerfit_runs."userId": 'a' = NO ACTION, 'c' = CASCADE.</summary>
    private static async Task<string> UserIdDeleteActionAsync(NpgsqlConnection connection)
    {
        await using var command = new NpgsqlCommand(
            """
            SELECT c.confdeltype::text FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
            WHERE t.relname = 'careerfit_runs' AND c.contype = 'f' AND c.confrelid = '"users"'::regclass
            """, connection);
        return (string)(await command.ExecuteScalarAsync())!;
    }

    private static async Task ExecAsync(NpgsqlConnection connection, string sql)
    {
        await using var command = new NpgsqlCommand(sql, connection);
        await command.ExecuteNonQueryAsync();
    }

    private static async Task<long> ScalarAsync(NpgsqlConnection connection, string sql)
    {
        await using var command = new NpgsqlCommand(sql, connection);
        return (long)(await command.ExecuteScalarAsync())!;
    }

    private async Task SeedAsync()
    {
        await using var admin = await _adminDataSource.OpenConnectionAsync();
        await using var seed = new NpgsqlCommand(
            $$"""
            INSERT INTO "schools" ("id", "name") VALUES ('{{SchoolA}}', 'School A'), ('{{SchoolB}}', 'School B');

            INSERT INTO "users" ("id", "email", "schoolId") VALUES
                ('{{StudentA1}}',   '{{StudentA1}}@e.st',   '{{SchoolA}}'),
                ('{{StudentA2}}',   '{{StudentA2}}@e.st',   '{{SchoolA}}'),
                ('{{StudentB1}}',   '{{StudentB1}}@e.st',   '{{SchoolB}}'),
                ('{{SoloStudent}}', '{{SoloStudent}}@e.st', NULL),
                ('{{CounselorA}}',  '{{CounselorA}}@e.st',  '{{SchoolA}}'),
                ('{{CounselorA2}}', '{{CounselorA2}}@e.st', '{{SchoolA}}'),
                ('{{CounselorB}}',  '{{CounselorB}}@e.st',  '{{SchoolB}}'),
                ('{{AdminA}}',      '{{AdminA}}@e.st',      '{{SchoolA}}'),
                ('{{AdminB}}',      '{{AdminB}}@e.st',      '{{SchoolB}}'),
                ('{{ParentOfA1}}',  '{{ParentOfA1}}@e.st',  NULL),
                ('{{SuperAdmin}}',  '{{SuperAdmin}}@e.st',  NULL);

            INSERT INTO "counselor_student_assignments" ("id", "counselorId", "studentId") VALUES
                ('csa-a', '{{CounselorA}}', '{{StudentA1}}'),
                ('csa-b', '{{CounselorB}}', '{{StudentA1}}');   -- cross-school: the row exists, the policy must still deny

            INSERT INTO "student_parent_links" ("id", "studentId", "parentEmail", "parentUserId") VALUES
                ('spl-a1', '{{StudentA1}}', '{{ParentOfA1}}@e.st', '{{ParentOfA1}}');

            INSERT INTO "careerfit_runs" ("id", "userId", "schoolId", "rulesVersion", "discGraph", "inputs", "inputQuality") VALUES
                ('{{RunA1}}',   '{{StudentA1}}',   '{{SchoolA}}', '1.0.0-draft.1', 2, '{"pca":"snapshot"}'::jsonb, '{"coverage":1}'::jsonb),
                ('{{RunA2}}',   '{{StudentA2}}',   '{{SchoolA}}', '1.0.0-draft.1', 2, '{"pca":"snapshot"}'::jsonb, '{"coverage":1}'::jsonb),
                ('{{RunB1}}',   '{{StudentB1}}',   '{{SchoolB}}', '1.0.0-draft.1', 2, '{"pca":"snapshot"}'::jsonb, '{"coverage":1}'::jsonb),
                ('{{RunSolo}}', '{{SoloStudent}}', NULL,        '1.0.0-draft.1', 1, '{"pca":"snapshot"}'::jsonb, '{"coverage":1}'::jsonb);
            """, admin);
        await seed.ExecuteNonQueryAsync();

        foreach (var run in new[] { RunA1, RunA2, RunB1, RunSolo })
        {
            foreach (var familyId in new short[] { 1, 2 })
            {
                await using var family = new NpgsqlCommand(FamilyResultInsertSql(), admin);
                family.Parameters.AddWithValue("runId", run);
                family.Parameters.AddWithValue("familyId", familyId);
                await family.ExecuteNonQueryAsync();
            }
        }
    }
}
