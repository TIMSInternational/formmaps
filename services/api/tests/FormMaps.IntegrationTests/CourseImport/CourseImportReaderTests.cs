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

    // ---- helpers ----

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
