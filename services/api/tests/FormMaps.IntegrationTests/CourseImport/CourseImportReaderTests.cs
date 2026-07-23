using FormMaps.Application.Auth;
using FormMaps.Infrastructure.CourseImport;
using FormMaps.Infrastructure.Data;
using Npgsql;

namespace FormMaps.IntegrationTests.CourseImport;

/// <summary>
/// Real-DB (Testcontainers, NON-UTC tz) tests for <see cref="CourseImportReader"/> (FM-DOTNET-059 — getImportJob).
/// Pins: the full job view shape; cross-school jobId → null; nonexistent → null; completedAt ISO-Z ('…fffZ') or null;
/// validationErrors round-trips as the structured [{row,errors}] list (deserialized from the stored jsonb).
/// </summary>
public sealed class CourseImportReaderTests : IClassFixture<CourseImportDatabaseFixture>, IAsyncLifetime
{
    private const string School = "school-1";
    private readonly CourseImportDatabaseFixture _fixture;
    private NpgsqlDataSource _dataSource = null!;

    public CourseImportReaderTests(CourseImportDatabaseFixture fixture) => _fixture = fixture;

    public async Task InitializeAsync()
    {
        _dataSource = NpgsqlDataSource.Create(_fixture.ConnectionString);
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand("""TRUNCATE "school_course_import_jobs" """, conn);
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task DisposeAsync() => await _dataSource.DisposeAsync();

    [Fact]
    public async Task Get_returns_full_shape_with_iso_z_and_structured_validation_errors()
    {
        await SeedJobAsync("job-1", School, status: "completed", totalRows: 3, processedRows: 2, failedRows: 1,
            validationErrors: """[{"row":2,"errors":["code and name are required"]}]""",
            completedAt: new DateTime(2026, 7, 22, 15, 30, 45, 123, DateTimeKind.Unspecified));

        var view = await Reader().GetImportJobAsync(Ctx(), School, "job-1");

        Assert.NotNull(view);
        Assert.Equal("job-1", view!.JobId);
        Assert.Equal("completed", view.Status);
        Assert.Equal(3, view.TotalRows);
        Assert.Equal(2, view.ProcessedRows);
        Assert.Equal(1, view.FailedRows);
        Assert.Equal("2026-07-22T15:30:45.123Z", view.CompletedAt);

        var error = Assert.Single(view.ValidationErrors);
        Assert.Equal(2, error.Row);
        Assert.Equal(["code and name are required"], error.Errors);
    }

    [Fact]
    public async Task Get_null_completedAt_when_not_finished()
    {
        await SeedJobAsync("job-proc", School, status: "processing", totalRows: 1, validationErrors: "[]", completedAt: null);

        var view = await Reader().GetImportJobAsync(Ctx(), School, "job-proc");

        Assert.NotNull(view);
        Assert.Null(view!.CompletedAt);
        Assert.Empty(view.ValidationErrors);
    }

    [Fact]
    public async Task Get_cross_school_job_is_null()
    {
        await SeedJobAsync("job-other", "other-school", status: "completed", totalRows: 0, validationErrors: "[]", completedAt: null);
        Assert.Null(await Reader().GetImportJobAsync(Ctx(), School, "job-other"));
    }

    [Fact]
    public async Task Get_nonexistent_job_is_null()
    {
        Assert.Null(await Reader().GetImportJobAsync(Ctx(), School, "does-not-exist"));
    }

    // ---- getImportFailuresCsv (FM-060) ----

    [Fact]
    public async Task Failures_csv_missing_or_cross_school_is_null()
    {
        Assert.Null(await Reader().GetImportFailuresCsvAsync(Ctx(), School, "nope"));
        await SeedJobAsync("job-x", "other-school", status: "completed", totalRows: 0, validationErrors: "[]", completedAt: null);
        Assert.Null(await Reader().GetImportFailuresCsvAsync(Ctx(), School, "job-x"));
    }

    [Fact]
    public async Task Failures_csv_no_errors_is_header_only()
    {
        await SeedJobAsync("job-e", School, status: "completed", totalRows: 0, validationErrors: "[]", completedAt: null);
        Assert.Equal("row_number,errors,raw_data", await Reader().GetImportFailuresCsvAsync(Ctx(), School, "job-e"));
    }

    [Fact]
    public async Task Failures_csv_builds_lines_ordered_with_csvsafe_and_stringified_rawrow()
    {
        await SeedJobAsync("job-f", School, status: "completed", totalRows: 3, validationErrors: "[]", completedAt: null);
        // Insert out of rowNumber order to prove ORDER BY rowNumber ASC; row 2 carries a formula-leader error (csvSafe
        // prefixes '); rawRow keys are distinct lengths so the Postgres jsonb order is deterministic (shorter first).
        await InsertErrorAsync("job-f", 2, ["=cmd", "two"], """{"code":"B","department":"Sci"}""");
        await InsertErrorAsync("job-f", 1, ["code and name are required"], """{"code":"A"}""");

        var csv = await Reader().GetImportFailuresCsvAsync(Ctx(), School, "job-f");

        var lines = csv!.Split("\n");
        Assert.Equal("row_number,errors,raw_data", lines[0]);
        // row 1 first (ordered), rawRow JSON.stringify'd + quote-doubled, CSV-quoted.
        Assert.Equal("1,\"code and name are required\",\"{\"\"code\"\":\"\"A\"\"}\"", lines[1]);
        // row 2: errors "=cmd; two" → csvSafe prefixes ' → "'=cmd; two"; two-key rawRow shorter-key-first.
        Assert.Equal("2,\"'=cmd; two\",\"{\"\"code\"\":\"\"B\"\",\"\"department\"\":\"\"Sci\"\"}\"", lines[2]);
    }

    // ---- helpers ----

    private async Task InsertErrorAsync(string jobId, int rowNumber, string[] errorMessages, string rawRowJson)
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "school_course_import_errors"
                ("id","jobId","rowNumber","rawRow","errorMessages","updatedAt")
            VALUES (gen_random_uuid()::text, @jid, @rn, @raw::jsonb, @msgs, now())
            """, conn);
        cmd.Parameters.AddWithValue("jid", jobId);
        cmd.Parameters.AddWithValue("rn", rowNumber);
        cmd.Parameters.AddWithValue("raw", rawRowJson);
        cmd.Parameters.AddWithValue("msgs", errorMessages);
        await cmd.ExecuteNonQueryAsync();
    }

    private CourseImportReader Reader() =>
        new(new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()));

    private static RequestContext Ctx() =>
        RequestContext.Authenticated(
            new RequestActor("admin-1", "school-admin", "a@e.st", "Admin"),
            schoolId: School, permissions: Array.Empty<string>(),
            tokenSource: TokenSource.DevelopmentHeader, isDevelopmentOverride: true);

    private async Task SeedJobAsync(
        string id, string school, string status, int totalRows, string validationErrors, DateTime? completedAt,
        int processedRows = 0, int failedRows = 0)
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "school_course_import_jobs"
                ("id","schoolId","uploaderUserId","filename","status","totalRows","processedRows","failedRows",
                 "validationErrors","completedAt","updatedAt")
            VALUES (@id,@sid,'uploader','import.csv',CAST(@status AS "ImportJobStatus"),@total,@processed,@failed,
                    @ve::jsonb,@completed,now())
            """, conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("sid", school);
        cmd.Parameters.AddWithValue("status", status);
        cmd.Parameters.AddWithValue("total", totalRows);
        cmd.Parameters.AddWithValue("processed", processedRows);
        cmd.Parameters.AddWithValue("failed", failedRows);
        cmd.Parameters.AddWithValue("ve", validationErrors);
        cmd.Parameters.AddWithValue("completed", (object?)completedAt ?? DBNull.Value);
        await cmd.ExecuteNonQueryAsync();
    }
}
