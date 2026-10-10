using System.Data.Common;
using FormMaps.Application.Data;
using FormMaps.Application.SchoolAdmin;
using FormMaps.Application.SchoolAnalytics;

namespace FormMaps.Infrastructure.SchoolAdmin;

/// <summary>
/// The one definition of "assessments completed" for a school (audit D2) — port of
/// getSchoolAssessmentCounts (services/schoolAssessmentsService.ts). The dashboard KPI, the
/// assessment-status card and the analytics completion rate all read it; before, they counted
/// "has a pca_evaluations row" (merely starting the survey), over different student bases.
/// Students = active student accounts (signed up + pending invite, as on the roster);
/// completed = <see cref="StudentCompletion"/> AllDone; in progress = started something (an LIA or
/// exam session, the PCA survey, the personality test, or a finished 360) but not AllDone.
/// </summary>
public static class SchoolAssessmentTally
{
    private static readonly string[] StudentRoles = ["Student", "student"];

    private static readonly string[] AllFive =
        ["PatternRecognition", "VerbalReasoning", "WorkingMemory", "NumericVelocity", "VisualRotation"];

    public static async Task<SchoolAssessmentCounts> ComputeAsync(
        FormMapsDatabaseSession session, string schoolId, CancellationToken cancellationToken)
    {
        var students = new List<(string Id, bool SignedUp, bool Grandfathered)>();
        await using (var command = Command(session, """
            SELECT "id", "password" IS NOT NULL, COALESCE("legacyUnlockGrandfathered", false) FROM "users"
            WHERE "schoolId" = @school AND "roleName" = ANY(@roles) AND "isActive" = true
            """))
        {
            AddParameter(command, "school", schoolId);
            AddParameter(command, "roles", StudentRoles);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                students.Add((reader.GetString(0), reader.GetBoolean(1), reader.GetBoolean(2)));
            }
        }

        var total = students.Count;
        if (total == 0)
        {
            return new SchoolAssessmentCounts(0, 0, 0, 0, 0, 0, 0);
        }

        var ids = students.Select(s => s.Id).ToArray();
        var started = new HashSet<string>(StringComparer.Ordinal);
        var liaTypes = new Dictionary<string, List<string>>(StringComparer.Ordinal);
        var evals = new Dictionary<string, List<bool>>(StringComparer.Ordinal);
        var pcas = new Dictionary<string, List<bool>>(StringComparer.Ordinal);
        var personalityDone = new HashSet<string>(StringComparer.Ordinal);

        // Legacy exam sessions: any active row = started; active + isCompleted = that subtest done.
        await foreach (var (userId, examType, isCompleted) in ReadAsync(session, """
            SELECT "userId", "examType", "isCompleted" FROM "pca_exam_sessions"
            WHERE "userId" = ANY(@ids) AND "isActive" = true
            """, ids, r => (r.GetString(0), r.GetString(1), r.GetBoolean(2)), cancellationToken))
        {
            started.Add(userId);
            if (isCompleted)
            {
                Bucket(liaTypes, userId).Add(examType);
            }
        }

        // Parity LIA: any active session = started; a completed one covers all five subtests.
        await foreach (var (userId, status) in ReadAsync(session, """
            SELECT "user_id", "status" FROM "lia_assessment_sessions" WHERE "user_id" = ANY(@ids) AND "is_active" = true
            """, ids, r => (r.GetString(0), r.GetString(1)), cancellationToken))
        {
            started.Add(userId);
            if (status == "completed")
            {
                liaTypes[userId] = [.. AllFive];
            }
        }

        await foreach (var (userId, isCompleted) in ReadAsync(session, """
            SELECT "evaluatedUserId", "isEvaluationCompleted" FROM "evaluation_groups"
            WHERE "evaluatedUserId" = ANY(@ids) AND "isActive" = true
            """, ids, r => (r.GetString(0), r.GetBoolean(1)), cancellationToken))
        {
            Bucket(evals, userId).Add(isCompleted);
            if (isCompleted)
            {
                started.Add(userId);
            }
        }

        // Same pca_evaluations filter as the Node tally (no isActive predicate).
        await foreach (var (userId, isCompleted) in ReadAsync(session, """
            SELECT "userId", "isCompleted" FROM "pca_evaluations" WHERE "userId" = ANY(@ids)
            """, ids, r => (r.GetString(0), r.GetBoolean(1)), cancellationToken))
        {
            started.Add(userId);
            Bucket(pcas, userId).Add(isCompleted);
        }

        await foreach (var (userId, status) in ReadAsync(session, """
            SELECT "user_id", "status" FROM "personality_assessment_sessions" WHERE "user_id" = ANY(@ids) AND "is_active" = true
            """, ids, r => (r.GetString(0), r.GetString(1)), cancellationToken))
        {
            started.Add(userId);
            if (status == "completed")
            {
                personalityDone.Add(userId);
            }
        }

        var completed = 0;
        var inProgress = 0;
        foreach (var s in students)
        {
            var verdict = StudentCompletion.Compute(
                liaTypes.GetValueOrDefault(s.Id) ?? [],
                evals.GetValueOrDefault(s.Id) ?? [],
                pcas.GetValueOrDefault(s.Id) ?? [],
                personalityDone.Contains(s.Id),
                s.Grandfathered);
            if (verdict.AllDone)
            {
                completed++;
            }
            else if (started.Contains(s.Id))
            {
                inProgress++;
            }
        }

        var signedUp = students.Count(s => s.SignedUp);
        return new SchoolAssessmentCounts(
            TotalStudents: total,
            ActiveStudents: signedUp,
            PendingInvites: total - signedUp,
            Completed: completed,
            InProgress: inProgress,
            NotStarted: total - completed - inProgress,
            // JS Math.round(completed / total * 1000) / 10
            CompletionRate: SchoolAnalyticsMath.JsRound(completed / (double)total * 1000) / 10);
    }

    private static List<T> Bucket<T>(Dictionary<string, List<T>> map, string key)
    {
        if (!map.TryGetValue(key, out var list))
        {
            list = [];
            map[key] = list;
        }

        return list;
    }

    private static async IAsyncEnumerable<T> ReadAsync<T>(
        FormMapsDatabaseSession session, string sql, string[] ids, Func<DbDataReader, T> map,
        [System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken cancellationToken)
    {
        await using var command = Command(session, sql);
        AddParameter(command, "ids", ids);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            yield return map(reader);
        }
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
}
