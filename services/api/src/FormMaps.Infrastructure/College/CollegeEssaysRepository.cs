using System.Data;
using System.Data.Common;
using System.Globalization;
using FormMaps.Application.Auth;
using FormMaps.Application.College;
using FormMaps.Application.Data;

namespace FormMaps.Infrastructure.College;

/// <summary>
/// College essays + comments (FM-DOTNET-083 — routes/college.ts Feature 3). Essays list = the full row + an UNFILTERED
/// correlated comment count (Prisma _count has no isActive filter). Create/update/soft-delete + comment insert run on a
/// writable session + commit; timestamps bind Kind=Unspecified + ms-truncated (the FM-029 tz rule). status is written
/// via a ::"EssayStatus" enum cast (an invalid member → Postgres enum 500). Comments list INNER JOINs users for the
/// nested author {id,name,roleName}. Fixed-column INSERT/SET (mass-assignment guard).
/// </summary>
public sealed class CollegeEssaysRepository(
    IFormMapsDatabaseSessionFactory databaseSessionFactory,
    TimeProvider timeProvider) : ICollegeEssaysRepository
{
    private const string EssayColumns =
        """
        "id", "studentId", "studentApplicationId", "title", "prompt", "content", "status"::text, "wordCount",
        "essayType", "isActive", "createdBy", "createdDate", "updatedBy", "updatedAt"
        """;

    private const string CommentColumns =
        """
        "id", "essayId", "authorId", "content", "isActive", "createdDate", "updatedAt"
        """;

    public async Task<IReadOnlyList<EssayListRow>> ListEssaysAsync(
        RequestContext context, string studentId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        await using var command = Command(session, $"""
            SELECT e."id", e."studentId", e."studentApplicationId", e."title", e."prompt", e."content",
                   e."status"::text, e."wordCount", e."essayType", e."isActive", e."createdBy", e."createdDate",
                   e."updatedBy", e."updatedAt",
                   (SELECT COUNT(*) FROM "essay_comments" c WHERE c."essayId" = e."id") AS "commentCount"
            FROM "college_essays" e
            WHERE e."studentId" = @sid AND e."isActive" = true
            ORDER BY e."createdDate" DESC, e."id" ASC
            """);
        AddParameter(command, "sid", studentId);

        var rows = new List<EssayListRow>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            var essay = MapEssay(reader, 0);
            rows.Add(new EssayListRow(essay, (int)reader.GetInt64(14)));
        }

        return rows;
    }

    public async Task<EssayRow> CreateEssayAsync(
        RequestContext context, string callerId, EssayCreateInput input, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);
        await using var command = session.Connection.CreateCommand();
        command.Transaction = session.Transaction;
        command.CommandText = $"""
            INSERT INTO "college_essays" (
                "id", "studentId", "title", "prompt", "content", "essayType", "studentApplicationId", "wordCount",
                "createdBy", "createdDate", "updatedAt")
            VALUES (
                gen_random_uuid()::text, @sid, @title, @prompt, @content, @essayType, @sapp, @wc, @caller, @now, @now)
            RETURNING {EssayColumns}
            """;

        AddParameter(command, "sid", input.StudentId);
        AddParameter(command, "title", input.Title);
        AddNullableString(command, "prompt", input.Prompt);
        AddNullableString(command, "content", input.Content);
        AddNullableString(command, "essayType", input.EssayType);
        AddNullableString(command, "sapp", input.StudentApplicationId);
        AddInt(command, "wc", input.WordCount);
        AddParameter(command, "caller", callerId);
        AddTimestamp(command, "now", Now());

        var row = await ReadOneEssay(command, cancellationToken);
        await session.CommitAsync(cancellationToken);
        return row;
    }

    public async Task<string?> FindActiveEssayOwnerAsync(
        RequestContext context, string id, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        await using var command = Command(session,
            """SELECT "studentId" FROM "college_essays" WHERE "id" = @id AND "isActive" = true""");
        AddParameter(command, "id", id);
        var owner = await command.ExecuteScalarAsync(cancellationToken);
        return owner is null or DBNull ? null : (string)owner;
    }

    public async Task<EssayRow> ApplyEssayUpdateAsync(
        RequestContext context, string callerId, string id, EssayUpdateFields fields,
        CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);
        var setClauses = new List<string>();
        await using var command = session.Connection.CreateCommand();
        command.Transaction = session.Transaction;

        if (fields.HasTitle)
        {
            setClauses.Add("\"title\" = @title");
            AddParameter(command, "title", fields.Title!);
        }

        if (fields.HasContent)
        {
            if (fields.ContentIsNull)
            {
                setClauses.Add("\"content\" = NULL");
            }
            else
            {
                setClauses.Add("\"content\" = @content");
                AddParameter(command, "content", fields.Content!);
            }
        }

        if (fields.HasStatus)
        {
            setClauses.Add("\"status\" = @status::\"EssayStatus\"");
            AddParameter(command, "status", fields.Status!);
        }

        if (fields.HasWordCount)
        {
            setClauses.Add("\"wordCount\" = @wc");
            AddInt(command, "wc", fields.WordCount);
        }

        setClauses.Add("\"updatedBy\" = @caller");
        AddParameter(command, "caller", callerId);
        setClauses.Add("\"updatedAt\" = @now");
        AddTimestamp(command, "now", Now());
        AddParameter(command, "id", id);

        command.CommandText = $"""
            UPDATE "college_essays" SET {string.Join(", ", setClauses)} WHERE "id" = @id RETURNING {EssayColumns}
            """;

        var row = await ReadOneEssay(command, cancellationToken);
        await session.CommitAsync(cancellationToken);
        return row;
    }

    public async Task SoftDeleteEssayAsync(
        RequestContext context, string callerId, string id, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);
        await using var command = Command(session, """
            UPDATE "college_essays" SET "isActive" = false, "updatedBy" = @caller, "updatedAt" = @now WHERE "id" = @id
            """);
        AddParameter(command, "caller", callerId);
        AddTimestamp(command, "now", Now());
        AddParameter(command, "id", id);
        await command.ExecuteNonQueryAsync(cancellationToken);
        await session.CommitAsync(cancellationToken);
    }

    public async Task<CommentRow> AddCommentAsync(
        RequestContext context, string essayId, string authorId, string content,
        CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);
        await using var command = session.Connection.CreateCommand();
        command.Transaction = session.Transaction;
        command.CommandText = $"""
            INSERT INTO "essay_comments" ("id", "essayId", "authorId", "content", "createdDate", "updatedAt")
            VALUES (gen_random_uuid()::text, @eid, @author, @content, @now, @now)
            RETURNING {CommentColumns}
            """;
        AddParameter(command, "eid", essayId);
        AddParameter(command, "author", authorId);
        AddParameter(command, "content", content);
        AddTimestamp(command, "now", Now());

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        await reader.ReadAsync(cancellationToken);
        var row = MapComment(reader);
        await reader.DisposeAsync();
        await session.CommitAsync(cancellationToken);
        return row;
    }

    public async Task<IReadOnlyList<CommentWithAuthor>> ListCommentsAsync(
        RequestContext context, string essayId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        await using var command = Command(session, """
            SELECT c."id", c."essayId", c."authorId", c."content", c."isActive", c."createdDate", c."updatedAt",
                   u."id", u."name", u."roleName"
            FROM "essay_comments" c
            JOIN "users" u ON u."id" = c."authorId"
            WHERE c."essayId" = @eid AND c."isActive" = true
            ORDER BY c."createdDate" ASC, c."id" ASC
            """);
        AddParameter(command, "eid", essayId);

        var rows = new List<CommentWithAuthor>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            var comment = MapComment(reader);
            var author = new CommentAuthorRef(reader.GetString(7), reader.GetString(8), reader.GetString(9));
            rows.Add(new CommentWithAuthor(comment, author));
        }

        return rows;
    }

    private static async Task<EssayRow> ReadOneEssay(DbCommand command, CancellationToken cancellationToken)
    {
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        await reader.ReadAsync(cancellationToken);
        return MapEssay(reader, 0);
    }

    private static EssayRow MapEssay(DbDataReader reader, int offset) => new(
        Id: reader.GetString(offset + 0),
        StudentId: reader.GetString(offset + 1),
        StudentApplicationId: reader.IsDBNull(offset + 2) ? null : reader.GetString(offset + 2),
        Title: reader.GetString(offset + 3),
        Prompt: reader.IsDBNull(offset + 4) ? null : reader.GetString(offset + 4),
        Content: reader.IsDBNull(offset + 5) ? null : reader.GetString(offset + 5),
        Status: reader.GetString(offset + 6),
        WordCount: reader.GetInt32(offset + 7),
        EssayType: reader.IsDBNull(offset + 8) ? null : reader.GetString(offset + 8),
        IsActive: reader.GetBoolean(offset + 9),
        CreatedBy: reader.IsDBNull(offset + 10) ? null : reader.GetString(offset + 10),
        CreatedDate: IsoZ(reader.GetDateTime(offset + 11)),
        UpdatedBy: reader.IsDBNull(offset + 12) ? null : reader.GetString(offset + 12),
        UpdatedAt: IsoZ(reader.GetDateTime(offset + 13)));

    private static CommentRow MapComment(DbDataReader reader) => new(
        Id: reader.GetString(0),
        EssayId: reader.GetString(1),
        AuthorId: reader.GetString(2),
        Content: reader.GetString(3),
        IsActive: reader.GetBoolean(4),
        CreatedDate: IsoZ(reader.GetDateTime(5)),
        UpdatedAt: IsoZ(reader.GetDateTime(6)));

    private DateTime Now() =>
        new DateTime(
            (timeProvider.GetUtcNow().UtcDateTime.Ticks / TimeSpan.TicksPerMillisecond) * TimeSpan.TicksPerMillisecond,
            DateTimeKind.Unspecified);

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

    private static void AddNullableString(DbCommand command, string name, string? value)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = name;
        parameter.Value = (object?)value ?? DBNull.Value;
        command.Parameters.Add(parameter);
    }

    private static void AddInt(DbCommand command, string name, int value)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = name;
        parameter.DbType = DbType.Int32;
        parameter.Value = value;
        command.Parameters.Add(parameter);
    }

    private static void AddTimestamp(DbCommand command, string name, DateTime value)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = name;
        parameter.DbType = DbType.DateTime2;
        parameter.Value = new DateTime(
            (value.Ticks / TimeSpan.TicksPerMillisecond) * TimeSpan.TicksPerMillisecond, DateTimeKind.Unspecified);
        command.Parameters.Add(parameter);
    }

    private static string IsoZ(DateTime value) =>
        DateTime.SpecifyKind(value, DateTimeKind.Utc).ToString("yyyy-MM-ddTHH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);
}
