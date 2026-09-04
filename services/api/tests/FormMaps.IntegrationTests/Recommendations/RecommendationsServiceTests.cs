using FormMaps.Application.Auth;
using FormMaps.Application.Recommendations;
using FormMaps.Domain.Auth;
using Npgsql;
using static FormMaps.IntegrationTests.Recommendations.RecommendationTestWorld;

namespace FormMaps.IntegrationTests.Recommendations;

/// <summary>
/// The request lifecycle for formmaps#59 (services/recommendationsService.ts) against Postgres with the production
/// RLS policies live and a restricted login: eligibility, the daily cap, create-vs-reactivate, the
/// recommender-ownership 404 convention, the letter upload gate, and application linking.
///
/// <para>Each test states legacy's rule and the file:line it comes from. Where legacy is odd — the 403 in
/// link-applications where everything else is a 404, an accepted request keeping an earlier decline reason — the
/// oddity is the assertion, not a thing to be fixed here.</para>
/// </summary>
public sealed class RecommendationsServiceTests : IClassFixture<RecommendationsFixture>, IAsyncLifetime
{
    private static readonly DateTime Now = new(2026, 9, 4, 12, 0, 0, DateTimeKind.Utc);
    private static readonly byte[] Pdf = "%PDF-1.7 hello"u8.ToArray();

    private const string Student = "student-1";
    private const string Teacher = "teacher-1";

    private readonly RecommendationsFixture _fixture;
    private NpgsqlDataSource _dataSource = null!;
    private NpgsqlDataSource _adminDataSource = null!;
    private FakeObjectStorage _storage = null!;
    private FakeEmailSender _mailer = null!;

    public RecommendationsServiceTests(RecommendationsFixture fixture) => _fixture = fixture;

    public async Task InitializeAsync()
    {
        _dataSource = NpgsqlDataSource.Create(_fixture.AppConnectionString);
        _adminDataSource = NpgsqlDataSource.Create(_fixture.AdminConnectionString);
        _storage = new FakeObjectStorage();
        _mailer = new FakeEmailSender();
        await _fixture.TruncateAsync(AllTables);
    }

    public async Task DisposeAsync()
    {
        await _dataSource.DisposeAsync();
        await _adminDataSource.DisposeAsync();
    }

    // =============================================================================================================
    // createRequest — eligibility (recommendationsService.ts:45)
    // =============================================================================================================

    [Fact]
    public async Task Same_school_staff_is_an_eligible_recommender_and_is_emailed()
    {
        await SeedPeopleAsync();

        var row = await Service().CreateRequestAsync(StudentCtx(), Input(Teacher));

        Assert.Equal("requested", row.Status);
        Assert.Equal(Student, row.StudentId);
        Assert.Equal(Teacher, row.RecommenderId);
        Assert.Equal(Student, row.CreatedBy);
        Assert.True(row.IsActive);

        var mail = Assert.Single(_mailer.Sent);
        Assert.Equal($"{Teacher}@e.st", mail.To);
        Assert.Equal($"FormMaps — Letter of Recommendation Request from {Student}", mail.Subject);
    }

    [Fact]
    public async Task Staff_at_a_different_school_is_404_not_403()
    {
        // 404 (not 403) so a non-qualifying id is indistinguishable from a nonexistent one (service:100).
        await SeedPeopleAsync();
        await using (var conn = await _adminDataSource.OpenConnectionAsync())
        {
            await UserAsync(conn, "foreign-teacher", FormMapsRoles.Teacher, OtherSchool);
        }

        var error = await Assert.ThrowsAsync<RecommendationException>(
            () => Service().CreateRequestAsync(StudentCtx(), Input("foreign-teacher")));
        Assert.Equal(404, error.StatusCode);
        Assert.Equal("Recommender not found", error.Message);
    }

    [Fact]
    public async Task Inactive_same_school_staff_is_404()
    {
        await SeedPeopleAsync();
        await using (var conn = await _adminDataSource.OpenConnectionAsync())
        {
            await UserAsync(conn, "retired", FormMapsRoles.Teacher, School, isActive: false);
        }

        var error = await Assert.ThrowsAsync<RecommendationException>(
            () => Service().CreateRequestAsync(StudentCtx(), Input("retired")));
        Assert.Equal(404, error.StatusCode);
    }

    [Fact]
    public async Task A_student_is_never_an_eligible_recommender()
    {
        // STAFF_ROLES is the whole staff branch; every other role except "coach" falls through to `return false`.
        await SeedPeopleAsync();
        await using (var conn = await _adminDataSource.OpenConnectionAsync())
        {
            await UserAsync(conn, "classmate", FormMapsRoles.Student, School);
        }

        var error = await Assert.ThrowsAsync<RecommendationException>(
            () => Service().CreateRequestAsync(StudentCtx(), Input("classmate")));
        Assert.Equal(404, error.StatusCode);
    }

    [Fact]
    public async Task A_school_less_coach_is_404_because_RLS_hides_the_user_row__inherited_dead_branch()
    {
        // FINDING, not a defect introduced here. isEligibleRecommender has a coach branch (service:56-64) and
        // /staff has searchBookedCoaches (service:227), but BOTH end in a read of the coach's `users` row — and
        // 005-sensitive.sql's users policy is "yourself + everyone in your school". A coach carries no schoolId,
        // so that row is invisible to ANY student session (school-scoped or not), and the lookup returns null →
        // "Recommender not found". Legacy Node runs the same policy under the same GUCs via its Prisma extension,
        // so this is production behaviour today; the port reproduces it rather than bypassing RLS to "fix" it.
        await SeedPeopleAsync();
        await using (var conn = await _adminDataSource.OpenConnectionAsync())
        {
            await UserAsync(conn, "coach-booked", FormMapsRoles.Coach, null);
            await CoachAsync(conn, "c-booked", "coach-booked");
            await BookingAsync(conn, "b-1", "c-booked", Student);
        }

        // The booking and coach rows ARE visible (neither table is policied) — it is only the users read that
        // fails, which is what makes this an RLS outcome rather than a seeding gap.
        await using (var session = await OpenIdentitySessionAsync(Student, School))
        {
            Assert.Equal(1L, await CountAsync(session, """SELECT count(*) FROM "bookings" """));
            Assert.Equal(0L, await CountAsync(session, """SELECT count(*) FROM "users" WHERE "id"='coach-booked'"""));
        }

        var error = await Assert.ThrowsAsync<RecommendationException>(
            () => Service().CreateRequestAsync(StudentCtx(), Input("coach-booked")));
        Assert.Equal(404, error.StatusCode);
        Assert.Equal("Recommender not found", error.Message);
    }

    [Fact]
    public async Task With_the_coach_row_visible_the_booking_is_the_only_thing_deciding_eligibility()
    {
        // Isolates the APPLICATION-layer coach branch from the RLS effect above by giving the coach users a
        // schoolId the student shares, so the policy admits both rows and only the booking predicate decides.
        await SeedPeopleAsync();
        await using (var conn = await _adminDataSource.OpenConnectionAsync())
        {
            await UserAsync(conn, "coach-booked", FormMapsRoles.Coach, School);
            await UserAsync(conn, "coach-stranger", FormMapsRoles.Coach, School);
            await CoachAsync(conn, "c-booked", "coach-booked");
            await CoachAsync(conn, "c-stranger", "coach-stranger");
            await BookingAsync(conn, "b-1", "c-booked", Student);
            await BookingAsync(conn, "b-2", "c-stranger", Student, isActive: false); // inactive booking ⇒ no
        }

        var row = await Service().CreateRequestAsync(StudentCtx(), Input("coach-booked"));
        Assert.Equal("coach-booked", row.RecommenderId);

        var error = await Assert.ThrowsAsync<RecommendationException>(
            () => Service().CreateRequestAsync(StudentCtx(), Input("coach-stranger")));
        Assert.Equal(404, error.StatusCode);
    }

    // =============================================================================================================
    // createRequest — the one-row-per-pair policy (recommendationsService.ts:112)
    // =============================================================================================================

    [Fact]
    public async Task A_second_live_request_for_the_same_recommender_is_409()
    {
        await SeedPeopleAsync();
        await Service().CreateRequestAsync(StudentCtx(), Input(Teacher));

        var error = await Assert.ThrowsAsync<RecommendationException>(
            () => Service().CreateRequestAsync(StudentCtx(), Input(Teacher)));
        Assert.Equal(409, error.StatusCode);
        Assert.Equal("A recommendation request already exists for this recommender", error.Message);
    }

    [Fact]
    public async Task A_declined_request_is_reactivated_in_place_with_the_letter_fields_cleared()
    {
        await SeedPeopleAsync();
        await using (var conn = await _adminDataSource.OpenConnectionAsync())
        {
            await RequestAsync(
                conn, "req-1", Student, Teacher, status: "declined",
                letterFileKey: "recommendations/letters/old.pdf", letterFileName: "old.pdf");
            await using var cmd = new NpgsqlCommand(
                """UPDATE "recommendation_requests" SET "declineReason"='no time', "submittedAt"=now() WHERE "id"='req-1'""",
                conn);
            await cmd.ExecuteNonQueryAsync();
        }

        var row = await Service().CreateRequestAsync(StudentCtx(), Input(Teacher, relationship: "Coach"));

        Assert.Equal("req-1", row.Id); // reactivated IN PLACE — no second row
        Assert.Equal("requested", row.Status);
        Assert.Equal("Coach", row.Relationship);
        Assert.Null(row.DeclineReason);
        Assert.Null(row.SubmittedAt);
        Assert.Null(row.LetterFileKey);
        Assert.Null(row.LetterFileName);
        Assert.True(row.IsActive);
        Assert.Equal(1, await CountRequestsAsync());
    }

    [Fact]
    public async Task A_soft_deleted_request_is_reactivated_rather_than_duplicated()
    {
        await SeedPeopleAsync();
        await using (var conn = await _adminDataSource.OpenConnectionAsync())
        {
            await RequestAsync(conn, "req-1", Student, Teacher, status: "accepted", isActive: false);
        }

        var row = await Service().CreateRequestAsync(StudentCtx(), Input(Teacher));

        Assert.Equal("req-1", row.Id);
        Assert.True(row.IsActive);
        Assert.Equal(1, await CountRequestsAsync());
    }

    [Fact]
    public async Task The_daily_cap_counts_reactivations_as_well_as_new_rows()
    {
        // MAX_DAILY_REQUESTS = 10, counted over status='requested' AND (createdDate today OR updatedAt today), so
        // the reactivation path cannot be used to flood a recommender (service:77-88).
        await SeedPeopleAsync();
        await using (var conn = await _adminDataSource.OpenConnectionAsync())
        {
            for (var i = 0; i < 10; i++)
            {
                await UserAsync(conn, $"staff-{i}", FormMapsRoles.Counselor, School);
                // createdDate long past, updatedAt TODAY — i.e. rows that were reactivated today.
                await RequestAsync(conn, $"req-{i}", Student, $"staff-{i}", created: new DateTime(2020, 1, 1));
                await using var cmd = new NpgsqlCommand(
                    $"""UPDATE "recommendation_requests" SET "updatedAt"=@t WHERE "id"='req-{i}'""", conn);
                cmd.Parameters.AddWithValue("t", DateTime.SpecifyKind(Now, DateTimeKind.Unspecified));
                await cmd.ExecuteNonQueryAsync();
            }
        }

        var error = await Assert.ThrowsAsync<RecommendationException>(
            () => Service().CreateRequestAsync(StudentCtx(), Input(Teacher)));
        Assert.Equal(429, error.StatusCode);
        Assert.Equal("Daily recommendation request limit reached (max 10)", error.Message);
    }

    // =============================================================================================================
    // Reads
    // =============================================================================================================

    [Fact]
    public async Task List_for_student_is_newest_first_active_only_and_carries_the_recommender_and_links()
    {
        await SeedPeopleAsync();
        await using (var conn = await _adminDataSource.OpenConnectionAsync())
        {
            await UserAsync(conn, "teacher-2", FormMapsRoles.Teacher, School);
            await RequestAsync(conn, "old", Student, Teacher, created: new DateTime(2026, 1, 1));
            await RequestAsync(conn, "new", Student, "teacher-2", created: new DateTime(2026, 6, 1));
            await UserAsync(conn, "teacher-3", FormMapsRoles.Teacher, School);
            await RequestAsync(conn, "gone", Student, "teacher-3", isActive: false);
            await ApplicationAsync(conn, "app-1", Student);
            await LinkAsync(conn, "link-1", "new", "app-1");
        }

        var rows = await Service().ListForStudentAsync(StudentCtx(), Student);

        Assert.Equal(["new", "old"], rows.Select(r => r.Request.Id));
        Assert.Equal("teacher-2", rows[0].Recommender.Id);
        Assert.Equal($"{Teacher}@e.st", rows[1].Recommender.Email);
        Assert.Equal(["app-1"], rows[0].ApplicationLinks.Select(l => l.StudentApplicationId));
        Assert.Empty(rows[1].ApplicationLinks);
    }

    [Fact]
    public async Task List_received_scopes_to_the_recommender_and_does_not_leak_another_recommenders_row()
    {
        // A same-school teacher's session is admitted to BOTH rows by 003-fk-users.sql (the policy keys on the
        // student, not the recommender), so the scoping here is the repository's WHERE and nothing else.
        await SeedPeopleAsync();
        await using (var conn = await _adminDataSource.OpenConnectionAsync())
        {
            await UserAsync(conn, "teacher-2", FormMapsRoles.Teacher, School);
            await RequestAsync(conn, "mine", Student, Teacher);
            await RequestAsync(conn, "theirs", Student, "teacher-2");
        }

        await using (var session = await OpenIdentitySessionAsync(Teacher, School))
        {
            Assert.Equal(2L, await CountAsync(session, """SELECT count(*) FROM "recommendation_requests" """));
        }

        Assert.Equal(["mine"], (await Service().ListReceivedAsync(TeacherCtx(), Teacher)).Select(r => r.Request.Id));
        Assert.Equal(
            ["theirs"],
            (await Service().ListReceivedAsync(Ctx("teacher-2", FormMapsRoles.Teacher, School), "teacher-2"))
                .Select(r => r.Request.Id));
    }

    [Fact]
    public async Task Eligible_recommender_search_merges_staff_and_booked_coaches_sorted_by_name_and_capped()
    {
        await SeedPeopleAsync();
        await using (var conn = await _adminDataSource.OpenConnectionAsync())
        {
            await UserAsync(conn, "s-zoe", FormMapsRoles.Counselor, School, name: "Zoe");
            await UserAsync(conn, "s-anna", FormMapsRoles.SchoolAdmin, School, name: "anna");
            await UserAsync(conn, "s-parent", FormMapsRoles.Parent, School, name: "Bob"); // not a STAFF_ROLE
            // Two booked coaches: one school-less (invisible to the student under 005-sensitive.sql's users
            // policy — see A_school_less_coach_is_404_...), one sharing the school (visible).
            await UserAsync(conn, "c-mike", FormMapsRoles.Coach, School, name: "Mike");
            await UserAsync(conn, "c-ghost", FormMapsRoles.Coach, null, name: "Aaron");
            await CoachAsync(conn, "coach-1", "c-mike");
            await CoachAsync(conn, "coach-2", "c-ghost");
            await BookingAsync(conn, "b-1", "coach-1", Student);
            await BookingAsync(conn, "b-2", "coach-2", Student);
        }

        var rows = await Service().SearchEligibleRecommendersAsync(StudentCtx(), Student, School, "", 10);

        // localeCompare orders "anna" before "Mike" before "Zoe" (case-insensitive collation, not ordinal), and
        // teacher-1's seeded name is its id, so it sorts under "t". "Aaron" would sort FIRST if it were visible —
        // its absence is the users policy, the same inherited effect the coach test above pins.
        Assert.Equal(["anna", "Mike", Teacher, "Zoe"], rows.Select(r => r.Name));
        Assert.DoesNotContain(rows, r => r.Id == "s-parent");
        Assert.DoesNotContain(rows, r => r.Id == "c-ghost");

        var capped = await Service().SearchEligibleRecommendersAsync(StudentCtx(), Student, School, "", 2);
        Assert.Equal(["anna", "Mike"], capped.Select(r => r.Name));
    }

    [Fact]
    public async Task Dashboard_scopes_a_teacher_to_requests_addressed_to_them_only()
    {
        // getDashboard's teacher branch is recommenderId = self — a teacher is a recommender, not an oversight
        // role, so it must never see another recommender's requests (service:287).
        await SeedPeopleAsync();
        await using (var conn = await _adminDataSource.OpenConnectionAsync())
        {
            await UserAsync(conn, "teacher-2", FormMapsRoles.Teacher, School);
            await RequestAsync(conn, "mine", Student, Teacher, status: "accepted");
            await RequestAsync(conn, "theirs", Student, "teacher-2", status: "declined");
        }

        var data = await Service().GetDashboardAsync(TeacherCtx(), FormMapsRoles.Teacher, Teacher, School);

        Assert.Equal(1, data.Total);
        Assert.Equal(["mine"], data.Requests.Select(r => r.Request.Id));
        Assert.Equal(1, data.CountByStatus["accepted"]);
        Assert.Equal(0, data.CountByStatus["declined"]);
        // EMPTY_STATUS_COUNTS seeds all five keys in this order even when zero.
        Assert.Equal(
            ["requested", "accepted", "in_progress", "submitted", "declined"], data.CountByStatus.Keys);
    }

    [Fact]
    public async Task Dashboard_scopes_a_counselor_to_their_assigned_students()
    {
        await SeedPeopleAsync();
        await using (var conn = await _adminDataSource.OpenConnectionAsync())
        {
            await UserAsync(conn, "counselor-1", FormMapsRoles.Counselor, School);
            await UserAsync(conn, "student-2", FormMapsRoles.Student, School);
            await AssignmentAsync(conn, "a-1", "counselor-1", Student);
            await RequestAsync(conn, "assigned", Student, Teacher);
            await RequestAsync(conn, "unassigned", "student-2", Teacher);
        }

        var ctx = Ctx("counselor-1", FormMapsRoles.Counselor, School);
        var data = await Service().GetDashboardAsync(ctx, FormMapsRoles.Counselor, "counselor-1", School);

        Assert.Equal(["assigned"], data.Requests.Select(r => r.Request.Id));
    }

    // =============================================================================================================
    // Recommender actions
    // =============================================================================================================

    [Fact]
    public async Task Responding_to_someone_elses_request_is_the_same_404_as_a_missing_one()
    {
        await SeedPeopleAsync();
        await using (var conn = await _adminDataSource.OpenConnectionAsync())
        {
            await UserAsync(conn, "teacher-2", FormMapsRoles.Teacher, School);
            await RequestAsync(conn, "theirs", Student, "teacher-2");
        }

        var notMine = await Assert.ThrowsAsync<RecommendationException>(
            () => Service().RespondAsync(TeacherCtx(), "theirs", Teacher, "accept", null));
        var missing = await Assert.ThrowsAsync<RecommendationException>(
            () => Service().RespondAsync(TeacherCtx(), "nope", Teacher, "accept", null));

        Assert.Equal(404, notMine.StatusCode);
        Assert.Equal(missing.Message, notMine.Message); // indistinguishable, on purpose (IDOR defense)
    }

    [Fact]
    public async Task Accepting_leaves_an_earlier_decline_reason_in_place()
    {
        // Legacy passes `declineReason: undefined` on accept, so Prisma omits the column. A stale reason survives.
        // Recorded as legacy behaviour, not corrected here.
        await SeedPeopleAsync();
        await using (var conn = await _adminDataSource.OpenConnectionAsync())
        {
            await RequestAsync(conn, "req-1", Student, Teacher, status: "declined");
            await using var cmd = new NpgsqlCommand(
                """UPDATE "recommendation_requests" SET "declineReason"='busy' WHERE "id"='req-1'""", conn);
            await cmd.ExecuteNonQueryAsync();
        }

        var accepted = await Service().RespondAsync(TeacherCtx(), "req-1", Teacher, "accept", null);

        Assert.Equal("accepted", accepted.Status);
        Assert.Equal("busy", accepted.DeclineReason);
        Assert.Equal($"{Student}@e.st", Assert.Single(_mailer.Sent).To);
    }

    [Fact]
    public async Task Declining_writes_the_reason_and_emails_the_student()
    {
        await SeedPeopleAsync();
        await using (var conn = await _adminDataSource.OpenConnectionAsync())
        {
            await RequestAsync(conn, "req-1", Student, Teacher);
        }

        var row = await Service().RespondAsync(TeacherCtx(), "req-1", Teacher, "decline", "Too many this term");

        Assert.Equal("declined", row.Status);
        Assert.Equal("Too many this term", row.DeclineReason);
        Assert.Equal(Teacher, row.UpdatedBy);
        Assert.Equal("FormMaps — Your Recommendation Request was Declined", Assert.Single(_mailer.Sent).Subject);
    }

    [Fact]
    public async Task Marking_submitted_without_a_letter_is_409()
    {
        // The invariant that keeps GET /:id/letter from 404-ing on a "complete" request (service:401).
        await SeedPeopleAsync();
        await using (var conn = await _adminDataSource.OpenConnectionAsync())
        {
            await RequestAsync(conn, "req-1", Student, Teacher, status: "accepted");
        }

        var error = await Assert.ThrowsAsync<RecommendationException>(
            () => Service().UpdateStatusAsync(TeacherCtx(), "req-1", Teacher, "submitted"));
        Assert.Equal(409, error.StatusCode);
        Assert.Equal("Upload a letter before marking the request submitted", error.Message);

        // in_progress on the same row is fine.
        var progressed = await Service().UpdateStatusAsync(TeacherCtx(), "req-1", Teacher, "in_progress");
        Assert.Equal("in_progress", progressed.Status);
        Assert.Null(progressed.SubmittedAt);
    }

    // =============================================================================================================
    // The letter upload
    // =============================================================================================================

    [Fact]
    public async Task Uploading_a_letter_stores_the_pdf_flips_to_submitted_and_emails_the_student()
    {
        await SeedPeopleAsync();
        await using (var conn = await _adminDataSource.OpenConnectionAsync())
        {
            await RequestAsync(conn, "req-1", Student, Teacher, status: "accepted");
        }

        var row = await Service().UploadLetterAsync(
            TeacherCtx(), "req-1", Teacher, new LetterUpload("../My Letter!.pdf", "application/pdf", Pdf));

        // The key shape is lib/s3.ts's: recommendations/letters/{ms}-{6 chars}.pdf.
        var key = Assert.Single(_storage.Uploaded);
        Assert.StartsWith("recommendations/letters/", key);
        Assert.EndsWith(".pdf", key);

        Assert.Equal(key, row.LetterFileKey);
        Assert.Equal("My_Letter_.pdf", row.LetterFileName); // sanitizeFilename: path stripped, non-word → "_"
        Assert.Equal("submitted", row.Status);
        Assert.NotNull(row.SubmittedAt);
        Assert.NotNull(row.LetterUploadedAt);
        Assert.Equal("FormMaps — Your Letter of Recommendation has been Submitted", Assert.Single(_mailer.Sent).Subject);
        Assert.Empty(_storage.Deleted);
    }

    [Theory]
    [InlineData("requested")]
    [InlineData("declined")]
    [InlineData("submitted")]
    public async Task Uploading_outside_accepted_or_in_progress_is_409_and_stores_nothing(string status)
    {
        await SeedPeopleAsync();
        await using (var conn = await _adminDataSource.OpenConnectionAsync())
        {
            await RequestAsync(conn, "req-1", Student, Teacher, status: status);
        }

        var error = await Assert.ThrowsAsync<RecommendationException>(
            () => Service().UploadLetterAsync(
                TeacherCtx(), "req-1", Teacher, new LetterUpload("l.pdf", "application/pdf", Pdf)));

        Assert.Equal(409, error.StatusCode);
        Assert.Equal(
            "A letter can only be uploaded after the request is accepted and before it is submitted", error.Message);
        Assert.Empty(_storage.Uploaded);
    }

    [Fact]
    public async Task A_file_that_declares_pdf_but_is_not_one_is_400_and_never_reaches_storage()
    {
        // The magic-byte gate is STRICTER than the shared FileUploadValidation: a full "%PDF-<digit>" header, not
        // the bare 4-byte "%PDF" prefix a polyglot could fake (service:437).
        await SeedPeopleAsync();
        await using (var conn = await _adminDataSource.OpenConnectionAsync())
        {
            await RequestAsync(conn, "req-1", Student, Teacher, status: "accepted");
        }

        foreach (var bytes in new[] { "%PDF"u8.ToArray(), "%PDFxxxx"u8.ToArray(), "GIF89a12"u8.ToArray() })
        {
            var error = await Assert.ThrowsAsync<RecommendationException>(
                () => Service().UploadLetterAsync(
                    TeacherCtx(), "req-1", Teacher, new LetterUpload("l.pdf", "application/pdf", bytes)));
            Assert.Equal(400, error.StatusCode);
            Assert.Equal("Only PDF letters are accepted", error.Message);
        }

        Assert.Empty(_storage.Uploaded);
    }

    // =============================================================================================================
    // Application linking
    // =============================================================================================================

    [Fact]
    public async Task Linking_applications_is_upsert_shaped_and_returns_them_in_request_order()
    {
        await SeedPeopleAsync();
        await using (var conn = await _adminDataSource.OpenConnectionAsync())
        {
            await RequestAsync(conn, "req-1", Student, Teacher, status: "accepted");
            await ApplicationAsync(conn, "app-a", Student);
            await ApplicationAsync(conn, "app-b", Student);
        }

        var first = await Service().LinkApplicationsAsync(StudentCtx(), "req-1", Student, ["app-b", "app-a"]);
        Assert.Equal(["app-b", "app-a"], first.Select(l => l.StudentApplicationId));
        Assert.All(first, l => Assert.Equal(Student, l.CreatedBy));

        var again = await Service().LinkApplicationsAsync(StudentCtx(), "req-1", Student, ["app-a"]);
        Assert.Equal(first.Single(l => l.StudentApplicationId == "app-a").Id, again.Single().Id); // upsert, not insert
        Assert.Equal(2, await CountLinksAsync());
    }

    [Fact]
    public async Task Linking_someone_elses_request_is_403_not_404__legacy_inconsistency_ported_as_is()
    {
        // Every other ownership failure in this file is a 404 for IDOR reasons; this one confirms the row exists.
        // Reproduced deliberately — legacy is the specification (service:534).
        await SeedPeopleAsync();
        await using (var conn = await _adminDataSource.OpenConnectionAsync())
        {
            await UserAsync(conn, "student-2", FormMapsRoles.Student, School);
            await RequestAsync(conn, "theirs", "student-2", Teacher);
        }

        var error = await Assert.ThrowsAsync<RecommendationException>(
            () => Service().LinkApplicationsAsync(StudentCtx(), "theirs", Student, ["app-a"]));

        Assert.Equal(403, error.StatusCode);
        Assert.Equal("Only the student who created this request can link applications", error.Message);
    }

    [Fact]
    public async Task Linking_an_application_that_is_not_yours_is_400_and_links_nothing()
    {
        await SeedPeopleAsync();
        await using (var conn = await _adminDataSource.OpenConnectionAsync())
        {
            await UserAsync(conn, "student-2", FormMapsRoles.Student, School);
            await RequestAsync(conn, "req-1", Student, Teacher);
            await ApplicationAsync(conn, "app-mine", Student);
            await ApplicationAsync(conn, "app-theirs", "student-2");
            await ApplicationAsync(conn, "app-dead", Student, isActive: false);
        }

        foreach (var bad in new[] { "app-theirs", "app-dead", "app-missing" })
        {
            var error = await Assert.ThrowsAsync<RecommendationException>(
                () => Service().LinkApplicationsAsync(StudentCtx(), "req-1", Student, ["app-mine", bad]));
            Assert.Equal(400, error.StatusCode);
            Assert.Equal("One or more applications not found or do not belong to you", error.Message);
        }

        Assert.Equal(0, await CountLinksAsync());
    }

    // ---- helpers ----

    private RecommendationsService Service() => RecommendationTestWorld.Service(_dataSource, Now, _storage, _mailer);

    private static RequestContext StudentCtx() => Ctx(Student, FormMapsRoles.Student, School);

    private static RequestContext TeacherCtx() =>
        Ctx(Teacher, FormMapsRoles.Teacher, School, FormMapsPermissions.RecommendationsRespond);

    private static CreateRequestInput Input(string recommenderId, string relationship = "Teacher") =>
        new(Student, School, recommenderId, relationship, "Please write me a letter", null);

    private async Task SeedPeopleAsync()
    {
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await UserAsync(conn, Student, FormMapsRoles.Student, School);
        await UserAsync(conn, Teacher, FormMapsRoles.Teacher, School);
    }

    private static async Task LinkAsync(NpgsqlConnection conn, string id, string requestId, string applicationId)
    {
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "recommendation_application_links"("id","recommendationRequestId","studentApplicationId")
            VALUES(@i,@r,@a)
            """, conn);
        cmd.Parameters.AddWithValue("i", id);
        cmd.Parameters.AddWithValue("r", requestId);
        cmd.Parameters.AddWithValue("a", applicationId);
        await cmd.ExecuteNonQueryAsync();
    }

    private async Task<int> CountRequestsAsync()
    {
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        return (int)await CountAsync(conn, """SELECT count(*) FROM "recommendation_requests" """);
    }

    private async Task<int> CountLinksAsync()
    {
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        return (int)await CountAsync(conn, """SELECT count(*) FROM "recommendation_application_links" """);
    }

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

    private static async Task<long> CountAsync(NpgsqlConnection conn, string sql)
    {
        await using var cmd = new NpgsqlCommand(sql, conn);
        return (long)(await cmd.ExecuteScalarAsync())!;
    }
}
