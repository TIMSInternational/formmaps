using System.Text;
using FormMaps.Application.Auth;
using FormMaps.Application.Storage;
using FormMaps.Application.Uploads;

namespace FormMaps.Api.Endpoints;

/// <summary>
/// File uploads (FM-DOTNET-088 — routes/upload.ts, mounted /api/v1/upload). The FIRST multipart + S3 surface in the
/// .NET service. Six POST endpoints under ONE dark flag <c>FORMMAPS_ROUTE_UPLOAD_TO_DOTNET</c>, all
/// <c>multer.single("file")</c> + self-scoped (authenticate + tenantContext → RequireIdentity only, caller RLS).
/// Each: parse the "file" part → per-endpoint mimetype + magic-byte gates → S3 upload (presigned 24h URL) → optional
/// DB write. Any thrown error (S3/DB) → 500 "Upload failed" (the route's catch message — NOT "Internal server error").
///
/// <para>express.json runs before the router but a multipart body isn't JSON, so a NON-form request reaches the
/// handler with no "file" part → the file-required 400 (Node: multer sets no req.file → the same 400).</para>
/// </summary>
public static class UploadEndpoints
{
    private static readonly string[] ImageTypes = ["image/png", "image/jpeg", "image/jpg", "image/svg+xml", "image/webp"];
    private static readonly string[] DocTypes = ["text/csv", "application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain"];
    private static readonly string[] PortfolioTypes = ["image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
    private const int MaxCsvRows = 10000;
    private const int MaxCsvFileSize = 5 * 1024 * 1024;
    private const long MaxFileSize = 5 * 1024 * 1024; // multer limits.fileSize — the global 5MB upload cap.

    public static IEndpointRouteBuilder MapUploadEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/upload").WithTags("Upload").DisableAntiforgery();
        group.MapPost("/school-logo", SchoolLogoAsync);
        group.MapPost("/profile-image", ProfileImageAsync);
        group.MapPost("/resume", ResumeAsync);
        group.MapPost("/course-import", (HttpContext http, IRequestContextAccessor accessor, IProtectedRequestGuard guard, IObjectStorage storage, CancellationToken ct)
            => CsvImportAsync(http, accessor, guard, storage, "imports/courses", ct));
        group.MapPost("/grade-import", (HttpContext http, IRequestContextAccessor accessor, IProtectedRequestGuard guard, IObjectStorage storage, CancellationToken ct)
            => CsvImportAsync(http, accessor, guard, storage, "imports/grades", ct));
        group.MapPost("/portfolio-attachment", PortfolioAttachmentAsync);
        return app;
    }

    private static async Task<IResult> SchoolLogoAsync(
        HttpContext http, IRequestContextAccessor accessor, IProtectedRequestGuard guard,
        IObjectStorage storage, IUploadRepository repo, CancellationToken ct)
    {
        var (context, authError) = RequireSelf(accessor, guard);
        if (authError is not null) return authError;

        try
        {
            // multer parses + size-checks the file BEFORE the handler, so TooLarge (5MB) precedes the schoolId
            // gate; the file-PRESENCE check stays after it (Node's if(!schoolId) runs before if(!file)).
            var read = await ReadFileAsync(http, ct);
            if (read.Status == FileReadStatus.TooLarge) return InternalServerError();

            var schoolId = await repo.GetCallerSchoolIdAsync(context, ct);
            if (string.IsNullOrEmpty(schoolId)) return BadRequest("No school");
            if (read.Status == FileReadStatus.NoFile) return BadRequest("File required (field name: file)");
            var file = read.File!;
            if (!ImageTypes.Contains(file.ContentType)) return BadRequest("Only PNG, JPG, SVG, WebP allowed");
            if (!FileUploadValidation.ValidateMagicBytes(file.Bytes, file.ContentType)) return BadRequest("File content does not match declared type");

            var stored = await storage.UploadAndGetUrlAsync("schools/logos", file.FileName, file.Bytes, file.ContentType, ct);
            await repo.UpdateSchoolLogoAsync(context, schoolId, stored.Url, ct);

            return Results.Ok(new { success = true, data = new { logoUrl = stored.Url, key = stored.Key } });
        }
        catch
        {
            return UploadFailed();
        }
    }

    private static async Task<IResult> ProfileImageAsync(
        HttpContext http, IRequestContextAccessor accessor, IProtectedRequestGuard guard,
        IObjectStorage storage, IUploadRepository repo, CancellationToken ct)
    {
        var (context, authError) = RequireSelf(accessor, guard);
        if (authError is not null) return authError;

        try
        {
            var read = await ReadFileAsync(http, ct);
            if (read.Status == FileReadStatus.TooLarge) return InternalServerError();
            if (read.Status == FileReadStatus.NoFile) return BadRequest("File required");
            var file = read.File!;
            if (!ImageTypes.Contains(file.ContentType)) return BadRequest("Only image files allowed");
            if (!FileUploadValidation.ValidateMagicBytes(file.Bytes, file.ContentType)) return BadRequest("File content does not match declared type");

            var stored = await storage.UploadAndGetUrlAsync("profiles", file.FileName, file.Bytes, file.ContentType, ct);
            await repo.UpdateCoachImageAsync(context, context.Actor!.UserId, stored.Url, ct);

            return Results.Ok(new { success = true, data = new { imageUrl = stored.Url, key = stored.Key } });
        }
        catch
        {
            return UploadFailed();
        }
    }

    private static async Task<IResult> ResumeAsync(
        HttpContext http, IRequestContextAccessor accessor, IProtectedRequestGuard guard,
        IObjectStorage storage, IUploadRepository repo, CancellationToken ct)
    {
        var (context, authError) = RequireSelf(accessor, guard);
        if (authError is not null) return authError;

        try
        {
            var read = await ReadFileAsync(http, ct);
            if (read.Status == FileReadStatus.TooLarge) return InternalServerError();
            if (read.Status == FileReadStatus.NoFile) return BadRequest("File required");
            var file = read.File!;
            if (!DocTypes.Contains(file.ContentType) && !ImageTypes.Contains(file.ContentType))
                return BadRequest("PDF, DOCX, TXT, or image files allowed");
            if (!FileUploadValidation.ValidateMagicBytes(file.Bytes, file.ContentType)) return BadRequest("File content does not match declared type");

            var stored = await storage.UploadAndGetUrlAsync("resumes", file.FileName, file.Bytes, file.ContentType, ct);
            var extractedText = file.ContentType is "text/plain" or "text/csv" ? Encoding.UTF8.GetString(file.Bytes) : null;

            return Results.Ok(new
            {
                success = true,
                data = new { fileUrl = stored.Url, key = stored.Key, filename = FileUploadValidation.SanitizeFilename(file.FileName), extractedText },
            });
        }
        catch
        {
            return UploadFailed();
        }
    }

    private static async Task<IResult> CsvImportAsync(
        HttpContext http, IRequestContextAccessor accessor, IProtectedRequestGuard guard,
        IObjectStorage storage, string folder, CancellationToken ct)
    {
        var (context, authError) = RequireSelf(accessor, guard);
        if (authError is not null) return authError;

        try
        {
            var read = await ReadFileAsync(http, ct);
            if (read.Status == FileReadStatus.TooLarge) return InternalServerError();
            if (read.Status == FileReadStatus.NoFile) return BadRequest("CSV file required");
            var file = read.File!;
            if (file.ContentType != "text/csv" && !file.FileName.ToLowerInvariant().EndsWith(".csv", StringComparison.Ordinal))
                return BadRequest("Only CSV files allowed");
            // Dead code, kept to mirror upload.ts: multer's 5MB (TooLarge above) fires first, so a >5MB CSV is 500,
            // never this 400 — same as Node, where the explicit check sits behind multer's limit.
            if (file.Bytes.Length > MaxCsvFileSize) return BadRequest("File too large (max 5MB)");

            // Node uploads to S3 BEFORE parsing/validating the content — so an empty/oversized-row CSV is stored first.
            var stored = await storage.UploadAndGetUrlAsync(folder, file.FileName, file.Bytes, "text/csv", ct);

            var content = Encoding.UTF8.GetString(file.Bytes);
            var lineCount = content.Split('\n').Count(l => l.Trim().Length > 0);
            if (lineCount == 0) return BadRequest("CSV file is empty");
            if (lineCount - 1 > MaxCsvRows) return BadRequest($"CSV exceeds maximum {MaxCsvRows} rows (got {lineCount - 1})");

            var parsed = FileUploadValidation.ParseCsv(content);
            return Results.Ok(new
            {
                success = true,
                data = new
                {
                    fileUrl = stored.Url,
                    key = stored.Key,
                    filename = FileUploadValidation.SanitizeFilename(file.FileName),
                    totalRows = parsed.Rows.Count,
                    headers = parsed.Headers,
                    rows = parsed.Rows,
                },
            });
        }
        catch
        {
            return UploadFailed();
        }
    }

    private static async Task<IResult> PortfolioAttachmentAsync(
        HttpContext http, IRequestContextAccessor accessor, IProtectedRequestGuard guard,
        IObjectStorage storage, IUploadRepository repo, CancellationToken ct)
    {
        var (context, authError) = RequireSelf(accessor, guard);
        if (authError is not null) return authError;

        try
        {
            var read = await ReadFileAsync(http, ct);
            if (read.Status == FileReadStatus.TooLarge) return InternalServerError();
            if (read.Status == FileReadStatus.NoFile) return BadRequest("File required");
            var file = read.File!;
            if (!PortfolioTypes.Contains(file.ContentType)) return BadRequest("File type not allowed. Accepted: images, PDF, Word documents");
            if (!FileUploadValidation.ValidateMagicBytes(file.Bytes, file.ContentType)) return BadRequest("File content does not match declared type");

            var stored = await storage.UploadAndGetUrlAsync("portfolio", file.FileName, file.Bytes, file.ContentType, ct);
            return Results.Ok(new
            {
                success = true,
                data = new
                {
                    fileUrl = stored.Url,
                    key = stored.Key,
                    filename = FileUploadValidation.SanitizeFilename(file.FileName),
                    contentType = file.ContentType,
                    size = file.Bytes.Length,
                },
            });
        }
        catch
        {
            return UploadFailed();
        }
    }

    // Read the "file" part (multer.single("file")). A non-multipart request (e.g. JSON) has no form → no file → null,
    // which each handler maps to its file-required 400 (matches multer leaving req.file undefined).
    private static async Task<FileRead> ReadFileAsync(HttpContext http, CancellationToken ct)
    {
        if (!http.Request.HasFormContentType) return FileRead.None;

        IFormFile? file;
        try
        {
            var form = await http.Request.ReadFormAsync(ct);
            file = form.Files["file"];
        }
        catch (Exception ex) when (ex is InvalidDataException or IOException)
        {
            // An empty/unparseable multipart body → no file, mirroring multer leaving req.file undefined (→ the
            // file-required 400). A genuinely malformed multipart in Node is a multer error → 500; here it degrades
            // to the file-required 400, an accepted divergence on a pathological body (the "no file part" and
            // "wrong field name" real cases both correctly yield 400).
            return FileRead.None;
        }

        if (file is null) return FileRead.None;

        // multer's global limits.fileSize = 5MB rejects a larger file IN THE MIDDLEWARE, before the handler — its
        // MulterError hits the app's global error handler → 500 "Internal server error" (NOT the handler's "Upload
        // failed"). Checked on the declared length (no full read) so it also bounds memory + the S3 write.
        if (file.Length > MaxFileSize) return FileRead.TooLarge;

        using var stream = new MemoryStream();
        await file.CopyToAsync(stream, ct);
        // busboy strips Content-Type parameters (e.g. "; charset=utf-8") → multer's file.mimetype is the bare type.
        var contentType = (file.ContentType ?? "").Split(';', 2)[0].Trim();
        return FileRead.Ok(new UploadedFile(file.FileName ?? "", contentType, stream.ToArray()));
    }

    private static (RequestContext Context, IResult? Error) RequireSelf(IRequestContextAccessor accessor, IProtectedRequestGuard guard)
    {
        var context = accessor.Current;
        var decision = guard.RequireIdentity(context);
        return decision.Allowed
            ? (context, null)
            : (context, Results.Json(new { success = false, code = decision.Code, message = decision.Message }, statusCode: decision.StatusCode));
    }

    private static IResult BadRequest(string message) =>
        Results.Json(new { success = false, message }, statusCode: StatusCodes.Status400BadRequest);

    private static IResult UploadFailed() =>
        Results.Json(new { success = false, message = "Upload failed" }, statusCode: StatusCodes.Status500InternalServerError);

    // multer's own error (e.g. the 5MB limit) is raised before the handler runs → the app's global 500 handler,
    // whose message is "Internal server error" (distinct from the handler catch's "Upload failed").
    private static IResult InternalServerError() =>
        Results.Json(new { success = false, message = "Internal server error" }, statusCode: StatusCodes.Status500InternalServerError);

    private sealed record UploadedFile(string FileName, string ContentType, byte[] Bytes);

    private enum FileReadStatus
    {
        Ok,
        NoFile,
        TooLarge,
    }

    private sealed record FileRead(FileReadStatus Status, UploadedFile? File)
    {
        public static readonly FileRead None = new(FileReadStatus.NoFile, null);
        public static readonly FileRead TooLarge = new(FileReadStatus.TooLarge, null);
        public static FileRead Ok(UploadedFile file) => new(FileReadStatus.Ok, file);
    }
}
