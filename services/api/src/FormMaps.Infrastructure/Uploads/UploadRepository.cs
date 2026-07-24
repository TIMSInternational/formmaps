using System.Data;
using System.Data.Common;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;
using FormMaps.Application.Uploads;

namespace FormMaps.Infrastructure.Uploads;

/// <summary>
/// DB writes for routes/upload.ts (FM-DOTNET-088). Reads on the caller's read-only RLS session; the two logo/image
/// updates on a writable session + commit. Fixed-column SET (mass-assignment guard); updatedAt bound Kind=Unspecified
/// + ms-truncated (the timestamp-no-tz write rule) so @updatedAt matches without triggering the timestamptz GUC cast.
/// </summary>
public sealed class UploadRepository(
    IFormMapsDatabaseSessionFactory databaseSessionFactory,
    TimeProvider timeProvider) : IUploadRepository
{
    public async Task<string?> GetCallerSchoolIdAsync(RequestContext context, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);

        await using var command = session.Connection.CreateCommand();
        command.Transaction = session.Transaction;
        command.CommandText = """SELECT "schoolId" FROM "users" WHERE "id" = @uid""";
        AddParameter(command, "uid", context.Actor!.UserId);

        return await command.ExecuteScalarAsync(cancellationToken) as string;
    }

    public async Task UpdateSchoolLogoAsync(
        RequestContext context, string schoolId, string logoUrl, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        await using (var command = session.Connection.CreateCommand())
        {
            command.Transaction = session.Transaction;
            command.CommandText = """UPDATE "schools" SET "logoUrl" = @url, "updatedAt" = @now WHERE "id" = @id""";
            AddParameter(command, "url", logoUrl);
            AddTimestamp(command, "now", Now());
            AddParameter(command, "id", schoolId);
            await command.ExecuteNonQueryAsync(cancellationToken);
        }

        await session.CommitAsync(cancellationToken);
    }

    public async Task UpdateCoachImageAsync(
        RequestContext context, string userId, string imageUrl, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        await using (var command = session.Connection.CreateCommand())
        {
            command.Transaction = session.Transaction;
            // if(coach) update — a plain UPDATE is a no-op (0 rows) when the caller has no coach row.
            command.CommandText = """UPDATE "coaches" SET "imageUrl" = @url, "updatedAt" = @now WHERE "userId" = @uid""";
            AddParameter(command, "url", imageUrl);
            AddTimestamp(command, "now", Now());
            AddParameter(command, "uid", userId);
            await command.ExecuteNonQueryAsync(cancellationToken);
        }

        await session.CommitAsync(cancellationToken);
    }

    private DateTime Now() =>
        new(
            timeProvider.GetUtcNow().UtcDateTime.Ticks / TimeSpan.TicksPerMillisecond * TimeSpan.TicksPerMillisecond,
            DateTimeKind.Unspecified);

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
}
