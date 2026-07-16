using System.Data.Common;
using System.Text.Json;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;
using FormMaps.Application.Reports;

namespace FormMaps.Infrastructure.Reports;

/// <summary>
/// Reproduces the legacy GET /pca/:userId handler (api/src/routes/report.ts).
/// Runs three queries under the CALLER's read-only RLS session (same as UserReportReader).
/// Returns null when the target user row does not exist (endpoint maps that to a 404).
/// </summary>
public sealed class PcaReportReader(
    IFormMapsDatabaseSessionFactory databaseSessionFactory) : IPcaReportReader
{
    // Query 1: user existence + name. Absence -> null (endpoint -> 404).
    private const string UserSql = """
        SELECT "id", "name"
        FROM "users"
        WHERE "id" = @userId
        """;

    // Query 2: evaluations. WHERE is userId ONLY (legacy returns active AND inactive rows);
    // the explicit column list deliberately excludes "coKey" (TIMS company API key).
    private const string EvaluationsSql = """
        SELECT "id", "userId", "pcaCod", "isActive", "createdDate", "updatedAt"
        FROM "pca_evaluations"
        WHERE "userId" = @userId
        ORDER BY "createdDate" DESC
        """;

    // Query 3: full career profile row as raw JSON (row_to_json preserves all columns incl.
    // the jsonb ones, with camelCase Prisma keys). No row -> null careerProfile.
    private const string CareerProfileSql = """
        SELECT row_to_json(ucp)::text
        FROM "user_career_profiles" ucp
        WHERE "userId" = @userId
        """;

    public async Task<PcaReport?> ReadAsync(
        RequestContext requestContext,
        string targetUserId,
        CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(
            requestContext,
            cancellationToken);

        // 1) Target user — null when absent.
        string studentId;
        string studentName;
        await using (var userCommand = session.Connection.CreateCommand())
        {
            userCommand.Transaction = session.Transaction;
            userCommand.CommandText = UserSql;
            AddUserIdParameter(userCommand, targetUserId);

            await using var userReader = await userCommand.ExecuteReaderAsync(cancellationToken);
            if (!await userReader.ReadAsync(cancellationToken))
            {
                return null;
            }

            studentId = userReader.GetString(userReader.GetOrdinal("id"));
            studentName = userReader.GetString(userReader.GetOrdinal("name"));
        }

        // 2) Evaluations (active AND inactive), newest first, no coKey.
        var evaluations = new List<PcaEvaluation>();
        await using (var evalCommand = session.Connection.CreateCommand())
        {
            evalCommand.Transaction = session.Transaction;
            evalCommand.CommandText = EvaluationsSql;
            AddUserIdParameter(evalCommand, targetUserId);

            await using var evalReader = await evalCommand.ExecuteReaderAsync(cancellationToken);
            while (await evalReader.ReadAsync(cancellationToken))
            {
                evaluations.Add(new PcaEvaluation(
                    Id: evalReader.GetString(evalReader.GetOrdinal("id")),
                    UserId: evalReader.GetString(evalReader.GetOrdinal("userId")),
                    PcaCod: evalReader.GetString(evalReader.GetOrdinal("pcaCod")),
                    IsActive: evalReader.GetBoolean(evalReader.GetOrdinal("isActive")),
                    CreatedDate: ReadDateTimeOffsetUtc(evalReader, "createdDate"),
                    UpdatedAt: ReadDateTimeOffsetUtc(evalReader, "updatedAt")));
            }
        }

        // 3) Career profile as raw JSON, or null.
        JsonElement? careerProfile = null;
        await using (var profileCommand = session.Connection.CreateCommand())
        {
            profileCommand.Transaction = session.Transaction;
            profileCommand.CommandText = CareerProfileSql;
            AddUserIdParameter(profileCommand, targetUserId);

            var profileJson = await profileCommand.ExecuteScalarAsync(cancellationToken) as string;
            if (!string.IsNullOrEmpty(profileJson))
            {
                using var document = JsonDocument.Parse(profileJson);
                careerProfile = document.RootElement.Clone();
            }
        }

        return new PcaReport(
            StudentId: studentId,
            StudentName: studentName,
            Completed: evaluations.Count > 0,
            Evaluations: evaluations,
            CareerProfile: careerProfile,
            GeneratedAt: DateTimeOffset.UtcNow);
    }

    private static void AddUserIdParameter(DbCommand command, string targetUserId)
    {
        var userIdParameter = command.CreateParameter();
        userIdParameter.ParameterName = "userId";
        userIdParameter.Value = targetUserId;
        command.Parameters.Add(userIdParameter);
    }

    private static DateTimeOffset ReadDateTimeOffsetUtc(DbDataReader reader, string name)
    {
        var ordinal = reader.GetOrdinal(name);
        var value = reader.GetDateTime(ordinal);
        return new DateTimeOffset(DateTime.SpecifyKind(value, DateTimeKind.Utc));
    }
}
