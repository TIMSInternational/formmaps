using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using FormMaps.Api.Auth;
using FormMaps.Application.Auth;
using FormMaps.Application.Recommendations;
using FormMaps.Application.Storage;
using FormMaps.Domain.Auth;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;

namespace FormMaps.IntegrationTests.Recommendations;

/// <summary>
/// HTTP surface of the ten recommendation routes (formmaps#59 — routes/recommendations.ts): the guard chain, the
/// zod-parity 400s, the multipart handling of <c>letterUpload.single("file")</c>, and the status mapping of
/// <c>fail()</c>. Storage / mailer / repository / user-access are doubled; the real
/// <see cref="RecommendationsService"/> and endpoint code run.
///
/// <para>The permission map under test is legacy's, route for route: FOUR routes carry
/// <c>requirePermission("recommendations:respond")</c> — GET /received, PUT /:id/respond, PUT /:id/status,
/// POST /:id/letter — and the other six do not. <b>GET /:id/letter is in the second group on purpose</b>; see
/// <c>Download_letter_has_no_permission_gate__INHERITED_EXPOSURE_pinned_by_D9</c>.</para>
/// </summary>
public sealed class RecommendationEndpointsTests
{
    private static readonly byte[] Pdf = Encoding.ASCII.GetBytes("%PDF-1.7 body");

    private const string Student = "student-1";

    // =============================================================================================================
    // Guard chain
    // =============================================================================================================

    [Theory]
    [InlineData("GET", "/api/v1/recommendations")]
    [InlineData("POST", "/api/v1/recommendations")]
    [InlineData("GET", "/api/v1/recommendations/staff")]
    [InlineData("GET", "/api/v1/recommendations/dashboard")]
    [InlineData("GET", "/api/v1/recommendations/received")]
    [InlineData("PUT", "/api/v1/recommendations/req-1/respond")]
    [InlineData("PUT", "/api/v1/recommendations/req-1/status")]
    [InlineData("POST", "/api/v1/recommendations/req-1/letter")]
    [InlineData("GET", "/api/v1/recommendations/req-1/letter")]
    [InlineData("POST", "/api/v1/recommendations/req-1/link-applications")]
    public async Task Anonymous_is_401_on_every_route(string method, string path)
    {
        using var factory = Factory();
        using var client = factory.CreateClient();

        var response = await client.SendAsync(new HttpRequestMessage(new HttpMethod(method), path));

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Theory]
    [InlineData("GET", "/api/v1/recommendations/received")]
    [InlineData("PUT", "/api/v1/recommendations/req-1/respond")]
    [InlineData("PUT", "/api/v1/recommendations/req-1/status")]
    [InlineData("POST", "/api/v1/recommendations/req-1/letter")]
    public async Task The_four_recommender_routes_403_without_recommendations_respond(string method, string path)
    {
        using var factory = Factory();
        using var client = factory.CreateClient();

        var response = await Send(client, method, path, Json("{}"), permissions: "");

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Equal("Insufficient permissions", await Message(response));
    }

    /// <summary>
    /// ⚠️ PINS AN INHERITED EXPOSURE — NOT AN ENDORSEMENT OF IT.
    ///
    /// <para>GET /:id/letter (recommendations.ts:217) is the ONLY route in the router declared without
    /// <c>requirePermission("recommendations:respond")</c>. Combined with getLetterDownloadUrl's canAccessUser
    /// allow-list — which always admits a caller reading their own record — that makes the letter reachable by the
    /// STUDENT IT WAS WRITTEN ABOUT. Ported unchanged under decision D9, which is to reproduce the surface and make
    /// the exposure visible rather than silent.</para>
    ///
    /// <para>The contrast is the assertion: the SAME identity, holding no permissions at all, is refused by
    /// POST /:id/letter (403) and served by GET /:id/letter (200). If you are closing the exposure, this test and
    /// <c>RecommendationLetterAccessTests.Letter_subject_can_download_the_letter_written_about_them__INHERITED_EXPOSURE_pinned_by_D9</c>
    /// are what you must consciously rewrite — plus legacy Node, or the flag stops being behaviour-neutral.</para>
    /// </summary>
    [Fact]
    public async Task Download_letter_has_no_permission_gate__INHERITED_EXPOSURE_pinned_by_D9()
    {
        var repo = new FakeRepository
        {
            ById = new RequestRowBuilder(id: "req-1", studentId: Student, recommenderId: "teacher-1")
            {
                LetterFileKey = "recommendations/letters/1-abcdef.pdf",
                LetterFileName = "confidential.pdf",
            }.Build(),
        };
        using var factory = Factory(repo);
        using var client = factory.CreateClient();

        // The subject of the letter, holding NO permissions.
        var upload = await Send(
            client, "POST", "/api/v1/recommendations/req-1/letter", FilePart(Pdf, "l.pdf", "application/pdf"),
            permissions: "");
        var download = await Send(client, "GET", "/api/v1/recommendations/req-1/letter", null, permissions: "");

        Assert.Equal(HttpStatusCode.Forbidden, upload.StatusCode);   // gated
        Assert.Equal(HttpStatusCode.OK, download.StatusCode);        // NOT gated — the inherited exposure
        var data = await Data(download);
        Assert.Equal("confidential.pdf", data.GetProperty("filename").GetString());
        Assert.StartsWith("https://signed/read/", data.GetProperty("url").GetString());
    }

    [Fact]
    public async Task An_unrelated_caller_gets_404_not_403_from_the_letter_download()
    {
        var repo = new FakeRepository
        {
            ById = new RequestRowBuilder(id: "req-1", studentId: Student, recommenderId: "teacher-1")
            {
                LetterFileKey = "k", LetterFileName = "l.pdf",
            }.Build(),
        };
        using var factory = Factory(repo);
        using var client = factory.CreateClient();

        var response = await Send(
            client, "GET", "/api/v1/recommendations/req-1/letter", null, permissions: "", userId: "outsider");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("Letter not found", await Message(response));
    }

    // =============================================================================================================
    // GET /dashboard role gate (recommendations.ts:113)
    // =============================================================================================================

    [Fact]
    public async Task Dashboard_forbids_a_student_and_demands_a_school_of_everyone_except_a_teacher()
    {
        using var factory = Factory(new FakeRepository { CallerSchoolId = null });
        using var client = factory.CreateClient();

        var student = await Send(client, "GET", "/api/v1/recommendations/dashboard", null, permissions: "");
        Assert.Equal(HttpStatusCode.Forbidden, student.StatusCode);
        Assert.Equal("Forbidden", await Message(student));

        var counselor = await Send(
            client, "GET", "/api/v1/recommendations/dashboard", null, permissions: "",
            role: FormMapsRoles.Counselor, schoolId: "");
        Assert.Equal(HttpStatusCode.BadRequest, counselor.StatusCode);
        Assert.Equal("No school associated with this account", await Message(counselor));

        // Teachers are scoped by recommenderId, so a school-less teacher is served (recommendations.ts:122).
        var teacher = await Send(
            client, "GET", "/api/v1/recommendations/dashboard", null, permissions: "",
            role: FormMapsRoles.Teacher, schoolId: "");
        Assert.Equal(HttpStatusCode.OK, teacher.StatusCode);
    }

    // =============================================================================================================
    // POST /:id/letter — the multer middleware (recommendations.ts:16 + :195)
    // =============================================================================================================

    [Fact]
    public async Task Letter_upload_with_no_file_part_is_the_file_required_400()
    {
        using var factory = Factory();
        using var client = factory.CreateClient();

        var response = await Upload(client, new MultipartFormDataContent());

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("File required (field name: file)", await Message(response));
    }

    [Fact]
    public async Task A_non_pdf_mimetype_is_dropped_by_the_fileFilter_so_it_reads_as_no_file_at_all()
    {
        // multer's fileFilter is `cb(null, file.mimetype === "application/pdf")`, i.e. a REJECTION leaves req.file
        // undefined — so the message is the file-required one, NOT "Only PDF letters are accepted".
        using var factory = Factory();
        using var client = factory.CreateClient();

        var response = await Upload(client, FilePart(Pdf, "l.png", "image/png"));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("File required (field name: file)", await Message(response));
    }

    [Fact]
    public async Task A_declared_pdf_without_the_magic_header_is_the_only_source_of_the_pdf_400()
    {
        var repo = new FakeRepository
        {
            ById = new RequestRowBuilder("req-1", Student, "teacher-1") { Status = "accepted" }.Build(),
        };
        using var factory = Factory(repo);
        using var client = factory.CreateClient();

        var response = await Upload(
            client, FilePart(Encoding.ASCII.GetBytes("NOTAPDF!"), "l.pdf", "application/pdf"), userId: "teacher-1");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("Only PDF letters are accepted", await Message(response));
    }

    [Fact]
    public async Task A_letter_over_5MB_is_the_global_500_not_the_routes_own_400()
    {
        // multer's limits.fileSize fires in the middleware, before the handler, so its MulterError reaches the
        // app's global error handler ("Internal server error") rather than any message this route owns.
        using var factory = Factory();
        using var client = factory.CreateClient();

        var response = await Upload(client, FilePart(new byte[(5 * 1024 * 1024) + 1], "big.pdf", "application/pdf"));

        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        Assert.Equal("Internal server error", await Message(response));
    }

    // =============================================================================================================
    // zod parity (the exact errors[0].message legacy returns)
    // =============================================================================================================

    [Theory]
    [InlineData("""{"relationship":"T","requestMessage":"m"}""", "Required")]
    [InlineData("""{"recommenderId":"","relationship":"T","requestMessage":"m"}""", "String must contain at least 1 character(s)")]
    [InlineData("""{"recommenderId":"r","relationship":"T","requestMessage":"m","dueDate":"not a date"}""", "Invalid due date")]
    [InlineData("""{"recommenderId":123,"relationship":"T","requestMessage":"m"}""", "Expected string, received number")]
    public async Task Create_returns_the_first_zod_message(string body, string expected)
    {
        using var factory = Factory();
        using var client = factory.CreateClient();

        var response = await Send(client, "POST", "/api/v1/recommendations", Json(body), permissions: "");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(expected, await Message(response));
    }

    [Fact]
    public async Task Respond_rejects_an_action_outside_the_enum()
    {
        using var factory = Factory();
        using var client = factory.CreateClient();

        var response = await Send(
            client, "PUT", "/api/v1/recommendations/req-1/respond", Json("""{"action":"maybe"}"""),
            permissions: FormMapsPermissions.RecommendationsRespond);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(
            "Invalid enum value. Expected 'accept' | 'decline', received 'maybe'", await Message(response));
    }

    [Theory]
    [InlineData("{}", "Required")]
    [InlineData("""{"applicationIds":[]}""", "Array must contain at least 1 element(s)")]
    [InlineData("""{"applicationIds":"a"}""", "Expected array, received string")]
    [InlineData("""{"applicationIds":[""]}""", "String must contain at least 1 character(s)")]
    public async Task Link_applications_returns_the_first_zod_message(string body, string expected)
    {
        using var factory = Factory();
        using var client = factory.CreateClient();

        var response = await Send(
            client, "POST", "/api/v1/recommendations/req-1/link-applications", Json(body), permissions: "");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(expected, await Message(response));
    }

    // ---- helpers ----

    private static HostFactory Factory(FakeRepository? repo = null) => new(repo ?? new FakeRepository());

    private static StringContent Json(string body) => new(body, Encoding.UTF8, "application/json");

    private static MultipartFormDataContent FilePart(byte[] bytes, string filename, string contentType)
    {
        var content = new ByteArrayContent(bytes);
        content.Headers.ContentType = MediaTypeHeaderValue.Parse(contentType);
        return new MultipartFormDataContent { { content, "file", filename } };
    }

    private static Task<HttpResponseMessage> Upload(HttpClient client, HttpContent content, string userId = Student) =>
        Send(
            client, "POST", "/api/v1/recommendations/req-1/letter", content,
            permissions: FormMapsPermissions.RecommendationsRespond, userId: userId);

    private static Task<HttpResponseMessage> Send(
        HttpClient client, string method, string path, HttpContent? content, string permissions,
        string userId = Student, string role = FormMapsRoles.Student, string schoolId = "school-1")
    {
        var request = new HttpRequestMessage(new HttpMethod(method), path) { Content = content };
        request.Headers.Add(DevelopmentRequestContextFactory.UserIdHeader, userId);
        request.Headers.Add(DevelopmentRequestContextFactory.RoleHeader, role);
        request.Headers.Add(DevelopmentRequestContextFactory.SchoolIdHeader, schoolId);
        request.Headers.Add(DevelopmentRequestContextFactory.EmailHeader, $"{userId}@e.st");
        request.Headers.Add(DevelopmentRequestContextFactory.NameHeader, userId);
        request.Headers.Add(DevelopmentRequestContextFactory.PermissionsHeader, permissions);
        return client.SendAsync(request);
    }

    private static async Task<string?> Message(HttpResponseMessage response)
    {
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return doc.RootElement.GetProperty("message").GetString();
    }

    private static async Task<JsonElement> Data(HttpResponseMessage response)
    {
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return doc.RootElement.GetProperty("data").Clone();
    }

    private sealed class HostFactory(FakeRepository repo) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(Environments.Development);
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<IRecommendationsRepository>();
                services.AddSingleton<IRecommendationsRepository>(repo);
                services.RemoveAll<IObjectStorage>();
                services.AddSingleton<IObjectStorage>(new FakeObjectStorage());
                services.RemoveAll<Application.Email.IEmailSender>();
                services.AddSingleton<Application.Email.IEmailSender>(new FakeEmailSender());
                services.RemoveAll<IUserAccessGuard>();
                services.AddSingleton<IUserAccessGuard>(new SelfOnlyAccessGuard());
            });
        }
    }

    /// <summary>
    /// The non-privileged branch of the real <see cref="IUserAccessGuard"/> (access.ts: a caller who is not
    /// Super Admin / school_admin / counselor may only reach their OWN record). Standing in for the DB-backed
    /// guard here; the full allow-list is measured against real policies in <c>RecommendationLetterAccessTests</c>.
    /// </summary>
    private sealed class SelfOnlyAccessGuard : IUserAccessGuard
    {
        public Task<bool> CanAccessUserAsync(
            RequestContext caller, string targetUserId, CancellationToken cancellationToken = default) =>
            Task.FromResult(caller.Actor?.UserId == targetUserId);
    }

    private sealed class RequestRowBuilder(string id, string studentId, string recommenderId)
    {
        public string Status { get; init; } = "submitted";

        public string? LetterFileKey { get; init; }

        public string? LetterFileName { get; init; }

        public RecommendationRequestRow Build() => new(
            id, studentId, recommenderId, Status, "Teacher", "Please", null, null, null,
            LetterFileKey, LetterFileName, null, true, studentId,
            "2026-01-01T00:00:00.000Z", null, "2026-01-01T00:00:00.000Z");
    }

    /// <summary>
    /// Repository double. Only the members these HTTP-level tests reach are implemented; the rest throw, so a test
    /// that quietly starts depending on unstubbed data fails loudly instead of asserting against a default.
    /// </summary>
    private sealed class FakeRepository : IRecommendationsRepository
    {
        public RecommendationRequestRow? ById { get; init; }

        public string? CallerSchoolId { get; init; } = "school-1";

        public Task<RecommendationRequestRow?> FindByIdAsync(
            RequestContext context, string id, CancellationToken cancellationToken = default) =>
            Task.FromResult(ById);

        public Task<OwnedRequest?> FindByIdWithUsersAsync(
            RequestContext context, string id, CancellationToken cancellationToken = default) =>
            Task.FromResult(ById is null
                ? null
                : new OwnedRequest(
                    ById,
                    new UserRef(ById.StudentId, ById.StudentId, $"{ById.StudentId}@e.st"),
                    new UserRef(ById.RecommenderId, ById.RecommenderId, $"{ById.RecommenderId}@e.st")));

        public Task<string?> GetCallerSchoolIdAsync(RequestContext context, CancellationToken cancellationToken = default) =>
            Task.FromResult(CallerSchoolId);

        public Task<IReadOnlyList<DashboardRequestRow>> ListDashboardAsync(
            RequestContext context, DashboardScope scope, string userId, string schoolId,
            CancellationToken cancellationToken = default) =>
            Task.FromResult<IReadOnlyList<DashboardRequestRow>>([]);

        public Task<int> CountTodaysRequestedAsync(
            RequestContext context, string studentId, DateTime todayStart, CancellationToken cancellationToken = default) =>
            throw new NotSupportedException();

        public Task<RecommendationUser?> FindUserAsync(
            RequestContext context, string userId, CancellationToken cancellationToken = default) =>
            throw new NotSupportedException();

        public Task<bool> HasCoachBookingAsync(
            RequestContext context, string studentId, string recommenderUserId, CancellationToken cancellationToken = default) =>
            throw new NotSupportedException();

        public Task<RecommendationRequestRow?> FindByPairAsync(
            RequestContext context, string studentId, string recommenderId, CancellationToken cancellationToken = default) =>
            throw new NotSupportedException();

        public Task<RecommendationRequestRow> ReactivateAsync(
            RequestContext context, string id, CreateRequestInput input, DateTime? dueDate,
            CancellationToken cancellationToken = default) =>
            throw new NotSupportedException();

        public Task<CreateRowResult> CreateAsync(
            RequestContext context, CreateRequestInput input, DateTime? dueDate, CancellationToken cancellationToken = default) =>
            throw new NotSupportedException();

        public Task<IReadOnlyList<StudentRequestRow>> ListForStudentAsync(
            RequestContext context, string studentId, CancellationToken cancellationToken = default) =>
            throw new NotSupportedException();

        public Task<IReadOnlyList<ReceivedRequestRow>> ListReceivedAsync(
            RequestContext context, string recommenderId, CancellationToken cancellationToken = default) =>
            throw new NotSupportedException();

        public Task<IReadOnlyList<EligibleRecommender>> SearchStaffAsync(
            RequestContext context, string schoolId, string search, int limit, CancellationToken cancellationToken = default) =>
            throw new NotSupportedException();

        public Task<IReadOnlyList<EligibleRecommender>> SearchBookedCoachesAsync(
            RequestContext context, string studentId, string search, int limit, CancellationToken cancellationToken = default) =>
            throw new NotSupportedException();

        public Task<RecommendationRequestRow> RespondAsync(
            RequestContext context, string id, string recommenderId, string newStatus, bool writeDeclineReason,
            string? declineReason, CancellationToken cancellationToken = default) =>
            throw new NotSupportedException();

        public Task<RecommendationRequestRow> UpdateStatusAsync(
            RequestContext context, string id, string recommenderId, string status, CancellationToken cancellationToken = default) =>
            throw new NotSupportedException();

        public Task<RecommendationRequestRow> SetLetterAsync(
            RequestContext context, string id, string recommenderId, string letterFileKey, string letterFileName,
            CancellationToken cancellationToken = default) =>
            throw new NotSupportedException();

        public Task<IReadOnlyList<string>> FindOwnedActiveApplicationsAsync(
            RequestContext context, string studentId, IReadOnlyList<string> applicationIds,
            CancellationToken cancellationToken = default) =>
            throw new NotSupportedException();

        public Task<IReadOnlyList<RecommendationApplicationLinkRow>> UpsertApplicationLinksAsync(
            RequestContext context, string requestId, IReadOnlyList<string> applicationIds, string studentId,
            CancellationToken cancellationToken = default) =>
            throw new NotSupportedException();
    }
}
