using FormMaps.Application.Recommendations;
using FormMaps.Domain.Auth;
using FormMaps.IntegrationTests.TestSupport.Rls;
using Npgsql;
using static FormMaps.IntegrationTests.Recommendations.RecommendationTestWorld;

namespace FormMaps.IntegrationTests.Recommendations;

/// <summary>
/// Who may fetch a signed URL for a recommendation letter (formmaps#59 — recommendationsService.ts
/// getLetterDownloadUrl, reached from GET /:id/letter at recommendations.ts:217). Runs the REAL service over the
/// REAL <c>UserAccessGuard</c> against Postgres with the production RLS policies live, so the allow-list being
/// measured here is the one that ships.
///
/// <para><b>THIS SUITE CONTAINS A DELIBERATE PIN OF AN INHERITED EXPOSURE.</b>
/// <c>Letter_subject_can_download_the_letter_written_about_them__INHERITED_EXPOSURE_pinned_by_D9</c> asserts that a
/// student can download their own recommendation letter. That is normally a confidentiality problem — a letter of
/// recommendation is usually confidential from its subject — and it is NOT an assertion that the behaviour is
/// right. It is here because decision D9 for this port is "reproduce the legacy surface unchanged and make the
/// exposure visible rather than silent", so that closing it later is a deliberate act. A reader who wants to close
/// it must consciously rewrite that test; see the header comment on
/// <c>RecommendationsEndpoints.DownloadLetterAsync</c> for the three changes that go together.</para>
/// </summary>
public sealed class RecommendationLetterAccessTests
    : IClassFixture<RecommendationsFixture>, IAsyncLifetime
{
    private static readonly DateTime Now = new(2026, 9, 4, 12, 0, 0, DateTimeKind.Utc);

    private const string Student = "student-1";
    private const string Teacher = "teacher-1";
    private const string Request = "req-1";
    private const string LetterKey = "recommendations/letters/1-abcdef.pdf";

    private readonly RecommendationsFixture _fixture;

    /// <summary>Restricted login (NOSUPERUSER NOBYPASSRLS) — the code under test.</summary>
    private NpgsqlDataSource _dataSource = null!;

    /// <summary>Container superuser — seeding and row-state assertions only.</summary>
    private NpgsqlDataSource _adminDataSource = null!;

    private FakeObjectStorage _storage = null!;
    private FakeEmailSender _mailer = null!;

    public RecommendationLetterAccessTests(RecommendationsFixture fixture) => _fixture = fixture;

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

    [Fact]
    public async Task Harness_runs_as_a_restricted_login_with_the_production_policies_live()
    {
        // NOTE the data source: the APP login, not the admin one (formmaps#125).
        await using var conn = await _dataSource.OpenConnectionAsync();
        Assert.False(await ProductionRlsPolicies.BypassesRlsAsync(conn), "the app login must not bypass RLS");
        Assert.Equal<string>(
            [
                "counselor_student_assignments", "recommendation_application_links", "recommendation_requests",
                "student_applications", "users",
            ],
            _fixture.AppliedPolicyTables);
    }

    // =============================================================================================================
    // THE PIN
    // =============================================================================================================

    /// <summary>
    /// ⚠️ PINS AN INHERITED EXPOSURE — NOT AN ENDORSEMENT OF IT.
    ///
    /// <para>GET /:id/letter is the only route in routes/recommendations.ts without a
    /// <c>requirePermission("recommendations:respond")</c> gate (recommendations.ts:217), and getLetterDownloadUrl
    /// admits anyone <c>canAccessUser</c> admits for the request's studentId — which always includes that student
    /// themselves. So the subject of a recommendation letter can pull a presigned URL for it. Ported unchanged
    /// under decision D9.</para>
    ///
    /// <para>If you are here to CLOSE this: change
    /// <c>RecommendationsService.GetLetterDownloadUrlAsync</c> so self-access is not sufficient, rewrite this test
    /// to assert the 404, and change legacy Node in the same breath — otherwise flipping
    /// FORMMAPS_ROUTE_RECOMMENDATIONS_TO_DOTNET stops being behaviour-neutral and a rollback reopens it.</para>
    /// </summary>
    [Fact]
    public async Task Letter_subject_can_download_the_letter_written_about_them__INHERITED_EXPOSURE_pinned_by_D9()
    {
        await SeedLetterAsync();

        var result = await Service().GetLetterDownloadUrlAsync(StudentCtx(Student), Request);

        Assert.Equal($"https://signed/read/{LetterKey}", result.Url);
        Assert.Equal("letter.pdf", result.Filename);

        // The short TTL + attachment disposition are part of the same inherited surface (LETTER_DOWNLOAD_TTL = 300,
        // getFileUrl called with no `inline` flag), so they are pinned alongside it.
        var read = Assert.Single(_storage.Reads);
        Assert.Equal((LetterKey, 300, false, "application/pdf"), read);
    }

    // =============================================================================================================
    // The rest of the allow-list, and the denials
    // =============================================================================================================

    [Fact]
    public async Task Same_school_classmate_is_denied_even_though_RLS_admits_the_row()
    {
        // The case where RLS CANNOT do the gate's job: 003-fk-users.sql admits any caller whose school matches the
        // request's student, so the classmate's session really can see this row. Only canAccessUser denies it.
        await SeedLetterAsync();
        await using (var conn = await _adminDataSource.OpenConnectionAsync())
        {
            await UserAsync(conn, "classmate", FormMapsRoles.Student, School);
        }

        // Negative control on the control: the row IS visible to the classmate's session, so the 404 below is the
        // application predicate and not an empty fixture.
        await using (var session = await OpenIdentitySessionAsync("classmate", School))
        {
            Assert.Equal(1L, await CountAsync(session, """SELECT count(*) FROM "recommendation_requests" """));
        }

        var error = await Assert.ThrowsAsync<RecommendationException>(
            () => Service().GetLetterDownloadUrlAsync(StudentCtx("classmate"), Request));
        Assert.Equal(404, error.StatusCode);
        Assert.Equal("Letter not found", error.Message);
    }

    [Fact]
    public async Task Owning_recommender_can_download()
    {
        await SeedLetterAsync();

        var result = await Service().GetLetterDownloadUrlAsync(
            Ctx(Teacher, FormMapsRoles.Teacher, School, FormMapsPermissions.RecommendationsRespond), Request);

        Assert.Equal($"https://signed/read/{LetterKey}", result.Url);
    }

    [Fact]
    public async Task Assigned_counselor_can_download_but_an_unassigned_same_school_counselor_cannot()
    {
        await SeedLetterAsync();
        await using (var conn = await _adminDataSource.OpenConnectionAsync())
        {
            await UserAsync(conn, "counselor-assigned", FormMapsRoles.Counselor, School);
            await UserAsync(conn, "counselor-other", FormMapsRoles.Counselor, School);
            await AssignmentAsync(conn, "assign-1", "counselor-assigned", Student);
        }

        var assigned = await Service().GetLetterDownloadUrlAsync(
            Ctx("counselor-assigned", FormMapsRoles.Counselor, School), Request);
        Assert.Equal($"https://signed/read/{LetterKey}", assigned.Url);

        // Same school, so RLS admits the row; the counselor-assignment predicate is the only thing denying.
        var error = await Assert.ThrowsAsync<RecommendationException>(
            () => Service().GetLetterDownloadUrlAsync(Ctx("counselor-other", FormMapsRoles.Counselor, School), Request));
        Assert.Equal(404, error.StatusCode);
    }

    [Fact]
    public async Task Same_school_admin_can_download_and_a_foreign_school_admin_cannot()
    {
        await SeedLetterAsync();
        await using (var conn = await _adminDataSource.OpenConnectionAsync())
        {
            await UserAsync(conn, "admin-here", FormMapsRoles.SchoolAdmin, School);
            await UserAsync(conn, "admin-there", FormMapsRoles.SchoolAdmin, OtherSchool);
        }

        var here = await Service().GetLetterDownloadUrlAsync(
            Ctx("admin-here", FormMapsRoles.SchoolAdmin, School), Request);
        Assert.Equal($"https://signed/read/{LetterKey}", here.Url);

        var error = await Assert.ThrowsAsync<RecommendationException>(
            () => Service().GetLetterDownloadUrlAsync(Ctx("admin-there", FormMapsRoles.SchoolAdmin, OtherSchool), Request));
        Assert.Equal(404, error.StatusCode);
    }

    [Fact]
    public async Task No_letter_uploaded_is_404_even_for_the_student()
    {
        await using (var conn = await _adminDataSource.OpenConnectionAsync())
        {
            await UserAsync(conn, Student, FormMapsRoles.Student, School);
            await UserAsync(conn, Teacher, FormMapsRoles.Teacher, School);
            await RequestAsync(conn, Request, Student, Teacher, status: "accepted");
        }

        var error = await Assert.ThrowsAsync<RecommendationException>(
            () => Service().GetLetterDownloadUrlAsync(StudentCtx(Student), Request));
        Assert.Equal(404, error.StatusCode);
        Assert.Empty(_storage.Reads);
    }

    [Fact]
    public async Task Soft_deleted_request_is_404_even_with_a_letter()
    {
        await using (var conn = await _adminDataSource.OpenConnectionAsync())
        {
            await UserAsync(conn, Student, FormMapsRoles.Student, School);
            await UserAsync(conn, Teacher, FormMapsRoles.Teacher, School);
            await RequestAsync(
                conn, Request, Student, Teacher, status: "submitted", isActive: false,
                letterFileKey: LetterKey, letterFileName: "letter.pdf");
        }

        var error = await Assert.ThrowsAsync<RecommendationException>(
            () => Service().GetLetterDownloadUrlAsync(StudentCtx(Student), Request));
        Assert.Equal(404, error.StatusCode);
    }

    [Fact]
    public async Task Missing_letter_file_name_falls_back_to_letter_pdf()
    {
        await using (var conn = await _adminDataSource.OpenConnectionAsync())
        {
            await UserAsync(conn, Student, FormMapsRoles.Student, School);
            await UserAsync(conn, Teacher, FormMapsRoles.Teacher, School);
            await RequestAsync(
                conn, Request, Student, Teacher, status: "submitted", letterFileKey: LetterKey, letterFileName: null);
        }

        var result = await Service().GetLetterDownloadUrlAsync(StudentCtx(Student), Request);
        Assert.Equal("letter.pdf", result.Filename);
    }

    // ---- helpers ----

    private RecommendationsService Service() => RecommendationTestWorld.Service(_dataSource, Now, _storage, _mailer);

    private static Application.Auth.RequestContext StudentCtx(string id) =>
        Ctx(id, FormMapsRoles.Student, School);

    private async Task SeedLetterAsync()
    {
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await UserAsync(conn, Student, FormMapsRoles.Student, School);
        await UserAsync(conn, Teacher, FormMapsRoles.Teacher, School);
        await RequestAsync(
            conn, Request, Student, Teacher, status: "submitted", letterFileKey: LetterKey, letterFileName: "letter.pdf");
    }

    /// <summary>
    /// A raw connection on the restricted login carrying the GUCs the session factory sets for an Identity-mode
    /// caller — used to state what the POLICIES do, independently of the service.
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

    private static async Task<long> CountAsync(NpgsqlConnection conn, string sql)
    {
        await using var cmd = new NpgsqlCommand(sql, conn);
        return (long)(await cmd.ExecuteScalarAsync())!;
    }
}
