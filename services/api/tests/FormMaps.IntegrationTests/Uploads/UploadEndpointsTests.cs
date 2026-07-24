using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using FormMaps.Api.Auth;
using FormMaps.Application.Auth;
using FormMaps.Application.Storage;
using FormMaps.Application.Uploads;
using FormMaps.Domain.Auth;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;

namespace FormMaps.IntegrationTests.Uploads;

/// <summary>
/// Guard chain + HTTP mapping + multipart handling for the six upload endpoints (FM-DOTNET-088; storage + repo
/// faked). Pins: anon → 401; the per-endpoint file-required / mimetype / magic-byte 400s (with exact messages);
/// school-logo no-school → 400 "No school" and the school.logoUrl write; profile-image → coach.imageUrl write;
/// resume extractedText (text vs binary); CSV import parse (headers/rows/totalRows) + non-CSV/too-large/empty 400s;
/// portfolio size/contentType echo; and a storage throw → 500 "Upload failed".
/// </summary>
public sealed class UploadEndpointsTests
{
    private static readonly byte[] Png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    private static readonly byte[] Pdf = Encoding.ASCII.GetBytes("%PDF-1.7 body");

    [Theory]
    [InlineData("/api/v1/upload/school-logo")]
    [InlineData("/api/v1/upload/profile-image")]
    [InlineData("/api/v1/upload/resume")]
    [InlineData("/api/v1/upload/course-import")]
    [InlineData("/api/v1/upload/grade-import")]
    [InlineData("/api/v1/upload/portfolio-attachment")]
    public async Task Anonymous_is_401(string path)
    {
        using var factory = new Factory(new FakeStorage(), new FakeRepo());
        using var client = factory.CreateClient();

        var response = await client.PostAsync(path, FilePart(Png, "logo.png", "image/png"));

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    // ---- school-logo ----

    [Fact]
    public async Task School_logo_no_school_is_400()
    {
        using var factory = new Factory(new FakeStorage(), new FakeRepo { SchoolId = null });
        using var client = factory.CreateClient();

        var response = await Send(client, "/api/v1/upload/school-logo", FilePart(Png, "logo.png", "image/png"));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("No school", await Message(response));
    }

    [Fact]
    public async Task School_logo_missing_file_is_400()
    {
        using var factory = new Factory(new FakeStorage(), new FakeRepo());
        using var client = factory.CreateClient();

        var response = await Send(client, "/api/v1/upload/school-logo", new MultipartFormDataContent());

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("File required (field name: file)", await Message(response));
    }

    [Fact]
    public async Task School_logo_wrong_mimetype_is_400()
    {
        using var factory = new Factory(new FakeStorage(), new FakeRepo());
        using var client = factory.CreateClient();

        var response = await Send(client, "/api/v1/upload/school-logo", FilePart(Pdf, "x.pdf", "application/pdf"));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("Only PNG, JPG, SVG, WebP allowed", await Message(response));
    }

    [Fact]
    public async Task School_logo_bad_magic_bytes_is_400()
    {
        using var factory = new Factory(new FakeStorage(), new FakeRepo());
        using var client = factory.CreateClient();

        var response = await Send(client, "/api/v1/upload/school-logo", FilePart([0, 1, 2, 3], "logo.png", "image/png"));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("File content does not match declared type", await Message(response));
    }

    [Fact]
    public async Task School_logo_happy_uploads_and_writes()
    {
        var repo = new FakeRepo { SchoolId = "school-1" };
        using var factory = new Factory(new FakeStorage(), repo);
        using var client = factory.CreateClient();

        var response = await Send(client, "/api/v1/upload/school-logo", FilePart(Png, "logo.png", "image/png"));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var data = await Data(response);
        Assert.Equal("https://signed/url", data.GetProperty("logoUrl").GetString());
        Assert.Equal("stored-key", data.GetProperty("key").GetString());
        Assert.Equal(("school-1", "https://signed/url"), repo.SchoolLogoWrite);
    }

    // ---- profile-image ----

    [Fact]
    public async Task Profile_image_happy_writes_coach_image()
    {
        var repo = new FakeRepo();
        using var factory = new Factory(new FakeStorage(), repo);
        using var client = factory.CreateClient();

        var response = await Send(client, "/api/v1/upload/profile-image", FilePart(Png, "me.png", "image/png"));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var data = await Data(response);
        Assert.Equal("https://signed/url", data.GetProperty("imageUrl").GetString());
        Assert.Equal(("admin-1", "https://signed/url"), repo.CoachImageWrite);
    }

    // ---- resume ----

    [Fact]
    public async Task Resume_binary_has_null_extracted_text()
    {
        using var factory = new Factory(new FakeStorage(), new FakeRepo());
        using var client = factory.CreateClient();

        var response = await Send(client, "/api/v1/upload/resume", FilePart(Pdf, "cv.pdf", "application/pdf"));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var data = await Data(response);
        Assert.Equal("cv.pdf", data.GetProperty("filename").GetString());
        Assert.Equal(JsonValueKind.Null, data.GetProperty("extractedText").ValueKind);
    }

    [Fact]
    public async Task Resume_text_extracts_content()
    {
        using var factory = new Factory(new FakeStorage(), new FakeRepo());
        using var client = factory.CreateClient();

        var response = await Send(client, "/api/v1/upload/resume", FilePart(Encoding.UTF8.GetBytes("hello resume"), "r.txt", "text/plain"));

        var data = await Data(response);
        Assert.Equal("hello resume", data.GetProperty("extractedText").GetString());
    }

    [Fact]
    public async Task Resume_content_type_parameters_are_stripped()
    {
        // "text/plain; charset=utf-8" must pass the allowlist (busboy strips params → bare "text/plain").
        using var factory = new Factory(new FakeStorage(), new FakeRepo());
        using var client = factory.CreateClient();

        var response = await Send(client, "/api/v1/upload/resume",
            FilePart(Encoding.UTF8.GetBytes("hello text"), "r.txt", "text/plain; charset=utf-8"));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("hello text", (await Data(response)).GetProperty("extractedText").GetString());
    }

    [Fact]
    public async Task Over_5mb_file_is_500_internal_server_error()
    {
        // multer's 5MB limit fires in the middleware → the global handler's 500 "Internal server error".
        using var factory = new Factory(new FakeStorage(), new FakeRepo());
        using var client = factory.CreateClient();

        var big = new byte[5 * 1024 * 1024 + 1];
        big[0] = 0x25; big[1] = 0x50; big[2] = 0x44; big[3] = 0x46; // "%PDF"
        var response = await Send(client, "/api/v1/upload/resume", FilePart(big, "cv.pdf", "application/pdf"));

        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        Assert.Equal("Internal server error", await Message(response));
    }

    [Fact]
    public async Task Over_5mb_csv_is_500_not_the_dead_file_too_large_400()
    {
        // The explicit "File too large (max 5MB)" 400 is dead in Node (multer 5MB fires first) → a >5MB CSV is 500.
        using var factory = new Factory(new FakeStorage(), new FakeRepo());
        using var client = factory.CreateClient();

        var big = new byte[5 * 1024 * 1024 + 1];
        var response = await Send(client, "/api/v1/upload/course-import", FilePart(big, "big.csv", "text/csv"));

        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        Assert.Equal("Internal server error", await Message(response));
    }

    // ---- csv import ----

    [Fact]
    public async Task Course_import_non_csv_is_400()
    {
        using var factory = new Factory(new FakeStorage(), new FakeRepo());
        using var client = factory.CreateClient();

        var response = await Send(client, "/api/v1/upload/course-import", FilePart(Png, "x.png", "image/png"));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("Only CSV files allowed", await Message(response));
    }

    [Fact]
    public async Task Course_import_empty_content_is_400()
    {
        using var factory = new Factory(new FakeStorage(), new FakeRepo());
        using var client = factory.CreateClient();

        var response = await Send(client, "/api/v1/upload/course-import", FilePart(Encoding.UTF8.GetBytes("   "), "e.csv", "text/csv"));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("CSV file is empty", await Message(response));
    }

    [Fact]
    public async Task Grade_import_happy_parses_rows()
    {
        using var factory = new Factory(new FakeStorage(), new FakeRepo());
        using var client = factory.CreateClient();

        var response = await Send(client, "/api/v1/upload/grade-import",
            FilePart(Encoding.UTF8.GetBytes("Student,Grade\nAda,A\nBob,B"), "g.csv", "text/csv"));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var data = await Data(response);
        Assert.Equal(2, data.GetProperty("totalRows").GetInt32());
        Assert.Equal(["Student", "Grade"], data.GetProperty("headers").EnumerateArray().Select(e => e.GetString()!).ToArray());
        Assert.Equal("A", data.GetProperty("rows")[0].GetProperty("grade").GetString());
    }

    [Fact]
    public async Task Course_import_accepts_by_extension_when_mimetype_generic()
    {
        using var factory = new Factory(new FakeStorage(), new FakeRepo());
        using var client = factory.CreateClient();

        // mimetype not text/csv but filename ends .csv → accepted
        var response = await Send(client, "/api/v1/upload/course-import",
            FilePart(Encoding.UTF8.GetBytes("a,b\n1,2"), "data.csv", "application/octet-stream"));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    // ---- portfolio ----

    [Fact]
    public async Task Portfolio_happy_echoes_size_and_content_type()
    {
        using var factory = new Factory(new FakeStorage(), new FakeRepo());
        using var client = factory.CreateClient();

        var response = await Send(client, "/api/v1/upload/portfolio-attachment", FilePart(Pdf, "port.pdf", "application/pdf"));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var data = await Data(response);
        Assert.Equal("application/pdf", data.GetProperty("contentType").GetString());
        Assert.Equal(Pdf.Length, data.GetProperty("size").GetInt32());
    }

    // ---- error path ----

    [Fact]
    public async Task Storage_throw_is_500_upload_failed()
    {
        using var factory = new Factory(new FakeStorage { Throw = true }, new FakeRepo());
        using var client = factory.CreateClient();

        var response = await Send(client, "/api/v1/upload/resume", FilePart(Pdf, "cv.pdf", "application/pdf"));

        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        Assert.Equal("Upload failed", await Message(response));
    }

    // ---- helpers ----

    private static MultipartFormDataContent FilePart(byte[] bytes, string filename, string contentType)
    {
        var content = new ByteArrayContent(bytes);
        content.Headers.ContentType = MediaTypeHeaderValue.Parse(contentType); // handles "type/subtype; param=..."
        return new MultipartFormDataContent { { content, "file", filename } };
    }

    private static Task<HttpResponseMessage> Send(HttpClient client, string path, HttpContent content)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, path) { Content = content };
        request.Headers.Add(DevelopmentRequestContextFactory.UserIdHeader, "admin-1");
        request.Headers.Add(DevelopmentRequestContextFactory.RoleHeader, FormMapsRoles.SchoolAdmin);
        request.Headers.Add(DevelopmentRequestContextFactory.EmailHeader, "admin@example.test");
        request.Headers.Add(DevelopmentRequestContextFactory.NameHeader, "Admin");
        request.Headers.Add(DevelopmentRequestContextFactory.PermissionsHeader, FormMapsPermissions.SchoolManage);
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

    private sealed class Factory(FakeStorage storage, FakeRepo repo) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(Environments.Development);
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<IObjectStorage>();
                services.AddSingleton<IObjectStorage>(storage);
                services.RemoveAll<IUploadRepository>();
                services.AddSingleton<IUploadRepository>(repo);
            });
        }
    }

    private sealed class FakeStorage : IObjectStorage
    {
        public bool Throw { get; init; }

        public Task<StoredObject> UploadAndGetUrlAsync(
            string folder, string filename, byte[] body, string contentType, CancellationToken cancellationToken = default)
        {
            if (Throw)
            {
                throw new InvalidOperationException("s3 down");
            }

            return Task.FromResult(new StoredObject("stored-key", "https://signed/url"));
        }
    }

    private sealed class FakeRepo : IUploadRepository
    {
        public string? SchoolId { get; init; } = "school-1";
        public (string SchoolId, string Url)? SchoolLogoWrite { get; private set; }
        public (string UserId, string Url)? CoachImageWrite { get; private set; }

        public Task<string?> GetCallerSchoolIdAsync(RequestContext context, CancellationToken cancellationToken = default) =>
            Task.FromResult(SchoolId);

        public Task UpdateSchoolLogoAsync(RequestContext context, string schoolId, string logoUrl, CancellationToken cancellationToken = default)
        {
            SchoolLogoWrite = (schoolId, logoUrl);
            return Task.CompletedTask;
        }

        public Task UpdateCoachImageAsync(RequestContext context, string userId, string imageUrl, CancellationToken cancellationToken = default)
        {
            CoachImageWrite = (userId, imageUrl);
            return Task.CompletedTask;
        }
    }
}
