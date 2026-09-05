using System.Text.Json;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;
using FormMaps.Application.Graduation;

namespace FormMaps.Infrastructure.Graduation;

/// <summary>
/// The student-facing graduation-plan surface (issue #55 remainder) — a faithful port of legacy
/// <c>routes/graduation-plan.ts</c>'s six non-AI routes over
/// <c>services/graduationPlanService.ts</c> + <c>services/planWorkflowService.ts</c>. POST /generate is NOT
/// here and never will be (DECISION D1: aiLimiter + Bedrock, permanently Node).
///
/// <para>SESSIONS. Every read and every write runs on the CALLER's own RLS session. The caller is the student
/// on all six routes, so the own-row arm of the <c>student_graduation_targets</c> policy and the school arm of
/// <c>graduation_plans</c> both admit exactly the right rows without any widening. The single exception is the
/// notification fan-out, which is delegated to <see cref="GraduationNotificationWriter"/> — see that class for
/// the runAsSystem port and the lazy-PrismaPromise trap it must not reproduce.</para>
///
/// <para>TENANT PREDICATES ARE APP-LAYER, NOT RLS. <c>graduation_plans</c> and <c>graduation_plan_items</c> are
/// policied on <c>schoolId</c> only, so every read here carries an explicit <c>"studentId" = @sid</c>. Deleting
/// that predicate leaves the query returning a same-school peer's plan and the RLS proof tests are written to
/// go red on exactly that edit.</para>
/// </summary>
public sealed class GraduationPlanRepository(
    IFormMapsDatabaseSessionFactory databaseSessionFactory,
    IGraduationNotificationWriter notificationWriter) : IGraduationPlanRepository
{
    private static readonly string[] SupplementalPlanStatuses = ["draft", "proposed", "approved"];

    // ---------------------------------------------------------------- GET /graduation-plan/target

    public async Task<TargetOrSuggestion> GetTargetOrSuggestionAsync(
        RequestContext context, string userId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);

        var (saved, isActive) = await ReadTargetAsync(session, userId, cancellationToken);
        if (saved is not null && isActive)
        {
            return new TargetOrSuggestion(saved, null);
        }

        // graduationPlanService.ts:44-48 — three independent reads, then the university by the favorite's id.
        string? favoriteUniversityId = null;
        await using (var command = Command(session, """
            SELECT "universityId" FROM "university_favorites"
            WHERE "userId" = @uid AND "isActive" = true
            ORDER BY "favoritedAt" DESC
            LIMIT 1
            """))
        {
            AddParameter(command, "uid", userId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            if (await reader.ReadAsync(cancellationToken))
            {
                favoriteUniversityId = reader.GetString(0);
            }
        }

        string[] targetCareers = [];
        await using (var command = Command(session, """
            SELECT "targetCareers" FROM "user_preferences" WHERE "userId" = @uid
            """))
        {
            AddParameter(command, "uid", userId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            if (await reader.ReadAsync(cancellationToken) && !reader.IsDBNull(0))
            {
                targetCareers = reader.GetFieldValue<string[]>(0);
            }
        }

        JsonElement? careerMatches = null;
        await using (var command = Command(session, """
            SELECT "careerMatches" FROM "user_career_profiles" WHERE "userId" = @uid
            """))
        {
            AddParameter(command, "uid", userId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            if (await reader.ReadAsync(cancellationToken))
            {
                careerMatches = GraduationPlanDataQuery.ReadJsonOrNull(reader, 0);
            }
        }

        string? universityId = null;
        string? universityName = null;
        if (favoriteUniversityId is not null)
        {
            await using var command = Command(session, """
                SELECT "id", "name" FROM "universities" WHERE "id" = @id
                """);
            AddParameter(command, "id", favoriteUniversityId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            if (await reader.ReadAsync(cancellationToken))
            {
                universityId = reader.GetString(0);
                universityName = reader.GetString(1);
            }
        }

        // `careers[0] || (matches[0]?.programTitle as string | undefined) || null` — note that an EMPTY-STRING
        // first career is falsy and therefore skipped, and that programTitle is whatever jsonb holds.
        object? major = null;
        if (targetCareers.Length > 0 && targetCareers[0].Length > 0)
        {
            major = targetCareers[0];
        }
        else if (careerMatches is { ValueKind: JsonValueKind.Array } matches
                 && matches.GetArrayLength() > 0
                 && matches[0].ValueKind == JsonValueKind.Object
                 && matches[0].TryGetProperty("programTitle", out var programTitle)
                 && !IsJsFalsy(programTitle))
        {
            major = programTitle;
        }

        // `if (!uni && !major) return null` — uni is the RESOLVED university row, so a favorite pointing at a
        // deleted university does not by itself produce a suggestion.
        if (universityId is null && major is null)
        {
            return new TargetOrSuggestion(null, null);
        }

        return new TargetOrSuggestion(null, new SuggestedTarget(universityId, universityName, major));
    }

    // ---------------------------------------------------------------- PUT /graduation-plan/target

    public async Task<SavedTargetRow> SetTargetAsync(
        RequestContext context, string userId, string? schoolId, SetTargetInput input,
        CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        var major = GraduationPlanDataQuery.Slice(input.Major, 200);

        // `input.universityName ? String(...).slice(0, 200) : null` — an empty string is falsy, so it is null.
        string? universityId = null;
        var universityName = string.IsNullOrEmpty(input.UniversityName)
            ? null
            : GraduationPlanDataQuery.Slice(input.UniversityName, 200);
        double? acceptanceRate = null;

        // `if (input.universityId)` — falsy (absent/empty) skips the lookup entirely. A universityId that does
        // NOT resolve leaves universityId null AND leaves the body's universityName in place: the row is saved
        // with source "recommendation" but no university id. Ported as written.
        if (!string.IsNullOrEmpty(input.UniversityId))
        {
            await using var command = Command(session, """
                SELECT "id", "name", "acceptanceRate"::double precision FROM "universities" WHERE "id" = @id
                """);
            AddParameter(command, "id", input.UniversityId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            if (await reader.ReadAsync(cancellationToken))
            {
                universityId = reader.GetString(0);
                universityName = reader.GetString(1);
                acceptanceRate = reader.IsDBNull(2) ? null : reader.GetDouble(2);

                // "stored as percent" — anything above 1 is divided by 100. A rate of exactly 1 (100%) is NOT
                // divided, which is legacy's behaviour and lands it in the "open" band either way.
                if (acceptanceRate is > 1d)
                {
                    acceptanceRate /= 100d;
                }
            }
        }

        string[] preferredFields = [];
        await using (var command = Command(session, """
            SELECT "preferredFields" FROM "user_preferences" WHERE "userId" = @uid
            """))
        {
            AddParameter(command, "uid", userId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            if (await reader.ReadAsync(cancellationToken) && !reader.IsDBNull(0))
            {
                preferredFields = reader.GetFieldValue<string[]>(0);
            }
        }

        var fieldKey = RigorTemplates.NormalizeField(major, preferredFields);
        var tier = RigorTemplates.ResolveTier(
            hasUniversity: universityId is not null || universityName is not null,
            acceptanceRate: acceptanceRate);
        var templateKey = $"{fieldKey}:{tier}";
        var source = string.IsNullOrEmpty(input.UniversityId) ? "manual" : "recommendation";
        var now = GraduationPlanDataQuery.Now();

        // Prisma upsert on the @unique studentId. `create` sets createdBy, `update` sets updatedBy — so the
        // conflict arm must NOT touch createdBy, which is why the SET list is explicit rather than EXCLUDED.*.
        SavedTargetRow saved;
        await using (var command = Command(session, """
            INSERT INTO "student_graduation_targets"
                ("id", "studentId", "schoolId", "universityId", "universityName", "major", "fieldKey",
                 "selectivityTier", "templateKey", "source", "isActive", "createdBy", "createdDate", "updatedAt")
            VALUES (gen_random_uuid()::text, @sid, @school, @uniId, @uniName, @major, @field,
                    @tier, @tkey, @source, true, @actor, @now, @now)
            ON CONFLICT ("studentId") DO UPDATE SET
                "schoolId" = EXCLUDED."schoolId",
                "universityId" = EXCLUDED."universityId",
                "universityName" = EXCLUDED."universityName",
                "major" = EXCLUDED."major",
                "fieldKey" = EXCLUDED."fieldKey",
                "selectivityTier" = EXCLUDED."selectivityTier",
                "templateKey" = EXCLUDED."templateKey",
                "source" = EXCLUDED."source",
                "isActive" = true,
                "updatedBy" = @actor,
                "updatedAt" = @now
            RETURNING "id", "universityId", "universityName", "major", "fieldKey", "selectivityTier", "templateKey"
            """))
        {
            AddParameter(command, "sid", userId);
            AddParameter(command, "school", schoolId);
            AddParameter(command, "uniId", universityId);
            AddParameter(command, "uniName", universityName);
            AddParameter(command, "major", major);
            AddParameter(command, "field", fieldKey);
            AddParameter(command, "tier", tier);
            AddParameter(command, "tkey", templateKey);
            AddParameter(command, "source", source);
            AddParameter(command, "actor", userId);
            GraduationPlanDataQuery.AddTimestamp(command, "now", now);

            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            await reader.ReadAsync(cancellationToken);
            saved = ReadSavedTarget(reader);
        }

        await session.CommitAsync(cancellationToken);
        return saved;
    }

    // ---------------------------------------------------------------- GET /graduation-plan

    public async Task<GraduationPlanDto?> GetCurrentPlanAsync(
        RequestContext context, string studentId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        return await GraduationPlanDataQuery.GetCurrentPlanAsync(session, studentId, cancellationToken);
    }

    // ---------------------------------------------------------------- POST /graduation-plan/submit

    public async Task<SubmitPlanResult> SubmitPlanAsync(
        RequestContext context, string studentId, CancellationToken cancellationToken = default)
    {
        string draftId;
        var recipients = new List<string>();
        string? studentName = null;

        await using (var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken))
        {
            // findFirst with NO orderBy — Prisma emits no ORDER BY, so this is whatever the scan yields. Left
            // unordered rather than "helpfully" made deterministic: adding an ORDER BY would change which draft
            // a (schema-forbidden) second one submits.
            await using (var command = Command(session, """
                SELECT "id" FROM "graduation_plans"
                WHERE "studentId" = @sid AND "isActive" = true AND "status" = 'draft'
                LIMIT 1
                """))
            {
                AddParameter(command, "sid", studentId);
                await using var reader = await command.ExecuteReaderAsync(cancellationToken);
                if (!await reader.ReadAsync(cancellationToken))
                {
                    // PlanError("NO_DRAFT") -> 400 { code: "NO_DRAFT" }.
                    return new SubmitPlanResult(false, null);
                }

                draftId = reader.GetString(0);
            }

            var now = GraduationPlanDataQuery.Now();
            await using (var command = Command(session, """
                UPDATE "graduation_plans"
                SET "status" = 'proposed', "submittedAt" = @now, "updatedBy" = @actor, "updatedAt" = @now
                WHERE "id" = @id
                """))
            {
                AddParameter(command, "id", draftId);
                AddParameter(command, "actor", studentId);
                GraduationPlanDataQuery.AddTimestamp(command, "now", now);
                await command.ExecuteNonQueryAsync(cancellationToken);
            }

            await using (var command = Command(session, """
                SELECT "counselorId" FROM "counselor_student_assignments"
                WHERE "studentId" = @sid AND "isActive" = true
                """))
            {
                AddParameter(command, "sid", studentId);
                await using var reader = await command.ExecuteReaderAsync(cancellationToken);
                while (await reader.ReadAsync(cancellationToken))
                {
                    recipients.Add(reader.GetString(0));
                }
            }

            await using (var command = Command(session, """SELECT "name" FROM "users" WHERE "id" = @id"""))
            {
                AddParameter(command, "id", studentId);
                await using var reader = await command.ExecuteReaderAsync(cancellationToken);
                if (await reader.ReadAsync(cancellationToken) && !reader.IsDBNull(0))
                {
                    studentName = reader.GetString(0);
                }
            }

            await session.CommitAsync(cancellationToken);
        }

        // `${student?.name || "A student"}` — an empty name is falsy and falls back too.
        var who = string.IsNullOrEmpty(studentName) ? "A student" : studentName;
        await notificationWriter.NotifyAllAsync(
            recipients.Select(counselorId => new GraduationNotification(
                counselorId,
                "Proposed graduation plan",
                $"{who} submitted a graduation plan for your review.")).ToList(),
            draftId,
            cancellationToken);

        await using var readSession = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        var plan = await GraduationPlanDataQuery.GetCurrentPlanAsync(readSession, studentId, cancellationToken);
        return new SubmitPlanResult(true, plan);
    }

    // ---------------------------------------------------------------- DELETE /graduation-plan

    public async Task<bool> DiscardDraftAsync(
        RequestContext context, string studentId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        string draftId;
        await using (var command = Command(session, """
            SELECT "id" FROM "graduation_plans"
            WHERE "studentId" = @sid AND "isActive" = true AND "status" = 'draft'
            LIMIT 1
            """))
        {
            AddParameter(command, "sid", studentId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            if (!await reader.ReadAsync(cancellationToken))
            {
                return false;
            }

            draftId = reader.GetString(0);
        }

        // A SOFT delete: isActive = false. The row and its items stay, which is what makes the 404-then-200
        // pair idempotent-ish — a second DELETE finds no active draft and 404s.
        await using (var command = Command(session, """
            UPDATE "graduation_plans"
            SET "isActive" = false, "updatedBy" = @actor, "updatedAt" = @now
            WHERE "id" = @id
            """))
        {
            AddParameter(command, "id", draftId);
            AddParameter(command, "actor", studentId);
            GraduationPlanDataQuery.AddTimestamp(command, "now", GraduationPlanDataQuery.Now());
            await command.ExecuteNonQueryAsync(cancellationToken);
        }

        await session.CommitAsync(cancellationToken);
        return true;
    }

    // ---------------------------------------------------------------- GET /graduation-plan/supplemental

    public async Task<IReadOnlyList<SupplementalCourseDto>> GetSupplementalRecommendationsAsync(
        RequestContext context, string userId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);

        string fieldKey;
        string major;
        await using (var command = Command(session, """
            SELECT "isActive", "fieldKey", "major" FROM "student_graduation_targets" WHERE "studentId" = @sid
            """))
        {
            AddParameter(command, "sid", userId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            // `if (!target?.isActive) return []` — no row OR an inactive row is an empty rail.
            if (!await reader.ReadAsync(cancellationToken) || !reader.GetBoolean(0))
            {
                return [];
            }

            fieldKey = reader.GetString(1);
            major = reader.GetString(2);
        }

        JsonElement? gapReport = null;
        await using (var command = Command(session, """
            SELECT "gapReport" FROM "graduation_plans"
            WHERE "studentId" = @sid AND "isActive" = true AND "status" = ANY(@statuses)
            ORDER BY "createdDate" DESC
            LIMIT 1
            """))
        {
            AddParameter(command, "sid", userId);
            AddParameter(command, "statuses", SupplementalPlanStatuses);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            if (await reader.ReadAsync(cancellationToken))
            {
                gapReport = GraduationPlanDataQuery.ReadJsonOrNull(reader, 0);
            }
        }

        // The GLOBAL catalog: `course.findMany({ where: { isActive: true }, orderBy: { createdDate: "desc" },
        // take: 200 })`. No school scoping — these are Coursera-style external courses, not school_courses.
        var candidates = new List<SupplementalCandidate>();
        await using (var command = Command(session, """
            SELECT "id", "title", "provider", "category", "rating"::double precision, "skills", "careerPaths"
            FROM "courses"
            WHERE "isActive" = true
            ORDER BY "createdDate" DESC
            LIMIT 200
            """))
        {
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                candidates.Add(new SupplementalCandidate(
                    Id: reader.GetString(0),
                    Title: reader.GetString(1),
                    Provider: reader.IsDBNull(2) ? null : reader.GetString(2),
                    Category: reader.IsDBNull(3) ? null : reader.GetString(3),
                    Rating: reader.IsDBNull(4) ? null : reader.GetDouble(4),
                    Skills: reader.IsDBNull(5) ? [] : reader.GetFieldValue<string[]>(5),
                    CareerPaths: reader.IsDBNull(6) ? [] : reader.GetFieldValue<string[]>(6)));
            }
        }

        // NOTE: no isActive filter on the enrollment read — legacy queries `{ studentId }` alone, so a
        // soft-deleted enrollment still suppresses its course from the rail. DIVERGENCE NOT MADE.
        var enrolled = new HashSet<string>(StringComparer.Ordinal);
        await using (var command = Command(session, """
            SELECT "courseId" FROM "course_enrollments" WHERE "studentId" = @sid
            """))
        {
            AddParameter(command, "sid", userId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                enrolled.Add(reader.GetString(0));
            }
        }

        return SupplementalScoring.Score(
            candidates, enrolled, SupplementalScoring.GapCategories(gapReport), fieldKey, major);
    }

    // ---------------------------------------------------------------- helpers

    internal static async Task<(SavedTargetRow? Row, bool IsActive)> ReadTargetAsync(
        FormMapsDatabaseSession session, string studentId, CancellationToken cancellationToken)
    {
        await using var command = Command(session, """
            SELECT "id", "universityId", "universityName", "major", "fieldKey", "selectivityTier", "templateKey",
                   "isActive"
            FROM "student_graduation_targets"
            WHERE "studentId" = @sid
            """);
        AddParameter(command, "sid", studentId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return (null, false);
        }

        return (ReadSavedTarget(reader), reader.GetBoolean(7));
    }

    private static SavedTargetRow ReadSavedTarget(System.Data.Common.DbDataReader reader) => new(
        Id: reader.GetString(0),
        UniversityId: reader.IsDBNull(1) ? null : reader.GetString(1),
        UniversityName: reader.IsDBNull(2) ? null : reader.GetString(2),
        Major: reader.GetString(3),
        FieldKey: reader.GetString(4),
        SelectivityTier: reader.GetString(5),
        TemplateKey: reader.GetString(6));

    /// <summary>
    /// The <c>||</c> in <c>matches[0]?.programTitle || null</c>: JSON null, false, 0 and "" are all falsy and
    /// fall through to null; every other value (including an object or an array) is truthy and is emitted.
    /// </summary>
    private static bool IsJsFalsy(JsonElement value) => value.ValueKind switch
    {
        JsonValueKind.Null or JsonValueKind.Undefined or JsonValueKind.False => true,
        JsonValueKind.String => value.GetString()!.Length == 0,
        JsonValueKind.Number => value.TryGetDouble(out var d) && (d == 0d || double.IsNaN(d)),
        _ => false,
    };

    private static System.Data.Common.DbCommand Command(FormMapsDatabaseSession session, string sql) =>
        GraduationPlanDataQuery.Command(session, sql);

    private static void AddParameter(System.Data.Common.DbCommand command, string name, object? value) =>
        GraduationPlanDataQuery.AddParameter(command, name, value);
}
