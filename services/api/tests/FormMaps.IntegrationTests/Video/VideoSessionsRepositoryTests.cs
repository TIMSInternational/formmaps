using FormMaps.Application.Auth;
using FormMaps.Application.Video;
using FormMaps.Infrastructure.Data;
using FormMaps.Infrastructure.Video;
using FormMaps.IntegrationTests.TestSupport.Rls;
using Npgsql;

namespace FormMaps.IntegrationTests.Video;

public sealed class VideoSessionsRepositoryTests : IClassFixture<VideoSessionsRepositoryTests.Fixture>, IAsyncLifetime
{
    private readonly Fixture _fixture;

    /// <summary>Restricted login (NOSUPERUSER NOBYPASSRLS) — the repository under test.</summary>
    private NpgsqlDataSource _dataSource = null!;

    /// <summary>Container superuser — seeding and row-state assertions only.</summary>
    private NpgsqlDataSource _adminDataSource = null!;

    public VideoSessionsRepositoryTests(Fixture fixture) => _fixture = fixture;

    public async Task InitializeAsync()
    {
        _dataSource = NpgsqlDataSource.Create(_fixture.AppConnectionString);
        _adminDataSource = NpgsqlDataSource.Create(_fixture.AdminConnectionString);
        await _fixture.TruncateAsync("users", "counselor_sessions", "schools", "counselor_student_assignments");
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
        await using var conn = await _dataSource.OpenConnectionAsync();
        Assert.False(await ProductionRlsPolicies.BypassesRlsAsync(conn), "the app login must not bypass RLS");
        Assert.Equal<string>(["counselor_sessions", "counselor_student_assignments", "users"], _fixture.AppliedPolicyTables);
    }

    [Fact]
    public async Task IsVideoEnabled_true_false_and_missing_school()
    {
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await School(conn, "s-on", videoEnabled: true);
        await School(conn, "s-off", videoEnabled: false);

        Assert.True(await Repo().IsVideoEnabledForSchoolAsync(Ctx(), "s-on"));
        Assert.False(await Repo().IsVideoEnabledForSchoolAsync(Ctx(), "s-off"));
        Assert.False(await Repo().IsVideoEnabledForSchoolAsync(Ctx(), "missing"));
    }

    [Fact]
    public async Task ListForUser_scopes_either_role_video_call_only_desc_take_50()
    {
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await User(conn, "u1", "Me"); await User(conn, "s1", "Alice"); await User(conn, "c1", "Coach");
        await Session(conn, "as-counselor", "u1", "s1", start: new DateTime(2026, 7, 1));
        await Session(conn, "as-student", "c1", "u1", start: new DateTime(2026, 7, 10));
        await Session(conn, "not-video", "u1", "s1", topic: "Coaching Session");
        await Session(conn, "no-link", "u1", "s1", meetingLink: "");

        var rows = await Repo().ListForUserAsync(Ctx(), "u1");

        Assert.Equal(["as-student", "as-counselor"], rows.Select(r => r.Id)); // startTime DESC
    }

    [Fact]
    public async Task GetById_has_no_topic_filter_and_joins_both_names()
    {
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await User(conn, "c1", "Coach"); await User(conn, "s1", "Alice");
        await Session(conn, "any-topic", "c1", "s1", topic: "Coaching Session");

        var row = await Repo().GetByIdAsync(Ctx(), "any-topic");

        Assert.NotNull(row);
        Assert.Equal("Coach", row!.CounselorName);
        Assert.Equal("Alice", row.StudentName);
    }

    [Fact]
    public async Task FindByRoomName_requires_video_call_topic()
    {
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await User(conn, "c1", "Coach"); await User(conn, "s1", "Alice");
        await Session(conn, "vc", "c1", "s1", meetingLink: "room-x", topic: "Video Call");
        await Session(conn, "other", "c1", "s1", meetingLink: "room-y", topic: "Coaching Session");

        Assert.Equal("vc", (await Repo().FindByRoomNameAsync(Ctx(), "room-x"))!.Id);
        Assert.Null(await Repo().FindByRoomNameAsync(Ctx(), "room-y"));
    }

    [Fact]
    public async Task FindByRoomName_ambiguous_meetingLink_returns_null_not_an_arbitrary_row()
    {
        // meetingLink has no uniqueness guarantee. If two distinct sessions collide on the same room name,
        // FindByRoomNameAsync must refuse (null) rather than silently pick one — picking one would let
        // POST /signature authorize the caller against the wrong session's participants.
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await User(conn, "c1", "Coach"); await User(conn, "s1", "Alice");
        await User(conn, "c2", "OtherCoach"); await User(conn, "s2", "Bob");
        await Session(conn, "vc-a", "c1", "s1", meetingLink: "room-collide", topic: "Video Call");
        await Session(conn, "vc-b", "c2", "s2", meetingLink: "room-collide", topic: "Video Call");

        Assert.Null(await Repo().FindByRoomNameAsync(Ctx(), "room-collide"));
    }

    [Fact]
    public async Task Create_stamps_video_active_1hr_window_and_random_link()
    {
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await User(conn, "c1", "Coach"); await User(conn, "s1", "Alice");

        var created = await Repo().CreateAsync(Ctx(), "c1", "s1");

        Assert.StartsWith("formmaps-", created.SessionName);
        Assert.Equal(16 + "formmaps-".Length, created.SessionName.Length); // 8 bytes → 16 hex chars

        var row = await Repo().GetByIdAsync(Ctx(), created.Id);
        Assert.Equal("video_active", row!.Status);
        Assert.Equal("Video Call", row.Topic);
    }

    [Fact]
    public async Task End_not_found_forbidden_then_ok()
    {
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await User(conn, "c1", "Coach"); await User(conn, "s1", "Alice");
        await Session(conn, "sess", "c1", "s1", status: "video_active");

        Assert.Equal(SessionMutationOutcomeKind.NotFound, await Repo().EndAsync(Ctx(), "nope", "c1"));
        Assert.Equal(SessionMutationOutcomeKind.Forbidden, await Repo().EndAsync(Ctx(), "sess", "stranger"));
        Assert.Equal(SessionMutationOutcomeKind.Ok, await Repo().EndAsync(Ctx(), "sess", "c1"));

        var row = await Repo().GetByIdAsync(Ctx(), "sess");
        Assert.Equal("completed", row!.Status);
        Assert.NotNull(row.CompletedAt);
    }

    [Fact]
    public async Task Start_not_found_forbidden_not_scheduled_then_ok()
    {
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await User(conn, "c1", "Coach"); await User(conn, "s1", "Alice");
        await Session(conn, "sess", "c1", "s1", status: "scheduled", meetingLink: "room-z");
        await Session(conn, "active", "c1", "s1", status: "video_active");

        Assert.Equal(SessionMutationOutcomeKind.NotFound, (await Repo().StartAsync(Ctx(), "nope", "c1")).Kind);
        Assert.Equal(SessionMutationOutcomeKind.Forbidden, (await Repo().StartAsync(Ctx(), "sess", "stranger")).Kind);
        Assert.Equal(SessionMutationOutcomeKind.NotScheduled, (await Repo().StartAsync(Ctx(), "active", "c1")).Kind);

        var (kind, sessionName) = await Repo().StartAsync(Ctx(), "sess", "c1");
        Assert.Equal(SessionMutationOutcomeKind.Ok, kind);
        Assert.Equal("room-z", sessionName);
        Assert.Equal("video_active", (await Repo().GetByIdAsync(Ctx(), "sess"))!.Status);
    }

    [Fact]
    public async Task FindParticipantCandidate_and_assignment_check()
    {
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await User(conn, "s1", "Alice");
        await Assignment(conn, "c1", "s1", isActive: true);

        var candidate = await Repo().FindParticipantCandidateAsync(Ctx(), "s1");
        Assert.Equal("Alice", candidate!.Name);
        Assert.Null(await Repo().FindParticipantCandidateAsync(Ctx(), "missing"));

        Assert.True(await Repo().HasActiveCounselorAssignmentAsync(Ctx(), "c1", "s1"));
        Assert.False(await Repo().HasActiveCounselorAssignmentAsync(Ctx(), "c1", "someone-else"));
    }

    [Fact]
    public async Task FindParticipantCandidate_returns_a_deactivated_student_whose_assignment_is_active()
    {
        // Legacy parity (routes/video.ts:212-215): the participant lookup is a bare
        // prisma.user.findUnique({ where: { id } }) — users."isActive" is never consulted. The only isActive
        // gate on this route is on the counselor-student ASSIGNMENT (:232), so a since-deactivated student with
        // a live assignment is still callable. Same divergence class messaging reverted in formmaps#40.
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await User(conn, "s-deactivated", "Alice", isActive: false);
        await Assignment(conn, "c1", "s-deactivated", isActive: true);

        var candidate = await Repo().FindParticipantCandidateAsync(Ctx(), "s-deactivated");

        Assert.NotNull(candidate);
        Assert.Equal("Alice", candidate!.Name);
        Assert.True(await Repo().HasActiveCounselorAssignmentAsync(Ctx(), "c1", "s-deactivated"));
    }

    [Fact]
    public async Task Assignment_gate_denies_an_inactive_assignment_between_two_active_users()
    {
        // The half of the isActive semantics legacy DOES apply: the assignment row, not the user row.
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await User(conn, "s1", "Alice");
        await Assignment(conn, "c1", "s1", isActive: false);

        Assert.NotNull(await Repo().FindParticipantCandidateAsync(Ctx(), "s1")); // the user resolves...
        Assert.False(await Repo().HasActiveCounselorAssignmentAsync(Ctx(), "c1", "s1")); // ...the gate still denies
    }

    [Fact]
    public async Task FindParticipantCandidate_does_not_resolve_a_user_outside_the_callers_school()
    {
        // The RLS half. The lookup itself has no school predicate — VideoEndpoints does the same-school check for
        // non-super-admins — so here 005-sensitive.sql's self-or-same-school policy on "users" IS the control,
        // and the half a superuser fixture could not express at all. Positive half over the same seeded row.
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await User(conn, "s1", "Alice");

        Assert.Null(await Repo().FindParticipantCandidateAsync(CtxFor("outsider", "school-2"), "s1"));
        Assert.Equal("Alice", (await Repo().FindParticipantCandidateAsync(Ctx(), "s1"))!.Name);
    }

    // ---- helpers ----

    private VideoSessionsRepository Repo() =>
        new(new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()), TimeProvider.System);

    // Identity-GUC context — NOT System()/Bypass (see the note after Task 1 Step 3). Every user the helpers seed
    // lands in "school-1" so the caller's session can see them under the production policies (formmaps#125).
    private static RequestContext Ctx() => CtxFor("test-caller", "school-1");

    private static RequestContext CtxFor(string userId, string schoolId) =>
        RequestContext.Authenticated(
            new RequestActor(userId, "counselor", "c@e.st", "Caller"),
            schoolId: schoolId, permissions: [], tokenSource: TokenSource.DevelopmentHeader, isDevelopmentOverride: true);

    private static async Task User(NpgsqlConnection conn, string id, string name, bool isActive = true, string schoolId = "school-1")
    {
        await using var cmd = new NpgsqlCommand(
            """INSERT INTO "users" ("id","name","email","schoolId","isActive") VALUES (@id,@name,@id||'@x.test',@school,@active)""", conn);
        cmd.Parameters.AddWithValue("id", id); cmd.Parameters.AddWithValue("name", name);
        cmd.Parameters.AddWithValue("school", schoolId); cmd.Parameters.AddWithValue("active", isActive);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task Assignment(NpgsqlConnection conn, string counselorId, string studentId, bool isActive)
    {
        await using var cmd = new NpgsqlCommand(
            """INSERT INTO "counselor_student_assignments" ("id","counselorId","studentId","isActive") VALUES (gen_random_uuid()::text,@cid,@sid,@active)""", conn);
        cmd.Parameters.AddWithValue("cid", counselorId); cmd.Parameters.AddWithValue("sid", studentId);
        cmd.Parameters.AddWithValue("active", isActive);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task School(NpgsqlConnection conn, string id, bool videoEnabled)
    {
        await using var cmd = new NpgsqlCommand(
            """INSERT INTO "schools" ("id","name","videoCallsEnabled") VALUES (@id,@id,@enabled)""", conn);
        cmd.Parameters.AddWithValue("id", id); cmd.Parameters.AddWithValue("enabled", videoEnabled);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task Session(
        NpgsqlConnection conn, string id, string counselorId, string studentId,
        DateTime? start = null, string status = "video_active", string topic = "Video Call",
        string? meetingLink = null)
    {
        await using var cmd = new NpgsqlCommand("""
            INSERT INTO "counselor_sessions"
                ("id","counselorId","studentId","startTime","endTime","status","topic","notes",
                 "counselorNotes","meetingLink","calendarEventIds","cancellationReason","isActive",
                 "createdDate","updatedAt")
            VALUES (@id,@cid,@sid,@start,@start,@status,@topic,'','',@link,'{}','',true,@start,@start)
            """, conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("cid", counselorId);
        cmd.Parameters.AddWithValue("sid", studentId);
        cmd.Parameters.AddWithValue("start", start ?? new DateTime(2026, 1, 1));
        cmd.Parameters.AddWithValue("status", status);
        cmd.Parameters.AddWithValue("topic", topic);
        cmd.Parameters.AddWithValue("link", meetingLink ?? $"link-{id}");
        await cmd.ExecuteNonQueryAsync();
    }

    /// <summary>formmaps#125: production policies + a restricted login. Three of the four tables here are policied
    /// in production (003-fk-users.sql on counselor_sessions + counselor_student_assignments, both keyed on the
    /// STUDENT's school; 005-sensitive.sql on users). "schools" is deliberately absent: it sits in #77's group 2,
    /// which still awaits an owner decision and is policied by no vendored file.</summary>
    public sealed class Fixture : RlsEnabledDatabaseFixture
    {
        protected override string SchemaResourceFileName => "video-sessions-schema.sql";

        protected override IReadOnlyCollection<string> PoliciedTables => ["users", "counselor_sessions", "counselor_student_assignments"];
    }
}
