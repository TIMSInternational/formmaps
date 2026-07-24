using System.Data.Common;
using System.Globalization;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;
using FormMaps.Application.ParentChildReads;
using FormMaps.Application.SchoolAnalytics;

namespace FormMaps.Infrastructure.ParentChildReads;

/// <summary>
/// Parent child-link-scoped reads (FM-DOTNET-079). Every path first verifies an accepted+active StudentParentLink
/// (parentUserId == caller) under the caller's Identity RLS session. progress then reads assessments/credits/grades on
/// that SAME Identity session (legacy reads them under tenantContext — NO runAsSystem). course-plan reads the approved
/// plan / target / current courses on a SYSTEM (RLS-bypass) session (legacy runAsSystem, because a school-less parent
/// cannot see those school-scoped rows under tenant RLS). Decimal credits → Number() = double; GPA/percentage/avg use
/// JS Math.round (SchoolAnalyticsMath.JsRound); percentage has NO 100 cap (matching legacy). All read-only.
/// </summary>
public sealed class ParentChildReader(IFormMapsDatabaseSessionFactory databaseSessionFactory) : IParentChildReader
{
    // Legacy gradeMap (A..F). A grade not in the map (after trim) contributes no GPA point.
    private static readonly IReadOnlyDictionary<string, double> GradePoints = new Dictionary<string, double>(StringComparer.Ordinal)
    {
        ["A"] = 4, ["A-"] = 3.7, ["B+"] = 3.3, ["B"] = 3, ["B-"] = 2.7,
        ["C+"] = 2.3, ["C"] = 2, ["C-"] = 1.7, ["D"] = 1, ["F"] = 0,
    };

    public async Task<ChildProgressResult> GetProgressAsync(
        RequestContext context, string parentUserId, string studentId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);

        if (!await IsLinkedAsync(session, parentUserId, studentId, cancellationToken))
        {
            return new ChildProgressResult(ChildProgressOutcome.NotLinked, null);
        }

        // student = user.findUnique(select id,name,gradeLevel,schoolId). Missing → 404.
        string name;
        int? gradeLevel;
        string? schoolId;
        await using (var command = Command(session,
            """SELECT "name", "gradeLevel", "schoolId" FROM "users" WHERE "id" = @sid"""))
        {
            AddParameter(command, "sid", studentId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            if (!await reader.ReadAsync(cancellationToken))
            {
                return new ChildProgressResult(ChildProgressOutcome.StudentNotFound, null);
            }

            name = reader.GetString(0);
            gradeLevel = reader.IsDBNull(1) ? null : reader.GetInt32(1);
            schoolId = reader.IsDBNull(2) ? null : reader.GetString(2);
        }

        // pca_evaluations (NOT isActive-filtered) → completed if any row.
        var pcaCompleted = await ScalarCountAsync(session,
            """SELECT COUNT(*) FROM "pca_evaluations" WHERE "userId" = @sid""", studentId, cancellationToken) > 0;

        // mil = completed exam sessions; averageScore = round(avg scorePercentage).
        var milCompleted = 0;
        double milScoreSum = 0;
        await using (var command = Command(session,
            """SELECT "scorePercentage" FROM "pca_exam_sessions" WHERE "userId" = @sid AND "isCompleted" = true"""))
        {
            AddParameter(command, "sid", studentId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                milCompleted++;
                milScoreSum += reader.GetDouble(0);
            }
        }

        var milAverage = milCompleted > 0 ? (int)SchoolAnalyticsMath.JsRound(milScoreSum / milCompleted) : 0;

        // eval360 = active groups; completed = those with isEvaluationCompleted.
        var eval360Total = 0;
        var eval360Completed = 0;
        await using (var command = Command(session,
            """SELECT "isEvaluationCompleted" FROM "evaluation_groups" WHERE "evaluatedUserId" = @sid AND "isActive" = true"""))
        {
            AddParameter(command, "sid", studentId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                eval360Total++;
                if (reader.GetBoolean(0))
                {
                    eval360Completed++;
                }
            }
        }

        // Credits are school-gated (legacy only reduces creditsEarned inside `if (student.schoolId)`, required defaults
        // to 120); GPA is NOT school-gated (legacy runs its grade query unconditionally). One query over completed+active
        // grades feeds both: earned = Σ Number(credits) (only when the student has a school), GPA from the grade-not-null
        // subset. Decimal credits → double = JS Number().
        double creditsRequired = 120;
        double creditsEarned = 0;
        var gpaPoints = new List<double>();

        if (schoolId is not null)
        {
            creditsRequired = await ResolveRequiredCreditsAsync(session, schoolId, cancellationToken);
        }

        await using (var command = Command(session, """
            SELECT "credits", "grade" FROM "student_grades"
            WHERE "studentId" = @sid AND "status" = 'completed' AND "isActive" = true
            """))
        {
            AddParameter(command, "sid", studentId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                if (schoolId is not null)
                {
                    creditsEarned += (double)reader.GetDecimal(0);
                }

                if (!reader.IsDBNull(1) && GradePoints.TryGetValue(reader.GetString(1).Trim(), out var pts))
                {
                    gpaPoints.Add(pts);
                }
            }
        }

        double? gpa = gpaPoints.Count > 0
            ? SchoolAnalyticsMath.JsRound(gpaPoints.Sum() / gpaPoints.Count * 100) / 100
            : null;
        var isOnTrack = gpa is null || gpa >= 2.0;
        var percentage = creditsRequired > 0
            ? (int)SchoolAnalyticsMath.JsRound(creditsEarned / creditsRequired * 100)
            : 0;

        var data = new ChildProgress(
            new ChildStudentInfo(studentId, name, gradeLevel),
            gpa,
            isOnTrack,
            new ChildCreditProgress(creditsEarned, creditsRequired, percentage),
            new ChildAssessments(pcaCompleted, milCompleted, 5, milAverage, eval360Total, eval360Completed));

        return new ChildProgressResult(ChildProgressOutcome.Ok, data);
    }

    public async Task<ChildCoursePlanResult> GetCoursePlanAsync(
        RequestContext context, string parentUserId, string studentId, CancellationToken cancellationToken = default)
    {
        // Link check under the caller's Identity RLS (→ 404 when absent, hiding existence).
        await using (var identity = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken))
        {
            if (!await IsLinkedAsync(identity, parentUserId, studentId, cancellationToken))
            {
                return new ChildCoursePlanResult(Linked: false, null);
            }
        }

        // The accepted link is the authorization; parents are school-less so the plan/target/course-plan rows are read
        // as SYSTEM (RLS bypass), mirroring legacy runAsSystem.
        await using var system = await databaseSessionFactory.OpenReadOnlyAsync(RequestContext.System(), cancellationToken);

        ChildApprovedPlan? approvedPlan = null;
        string? planId = null;
        string? reviewedAt = null;
        await using (var command = Command(system, """
            SELECT "id", "reviewedAt" FROM "graduation_plans"
            WHERE "studentId" = @sid AND "isActive" = true AND "status" = 'approved'
            ORDER BY "createdDate" DESC LIMIT 1
            """))
        {
            AddParameter(command, "sid", studentId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            if (await reader.ReadAsync(cancellationToken))
            {
                planId = reader.GetString(0);
                reviewedAt = reader.IsDBNull(1) ? null : IsoZ(reader.GetDateTime(1));
            }
        }

        if (planId is not null)
        {
            var items = new List<ChildPlanItem>();
            await using var command = Command(system, """
                SELECT "courseCode", "courseName", "credits", "gradeLevel", "term" FROM "graduation_plan_items"
                WHERE "planId" = @pid AND "isActive" = true ORDER BY "sortOrder" ASC
                """);
            AddParameter(command, "pid", planId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                items.Add(new ChildPlanItem(
                    CourseCode: reader.GetString(0),
                    CourseName: reader.GetString(1),
                    Credits: (double)reader.GetDecimal(2),
                    GradeLevel: reader.GetInt32(3),
                    Term: reader.IsDBNull(4) ? null : reader.GetString(4)));
            }

            approvedPlan = new ChildApprovedPlan(reviewedAt, items);
        }

        ChildTarget? target = null;
        await using (var command = Command(system,
            """SELECT "universityName", "major", "isActive" FROM "student_graduation_targets" WHERE "studentId" = @sid"""))
        {
            AddParameter(command, "sid", studentId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            if (await reader.ReadAsync(cancellationToken) && reader.GetBoolean(2)) // target?.isActive
            {
                target = new ChildTarget(
                    UniversityName: reader.IsDBNull(0) ? null : reader.GetString(0),
                    Major: reader.GetString(1));
            }
        }

        var currentCourses = new List<ChildCurrentCourse>();
        await using (var command = Command(system, """
            SELECT "courseId", "term", "status" FROM "student_course_plans"
            WHERE "studentId" = @sid AND "isActive" = true ORDER BY "sortOrder" ASC
            """))
        {
            AddParameter(command, "sid", studentId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                currentCourses.Add(new ChildCurrentCourse(
                    CourseId: reader.GetString(0),
                    Term: reader.IsDBNull(1) ? null : reader.GetString(1),
                    Status: reader.GetString(2)));
            }
        }

        return new ChildCoursePlanResult(Linked: true, new ChildCoursePlan(target, approvedPlan, currentCourses));
    }

    // findFirst { parentUserId, studentId, isActive, isAccepted } — the accepted+active link authorization.
    private static async Task<bool> IsLinkedAsync(
        FormMapsDatabaseSession session, string parentUserId, string studentId, CancellationToken cancellationToken)
    {
        await using var command = Command(session, """
            SELECT 1 FROM "student_parent_links"
            WHERE "parentUserId" = @pid AND "studentId" = @sid AND "isActive" = true AND "isAccepted" = true
            LIMIT 1
            """);
        AddParameter(command, "pid", parentUserId);
        AddParameter(command, "sid", studentId);
        return await command.ExecuteScalarAsync(cancellationToken) is not null;
    }

    // creditsRequired = the active grad-rule-set's totalCreditsRequired for the school's current AY, else 120.
    // Two-step (findFirst AY → findFirst rule set for THAT AY), mirroring legacy exactly rather than a JOIN — so a
    // (pathological) multiple-current-AY school resolves identically to the legacy's arbitrary-first-AY choice.
    private static async Task<double> ResolveRequiredCreditsAsync(
        FormMapsDatabaseSession session, string schoolId, CancellationToken cancellationToken)
    {
        string? academicYearId;
        await using (var command = Command(session,
            """SELECT "id" FROM "academic_years" WHERE "schoolId" = @school AND "isCurrent" = true LIMIT 1"""))
        {
            AddParameter(command, "school", schoolId);
            academicYearId = await command.ExecuteScalarAsync(cancellationToken) as string;
        }

        if (academicYearId is null)
        {
            return 120;
        }

        await using (var command = Command(session, """
            SELECT "totalCreditsRequired" FROM "graduation_rule_sets"
            WHERE "schoolId" = @school AND "academicYearId" = @ay AND "isActive" = true LIMIT 1
            """))
        {
            AddParameter(command, "school", schoolId);
            AddParameter(command, "ay", academicYearId);
            var value = await command.ExecuteScalarAsync(cancellationToken);
            return value is null or DBNull ? 120 : (double)(decimal)value;
        }
    }

    private static async Task<long> ScalarCountAsync(
        FormMapsDatabaseSession session, string sql, string studentId, CancellationToken cancellationToken)
    {
        await using var command = Command(session, sql);
        AddParameter(command, "sid", studentId);
        return Convert.ToInt64(await command.ExecuteScalarAsync(cancellationToken), CultureInfo.InvariantCulture);
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

    private static string IsoZ(DateTime value) =>
        DateTime.SpecifyKind(value, DateTimeKind.Utc).ToString("yyyy-MM-ddTHH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);
}
