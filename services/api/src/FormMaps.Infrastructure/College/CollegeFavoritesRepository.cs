using System.Data;
using System.Data.Common;
using System.Globalization;
using System.Text.Json;
using FormMaps.Application.Auth;
using FormMaps.Application.College;
using FormMaps.Application.Data;

namespace FormMaps.Infrastructure.College;

/// <summary>
/// College search + favorites (FM-DOTNET-082 — routes/college.ts Feature 2). Search: dynamic WHERE (isActive + name
/// ILIKE + state + acceptanceRate range), acceptanceRate Decimal→number via ::double precision, tuition jsonb
/// passthrough, name ASC, LIMIT 20. Favorites list: INNER JOIN universities. Add-to-list: findUnique on the unique
/// (userId,universityId) → 409 already-active / reactivate / create. Fit-update + soft-delete on a writable session +
/// commit; timestamps Kind=Unspecified + ms-truncated; fixed-column INSERT/SET (mass-assignment guard).
/// </summary>
public sealed class CollegeFavoritesRepository(
    IFormMapsDatabaseSessionFactory databaseSessionFactory,
    TimeProvider timeProvider) : ICollegeFavoritesRepository
{
    private const string FavoriteColumns =
        """
        "id", "userId", "universityId", "favoritedAt", "notes", "fitClassification", "isActive", "createdBy",
        "createdDate", "updatedBy", "updatedAt"
        """;

    public async Task<IReadOnlyList<UniversitySearchRow>> SearchAsync(
        RequestContext context, UniversitySearchFilter filter, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        await using var command = session.Connection.CreateCommand();
        command.Transaction = session.Transaction;

        var where = new List<string> { "\"isActive\" = true" };
        if (filter.Query is not null)
        {
            where.Add("\"name\" ILIKE '%' || @q || '%'"); // Prisma contains-insensitive; wildcards NOT escaped (faithful)
            AddParameter(command, "q", filter.Query);
        }

        if (filter.State is not null)
        {
            where.Add("\"state\" = @state");
            AddParameter(command, "state", filter.State);
        }

        if (filter.MinAcceptanceRate is not null)
        {
            where.Add("\"acceptanceRate\" >= @min");
            AddDouble(command, "min", filter.MinAcceptanceRate.Value);
        }

        if (filter.MaxAcceptanceRate is not null)
        {
            where.Add("\"acceptanceRate\" <= @max");
            AddDouble(command, "max", filter.MaxAcceptanceRate.Value);
        }

        command.CommandText = $"""
            SELECT "id", "name", "city", "state", "acceptanceRate"::double precision,
                   "satAverage", "satReading25", "satReading75", "satMath25", "satMath75",
                   "actCumulative25", "actCumulative75", "actCumulativeMid",
                   "tuition"::text, "studentCount", "type", "website"
            FROM "universities"
            WHERE {string.Join(" AND ", where)}
            ORDER BY "name" ASC
            LIMIT 20
            """;

        var rows = new List<UniversitySearchRow>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            rows.Add(new UniversitySearchRow(
                Id: reader.GetString(0),
                Name: reader.GetString(1),
                City: reader.GetString(2),
                State: reader.IsDBNull(3) ? null : reader.GetString(3),
                AcceptanceRate: reader.IsDBNull(4) ? null : reader.GetDouble(4),
                SatAverage: NullableInt(reader, 5),
                SatReading25: NullableInt(reader, 6),
                SatReading75: NullableInt(reader, 7),
                SatMath25: NullableInt(reader, 8),
                SatMath75: NullableInt(reader, 9),
                ActCumulative25: NullableInt(reader, 10),
                ActCumulative75: NullableInt(reader, 11),
                ActCumulativeMid: NullableInt(reader, 12),
                Tuition: Json(reader.GetString(13)),
                StudentCount: NullableInt(reader, 14),
                Type: reader.GetString(15),
                Website: reader.GetString(16)));
        }

        return rows;
    }

    public async Task<IReadOnlyList<FavoriteWithUniversity>> ListFavoritesAsync(
        RequestContext context, string studentId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        await using var command = Command(session, """
            SELECT uf."id", uf."userId", uf."universityId", uf."favoritedAt", uf."notes", uf."fitClassification",
                   uf."isActive", uf."createdBy", uf."createdDate", uf."updatedBy", uf."updatedAt",
                   u."id", u."name", u."city", u."state", u."acceptanceRate"::double precision,
                   u."satAverage", u."actCumulativeMid", u."tuition"::text, u."type", u."website"
            FROM "university_favorites" uf
            JOIN "universities" u ON u."id" = uf."universityId"
            WHERE uf."userId" = @sid AND uf."isActive" = true
            ORDER BY uf."createdDate" DESC, uf."id" ASC
            """);
        AddParameter(command, "sid", studentId);

        var rows = new List<FavoriteWithUniversity>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            var favorite = MapFavorite(reader, 0);
            var university = new FavoriteUniversityRef(
                Id: reader.GetString(11),
                Name: reader.GetString(12),
                City: reader.GetString(13),
                State: reader.IsDBNull(14) ? null : reader.GetString(14),
                AcceptanceRate: reader.IsDBNull(15) ? null : reader.GetDouble(15),
                SatAverage: NullableInt(reader, 16),
                ActCumulativeMid: NullableInt(reader, 17),
                Tuition: Json(reader.GetString(18)),
                Type: reader.GetString(19),
                Website: reader.GetString(20));
            rows.Add(new FavoriteWithUniversity(favorite, university));
        }

        return rows;
    }

    public async Task<AddToListResult> AddToListAsync(
        RequestContext context, string studentId, string universityId, bool fitValid, bool hasFit, bool fitIsNull,
        string? fit, string callerId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        // findUnique on the unique (userId, universityId).
        string? existingId = null;
        var existingActive = false;
        await using (var lookup = Command(session,
            """SELECT "id", "isActive" FROM "university_favorites" WHERE "userId" = @sid AND "universityId" = @uid"""))
        {
            AddParameter(lookup, "sid", studentId);
            AddParameter(lookup, "uid", universityId);
            await using var reader = await lookup.ExecuteReaderAsync(cancellationToken);
            if (await reader.ReadAsync(cancellationToken))
            {
                existingId = reader.GetString(0);
                existingActive = reader.GetBoolean(1);
            }
        }

        // Already-active short-circuits BEFORE the write → the fit type is never checked (matches legacy).
        if (existingId is not null && existingActive)
        {
            return new AddToListResult(AddToListOutcome.AlreadyInList, null);
        }

        if (!fitValid)
        {
            return new AddToListResult(AddToListOutcome.InvalidBody, null);
        }

        FavoriteRow row;
        if (existingId is not null)
        {
            // Reactivate: set isActive + updatedBy; fitClassification only when present (Prisma undefined → unchanged).
            var setClauses = new List<string> { "\"isActive\" = true", "\"updatedBy\" = @caller", "\"updatedAt\" = @now" };
            await using var update = session.Connection.CreateCommand();
            update.Transaction = session.Transaction;
            AddFitSet(update, setClauses, hasFit, fitIsNull, fit);
            AddParameter(update, "caller", callerId);
            AddTimestamp(update, "now", Now());
            AddParameter(update, "id", existingId);
            update.CommandText = $"""
                UPDATE "university_favorites" SET {string.Join(", ", setClauses)} WHERE "id" = @id RETURNING {FavoriteColumns}
                """;
            row = await ReadOne(update, cancellationToken);
        }
        else
        {
            // Create: fitClassification present → value/NULL; absent → NULL (Prisma default).
            await using var insert = session.Connection.CreateCommand();
            insert.Transaction = session.Transaction;
            AddParameter(insert, "sid", studentId);
            AddParameter(insert, "uid", universityId);
            AddNullableString(insert, "fit", hasFit && !fitIsNull ? fit : null);
            AddParameter(insert, "caller", callerId);
            AddTimestamp(insert, "now", Now());
            insert.CommandText = $"""
                INSERT INTO "university_favorites"
                    ("id", "userId", "universityId", "fitClassification", "isActive", "createdBy", "favoritedAt", "createdDate", "updatedAt")
                VALUES (gen_random_uuid()::text, @sid, @uid, @fit, true, @caller, @now, @now, @now)
                RETURNING {FavoriteColumns}
                """;
            row = await ReadOne(insert, cancellationToken);
        }

        await session.CommitAsync(cancellationToken);
        return new AddToListResult(AddToListOutcome.Ok, row);
    }

    public async Task<string?> FindActiveFavoriteOwnerAsync(
        RequestContext context, string id, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        await using var command = Command(session,
            """SELECT "userId" FROM "university_favorites" WHERE "id" = @id AND "isActive" = true""");
        AddParameter(command, "id", id);
        var owner = await command.ExecuteScalarAsync(cancellationToken);
        return owner is null or DBNull ? null : (string)owner;
    }

    public async Task<FavoriteRow> UpdateFitAsync(
        RequestContext context, string id, bool hasFit, bool fitIsNull, string? fit, string callerId,
        CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);
        var setClauses = new List<string> { "\"updatedBy\" = @caller", "\"updatedAt\" = @now" };
        await using var command = session.Connection.CreateCommand();
        command.Transaction = session.Transaction;
        AddFitSet(command, setClauses, hasFit, fitIsNull, fit);
        AddParameter(command, "caller", callerId);
        AddTimestamp(command, "now", Now());
        AddParameter(command, "id", id);
        command.CommandText = $"""
            UPDATE "university_favorites" SET {string.Join(", ", setClauses)} WHERE "id" = @id RETURNING {FavoriteColumns}
            """;
        var row = await ReadOne(command, cancellationToken);
        await session.CommitAsync(cancellationToken);
        return row;
    }

    public async Task SoftDeleteFavoriteAsync(
        RequestContext context, string id, string callerId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);
        await using var command = Command(session, """
            UPDATE "university_favorites" SET "isActive" = false, "updatedBy" = @caller, "updatedAt" = @now WHERE "id" = @id
            """);
        AddParameter(command, "caller", callerId);
        AddTimestamp(command, "now", Now());
        AddParameter(command, "id", id);
        await command.ExecuteNonQueryAsync(cancellationToken);
        await session.CommitAsync(cancellationToken);
    }

    // fitClassification SET only when present: null → NULL; string → value (raw, not bounded — college.ts does not slice).
    private static void AddFitSet(DbCommand command, List<string> setClauses, bool hasFit, bool fitIsNull, string? fit)
    {
        if (!hasFit)
        {
            return;
        }

        if (fitIsNull)
        {
            setClauses.Add("\"fitClassification\" = NULL");
            return;
        }

        setClauses.Add("\"fitClassification\" = @fit");
        AddParameter(command, "fit", fit!);
    }

    private static async Task<FavoriteRow> ReadOne(DbCommand command, CancellationToken cancellationToken)
    {
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        await reader.ReadAsync(cancellationToken);
        return MapFavorite(reader, 0);
    }

    private static FavoriteRow MapFavorite(DbDataReader reader, int offset) => new(
        Id: reader.GetString(offset + 0),
        UserId: reader.GetString(offset + 1),
        UniversityId: reader.GetString(offset + 2),
        FavoritedAt: IsoZ(reader.GetDateTime(offset + 3)),
        Notes: reader.IsDBNull(offset + 4) ? null : reader.GetString(offset + 4),
        FitClassification: reader.IsDBNull(offset + 5) ? null : reader.GetString(offset + 5),
        IsActive: reader.GetBoolean(offset + 6),
        CreatedBy: reader.IsDBNull(offset + 7) ? null : reader.GetString(offset + 7),
        CreatedDate: IsoZ(reader.GetDateTime(offset + 8)),
        UpdatedBy: reader.IsDBNull(offset + 9) ? null : reader.GetString(offset + 9),
        UpdatedAt: IsoZ(reader.GetDateTime(offset + 10)));

    private static int? NullableInt(DbDataReader reader, int ordinal) =>
        reader.IsDBNull(ordinal) ? null : reader.GetInt32(ordinal);

    private static JsonElement Json(string raw) => JsonDocument.Parse(raw).RootElement.Clone();

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

    private static void AddDouble(DbCommand command, string name, double value)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = name;
        parameter.DbType = DbType.Double;
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
