using System.Data.Common;
using FormMaps.Application.Assessments;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;
using FormMaps.Domain.Auth;

namespace FormMaps.Infrastructure.Assessments;

/// <summary>
/// Reproduces legacy getAllResults (assessmentService.ts): a page of completed+active
/// pca_exam_sessions, newest-first, plus the total count, under read-only RLS. Full rows reuse
/// <see cref="PcaExamSessionRowMapper"/>.
/// </summary>
/// <remarks>
/// <para>
/// SCOPING. The query used to have no tenant predicate at all -- it selected every completed
/// session on the platform and left RLS as the only thing standing between a school_admin and
/// every other school's students' cognitive results. The endpoint's admin gate
/// (<see cref="PcaAdminGate"/>) admits <c>school_admin</c>, so "admin only" was never the same
/// statement as "their own school".
/// </para>
/// <para>
/// RLS is not an independent backstop here, and treating it as one is the specific error
/// docs/security/schoolid-claim-trust.md was written to correct: the policies are parameterised by
/// <c>app.current_school_id</c>, which <c>RlsSessionCommandBuilder</c> sets from the SAME claim this
/// request arrived with. It is the same check, counted twice. Two independent controls means the
/// query says what it wants and the database agrees -- so the query now says it.
/// </para>
/// <para>
/// `pca_exam_sessions` carries no schoolId of its own (only <c>userId</c>), so the predicate joins
/// through `users`, which is how every school-branch RLS policy in this codebase resolves a school
/// too. Super Admin is platform-wide by design and keeps the unscoped query; it is the only role
/// whose <c>schoolId</c> is legitimately null.
/// </para>
/// </remarks>
public sealed class AllResultsReader(
    IFormMapsDatabaseSessionFactory databaseSessionFactory) : IAllResultsReader
{
    private const string SchoolPredicate = """
        AND EXISTS (
          SELECT 1 FROM "users" u
          WHERE u."id" = "pca_exam_sessions"."userId" AND u."schoolId" = @schoolId
        )
        """;

    private static readonly string PageSql = $"""
        SELECT {PcaExamSessionRowMapper.Columns}
        FROM "pca_exam_sessions"
        WHERE "isCompleted" = true AND "isActive" = true
        ORDER BY "startTime" DESC
        LIMIT @limit OFFSET @skip
        """;

    private static readonly string ScopedPageSql = $"""
        SELECT {PcaExamSessionRowMapper.Columns}
        FROM "pca_exam_sessions"
        WHERE "isCompleted" = true AND "isActive" = true
        {SchoolPredicate}
        ORDER BY "startTime" DESC
        LIMIT @limit OFFSET @skip
        """;

    private const string CountSql = """
        SELECT COUNT(*) FROM "pca_exam_sessions"
        WHERE "isCompleted" = true AND "isActive" = true
        """;

    private static readonly string ScopedCountSql = $"""
        SELECT COUNT(*) FROM "pca_exam_sessions"
        WHERE "isCompleted" = true AND "isActive" = true
        {SchoolPredicate}
        """;

    public async Task<AllResultsPage> ReadAsync(RequestContext context, long skip, int limit, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);

        // Super Admin is platform-wide; everyone else this endpoint admits (school_admin) sees
        // only their own school. A school-less non-superadmin gets the scoped query with a null
        // schoolId, which matches nothing -- failing closed rather than falling back to "all".
        var isPlatformAdmin = context.Actor?.Role == FormMapsRoles.SuperAdmin;
        var schoolId = context.Tenant?.SchoolId;

        var rows = new List<PcaHistorySession>();
        await using (var command = session.Connection.CreateCommand())
        {
            command.Transaction = session.Transaction;
            command.CommandText = isPlatformAdmin ? PageSql : ScopedPageSql;
            AddParameter(command, "limit", limit);
            AddParameter(command, "skip", skip);
            if (!isPlatformAdmin) AddStringParameter(command, "schoolId", schoolId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                rows.Add(PcaExamSessionRowMapper.Map(reader));
            }
        }

        int total;
        await using (var command = session.Connection.CreateCommand())
        {
            command.Transaction = session.Transaction;
            command.CommandText = isPlatformAdmin ? CountSql : ScopedCountSql;
            if (!isPlatformAdmin) AddStringParameter(command, "schoolId", schoolId);
            total = Convert.ToInt32(await command.ExecuteScalarAsync(cancellationToken));
        }

        return new AllResultsPage(rows, total);
    }

    private static void AddParameter(DbCommand command, string name, long value)
    {
        var p = command.CreateParameter();
        p.ParameterName = name;
        p.Value = value;
        command.Parameters.Add(p);
    }

    /// <summary>A null schoolId is bound as NULL, which matches no row -- fail closed, not open.</summary>
    private static void AddStringParameter(DbCommand command, string name, string? value)
    {
        var p = command.CreateParameter();
        p.ParameterName = name;
        p.Value = (object?)value ?? DBNull.Value;
        command.Parameters.Add(p);
    }
}
