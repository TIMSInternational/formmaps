using System.Data.Common;
using FormMaps.Application.Auth;

namespace FormMaps.Infrastructure.Data;

public sealed class RlsSessionContextApplier
{
    public async Task ApplyAsync(
        DbConnection connection,
        DbTransaction transaction,
        TenantGucPlan plan,
        bool readOnly,
        CancellationToken cancellationToken = default)
    {
        foreach (var statement in RlsSessionCommandBuilder.Build(plan, readOnly))
        {
            await using var command = connection.CreateCommand();
            command.Transaction = transaction;
            command.CommandText = statement.CommandText;

            foreach (var parameter in statement.Parameters)
            {
                var dbParameter = command.CreateParameter();
                dbParameter.ParameterName = parameter.Key;
                dbParameter.Value = parameter.Value ?? DBNull.Value;
                command.Parameters.Add(dbParameter);
            }

            await command.ExecuteNonQueryAsync(cancellationToken);
        }
    }
}
