using System.Data;
using System.Data.Common;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;
using FormMaps.Application.Email;
using FormMaps.Application.SchoolAdmin;
using Microsoft.Extensions.Logging;

namespace FormMaps.Infrastructure.SchoolAdmin;

/// <summary>
/// The two school-admin email writes (legacy sendReminders + setup360, schoolAssessmentsService.ts).
/// sendReminders = read school+students then fan out reminder emails (no DB write). setup360 = load
/// students/existing-groups/parent-links/counselor-assignments → dedup → bulk-INSERT evaluation_groups →
/// fire invite emails best-effort. Uses a WRITABLE Identity-RLS session for setup360 (school-scoped via the
/// students' schoolId), NOT the FM-043 bypass rail. Emails are best-effort (IEmailSender never throws).
/// </summary>
public sealed class SchoolAdminEmailWriter(
    IFormMapsDatabaseSessionFactory databaseSessionFactory,
    IEmailSender emailSender,
    EmailTemplates templates,
    EmailOptions options) : ISchoolAdminEmailWriter
{
    private const long TokenExpiryMs = 48L * 60 * 60 * 1000;

    public async Task<ReminderResult?> SendRemindersAsync(
        RequestContext context, string schoolId, IReadOnlyList<string> studentIds,
        IReadOnlyList<string> assessmentTypes, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);

        // school lookup (name) — null -> null -> route 404 "School not found".
        string schoolName;
        await using (var command = Command(session, """SELECT "name" FROM "schools" WHERE "id" = @sid"""))
        {
            AddParameter(command, "sid", schoolId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            if (!await reader.ReadAsync(cancellationToken))
            {
                return null;
            }

            schoolName = reader.IsDBNull(0) ? string.Empty : reader.GetString(0);
        }

        var students = await LoadStudentsAsync(session, studentIds, schoolId, cancellationToken);

        var pending = assessmentTypes.ToList();
        var sent = 0;
        var failed = 0;
        foreach (var s in students)
        {
            var msg = templates.BuildAssessmentReminder(s.Name, schoolName, pending);
            var ok = await emailSender.SendAsync(s.Email, msg.Subject, msg.Html, cancellationToken);
            if (ok)
            {
                sent++;
            }
            else
            {
                failed++;
            }
        }

        return new ReminderResult(sent, failed, students.Count);
    }

    public async Task<Setup360Result?> Setup360Async(
        RequestContext context, string schoolId, string? userId, IReadOnlyList<string> studentIds,
        int? gradeLevel, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        // gradeLevel truthy (0 is falsy in the legacy `if (gradeLevel && ...)`) AND no explicit ids -> resolve grade.
        var ids = studentIds.ToList();
        if (gradeLevel is { } grade && grade != 0 && ids.Count == 0)
        {
            await using var command = Command(session, """
                SELECT "id" FROM "users"
                WHERE "schoolId" = @sid AND "gradeLevel" = @grade
                  AND "roleName" IN ('student', 'Student') AND "isActive" = true
                """);
            AddParameter(command, "sid", schoolId);
            AddParameter(command, "grade", grade);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                ids.Add(reader.GetString(0));
            }
        }

        if (ids.Count == 0)
        {
            return null; // -> route 400 "No students to setup"
        }

        var students = await LoadStudentsAsync(session, ids, schoolId, cancellationToken);
        var sIds = students.Select(s => s.Id).ToArray();

        // Dedup set of existing active groups: key "evaluatedUserId|evaluatorEmail|groupType".
        var existing = new HashSet<string>(StringComparer.Ordinal);
        await using (var command = Command(session, """
            SELECT "evaluatedUserId", "evaluatorEmail", "groupType" FROM "evaluation_groups"
            WHERE "evaluatedUserId" = ANY(@sids) AND "isActive" = true
            """))
        {
            AddArray(command, "sids", sIds);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                existing.Add($"{reader.GetString(0)}|{reader.GetString(1)}|{reader.GetString(2)}");
            }
        }

        // Parent links per student.
        var parentLinks = new List<(string StudentId, string ParentEmail, string? ParentName, string? Relation)>();
        await using (var command = Command(session, """
            SELECT "studentId", "parentEmail", "parentName", "relation" FROM "student_parent_links"
            WHERE "studentId" = ANY(@sids) AND "isActive" = true
            """))
        {
            AddArray(command, "sids", sIds);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                parentLinks.Add((reader.GetString(0), reader.GetString(1),
                    reader.IsDBNull(2) ? null : reader.GetString(2),
                    reader.IsDBNull(3) ? null : reader.GetString(3)));
            }
        }

        // Counselor assignments -> counselor users.
        var assignments = new List<(string StudentId, string CounselorId)>();
        await using (var command = Command(session, """
            SELECT "studentId", "counselorId" FROM "counselor_student_assignments"
            WHERE "studentId" = ANY(@sids) AND "isActive" = true
            """))
        {
            AddArray(command, "sids", sIds);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                assignments.Add((reader.GetString(0), reader.GetString(1)));
            }
        }

        var counselors = new Dictionary<string, (string Name, string Email)>(StringComparer.Ordinal);
        var counselorIds = assignments.Select(a => a.CounselorId).Distinct().ToArray();
        if (counselorIds.Length > 0)
        {
            await using var command = Command(session, """SELECT "id", "name", "email" FROM "users" WHERE "id" = ANY(@cids)""");
            AddArray(command, "cids", counselorIds);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                counselors[reader.GetString(0)] = (reader.IsDBNull(1) ? string.Empty : reader.GetString(1), reader.GetString(2));
            }
        }

        var now = Now();
        var expiry = now.AddMilliseconds(TokenExpiryMs);
        var groups = new List<GroupInsert>();
        var invites = new List<(string Email, string Name, string StudentName, string Token)>();
        var skipped = 0;

        foreach (var student in students)
        {
            // (a) Self-as-Parent (no invite email for self).
            if (existing.Add($"{student.Id}|{student.Email}|Parent"))
            {
                groups.Add(new GroupInsert(student.Name, student.Email, "Self", "Parent", student.Id, InvitationTokenGenerator.Generate(), userId));
            }
            else
            {
                skipped++;
            }

            // (b) Parent links.
            foreach (var link in parentLinks.Where(l => l.StudentId == student.Id))
            {
                var parentEmail = link.ParentEmail.ToLowerInvariant();
                var name = string.IsNullOrEmpty(link.ParentName) ? "Parent" : link.ParentName!;
                if (!existing.Add($"{student.Id}|{parentEmail}|Parent"))
                {
                    skipped++;
                    continue;
                }

                var token = InvitationTokenGenerator.Generate();
                groups.Add(new GroupInsert(name, parentEmail, string.IsNullOrEmpty(link.Relation) ? "Parent" : link.Relation!, "Parent", student.Id, token, userId));
                invites.Add((link.ParentEmail, name, student.Name, token));
            }

            // (c) Counselor (if assigned).
            var assignment = assignments.FirstOrDefault(a => a.StudentId == student.Id);
            if (assignment.CounselorId is not null && counselors.TryGetValue(assignment.CounselorId, out var counselor))
            {
                if (existing.Add($"{student.Id}|{counselor.Email}|Teacher"))
                {
                    var token = InvitationTokenGenerator.Generate();
                    groups.Add(new GroupInsert(counselor.Name, counselor.Email, "Counselor", "Teacher", student.Id, token, userId));
                    invites.Add((counselor.Email, counselor.Name, student.Name, token));
                }
                else
                {
                    skipped++;
                }
            }
        }

        if (groups.Count > 0)
        {
            await InsertGroupsAsync(session, groups, expiry, now, cancellationToken);
        }

        await session.CommitAsync(cancellationToken);

        // Best-effort invites AFTER commit (matches legacy: createMany, then Promise.allSettled sends).
        var emailsSent = 0;
        foreach (var invite in invites)
        {
            var url = $"{options.InviteBaseUrl}/evaluation/evaluator?token={invite.Token}";
            var msg = templates.BuildEvaluationInvite(invite.Name, invite.StudentName, url);
            if (await emailSender.SendAsync(invite.Email, msg.Subject, msg.Html, cancellationToken))
            {
                emailsSent++;
            }
        }

        return new Setup360Result(groups.Count, skipped, emailsSent, students.Count);
    }

    // ---- helpers ----

    private sealed record StudentRow(string Id, string Name, string Email);

    private sealed record GroupInsert(
        string EvaluatorName, string EvaluatorEmail, string Relation, string GroupType,
        string EvaluatedUserId, string InvitationToken, string? CreatedBy);

    private static async Task<List<StudentRow>> LoadStudentsAsync(
        FormMapsDatabaseSession session, IReadOnlyList<string> ids, string schoolId, CancellationToken cancellationToken)
    {
        var rows = new List<StudentRow>();
        await using var command = Command(session, """
            SELECT "id", "name", "email" FROM "users"
            WHERE "id" = ANY(@ids) AND "schoolId" = @sid AND "isActive" = true
            """);
        AddArray(command, "ids", ids.ToArray());
        AddParameter(command, "sid", schoolId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            rows.Add(new StudentRow(
                reader.GetString(0),
                reader.IsDBNull(1) ? string.Empty : reader.GetString(1),
                reader.GetString(2)));
        }

        return rows;
    }

    private static async Task InsertGroupsAsync(
        FormMapsDatabaseSession session, List<GroupInsert> groups, DateTime expiry, DateTime now, CancellationToken cancellationToken)
    {
        // Single multi-row INSERT (legacy prisma.createMany). id generated app-side (no DB default, matches Prisma
        // @default(uuid())); isActive/isTokenUsed/isEvaluationCompleted/createdDate take their DB defaults.
        var values = new List<string>(groups.Count);
        await using var command = session.Connection.CreateCommand();
        command.Transaction = session.Transaction;
        for (var i = 0; i < groups.Count; i++)
        {
            values.Add($"(@id{i}, @en{i}, @ee{i}, @rel{i}, @gt{i}, @eu{i}, @tok{i}, @exp, @cb{i}, @upd)");
            AddParameter(command, $"id{i}", Guid.NewGuid().ToString());
            AddParameter(command, $"en{i}", groups[i].EvaluatorName);
            AddParameter(command, $"ee{i}", groups[i].EvaluatorEmail);
            AddParameter(command, $"rel{i}", groups[i].Relation);
            AddParameter(command, $"gt{i}", groups[i].GroupType);
            AddParameter(command, $"eu{i}", groups[i].EvaluatedUserId);
            AddParameter(command, $"tok{i}", groups[i].InvitationToken);
            AddParameter(command, $"cb{i}", (object?)groups[i].CreatedBy ?? DBNull.Value);
        }

        AddTimestamp(command, "exp", expiry);
        // updatedAt is Prisma @updatedAt = app-managed, NOT NULL with NO db default in prod — a raw INSERT that
        // omits it fails 23502. Set it explicitly (= now), like every other .NET insert. createdDate is safe to
        // omit (it has a db default). (Gate fix: the test fixture had wrongly given updatedAt a DEFAULT, masking this.)
        AddTimestamp(command, "upd", now);
        command.CommandText =
            "INSERT INTO \"evaluation_groups\" " +
            "(\"id\", \"evaluatorName\", \"evaluatorEmail\", \"relation\", \"groupType\", \"evaluatedUserId\", \"invitationToken\", \"tokenExpiryDate\", \"createdBy\", \"updatedAt\") " +
            "VALUES " + string.Join(", ", values);
        await command.ExecuteNonQueryAsync(cancellationToken);
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

    private static void AddArray(DbCommand command, string name, string[] value)
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

    private static DateTime Now()
    {
        var utc = DateTime.SpecifyKind(DateTimeOffset.UtcNow.UtcDateTime, DateTimeKind.Unspecified);
        return new DateTime(utc.Ticks - (utc.Ticks % TimeSpan.TicksPerMillisecond), DateTimeKind.Unspecified);
    }
}
