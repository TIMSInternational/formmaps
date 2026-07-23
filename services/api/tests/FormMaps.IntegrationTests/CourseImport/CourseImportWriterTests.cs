using FormMaps.Application.Auth;
using FormMaps.Application.CourseImport;
using FormMaps.Infrastructure.CourseImport;
using FormMaps.Infrastructure.Data;
using Npgsql;

namespace FormMaps.IntegrationTests.CourseImport;

/// <summary>
/// Real-DB (Testcontainers, NON-UTC tz) tests for <see cref="CourseImportWriter"/> (FM-DOTNET-059 — importCourses).
/// Pins: create-new-course; update-existing UNDEFINED-OMIT asymmetry (absent credits/description keep existing;
/// present set; present-empty gradeLevels [] overwrites, absent keeps); validation fail (missing code/name → error row
/// + validationErrors + failedRows, no course written); mixed-batch counts; job finalized status='completed' +
/// completedAt set + validationErrors jsonb persisted; updatedAt bumped on update (@updatedAt parity); NaN-credits row
/// fails-not-crashes and is counted; atomic-commit (all rows visible after the call). A SKIPPED documentation test
/// records legacy's NON-atomic per-row autocommit (the ratified divergence).
/// </summary>
public sealed class CourseImportWriterTests : IClassFixture<CourseImportDatabaseFixture>, IAsyncLifetime
{
    private const string School = "school-1";
    private const string Uploader = "admin-1";
    private readonly CourseImportDatabaseFixture _fixture;
    private NpgsqlDataSource _dataSource = null!;

    public CourseImportWriterTests(CourseImportDatabaseFixture fixture) => _fixture = fixture;

    public async Task InitializeAsync()
    {
        _dataSource = NpgsqlDataSource.Create(_fixture.ConnectionString);
        await using var conn = await _dataSource.OpenConnectionAsync();
        foreach (var t in new[] { "school_courses", "school_course_import_jobs", "school_course_import_errors" })
        {
            await using var cmd = new NpgsqlCommand($"TRUNCATE \"{t}\"", conn);
            await cmd.ExecuteNonQueryAsync();
        }
    }

    public async Task DisposeAsync() => await _dataSource.DisposeAsync();

    [Fact]
    public async Task Create_new_course_writes_all_columns()
    {
        var rows = new[]
        {
            Row(code: "MATH1", name: "Algebra I", department: "Math", credits: "1.5",
                gradeLevels: [9, 10], description: "Intro algebra"),
        };

        var result = await Writer().ImportCoursesAsync(Ctx(), School, Uploader, rows, "courses.csv");

        Assert.Equal(1, result.TotalRows);
        Assert.Equal(1, result.ValidRows);
        Assert.Equal(0, result.InvalidRows);
        Assert.Empty(result.ValidationErrors);

        var course = await ReadCourseAsync("MATH1");
        Assert.NotNull(course);
        Assert.Equal("Algebra I", course!.Value.Name);
        Assert.Equal("Math", course.Value.Department);
        Assert.Equal(1.5, course.Value.Credits);
        Assert.Equal([9, 10], course.Value.GradeLevels);
        Assert.Equal("Intro algebra", course.Value.Description);
    }

    [Fact]
    public async Task Create_defaults_department_credits_gradelevels_and_raw_description()
    {
        // Absent department → "" ; absent credits → 0 ; absent gradeLevels → [] ; absent description → NULL (RAW).
        var rows = new[] { Row(code: "SCI1", name: "Science") };

        await Writer().ImportCoursesAsync(Ctx(), School, Uploader, rows, "import.csv");

        var course = await ReadCourseAsync("SCI1");
        Assert.NotNull(course);
        Assert.Equal("", course!.Value.Department);
        Assert.Equal(0, course.Value.Credits);
        Assert.Empty(course.Value.GradeLevels);
        Assert.Null(course.Value.Description); // RAW: absent → NULL (NOT "")
    }

    [Fact]
    public async Task Create_empty_string_description_is_stored_verbatim()
    {
        // CREATE description is RAW: a present empty string is stored as "" (NOT NULL, NOT the `|| ""` form).
        var rows = new[] { Row(code: "ART1", name: "Art", description: "") };

        await Writer().ImportCoursesAsync(Ctx(), School, Uploader, rows, "import.csv");

        var course = await ReadCourseAsync("ART1");
        Assert.NotNull(course);
        Assert.Equal("", course!.Value.Description);
    }

    [Fact]
    public async Task Update_existing_omits_absent_credits_description_and_keeps_them()
    {
        var early = new DateTime(2020, 1, 1, 0, 0, 0, DateTimeKind.Unspecified);
        await SeedCourseAsync("MATH1", name: "Old Name", department: "Math", credits: 3m,
            gradeLevels: [9, 10], description: "Old desc", updatedAt: early);

        // name ALWAYS updated; department present → set; credits/description ABSENT → kept; gradeLevels ABSENT → kept.
        var rows = new[] { Row(code: "MATH1", name: "New Name", department: "Mathematics") };
        await Writer().ImportCoursesAsync(Ctx(), School, Uploader, rows, "import.csv");

        var course = await ReadCourseAsync("MATH1");
        Assert.NotNull(course);
        Assert.Equal("New Name", course!.Value.Name);
        Assert.Equal("Mathematics", course.Value.Department);
        Assert.Equal(3, course.Value.Credits);          // absent credits → kept
        Assert.Equal("Old desc", course.Value.Description); // absent description → kept
        Assert.Equal([9, 10], course.Value.GradeLevels);   // absent gradeLevels → kept
        Assert.True(course.Value.UpdatedAt > early);       // @updatedAt bumped
    }

    [Fact]
    public async Task Update_department_falls_back_to_existing_when_row_department_falsy()
    {
        await SeedCourseAsync("MATH1", name: "Old", department: "Math", credits: 1m);

        // row.department || existing.department → empty string is falsy → keeps "Math".
        var rows = new[] { Row(code: "MATH1", name: "New", department: "") };
        await Writer().ImportCoursesAsync(Ctx(), School, Uploader, rows, "import.csv");

        var course = await ReadCourseAsync("MATH1");
        Assert.Equal("Math", course!.Value.Department);
    }

    [Fact]
    public async Task Update_present_fields_are_written_and_empty_gradelevels_overwrites()
    {
        await SeedCourseAsync("MATH1", name: "Old", department: "Math", credits: 3m,
            gradeLevels: [9, 10], description: "Old desc");

        // present credits/description → set; present EMPTY gradeLevels [] is JS-truthy → overwrites to [].
        var rows = new[] { Row(code: "MATH1", name: "New", credits: "4.5", gradeLevels: [], description: "New desc") };
        await Writer().ImportCoursesAsync(Ctx(), School, Uploader, rows, "import.csv");

        var course = await ReadCourseAsync("MATH1");
        Assert.NotNull(course);
        Assert.Equal(4.5, course!.Value.Credits);
        Assert.Equal("New desc", course.Value.Description);
        Assert.Empty(course.Value.GradeLevels); // present [] overwrote [9,10]
    }

    [Fact]
    public async Task Validation_missing_code_or_name_writes_error_row_and_no_course()
    {
        var rows = new[]
        {
            Row(code: "", name: "No Code", rawJson: """{"code":"","name":"No Code"}"""),
            Row(code: "HAS", name: "", rawJson: """{"code":"HAS","name":""}"""),
        };

        var result = await Writer().ImportCoursesAsync(Ctx(), School, Uploader, rows, "import.csv");

        Assert.Equal(0, result.ValidRows);
        Assert.Equal(2, result.InvalidRows);
        Assert.Equal([1, 2], result.ValidationErrors.Select(e => e.Row));
        Assert.All(result.ValidationErrors, e => Assert.Equal(["code and name are required"], e.Errors));

        Assert.Equal(0, await CountCoursesAsync()); // nothing written
        var errors = await ReadErrorsAsync(result.JobId);
        Assert.Equal(2, errors.Count);
        Assert.Equal(["code and name are required"], errors[0].ErrorMessages);
        Assert.Contains("No Code", errors[0].RawRow); // rawRow jsonb persisted verbatim
    }

    [Fact]
    public async Task Mixed_batch_counts_valid_and_invalid()
    {
        var rows = new[]
        {
            Row(code: "A", name: "Course A"),
            Row(code: "", name: "Bad"),          // invalid
            Row(code: "B", name: "Course B"),
        };

        var result = await Writer().ImportCoursesAsync(Ctx(), School, Uploader, rows, "import.csv");

        Assert.Equal(3, result.TotalRows);
        Assert.Equal(2, result.ValidRows);
        Assert.Equal(1, result.InvalidRows);
        Assert.Equal(2, await CountCoursesAsync());
    }

    [Fact]
    public async Task Job_row_is_finalized_completed_with_completedAt_and_validationErrors_jsonb()
    {
        var rows = new[]
        {
            Row(code: "A", name: "Course A"),
            Row(code: "", name: "Bad"),
        };

        var result = await Writer().ImportCoursesAsync(Ctx(), School, Uploader, rows, "import.csv");

        var job = await ReadJobAsync(result.JobId);
        Assert.NotNull(job);
        Assert.Equal("completed", job!.Value.Status);
        Assert.Equal(2, job.Value.TotalRows);
        Assert.Equal(1, job.Value.ProcessedRows);
        Assert.Equal(1, job.Value.FailedRows);
        Assert.NotNull(job.Value.CompletedAt);
        // validationErrors persisted as structured jsonb [{row,errors}].
        Assert.Contains("\"row\": 2", job.Value.ValidationErrorsText);
        Assert.Contains("code and name are required", job.Value.ValidationErrorsText);
    }

    [Fact]
    public async Task Nan_credits_row_fails_and_is_counted_not_crashed()
    {
        // credits "abc" → JsParseFloat → NaN → Decimal write impossible → per-row FAILURE (message diverges from
        // Prisma, but the OUTCOME — counted failed + error row — matches legacy). Unreachable for numeric CSV.
        var rows = new[]
        {
            Row(code: "OK", name: "Good"),
            Row(code: "BAD", name: "Bad Credits", credits: "abc"),
        };

        var result = await Writer().ImportCoursesAsync(Ctx(), School, Uploader, rows, "import.csv");

        Assert.Equal(1, result.ValidRows);
        Assert.Equal(1, result.InvalidRows);
        Assert.Contains(result.ValidationErrors, e => e.Row == 2);
        Assert.Equal(1, await CountCoursesAsync());   // only OK written; BAD failed, not crashed
        Assert.Null(await ReadCourseAsync("BAD"));
        var errors = await ReadErrorsAsync(result.JobId);
        Assert.Single(errors);
        Assert.Equal(2, errors[0].RowNumber);
    }

    [Fact]
    public async Task Atomic_commit_makes_all_rows_visible_after_the_call()
    {
        var rows = new[]
        {
            Row(code: "A", name: "A"),
            Row(code: "B", name: "B"),
            Row(code: "C", name: "C"),
        };

        var result = await Writer().ImportCoursesAsync(Ctx(), School, Uploader, rows, "import.csv");

        // Fresh connection (outside the writer's committed transaction) sees every row + the finalized job.
        Assert.Equal(3, await CountCoursesAsync());
        var job = await ReadJobAsync(result.JobId);
        Assert.Equal("completed", job!.Value.Status);
    }

    [Fact(Skip = "Documentation: legacy importCourses is NON-atomic (Prisma auto-commits job.create + each row's " +
        "create/update + job.update independently). This port runs the whole import in ONE writable RLS session " +
        "committed at the end (ratified atomic-import divergence). Observably identical for every COMPLETED request " +
        "(the jobId is only returned after the full loop, so the intermediate 'processing' job row is never client- " +
        "visible); differs only on a mid-import crash, where atomic is strictly safer (no orphaned partial import).")]
    public void Legacy_is_non_atomic_per_row_autocommit()
    {
        // Intentionally empty — records the divergence for reviewers.
    }

    [Fact]
    public async Task Row_type_invalid_fails_the_row_and_writes_no_course()
    {
        // A scalar with a JSON type Prisma would reject (e.g. non-string description / non-int gradeLevels element,
        // captured upstream by ImportRowParser as RowTypeInvalid). Legacy fails the row on the Prisma type error; the
        // OUTCOME (counted invalid + error row, no course) matches (message text diverges).
        var rows = new[]
        {
            Row(code: "OK", name: "Good"),
            Row(code: "BAD", name: "Bad Type", rowTypeInvalid: true),
        };

        var result = await Writer().ImportCoursesAsync(Ctx(), School, Uploader, rows, "import.csv");

        Assert.Equal(1, result.ValidRows);
        Assert.Equal(1, result.InvalidRows);
        Assert.Null(await ReadCourseAsync("BAD"));    // type-invalid row wrote no course
        Assert.NotNull(await ReadCourseAsync("OK"));
        Assert.Single(await ReadErrorsAsync(result.JobId));
    }

    [Fact]
    public async Task Concurrent_duplicate_code_is_recovered_by_savepoint()
    {
        // Gate finding (Codex HIGH): a per-row DB error must NOT poison the whole import. A holder tx inserts "RACE"
        // uncommitted (holding the (schoolId,code) unique lock); the import's findFirst misses it, its INSERT of "RACE"
        // BLOCKS on the lock; once the holder commits, the import's INSERT gets a 23505. The per-row SAVEPOINT rolls
        // that back so "RACE" is recorded as a failed row and "OTHER" + the job finalize still commit — matching
        // legacy's per-row-autocommit tolerance, instead of the request 500ing on a poisoned transaction.
        await using var holder = await _dataSource.OpenConnectionAsync();
        await using var tx = await holder.BeginTransactionAsync();
        await using (var ins = new NpgsqlCommand(
            """
            INSERT INTO "school_courses" ("id","schoolId","code","name","department","credits","updatedAt")
            VALUES (gen_random_uuid()::text, @sid, 'RACE', 'Holder', '', 0, now())
            """, holder, tx))
        {
            ins.Parameters.AddWithValue("sid", School);
            await ins.ExecuteNonQueryAsync();
        }

        var rows = new[] { Row(code: "RACE", name: "Race"), Row(code: "OTHER", name: "Other") };
        var importTask = Writer().ImportCoursesAsync(Ctx(), School, Uploader, rows, "import.csv");

        // Wait until the import backend is BLOCKED on the lock (guarantees its findFirst already missed and its INSERT
        // is waiting) — THEN release the holder so the import gets the 23505 rather than seeing a committed RACE.
        await WaitForLockWaiterAsync();
        await tx.CommitAsync();

        var result = await importTask; // MUST NOT throw — the savepoint recovers the 23505

        Assert.Equal(2, result.TotalRows);
        Assert.Equal(1, result.ValidRows);   // OTHER
        Assert.Equal(1, result.InvalidRows); // RACE (unique violation, recovered)
        Assert.Contains(result.ValidationErrors, e => e.Row == 1);
        var job = await ReadJobAsync(result.JobId);
        Assert.Equal("completed", job!.Value.Status); // job completes — no 500
        Assert.NotNull(await ReadCourseAsync("OTHER"));
    }

    private async Task WaitForLockWaiterAsync()
    {
        for (var attempt = 0; attempt < 100; attempt++)
        {
            await using var conn = await _dataSource.OpenConnectionAsync();
            await using var cmd = new NpgsqlCommand(
                "SELECT count(*) FROM pg_stat_activity WHERE wait_event_type = 'Lock'", conn);
            if (Convert.ToInt64(await cmd.ExecuteScalarAsync()) > 0)
            {
                return;
            }

            await Task.Delay(50);
        }

        throw new Xunit.Sdk.XunitException("import backend never blocked on the row lock within the timeout");
    }

    // ---- helpers ----

    private static ImportRow Row(
        string? code = null, string? name = null, string? department = null, string? credits = null,
        IReadOnlyList<int>? gradeLevels = null, string? description = null, bool rowTypeInvalid = false,
        string? rawJson = null) =>
        new(code, name, department, credits, gradeLevels, description, rowTypeInvalid, rawJson ?? "{}");

    private CourseImportWriter Writer() =>
        new(new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()));

    private static RequestContext Ctx() =>
        RequestContext.Authenticated(
            new RequestActor(Uploader, "school-admin", "a@e.st", "Admin"),
            schoolId: School, permissions: Array.Empty<string>(),
            tokenSource: TokenSource.DevelopmentHeader, isDevelopmentOverride: true);

    private async Task SeedCourseAsync(
        string code, string name, string department, decimal credits, int[]? gradeLevels = null,
        string? description = null, DateTime? updatedAt = null)
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "school_courses"
                ("id","schoolId","code","name","department","credits","gradeLevels","description","updatedAt")
            VALUES (gen_random_uuid()::text,@sid,@code,@name,@dept,@credits,@grades,@desc,@upd)
            """, conn);
        cmd.Parameters.AddWithValue("sid", School);
        cmd.Parameters.AddWithValue("code", code);
        cmd.Parameters.AddWithValue("name", name);
        cmd.Parameters.AddWithValue("dept", department);
        cmd.Parameters.AddWithValue("credits", credits);
        cmd.Parameters.AddWithValue("grades", gradeLevels ?? []);
        cmd.Parameters.AddWithValue("desc", (object?)description ?? DBNull.Value);
        cmd.Parameters.AddWithValue("upd", (object?)updatedAt ?? new DateTime(2020, 1, 1, 0, 0, 0, DateTimeKind.Unspecified));
        await cmd.ExecuteNonQueryAsync();
    }

    private async Task<(string Name, string Department, double Credits, int[] GradeLevels, string? Description, DateTime UpdatedAt)?>
        ReadCourseAsync(string code)
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand(
            """
            SELECT "name","department","credits"::double precision,"gradeLevels","description","updatedAt"
            FROM "school_courses" WHERE "schoolId"=@sid AND "code"=@code
            """, conn);
        cmd.Parameters.AddWithValue("sid", School);
        cmd.Parameters.AddWithValue("code", code);
        await using var reader = await cmd.ExecuteReaderAsync();
        if (!await reader.ReadAsync())
        {
            return null;
        }

        return (
            reader.GetString(0),
            reader.GetString(1),
            reader.GetDouble(2),
            reader.IsDBNull(3) ? [] : reader.GetFieldValue<int[]>(3),
            reader.IsDBNull(4) ? null : reader.GetString(4),
            reader.GetDateTime(5));
    }

    private async Task<int> CountCoursesAsync()
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand("""SELECT COUNT(*) FROM "school_courses" """, conn);
        return (int)(long)(await cmd.ExecuteScalarAsync())!;
    }

    private async Task<(string Status, int TotalRows, int ProcessedRows, int FailedRows, DateTime? CompletedAt, string ValidationErrorsText)?>
        ReadJobAsync(string jobId)
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand(
            """
            SELECT "status"::text,"totalRows","processedRows","failedRows","completedAt","validationErrors"::text
            FROM "school_course_import_jobs" WHERE "id"=@id
            """, conn);
        cmd.Parameters.AddWithValue("id", jobId);
        await using var reader = await cmd.ExecuteReaderAsync();
        if (!await reader.ReadAsync())
        {
            return null;
        }

        return (
            reader.GetString(0),
            reader.GetInt32(1),
            reader.GetInt32(2),
            reader.GetInt32(3),
            reader.IsDBNull(4) ? null : reader.GetDateTime(4),
            reader.GetString(5));
    }

    private async Task<List<(int RowNumber, string[] ErrorMessages, string RawRow)>> ReadErrorsAsync(string jobId)
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand(
            """
            SELECT "rowNumber","errorMessages","rawRow"::text FROM "school_course_import_errors"
            WHERE "jobId"=@id ORDER BY "rowNumber" ASC
            """, conn);
        cmd.Parameters.AddWithValue("id", jobId);
        var list = new List<(int, string[], string)>();
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            list.Add((reader.GetInt32(0), reader.GetFieldValue<string[]>(1), reader.GetString(2)));
        }

        return list;
    }
}
