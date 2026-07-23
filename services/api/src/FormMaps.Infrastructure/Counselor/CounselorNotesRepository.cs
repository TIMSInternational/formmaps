using System.Data;
using System.Data.Common;
using System.Globalization;
using FormMaps.Application.Auth;
using FormMaps.Application.Counselor;
using FormMaps.Application.Data;

namespace FormMaps.Infrastructure.Counselor;

/// <summary>
/// Counselor notes CRUD (FM-DOTNET-072). GET/access-check on a read-only RLS session; create/update/soft-delete/
/// complete-followup on a writable session + commit. Ownership + write happen in ONE session (atomic, no TOCTOU).
/// tags is a text[]; timestamps bind Kind=Unspecified + ms-truncated. SET/INSERT columns are fixed literals
/// (mass-assignment guard). Prisma @updatedAt bumps on every update → soft-delete and complete-followup also SET
/// updatedAt (not echoed, but observable on a later read).
/// </summary>
public sealed class CounselorNotesRepository(
    IFormMapsDatabaseSessionFactory databaseSessionFactory,
    TimeProvider timeProvider) : ICounselorNotesRepository
{
    // Unqualified — for the single-table RETURNING on create/update.
    private const string SelectColumns =
        """
        "id", "studentId", "authorId", "type", "content", "isPrivate", "followUpDate", "followUpCompleted",
        "followUpCompletedAt", "tags", "isActive", "createdBy", "createdDate", "updatedBy", "updatedAt"
        """;

    // n.-qualified — for the list query's JOIN to users (bare "id" would be ambiguous).
    private const string ListSelectColumns =
        """
        n."id", n."studentId", n."authorId", n."type", n."content", n."isPrivate", n."followUpDate",
        n."followUpCompleted", n."followUpCompletedAt", n."tags", n."isActive", n."createdBy", n."createdDate",
        n."updatedBy", n."updatedAt"
        """;

    public async Task<bool> HasCounselorStudentAccessAsync(
        RequestContext context, string counselorId, string studentId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        return await HasAccessAsync(session, counselorId, studentId, cancellationToken);
    }

    public async Task<NotesPage> ListAsync(
        RequestContext context, string studentId, string? typeFilter, int page, int limit,
        CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);

        var where = "n.\"studentId\" = @sid AND n.\"isActive\" = true";
        var hasType = !string.IsNullOrEmpty(typeFilter);
        if (hasType)
        {
            where += " AND n.\"type\" = @type";
        }

        int total;
        await using (var countCommand = Command(session, $"""SELECT COUNT(*)::int FROM "counselor_notes" n WHERE {where}"""))
        {
            AddParameter(countCommand, "sid", studentId);
            if (hasType)
            {
                AddParameter(countCommand, "type", typeFilter!);
            }

            total = await ScalarIntAsync(countCommand, cancellationToken);
        }

        var rows = new List<NoteListItem>();
        await using (var listCommand = Command(session, $"""
            SELECT {ListSelectColumns}, u."name"
            FROM "counselor_notes" n
            JOIN "users" u ON u."id" = n."authorId"
            WHERE {where}
            ORDER BY n."createdDate" DESC, n."id" ASC
            OFFSET @offset LIMIT @limit
            """))
        {
            AddParameter(listCommand, "sid", studentId);
            if (hasType)
            {
                AddParameter(listCommand, "type", typeFilter!);
            }

            AddParameter(listCommand, "offset", (long)(page - 1) * limit);
            AddParameter(listCommand, "limit", limit);
            await using var reader = await listCommand.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                var authorName = reader.IsDBNull(15) ? null : reader.GetString(15);
                rows.Add(new NoteListItem(MapRow(reader), authorName));
            }
        }

        return new NotesPage(rows, total);
    }

    public async Task<NoteRow> CreateAsync(
        RequestContext context, string studentId, string authorId, CreateNoteInput input,
        CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        await using var command = Command(session, $"""
            INSERT INTO "counselor_notes"
                ("id", "studentId", "authorId", "type", "content", "isPrivate", "followUpDate", "tags",
                 "createdDate", "updatedAt")
            VALUES
                (gen_random_uuid()::text, @sid, @aid, @type, @content, @isPrivate, @followUpDate, @tags, @now, @now)
            RETURNING {SelectColumns}
            """);
        AddParameter(command, "sid", studentId);
        AddParameter(command, "aid", authorId);
        AddParameter(command, "type", input.Type);
        AddParameter(command, "content", input.Content);
        AddParameter(command, "isPrivate", input.IsPrivate);
        AddNullableTimestamp(command, "followUpDate", input.FollowUpDate);
        AddParameter(command, "tags", input.Tags);
        AddTimestamp(command, "now", Now());

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        await reader.ReadAsync(cancellationToken);
        var row = MapRow(reader);
        await reader.DisposeAsync();
        await session.CommitAsync(cancellationToken);
        return row;
    }

    public async Task<UpdateNoteResult> UpdateAsync(
        RequestContext context, string noteId, string callerId, bool fieldsValid, UpdateNoteFields fields,
        CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        // findUnique → missing OR not authored by the caller → NotAuthorized (403 "Not authorized").
        if (!await IsAuthorAsync(session, noteId, callerId, cancellationToken))
        {
            return new UpdateNoteResult(UpdateNoteOutcome.NotAuthorized, null);
        }

        // Body-type check deferred PAST ownership: an authorized owner with a bad-type field → Prisma throw → 500.
        if (!fieldsValid)
        {
            return new UpdateNoteResult(UpdateNoteOutcome.InvalidBody, null);
        }

        var setClauses = new List<string>();
        if (fields.HasType)
        {
            setClauses.Add("\"type\" = @type");
        }

        if (fields.HasContent)
        {
            setClauses.Add("\"content\" = @content");
        }

        if (fields.HasIsPrivate)
        {
            setClauses.Add("\"isPrivate\" = @isPrivate");
        }

        if (fields.HasTags)
        {
            setClauses.Add("\"tags\" = @tags");
        }

        if (fields.HasFollowUpDate)
        {
            setClauses.Add("\"followUpDate\" = @followUpDate");
        }

        // @updatedAt is always bumped (Prisma sets it on every update, even with empty data).
        setClauses.Add("\"updatedAt\" = @now");

        await using var command = Command(session, $"""
            UPDATE "counselor_notes" SET {string.Join(", ", setClauses)} WHERE "id" = @id RETURNING {SelectColumns}
            """);
        if (fields.HasType)
        {
            AddParameter(command, "type", fields.Type!);
        }

        if (fields.HasContent)
        {
            AddParameter(command, "content", fields.Content!);
        }

        if (fields.HasIsPrivate)
        {
            AddParameter(command, "isPrivate", fields.IsPrivate);
        }

        if (fields.HasTags)
        {
            AddParameter(command, "tags", fields.Tags!);
        }

        if (fields.HasFollowUpDate)
        {
            AddNullableTimestamp(command, "followUpDate", fields.FollowUpDate);
        }

        AddTimestamp(command, "now", Now());
        AddParameter(command, "id", noteId);

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        await reader.ReadAsync(cancellationToken);
        var row = MapRow(reader);
        await reader.DisposeAsync();
        await session.CommitAsync(cancellationToken);
        return new UpdateNoteResult(UpdateNoteOutcome.Ok, row);
    }

    public async Task<SimpleWriteOutcome> SoftDeleteAsync(
        RequestContext context, string noteId, string callerId, bool callerIsCounselor,
        CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        // findUnique → missing OR (not authored AND caller is a counselor) → NotAuthorized. A non-counselor
        // (school_admin / Super Admin) may delete any existing note.
        string? author;
        await using (var lookup = Command(session, """SELECT "authorId" FROM "counselor_notes" WHERE "id" = @id"""))
        {
            AddParameter(lookup, "id", noteId);
            var result = await lookup.ExecuteScalarAsync(cancellationToken);
            author = result is null or DBNull ? null : (string)result;
        }

        if (author is null || (author != callerId && callerIsCounselor))
        {
            return SimpleWriteOutcome.NotAuthorized;
        }

        await using (var update = Command(session, """
            UPDATE "counselor_notes" SET "isActive" = false, "updatedAt" = @now WHERE "id" = @id
            """))
        {
            AddTimestamp(update, "now", Now());
            AddParameter(update, "id", noteId);
            await update.ExecuteNonQueryAsync(cancellationToken);
        }

        await session.CommitAsync(cancellationToken);
        return SimpleWriteOutcome.Ok;
    }

    public async Task<CompleteFollowUpResult> CompleteFollowUpAsync(
        RequestContext context, string noteId, string callerId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        if (!await IsAuthorAsync(session, noteId, callerId, cancellationToken))
        {
            return new CompleteFollowUpResult(NotAuthorized: true, null);
        }

        var now = Now();
        await using var command = Command(session, """
            UPDATE "counselor_notes"
            SET "followUpCompleted" = true, "followUpCompletedAt" = @now, "updatedAt" = @now
            WHERE "id" = @id
            RETURNING "id", "followUpCompletedAt"
            """);
        AddTimestamp(command, "now", now);
        AddParameter(command, "id", noteId);

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        await reader.ReadAsync(cancellationToken);
        var id = reader.GetString(0);
        var completedAt = reader.IsDBNull(1) ? null : IsoZ(reader.GetDateTime(1));
        await reader.DisposeAsync();
        await session.CommitAsync(cancellationToken);
        return new CompleteFollowUpResult(NotAuthorized: false, new CompleteFollowUpData(id, true, completedAt));
    }

    // findUnique → author matches the caller (both missing note and different author → false).
    private static async Task<bool> IsAuthorAsync(
        FormMapsDatabaseSession session, string noteId, string callerId, CancellationToken cancellationToken)
    {
        await using var lookup = Command(session, """SELECT "authorId" FROM "counselor_notes" WHERE "id" = @id""");
        AddParameter(lookup, "id", noteId);
        var result = await lookup.ExecuteScalarAsync(cancellationToken);
        return result is not (null or DBNull) && (string)result == callerId;
    }

    private static async Task<bool> HasAccessAsync(
        FormMapsDatabaseSession session, string counselorId, string studentId, CancellationToken cancellationToken)
    {
        await using var command = Command(session, """
            SELECT 1 FROM "counselor_student_assignments"
            WHERE "counselorId" = @cid AND "studentId" = @sid AND "isActive" = true LIMIT 1
            """);
        AddParameter(command, "cid", counselorId);
        AddParameter(command, "sid", studentId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        return await reader.ReadAsync(cancellationToken);
    }

    private static NoteRow MapRow(DbDataReader reader) => new(
        Id: reader.GetString(0),
        StudentId: reader.GetString(1),
        AuthorId: reader.GetString(2),
        Type: reader.GetString(3),
        Content: reader.GetString(4),
        IsPrivate: reader.GetBoolean(5),
        FollowUpDate: reader.IsDBNull(6) ? null : IsoZ(reader.GetDateTime(6)),
        FollowUpCompleted: reader.GetBoolean(7),
        FollowUpCompletedAt: reader.IsDBNull(8) ? null : IsoZ(reader.GetDateTime(8)),
        Tags: reader.IsDBNull(9) ? Array.Empty<string>() : reader.GetFieldValue<string[]>(9),
        IsActive: reader.GetBoolean(10),
        CreatedBy: reader.IsDBNull(11) ? null : reader.GetString(11),
        CreatedDate: IsoZ(reader.GetDateTime(12)),
        UpdatedBy: reader.IsDBNull(13) ? null : reader.GetString(13),
        UpdatedAt: IsoZ(reader.GetDateTime(14)));

    private DateTime Now() =>
        new DateTime(
            (timeProvider.GetUtcNow().UtcDateTime.Ticks / TimeSpan.TicksPerMillisecond) * TimeSpan.TicksPerMillisecond,
            DateTimeKind.Unspecified);

    private static async Task<int> ScalarIntAsync(DbCommand command, CancellationToken cancellationToken)
    {
        var result = await command.ExecuteScalarAsync(cancellationToken);
        return result is null or DBNull ? 0 : Convert.ToInt32(result, CultureInfo.InvariantCulture);
    }

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

    private static void AddNullableTimestamp(DbCommand command, string name, DateTime? value)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = name;
        parameter.DbType = DbType.DateTime2;
        parameter.Value = value.HasValue
            ? DateTime.SpecifyKind(
                new DateTime(
                    (value.Value.Ticks / TimeSpan.TicksPerMillisecond) * TimeSpan.TicksPerMillisecond,
                    DateTimeKind.Unspecified),
                DateTimeKind.Unspecified)
            : DBNull.Value;
        command.Parameters.Add(parameter);
    }

    private static string IsoZ(DateTime value) =>
        DateTime.SpecifyKind(value, DateTimeKind.Utc).ToString("yyyy-MM-ddTHH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);
}
