using System.Data.Common;
using System.Globalization;
using FormMaps.Application.Assessments;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;

namespace FormMaps.Infrastructure.Assessments;

/// <summary>
/// Reads the global <c>questions_360</c> catalog (legacy routes/question360.ts) under the caller's read-only
/// RLS session. The table is an unpolicied global reference bank, so the read-only session's GUCs don't scope
/// it (every user sees the same rows) — the session is used for consistency with the other readers. Full row
/// is returned verbatim (there is no answer-key column to strip); timestamps are ISO-Z. List reads order by
/// questionNumber ASC with a deterministic id tie-break (legacy has none — documented stable superset).
/// </summary>
public sealed class Question360Reader(IFormMapsDatabaseSessionFactory databaseSessionFactory) : IQuestion360Reader
{
    private const string SelectColumns = """
        SELECT "id", "questionEnglishText", "questionSpanishText", "category", "relationType", "questionNumber",
               "isSubQuestion", "parentQuestionId", "isActive", "createdBy", "createdDate", "updatedBy", "updatedAt"
        FROM "questions_360"
        """;

    public async Task<IReadOnlyList<Question360Row>> ListAsync(
        RequestContext context, string? relationType, CancellationToken cancellationToken = default)
    {
        var sql = SelectColumns
            + "\nWHERE \"isActive\" = true"
            + (relationType is null ? string.Empty : "\n  AND \"relationType\" = @relationType")
            + "\nORDER BY \"questionNumber\" ASC, \"id\" ASC";

        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        await using var command = Command(session, sql);
        if (relationType is not null)
        {
            AddParameter(command, "relationType", relationType);
        }

        return await ReadRowsAsync(command, cancellationToken);
    }

    public async Task<IReadOnlyList<Question360Row>> ListByCategoryAsync(
        RequestContext context, string category, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        await using var command = Command(session, SelectColumns
            + "\nWHERE \"category\" = @category AND \"isActive\" = true"
            + "\nORDER BY \"questionNumber\" ASC, \"id\" ASC");
        AddParameter(command, "category", category);

        return await ReadRowsAsync(command, cancellationToken);
    }

    public async Task<IReadOnlyList<Question360Row>> ListByParentAsync(
        RequestContext context, string parentQuestionId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        await using var command = Command(session, SelectColumns
            + "\nWHERE \"parentQuestionId\" = @parentQuestionId AND \"isActive\" = true"
            + "\nORDER BY \"questionNumber\" ASC, \"id\" ASC");
        AddParameter(command, "parentQuestionId", parentQuestionId);

        return await ReadRowsAsync(command, cancellationToken);
    }

    public async Task<Question360Row?> GetByIdAsync(
        RequestContext context, string id, CancellationToken cancellationToken = default)
    {
        // Legacy findUnique({ where: { id } }) — NO isActive filter (an inactive question is still returned by id).
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        await using var command = Command(session, SelectColumns + "\nWHERE \"id\" = @id\nLIMIT 1");
        AddParameter(command, "id", id);

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        return await reader.ReadAsync(cancellationToken) ? Map(reader) : null;
    }

    private static async Task<IReadOnlyList<Question360Row>> ReadRowsAsync(DbCommand command, CancellationToken cancellationToken)
    {
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        var rows = new List<Question360Row>();
        while (await reader.ReadAsync(cancellationToken))
        {
            rows.Add(Map(reader));
        }

        return rows;
    }

    private static Question360Row Map(DbDataReader reader) => new(
        Id: reader.GetString(0),
        QuestionEnglishText: reader.GetString(1),
        QuestionSpanishText: reader.GetString(2),
        Category: reader.GetString(3),
        RelationType: reader.GetString(4),
        QuestionNumber: reader.GetInt32(5),
        IsSubQuestion: reader.GetBoolean(6),
        ParentQuestionId: reader.IsDBNull(7) ? null : reader.GetString(7),
        IsActive: reader.GetBoolean(8),
        CreatedBy: reader.IsDBNull(9) ? null : reader.GetString(9),
        CreatedDate: IsoZ(reader.GetDateTime(10)),
        UpdatedBy: reader.IsDBNull(11) ? null : reader.GetString(11),
        UpdatedAt: IsoZ(reader.GetDateTime(12)));

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

    private static string IsoZ(DateTime value) =>
        DateTime.SpecifyKind(value, DateTimeKind.Utc).ToString("yyyy-MM-ddTHH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);
}
