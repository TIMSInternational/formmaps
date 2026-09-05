using FormMaps.Application.Auth;
using FormMaps.Application.Data;
using FormMaps.Application.Graduation;

namespace FormMaps.Infrastructure.Graduation;

/// <summary>
/// The counselor half of the graduation-plan lane (issue #55 remainder) — legacy
/// <c>routes/counselor-graduation.ts</c> GET and PUT /review over <c>reviewPlan</c>
/// (planWorkflowService.ts:64). POST .../generate is not here (DECISION D1).
///
/// <para>Everything runs on the COUNSELOR's own RLS session, including the write to
/// <c>student_course_plans</c> — legacy's <c>basePrisma.$transaction</c> + <c>setTenantGuc(tx)</c> is the
/// caller's Identity GUC, not a bypass, and this reproduces that exactly. Only the notification fan-out is
/// System, and only for the reason <see cref="GraduationNotificationWriter"/> documents.</para>
/// </summary>
public sealed class CounselorGraduationRepository(
    IFormMapsDatabaseSessionFactory databaseSessionFactory,
    IGraduationNotificationWriter notificationWriter) : ICounselorGraduationRepository
{
    // ---------------------------------------------------------------- the assignment gate

    /// <summary>
    /// ensureCounselorStudentAccess (counselor-graduation.ts:16).
    ///
    /// <para><c>"counselorId" = @counselor</c> IS THE GATE, not RLS. The
    /// <c>counselor_student_assignments</c> policy admits every row whose student is in the caller's school,
    /// so without this predicate a counselor would pass the check on any same-school student who is assigned to
    /// ANY colleague. The RLS proof test removes exactly this line and asserts the 404 turns into a 200.</para>
    /// </summary>
    public async Task<bool> IsAssignedAsync(
        RequestContext context, string counselorId, string studentId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);

        await using var command = Command(session, """
            SELECT 1 FROM "counselor_student_assignments"
            WHERE "counselorId" = @counselor AND "studentId" = @student AND "isActive" = true
            LIMIT 1
            """);
        AddParameter(command, "counselor", counselorId);
        AddParameter(command, "student", studentId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        return await reader.ReadAsync(cancellationToken);
    }

    // ---------------------------------------------------------------- GET .../graduation-plan

    public async Task<CounselorPlanView> GetPlanAsync(
        RequestContext context, string studentId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);

        var plan = await GraduationPlanDataQuery.GetCurrentPlanAsync(session, studentId, cancellationToken);
        var (target, isActive) = await GraduationPlanRepository.ReadTargetAsync(session, studentId, cancellationToken);

        // `target?.isActive ? { universityName, major, templateKey } : null` — three keys, never the nine the
        // student's own GET /target returns, and null (not an empty object) for an inactive target.
        return new CounselorPlanView(
            plan,
            target is not null && isActive
                ? new CounselorTargetProjection(target.UniversityName, target.Major, target.TemplateKey)
                : null);
    }

    // ---------------------------------------------------------------- PUT .../graduation-plan/review

    public async Task<ReviewPlanResult> ReviewPlanAsync(
        RequestContext context, string counselorId, string studentId, string decision, string? note,
        CancellationToken cancellationToken = default)
    {
        var rejected = string.Equals(decision, "rejected", StringComparison.Ordinal);

        string planId;
        string planSchoolId;
        var notifications = new List<GraduationNotification>();
        var materialized = 0;

        await using (var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken))
        {
            // findFirst, no orderBy — the partial-unique index makes at most one plan `proposed` at a time.
            await using (var command = Command(session, """
                SELECT "id", "schoolId" FROM "graduation_plans"
                WHERE "studentId" = @sid AND "isActive" = true AND "status" = 'proposed'
                LIMIT 1
                """))
            {
                AddParameter(command, "sid", studentId);
                await using var reader = await command.ExecuteReaderAsync(cancellationToken);
                if (!await reader.ReadAsync(cancellationToken))
                {
                    // `return null` -> 404 "No proposed plan to review".
                    return new ReviewPlanResult(ReviewPlanOutcome.NoProposedPlan, null, 0);
                }

                planId = reader.GetString(0);
                planSchoolId = reader.GetString(1);
            }

            var now = GraduationPlanDataQuery.Now();

            if (rejected)
            {
                // The route guarantees a non-empty trimmed note before we get here, so `note!.slice(0, 1000)`
                // is never null and never becomes NULL — unlike the approve arm below.
                var reviewNote = GraduationPlanDataQuery.Slice(note ?? string.Empty, 1000);

                await using (var command = Command(session, """
                    UPDATE "graduation_plans"
                    SET "status" = 'rejected', "reviewedBy" = @counselor, "reviewedAt" = @now,
                        "reviewNote" = @note, "updatedAt" = @now
                    WHERE "id" = @id
                    """))
                {
                    AddParameter(command, "id", planId);
                    AddParameter(command, "counselor", counselorId);
                    AddParameter(command, "note", reviewNote);
                    GraduationPlanDataQuery.AddTimestamp(command, "now", now);
                    await command.ExecuteNonQueryAsync(cancellationToken);
                }

                // The message quotes the note truncated to 200, which is SHORTER than the 1000 stored.
                notifications.Add(new GraduationNotification(
                    studentId,
                    "Graduation plan needs changes",
                    $"Your counselor requested changes: \"{GraduationPlanDataQuery.Slice(note ?? string.Empty, 200)}\""));

                await session.CommitAsync(cancellationToken);
            }
            else
            {
                // ---- approve ----------------------------------------------------------------------------
                int? studentGradeLevel = null;
                string? studentName = null;
                await using (var command = Command(session, """
                    SELECT "gradeLevel", "name" FROM "users" WHERE "id" = @id
                    """))
                {
                    AddParameter(command, "id", studentId);
                    await using var reader = await command.ExecuteReaderAsync(cancellationToken);
                    if (await reader.ReadAsync(cancellationToken))
                    {
                        studentGradeLevel = reader.IsDBNull(0) ? null : reader.GetInt32(0);
                        studentName = reader.IsDBNull(1) ? null : reader.GetString(1);
                    }
                }

                // academicYear.findFirst({ schoolId: plan.schoolId, isCurrent: true }) — the PLAN's school, not
                // the student's and not the counselor's.
                string? currentYearId = null;
                await using (var command = Command(session, """
                    SELECT "id" FROM "academic_years"
                    WHERE "schoolId" = @school AND "isCurrent" = true
                    LIMIT 1
                    """))
                {
                    AddParameter(command, "school", planSchoolId);
                    await using var reader = await command.ExecuteReaderAsync(cancellationToken);
                    if (await reader.ReadAsync(cancellationToken))
                    {
                        currentYearId = reader.GetString(0);
                    }
                }

                if (currentYearId is null)
                {
                    // PlanError("NO_CURRENT_YEAR") is thrown BEFORE the transaction in legacy, so nothing is
                    // written. Returning without committing gives the same outcome here.
                    return new ReviewPlanResult(ReviewPlanOutcome.NoCurrentYear, null, 0);
                }

                var alreadyPlanned = new HashSet<string>(StringComparer.Ordinal);
                await using (var command = Command(session, """
                    SELECT "courseId" FROM "student_course_plans"
                    WHERE "studentId" = @sid AND "isActive" = true
                    """))
                {
                    AddParameter(command, "sid", studentId);
                    await using var reader = await command.ExecuteReaderAsync(cancellationToken);
                    while (await reader.ReadAsync(cancellationToken))
                    {
                        alreadyPlanned.Add(reader.GetString(0));
                    }
                }

                // `student?.gradeLevel ?? 9` — a student with no grade level is treated as a freshman, so ONLY
                // grade-9 items materialize for them.
                var currentGrade = studentGradeLevel ?? 9;

                var toMaterialize = new List<(string CourseId, int GradeLevel, string? Term)>();
                await using (var command = Command(session, """
                    SELECT "courseId", "gradeLevel", "term" FROM "graduation_plan_items"
                    WHERE "planId" = @pid AND "isActive" = true AND "gradeLevel" = @grade
                    """))
                {
                    AddParameter(command, "pid", planId);
                    AddParameter(command, "grade", currentGrade);
                    await using var reader = await command.ExecuteReaderAsync(cancellationToken);
                    while (await reader.ReadAsync(cancellationToken))
                    {
                        var courseId = reader.GetString(0);
                        if (alreadyPlanned.Contains(courseId))
                        {
                            continue;
                        }

                        toMaterialize.Add((courseId, reader.GetInt32(1), reader.IsDBNull(2) ? null : reader.GetString(2)));
                    }
                }

                // `(note || "").slice(0, 1000) || null` — an absent or all-whitespace-trimmed-to-empty note on
                // an APPROVE stores SQL NULL, not the empty string. Different from the reject arm.
                var approveNote = GraduationPlanDataQuery.Slice(note ?? string.Empty, 1000);
                await using (var command = Command(session, """
                    UPDATE "graduation_plans"
                    SET "status" = 'approved', "reviewedBy" = @counselor, "reviewedAt" = @now,
                        "reviewNote" = @note, "updatedAt" = @now
                    WHERE "id" = @id
                    """))
                {
                    AddParameter(command, "id", planId);
                    AddParameter(command, "counselor", counselorId);
                    AddParameter(command, "note", approveNote.Length == 0 ? null : approveNote);
                    GraduationPlanDataQuery.AddTimestamp(command, "now", now);
                    await command.ExecuteNonQueryAsync(cancellationToken);
                }

                foreach (var item in toMaterialize)
                {
                    // formmaps#122/#130: "gradeLevel" carries THE ITEM'S OWN gradeLevel, never the student's.
                    // It is correct-by-accident today — the filter above keeps only items whose gradeLevel
                    // equals currentGrade, so a NULL column plus the reader's `?? user.gradeLevel` fallback
                    // happen to agree — and that invisible coupling is one filter change away from silently
                    // re-bucketing a whole future year. GraduationPlanItem.gradeLevel is NOT NULL and is
                    // already in hand, so it is written explicitly. The other two writers into this table
                    // (SchoolStudentsReviewWriter's approve path, StudentCoursePlanRepository's create) carry
                    // it the same way; if only some did, the resulting plan would depend on who clicked.
                    await using var command = Command(session, """
                        INSERT INTO "student_course_plans"
                            ("id", "studentId", "schoolId", "academicYearId", "courseId", "term", "gradeLevel",
                             "status", "sortOrder", "isActive", "createdBy", "createdDate", "updatedAt")
                        VALUES (gen_random_uuid()::text, @student, @school, @ay, @course, @term, @grade,
                                'planned', 0, true, @actor, @now, @now)
                        """);
                    AddParameter(command, "student", studentId);
                    AddParameter(command, "school", planSchoolId);
                    AddParameter(command, "ay", currentYearId);
                    AddParameter(command, "course", item.CourseId);
                    AddParameter(command, "term", item.Term);
                    AddParameter(command, "grade", item.GradeLevel);
                    AddParameter(command, "actor", counselorId);
                    GraduationPlanDataQuery.AddTimestamp(command, "now", now);
                    await command.ExecuteNonQueryAsync(cancellationToken);
                }

                materialized = toMaterialize.Count;

                var parents = new List<string>();
                await using (var command = Command(session, """
                    SELECT "parentUserId" FROM "student_parent_links"
                    WHERE "studentId" = @sid AND "isActive" = true AND "isAccepted" = true
                      AND "parentUserId" IS NOT NULL
                    """))
                {
                    AddParameter(command, "sid", studentId);
                    await using var reader = await command.ExecuteReaderAsync(cancellationToken);
                    while (await reader.ReadAsync(cancellationToken))
                    {
                        parents.Add(reader.GetString(0));
                    }
                }

                await session.CommitAsync(cancellationToken);

                var who = string.IsNullOrEmpty(studentName) ? "Your student" : studentName;
                notifications.Add(new GraduationNotification(
                    studentId,
                    "Graduation plan approved \U0001F393",
                    $"Your counselor approved your plan — {materialized} course(s) were added to this year's schedule."));
                notifications.AddRange(parents.Select(parentUserId => new GraduationNotification(
                    parentUserId,
                    "Graduation plan approved",
                    $"{who}'s graduation plan was approved by their counselor.")));
            }
        }

        await notificationWriter.NotifyAllAsync(notifications, planId, cancellationToken);

        await using var readSession = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        var refreshed = await GraduationPlanDataQuery.GetCurrentPlanAsync(readSession, studentId, cancellationToken);
        return new ReviewPlanResult(ReviewPlanOutcome.Reviewed, refreshed, materialized);
    }

    private static System.Data.Common.DbCommand Command(FormMapsDatabaseSession session, string sql) =>
        GraduationPlanDataQuery.Command(session, sql);

    private static void AddParameter(System.Data.Common.DbCommand command, string name, object? value) =>
        GraduationPlanDataQuery.AddParameter(command, name, value);
}
