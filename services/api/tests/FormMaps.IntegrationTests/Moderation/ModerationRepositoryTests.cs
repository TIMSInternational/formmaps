using System.Text.Json;
using FormMaps.Application.Moderation;
using FormMaps.Infrastructure.Data;
using FormMaps.Infrastructure.Moderation;
using FormMaps.IntegrationTests.TestSupport.Rls;
using Npgsql;

namespace FormMaps.IntegrationTests.Moderation;

/// <summary>
/// Real-Postgres behaviour of <see cref="ModerationRepository"/> (formmaps#63 — the port of
/// api/src/services/moderationService.ts). Pins the SQL against the legacy Prisma semantics it replaces:
/// the upsert, the soft-delete's row count, the queue's filters and ordering, and the three legacy audit
/// rows (UGC_REPORT / USER_BLOCK / USER_UNBLOCK) that the route wrote and that a port silently dropping
/// would leave an abuse investigation with nothing to start from (formmaps#84).
///
/// <para>Cross-tenant/eligibility behaviour is NOT here — it is in ModerationCrossTenantRlsTests, which
/// carries the sabotage record for the predicates that have no RLS backstop.</para>
/// </summary>
[Collection(ModerationDatabaseCollection.Name)]
public sealed class ModerationRepositoryTests : IAsyncLifetime
{
    private readonly ModerationDatabaseFixture _fixture;

    /// <summary>Restricted login (NOSUPERUSER NOBYPASSRLS) — the repository under test.</summary>
    private NpgsqlDataSource _dataSource = null!;

    /// <summary>Container superuser — seeding and row-state assertions only.</summary>
    private NpgsqlDataSource _adminDataSource = null!;

    public ModerationRepositoryTests(ModerationDatabaseFixture fixture) => _fixture = fixture;

    public async Task InitializeAsync()
    {
        _dataSource = NpgsqlDataSource.Create(_fixture.AppConnectionString);
        _adminDataSource = NpgsqlDataSource.Create(_fixture.AdminConnectionString);
        await _fixture.ResetAsync();
    }

    public async Task DisposeAsync()
    {
        await _dataSource.DisposeAsync();
        await _adminDataSource.DisposeAsync();
    }

    [Fact]
    public async Task Harness_runs_as_a_restricted_login_with_the_production_policies_live()
    {
        // NOTE the data source: the APP login, not the admin one (formmaps#125).
        await using var connection = await _dataSource.OpenConnectionAsync();
        Assert.False(await ProductionRlsPolicies.BypassesRlsAsync(connection), "the app login must not bypass RLS");

        // reports/user_blocks/audit_logs are absent from this list on purpose: production does not policy
        // them, so the endpoint predicates are the only tenant boundary this domain has.
        Assert.Equal<string>(["conversations", "messages", "users"], _fixture.AppliedPolicyTables);
    }

    // =====================================================================================
    // createReport (moderationService.ts:72) + the UGC_REPORT audit row (routes/moderation.ts:57)
    // =====================================================================================

    [Fact]
    public async Task Create_report_inserts_an_open_row_and_returns_id_and_status()
    {
        await using var admin = await _adminDataSource.OpenConnectionAsync();
        await _fixture.SeedUserAsync(admin, "reporter", "school-1");

        var created = await Repo().CreateReportAsync(
            ModerationDatabaseFixture.Ctx("reporter", "school-1"),
            "reporter", "message", "msg-1", "they were abusive", "reporter@test.dev", "203.0.113.9");

        Assert.False(string.IsNullOrWhiteSpace(created.Id));
        Assert.Equal("open", created.Status);

        await using var check = new NpgsqlCommand(
            """SELECT "reporterId","targetType","targetId","reason","status","isActive","createdBy" FROM "reports" WHERE "id"=@id""",
            admin);
        check.Parameters.AddWithValue("id", created.Id);
        await using var reader = await check.ExecuteReaderAsync();
        Assert.True(await reader.ReadAsync());
        Assert.Equal("reporter", reader.GetString(0));
        Assert.Equal("message", reader.GetString(1));
        Assert.Equal("msg-1", reader.GetString(2));
        Assert.Equal("they were abusive", reader.GetString(3));
        Assert.Equal("open", reader.GetString(4));
        Assert.True(reader.GetBoolean(5));
        Assert.Equal("reporter", reader.GetString(6)); // createdBy = reporterId (moderationService.ts:82)
    }

    [Fact]
    public async Task Create_report_writes_the_UGC_REPORT_audit_row_with_the_reason_truncated_to_200()
    {
        await using var admin = await _adminDataSource.OpenConnectionAsync();
        await _fixture.SeedUserAsync(admin, "reporter", "school-1");

        // 300 characters is a VALID reason (zod caps at 1000) — so the 200-char cut is the audit row's own,
        // from `body.data.reason.slice(0, 200)` at routes/moderation.ts:63, and nothing else enforces it.
        var reason = new string('x', 300);
        await Repo().CreateReportAsync(
            ModerationDatabaseFixture.Ctx("reporter", "school-1"),
            "reporter", "user", "target-1", reason, "reporter@test.dev", "203.0.113.9");

        var audit = await ReadSingleAuditAsync(admin);
        Assert.Equal("UGC_REPORT", audit.Action);
        // resourceType is the TARGET TYPE here, not the literal "User" the block routes use. Legacy quirk,
        // ported: routes/moderation.ts:61 passes body.data.targetType into the resourceType position.
        Assert.Equal("user", audit.ResourceType);
        Assert.Equal("target-1", audit.ResourceId);
        Assert.Equal("reporter", audit.ActorId);
        Assert.Equal("reporter@test.dev", audit.ActorEmail);
        Assert.Equal("203.0.113.9", audit.IpAddress);

        using var details = JsonDocument.Parse(audit.Details!);
        Assert.Equal(new string('x', 200), details.RootElement.GetProperty("reason").GetString());
    }

    // =====================================================================================
    // canReportTarget (moderationService.ts:91) — message / conversation branches
    //
    // HONEST LABEL for the three below: these branches run on the CALLER's Identity session, and
    // 005-sensitive's conversations/messages policies are participant-scoped, so the app predicate and the
    // policy deny the same rows. SABOTAGE RECORD: replacing the participant equality in
    // CanReportTargetAsync with `return true` leaves all three GREEN (measured). They pin the ported
    // behaviour; they are NOT evidence about the predicate. The predicate evidence in this port is the
    // canModerateUser set in ModerationCrossTenantRlsTests, which runs on a bypass session where RLS
    // contributes nothing at all.
    // =====================================================================================

    [Fact]
    public async Task Can_report_target_message_requires_the_reporter_to_be_a_participant()
    {
        await using var admin = await _adminDataSource.OpenConnectionAsync();
        await _fixture.SeedUserAsync(admin, "a", "school-1");
        await _fixture.SeedUserAsync(admin, "b", "school-1");
        await _fixture.SeedUserAsync(admin, "bystander", "school-1");
        var conversationId = await _fixture.SeedConversationAsync(admin, "a", "b");
        var messageId = await _fixture.SeedMessageAsync(admin, conversationId, "b");

        Assert.True(await Repo().CanReportTargetAsync(Ctx("a"), "a", "message", messageId));
        Assert.True(await Repo().CanReportTargetAsync(Ctx("b"), "b", "message", messageId));
        Assert.False(await Repo().CanReportTargetAsync(Ctx("bystander"), "bystander", "message", messageId));
    }

    [Fact]
    public async Task Can_report_target_conversation_requires_the_reporter_to_be_a_participant()
    {
        await using var admin = await _adminDataSource.OpenConnectionAsync();
        await _fixture.SeedUserAsync(admin, "a", "school-1");
        await _fixture.SeedUserAsync(admin, "b", "school-1");
        await _fixture.SeedUserAsync(admin, "bystander", "school-1");
        var conversationId = await _fixture.SeedConversationAsync(admin, "a", "b");

        Assert.True(await Repo().CanReportTargetAsync(Ctx("a"), "a", "conversation", conversationId));
        Assert.False(await Repo().CanReportTargetAsync(Ctx("bystander"), "bystander", "conversation", conversationId));
    }

    [Fact]
    public async Task Can_report_target_is_false_for_an_unknown_message_or_conversation()
    {
        await using var admin = await _adminDataSource.OpenConnectionAsync();
        await _fixture.SeedUserAsync(admin, "a", "school-1");

        Assert.False(await Repo().CanReportTargetAsync(Ctx("a"), "a", "message", "no-such-message"));
        Assert.False(await Repo().CanReportTargetAsync(Ctx("a"), "a", "conversation", "no-such-conversation"));
    }

    // =====================================================================================
    // listOpenReports (moderationService.ts:124)
    // =====================================================================================

    [Fact]
    public async Task List_open_reports_excludes_non_open_and_soft_deleted_rows()
    {
        // The purest app-layer assertion in this file: "reports" is UNPOLICIED in production, so
        // `status = 'open' AND "isActive"` is the entire filter and RLS contributes nothing. SABOTAGE
        // RECORD: dropping either conjunct from ListOpenReportsAsync's WHERE turns this red (measured).
        await using var admin = await _adminDataSource.OpenConnectionAsync();
        await _fixture.SeedUserAsync(admin, "reporter", "school-1");
        var open = await _fixture.SeedReportAsync(admin, "reporter", At(3));
        await _fixture.SeedReportAsync(admin, "reporter", At(2), status: "reviewed");
        await _fixture.SeedReportAsync(admin, "reporter", At(1), isActive: false);

        var page = await Repo().ListOpenReportsAsync(Ctx("reporter", "school-1", "school_admin"), 1, 50, "school-1");

        Assert.Equal(1, page.Total);
        Assert.Equal([open], page.Reports.Select(r => r.Id));
    }

    [Fact]
    public async Task List_open_reports_orders_by_created_date_desc_and_paginates()
    {
        await using var admin = await _adminDataSource.OpenConnectionAsync();
        await _fixture.SeedUserAsync(admin, "reporter", "school-1");
        var oldest = await _fixture.SeedReportAsync(admin, "reporter", At(1));
        var middle = await _fixture.SeedReportAsync(admin, "reporter", At(2));
        var newest = await _fixture.SeedReportAsync(admin, "reporter", At(3));

        var context = Ctx("reporter", "school-1", "school_admin");

        var first = await Repo().ListOpenReportsAsync(context, 1, 2, "school-1");
        Assert.Equal(3, first.Total); // total counts the whole filtered set, not the page
        Assert.Equal([newest, middle], first.Reports.Select(r => r.Id));

        var second = await Repo().ListOpenReportsAsync(context, 2, 2, "school-1");
        Assert.Equal(3, second.Total);
        Assert.Equal([oldest], second.Reports.Select(r => r.Id));
    }

    [Fact]
    public async Task List_open_reports_carries_every_report_column_and_the_reporter_projection()
    {
        // Prisma's findMany+include returns the whole row; the route serialises it verbatim. If a column
        // stops round-tripping, the response shape changed and the flag flip is no longer neutral.
        await using var admin = await _adminDataSource.OpenConnectionAsync();
        await _fixture.SeedUserAsync(admin, "reporter", "school-1", name: "Reporty McReport");
        var id = await _fixture.SeedReportAsync(admin, "reporter", At(1), targetType: "conversation", targetId: "conv-9");

        var page = await Repo().ListOpenReportsAsync(Ctx("reporter", "school-1", "school_admin"), 1, 50, "school-1");
        var row = Assert.Single(page.Reports);

        Assert.Equal(id, row.Id);
        Assert.Equal("reporter", row.ReporterId);
        Assert.Equal("conversation", row.TargetType);
        Assert.Equal("conv-9", row.TargetId);
        Assert.Equal("because", row.Reason);
        Assert.Equal("open", row.Status);
        Assert.Null(row.ReviewedBy);
        Assert.Null(row.ReviewedAt);
        Assert.Null(row.Resolution);
        Assert.True(row.IsActive);
        Assert.Equal("reporter", row.CreatedBy);
        Assert.Equal(At(1), row.CreatedDate);
        Assert.Null(row.UpdatedBy);
        Assert.Equal("reporter", row.Reporter.Id);
        Assert.Equal("Reporty McReport", row.Reporter.Name);
        Assert.Equal("reporter@test.dev", row.Reporter.Email);
    }

    [Fact]
    public async Task List_open_reports_with_a_null_school_is_the_super_admin_every_school_case()
    {
        await using var admin = await _adminDataSource.OpenConnectionAsync();
        await _fixture.SeedUserAsync(admin, "r1", "school-1");
        await _fixture.SeedUserAsync(admin, "r2", "school-2");
        await _fixture.SeedUserAsync(admin, "r3", schoolId: null, role: "coach"); // school-less coach
        await _fixture.SeedReportAsync(admin, "r1", At(3));
        await _fixture.SeedReportAsync(admin, "r2", At(2));
        await _fixture.SeedReportAsync(admin, "r3", At(1));

        // A Super Admin context resolves to a BYPASS session (TenantGucPlanResolver), which is the only way
        // the school-less coach's report is reachable at all — the users policy admits neither branch for it.
        var page = await Repo().ListOpenReportsAsync(
            ModerationDatabaseFixture.Ctx("super", schoolId: null, role: "Super Admin"), 1, 50, schoolId: null);

        Assert.Equal(3, page.Total);
        Assert.Equal(["r1", "r2", "r3"], page.Reports.Select(r => r.ReporterId).OrderBy(x => x, StringComparer.Ordinal));
    }

    // =====================================================================================
    // blockUser / unblockUser (moderationService.ts:143,154) + their audit rows
    // =====================================================================================

    [Fact]
    public async Task Block_inserts_an_active_row_and_writes_the_USER_BLOCK_audit()
    {
        await using var admin = await _adminDataSource.OpenConnectionAsync();
        await _fixture.SeedUserAsync(admin, "blocker", "school-1");
        await _fixture.SeedUserAsync(admin, "target", "school-1");

        await Repo().BlockUserAsync(Ctx("blocker"), "blocker", "target", "blocker@test.dev", "198.51.100.4");

        Assert.True(await BlockIsActiveAsync(admin, "blocker", "target"));
        Assert.Equal("blocker", await ScalarAsync(admin, """SELECT "createdBy" FROM "user_blocks" WHERE "blockerId"='blocker'"""));

        var audit = await ReadSingleAuditAsync(admin);
        Assert.Equal("USER_BLOCK", audit.Action);
        Assert.Equal("User", audit.ResourceType);
        Assert.Equal("target", audit.ResourceId);
        Assert.Equal("198.51.100.4", audit.IpAddress);
        using var details = JsonDocument.Parse(audit.Details!);
        Assert.Equal("blocker", details.RootElement.GetProperty("blockerId").GetString());
    }

    [Fact]
    public async Task Block_is_idempotent_and_reactivates_a_cleared_block()
    {
        await using var admin = await _adminDataSource.OpenConnectionAsync();
        await _fixture.SeedUserAsync(admin, "blocker", "school-1");
        await _fixture.SeedUserAsync(admin, "target", "school-1");
        await _fixture.SeedBlockAsync(admin, "blocker", "target", isActive: false);

        await Repo().BlockUserAsync(Ctx("blocker"), "blocker", "target", "blocker@test.dev", "198.51.100.4");

        Assert.True(await BlockIsActiveAsync(admin, "blocker", "target"));
        Assert.Equal(1L, await CountAsync(admin, """SELECT count(*) FROM "user_blocks" WHERE "blockerId"='blocker'"""));
        // The upsert's UPDATE branch stamps updatedBy and leaves createdBy alone (moderationService.ts:147).
        Assert.Equal("blocker", await ScalarAsync(admin, """SELECT "updatedBy" FROM "user_blocks" WHERE "blockerId"='blocker'"""));
    }

    [Fact]
    public async Task Unblock_reports_whether_it_actually_cleared_anything()
    {
        await using var admin = await _adminDataSource.OpenConnectionAsync();
        await _fixture.SeedUserAsync(admin, "blocker", "school-1");
        await _fixture.SeedUserAsync(admin, "target", "school-1");
        await _fixture.SeedBlockAsync(admin, "blocker", "target");

        Assert.True(await Repo().UnblockUserAsync(Ctx("blocker"), "blocker", "target", "blocker@test.dev", "198.51.100.4"));
        Assert.False(await BlockIsActiveAsync(admin, "blocker", "target"));

        // Second call clears nothing. formmaps#80: both used to report success identically.
        Assert.False(await Repo().UnblockUserAsync(Ctx("blocker"), "blocker", "target", "blocker@test.dev", "198.51.100.4"));
        Assert.False(await Repo().UnblockUserAsync(Ctx("blocker"), "blocker", "never-blocked", "blocker@test.dev", "198.51.100.4"));
    }

    [Fact]
    public async Task Unblock_records_removed_in_the_audit_row_both_ways()
    {
        await using var admin = await _adminDataSource.OpenConnectionAsync();
        await _fixture.SeedUserAsync(admin, "blocker", "school-1");
        await _fixture.SeedUserAsync(admin, "target", "school-1");
        await _fixture.SeedBlockAsync(admin, "blocker", "target");

        await Repo().UnblockUserAsync(Ctx("blocker"), "blocker", "target", "blocker@test.dev", "198.51.100.4");
        await Repo().UnblockUserAsync(Ctx("blocker"), "blocker", "target", "blocker@test.dev", "198.51.100.4");

        var rows = await ReadAuditsAsync(admin);
        Assert.Equal(2, rows.Count);
        Assert.All(rows, r => Assert.Equal("USER_UNBLOCK", r.Action));
        Assert.All(rows, r => Assert.Equal("User", r.ResourceType));

        // "an unblock that cleared nothing is not the same event as one that lifted a real block"
        // (routes/moderation.ts:162). Without `removed` the trail cannot be replayed to a block state.
        var removedFlags = rows.Select(r => JsonDocument.Parse(r.Details!).RootElement.GetProperty("removed").GetBoolean()).ToList();
        Assert.Contains(true, removedFlags);
        Assert.Contains(false, removedFlags);
    }

    [Fact]
    public async Task Unblock_cannot_clear_a_block_row_that_belongs_to_another_user()
    {
        // user_blocks has NO production RLS policy, so `"blockerId" = @blockerId` is the ENTIRE ownership
        // check — nothing behind it. The shape below is the one that actually exercises it: the attacker
        // names the same VICTIM the owner blocked, so a WHERE that scopes only on "blockedId" would match
        // the owner's row and lift a real block. (The reverse-direction case, "b" blocked "a" and "a" tries
        // to clear it, does NOT exercise the check: the blockedId does not match either, so the row is
        // missed for the wrong reason. It is asserted second, as the weaker companion.)
        //
        // SABOTAGE RECORD: dropping `"blockerId" = @blockerId` from UnblockUserAsync's WHERE turns this
        // red (measured — and it stayed GREEN against the reverse-direction-only version, which is why
        // this test has the shape it has).
        await using var admin = await _adminDataSource.OpenConnectionAsync();
        await _fixture.SeedUserAsync(admin, "owner", "school-1");
        await _fixture.SeedUserAsync(admin, "victim", "school-1");
        await _fixture.SeedUserAsync(admin, "attacker", "school-1");
        await _fixture.SeedBlockAsync(admin, "owner", "victim");

        Assert.False(await Repo().UnblockUserAsync(Ctx("attacker"), "attacker", "victim", "attacker@test.dev", "198.51.100.4"));
        Assert.True(await BlockIsActiveAsync(admin, "owner", "victim"));

        // Reverse direction: being the blockED party does not let you clear the block against you.
        await _fixture.SeedBlockAsync(admin, "victim", "attacker");
        Assert.False(await Repo().UnblockUserAsync(Ctx("attacker"), "attacker", "victim", "attacker@test.dev", "198.51.100.4"));
        Assert.True(await BlockIsActiveAsync(admin, "victim", "attacker"));
    }

    // ---- helpers ----

    private ModerationRepository Repo() =>
        new(new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()));

    private static Application.Auth.RequestContext Ctx(string userId, string? schoolId = "school-1", string role = "student") =>
        ModerationDatabaseFixture.Ctx(userId, schoolId, role);

    private static DateTime At(int day) =>
        DateTime.SpecifyKind(new DateTime(2026, 3, day, 12, 0, 0), DateTimeKind.Unspecified);

    private static async Task<long> CountAsync(NpgsqlConnection connection, string sql)
    {
        await using var command = new NpgsqlCommand(sql, connection);
        return (long)(await command.ExecuteScalarAsync())!;
    }

    private static async Task<string?> ScalarAsync(NpgsqlConnection connection, string sql)
    {
        await using var command = new NpgsqlCommand(sql, connection);
        return await command.ExecuteScalarAsync() as string;
    }

    private static async Task<bool> BlockIsActiveAsync(NpgsqlConnection connection, string blockerId, string blockedId)
    {
        await using var command = new NpgsqlCommand(
            """SELECT "isActive" FROM "user_blocks" WHERE "blockerId"=@blocker AND "blockedId"=@blocked""", connection);
        command.Parameters.AddWithValue("blocker", blockerId);
        command.Parameters.AddWithValue("blocked", blockedId);
        return await command.ExecuteScalarAsync() is true;
    }

    private sealed record AuditRow(string ActorId, string ActorEmail, string Action, string ResourceType, string? ResourceId, string? Details, string? IpAddress);

    private static async Task<AuditRow> ReadSingleAuditAsync(NpgsqlConnection connection) =>
        Assert.Single(await ReadAuditsAsync(connection));

    private static async Task<IReadOnlyList<AuditRow>> ReadAuditsAsync(NpgsqlConnection connection)
    {
        await using var command = new NpgsqlCommand(
            """SELECT "actorId","actorEmail","action","resourceType","resourceId","details","ipAddress" FROM "audit_logs" ORDER BY "createdDate" ASC, "id" ASC""",
            connection);
        await using var reader = await command.ExecuteReaderAsync();
        var rows = new List<AuditRow>();
        while (await reader.ReadAsync())
        {
            rows.Add(new AuditRow(
                reader.GetString(0), reader.GetString(1), reader.GetString(2), reader.GetString(3),
                reader.IsDBNull(4) ? null : reader.GetString(4),
                reader.IsDBNull(5) ? null : reader.GetString(5),
                reader.IsDBNull(6) ? null : reader.GetString(6)));
        }
        return rows;
    }
}
