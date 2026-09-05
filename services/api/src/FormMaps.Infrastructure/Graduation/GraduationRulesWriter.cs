using System.Data;
using System.Data.Common;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;
using FormMaps.Application.Graduation;
using FormMaps.Infrastructure.Gradebook;

namespace FormMaps.Infrastructure.Graduation;

/// <summary>
/// Writes for POST/PUT /api/v1/school-admin/graduation/rules (issue #55), porting
/// <c>schoolGradesService.createGraduationRules</c> / <c>updateGraduationRules</c>.
///
/// Both run in ONE writable session under the caller's RLS GUCs and commit at the end. For the PUT that is not
/// an optimisation — legacy wraps it in a <c>$transaction</c> precisely so the delete-and-recreate of the child
/// rows cannot half-apply and leave a rule set with no requirements. The ownership check runs BEFORE the first
/// statement for the same reason.
///
/// createdBy / updatedBy: legacy writes <c>updatedBy</c> on the PUT's rule-set UPDATE and nothing else — the
/// POST sets neither, and no child row on either path gets one. Reproduced exactly (they stay NULL).
/// </summary>
public sealed class GraduationRulesWriter(IFormMapsDatabaseSessionFactory databaseSessionFactory) : IGraduationRulesWriter
{
    // `prisma.academicYear.create({ name:"2025-2026", startDate:new Date("2025-08-01"), endDate:new
    // Date("2026-06-15"), isCurrent:true })` — a hard-coded default year, minted by a RULES post when the school
    // has no current year. Kept verbatim, hard-coded dates and all.
    private static readonly DateTime DefaultYearStart = new(2025, 8, 1, 0, 0, 0, DateTimeKind.Unspecified);
    private static readonly DateTime DefaultYearEnd = new(2026, 6, 15, 0, 0, 0, DateTimeKind.Unspecified);
    private const string DefaultYearName = "2025-2026";

    public async Task<string> CreateRulesAsync(
        RequestContext context, string schoolId, CreateGraduationRulesInput input, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        var now = Now();
        var academicYearId = input.AcademicYearId;
        if (string.IsNullOrEmpty(academicYearId))
        {
            academicYearId = await GraduationRulesReader.CurrentAcademicYearIdAsync(session, schoolId, cancellationToken);
        }

        if (string.IsNullOrEmpty(academicYearId))
        {
            academicYearId = Guid.NewGuid().ToString();
            await using var create = Command(session, """
                INSERT INTO "academic_years" ("id", "schoolId", "name", "startDate", "endDate", "isCurrent",
                                              "createdDate", "updatedAt")
                VALUES (@id, @school, @name, @start, @end, true, @now, @now)
                """);
            AddParameter(create, "id", academicYearId);
            AddParameter(create, "school", schoolId);
            AddParameter(create, "name", DefaultYearName);
            AddTimestamp(create, "start", DefaultYearStart);
            AddTimestamp(create, "end", DefaultYearEnd);
            AddTimestamp(create, "now", now);
            await create.ExecuteNonQueryAsync(cancellationToken);
        }

        var ruleSetId = Guid.NewGuid().ToString();
        await using (var create = Command(session, """
            INSERT INTO "graduation_rule_sets"
                ("id", "schoolId", "academicYearId", "totalCreditsRequired", "createdDate", "updatedAt")
            VALUES (@id, @school, @year, @credits::numeric, @now, @now)
            """))
        {
            AddParameter(create, "id", ruleSetId);
            AddParameter(create, "school", schoolId);
            AddParameter(create, "year", academicYearId);
            AddParameter(create, "credits", input.TotalCreditsRequired);
            AddTimestamp(create, "now", now);
            await create.ExecuteNonQueryAsync(cancellationToken);
        }

        await InsertCategoriesAsync(session, ruleSetId, input.CategoryRequirements, now, cancellationToken);
        await InsertSpecialsAsync(session, ruleSetId, input.SpecialRequirements, now, cancellationToken);

        await session.CommitAsync(cancellationToken);
        return ruleSetId;
    }

    public async Task<bool> UpdateRulesAsync(
        RequestContext context, string schoolId, string actorId, string ruleSetId, UpdateGraduationRulesInput input,
        CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        // findUnique(id) then `!ruleSet || ruleSet.schoolId !== schoolId` -> null -> 404. BEFORE any write: a
        // foreign id must not be able to delete another school's requirements.
        await using (var check = Command(session, """
            SELECT "schoolId" FROM "graduation_rule_sets" WHERE "id" = @id
            """))
        {
            AddParameter(check, "id", ruleSetId);
            await using var reader = await check.ExecuteReaderAsync(cancellationToken);
            if (!await reader.ReadAsync(cancellationToken))
            {
                return false;
            }

            var owner = reader.IsDBNull(0) ? null : reader.GetString(0);
            if (!string.Equals(owner, schoolId, StringComparison.Ordinal))
            {
                return false;
            }
        }

        var now = Now();

        // `totalCreditsRequired: body.totalCreditsRequired ?? ruleSet.totalCreditsRequired` — an absent value
        // rewrites the existing one, so the UPDATE always runs and always bumps updatedAt/updatedBy.
        await using (var update = Command(session, """
            UPDATE "graduation_rule_sets"
            SET "totalCreditsRequired" = COALESCE(@credits::numeric, "totalCreditsRequired"),
                "updatedBy" = @actor,
                "updatedAt" = @now
            WHERE "id" = @id
            """))
        {
            AddParameter(update, "credits", input.TotalCreditsRequired);
            AddParameter(update, "actor", actorId);
            AddTimestamp(update, "now", now);
            AddParameter(update, "id", ruleSetId);
            await update.ExecuteNonQueryAsync(cancellationToken);
        }

        // A NULL list means the key was absent / not an array: leave the rows alone. An EMPTY list means delete
        // them and create nothing. `...(catData ? [deleteMany] : [])` in legacy is exactly this distinction.
        if (input.CategoryRequirements is not null)
        {
            await DeleteChildrenAsync(session, "category_requirements", ruleSetId, cancellationToken);
            await InsertCategoriesAsync(session, ruleSetId, input.CategoryRequirements, now, cancellationToken);
        }

        if (input.SpecialRequirements is not null)
        {
            await DeleteChildrenAsync(session, "special_requirements", ruleSetId, cancellationToken);
            await InsertSpecialsAsync(session, ruleSetId, input.SpecialRequirements, now, cancellationToken);
        }

        await session.CommitAsync(cancellationToken);
        return true;
    }

    // ---------------------------------------------------------------- children

    private static async Task InsertCategoriesAsync(
        FormMapsDatabaseSession session, string ruleSetId, IReadOnlyList<CategoryRequirementInput> rows,
        DateTime now, CancellationToken cancellationToken)
    {
        for (var index = 0; index < rows.Count; index++)
        {
            var row = rows[index];
            await using var insert = Command(session, """
                INSERT INTO "category_requirements"
                    ("id", "ruleSetId", "category", "minCredits", "requiredCourses", "electivesAllowed",
                     "sortOrder", "createdDate", "updatedAt")
                VALUES (@id, @rs, @category, @minCredits::numeric, @required, @electives, @sort, @now, @now)
                """);
            AddParameter(insert, "id", Guid.NewGuid().ToString());
            AddParameter(insert, "rs", ruleSetId);
            AddParameter(insert, "category", row.Category);
            AddParameter(insert, "minCredits", row.MinCredits);
            AddParameter(insert, "required", row.RequiredCourses.ToArray());
            AddParameter(insert, "electives", row.ElectivesAllowed);
            AddParameter(insert, "sort", index);
            AddTimestamp(insert, "now", now);
            await insert.ExecuteNonQueryAsync(cancellationToken);
        }
    }

    private static async Task InsertSpecialsAsync(
        FormMapsDatabaseSession session, string ruleSetId, IReadOnlyList<SpecialRequirementInput> rows,
        DateTime now, CancellationToken cancellationToken)
    {
        foreach (var row in rows)
        {
            await using var insert = Command(session, """
                INSERT INTO "special_requirements"
                    ("id", "ruleSetId", "name", "type", "value", "unit", "description", "createdDate", "updatedAt")
                VALUES (@id, @rs, @name, @type, @value::numeric, @unit, @description, @now, @now)
                """);
            AddParameter(insert, "id", Guid.NewGuid().ToString());
            AddParameter(insert, "rs", ruleSetId);
            AddParameter(insert, "name", row.Name);
            AddParameter(insert, "type", row.Type);
            AddParameter(insert, "value", row.Value);
            AddParameter(insert, "unit", row.Unit);
            AddParameter(insert, "description", row.Description);
            AddTimestamp(insert, "now", now);
            await insert.ExecuteNonQueryAsync(cancellationToken);
        }
    }

    private static async Task DeleteChildrenAsync(
        FormMapsDatabaseSession session, string table, string ruleSetId, CancellationToken cancellationToken)
    {
        // `table` is a compile-time literal from this file only — never request data.
        await using var delete = Command(session, $"""DELETE FROM "{table}" WHERE "ruleSetId" = @rs""");
        AddParameter(delete, "rs", ruleSetId);
        await delete.ExecuteNonQueryAsync(cancellationToken);
    }

    // ---------------------------------------------------------------- helpers

    private static DateTime Now()
    {
        var utc = DateTime.UtcNow;
        return DateTime.SpecifyKind(
            new DateTime(utc.Ticks - (utc.Ticks % TimeSpan.TicksPerMillisecond), DateTimeKind.Unspecified),
            DateTimeKind.Unspecified);
    }

    private static void AddTimestamp(DbCommand command, string name, DateTime value)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = name;
        parameter.DbType = DbType.DateTime2;
        parameter.Value = value;
        command.Parameters.Add(parameter);
    }

    private static DbCommand Command(FormMapsDatabaseSession session, string sql) =>
        TranscriptDataQuery.Command(session, sql);

    private static void AddParameter(DbCommand command, string name, object? value) =>
        TranscriptDataQuery.AddParameter(command, name, value);
}
