using System.Data;
using System.Data.Common;
using System.Text.Json;
using FormMaps.Application.Auth;
using FormMaps.Application.CourseImport;
using FormMaps.Application.Data;

namespace FormMaps.Infrastructure.CourseImport;

/// <summary>
/// course-import WRITE (FM-DOTNET-059 — schoolCoursesService.ts importCourses). Faithful port of the per-row
/// validate → upsert-by-(schoolId, code) loop.
///
/// <para>ATOMIC IMPORT + PER-ROW SAVEPOINT RECOVERY (ratified divergence): legacy is NON-atomic (job.create, then each
/// row's create/update auto-committed by Prisma, then job.update). This port runs the WHOLE import in ONE writable RLS
/// session and commits at the end, BUT wraps each row's DB work in a SAVEPOINT so a per-row DB error is recovered
/// (ROLLBACK TO SAVEPOINT clears the aborted-tx state) exactly as legacy's per-row autocommit tolerates it — the failed
/// row is recorded and the job still completes, rather than the failed command poisoning the transaction and 500ing the
/// request (the concurrent-duplicate-code case, gate finding). This is observably identical for every COMPLETED request
/// (the POST awaits the full loop before returning the jobId; the intermediate "processing" job row is never visible —
/// the jobId is returned only after completion) and is crash-safe (no orphaned partial import). The only non-observable
/// residual is incremental row VISIBILITY to a concurrent reader mid-import (legacy commits per row) and a longer lock
/// hold on the touched (schoolId, code) rows. See the SKIPPED documentation test recording legacy's per-row autocommit.</para>
///
/// <para>THE create-vs-update UNDEFINED-OMIT ASYMMETRY (mirrors <see cref="CurriculumFrameworks.CurriculumFrameworksWriter"/>):
/// on UPDATE the SET clause always writes name/department/updatedAt but writes credits/gradeLevels/description ONLY
/// when the row carried them (legacy Prisma <c>update:{ credits: undefined }</c> skips the column). Note the JS
/// truthiness quirk gradeLevels honors: a PRESENT empty array [] is TRUTHY so it overwrites the column to [], but an
/// ABSENT/null gradeLevels keeps the existing value. On CREATE every column is written (department = <c>row.department
/// || ""</c>, credits = <c>row.credits ? parseFloat : 0</c>, gradeLevels = <c>row.gradeLevels || []</c>, description =
/// RAW so ""→"" and absent→NULL). All values parameterized; timestamps tz-independent (Unspecified); the enum status
/// bound as text and CAST in SQL.</para>
/// </summary>
public sealed class CourseImportWriter(IFormMapsDatabaseSessionFactory databaseSessionFactory) : ICourseImportWriter
{
    private static readonly JsonSerializerOptions JsonbOptions = new(JsonSerializerDefaults.Web);

    public async Task<ImportResult> ImportCoursesAsync(
        RequestContext context, string schoolId, string userId, IReadOnlyList<ImportRow> rows, string filename,
        CancellationToken cancellationToken = default)
    {
        var now = Now();
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        // 1. Insert the job (status 'processing', enum-cast). Capture the generated id.
        string jobId;
        await using (var command = Command(session, """
            INSERT INTO "school_course_import_jobs"
                ("id", "schoolId", "uploaderUserId", "filename", "status", "totalRows", "updatedAt")
            VALUES (gen_random_uuid()::text, @sid, @uid, @filename, CAST(@status AS "ImportJobStatus"), @total, @now)
            RETURNING "id"
            """))
        {
            AddParameter(command, "sid", schoolId);
            AddParameter(command, "uid", userId);
            AddParameter(command, "filename", filename);
            AddParameter(command, "status", "processing");
            AddParameter(command, "total", rows.Count);
            AddTimestamp(command, "now", now);
            jobId = (string)(await command.ExecuteScalarAsync(cancellationToken))!;
        }

        var processedRows = 0;
        var failedRows = 0;
        var validationErrors = new List<ImportValidationError>();

        for (var i = 0; i < rows.Count; i++)
        {
            var row = rows[i];
            var rowNumber = i + 1;

            // Pre-write failures (no DB command issued → can't poison the tx): JS-falsy code/name, then a scalar whose
            // JSON type Prisma would reject (RowTypeInvalid — non-string dept/desc, non-int gradeLevels element,
            // non-string/number credits). code/name is checked FIRST (matching legacy's validate-then-write order).
            string? failureMessage = null;
            if (string.IsNullOrEmpty(row.Code) || string.IsNullOrEmpty(row.Name))
            {
                failureMessage = "code and name are required";
            }
            else if (row.RowTypeInvalid)
            {
                // A Prisma type error — legacy fails the row with Prisma's message; the OUTCOME (row fails, counted)
                // matches, the message text diverges (unreachable for string CSV data).
                failureMessage = "field type mismatch";
            }

            if (failureMessage is null)
            {
                // The upsert runs under a per-row SAVEPOINT so a real DB error (e.g. a 23505 unique-violation from a
                // CONCURRENT import of the same NEW code — the findFirst misses, a racing tx committed the code, our
                // INSERT then conflicts) is RECOVERABLE: ROLLBACK TO SAVEPOINT clears the aborted-tx state so the
                // error-insert + remaining rows + the job finalize still commit — matching legacy's per-row-autocommit
                // error tolerance. Without it the failed command poisons the whole transaction and the request 500s.
                await ExecuteAsync(session, "SAVEPOINT row_sp", cancellationToken);
                try
                {
                    await UpsertCourseAsync(session, schoolId, row, now, cancellationToken);
                    processedRows++;
                    await ExecuteAsync(session, "RELEASE SAVEPOINT row_sp", cancellationToken);
                }
                catch (Exception ex)
                {
                    await ExecuteAsync(session, "ROLLBACK TO SAVEPOINT row_sp", cancellationToken);
                    await ExecuteAsync(session, "RELEASE SAVEPOINT row_sp", cancellationToken);
                    failureMessage = string.IsNullOrEmpty(ex.Message) ? "Unknown error" : ex.Message;
                }
            }

            if (failureMessage is not null)
            {
                failedRows++;
                validationErrors.Add(new ImportValidationError(rowNumber, [failureMessage]));
                await InsertErrorAsync(session, jobId, rowNumber, row.RawJson, [failureMessage], now, cancellationToken);
            }
        }

        // 3. Finalize the job.
        await using (var finalize = Command(session, """
            UPDATE "school_course_import_jobs"
            SET "status" = CAST(@status AS "ImportJobStatus"), "processedRows" = @processed, "failedRows" = @failed,
                "validationErrors" = @validationErrors::jsonb, "completedAt" = @now, "updatedAt" = @now
            WHERE "id" = @id
            """))
        {
            AddParameter(finalize, "id", jobId);
            AddParameter(finalize, "status", "completed");
            AddParameter(finalize, "processed", processedRows);
            AddParameter(finalize, "failed", failedRows);
            AddParameter(finalize, "validationErrors", JsonSerializer.Serialize(validationErrors, JsonbOptions));
            AddTimestamp(finalize, "now", now);
            await finalize.ExecuteNonQueryAsync(cancellationToken);
        }

        // 4. Commit the whole import atomically.
        await session.CommitAsync(cancellationToken);

        // 5. Return the in-memory result (validationErrors from memory, never a DB round-trip).
        return new ImportResult(jobId, rows.Count, processedRows, failedRows, validationErrors);
    }

    // The per-row upsert (credits parse + lookup + UPDATE/INSERT). Runs inside the row's SAVEPOINT; any throw (parse or
    // DB error) is caught by the caller, which rolls the savepoint back and records the row as failed.
    private static async Task UpsertCourseAsync(
        FormMapsDatabaseSession session, string schoolId, ImportRow row, DateTime now, CancellationToken cancellationToken)
    {
        // credits: only when truthy (JS `row.credits ? parseFloat : …`). parseFloat → NaN/Infinity, or a magnitude past
        // decimal range, means the write is impossible → throw → per-row failure (matches legacy's Prisma-throws-then-
        // caught for NaN/Infinity). Note: legacy's Postgres DECIMAL(65,30) actually ACCEPTS finite magnitudes up to
        // ~1e35 that overflow .NET decimal (~7.9e28), so a credits in [7.9e28, 1e35) would SUCCEED in legacy but fail
        // the row here — unreachable (credit-hours are never that large), documented divergence.
        decimal? creditsToSet = null;
        if (!string.IsNullOrEmpty(row.Credits))
        {
            var parsed = JsParseFloat.Parse(row.Credits);
            if (double.IsNaN(parsed) || double.IsInfinity(parsed))
            {
                throw new InvalidOperationException("credits is not a valid number");
            }

            creditsToSet = (decimal)parsed;
        }

        // Existing lookup: case-sensitive EXACT code within the school (need department too for the || fallback).
        string? existingId = null;
        var existingDepartment = "";
        await using (var lookup = Command(session, """
            SELECT "id", "department" FROM "school_courses" WHERE "schoolId" = @sid AND "code" = @code LIMIT 1
            """))
        {
            AddParameter(lookup, "sid", schoolId);
            AddParameter(lookup, "code", row.Code!);
            await using var lookupReader = await lookup.ExecuteReaderAsync(cancellationToken);
            if (await lookupReader.ReadAsync(cancellationToken))
            {
                existingId = lookupReader.GetString(0);
                existingDepartment = lookupReader.GetString(1);
            }
        }

        if (existingId is not null)
        {
            // UPDATE — always name/department/updatedAt; credits/gradeLevels/description ONLY when present.
            var sets = new List<string> { "\"name\" = @name", "\"department\" = @dept", "\"updatedAt\" = @now" };
            if (creditsToSet is not null)
            {
                sets.Add("\"credits\" = @credits");
            }

            if (row.GradeLevels is not null) // present array (incl empty []) is JS-truthy → write it
            {
                sets.Add("\"gradeLevels\" = @grades");
            }

            if (!string.IsNullOrEmpty(row.Description))
            {
                sets.Add("\"description\" = @desc");
            }

            await using var update = Command(session,
                $"UPDATE \"school_courses\" SET {string.Join(", ", sets)} WHERE \"id\" = @id");
            AddParameter(update, "id", existingId);
            AddParameter(update, "name", row.Name!);
            // department = row.department || existingCourse.department
            AddParameter(update, "dept", string.IsNullOrEmpty(row.Department) ? existingDepartment : row.Department);
            AddTimestamp(update, "now", now);
            if (creditsToSet is not null)
            {
                AddParameter(update, "credits", creditsToSet.Value);
            }

            if (row.GradeLevels is not null)
            {
                AddParameter(update, "grades", row.GradeLevels.ToArray());
            }

            if (!string.IsNullOrEmpty(row.Description))
            {
                AddParameter(update, "desc", row.Description);
            }

            await update.ExecuteNonQueryAsync(cancellationToken);
        }
        else
        {
            // CREATE — every column written; description RAW (absent→NULL, ""→"").
            await using var insert = Command(session, """
                INSERT INTO "school_courses"
                    ("id", "schoolId", "code", "name", "department", "credits", "gradeLevels", "description",
                     "status", "isActive", "createdDate", "updatedAt")
                VALUES (gen_random_uuid()::text, @sid, @code, @name, @dept, @credits, @grades, @desc,
                        'active', true, @now, @now)
                """);
            AddParameter(insert, "sid", schoolId);
            AddParameter(insert, "code", row.Code!);
            AddParameter(insert, "name", row.Name!);
            AddParameter(insert, "dept", row.Department ?? ""); // row.department || ""  ("" also → "")
            AddParameter(insert, "credits", creditsToSet ?? 0m); // row.credits ? parseFloat : 0
            AddParameter(insert, "grades", (row.GradeLevels ?? []).ToArray()); // row.gradeLevels || []
            AddParameter(insert, "desc", (object?)row.Description ?? DBNull.Value);
            AddTimestamp(insert, "now", now);
            await insert.ExecuteNonQueryAsync(cancellationToken);
        }
    }

    private static async Task ExecuteAsync(FormMapsDatabaseSession session, string sql, CancellationToken cancellationToken)
    {
        await using var command = Command(session, sql);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    private static async Task InsertErrorAsync(
        FormMapsDatabaseSession session, string jobId, int rowNumber, string rawRow, IReadOnlyList<string> messages,
        DateTime now, CancellationToken cancellationToken)
    {
        await using var command = Command(session, """
            INSERT INTO "school_course_import_errors"
                ("id", "jobId", "rowNumber", "rawRow", "errorMessages", "updatedAt")
            VALUES (gen_random_uuid()::text, @jid, @rn, @raw::jsonb, @msgs, @now)
            """);
        AddParameter(command, "jid", jobId);
        AddParameter(command, "rn", rowNumber);
        AddParameter(command, "raw", rawRow);
        AddParameter(command, "msgs", messages.ToArray());
        AddTimestamp(command, "now", now);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    // ---------------------------------------------------------------- npgsql helpers (mirror CurriculumFrameworksWriter)

    private static DbCommand Command(FormMapsDatabaseSession session, string sql)
    {
        var command = session.Connection.CreateCommand();
        command.Transaction = session.Transaction;
        command.CommandText = sql;
        return command;
    }

    private static void AddParameter(DbCommand command, string name, object value)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = name;
        parameter.Value = value;
        command.Parameters.Add(parameter);
    }

    private static void AddTimestamp(DbCommand command, string name, DateTime value)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = name;
        parameter.DbType = DbType.DateTime2;
        parameter.Value = value;
        command.Parameters.Add(parameter);
    }

    private static DateTime Now()
    {
        var utc = DateTime.SpecifyKind(DateTimeOffset.UtcNow.UtcDateTime, DateTimeKind.Unspecified);
        return new DateTime(utc.Ticks - (utc.Ticks % TimeSpan.TicksPerMillisecond), DateTimeKind.Unspecified);
    }
}
